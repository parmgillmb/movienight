import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * A WebGL "theater" backdrop: a slow volumetric projector beam raking across
 * the dark, plus drifting film-dust motes that catch the light and lean toward
 * the cursor. Purely ambient (behind everything, pointer-events:none) and
 * fully torn down on unmount. Skipped under reduced-motion / no-WebGL.
 */
export default function CinematicBackdrop() {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    } catch {
      return // no WebGL — the CSS mesh/aurora still provides atmosphere
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
    camera.position.set(0, 0, 12)

    const setSize = () => {
      const w = mount.clientWidth || window.innerWidth
      const h = mount.clientHeight || window.innerHeight
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    setSize()

    // ---- Projector beam: a tall cone with an additive gradient shader ----
    const beamGeo = new THREE.ConeGeometry(6, 26, 48, 1, true)
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(0xffb347) }, // amber
        uColorB: { value: new THREE.Color(0x5fe6d6) }, // screen cyan counter-light
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vY;
        void main() {
          vUv = uv;
          vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vY;
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        void main() {
          // fade from bright at the lamp (top) to nothing at the floor
          float fade = smoothstep(-13.0, 13.0, vY);
          // soft edges of the cone
          float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          // faint volumetric flicker
          float flick = 0.85 + 0.15 * sin(uTime * 3.0 + vY * 0.6);
          vec3 col = mix(uColorB, uColorA, fade);
          float a = fade * edge * 0.18 * flick;
          gl_FragColor = vec4(col, a);
        }
      `,
    })
    const beam = new THREE.Mesh(beamGeo, beamMat)
    beam.position.set(-3, 6, -6)
    beam.rotation.z = 0.35
    scene.add(beam)

    // ---- Film-dust motes ----
    const COUNT = 380
    const positions = new Float32Array(COUNT * 3)
    const speeds = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 26
      positions[i * 3 + 1] = (Math.random() - 0.5) * 18
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2
      speeds[i] = 0.05 + Math.random() * 0.12
    }
    const dustGeo = new THREE.BufferGeometry()
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const dustMat = new THREE.PointsMaterial({
      size: 0.05,
      color: 0xffe6b0,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    const dust = new THREE.Points(dustGeo, dustMat)
    scene.add(dust)

    // pointer parallax
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    const onMove = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    const onResize = () => setSize()
    window.addEventListener('resize', onResize)

    const clock = new THREE.Clock()
    let raf = 0
    const tick = () => {
      const t = clock.getElapsedTime()
      beamMat.uniforms.uTime.value = t
      beam.rotation.z = 0.35 + Math.sin(t * 0.12) * 0.08

      // drift dust upward + slight cursor lean
      const pos = dustGeo.attributes.position.array as Float32Array
      for (let i = 0; i < COUNT; i++) {
        pos[i * 3 + 1] += speeds[i] * 0.02
        pos[i * 3 + 0] += Math.sin(t * 0.3 + i) * 0.002
        if (pos[i * 3 + 1] > 9) pos[i * 3 + 1] = -9
      }
      dustGeo.attributes.position.needsUpdate = true

      pointer.x += (pointer.tx - pointer.x) * 0.04
      pointer.y += (pointer.ty - pointer.y) * 0.04
      camera.position.x = pointer.x * 0.8
      camera.position.y = -pointer.y * 0.5
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('resize', onResize)
      beamGeo.dispose()
      beamMat.dispose()
      dustGeo.dispose()
      dustMat.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="cinematic-backdrop" aria-hidden="true" />
}
