import { describe, expect, it, vi } from "vitest"
import {
  POSTER_CACHE_ALLOWLIST,
  hardenPosterSearchParams,
  isPresetsPosterMode,
  isPublicPosterInstance,
} from "@/lib/poster-params-hardening"
import { normalizePosterCacheParams } from "@/lib/poster-runtime-cache"
import { posterQuerySchema } from "@/lib/validation"

// Il setup globale mocca `@/lib/i18n` con `isRankKey: () => null`: per questo
// test serve la logica reale (mirror fedele di i18n.isRankKey, stesso pattern
// di stremio-mapping-roundtrip.test.ts), altrimenti la guardia rank-key
// dell'hardening non è verificabile.
vi.mock("@/lib/i18n", () => {
  const rankKeys = new Set(["badge.today", "badge.anime", "badge.movie", "badge.series"])
  const identity = (v: string) => v
  return {
    t: identity,
    createT: () => identity,
    setLang: () => {},
    getLang: () => "it",
    isPrefixedKey: (v: string) => v.startsWith("__"),
    badgeKey: (v: string) => (v.startsWith("__") ? v.slice(2) : v),
    resolveLabel: identity,
    resolveLabelFor: identity,
    isRankKey: (v: string | null) => {
      if (!v) return null
      if (v.startsWith("__")) {
        const key = v.slice(2)
        return rankKeys.has(key) ? key : null
      }
      return null
    },
    BADGE_KEY_PREFIX: "__",
  }
})

const BASE = {
  presets: true,
  preview: false,
  anonymous: true,
  publicInstance: true,
  hasMapping: false,
} as const

describe("POSTER_CACHE_ALLOWLIST", () => {
  it("drops unknown query params from the cache key (?x=$RANDOM collapses)", () => {
    const a = normalizePosterCacheParams(new URLSearchParams("gradHeight=30&x=1"))
    const b = normalizePosterCacheParams(new URLSearchParams("gradHeight=30&x=2"))
    const c = normalizePosterCacheParams(new URLSearchParams("gradHeight=30&cachebust=999"))
    expect(a.toString()).toBe(b.toString())
    expect(a.toString()).toBe(c.toString())
    expect(a.get("gradHeight")).toBe("30")
  })

  it("covers every key of posterQuerySchema (drift guard: new schema keys need an explicit allowlist decision)", () => {
    for (const key of Object.keys(posterQuerySchema.shape)) {
      expect(POSTER_CACHE_ALLOWLIST.has(key)).toBe(true)
    }
  })
})

describe("hardenPosterSearchParams", () => {
  it("is a no-op for preview (WYSIWYG sliders stay live)", () => {
    const src = new URLSearchParams("gradHeight=47&blur=82&ac=#123456&extra=Hello&poster=/x.jpg")
    const out = hardenPosterSearchParams(src, { ...BASE, preview: true })
    expect(out.toString()).toBe(src.toString())
  })

  it("is a no-op with presets off (private instances byte-identical)", () => {
    const src = new URLSearchParams("gradHeight=47&ac=#123456&extra=Hello")
    const out = hardenPosterSearchParams(src, { ...BASE, presets: false })
    expect(out.toString()).toBe(src.toString())
  })

  it("quantizes numerics to coarse steps", () => {
    const out = hardenPosterSearchParams(
      new URLSearchParams("gradHeight=47&blur=82&tint=23&bf=68&bd=12&tscale=97&tox=7&toy=3&scale=115&bscale=103&box=6"),
      BASE,
    )
    expect(out.get("gradHeight")).toBe("45")
    expect(out.get("blur")).toBe("80")
    expect(out.get("tint")).toBe("25")
    expect(out.get("bf")).toBe("70")
    expect(out.get("bd")).toBe("10")
    expect(out.get("tscale")).toBe("100")
    expect(out.get("tox")).toBe("5")
    expect(out.get("toy")).toBe("5")
    expect(out.get("scale")).toBe("120")
    expect(out.get("bscale")).toBe("100")
    expect(out.get("box")).toBe("5")
  })

  it("keeps palette accents (normalized) and drops the rest", () => {
    const out = hardenPosterSearchParams(new URLSearchParams("ac=#E74C3C"), BASE)
    expect(out.get("ac")).toBe("#e74c3c")
    const dropped = hardenPosterSearchParams(new URLSearchParams("ac=#123456"), BASE)
    expect(dropped.has("ac")).toBe(false)
    const invalid = hardenPosterSearchParams(new URLSearchParams("ac=nope"), BASE)
    expect(invalid.has("ac")).toBe(false)
  })

  it("drops free-text extra/label on unmapped titles", () => {
    const out = hardenPosterSearchParams(new URLSearchParams("extra=Hello&label=World&rank=3"), BASE)
    expect(out.has("extra")).toBe(false)
    expect(out.has("label")).toBe(false)
    expect(out.get("rank")).toBe("3")
  })

  it("canonicalizes extra from the saved mapping (same key as legacy Stremio URLs)", () => {
    const out = hardenPosterSearchParams(new URLSearchParams("extra=ATTACK"), {
      ...BASE,
      hasMapping: true,
      mappingCustomBadge: "Cult",
    })
    expect(out.get("extra")).toBe("Cult")
    // Nessun customBadge salvato: la query non può inventarlo.
    const none = hardenPosterSearchParams(new URLSearchParams("extra=ATTACK"), {
      ...BASE,
      hasMapping: true,
      mappingCustomBadge: null,
    })
    expect(none.has("extra")).toBe(false)
    // Le rank-key non viaggiano mai come extra: il server le riproduce dal rank.
    const rankKey = hardenPosterSearchParams(new URLSearchParams(""), {
      ...BASE,
      hasMapping: true,
      mappingCustomBadge: "__badge.today",
    })
    expect(rankKey.has("extra")).toBe(false)
  })

  it("strips keyless image overrides on public anonymous requests", () => {
    const out = hardenPosterSearchParams(
      new URLSearchParams("poster=/a.jpg&logo=/b.png&backdrop=/c.jpg&title=T"),
      BASE,
    )
    expect(out.has("poster")).toBe(false)
    expect(out.has("logo")).toBe(false)
    expect(out.has("backdrop")).toBe(false)
    expect(out.get("title")).toBe("T")
  })

  it("keeps image overrides with a user space or off public instances", () => {
    const withUser = hardenPosterSearchParams(new URLSearchParams("poster=/a.jpg"), {
      ...BASE,
      anonymous: false,
    })
    expect(withUser.get("poster")).toBe("/a.jpg")
    const privateInstance = hardenPosterSearchParams(new URLSearchParams("poster=/a.jpg"), {
      ...BASE,
      publicInstance: false,
    })
    expect(privateInstance.get("poster")).toBe("/a.jpg")
  })

  it("never mutates the source params", () => {
    const src = new URLSearchParams("gradHeight=47&extra=x")
    hardenPosterSearchParams(src, BASE)
    expect(src.get("gradHeight")).toBe("47")
    expect(src.get("extra")).toBe("x")
  })
})

describe("poster mode env wiring", () => {
  it("auto-enables presets on public instances (setup forces PUBLIC_INSTANCE=1)", () => {
    expect(isPublicPosterInstance()).toBe(true)
    expect(isPresetsPosterMode()).toBe(true)
  })

  it("treats MULTI_USER=1 as public even when PUBLIC_INSTANCE and HOSTED_BY are unset", async () => {
    vi.resetModules()
    vi.stubEnv("PICTORIUM_PUBLIC_INSTANCE", "0")
    vi.stubEnv("PUBLIC_INSTANCE", "0")
    vi.stubEnv("PICTORIUM_HOSTED_BY", "")
    vi.stubEnv("HOSTED_BY", "")
    vi.stubEnv("PICTORIUM_MULTI_USER", "1")
    vi.stubEnv("MULTI_USER", "1")
    vi.stubEnv("PICTORIUM_POSTER_PARAMS", "")
    vi.stubEnv("POSTER_PARAMS", "")

    const mod = await import("@/lib/poster-params-hardening")
    expect(mod.isPublicPosterInstance()).toBe(true)
    expect(mod.isPresetsPosterMode()).toBe(true)

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("is private when PUBLIC_INSTANCE, HOSTED_BY, and MULTI_USER are all disabled", async () => {
    vi.resetModules()
    vi.stubEnv("PICTORIUM_PUBLIC_INSTANCE", "0")
    vi.stubEnv("PUBLIC_INSTANCE", "0")
    vi.stubEnv("PICTORIUM_HOSTED_BY", "")
    vi.stubEnv("HOSTED_BY", "")
    vi.stubEnv("PICTORIUM_MULTI_USER", "0")
    vi.stubEnv("MULTI_USER", "0")
    vi.stubEnv("PICTORIUM_POSTER_PARAMS", "")
    vi.stubEnv("POSTER_PARAMS", "")

    const mod = await import("@/lib/poster-params-hardening")
    expect(mod.isPublicPosterInstance()).toBe(false)
    expect(mod.isPresetsPosterMode()).toBe(false)

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("allows explicit POSTER_PARAMS=free override even with MULTI_USER=1", async () => {
    vi.resetModules()
    vi.stubEnv("PICTORIUM_PUBLIC_INSTANCE", "0")
    vi.stubEnv("PUBLIC_INSTANCE", "0")
    vi.stubEnv("PICTORIUM_MULTI_USER", "1")
    vi.stubEnv("MULTI_USER", "1")
    vi.stubEnv("PICTORIUM_POSTER_PARAMS", "free")
    vi.stubEnv("POSTER_PARAMS", "free")

    const mod = await import("@/lib/poster-params-hardening")
    expect(mod.isPublicPosterInstance()).toBe(true)
    expect(mod.isPresetsPosterMode()).toBe(false)

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})

