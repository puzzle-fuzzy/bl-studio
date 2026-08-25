import { useEffect, useRef } from 'react'
import tgpu, { common, d } from 'typegpu'
import type { TgpuUniform } from 'typegpu'

type AnyUniform = TgpuUniform<any>

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

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

  let aspect = max(resolution.x / max(resolution.y, 1.0), 1.0);
  let q = (p - vec2f(0.40, 0.52)) * vec2f(aspect, 1.0);
  let flowOffset = vec2f(
    sin(time * 0.16) * 0.10 + cos(time * 0.09) * 0.06,
    cos(time * 0.13) * 0.06 + sin(time * 0.07) * 0.04
  );
  let cloudP = q + flowOffset;

  // A few broad Gaussian wisps form the nebula. This changes only visibility,
  // not particle coordinates, so the star field never dissolves into noise.
  let broadP = (cloudP - vec2f(-0.08, 0.02)) / vec2f(0.78, 0.62);
  let broad = exp(-dot(broadP, broadP));
  let diagonalDistance = (cloudP.y + cloudP.x * 0.46 - 0.04) / 0.19;
  let diagonalLength = (cloudP.x + 0.02) / 0.82;
  let diagonal = exp(-diagonalDistance * diagonalDistance)
    * exp(-diagonalLength * diagonalLength);
  let leftColumnDistance = (cloudP.x + 0.34 - cloudP.y * 0.22) / 0.17;
  let leftColumnHeight = (cloudP.y + 0.02) / 0.76;
  let leftColumn = exp(-leftColumnDistance * leftColumnDistance)
    * exp(-leftColumnHeight * leftColumnHeight);
  let rightColumnDistance = (cloudP.x - 0.34 + cloudP.y * 0.16) / 0.14;
  let rightColumnHeight = (cloudP.y - 0.02) / 0.70;
  let rightColumn = exp(-rightColumnDistance * rightColumnDistance)
    * exp(-rightColumnHeight * rightColumnHeight);
  let cloudBase = clamp(max(max(broad * 0.82, diagonal * 0.92), max(leftColumn * 0.78, rightColumn * 0.64)), 0.0, 1.0);

  // One deterministic, jittered star per small cell gives a dense cloud while
  // keeping the same particle coordinate stable across frames.
  let cells = max(resolution / vec2f(4.0, 4.0), vec2f(1.0, 1.0));
  let cell = floor(p * cells);
  let cellUv = fract(p * cells);
  let randomA = fract(sin(dot(cell, vec2f(127.1, 311.7))) * 43758.5453);
  let randomB = fract(sin(dot(cell, vec2f(269.5, 183.3))) * 43758.5453);
  let randomC = fract(sin(dot(cell, vec2f(419.2, 371.9))) * 43758.5453);
  let randomD = fract(sin(dot(cell, vec2f(92.7, 184.3))) * 43758.5453);
  let starOffset = vec2f(0.12 + randomA * 0.76, 0.12 + randomB * 0.76);
  let starDistance = length(cellUv - starOffset);
  let rareStar = smoothstep(0.82, 1.0, randomC);
  let starRadius = 0.085 + randomD * 0.075 + rareStar * 0.095;
  let star = 1.0 - smoothstep(starRadius * 0.42, starRadius, starDistance);

  let cloudNoise = 0.5 + 0.5 * sin(dot(cloudP, vec2f(3.4, 5.8)) + time * 0.34 + randomC * 6.2831853);
  let density = clamp(cloudBase * (0.72 + cloudNoise * 0.28) + (randomA - 0.5) * 0.20, 0.0, 1.0);

  let pointerP = (pointer.xy - vec2f(0.40, 0.52)) * vec2f(aspect, 1.0);
  let pointerDelta = cloudP - pointerP;
  let pointerDistance = length(pointerDelta);
  let pressure = exp(-pointerDistance * pointerDistance / 0.16) * pointer.z;
  let rippleRadius = fract(time * 0.26) * 1.45;
  let ripple = (1.0 - smoothstep(0.0, 0.075, abs(pointerDistance - rippleRadius)))
    * (1.0 - smoothstep(1.0, 1.55, pointerDistance))
    * pointer.z;
  let flowWave = sin(pointerDistance * 9.5 - time * 4.2) * exp(-pointerDistance * 2.8) * pointer.z;
  let touchedDensity = clamp(density + pressure * 0.20 + ripple * 0.28 + flowWave * 0.08, 0.0, 1.0);
  let visibility = smoothstep(0.06, 0.34, touchedDensity + randomB * 0.16);
  let shimmer = 0.70 + 0.30 * sin(time * (0.85 + randomA * 0.9) + randomD * 6.2831853);
  let alpha = clamp(
    star * visibility * (0.20 + density * 0.90 + rareStar * 0.78)
      * shimmer * (1.0 + pressure * 0.9 + ripple * 1.8),
    0.0,
    0.92,
  );

  let rippleColor = clamp(pressure * 0.75 + ripple * 0.92, 0.0, 1.0);
  let deepViolet = vec3f(0.22, 0.04, 0.58);
  let violet = vec3f(0.52, 0.12, 0.94);
  let pinkViolet = vec3f(0.82, 0.30, 0.90);
  var color = mix(deepViolet, violet, density * 0.72 + randomB * 0.22);
  color = mix(color, pinkViolet, rareStar * 0.52 + cloudNoise * 0.12);
  color = mix(color, vec3f(0.08, 0.10, 0.92), rippleColor);

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
      const isInside = x >= 0 && x <= 1 && y >= 0 && y <= 1
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
