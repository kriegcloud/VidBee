// source.config.ts
import { defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumapress/adapters/mdx/schema";
var docs = defineDocs({
  dir: "content",
  docs: {
    async: true,
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true
    }
  },
  meta: {
    schema: metaSchema
  }
});
export {
  docs
};
