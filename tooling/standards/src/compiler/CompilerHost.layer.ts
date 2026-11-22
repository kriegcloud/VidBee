import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import { SyntaxKind } from "typescript/unstable/ast";
import { API, SymbolFlags } from "typescript/unstable/sync";
import { InfrastructureFailure } from "../Standards.errors.js";
import { CompilerDiagnostic, DeclarationView, NodeView, SemanticView } from "../Standards.model.js";
import { CompilerHost } from "./CompilerHost.service.js";
import type { Node } from "typescript/unstable/ast";
import type { Symbol as CompilerSymbol, NodeHandle } from "typescript/unstable/sync";
import type { SemanticQuery } from "../Standards.model.js";

const failure = (cause: unknown) =>
  InfrastructureFailure.make({ message: "TypeScript snapshot operation failed.", cause });
/**
 * CompilerHostLive supplies the owned CompilerHostLive infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide CompilerHostLive at a Node entrypoint)
 *
 * ```ts
 * import { CompilerHost, CompilerHostLive } from "@vidbee/standards"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * NodeRuntime.runMain(
 *   CompilerHost.use((host) => host.open("tsconfig.json")).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(CompilerHostLive.pipe(Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const CompilerHostLive = Layer.succeed(CompilerHost, {
  open: Effect.fn("CompilerHost.open")(function* (projectPath: string) {
    const api = yield* Effect.acquireRelease(Effect.try({ try: () => new API(), catch: failure }), (owned) =>
      Effect.sync(() => owned.close())
    );
    const snapshot = yield* Effect.acquireRelease(
      Effect.try({ try: () => api.updateSnapshot({ openProjects: [projectPath] }), catch: failure }),
      (owned) => Effect.sync(() => owned.dispose())
    );
    const project = snapshot.getProject(projectPath);
    if (project === undefined) return yield* failure("Missing compiler project.");
    const assertLive = () => {
      if (snapshot.isDisposed()) throw failure("Snapshot is closed.");
    };

    const declarations = (handles: ReadonlyArray<NodeHandle>) =>
      A.flatMap(handles, (handle) => {
        const node = handle.resolve(project);
        return node === undefined
          ? []
          : [
              DeclarationView.make({
                file: node.getSourceFile().fileName,
                start: node.getStart(),
                end: node.end,
                text: node.getText(),
              }),
            ];
      });
    const view = (symbol: CompilerSymbol, node: Node): SemanticView => {
      const resolved = (symbol.flags & SymbolFlags.Alias) !== 0 ? project.checker.getAliasedSymbol(symbol) : symbol;
      const type =
        (resolved.flags & (SymbolFlags.TypeAlias | SymbolFlags.Interface)) !== 0
          ? project.checker.getDeclaredTypeOfSymbol(resolved)
          : project.checker.getTypeOfSymbolAtLocation(resolved, node);
      const signature =
        node.kind === SyntaxKind.CallExpression ? project.checker.getResolvedSignature(node) : undefined;
      return SemanticView.make({
        name: symbol.name,
        resolvedName: project.checker.isUnknownSymbol(resolved) ? O.none() : O.some(resolved.name),
        type: type.isErrorType() ? O.none() : O.some(project.checker.typeToString(type)),
        properties: A.map(
          type.isUnionType() || type.isIntersectionType()
            ? A.flatMap(type.getTypes(), (part) => project.checker.getPropertiesOfType(part))
            : project.checker.getPropertiesOfType(type),
          (property) => property.name
        ),
        declarations: declarations(resolved.declarations),
        callDeclaration: O.fromNullishOr(signature?.declaration).pipe(
          O.flatMap((handle) => A.head(declarations([handle])))
        ),
        parameters: signature === undefined ? [] : A.map(signature.getParameters(), (parameter) => parameter.name),
      });
    };
    return {
      exports: Effect.fn("CompilerHost.exports")(function* (file: string) {
        return yield* Effect.try({
          try: () => {
            assertLive();
            const source = project.program.getSourceFile(file);
            if (source === undefined) throw failure("Export source is absent from project.");
            const symbol = project.checker.getSymbolAtLocation(source);
            if (symbol === undefined) throw failure("Source has no module symbol.");
            return A.map(project.checker.getExportsOfModule(symbol), (entry) => view(entry, source));
          },
          catch: failure,
        });
      }),
      resolve: Effect.fn("CompilerHost.resolve")(function* (query: SemanticQuery) {
        return yield* Effect.try({
          try: () => {
            assertLive();
            const source = project.program.getSourceFile(query.file);
            if (source === undefined || query.offset > source.end)
              throw failure("Semantic query is outside the source.");
            let selected: Node = source;
            const visit = (node: Node): void => {
              if (node.getStart(source) <= query.offset && node.end >= query.offset) {
                selected = node;
                node.forEachChild(visit);
              }
            };
            visit(source);
            const symbol = project.checker.getSymbolAtLocation(selected);
            if (symbol === undefined) {
              const type = project.checker.getTypeAtLocation(selected);
              const signature =
                selected.kind === SyntaxKind.CallExpression
                  ? project.checker.getResolvedSignature(selected)
                  : undefined;
              return SemanticView.make({
                name: selected.getText(source),
                resolvedName: O.none(),
                type: type === undefined ? O.none() : O.some(project.checker.typeToString(type)),
                properties: [],
                declarations: [],
                callDeclaration: O.fromNullishOr(signature?.declaration).pipe(
                  O.flatMap((handle) => A.head(declarations([handle])))
                ),
                parameters:
                  signature === undefined ? [] : A.map(signature.getParameters(), (parameter) => parameter.name),
              });
            }
            return view(symbol, selected);
          },
          catch: failure,
        });
      }),
      files: project.program.getSourceFileNames(),
      diagnostics: Effect.try({
        try: () => {
          assertLive();
          return A.map(
            [
              ...project.program.getConfigFileParsingDiagnostics(),
              ...project.program.getGlobalDiagnostics(),
              ...project.program.getSyntacticDiagnostics(),
              ...project.program.getSemanticDiagnostics(),
            ],
            (diagnostic) =>
              CompilerDiagnostic.make({
                file: diagnostic.fileName ?? "",
                start: diagnostic.pos ?? 0,
                length: (diagnostic.end ?? 0) - (diagnostic.pos ?? 0),
                code: diagnostic.code,
                message: diagnostic.text,
              })
          );
        },
        catch: failure,
      }),
      inspect: Effect.fn("CompilerHost.inspect")(function* (file: string) {
        return yield* Effect.try({
          try: () => {
            assertLive();
            const source = project.program.getSourceFile(file);
            if (source === undefined) throw failure("File is absent from compiler execution.");
            let result: ReadonlyArray<NodeView> = [];
            const visit = (node: Node): void => {
              const type = project.checker.getTypeAtLocation(node);
              const properties =
                type === undefined
                  ? []
                  : type.isUnionType() || type.isIntersectionType()
                    ? A.flatMap(type.getTypes(), (part) => project.checker.getPropertiesOfType(part))
                    : project.checker.getPropertiesOfType(type);
              const symbol = project.checker.getSymbolAtLocation(node);
              result = A.append(
                result,
                NodeView.make({
                  file,
                  kind: SyntaxKind[node.kind],
                  start: node.pos < 0 ? 0 : node.pos,
                  end: node.end,
                  text: node.getText(source),
                  type: type === undefined ? "<unresolved>" : project.checker.typeToString(type),
                  properties: A.map(properties, (property) => property.name),
                  symbol: O.fromNullishOr(symbol?.name),
                })
              );
              node.forEachChild(visit);
            };
            visit(source);
            return result;
          },
          catch: failure,
        });
      }),
    };
  }),
});
