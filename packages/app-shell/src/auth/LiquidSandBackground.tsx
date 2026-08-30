import { useEffect, useRef } from 'react'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const vertexSource = `#version 300 es
  layout(location = 0) in vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const fragmentSource = `#version 300 es
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec3 u_pointer;

  out vec4 outColor;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.52;
    mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);

    for (int i = 0; i < 5; i++) {
      sum += amplitude * noise(p);
      p = turn * p * 2.03 + 7.17;
      amplitude *= 0.49;
    }
    return sum;
  }

  float ridges(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.55;
    mat2 turn = mat2(0.86, -0.51, 0.51, 0.86);

    for (int i = 0; i < 4; i++) {
      float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
      sum += n * n * amplitude;
      p = turn * p * 2.12 + 4.31;
      amplitude *= 0.47;
    }
    return sum;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = uv - 0.5;
    p.x *= aspect;

    float time = u_time;

    // 主平流沿一条倒 U 形路线前进：左上进入，向下穿过，再抬升到右上离开。
    // 相位和横向位移绑定，让路线不会变成上下原地摆动。
    float routePhase = time * (6.2831853 * 0.42 / max(aspect, 0.75));
    vec2 routeDrift = vec2(
      time * 0.42,
      0.40 * cos(routePhase) + 0.035 * sin(routePhase * 2.0)
    );
    vec2 q = p - routeDrift;

    // 两层域扭曲制造液体卷动，避免只是平移一张噪声贴图。
    vec2 warpA = vec2(
      fbm(q * 1.36 + vec2(-time * 0.11, 3.10)),
      fbm(q * 1.48 + vec2(8.20, time * 0.085))
    ) - 0.5;
    q += warpA * vec2(0.25, 0.19);

    vec2 warpB = vec2(
      fbm(q * 2.72 + vec2(time * 0.095, 11.30)),
      fbm(q * 2.86 + vec2(-6.80, -time * 0.082))
    ) - 0.5;
    q += warpB * vec2(0.10, 0.075);

    // 群流层：不同速度的 curl-like 噪声让局部纹理成群转向、聚拢和散开。
    vec2 schoolWarp = vec2(
      fbm(q * vec2(1.80, 4.20) + vec2(-time * 0.18, time * 0.11)),
      fbm(q * vec2(2.10, 3.40) + vec2(time * 0.15, -time * 0.10))
    ) - 0.5;
    q += schoolWarp * vec2(0.13, 0.09);

    // 鼠标只推动局部流场，不改变蓝紫两股流体的颜色归属。
    vec2 pointer = u_pointer.xy - 0.5;
    pointer.x *= aspect;
    vec2 toPointer = q - pointer;
    float pointerForce = exp(-dot(toPointer, toPointer) * 5.5) * u_pointer.z;
    q += vec2(-toPointer.y, toPointer.x) * pointerForce * 0.24;

    // 用连续的液体密度和颜料偏置塑造云状流动，不再用上下两条中心线。
    float paintA = fbm(q * vec2(1.18, 1.92) + vec2(-time * 0.12, time * 0.09));
    float paintB = fbm(q * vec2(1.72, 2.64) + vec2(time * 0.105, -time * 0.075));
    float paintC = fbm(q * vec2(3.15, 4.80) + vec2(-time * 0.17, time * 0.12));
    float paintField = paintA * 0.50 + paintB * 0.36 + paintC * 0.14;
    float liquidBoundary = fbm(q * vec2(2.80, 5.60) + vec2(time * 0.13, -time * 0.10)) - 0.5;
    float dyeMask = smoothstep(0.30, 0.64, paintField + liquidBoundary * 0.18);

    // 蓝紫归属由旋转流场连续计算；每一帧都会重新交融和分离。
    float blueSignal = 0.5 + 0.5 * sin(
      q.x * 1.72 - q.y * 2.55 + time * 0.58 + paintB * 4.8
    );
    float purpleSignal = 0.5 + 0.5 * sin(
      q.x * 2.20 + q.y * 1.38 - time * 0.46 + paintA * 4.2
    );
    float blueMix = clamp(blueSignal * 0.55 + purpleSignal * 0.18 + paintB * 0.27, 0.0, 1.0);
    float overlap = clamp(1.0 - abs(blueMix * 2.0 - 1.0), 0.0, 1.0);

    float blueDetail = clamp(
      0.24
      + 0.76 * fbm(q * vec2(2.25, 10.2) + vec2(-time * 0.20, 2.7))
      + 0.17 * ridges(q * vec2(5.1, 16.0) + vec2(time * 0.14, 5.4)),
      0.0,
      1.0
    );

    float purpleDetail = clamp(
      0.22
      + 0.78 * fbm(q * vec2(2.10, 9.7) + vec2(time * 0.17, 18.9))
      + 0.16 * ridges(q * vec2(4.7, 15.2) + vec2(-time * 0.12, 21.2)),
      0.0,
      1.0
    );

    vec3 deepWater = vec3(0.004, 0.015, 0.040);
    float waterMist = fbm(q * vec2(1.25, 4.3) + vec2(time * 0.06, -7.0));
    vec3 water = deepWater + vec3(0.005, 0.018, 0.035) * waterMist;

    vec3 blueInk = mix(
      vec3(0.012, 0.105, 0.54),
      vec3(0.025, 0.62, 1.00),
      blueDetail
    );

    vec3 purpleInk = mix(
      vec3(0.235, 0.018, 0.55),
      vec3(0.76, 0.095, 1.00),
      purpleDetail
    );

    vec3 dye = mix(purpleInk, blueInk, blueMix);
    vec3 blendedInk = mix(purpleInk, blueInk, 0.5 + 0.22 * sin(time * 0.34 + q.y * 8.0));
    dye = mix(dye, blendedInk, overlap * 0.78);

    // 微细颗粒提升流沙质感，颗粒随域流动而不是随机闪烁。
    float sand = pow(
      noise(q * vec2(25.0, 54.0) + vec2(-time * 0.16, time * 0.06)),
      10.0
    );
    dye += dye * sand * 0.25;

    vec3 color = mix(water, dye, dyeMask);

    // 重叠区域增加一层缓慢变化的颜料雾，让交融感持续发生。
    float mixingMist = fbm(q * vec2(8.5, 13.0) + vec2(-time * 0.22, time * 0.16));
    color += dye * mixingMist * overlap * 0.10;

    // 细长流痕像鱼群掠过水体，保持低对比，避免重新变成两条硬色带。
    float schoolRidge = ridges(q * vec2(4.0, 15.0) + vec2(-time * 0.86, time * 0.18));
    float schoolGlint = smoothstep(0.58, 0.90, schoolRidge) * (0.55 + paintC * 0.45);
    color += dye * schoolGlint * (0.08 + dyeMask * 0.12);

    // 边缘压暗，顶部保留冷色折射光。
    float edge = smoothstep(0.29, 0.72, length((uv - 0.5) * vec2(0.72, 1.85)));
    color *= 1.0 - edge * 0.24;
    color += vec3(0.055, 0.095, 0.14) * pow(1.0 - uv.y, 10.0) * 0.38;

    float dither = hash21(gl_FragCoord.xy) - 0.5;
    color += dither / 255.0;

    color = pow(max(color, 0.0), vec3(0.92));
    outColor = vec4(color, 1.0);
  }
`

type PointerState = {
  x: number
  y: number
  targetX: number
  targetY: number
  strength: number
  targetStrength: number
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (shader === null) throw new Error('无法创建 WebGL shader')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? '未知 WebGL shader 错误'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (program === null) throw new Error('无法创建 WebGL program')

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'WebGL program 链接失败'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

/** 基于参考 HTML 的 WebGL2 流沙渐变背景；不支持 WebGL2 时显示 CSS 流沙后备。 */
export function LiquidSandBackground() {
  const fieldRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const field = fieldRef.current
    const canvas = canvasRef.current
    if (field === null || canvas === null) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointer: PointerState = {
      x: 0.5,
      y: 0.5,
      targetX: 0.5,
      targetY: 0.5,
      strength: 0,
      targetStrength: 0,
    }
    let gl: WebGL2RenderingContext | null = null
    let program: WebGLProgram | null = null
    let vertexArray: WebGLVertexArrayObject | null = null
    let buffer: WebGLBuffer | null = null
    let uniforms: {
      resolution: WebGLUniformLocation | null
      time: WebGLUniformLocation | null
      pointer: WebGLUniformLocation | null
    } | null = null
    let animationFrame = 0
    let disposed = false
    let elapsed = 7
    let previousTime = performance.now()

    const setRenderer = (renderer: 'fallback' | 'webgl2') => {
      field.dataset.renderer = renderer
    }

    const cancelFrame = () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }
    }

    const resize = () => {
      if (gl === null) return
      const rect = field.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(rect.width * ratio))
      const height = Math.max(1, Math.round(rect.height * ratio))
      if (canvas.width === width && canvas.height === height) return
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    }

    const updatePointer = (event: PointerEvent) => {
      const rect = field.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const normalizedX = (event.clientX - rect.left) / rect.width
      const normalizedY = (event.clientY - rect.top) / rect.height
      const inside = normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1
      pointer.targetX = clamp(normalizedX, 0, 1)
      pointer.targetY = 1 - clamp(normalizedY, 0, 1)
      pointer.targetStrength = inside ? 1 : 0
      field.dataset.pointerActive = inside ? 'true' : 'false'
      field.style.setProperty('--liquid-pointer-x', `${pointer.targetX * 100}%`)
      field.style.setProperty('--liquid-pointer-y', `${(1 - pointer.targetY) * 100}%`)
    }

    const releasePointer = () => {
      pointer.targetStrength = 0
      field.dataset.pointerActive = 'false'
    }

    const draw = (now = performance.now()) => {
      if (disposed || gl === null || program === null || vertexArray === null || uniforms === null) return
      animationFrame = 0
      resize()

      const delta = Math.min((now - previousTime) / 1000, 0.034)
      // reduced-motion 下减速而不是冻结，否则背景会退化成静态首帧，无法满足流动背景的基本语义。
      elapsed += Math.max(delta, 0) * (reduceMotion.matches ? 0.38 : 1)
      previousTime = now

      pointer.x += (pointer.targetX - pointer.x) * 0.075
      pointer.y += (pointer.targetY - pointer.y) * 0.075
      pointer.strength += (pointer.targetStrength - pointer.strength) * 0.055

      gl.useProgram(program)
      gl.bindVertexArray(vertexArray)
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
      gl.uniform1f(uniforms.time, elapsed)
      gl.uniform3f(uniforms.pointer, pointer.x, pointer.y, pointer.strength)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      if (!document.hidden) {
        animationFrame = window.requestAnimationFrame(draw)
      }
    }

    const start = () => {
      if (disposed || animationFrame !== 0 || document.hidden) return
      previousTime = performance.now()
      animationFrame = window.requestAnimationFrame(draw)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelFrame()
      } else {
        start()
      }
    }

    const handleReducedMotionChange = () => {
      cancelFrame()
      draw()
      start()
    }

    try {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      })
      if (gl === null) return

      program = createProgram(gl)
      uniforms = {
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        time: gl.getUniformLocation(program, 'u_time'),
        pointer: gl.getUniformLocation(program, 'u_pointer'),
      }
      vertexArray = gl.createVertexArray()
      buffer = gl.createBuffer()
      if (vertexArray === null || buffer === null) throw new Error('无法创建 WebGL 缓冲区')

      gl.bindVertexArray(vertexArray)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.clearColor(0.004, 0.005, 0.012, 1)
      setRenderer('webgl2')
      draw()
      start()
    } catch {
      setRenderer('fallback')
    }

    window.addEventListener('pointermove', updatePointer, { passive: true })
    document.addEventListener('mouseleave', releasePointer)
    window.addEventListener('blur', releasePointer)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('resize', resize, { passive: true })
    reduceMotion.addEventListener('change', handleReducedMotionChange)

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      cancelFrame()
      setRenderer('fallback')
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)

    return () => {
      disposed = true
      cancelFrame()
      window.removeEventListener('pointermove', updatePointer)
      document.removeEventListener('mouseleave', releasePointer)
      window.removeEventListener('blur', releasePointer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('resize', resize)
      reduceMotion.removeEventListener('change', handleReducedMotionChange)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      if (gl !== null) {
        if (buffer !== null) gl.deleteBuffer(buffer)
        if (vertexArray !== null) gl.deleteVertexArray(vertexArray)
        if (program !== null) gl.deleteProgram(program)
      }
    }
  }, [])

  return (
    <div ref={fieldRef} className="login-liquid-sand" data-renderer="fallback" aria-hidden="true">
      <div className="login-liquid-sand__fallback" />
      <canvas ref={canvasRef} className="login-liquid-sand__canvas" />
    </div>
  )
}
