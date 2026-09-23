import { describe, expect, it } from "vitest"
import {
  CHANGELOG,
  CHANGELOG_SEEN_KEY,
  LATEST_CHANGELOG_VERSION,
  hasUnseenChangelog,
} from "@/data/changelog"

describe("changelog data", () => {
  it("exposes a non-empty curated list, newest first", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0)
    for (const r of CHANGELOG) {
      expect(r.version.trim()).not.toBe("")
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.title.trim()).not.toBe("")
      expect(r.items.length).toBeGreaterThan(0)
      for (const item of r.items) {
        expect(["feature", "perf", "fix"]).toContain(item.type)
        expect(item.text.trim()).not.toBe("")
      }
    }
  })

  it("LATEST tracks the first entry, not the commit-counter APP_VERSION", () => {
    expect(LATEST_CHANGELOG_VERSION).toBe(CHANGELOG[0].version)
  })

  it("uses the agreed localStorage key", () => {
    expect(CHANGELOG_SEEN_KEY).toBe("pictorium_last_seen_changelog")
  })
})

describe("hasUnseenChangelog (dot logic)", () => {
  it("unseen when never opened (null)", () => {
    expect(hasUnseenChangelog(null)).toBe(true)
  })

  it("seen when stored version matches LATEST", () => {
    expect(hasUnseenChangelog(LATEST_CHANGELOG_VERSION)).toBe(false)
  })

  it("unseen when a new curated release lands", () => {
    expect(hasUnseenChangelog("0.0")).toBe(true)
  })
})
