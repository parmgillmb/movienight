import { useEffect, useRef, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * A person's "title card": it deals in on scroll (GSAP ScrollTrigger) and tilts
 * toward the cursor in 3D on hover. Purely presentational — all the interactive
 * controls live in `children`. Motion is disabled under reduced-motion, where
 * the card simply appears.
 */
export default function PersonCard({
  index,
  statusClass,
  children,
}: {
  index: number
  statusClass: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement | null>(null)

  // Deal-in on scroll
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(el, { opacity: 1, y: 0, rotateX: 0, scale: 1 })
      return
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 60, rotateX: -14, scale: 0.95, transformPerspective: 900 },
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          scale: 1,
          duration: 0.8,
          ease: 'power3.out',
          delay: (index % 3) * 0.08,
          scrollTrigger: { trigger: el, start: 'top 92%', toggleActions: 'play none none none', once: true },
        },
      )
    }, el)

    // ScrollTrigger positions depend on layout; recompute once things settle.
    const refreshId = window.setTimeout(() => ScrollTrigger.refresh(), 200)
    // Safety net: never let a card stay stuck invisible if the trigger doesn't fire.
    const failsafeId = window.setTimeout(() => {
      if (getComputedStyle(el).opacity === '0') gsap.set(el, { opacity: 1, y: 0, rotateX: 0, scale: 1 })
    }, 1400)

    return () => {
      window.clearTimeout(refreshId)
      window.clearTimeout(failsafeId)
      ctx.revert()
    }
  }, [index])

  // Cursor tilt (desktop, fine pointer, motion allowed)
  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current
    if (!el) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    gsap.to(el, { rotateY: px * 9, rotateX: -py * 9, duration: 0.4, ease: 'power2.out', transformPerspective: 900 })
  }
  const onLeave = () => {
    const el = ref.current
    if (el) gsap.to(el, { rotateY: 0, rotateX: 0, duration: 0.6, ease: 'power3.out' })
  }

  return (
    <article
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`title-card glass-card ${statusClass}`}
    >
      {children}
    </article>
  )
}
