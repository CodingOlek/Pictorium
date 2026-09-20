"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, Users } from "lucide-react"
import { useT } from "@/lib/contexts/TranslationContext"
import { APP_VERSION } from "@/generated/app-version"
import { currentPathUuid } from "@/lib/user-token"

export function HomeStatusStrip() {
  const { t } = useT()
  const [statusHref, setStatusHref] = useState("/status")
  // Occupazione spazi (solo multi-user): resta nascosto finché il dato non
  // arriva, se l'endpoint fallisce o se manca il conteggio attivi (skew di
  // versione) — nessun layout shift, nessun errore, mai un "0 attivi" bugiardo.
  const [spaces, setSpaces] = useState<{ users: number; maxUsers: number; activeUsers: number } | null>(null)

  useEffect(() => {
    const uuid = currentPathUuid()
    if (uuid) {
      setStatusHref(`/status?u=${encodeURIComponent(uuid)}`)
    }
    let cancelled = false
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (d?.multiUser === true && typeof d.users === "number" && typeof d.activeUsers === "number") {
          setSpaces({
            users: d.users,
            maxUsers: typeof d.maxUsers === "number" ? d.maxUsers : 0,
            activeUsers: d.activeUsers,
          })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <footer className="status-strip max-w-5xl mx-auto mt-10" data-testid="home-status">
      <div className="status-left">
        <div className="status-live-badge">
          <span className="pulse-dot" aria-hidden="true" />
          <span>{t("ui.allSystemsOperational")}</span>
        </div>
        <span className="status-divider hidden sm:inline-block" aria-hidden="true" />
        <span className="status-meta hidden sm:inline" aria-hidden="true">{t("ui.statusMeta")}</span>
      </div>
      <div className="status-right">
        <Link href={statusHref} className="status-link" suppressHydrationWarning>
          <Activity className="w-3 h-3 text-emerald-400/80" aria-hidden="true" />
          <span>{t("ui.statusTitle")}</span>
        </Link>
        {spaces !== null && (
          <div className="status-pill">
            <Users className="w-3 h-3 text-zinc-400" aria-hidden="true" />
            <span data-testid="home-spaces">
              {spaces.maxUsers > 0
                ? t("ui.spacesUsedOf", { used: spaces.users, max: spaces.maxUsers, active: spaces.activeUsers })
                : t("ui.spacesUsed", { used: spaces.users, active: spaces.activeUsers })}
            </span>
          </div>
        )}
        <span className="status-version hidden sm:inline-flex" aria-hidden="true">v{APP_VERSION}</span>
      </div>
    </footer>
  )
}
