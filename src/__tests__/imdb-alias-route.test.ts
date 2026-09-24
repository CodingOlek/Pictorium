import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { DELETE, GET, POST } from "@/app/api/mappings/aliases/route"
import { getAllAliases, removeImdbAlias, setImdbAlias } from "@/lib/store"
import { aliasSchema } from "@/lib/validation"

vi.mock("@/lib/store", () => ({
  getAllAliases: vi.fn(async () => []),
  setImdbAlias: vi.fn(),
  removeImdbAlias: vi.fn(),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true, retAfter: 0 })),
  rateLimitKey: vi.fn(() => "test"),
  rateLimitResponse: vi.fn(() => new Response("rate limited", { status: 429 })),
}))

vi.mock("@/lib/auth", () => ({
  checkAdminToken: vi.fn(() => true),
  isSameOrigin: vi.fn(() => true),
  adminAuthResponse: vi.fn(() => new Response("unauthorized", { status: 401 })),
  originMismatchResponse: vi.fn(() => new Response("forbidden", { status: 403 })),
}))

vi.mock("@/lib/cache", () => ({
  cacheInvalidatePosterDataFor: vi.fn(),
  cacheInvalidatePosterDataForUser: vi.fn(),
}))

vi.mock("@/lib/catalog-epoch", () => ({
  bumpCatalogEpoch: vi.fn(async () => {}),
}))

const BASE = "http://localhost:3000/api/mappings/aliases"

function req(method: string, body?: unknown, query = ""): NextRequest {
  return new NextRequest(
    `${BASE}${query}`,
    {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  )
}

describe("aliasSchema", () => {
  it("accetta tt valido", () => {
    expect(aliasSchema.safeParse({ imdbId: "tt13207736", mediaType: "tv", tmdbId: 299939 }).success).toBe(true)
  })

  it("rifiuta tt/mtype/id invalidi", () => {
    expect(aliasSchema.safeParse({ imdbId: "xyz", mediaType: "tv", tmdbId: 1 }).success).toBe(false)
    expect(aliasSchema.safeParse({ imdbId: "tt1", mediaType: "x", tmdbId: 1 }).success).toBe(false)
    expect(aliasSchema.safeParse({ imdbId: "tt1", mediaType: "tv", tmdbId: 0 }).success).toBe(false)
  })
})

describe("aliases API route", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("POST valido → 200 e salva nello scope globale", async () => {
    const res = await POST(req("POST", { imdbId: "tt13207736", mediaType: "tv", tmdbId: 299939 }))
    expect(res.status).toBe(200)
    expect(setImdbAlias).toHaveBeenCalledWith(
      { imdbId: "tt13207736", mediaType: "tv", tmdbId: 299939 },
      null,
    )
  })

  it("POST invalido → 400 senza scrivere", async () => {
    const res = await POST(req("POST", { imdbId: "ttXYZ", mediaType: "tv", tmdbId: 299939 }))
    expect(res.status).toBe(400)
    expect(setImdbAlias).not.toHaveBeenCalled()
  })

  it("DELETE ?imdbId=tt… → 200 e rimuove", async () => {
    const res = await DELETE(req("DELETE", undefined, "?imdbId=tt13207736"))
    expect(res.status).toBe(200)
    expect(removeImdbAlias).toHaveBeenCalledWith("tt13207736", null)
  })

  it("DELETE senza tt valido → 400", async () => {
    const res = await DELETE(req("DELETE", undefined, "?imdbId=xyz"))
    expect(res.status).toBe(400)
    expect(removeImdbAlias).not.toHaveBeenCalled()
  })

  it("GET → lista alias dello scope", async () => {
    const res = await GET(req("GET"))
    expect(res.status).toBe(200)
    expect(getAllAliases).toHaveBeenCalledWith(null)
    expect(await res.json()).toEqual({ aliases: [] })
  })
})
