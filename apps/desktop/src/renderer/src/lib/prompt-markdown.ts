/**
 * Join a numbered marker that sits on its own line onto the following
 * content, e.g. `2.\n**Question?**` → `2. **Question?**`.
 *
 * Models often emit that split, and Markdown then renders an empty list
 * item so the number and the question appear on separate lines.
 *
 * @param markdown Raw prompt result.
 * @returns Markdown with orphaned ordered-list markers pulled onto the next line.
 */
export const normalizePromptMarkdown = (markdown: string): string =>
  markdown.replace(/^(\d+)\.[ \t]*\r?\n+(?=\S)(?!\d+\.[ \t]|#{1,6} |[-*+] )/gm, '$1. ')
