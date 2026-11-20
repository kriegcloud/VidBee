/** HTML5 source dimensions are consumed by the packaged yt-dlp parser.
 * This applies only to the browser selector's disposable fixture, preserving
 * all existing phase-8 API goldens and their unlabeled source.
 */
export function extensionBrowserFixture(template) {
  if (!template.includes('<source src=')) {
    throw new Error('Browser fixture source is missing')
  }
  return template.replace('<source src=', '<source width="320" height="180" label="180p" src=')
}
