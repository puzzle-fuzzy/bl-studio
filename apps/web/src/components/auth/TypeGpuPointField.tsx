import { useEffect, useRef } from 'react'
import tgpu, { common, d } from 'typegpu'
import type { TgpuUniform } from 'typegpu'

type AnyUniform = TgpuUniform<any>

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const pointFieldDensity = (x: number, y: number) => {
  const ellipse = (centerX: number, centerY: number, radiusX: number, radiusY: number) =>
    1 - Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY)

  return Math.max(
    ellipse(0.22, 0.72, 0.30, 0.28),
    ellipse(0.28, 0.49, 0.16, 0.28),
    ellipse(0.56, 0.36, 0.13, 0.21),
    ellipse(0.40, 0.56, 0.22, 0.16),
    ellipse(0.31, 0.05, 0.08, 0.11),
  )
}

const createPointFieldFragment = (
  timeUniform: AnyUniform,
  pointerUniform: AnyUniform,
  resolutionUniform: AnyUniform,
) => {
  const fragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  }) /* wgsl */ `{
  let p = in.uv;
  let resolution = pointFieldResolution;
  let time = pointFieldTime;
  let pointer = pointFieldPointer;

  // Keep the field weighted toward the left side, leaving the form readable.
  let mainMass = 1.0 - length((p - vec2f(0.22, 0.72)) / vec2f(0.30, 0.28));
  let risingMass = 1.0 - length((p - vec2f(0.28, 0.49)) / vec2f(0.16, 0.28));
  let upperMass = 1.0 - length((p - vec2f(0.56, 0.36)) / vec2f(0.13, 0.21));
  let bridge = 1.0 - length((p - vec2f(0.40, 0.56)) / vec2f(0.22, 0.16));
  let topDrop = 1.0 - length((p - vec2f(0.31, 0.05)) / vec2f(0.08, 0.11));

  let density = clamp(max(max(mainMass, risingMass), max(max(upperMass, bridge), topDrop)), 0.0, 1.0);
  // Keep the GPU grid aligned with the 10px CSS fallback grid.
  let cells = max(resolution / vec2f(10.0, 10.0), vec2f(1.0, 1.0));
  let cellMotion = vec2f(1.0 / cells.x, 1.0 / cells.y);

  // Stable per-cell phases make the movement feel organic instead of uniform.
  let cell = floor(p * cells);
  let seedA = sin(dot(cell, vec2f(127.1, 311.7))) * 43758.5453;
  let seedB = sin(dot(cell, vec2f(269.5, 183.3))) * 43758.5453;
  let randomA = fract(seedA);
  let randomB = fract(seedB);
  let phaseA = randomA * 6.2831853;
  let phaseB = randomB * 6.2831853;

  let pointerDelta = (p - pointer.xy) / cellMotion;
  let pointerDistance = length(pointerDelta);
  let hover = (1.0 - smoothstep(0.0, 18.0, pointerDistance)) * pointer.z;
  let pushDirection = normalize(pointerDelta + vec2f(0.0001, 0.0001)) * cellMotion;
  let drift = vec2f(
    sin(time * (0.72 + randomA * 0.34) + phaseA),
    cos(time * (0.64 + randomB * 0.30) + phaseB)
  ) * cellMotion * (0.12 + density * 0.22);
  let pointerPush = pushDirection * hover * (0.28 + density * 0.22);
  let pointerWiggle = vec2f(
    sin(time * 2.4 + phaseB),
    cos(time * 2.1 + phaseA)
  ) * cellMotion * hover * 0.14;
  let moved = p + drift + pointerPush + pointerWiggle;

  let local = fract(moved * cells) - vec2f(0.5, 0.5);
  let distanceToDot = length(local);
  let pulse = 0.5 + 0.5 * sin(time * (0.62 + randomA * 0.18) + phaseA);
  let dotRadius = 0.12 + pulse * 0.016 + hover * 0.05;
  let dot = 1.0 - smoothstep(dotRadius * 0.52, dotRadius, distanceToDot);
  let edgeFade = smoothstep(0.015, 0.12, density);
  let alpha = clamp(dot * edgeFade * (0.30 + density * 0.78 + hover * 0.16), 0.0, 1.0);

  let ring = (0.5 + 0.5 * sin(pointerDistance * 3.5 - time * 3.8))
    * (1.0 - smoothstep(0.0, 18.0, pointerDistance))
    * pointer.z;
  let blueInfluence = clamp(hover * 0.92 + ring * 0.16, 0.0, 1.0);
  let darkInfluence = hover * (1.0 - smoothstep(0.3, 6.0, pointerDistance)) * 0.76;
  let purple = vec3f(0.68, 0.32, 0.78);
  let electricBlue = vec3f(0.06, 0.04, 0.82);
  let nearBlack = vec3f(0.025, 0.018, 0.045);
  var color = mix(purple, electricBlue, blueInfluence);
  color = mix(color, nearBlack, darkInfluence);

  return vec4f(color, alpha);
}`

  return fragment.$uses({
    pointFieldTime: timeUniform,
    pointFieldPointer: pointerUniform,
    pointFieldResolution: resolutionUniform,
  })
}

/** WebGPU / TypeGPU 点阵氛围层；不支持 WebGPU 时保留 CSS 点阵兜底。 */
export function TypeGpuPointField() {
  const fieldRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerUniformRef = useRef<AnyUniform | null>(null)
  const pointerRef = useRef({ x: 0.22, y: 0.72, active: 0 })

  useEffect(() => {
    const field = fieldRef.current
    const canvas = canvasRef.current
    if (field === null || canvas === null) return

    let disposed = false
    let frameId: number | null = null
    let root: ReturnType<typeof tgpu.initFromDevice> | null = null
    let removeResizeListener: (() => void) | null = null
    let timeUniform: AnyUniform | null = null
    let resolutionUniform: AnyUniform | null = null

    const updatePointer = (x: number, y: number, active: number) => {
      const next = { x: clamp01(x), y: clamp01(y), active }
      pointerRef.current = next
      field.dataset.pointerActive = active > 0 ? 'true' : 'false'
      field.style.setProperty('--pointer-x', `${next.x * 100}%`)
      field.style.setProperty('--pointer-y', `${next.y * 100}%`)
      pointerUniformRef.current?.write(d.vec4f(next.x, next.y, next.active, 1))
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      const isInside = x >= 0 && x <= 1 && y >= 0 && y <= 1 && pointFieldDensity(x, y) > 0
      updatePointer(x, y, isInside ? 1 : 0)
    }

    const handlePointerLeave = () => {
      updatePointer(pointerRef.current.x, pointerRef.current.y, 0)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('mouseleave', handlePointerLeave)
    window.addEventListener('blur', handlePointerLeave)

    if (!('gpu' in navigator) || navigator.gpu === undefined) {
      return () => {
        window.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('mouseleave', handlePointerLeave)
        window.removeEventListener('blur', handlePointerLeave)
      }
    }

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio))
      canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio))
      resolutionUniform?.write(d.vec2f(rect.width, rect.height))
    }

    const render = async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter()
        const device = await adapter?.requestDevice()
        if (device === undefined || disposed) return

        root = tgpu.initFromDevice({ device })
        const rect = canvas.getBoundingClientRect()
        timeUniform = root.createUniform(d.f32, 0)
        pointerUniformRef.current = root.createUniform(d.vec4f, d.vec4f(
          pointerRef.current.x,
          pointerRef.current.y,
          pointerRef.current.active,
          1,
        ))
        resolutionUniform = root.createUniform(d.vec2f, d.vec2f(rect.width, rect.height))

        const format = navigator.gpu.getPreferredCanvasFormat()
        const context = root.configureContext({ canvas, format, alphaMode: 'premultiplied' })
        const pipeline = root.createRenderPipeline({
          vertex: common.fullScreenTriangle,
          fragment: createPointFieldFragment(timeUniform, pointerUniformRef.current, resolutionUniform),
          targets: { format },
        })
        await pipeline.initAsync()
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const startedAt = performance.now()

        const draw = (timestamp = performance.now()) => {
          if (disposed) return
          if (!reducedMotion) timeUniform?.write((timestamp - startedAt) / 1000)
          pipeline.withColorAttachment({ view: context, clearValue: [1, 1, 1, 0] }).draw(3)
          if (!reducedMotion) frameId = window.requestAnimationFrame(draw)
        }

        const handleResize = () => {
          resizeCanvas()
          if (reducedMotion) draw()
        }

        resizeCanvas()
        updatePointer(pointerRef.current.x, pointerRef.current.y, pointerRef.current.active)
        draw()
        // Wait until the first submitted GPU frame reaches a paint cycle before
        // switching off the fallback. This prevents a blank flash on startup.
        await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
        if (disposed) return
        window.addEventListener('resize', handleResize, { passive: true })
        removeResizeListener = () => window.removeEventListener('resize', handleResize)
        field.dataset.gpuReady = 'true'
      } catch {
        // The CSS fallback remains visible when adapter/device/pipeline setup fails.
      }
    }

    void render()

    return () => {
      disposed = true
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      removeResizeListener?.()
      pointerUniformRef.current = null
      root?.destroy()
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('mouseleave', handlePointerLeave)
      window.removeEventListener('blur', handlePointerLeave)
    }
  }, [])

  return (
    <div ref={fieldRef} className="login-point-field" data-point-field aria-hidden="true">
      <div className="login-point-field__fallback" />
      <div className="login-point-field__pointer" />
      <canvas ref={canvasRef} className="login-point-field__canvas" />
    </div>
  )
}
