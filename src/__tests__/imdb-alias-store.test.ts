import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Mapping } from "@/lib/types"

const UUID_A = "11111111-1111-1111-1111-111111111111"
const UUID_B = "22222222-2222-2222-2222-222222222222"

const originalDataDir = process.env.POSTERIUM_DATA_DIR
const originalMax = process.env.PICTORIUM_MAX_MAPPINGS_PER_USER
let tempDir: string | undefined

async function freshStore() {
  tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pictorium-alias-"))
  process.env.POSTERIUM_DATA_DIR = tempDir
  vi.resetModules()
  return import("@/lib/store")
}

afterEach(async () => {
  if (originalDataDir === undefined) delete process.env.POSTERIUM_DATA_DIR
  else process.env.POSTERIUM_DATA_DIR = originalDataDir
  if (originalMax === undefined) delete process.env.PICTORIUM_MAX_MAPPINGS_PER_USER
  else process.env.PICTORIUM_MAX_MAPPINGS_PER_USER = originalMax
  vi.resetModules()
  if (tempDir) await fsp.rm(tempDir, { recursive: true, force: true })
  tempDir = undefined
})

function mapping(id: number): Mapping {
  return {
    tmdbId: id, mediaType: "tv", title: `T${id}`, posterPath: `/p${id}.jpg`,
    logoPath: null, originalPosterPath: null, language: "it",
    updatedAt: new Date().toISOString(),
  }
}

describe("imdb alias store", () => {
  it("set/get roundtrip con updatedAt timbrato", async () => {
    const store = await freshStore()
    expect(await store.getImdbAlias("tt13207736", UUID_A)).toBeNull()
    await store.setImdbAlias({ imdbId: "tt13207736", mediaType: "tv", tmdbId: 299939 }, UUID_A)
    const got = await store.getImdbAlias("tt13207736", UUID_A)
    expect(got).toMatchObject({ imdbId: "tt13207736", mediaType: "tv", tmdbId: 299939 })
    expect(typeof got?.updatedAt).toBe("string")
    expect(await store.getAllAliases(UUID_A)).toHaveLength(1)
  })

  it("isola i namespace (scoped vs globale vs altro uuid)", async () => {
    const store = await freshStore()
    await store.setImdbAlias({ imdbId: "tt1", mediaType: "tv", tmdbId: 1 }, UUID_A)
    await store.setImdbAlias({ imdbId: "tt1", mediaType: "movie", tmdbId: 2 }, UUID_B)
    await store.setImdbAlias({ imdbId: "tt1", mediaType: "movie", tmdbId: 3 })
    expect(await store.getImdbAlias("tt1", UUID_A)).toMatchObject({ tmdbId: 1 })
    expect(await store.getImdbAlias("tt1", UUID_B)).toMatchObject({ tmdbId: 2 })
    expect(await store.getImdbAlias("tt1")).toMatchObject({ tmdbId: 3 })
  })

  it("rifiuta alias invalidi senza scrivere", async () => {
    const store = await freshStore()
    await expect(store.setImdbAlias({ imdbId: "xyz", mediaType: "tv", tmdbId: 1 }, UUID_A)).rejects.toThrow()
    await expect(store.setImdbAlias({ imdbId: "tt1", mediaType: "tv", tmdbId: 0 }, UUID_A)).rejects.toThrow()
    await expect(store.setImdbAlias({ imdbId: "tt1", mediaType: "x" as never, tmdbId: 1 }, UUID_A)).rejects.toThrow()
    expect(await store.getAllAliases(UUID_A)).toHaveLength(0)
    expect(await store.getImdbAlias("xyz", UUID_A)).toBeNull()
  })

  it("condivide la quota con i mapping", async () => {
    process.env.PICTORIUM_MAX_MAPPINGS_PER_USER = "1"
    const store = await freshStore()
    await store.upsert(mapping(1), UUID_A)
    await expect(
      store.setImdbAlias({ imdbId: "tt1", mediaType: "tv", tmdbId: 2 }, UUID_A),
    ).rejects.toThrow(/quota/i)
    // L'update della stessa chiave non conta come nuovo rigo
    await store.setImdbAlias({ imdbId: "tt1", mediaType: "tv", tmdbId: 2 })
    await store.setImdbAlias({ imdbId: "tt1", mediaType: "tv", tmdbId: 3 })
    expect(await store.getImdbAlias("tt1")).toMatchObject({ tmdbId: 3 })
  })

  it("removeAliasesFor pulisce solo il target (cascata delete mapping)", async () => {
    const store = await freshStore()
    await store.setImdbAlias({ imdbId: "tt1", mediaType: "tv", tmdbId: 10 }, UUID_A)
    await store.setImdbAlias({ imdbId: "tt2", mediaType: "tv", tmdbId: 10 }, UUID_A)
    await store.setImdbAlias({ imdbId: "tt3", mediaType: "tv", tmdbId: 11 }, UUID_A)
    const removed = await store.removeAliasesFor("tv", 10, UUID_A)
    expect(removed.sort()).toEqual(["tt1", "tt2"])
    expect(await store.getImdbAlias("tt1", UUID_A)).toBeNull()
    expect(await store.getImdbAlias("tt3", UUID_A)).toMatchObject({ tmdbId: 11 })
  })

  it("removeImdbAlias invalido è no-op", async () => {
    const store = await freshStore()
    await store.removeImdbAlias("xyz", UUID_A)
    await store.removeImdbAlias("tt999", UUID_A)
  })
})
