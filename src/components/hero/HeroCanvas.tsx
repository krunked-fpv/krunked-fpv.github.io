import { useEffect, useRef } from 'react';
import { nonPurpleRgb, remapHue } from '../../art/color';
import { useInView } from '../../hooks/useInView';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { ArtTheme } from '../../types/project';

export interface HeroCanvasProps {
  accentHue?: number;
  theme?: ArtTheme;
  className?: string;
}

type Vec3 = [number, number, number];

const VERT_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
const vec2 POS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform vec3 uAccentA;
uniform vec3 uAccentB;
uniform float uLight;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.52;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p = rot * p * 2.02 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / max(1.0, uRes.y);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // Smooth spring-lagged pointer offset in aspect space
  vec2 ptr = (uPointer - 0.5) * vec2(aspect, 1.0);
  vec2 delta = p - ptr;
  float ptrDist = length(delta);

  // Subtle 3D perspective tilt driven by pointer
  float persp = 1.0 + p.y * 0.42 - ptr.y * 0.16;
  vec2 wp = vec2(p.x / max(0.55, persp), p.y * 1.18 + 0.08);
  wp -= ptr * 0.14;

  float t = uTime * 0.24;

  // Domain-warped undulating topographic energy field
  vec2 q = vec2(
    fbm(wp * 1.65 + vec2(t * 0.65, -t * 0.35)),
    fbm(wp * 1.65 + vec2(-t * 0.42 + 4.3, t * 0.52 + 1.8))
  );
  float elev = fbm(wp * 2.15 + q * 1.55 + vec2(t * 0.38, -t * 0.22));

  // Pointer caustic lens ripple
  float lens = exp(-ptrDist * ptrDist * 2.4);
  elev += lens * 0.12 * sin(ptrDist * 10.0 - uTime * 1.6);

  // Crisp analytic anti-aliased topographic contour lines
  float contourPhase = elev * 10.5;
  float fw = max(0.0015, fwidth(contourPhase));
  float contourDist = abs(fract(contourPhase - 0.5) - 0.5);
  float contourLine = 1.0 - smoothstep(0.0, fw * 1.65, contourDist);

  // Major topographic index contour every 3rd band
  float majorPhase = elev * 3.5;
  float majorFw = max(0.0015, fwidth(majorPhase));
  float majorDist = abs(fract(majorPhase - 0.5) - 0.5);
  float majorLine = 1.0 - smoothstep(0.0, majorFw * 1.85, majorDist);

  // Sculpted 3D undulating kinetic silk ribbons sweeping across the hero
  float ribbonAccum = 0.0;
  float ribbonCore = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float yCenter = -0.24 + fi * 0.17;
    float wave =
      sin(wp.x * (2.1 + fi * 0.45) + t * (1.5 + fi * 0.25) + q.x * 2.8) * 0.13 +
      cos(wp.x * (3.6 - fi * 0.3) - t * 1.1 + q.y * 2.2) * 0.06 +
      lens * (0.045 - fi * 0.008);
    float d = abs(wp.y - (yCenter + wave));
    ribbonAccum += exp(-d * (7.5 + fi * 1.5)) * (0.38 - fi * 0.05);
    ribbonCore += smoothstep(0.012, 0.0015, d) * (0.68 - fi * 0.11);
  }

  // Atmospheric caustic light anchor (weighted toward upper-right so left typography stays razor crisp)
  vec2 glowCenter = vec2(aspect * 0.24, 0.16) + ptr * 0.22;
  float glowA = exp(-dot(p - glowCenter, p - glowCenter) * 1.45);
  vec2 glowCenterB = vec2(-aspect * 0.18, -0.22) - ptr * 0.14;
  float glowB = exp(-dot(p - glowCenterB, p - glowCenterB) * 1.85);

  vec3 acidLime = vec3(0.8235, 1.0, 0.1569); // #D2FF28
  vec3 pigmentMix = mix(uAccentA, uAccentB, clamp(q.y * 1.15, 0.0, 1.0));

  // ---- OBSIDIAN: Pure OLED #030304 + luminous kinetic ribbons & topographic caustics ----
  vec3 darkGround = vec3(0.0118, 0.0118, 0.0157);
  vec3 darkCol = darkGround;
  darkCol += uAccentA * glowA * 0.22;
  darkCol += uAccentB * glowB * 0.11;
  darkCol += pigmentMix * ribbonAccum * 0.34;
  darkCol += mix(pigmentMix, acidLime, 0.28 + lens * 0.32) * ribbonCore * 0.46;
  darkCol += pigmentMix * contourLine * (0.11 + glowA * 0.14 + lens * 0.1);
  darkCol += mix(uAccentA, acidLime, 0.35) * majorLine * (0.16 + lens * 0.16);

  // Calm breathing pocket behind top editorial masthead text + smooth fade into lower page
  float topHeaderCalm = 1.0 - smoothstep(0.62, 0.96, uv.y) * 0.56;
  float textCalm = (smoothstep(0.0, 0.44, uv.x) * 0.36 + 0.64) * topHeaderCalm;
  float bottomFade = smoothstep(0.0, 0.18, uv.y);
  darkCol = mix(darkGround, darkCol, textCalm * (0.42 + 0.58 * bottomFade));

  // ---- DAYLIGHT: Archival Swiss vellum #F5F3EC + architectural ink wave currents ----
  vec3 lightGround = vec3(0.9608, 0.9529, 0.9255);
  vec3 inkDark = vec3(0.0392, 0.0392, 0.0431);
  vec3 lightPigment = mix(uAccentA, uAccentB, clamp(q.y, 0.0, 1.0));
  vec3 lightCol = lightGround;
  lightCol = mix(lightCol, mix(lightGround, lightPigment, 0.22), clamp(glowA * 0.42 + ribbonAccum * 0.28, 0.0, 0.5));
  lightCol = mix(lightCol, mix(inkDark, uAccentA, 0.48), clamp(contourLine * (0.14 + glowA * 0.12 + lens * 0.08), 0.0, 0.34));
  lightCol = mix(lightCol, mix(inkDark, uAccentA, 0.32), clamp(majorLine * 0.2 + ribbonCore * 0.26, 0.0, 0.42));
  lightCol = mix(lightGround, lightCol, (0.56 + 0.44 * smoothstep(0.0, 0.38, uv.x)) * topHeaderCalm * (0.4 + 0.6 * bottomFade));

  vec3 finalCol = mix(darkCol, lightCol, uLight);

  // Subtle 8-bit anti-banding dither
  float dither = (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  fragColor = vec4(clamp(finalCol + dither, 0.0, 1.0), 1.0);
}
`;

function computeAccentPair(rawHue: number, isLight: boolean): { a: Vec3; b: Vec3 } {
  const h1 = remapHue(rawHue);
  const h2 = remapHue(h1 + 52);
  const rgb1 = nonPurpleRgb(isLight ? 0.48 : 0.76, isLight ? 0.165 : 0.185, h1);
  const rgb2 = nonPurpleRgb(isLight ? 0.54 : 0.72, isLight ? 0.15 : 0.17, h2);
  return {
    a: [rgb1[0] / 255, rgb1[1] / 255, rgb1[2] / 255],
    b: [rgb2[0] / 255, rgb2[1] / 255, rgb2[2] / 255],
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const prog = gl.createProgram();
  if (!prog) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function drawCanvas2DFallback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  ptrX: number,
  ptrY: number,
  colA: Vec3,
  colB: Vec3,
  lightMix: number,
) {
  const isLight = lightMix > 0.5;
  const rA = Math.round(colA[0] * 255);
  const gA = Math.round(colA[1] * 255);
  const bA = Math.round(colA[2] * 255);
  const rB = Math.round(colB[0] * 255);
  const gB = Math.round(colB[1] * 255);
  const bB = Math.round(colB[2] * 255);

  // Base ground
  ctx.fillStyle = isLight ? '#F5F3EC' : '#030304';
  ctx.fillRect(0, 0, w, h);

  // Atmospheric caustic radial aura tracking pointer subtly
  const gx = w * (0.64 + (ptrX - 0.5) * 0.18);
  const gy = h * (0.34 + (ptrY - 0.5) * 0.16);
  const rad = Math.max(w, h) * 0.68;
  const g1 = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
  g1.addColorStop(0, `rgba(${rA},${gA},${bA},${isLight ? 0.14 : 0.24})`);
  g1.addColorStop(0.52, `rgba(${rB},${gB},${bB},${isLight ? 0.06 : 0.1})`);
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  // Undulating kinetic topographic ribbons
  const ribbons = 12;
  const steps = 64;
  for (let r = 0; r < ribbons; r++) {
    const frac = r / (ribbons - 1);
    const yBase = h * (0.12 + frac * 0.78);
    const isMajor = r % 3 === 0;

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = u * w;
      const dx = u - ptrX;
      const dy = yBase / h - ptrY;
      const ptrPull = Math.exp(-(dx * dx + dy * dy) * 7.5) * 28 * (ptrY - 0.5);
      const y =
        yBase +
        Math.sin(u * 5.2 + t * 0.55 + r * 0.55) * (18 + frac * 16) +
        Math.cos(u * 9.4 - t * 0.4 + r * 0.8) * 8 +
        ptrPull;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    if (isLight) {
      ctx.strokeStyle = isMajor
        ? `rgba(${rA},${gA},${bA},0.28)`
        : 'rgba(10,10,11,0.09)';
      ctx.lineWidth = isMajor ? 1.4 : 0.85;
    } else {
      ctx.strokeStyle = isMajor
        ? `rgba(${rA},${gA},${bA},0.42)`
        : `rgba(${rB},${gB},${bB},0.16)`;
      ctx.lineWidth = isMajor ? 1.5 : 0.9;
    }
    ctx.stroke();
  }

  // Smooth bottom dissolve into monolith chassis
  const fade = ctx.createLinearGradient(0, h * 0.72, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, isLight ? '#F5F3EC' : '#030304');
  ctx.fillStyle = fade;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
}

/**
 * Full-bleed interactive 60fps WebGL2 living topographic ribbon & caustic shader
 * with seamless Canvas2D fallback, spring pointer parallax, ~500ms non-purple accent
 * interpolation, prefers-reduced-motion static mode, and visibility/viewport auto-pause.
 */
export function HeroCanvas({ accentHue = 112, theme: themeProp, className = '' }: HeroCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inViewRef, inView] = useInView<HTMLDivElement>({ margin: '240px' });
  const reduced = useReducedMotion();
  const storeTheme = useDeck((s) => s.vault.prefs.theme);
  const theme: ArtTheme = themeProp ?? storeTheme ?? 'obsidian';

  // Mutable animation target ref so accentHue / theme transitions smoothly without re-creating WebGL context
  const targetRef = useRef({
    accentA: computeAccentPair(accentHue, theme === 'daylight').a,
    accentB: computeAccentPair(accentHue, theme === 'daylight').b,
    light: theme === 'daylight' ? 1 : 0,
    ptrX: 0.64,
    ptrY: 0.42,
    reduced,
    inView,
  });

  const renderOnceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const pair = computeAccentPair(accentHue, theme === 'daylight');
    targetRef.current.accentA = pair.a;
    targetRef.current.accentB = pair.b;
    targetRef.current.light = theme === 'daylight' ? 1 : 0;
    targetRef.current.reduced = reduced;
    targetRef.current.inView = inView;
    if (reduced) renderOnceRef.current?.();
  }, [accentHue, theme, reduced, inView]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    // Attempt WebGL2 first, then fall back cleanly to Canvas2D
    let gl: WebGL2RenderingContext | null = null;
    let prog: WebGLProgram | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let uRes: WebGLUniformLocation | null = null;
    let uTime: WebGLUniformLocation | null = null;
    let uPointer: WebGLUniformLocation | null = null;
    let uAccentA: WebGLUniformLocation | null = null;
    let uAccentB: WebGLUniformLocation | null = null;
    let uLight: WebGLUniformLocation | null = null;

    if (typeof WebGL2RenderingContext !== 'undefined') {
      try {
        const candidate = canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        });
        if (candidate) {
          const p = createProgram(candidate);
          if (p) {
            gl = candidate;
            prog = p;
            uRes = gl.getUniformLocation(prog, 'uRes');
            uTime = gl.getUniformLocation(prog, 'uTime');
            uPointer = gl.getUniformLocation(prog, 'uPointer');
            uAccentA = gl.getUniformLocation(prog, 'uAccentA');
            uAccentB = gl.getUniformLocation(prog, 'uAccentB');
            uLight = gl.getUniformLocation(prog, 'uLight');
          }
        }
      } catch {
        gl = null;
      }
    }

    if (!gl) {
      ctx2d = canvas.getContext('2d');
    }

    let cssW = 1;
    let cssH = 1;
    let dpr = Math.min(1.5, window.devicePixelRatio || 1);

    const syncSize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      cssW = Math.round(rect.width);
      cssH = Math.round(rect.height);
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const pw = Math.max(1, Math.round(cssW * dpr));
      const ph = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      if (gl) gl.viewport(0, 0, pw, ph);
    };
    syncSize();

    // Smoothed state
    const curA: Vec3 = [...targetRef.current.accentA];
    const curB: Vec3 = [...targetRef.current.accentB];
    let curLight = targetRef.current.light;
    let curPtrX = targetRef.current.ptrX;
    let curPtrY = targetRef.current.ptrY;
    let elapsed = 0;

    const drawFrame = (timeSec: number) => {
      if (gl && prog && !gl.isContextLost()) {
        gl.useProgram(prog);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, timeSec);
        gl.uniform2f(uPointer, curPtrX, 1 - curPtrY);
        gl.uniform3f(uAccentA, curA[0], curA[1], curA[2]);
        gl.uniform3f(uAccentB, curB[0], curB[1], curB[2]);
        gl.uniform1f(uLight, curLight);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else if (ctx2d) {
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawCanvas2DFallback(ctx2d, cssW, cssH, timeSec, curPtrX, curPtrY, curA, curB, curLight);
      }
    };

    renderOnceRef.current = () => {
      const tgt = targetRef.current;
      curA[0] = tgt.accentA[0];
      curA[1] = tgt.accentA[1];
      curA[2] = tgt.accentA[2];
      curB[0] = tgt.accentB[0];
      curB[1] = tgt.accentB[1];
      curB[2] = tgt.accentB[2];
      curLight = tgt.light;
      syncSize();
      drawFrame(2.4);
    };

    // Immediate crisp initial frame
    drawFrame(targetRef.current.reduced ? 2.4 : 0);

    // Pointer tracking with smooth return to resting focal point
    const onPointerMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      if (nx >= -0.1 && nx <= 1.1 && ny >= -0.1 && ny <= 1.1) {
        targetRef.current.ptrX = Math.max(0, Math.min(1, nx));
        targetRef.current.ptrY = Math.max(0, Math.min(1, ny));
      }
    };
    const onPointerLeave = () => {
      targetRef.current.ptrX = 0.64;
      targetRef.current.ptrY = 0.42;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        syncSize();
        if (targetRef.current.reduced) drawFrame(2.4);
      });
      ro.observe(wrap);
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    let raf = 0;
    let lastNow = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.visibilityState !== 'visible' || !targetRef.current.inView || targetRef.current.reduced) {
        lastNow = now;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      elapsed += dt;

      const tgt = targetRef.current;
      // ~500ms smooth color & theme interpolation (tau ~= 0.17s -> ~95% at 500ms)
      const cAlpha = 1 - Math.exp(-dt * 5.8);
      for (let i = 0; i < 3; i++) {
        curA[i] = curA[i]! + (tgt.accentA[i]! - curA[i]!) * cAlpha;
        curB[i] = curB[i]! + (tgt.accentB[i]! - curB[i]!) * cAlpha;
      }
      curLight += (tgt.light - curLight) * cAlpha;

      // Tactile spring-like pointer inertia
      const pAlpha = 1 - Math.exp(-dt * 4.8);
      curPtrX += (tgt.ptrX - curPtrX) * pAlpha;
      curPtrY += (tgt.ptrY - curPtrY) * pAlpha;

      drawFrame(elapsed);
    };

    const onVisChange = () => {
      lastNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    };
    document.addEventListener('visibilitychange', onVisChange);

    if (typeof requestAnimationFrame === 'function') {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      renderOnceRef.current = null;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      ro?.disconnect();
      if (gl && prog) {
        gl.deleteProgram(prog);
      }
    };
  }, []);

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        inViewRef.current = el;
      }}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full block" />
    </div>
  );
}
