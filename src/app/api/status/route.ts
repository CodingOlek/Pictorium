import { NextRequest } from "next/server"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { isMultiUserEnabled, getMaxUsers } from "@/lib/user-auth"
import { countActiveUsers, listUsers } from "@/lib/user-activity"
import { getKeyMissingStats } from "@/lib/catalog-handler"
import { isUserKeysEncryptionAvailable } from "@/lib/user-keys"
import { envWithFallback } from "@/lib/env-compat"

/**
 * Sponsor/hosting pubblico dell'istanza (banner UI, mai segreti).
 * Whitelist rigida: solo "elfhosted" o null — il raw env non esce mai.
 * Primario l'env esplicito, fallback best-effort sull'host della richiesta.
 */
export function resolveHostedBy(req: NextRequest): "elfhosted" | null {
  const raw = envWithFallback("HOSTED_BY")?.toLowerCase().trim()
  if (raw === "elfhosted") return "elfhosted"
  if (raw) return null
  const host = req.headers.get("host")?.toLowerCase() ?? ""
  const xfh = req.headers.get("x-forwarded-host")?.toLowerCase() ?? ""
  if (host.includes("elfhosted.com") || xfh.includes("elfhosted.com")) return "elfhosted"
  return null
}

/**
 * Stato multi-user (aggregati soli, nessun UUID/segreto): numero utenti,
 * utenti attivi ultimi 7 giorni (solo conteggio), cap spazi (0 = illimitati),
 * byte occupati, cifratura chiavi disponibile, contatori key-missing dei
 * cataloghi. Pubblico come /api/health (solo conteggi operativi).
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(rateLimitKey(req), "default")
  if (!rl.ok) return rateLimitResponse(rl.retAfter)
  const multiUser = isMultiUserEnabled()
  const users = multiUser ? await listUsers() : []
  let usersBytes = 0
  for (const u of users) {
    if (u.bytes > 0) usersBytes += u.bytes
  }
  return Response.json({
    multiUser,
    users: users.length,
    activeUsers: countActiveUsers(users),
    maxUsers: multiUser ? getMaxUsers() : 0,
    usersBytes,
    keysEncryption: isUserKeysEncryptionAvailable(),
    keyMissing: getKeyMissingStats(),
    hostedBy: resolveHostedBy(req),
    timestamp: new Date().toISOString(),
  })
}
