# Profile collection picker

Desktop and web share `ProfileCollectionDialog`. Pasting a supported profile into Add URL opens the picker before any tasks are queued. Instagram retains its full category inspector.

| Platform | Collections |
| --- | --- |
| TikTok | Posts, reposts, stories, likes, saved |
| Facebook | Photos, albums, reels |
| VSCO | Gallery (images and videos) |
| Threads | Media (original posts; excludes replies and reposts) |

The URL resolver accepts profile surfaces only. Individual posts keep their existing routes. A selected Instagram tab no longer forces unrelated URLs through the Instagram inspector.

The picker uses the existing platform executors. TikTok offers a three-post sample per category, clearly labeled as a sample. Full inventories are collected during download, so the picker does not present estimated totals as verified counts. Facebook photos and albums can overlap. Sites can limit feed history or require authentication; a collection option is not a guarantee of access.

The destination applies to every selected collection. If queueing fails partway through, successful categories remain marked and are excluded from a retry in the open dialog. This is not a persistent cross-session archive.

## Instagram category repairs

Profile inspections are serialized, and identical in-flight requests share one result. This prevents repeated dialog submissions from launching overlapping scans. It does not clear an existing site rate limit.

All five profile category extractors preserve the authenticated CSRF cookie during initialization. Highlights retain the REST tray as the primary path and fall back to gallery-dl's web GraphQL tray only for a redirect to Instagram's home page. Login challenges, rate limits, and other errors are not converted to empty results. The inspector already recognizes JSON error records even when gallery-dl exits zero; the UI now displays an explicit rate-limit explanation.

Live metadata checks on 2026-09-25 found a reel and an empty stories feed for `dash.model`. Its REST highlights tray redirected home; the web tray returned a valid empty response. The highlights fallback also returned an empty response for `mida.twins`. Tagged media returned HTTP 429. These checks do not establish successful nonempty highlights, active stories, complete reels pagination, or tagged-media downloads.


## Saved Instagram profiles

Opening a profile now loads its local mapping immediately. It does not automatically scan all five categories. Map or refresh Highlights, Posts, Reels, Tagged, and Stories independently. Expand Choose items to select individual posts (including every image and video in a carousel), reels, stories, or highlight collections. Downloading a selection keeps the dialog open for the next batch.

Each completed category mapping is saved atomically under the app data directory in `instagram-profiles`. The saved inventory contains source references and counts, not media CDN URLs or authentication cookies. Reopening the same profile after restarting the app restores these references without a network scan. Category profile URLs such as `/username/posts/` and `/username/tagged/` enter this flow as well.

A failed refresh keeps earlier references available. Cookie and rate-limit warnings leave Map/Refresh controls visible; fix the browser session or cookie settings and retry that category. Stories may expire even though their saved references remain. Progress is checkpointed during mapping; posts and reels also retain completed-page cursors.

Selected sources have stable queue IDs per profile, category, source, and destination. Already queued or completed items are skipped; failed or cancelled items can be retried with the current cookie settings. Completed references are also retained in the saved profile mapping, so clearing task history does not clear those completion markers. The ordinary file-exists behavior still applies at the destination.

The highlights fallback now uses the authenticated tray query and variables from the local Instaloader implementation, while retaining explicit error handling. On 2026-09-26 a complete metadata scan of `smokeybear97` returned three highlight media files without errors. This verifies nonempty highlights mapping; it does not establish media-download success or remove Instagram rate limits on other categories.


## Interrupting a map

During a category scan, **Stop mapping** terminates the extractor process group and saves the source references discovered so far. Closing the dialog leaves mapping in the background. Saved profiles, beside Add URL, reopens the inventory and shows queued or active mapping work. Stopped categories remain selectable when they contain saved items; **Refresh / retry** restarts that category and merges results with the saved references. Posts and reels save completed-page cursors when interrupted and resume from that checkpoint. Cancelling a queued scan does not interrupt a different profile's active scan.

The bundled Instagram extractor emits a minimal discovery stream during inspection, without CDN URLs or cookies. Normal completion still uses the complete JSON document, including extractor error records. All five categories retain image and video references. Posts include mixed galleries, and story/highlight photos use the same download path as their video counterparts.


## Admission and incremental refresh

Each desktop/API host shares platform admission between mapping and downloads. Waiting downloads remain queued without occupying global execution slots, so other platforms can proceed. Instagram subdomains share one permit; TikTok, Facebook, VSCO, Threads and other download hosts likewise serialize their download work. This reduces overlapping requests but does not guarantee that a site will not rate-limit a session. Separate desktop/server processes do not share this in-memory permit.

Reopening a saved profile performs no extraction. Completed download references are reflected in the mapping and disabled in the item picker. A refresh merges new references into the inventory. Posts/reels/tagged stop after a run of known history; interrupted posts/reels retain a pagination checkpoint. Highlights skip unchanged collections when the site supplies both freshness and item-count metadata; otherwise their metadata must be checked again to avoid missing new media. Existing output files are preserved and skipped when an updated highlight is downloaded. Stories necessarily recheck the current short-lived feed.
