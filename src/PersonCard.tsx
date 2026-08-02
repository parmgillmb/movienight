import { useRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { gsap } from 'gsap'

/**
 * A person's "title card". It renders immediately (no entrance animation) but
 * animates to a new grid position when the list reorders (framer-motion
 * `layout`), and tilts toward the cursor in 3D on hover. All the interactive
 * controls live in `children`. Tilt is skipped on touch and under
 * reduced-motion.
 */
export default function PersonCard({
  statusClass,
  children,
}: {
  statusClass: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement | null>(null)

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current
    if (!el) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    gsap.to(el, { rotateY: px * 8, rotateX: -py * 8, duration: 0.4, ease: 'power2.out', transformPerspective: 900 })
  }
  const onLeave = () => {
    const el = ref.current
    if (el) gsap.to(el, { rotateY: 0, rotateX: 0, duration: 0.6, ease: 'power3.out' })
  }

  return (
    <motion.article
      ref={ref}
      layout
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`title-card glass-card ${statusClass}`}
    >
      {children}
    </motion.article>
  )
}

