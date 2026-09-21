import { describe, expect, it, beforeEach, vi, afterEach } from "vitest"
import {
  parseSingleStreamQuality,
  parseStreamQualityFromStreams,
  extractRawQualityTokens,
  resolveStreamQuality,
  __resetStreamQualityCache,
} from "@/lib/stream-quality"

describe("parseStreamQualityFromStreams", () => {
  it("returns null for empty array or invalid inputs", () => {
    expect(parseStreamQualityFromStreams([])).toBeNull()
  })

  it("identifies 4K / 2160p streams", () => {
    const streams = [
      { name: "Torrentio\n1080p", title: "Movie.1080p.BluRay" },
      { name: "Torrentio\n4k", title: "Movie.2160p.UHD.Remux" },
    ]
    expect(parseStreamQualityFromStreams(streams)).toBe("4K")
  })

  it("identifies FHD streams when no 4K is present", () => {
    const streams = [
      { name: "Torrentio\n720p", title: "Movie.720p.HD" },
      { name: "Torrentio\n1080p", title: "Movie.1080p.BluRay.x264" },
    ]
    expect(parseStreamQualityFromStreams(streams)).toBe("FHD")
  })

  it("identifies HD streams", () => {
    const streams = [
      { name: "Torrentio\n720p", title: "Movie.720p.HDTV" },
    ]
    expect(parseStreamQualityFromStreams(streams)).toBe("HD")
  })

  it("identifies SD streams", () => {
    const streams = [
      { name: "Torrentio\nSD", title: "Movie.480p.DVDRip" },
    ]
    expect(parseStreamQualityFromStreams(streams)).toBe("SD")
  })
})

describe("resolveStreamQuality", () => {
  beforeEach(() => {
    __resetStreamQualityCache()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches streams from Torrentio and resolves 4K", async () => {
    const mockStreams = {
      streams: [
        {
          name: "Torrentio\n4k HDR",
          title: "Avatar.2009.2160p.UHD",
          behaviorHints: { filename: "Avatar.2160p.mkv" },
        },
      ],
    }

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockStreams), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const result = await resolveStreamQuality("movie", "tt0499549")
    expect(result.quality).toBe("4K")
    expect(result.status).toBe("resolved")
    expect(result.source).toBe("torrentio")
    expect(result.rawTokens).toContain("4k")
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Caching check
    const cached = await resolveStreamQuality("movie", "tt0499549")
    expect(cached.quality).toBe("4K")
    expect(cached.status).toBe("resolved")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("returns resolved-null on 200 with empty streams (genuine negative)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes("/stream/")) {
        return new Response(JSON.stringify({ streams: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      throw new Error(`unexpected fetch ${u}`)
    })
    // Senza tmdbId: nessun fallback JustWatch, solo Torrentio.
    const result = await resolveStreamQuality("movie", "tt0111161")
    expect(result.quality).toBeNull()
    expect(result.status).toBe("resolved")
  })

  it("returns timeout status when the upstream aborts", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new DOMException("The operation was aborted", "AbortError")
    )
    const result = await resolveStreamQuality("movie", "tt0133093")
    expect(result.quality).toBeNull()
    expect(result.status).toBe("timeout")
  })

  it("returns error status on HTTP 500", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes("/stream/")) return new Response("boom", { status: 500 })
      throw new Error(`unexpected fetch ${u}`)
    })
    const result = await resolveStreamQuality("movie", "tt0133093")
    expect(result.quality).toBeNull()
    expect(result.status).toBe("error")
  })

  it("keeps torrentio failure when JustWatch transport also fails (no fake resolved)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes("/stream/")) return new Response("boom", { status: 500 })
      if (u.includes("justwatch.com")) return new Response("boom", { status: 500 })
      throw new Error(`unexpected fetch ${u}`)
    })
    const result = await resolveStreamQuality("movie", "tt0133093", 550)
    expect(result.quality).toBeNull()
    // Non resolved: il composito userà TTL effimero invece di 6h.
    expect(result.status).not.toBe("resolved")
  })

  it("returns resolved-null on genuine JustWatch miss (empty edges)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes("/stream/")) {
        return new Response(JSON.stringify({ streams: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (u.includes("justwatch.com")) {
        return new Response(JSON.stringify({ data: { popularTitles: { edges: [] } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      throw new Error(`unexpected fetch ${u}`)
    })
    const result = await resolveStreamQuality("movie", "tt0133093", 550)
    expect(result.quality).toBeNull()
    expect(result.status).toBe("resolved")
    expect(result.source).toBe("torrentio")
  })

  it("degrades TTL on Torrentio timeout + JustWatch FHD (keeps failure status)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes("/stream/")) {
        throw new DOMException("The operation was aborted", "AbortError")
      }
      if (u.includes("justwatch.com")) {
        return new Response(
          JSON.stringify({
            data: {
              popularTitles: {
                edges: [
                  {
                    node: {
                      content: { externalIds: { tmdbId: 552 } },
                      offers: [{ presentationType: "HD" }],
                    },
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      throw new Error(`unexpected fetch ${u}`)
    })
    const result = await resolveStreamQuality("movie", "tt0133093", 552)
    expect(result.quality).toBe("FHD")
    expect(result.source).toBe("justwatch")
    // Status non-resolved → cache a 2min, non 30min: seconda chiamata riusa la cache.
    expect(result.status).not.toBe("resolved")
    const cached = await resolveStreamQuality("movie", "tt0133093", 552)
    expect(cached.quality).toBe("FHD")
    expect(fetchSpy).toHaveBeenCalledTimes(2) // 1 torrentio + 1 justwatch, poi cache
  })

  it("series: S01 FHD + ultima stagione 4K → 4K con un solo fetch extra", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = decodeURIComponent(String(url))
      if (u.includes("/stream/series/")) {
        if (u.includes(":3:1")) {
          return new Response(
            JSON.stringify({ streams: [{ name: "Torrentio\n4k", title: "Show.S03E01.2160p.WEB-DL" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }
        return new Response(
          JSON.stringify({ streams: [{ name: "Torrentio\n1080p", title: "Show.S01E01.1080p.WEB-DL" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      throw new Error(`unexpected fetch ${u}`)
    })
    const result = await resolveStreamQuality("series", "tt0903747", 1396, null, undefined, 3)
    expect(result.quality).toBe("4K")
    expect(result.status).toBe("resolved")
    expect(result.source).toBe("torrentio")
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("series: S01 già 4K → nessun fetch extra", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = decodeURIComponent(String(url))
      if (u.includes("/stream/series/")) {
        return new Response(
          JSON.stringify({ streams: [{ name: "Torrentio\n4k", title: "Show.S01E01.2160p.WEB-DL" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      throw new Error(`unexpected fetch ${u}`)
    })
    const result = await resolveStreamQuality("series", "tt0903747", 1396, null, undefined, 3)
    expect(result.quality).toBe("4K")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("series: S01 timeout → nessun fetch extra (niente raddoppio latenza)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes("/stream/")) {
        throw new DOMException("The operation was aborted", "AbortError")
      }
      if (u.includes("justwatch.com")) {
        return new Response(JSON.stringify({ data: { popularTitles: { edges: [] } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      throw new Error(`unexpected fetch ${u}`)
    })
    const result = await resolveStreamQuality("series", "tt0903747", 1396, null, undefined, 3)
    expect(result.quality).toBeNull()
    expect(result.status).not.toBe("resolved")
    // 1 torrentio (S01, timeout) + 1 justwatch, zero fetch sull'ultima stagione.
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe("parseSingleStreamQuality — falsi 4K e token attaccati", () => {
  it("1080p da sorgente UHD/4K Remaster → FHD, mai 4K", () => {
    expect(
      parseSingleStreamQuality({ name: "Torrentio\n1080p", title: "The.Godfather.1972.UHD.BluRay.1080p.REMUX" }),
    ).toBe("FHD")
    expect(
      parseSingleStreamQuality({ title: "Raiders.of.the.Lost.Ark.1080p.UHD.Bluray.x264" }),
    ).toBe("FHD")
    expect(parseSingleStreamQuality({ title: "Movie.2020.1080p.4K.Remaster.BluRay" })).toBe("FHD")
    expect(parseSingleStreamQuality({ title: "Movie.2020.1080p.Mastered.in.4K.BluRay" })).toBe("FHD")
    expect(
      parseSingleStreamQuality({
        name: "Torrentio\n1080p",
        title: "Movie.4K.Remaster",
        behaviorHints: { bingeGroup: "torrentio|1080p|..." },
      }),
    ).toBe("FHD")
  })

  it("token 4K attaccati → 4K", () => {
    expect(parseSingleStreamQuality({ title: "Movie.2024.4KHDR.x264" })).toBe("4K")
    expect(parseSingleStreamQuality({ title: "Movie.2024.4kDV.WEB-DL" })).toBe("4K")
    expect(parseSingleStreamQuality({ title: "Movie.2024.2160pHDR.WEB-DL" })).toBe("4K")
    expect(parseSingleStreamQuality({ title: "Movie.2024.4kHEVC.BluRay" })).toBe("4K")
    expect(parseSingleStreamQuality({ title: "Movie.2024.UHDRemux.2160p" })).toBe("4K")
    expect(parseSingleStreamQuality({ title: "Movie.2024.UHD4K.BluRay.2160p" })).toBe("4K")
  })

  it("genuino 4K restoration con 2160p resta 4K", () => {
    expect(parseSingleStreamQuality({ title: "Movie.1979.2160p.4K.Restoration.REMUX" })).toBe("4K")
  })

  it("max su multi-stream: un solo 4K basta", () => {
    expect(
      parseStreamQualityFromStreams([
        { name: "Torrentio\n1080p", title: "Movie.1080p.BluRay" },
        { title: "Movie.2024.4KHDR.x264" },
      ]),
    ).toBe("4K")
  })

  it("extractRawQualityTokens cattura i token attaccati", () => {
    const tokens = extractRawQualityTokens([{ title: "Movie.2024.4KHDR.x264" }])
    expect(tokens).toContain("4k")
  })
})
