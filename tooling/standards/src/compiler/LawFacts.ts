import * as A from "effect/Array";
import { dual } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Str from "effect/String";
import * as Ast from "typescript/unstable/ast";
import { SymbolFlags, TypeFlags } from "typescript/unstable/sync";
import { ArgumentFact, LawFact } from "../Law.model.js";
import { SourcePosition, SourceRange } from "../Standards.model.js";
import type { Symbol as CompilerSymbol, Project, Type } from "typescript/unstable/sync";

/** Extract semantic facts while the owning project is live.
 * @category utilities
 * @since 0.0.0
 */
export const collectLawFacts: {
  (project: Project, source: Ast.SourceFile): ReadonlyArray<LawFact>;
  (source: Ast.SourceFile): (project: Project) => ReadonlyArray<LawFact>;
} = dual(2, (project: Project, source: Ast.SourceFile): ReadonlyArray<LawFact> => {
  const checker = project.checker;
  const isLiteral = (node: Ast.Node): node is Ast.StringLiteral | Ast.NoSubstitutionTemplateLiteral =>
    Ast.isStringLiteral(node) || Ast.isNoSubstitutionTemplateLiteral(node);
  const rangeAt = (start: number, end: number) => {
    const first = source.getLineAndCharacterOfPosition(start);
    const last = source.getLineAndCharacterOfPosition(end);
    return SourceRange.make({
      start: SourcePosition.make({ offset: start, line: first.line + 1, column: first.character + 1 }),
      end: SourcePosition.make({ offset: end, line: last.line + 1, column: last.character + 1 }),
    });
  };
  const range = (node: Ast.Node) => rangeAt(node.getStart(source), node.end);
  const resolve = (node: Ast.Node, seen = HashSet.empty<string>()): CompilerSymbol | undefined => {
    if (Ast.isParenthesizedExpression(node)) return resolve(node.expression, seen);
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol === undefined && Ast.isElementAccessExpression(node) && Ast.isStringLiteral(node.argumentExpression)) {
      const type = checker.getTypeAtLocation(node.expression);
      if (type !== undefined) symbol = checker.getPropertyOfType(type, node.argumentExpression.text);
    }
    if (symbol === undefined) return undefined;
    if ((symbol.flags & SymbolFlags.Alias) !== 0) symbol = checker.getAliasedSymbol(symbol);
    if (checker.isUnknownSymbol(symbol)) return undefined;
    const key = `${symbol.name}:${A.map(symbol.declarations, (handle) => handle.resolve(project)?.getStart() ?? -1)}`;
    if (HashSet.has(seen, key)) return symbol;
    const next = HashSet.add(seen, key);
    for (const handle of symbol.declarations) {
      const declaration = handle.resolve(project);
      if (declaration !== undefined && Ast.isVariableDeclaration(declaration) && declaration.initializer !== undefined)
        return resolve(declaration.initializer, next) ?? symbol;
      if (declaration !== undefined && Ast.isBindingElement(declaration)) {
        const parent = declaration.parent?.parent;
        if (parent !== undefined && Ast.isVariableDeclaration(parent) && parent.initializer !== undefined) {
          const type = checker.getTypeAtLocation(parent.initializer);
          const name = declaration.propertyName ?? declaration.name;
          if (type !== undefined && name !== undefined && Ast.isIdentifier(name)) {
            const property = checker.getPropertyOfType(type, name.text);
            if (property !== undefined) return property;
          }
        }
      }
    }
    return symbol;
  };
  const declarationNodes = (symbol: CompilerSymbol | undefined) =>
    symbol === undefined
      ? []
      : A.flatMap(symbol.declarations, (handle) => {
          const node = handle.resolve(project);
          return node === undefined ? [] : [node];
        });
  const paths = (symbol: CompilerSymbol | undefined) =>
    A.map(declarationNodes(symbol), (node) => node.getSourceFile().fileName);
  const typeText = (node: Ast.Node) => {
    const type = checker.getTypeAtLocation(node);
    return type === undefined ? "<unresolved>" : checker.typeToString(type);
  };
  const hasNumber = (type: Type | undefined): boolean =>
    type !== undefined &&
    ((type.flags & (TypeFlags.Number | TypeFlags.NumberLiteral)) !== 0 ||
      ((type.isUnionType() || type.isIntersectionType()) && A.some(type.getTypes(), hasNumber)));
  const duration = (type: Type | undefined, seen = HashSet.empty<number>()): boolean => {
    if (type === undefined || HashSet.has(seen, type.id)) return false;
    const next = HashSet.add(seen, type.id);
    const symbol = type.getAliasSymbol() ?? type.getSymbol();
    if (
      symbol !== undefined &&
      symbol.name === "Input" &&
      A.some(paths(symbol), (file) => /\/effect\/(?:dist\/.*\/|src\/)?Duration\./.test(file))
    )
      return true;
    if ((type.isUnionType() || type.isIntersectionType()) && A.some(type.getTypes(), (part) => duration(part, next)))
      return true;
    return A.some(type.getAliasTypeArguments(), (part) => duration(part, next));
  };
  const argumentsFor = (node: Ast.CallExpression | Ast.NewExpression) => {
    const signature = checker.getResolvedSignature(node);
    const target = signature?.getTarget() ?? signature;
    const effectOwned = signature?.declaration?.resolve(project)?.getSourceFile().fileName;
    if (effectOwned === undefined || !/\/effect\//.test(effectOwned)) return [];
    return A.flatMap(node.arguments ?? [], (argument, index) => {
      const parameter = signature === undefined ? undefined : checker.getParameterType(signature, index);
      const original = target === undefined ? undefined : checker.getParameterType(target, index);
      const symbol = target?.getParameters()[index];
      const declarations = A.map(declarationNodes(symbol), (declaration) => declaration.getText());
      // The declaration annotation survives overload instantiation even when Input has reduced to a union.
      const isDuration =
        effectOwned !== undefined &&
        /\/effect\//.test(effectOwned) &&
        (duration(original) || A.some(declarations, (text) => /\bDuration\.Input\b/.test(text)));
      const direct = ArgumentFact.make({
        text: argument.getText(source),
        type: typeText(argument),
        parameter: parameter === undefined ? "<unresolved>" : checker.typeToString(parameter),
        parameterDeclarations: declarations,
        numeric: hasNumber(checker.getTypeAtLocation(argument)),
        duration: isDuration,
        range: range(argument),
      });
      const objectValue = (
        value: Ast.Node,
        seen = HashSet.empty<string>()
      ): Ast.ObjectLiteralExpression | undefined => {
        if (Ast.isObjectLiteralExpression(value)) return value;
        if (Ast.isParenthesizedExpression(value)) return objectValue(value.expression, seen);
        if (!Ast.isIdentifier(value) || HashSet.has(seen, value.text)) return undefined;
        const symbol = checker.getSymbolAtLocation(value);
        for (const declaration of declarationNodes(symbol))
          if (Ast.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
            const object = objectValue(declaration.initializer, HashSet.add(seen, value.text));
            if (object !== undefined) return object;
          }
        return undefined;
      };
      const nested = (
        accepted: Type | undefined,
        supplied: Type | undefined,
        owner: Ast.Node,
        seen = HashSet.empty<string>()
      ): ReadonlyArray<ArgumentFact> => {
        if (
          accepted === undefined ||
          supplied === undefined ||
          effectOwned === undefined ||
          !/\/effect\//.test(effectOwned)
        )
          return [];
        const object = objectValue(owner);
        if (object === undefined) return [];
        const key = `${accepted.id}:${supplied.id}`;
        if (HashSet.has(seen, key)) return [];
        const next = HashSet.add(seen, key);
        if (accepted.isUnionType() || accepted.isIntersectionType())
          return A.flatMap(accepted.getTypes(), (part) => nested(part, supplied, owner, next));
        if (HashSet.size(next) > 12) return [];
        return A.flatMap(checker.getPropertiesOfType(accepted), (property) => {
          const actual = checker.getPropertyOfType(supplied, property.name);
          if (actual === undefined) return [];
          const declarations = A.map(declarationNodes(property), (declaration) => declaration.getText());
          const expected = checker.getTypeOfSymbolAtLocation(property, owner);
          const value = checker.getTypeOfSymbolAtLocation(actual, owner);
          const initializer = A.findFirst(
            object.properties,
            (entry) =>
              Ast.isPropertyAssignment(entry) &&
              entry.name !== undefined &&
              (Ast.isIdentifier(entry.name) || Ast.isStringLiteral(entry.name)) &&
              entry.name.text === property.name
          );
          if (initializer._tag === "None" || !Ast.isPropertyAssignment(initializer.value)) return [];
          const located = initializer.value.initializer;
          if (duration(expected) || A.some(declarations, (text) => /\bDuration\.Input\b/.test(text)))
            return [
              ArgumentFact.make({
                text: located.getText(source),
                type: checker.typeToString(value),
                parameter: checker.typeToString(expected),
                parameterDeclarations: declarations,
                numeric: hasNumber(value),
                duration: true,
                range: range(located),
              }),
            ];
          // Primitive and callable properties cannot contain nested duration options.
          if (!expected.isObjectType() && !expected.isUnionType() && !expected.isIntersectionType()) return [];
          return nested(expected, value, located, next);
        });
      };
      return [direct, ...nested(original, checker.getTypeAtLocation(argument), argument)];
    });
  };
  let result: ReadonlyArray<LawFact> = [];
  let comments = HashSet.empty<number>();
  const comment = (start: number, end: number): void => {
    if (HashSet.has(comments, start)) return;
    comments = HashSet.add(comments, start);
    const text = Str.slice(start, end)(source.text);
    result = A.append(
      result,
      LawFact.make({
        kind: Str.startsWith("/**")(text) ? "JSDoc" : "Comment",
        owner: "module",
        text,
        range: rangeAt(start, end),
        parentKind: "",
        parentText: "",
        operation: "",
        origins: [],
        type: "",
        module: "",
        binding: "",
        traits: [],
        arguments: [],
      })
    );
  };
  const visit = (node: Ast.Node): void => {
    const kind = Ast.SyntaxKind[node.kind];
    Ast.forEachLeadingCommentRange(source.text, node.pos, comment);
    Ast.forEachTrailingCommentRange(source.text, node.end, comment);
    let operation = "";
    let origins: ReadonlyArray<string> = [];
    let module = "";
    let binding = "";
    let traits: ReadonlyArray<string> = [];
    let arguments_: ReadonlyArray<ArgumentFact> = [];
    const parent = node.parent;
    if (Ast.isCallExpression(node) || Ast.isNewExpression(node)) {
      const symbol = resolve(node.expression);
      operation = symbol?.name ?? "";
      origins = paths(symbol);
      arguments_ = argumentsFor(node);
      if (symbol === undefined) traits = A.append(traits, "unresolved-call");
      if (Ast.isCallExpression(node) && node.expression.kind === Ast.SyntaxKind.ImportKeyword) {
        traits = A.append(traits, "module-reference");
        const argument = node.arguments[0];
        if (argument !== undefined && isLiteral(argument)) module = argument.text;
      }
      if (operation === "require" && A.some(origins, (file) => /\/@types\/node\//.test(file))) {
        traits = A.append(traits, "module-reference");
        const argument = node.arguments?.[0];
        if (argument !== undefined && isLiteral(argument)) module = argument.text;
      }
    }
    if (Ast.isImportDeclaration(node) || Ast.isExportDeclaration(node)) {
      if (
        (Ast.isImportDeclaration(node) && node.importClause?.phaseModifier === Ast.SyntaxKind.TypeKeyword) ||
        (Ast.isExportDeclaration(node) && node.isTypeOnly)
      )
        traits = A.append(traits, "type-only-module");
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined && isLiteral(specifier)) {
        module = specifier.text;
        traits = A.append(traits, "module-reference");
      }
      if (
        Ast.isImportDeclaration(node) &&
        node.importClause?.namedBindings !== undefined &&
        Ast.isNamespaceImport(node.importClause.namedBindings)
      )
        binding = node.importClause.namedBindings.name.text;
      if (Ast.isExportDeclaration(node) && node.exportClause !== undefined && Ast.isNamespaceExport(node.exportClause))
        binding = node.exportClause.name.text;
    }
    if (Ast.isExternalModuleReference(node)) {
      traits = A.append(traits, "module-reference");
      if (isLiteral(node.expression)) module = node.expression.text;
    }
    if (Ast.isPropertyAccessExpression(node) || Ast.isElementAccessExpression(node) || Ast.isIdentifier(node)) {
      const symbol = resolve(node);
      operation = symbol?.name ?? "";
      origins = paths(symbol);
      if (
        (Ast.isPropertyAccessExpression(node) && A.contains(["sort", "toSorted"], node.name.text)) ||
        (Ast.isElementAccessExpression(node) &&
          isLiteral(node.argumentExpression) &&
          A.contains(["sort", "toSorted"], node.argumentExpression.text))
      ) {
        const receiver = checker.getTypeAtLocation(node.expression);
        if (receiver === undefined || receiver.isErrorType() || (receiver.flags & TypeFlags.Any) !== 0)
          traits = A.append(traits, "unknown-receiver");
      }
    }
    if (Ast.isTypeOfExpression(node)) {
      origins = paths(resolve(node.expression));
      const operand = node.expression;
      if (
        Ast.isIdentifier(operand) &&
        A.contains(["window", "document", "navigator", "storage", "localStorage", "sessionStorage"], operand.text)
      ) {
        const ambient = origins.length === 0 || A.every(origins, (file) => /\.d\.[cm]?ts$/.test(file));
        if (
          ambient &&
          Ast.isBinaryExpression(parent) &&
          A.contains(
            [
              Ast.SyntaxKind.EqualsEqualsEqualsToken,
              Ast.SyntaxKind.ExclamationEqualsEqualsToken,
              Ast.SyntaxKind.EqualsEqualsToken,
              Ast.SyntaxKind.ExclamationEqualsToken,
            ],
            parent.operatorToken.kind
          ) &&
          ((isLiteral(parent.right) && parent.right.text === "undefined") ||
            (isLiteral(parent.left) && parent.left.text === "undefined"))
        )
          traits = A.append(traits, "availability-guard");
      }
    }
    if (
      Ast.isAsExpression(node) &&
      node.type.kind === Ast.SyntaxKind.TypeReference &&
      node.type.getText(source) === "const"
    )
      traits = A.append(traits, "const-assertion");
    if (Ast.isThrowStatement(node)) {
      const type = checker.getTypeAtLocation(node.expression);
      const tagged = (value: Type | undefined, seen = HashSet.empty<number>()): boolean => {
        if (value === undefined || HashSet.has(seen, value.id)) return false;
        const next = HashSet.add(seen, value.id);
        const symbol = value.getSymbol();
        const declarations = declarationNodes(symbol);
        const direct = A.some(declarations, (declaration) => {
          if (!Ast.isClassDeclaration(declaration)) return false;
          let found = false;
          const inspect = (child: Ast.Node): void => {
            if (Ast.isCallExpression(child)) {
              const called = resolve(child.expression);
              if (
                called?.name === "TaggedError" &&
                A.some(paths(called), (file) => /\/effect\/(?:dist\/|src\/)Schema\./.test(file))
              )
                found = true;
            }
            child.forEachChild(inspect);
          };
          for (const clause of declaration.heritageClauses ?? []) clause.forEachChild(inspect);
          return found;
        });
        return direct || A.some(value.getBaseTypes() ?? [], (base) => tagged(base, next));
      };
      if (tagged(type)) traits = A.append(traits, "schema-error");
      if (type === undefined || type.isErrorType() || (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0)
        traits = A.append(traits, "unresolved-throw");
    }
    if (
      Ast.isVariableDeclaration(node) ||
      Ast.isTypeAliasDeclaration(node) ||
      Ast.isInterfaceDeclaration(node) ||
      Ast.isClassDeclaration(node) ||
      Ast.isFunctionDeclaration(node)
    ) {
      binding = node.name?.getText(source) ?? "";
      let statement: Ast.Node = node;
      if (Ast.isVariableDeclaration(node)) statement = node.parent.parent;
      let exported = false;
      statement.forEachChild((child) => {
        if (child.kind === Ast.SyntaxKind.ExportKeyword) exported = true;
      });
      if (exported) traits = A.append(traits, "exported");
      if (exported) {
        let documented = false;
        Ast.forEachLeadingCommentRange(source.text, statement.pos, (start, end) => {
          if (Str.startsWith("/**")(Str.slice(start, end)(source.text))) documented = true;
        });
        if (!documented) traits = A.append(traits, "undocumented-export");
      }
      const type = checker.getTypeAtLocation(node.name ?? node);
      if (type !== undefined) {
        const properties = checker.getPropertiesOfType(type);
        if (
          A.some(properties, (property) => property.name === "ast") &&
          A.some(properties, (property) => property.name === "Type")
        )
          traits = A.append(traits, "schema-value");
        if (type.isConditionalType() || type.isTypeParameter()) traits = A.append(traits, "unresolved-data-shape");
        if (
          (Ast.isInterfaceDeclaration(node) || Ast.isTypeAliasDeclaration(node)) &&
          properties.length > 0 &&
          !A.some(properties, (property) =>
            A.some(
              declarationNodes(property),
              (declaration) =>
                declaration.kind === Ast.SyntaxKind.MethodSignature || Ast.isCallSignatureDeclaration(declaration)
            )
          )
        )
          traits = A.append(traits, "data-shape");
      }
    }
    if (Ast.isVariableDeclaration(node) || Ast.isClassDeclaration(node)) {
      const schema = A.contains(traits, "schema-value") && Ast.isVariableDeclaration(node);
      let annotation = false;
      let literals = false;
      let schemaClass = "";
      let branded = false;
      const scan = (child: Ast.Node): void => {
        if (
          Ast.isTypeOperatorNode(child) &&
          child.operator === Ast.SyntaxKind.UniqueKeyword &&
          child.type.kind === Ast.SyntaxKind.SymbolKeyword
        )
          branded = true;
        if (Ast.isIdentifier(child)) {
          const annotationValue = (value: Ast.Node, seen = HashSet.empty<string>()): boolean => {
            const called = resolve(Ast.isCallExpression(value) ? value.expression : value);
            if (called === undefined || HashSet.has(seen, called.name)) return false;
            if (
              A.some(paths(called), (file) => /\/identity\/src\//.test(file)) &&
              A.contains(["annoteSchema", "annoteClass", "annoteError"], called.name)
            )
              return true;
            return A.some(
              declarationNodes(called),
              (declaration) =>
                Ast.isVariableDeclaration(declaration) &&
                declaration.initializer !== undefined &&
                annotationValue(declaration.initializer, HashSet.add(seen, called.name))
            );
          };
          if (annotationValue(child)) annotation = true;
        }
        if (Ast.isCallExpression(child)) {
          const called = resolve(child.expression);
          const sources = paths(called);
          if (
            called !== undefined &&
            A.some(sources, (file) => /\/identity\/src\//.test(file)) &&
            A.contains(["annoteSchema", "annoteClass", "annoteError"], called.name)
          )
            annotation = true;
          if (called !== undefined && A.some(sources, (file) => /\/effect\/(?:dist\/|src\/)Schema\./.test(file))) {
            if (A.contains(["Class", "TaggedClass", "TaggedError", "Opaque"], called.name)) schemaClass = called.name;
            if (called.name === "Literals") literals = true;
          }
        }
        child.forEachChild(scan);
      };
      if (schema || Ast.isClassDeclaration(node)) scan(node);
      if (annotation) traits = A.append(traits, "canonical-annotation");
      if (literals && Ast.isVariableDeclaration(node) && node.initializer !== undefined) {
        const directLiteral = (expression: Ast.Node): boolean => {
          if (!Ast.isCallExpression(expression)) return false;
          if (resolve(expression.expression)?.name === "Literals") return true;
          if (Ast.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === "pipe")
            return directLiteral(expression.expression.expression);
          return false;
        };
        if (directLiteral(node.initializer)) traits = A.append(traits, "literal-domain");
      }
      if (schemaClass !== "") {
        traits = A.append(traits, "schema-class");
        if (!branded) traits = A.append(traits, "missing-brand");
        if (Ast.isClassDeclaration(node))
          for (const member of node.members) {
            let isStatic = false;
            member.forEachChild((child) => {
              if (child.kind === Ast.SyntaxKind.StaticKeyword) isStatic = true;
            });
            if (isStatic) continue;
            if (schemaClass === "Opaque") traits = A.append(traits, "opaque-instance-member");
            if (
              Ast.isPropertyDeclaration(member) &&
              member.initializer !== undefined &&
              Ast.isArrowFunction(member.initializer)
            )
              traits = A.append(traits, "model-arrow-field");
          }
      }
      if (schema && Ast.isVariableDeclaration(node)) {
        const symbol = node.name === undefined ? undefined : checker.getSymbolAtLocation(node.name);
        if (symbol !== undefined && (symbol.flags & SymbolFlags.TypeAlias) !== 0)
          traits = A.append(traits, "schema-companion");
      }
    }
    if (Ast.isFunctionDeclaration(node) || Ast.isArrowFunction(node) || Ast.isFunctionExpression(node)) {
      const parameters = node.parameters;
      const body = node.body;
      const topLevel =
        parent !== undefined &&
        (parent.kind === Ast.SyntaxKind.SourceFile ||
          (Ast.isVariableDeclaration(parent) && parent.parent?.parent?.parent?.kind === Ast.SyntaxKind.SourceFile));
      if (topLevel && parameters.length > 0 && body !== undefined) {
        const returned = Ast.isBlock(body)
          ? A.flatMap(body.statements, (statement) =>
              Ast.isReturnStatement(statement) && statement.expression !== undefined ? [statement.expression] : []
            )
          : [body];
        const startsGenerator = (expression: Ast.Node): boolean => {
          if (Ast.isParenthesizedExpression(expression)) return startsGenerator(expression.expression);
          if (!Ast.isCallExpression(expression)) return false;
          const called = resolve(expression.expression);
          if (
            called?.name === "gen" &&
            A.some(paths(called), (file) => /\/effect\/(?:dist\/|src\/)Effect\./.test(file))
          )
            return true;
          if (Ast.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === "pipe")
            return startsGenerator(expression.expression.expression);
          return false;
        };
        if (A.some(returned, startsGenerator)) traits = A.append(traits, "reusable-generator");
        const first = parameters[0];
        if (first !== undefined && Ast.isIdentifier(first.name))
          for (const expression of returned) {
            if (
              Ast.isBinaryExpression(expression) &&
              expression.operatorToken.kind === Ast.SyntaxKind.EqualsEqualsEqualsToken &&
              Ast.isPropertyAccessExpression(expression.left) &&
              expression.left.name.text === "_tag" &&
              Ast.isIdentifier(expression.left.expression) &&
              expression.left.expression.text === first.name.text &&
              isLiteral(expression.right)
            )
              traits = A.append(traits, "manual-tag-guard");
          }
      }
    }
    if (
      Ast.isCallExpression(node) &&
      operation === "fn" &&
      A.some(origins, (file) => /\/effect\/(?:dist\/|src\/)Effect\./.test(file))
    ) {
      const first = node.arguments[0];
      if (first !== undefined && (Ast.isArrowFunction(first) || Ast.isFunctionExpression(first)))
        traits = A.append(traits, "unnamed-span");
    }
    if (Ast.isCallExpression(node)) {
      const effectSource = A.some(origins, (file) => /\/effect\/(?:dist\/|src\/)Effect\./.test(file));
      const schemaSource = A.some(origins, (file) => /\/effect\/(?:dist\/|src\/)Schema\./.test(file));
      if (schemaSource && operation === "Defect") {
        const options = node.arguments[0];
        const stack =
          options !== undefined &&
          Ast.isObjectLiteralExpression(options) &&
          A.some(
            options.properties,
            (property) =>
              Ast.isPropertyAssignment(property) &&
              property.name?.getText(source) === "includeStack" &&
              property.initializer.kind === Ast.SyntaxKind.TrueKeyword
          );
        if (!stack) traits = A.append(traits, "defect-without-stack");
      }
      if (effectSource && (Str.startsWith("run")(operation) || A.contains(["promise", "tryPromise"], operation)))
        traits = A.append(
          traits,
          A.contains(["promise", "tryPromise"], operation) ? "promise-boundary" : "runtime-boundary"
        );
      if (operation === "make" && A.some(origins, (file) => /\/effect\/(?:dist\/|src\/)ManagedRuntime\./.test(file)))
        traits = A.append(traits, "runtime-boundary");
    }
    if (operation !== "") {
      const selected = Ast.isCallExpression(node) || Ast.isNewExpression(node) ? node.expression : node;
      const owner = resolve(selected)?.getParent();
      if (owner !== undefined) traits = A.append(traits, `declaration-owner:${owner.name}`);
    }
    const useful =
      traits.length > 0 ||
      operation !== "" ||
      A.contains(
        [
          "ArrowFunction",
          "FunctionExpression",
          "AnyKeyword",
          "AsExpression",
          "TypeAssertionExpression",
          "NonNullExpression",
          "TypeOfExpression",
          "SwitchStatement",
          "ThrowStatement",
        ],
        kind
      );
    let owner = "module";
    let enclosing = node.parent;
    while (enclosing !== undefined && enclosing.kind !== Ast.SyntaxKind.SourceFile) {
      if (
        (Ast.isVariableDeclaration(enclosing) ||
          Ast.isFunctionDeclaration(enclosing) ||
          Ast.isClassDeclaration(enclosing) ||
          Ast.isMethodDeclaration(enclosing)) &&
        enclosing.name !== undefined
      ) {
        owner = enclosing.name.getText(source);
        break;
      }
      enclosing = enclosing.parent;
    }
    if (useful)
      result = A.append(
        result,
        LawFact.make({
          kind,
          owner,
          text: node.getText(source),
          range: range(node),
          parentKind: parent === undefined ? "" : Ast.SyntaxKind[parent.kind],
          parentText: parent === undefined ? "" : parent.getText(source),
          operation,
          origins: A.map(origins, (file) => Str.replaceAll("\\", "/")(file)),
          type: "",
          module,
          binding,
          traits,
          arguments: arguments_,
        })
      );
    node.forEachChild(visit);
  };
  visit(source);
  return result;
});
