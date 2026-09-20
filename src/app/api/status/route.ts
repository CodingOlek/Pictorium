import { NextRequest } from "next/server"
import { rateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit"
import { isMultiUserEnabled, getMaxUsers } from "@/lib/user-auth"
import { countActiveUsers, listUsers } from "@/lib/user-activity"
import { getKeyMissingStats } from "@/lib/catalog-handler"
import { isUserKeysEncryptionAvailable } from "@/lib/user-keys"

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
    timestamp: new Date().toISOString(),
  })
}
