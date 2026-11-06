# Screens lane: English string additions

No files under `packages/i18n/` were changed. These keys render through English defaults in `t`; the orchestrator should add and translate them in every locale. Keep interpolation placeholders intact.

| Key | English default |
| --- | --- |
| `subscriptions.addAction` | Add subscription |
| `subscriptions.allFilter` | All |
| `subscriptions.autoDownloadOff` | Auto-download off |
| `subscriptions.autoDownloadOn` | Auto-download on |
| `subscriptions.emptyDescription` | Follow a channel, playlist or feed and VidBeep downloads new items for you. |
| `subscriptions.emptyTitle` | No subscriptions yet |
| `subscriptions.manage` | Manage {{name}} |
| `subscriptions.newSince` | new since {{date}} |
| `subscriptions.platformFilters` | Filter subscriptions by platform |
| `subscriptions.rssHubLink` | Use RSSHub feeds |
| `subscriptions.today` | Today |
| `subscriptions.upToDate` | Up to date |
| `subscriptions.yesterday` | Yesterday |
| `agentChat.suggestions.calmTitle` | What should VidBeep do? |
| `agentChat.suggestions.calmDescription` | Works on your downloads, transcripts and subscriptions. |
| `about.emailSupport` | Email support |
| `about.feedbackAndIssues` | Feedback & issues |
| `about.helpAndFeedback` | Help and feedback |
| `about.moreFromDeveloper` | More from the developer |
| `about.officialWebsite` | Official website |
| `about.releaseNotes` | Release notes |
| `about.shareVidBeep` | Share VidBeep |

`subscriptions.newSince` follows a separately rendered, locale-formatted count so only the numeric value receives `text-data`. Its date uses the app locale and the required recency rules. This separation may need a richer translated message if a locale requires a different number/phrase order.

Existing download-engine version/status strings, suggestion labels and prompts, update notifications, help descriptions, product descriptions, and share action labels are reused.
