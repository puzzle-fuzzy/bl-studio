import { useEffect, useRef } from 'react'
import tgpu, { common, d } from 'typegpu'

const createPointFieldFragment = (aspect: number) => tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
}) /* wgsl */ `{
  let p = in.uv;

  // Keep the field weighted toward the left side, leaving the form readable.
  let mainMass = 1.0 - length((p - vec2f(0.22, 0.72)) / vec2f(0.30, 0.28));
  let risingMass = 1.0 - length((p - vec2f(0.28, 0.49)) / vec2f(0.16, 0.28));
  let upperMass = 1.0 - length((p - vec2f(0.56, 0.36)) / vec2f(0.13, 0.21));
  let bridge = 1.0 - length((p - vec2f(0.40, 0.56)) / vec2f(0.22, 0.16));
  let topDrop = 1.0 - length((p - vec2f(0.31, 0.05)) / vec2f(0.08, 0.11));

  let density = clamp(max(max(mainMass, risingMass), max(max(upperMass, bridge), topDrop)), 0.0, 1.0);
  // Compensate for the canvas aspect ratio so every dot stays round.
  let cells = vec2f(${(52 * aspect).toFixed(3)}, 52.0);
  let local = fract(p * cells) - vec2f(0.5, 0.5);
  let distanceToDot = length(local);
  let dotRadius = 0.035 + density * 0.17;
  let dot = 1.0 - smoothstep(dotRadius * 0.60, dotRadius, distanceToDot);
  let edgeFade = smoothstep(0.015, 0.12, density);
  let alpha = dot * edgeFade * (0.18 + density * 0.72);

  return vec4f(vec3f(0.72, 0.42, 0.80), alpha);
}`

/** WebGPU / TypeGPU 点阵氛围层；不支持 WebGPU 时保留 CSS 点阵兜底。 */
export function TypeGpuPointField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || !('gpu' in navigator) || navigator.gpu === undefined) return

    let disposed = false
    let root: ReturnType<typeof tgpu.initFromDevice> | null = null
    let removeResizeListener: (() => void) | null = null

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio))
      canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio))
    }

    const render = async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter()
        const device = await adapter?.requestDevice()
        if (device === undefined || disposed) return

        root = tgpu.initFromDevice({ device })
        const rect = canvas.getBoundingClientRect()
        const aspect = rect.height === 0 ? 1.78 : rect.width / rect.height
        const format = navigator.gpu.getPreferredCanvasFormat()
        const context = root.configureContext({ canvas, format, alphaMode: 'premultiplied' })
        const pipeline = root.createRenderPipeline({
          vertex: common.fullScreenTriangle,
          fragment: createPointFieldFragment(aspect),
          targets: { format },
        })

        const draw = () => {
          if (disposed) return
          pipeline.withColorAttachment({ view: context, clearValue: [1, 1, 1, 0] }).draw(3)
        }

        const handleResize = () => {
          resizeCanvas()
          draw()
        }

        resizeCanvas()
        draw()
        window.addEventListener('resize', handleResize, { passive: true })
        removeResizeListener = () => window.removeEventListener('resize', handleResize)
        canvas.closest('[data-point-field]')?.setAttribute('data-gpu-ready', 'true')
      } catch {
        // The SVG fallback remains visible when adapter/device/pipeline setup fails.
      }
    }

    void render()

    return () => {
      disposed = true
      removeResizeListener?.()
      root?.destroy()
    }
  }, [])

  return (
    <div className="login-point-field" data-point-field aria-hidden="true">
      <div className="login-point-field__fallback" />
      <canvas ref={canvasRef} className="login-point-field__canvas" />
    </div>
  )
}
