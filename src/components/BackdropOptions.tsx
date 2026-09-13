"use client"

import type { TMDBImage } from "@/lib/types"
import { PosterBtn } from "@/components/PosterBtn"
import { useT } from "@/lib/contexts/TranslationContext"

interface BackdropOptionsProps {
  backdrops: TMDBImage[]
  backdropActivePath: string | null
  selectBackdrop: (img: TMDBImage) => void
  clearBackdrop: () => void
}

/**
 * Selettore sfondi TMDB per la vista orizzontale: sostituisce PosterOptions
 * nel pannello sinistro quando `posterShape === "landscape"`.
 * Ricliccare lo sfondo attivo lo deseleziona (torna all'auto TMDB).
 */
export function BackdropOptions({ backdrops, backdropActivePath, selectBackdrop, clearBackdrop }: BackdropOptionsProps) {
  const { t } = useT()

  const handleSelect = (img: TMDBImage) => {
    if (backdropActivePath === img.file_path) clearBackdrop()
    else selectBackdrop(img)
  }

  if (backdrops.length === 0) {
    return <p className="text-center py-12 text-muted text-xs">{t("ui.loading")}</p>
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {backdrops.map((img, i) => (
          <PosterBtn
            key={img.file_path}
            staggerIndex={i}
            img={img}
            landscape
            active={backdropActivePath === img.file_path}
            onSelect={handleSelect}
          />
        ))}
      </div>
      {!backdropActivePath && (
        <p className="text-[11px] text-zinc-500 mt-1.5 px-1">{t("ui.backdropAuto")}</p>
      )}
    </div>
  )
}
