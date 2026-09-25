import { describe, expect, it } from "vitest"
import { cspExtraOrigins } from "@/lib/csp"

describe("cspExtraOrigins", () => {
  it("vuoto senza env (policy invariata)", () => {
    expect(cspExtraOrigins({})).toEqual([])
  })

  it("NEXT_PUBLIC vince su POSTER_CDN_URL, solo scheme+host", () => {
    expect(
      cspExtraOrigins({
        NEXT_PUBLIC_POSTER_CDN_URL: "https://cdn.example.com/some/path///",
        POSTER_CDN_URL: "https://other.example.com",
      }),
    ).toEqual(["https://cdn.example.com"])
  })

  it("fallback a POSTER_CDN_URL e tollera host nudo", () => {
    expect(cspExtraOrigins({ POSTER_CDN_URL: "cdn.example.com" })).toEqual(["https://cdn.example.com"])
  })

  it("scarta scheme non http(s) e valori malformati", () => {
    expect(cspExtraOrigins({ POSTER_CDN_URL: "ftp://cdn.example.com" })).toEqual([])
    expect(cspExtraOrigins({ POSTER_CDN_URL: "http://[invalid" })).toEqual([])
    expect(cspExtraOrigins({ POSTER_CDN_URL: "   " })).toEqual([])
  })
})
