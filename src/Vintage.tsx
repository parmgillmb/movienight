/**
 * Reusable vintage-cinema decorative elements, kept modular so themes can be
 * swapped without touching layout. All procedural/SVG except where a bundled
 * public-domain photo is used as a texture (see public/vintage/CREDITS.md).
 */

// A 35mm film strip with sprocket holes — used as a section divider.
export function FilmStripDivider({ label }: { label?: string }) {
  return (
    <div className="film-divider" aria-hidden="true">
      <div className="film-strip">
        <div className="sprockets" />
        {label ? <span className="film-divider-label font-mono">{label}</span> : null}
        <div className="sprockets" />
      </div>
    </div>
  )
}

// A small spinning film reel mark (inline SVG).
export function ReelMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="reel-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="5" fill="currentColor" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const r = (deg * Math.PI) / 180
        return <circle key={deg} cx={24 + Math.cos(r) * 13} cy={24 + Math.sin(r) * 13} r="3.4" fill="currentColor" />
      })}
    </svg>
  )
}
