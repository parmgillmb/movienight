import { useEffect, useRef } from 'react'

type Particle = {
  x: number
  y: number
  z: number // depth 0..1, drives size/speed/alpha for a parallax feel
  vx: number
  vy: number
}

const PARTICLE_COUNT = 90
const CURSOR_PULL_RADIUS = 170

/**
 * Ambient starfield canvas + a custom cursor ring.
 *
 * Both are purely decorative: the canvas is aria-hidden and the cursor layer is
 * pointer-events:none so it never intercepts clicks. Everything is skipped when
 * the user prefers reduced motion or is on a touch/coarse-pointer device.
 */
export default function Ambience() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const dotRef = useRef<HTMLDivElement | null>(null)

  // ---- starfield ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    const particles: Particle[] = []
    const pointer = { x: -9999, y: -9999 }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const seed = () => {
      particles.length = 0
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const z = Math.random()
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z,
          vx: (Math.random() - 0.5) * (0.08 + z * 0.22),
          vy: (Math.random() - 0.5) * (0.08 + z * 0.22),
        })
      }
    }

    resize()
    seed()

    const onResize = () => {
      resize()
      seed()
    }
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
    }
    const onPointerLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }

    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave)

    let raf = 0
    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy

        // wrap around the edges so the field never empties out
        if (p.x < -10) p.x = width + 10
        if (p.x > width + 10) p.x = -10
        if (p.y < -10) p.y = height + 10
        if (p.y > height + 10) p.y = -10

        // gentle drift toward the cursor for a reactive feel
        const dx = pointer.x - p.x
        const dy = pointer.y - p.y
        const dist = Math.hypot(dx, dy)
        let glow = 0
        if (dist < CURSOR_PULL_RADIUS) {
          glow = 1 - dist / CURSOR_PULL_RADIUS
          p.x += (dx / dist) * glow * 0.35
          p.y += (dy / dist) * glow * 0.35
        }

        const radius = 0.6 + p.z * 1.7 + glow * 1.2
        const alpha = 0.18 + p.z * 0.35 + glow * 0.45
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = glow > 0.05 ? `rgba(255,180,180,${alpha})` : `rgba(255,255,255,${alpha})`
        ctx.fill()
      }

      raf = window.requestAnimationFrame(draw)
    }

    if (reduceMotion) {
      // draw a single static frame instead of animating
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 0.6 + p.z * 1.7, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${0.18 + p.z * 0.35})`
        ctx.fill()
      }
    } else {
      raf = window.requestAnimationFrame(draw)
    }

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  // ---- custom cursor -----------------------------------------------------
  useEffect(() => {
    const ring = ringRef.current
    const dot = dotRef.current
    if (!ring || !dot) return

    // Only meaningful for a real mouse; skip on touch to avoid a stuck ring.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    document.body.classList.add('custom-cursor-on')

    let mouseX = window.innerWidth / 2
    let mouseY = window.innerHeight / 2
    let ringX = mouseX
    let ringY = mouseY
    let lastTarget: Element | null = null
    let dirty = true

    // The move handler stays as cheap as possible: record the position and,
    // only when the element under the pointer actually changes, re-test whether
    // it is interactive. All DOM writes happen once per frame in follow().
    const onMove = (event: PointerEvent) => {
      mouseX = event.clientX
      mouseY = event.clientY
      dirty = true

      const target = event.target as Element | null
      if (target !== lastTarget) {
        lastTarget = target
        const interactive = Boolean(
          target?.closest('button, a, input, select, textarea, summary, [role="button"]'),
        )
        ring.classList.toggle('cursor-ring-active', interactive)
      }
    }

    const onDown = () => ring.classList.add('cursor-ring-press')
    const onUp = () => ring.classList.remove('cursor-ring-press')

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)

    // The dot tracks the pointer exactly; the ring eases in just behind it.
    let raf = 0
    const follow = () => {
      const dx = mouseX - ringX
      const dy = mouseY - ringY

      // Snap when close enough, otherwise ease. Keeps it tight, not floaty.
      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
        ringX = mouseX
        ringY = mouseY
      } else {
        ringX += dx * 0.35
        ringY += dy * 0.35
        dirty = true
      }

      if (dirty) {
        dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`
        ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`
        dirty = false
      }

      raf = window.requestAnimationFrame(follow)
    }
    raf = window.requestAnimationFrame(follow)

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('custom-cursor-on')
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" />
      <div ref={ringRef} className="cursor-ring" aria-hidden="true" />
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
    </>
  )
}
