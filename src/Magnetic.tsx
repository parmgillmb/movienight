import { useRef, type ReactNode } from 'react'

/**
 * Wraps an interactive element so it drifts toward the cursor while hovered,
 * then springs back on leave — the "magnetic button" micro-interaction. Uses a
 * direct transform (no React state) so it stays smooth. No-ops on touch and
 * under reduced-motion.
 */
export default function Magnetic({ children, strength = 0.4 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null)

  const enabled = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const onMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const el = ref.current
    if (!el || !enabled()) return
    const rect = el.getBoundingClientRect()
    const mx = e.clientX - (rect.left + rect.width / 2)
    const my = e.clientY - (rect.top + rect.height / 2)
    el.style.transform = `translate(${mx * strength}px, ${my * strength}px)`
  }

  const reset = () => {
    const el = ref.current
    if (el) el.style.transform = 'translate(0, 0)'
  }

  return (
    <span
      ref={ref}
      className="magnetic"
      onPointerMove={onMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      {children}
    </span>
  )
}
