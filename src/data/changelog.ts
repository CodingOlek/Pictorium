// Curated, user-facing changelog. English only by design: translating release
// notes into 10 languages every release is unsustainable for a single
// maintainer (see translations-parity: body lives here, labels in json).
//
// PROCESS RULE: add a bullet here only when a PR changes something the user
// can see or click (feature, visible behavior, new setting). Internal fixes,
// refactors, tests and dep bumps do NOT touch this file — so the unread dot
// (driven by LATEST_CHANGELOG_VERSION below) lights up only for real news.

export type ChangelogItemType = "feature" | "perf" | "fix"

export interface ChangelogItem {
  type: ChangelogItemType
  text: string
}

export interface ChangelogRelease {
  version: string
  date: string // YYYY-MM-DD
  title: string
  items: ChangelogItem[]
}

/** Newest first. The dot compares against CHANGELOG[0], never APP_VERSION
 *  (which bumps on every commit and would leave the dot permanently on). */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: "1.21",
    date: "2026-09-23",
    title: "Community, telemetry & faster renders",
    items: [
      { type: "feature", text: "Join the Discord community from the header links" },
      { type: "feature", text: "New app icon, favicon and bookmark artwork" },
      { type: "feature", text: "Server resource telemetry on the status page and settings (admin)" },
      { type: "perf", text: "Faster poster renders: fewer auto-fit candidates by default" },
      { type: "fix", text: "Per-title fit toggles now apply to Stremio renders too" },
    ],
  },
  {
    version: "1.20",
    date: "2026-09-21",
    title: "Ratings, badges & trend control",
    items: [
      { type: "feature", text: "Separate ratings column: up to 3 provider scores beside the poster" },
      { type: "feature", text: "Trend master switch plus per-category sash toggles" },
      { type: "feature", text: "Admin token unlock in Settings (session only, nothing stored)" },
      { type: "feature", text: "Smarter logo sizing: wide logos scale up, tall ones stay capped" },
      { type: "fix", text: "Active-spaces counter in the footer strip" },
    ],
  },
  {
    version: "1.19",
    date: "2026-09-20",
    title: "Awards, support & badge polish",
    items: [
      { type: "feature", text: "Award badges with fast Wikidata lookup (Oscar, Cannes, Venice…)" },
      { type: "feature", text: "Support the project via Ko-fi links in the header and footer" },
      { type: "feature", text: "Automatic Miniseries and Returning badges" },
      { type: "fix", text: "Per-title rating sources picker, shared parser everywhere" },
    ],
  },
]

export const LATEST_CHANGELOG_VERSION: string = CHANGELOG[0].version

export const CHANGELOG_SEEN_KEY = "pictorium_last_seen_changelog"

/** Pure dot logic (unit-tested): unseen when nothing stored or version differs. */
export function hasUnseenChangelog(seen: string | null): boolean {
  return seen !== LATEST_CHANGELOG_VERSION
}
