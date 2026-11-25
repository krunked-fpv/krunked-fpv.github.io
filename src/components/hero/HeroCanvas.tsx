import { useEffect, useRef } from 'react';
import { nonPurpleRgb, remapHue } from '../../art/color';
import { useInView } from '../../hooks/useInView';
import { useReducedMotion } from '../../hooks/useMediaQuery';
import { useDeck } from '../../store/deckStore';
import type { ArtTheme } from '../../types/project';

export interface HeroCanvasProps {
  accentHue?: number;
  theme?: ArtTheme;
  /** false = dense gravitational singularity at rest; true = blown-open supernova & active orbital arena */
  exploded?: boolean;
  /** Incrementing counter triggering a blazing Flash-style shockwave ring + accretion flare */
  burstSeq?: number;
  /** True while pointer hovers near the event horizon core (coils gravitational energy / pinch) */
  hoverCore?: boolean;
  /** Normalized vertical center ratio from top edge (0..1, default 0.47; desktop lg+ 0.435) */
  centerYRatio?: number;
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
uniform float uExploded;
uniform float uHoverCore;
uniform float uBurstAge;
uniform float uCenterY;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65));
  a += dot(a, a + 34.45);
  return fract(vec2(a.x * a.y, a.y * a.z));
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
    p = rot * p * 2.04 + vec2(3.1, 7.4);
    amp *= 0.5;
  }
  return v;
}

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// Multi-scale crisp twinkling deep-space starfield with Einstein-ring gravitational lensing
vec3 sampleStarfield(vec2 sp, float time, float einsteinBoost, vec3 accentA, vec3 acidLime) {
  vec3 stars = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 22.0 + fl * 26.0;
    vec2 gv = sp * scale + vec2(fl * 17.3, fl * 9.1);
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    vec2 rnd = hash22(id + fl * 31.7);
    vec2 pos = (rnd - 0.5) * 0.72;
    float d = length(f - pos);
    float bright = step(0.84 - fl * 0.04, rnd.x);
    float twinkle = 0.65 + 0.35 * sin(time * (1.8 + rnd.y * 3.5) + rnd.x * 40.0);
    float core = smoothstep(0.075 + einsteinBoost * 0.04, 0.0, d) * bright * twinkle;
    vec3 tint = mix(vec3(0.96, 0.95, 0.90), mix(accentA, acidLime, step(0.94, rnd.y)), 0.38);
    stars += tint * core * (0.85 - fl * 0.22);
  }
  return stars;
}

// Crisp sparse astronomical ink pinpoints for archival Solar Eclipse daylight plate
float sampleDaylightStars(vec2 sp, float time) {
  float dots = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float scale = 20.0 + fl * 22.0;
    vec2 gv = sp * scale + vec2(fl * 13.7, fl * 5.9);
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    vec2 rnd = hash22(id + fl * 23.1);
    vec2 pos = (rnd - 0.5) * 0.74;
    float d = length(f - pos);
    float pick = step(0.88, rnd.x);
    float tw = 0.65 + 0.35 * sin(time * 1.5 + rnd.y * 30.0);
    dots += smoothstep(0.052, 0.015, d) * pick * tw * (0.28 - fl * 0.08);
  }
  return clamp(dots, 0.0, 0.35);
}

// Swirling relativistic turbulent plasma disk texture (Kepler differential shear)
float plasmaTexture(float radial, float angle, float time, float charge) {
  float speed = (0.72 + charge * 0.55) / pow(max(0.12, radial), 0.65);
  float twist = angle + log(max(0.06, radial)) * 5.2 - time * speed;
  float n1 = fbm(vec2(radial * 9.5 - time * 0.35, twist * 1.45));
  float n2 = fbm(vec2(radial * 18.0 + n1 * 2.2, twist * 2.8 - time * 0.6));
  float rings = 0.55 + 0.45 * sin(radial * 42.0 - time * 1.9 + n1 * 4.5);
  return clamp((n1 * 0.55 + n2 * 0.45) * rings * 1.45, 0.0, 1.35);
}

void main() {
  float minDim = max(1.0, min(uRes.x, uRes.y));
  // Center locked pixel-for-pixel with arena core (uCenterY is in GL Y-up space: 1.0 - centerYRatio)
  vec2 centerPx = vec2(uRes.x * 0.5, uRes.y * uCenterY);
  vec2 p = (gl_FragCoord.xy - centerPx) / minDim;

  // Pointer offset relative to center for interactive 3D disk tilt & lensing shimmer
  vec2 ptr = (uPointer - vec2(0.5, uCenterY)) * vec2(uRes.x / minDim, uRes.y / minDim);
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Supernova burst envelope (0..1.25s)
  float burstActive = step(0.0001, uBurstAge) * (1.0 - smoothstep(1.02, 1.28, uBurstAge));
  float bNorm = clamp(uBurstAge / 1.12, 0.0, 1.0);
  float bEase = 1.0 - pow(1.0 - bNorm, 3.0);
  float shockR = 0.12 + bEase * 1.05;
  float shockWidth = 0.028 + bNorm * 0.036;
  float shockRing = exp(-pow((r - shockR) / shockWidth, 2.0)) * (1.0 - bNorm) * burstActive;
  float shockRipple = sin((r - shockR) * 58.0) * shockRing * 0.018;
  float burstFlash = exp(-uBurstAge * 4.8) * step(0.0001, uBurstAge);

  // Dynamic event horizon shadow radius
  float rH = mix(0.154, 0.114, uExploded);
  rH -= uHoverCore * 0.016 * (1.0 - uExploded * 0.5);
  rH += burstFlash * 0.026 * sin(uBurstAge * 18.0);
  float charge = clamp(uHoverCore * 0.7 + uExploded * 0.55 + burstFlash * 1.4, 0.0, 1.8);

  // Subtle gravitational shockwave coordinate warp
  vec2 dir = p / max(0.0001, r);
  vec2 pw = p + dir * shockRipple;
  float rw = length(pw);

  // Tilt the 3D Gargantua disk plane gently with mouse position
  float diskTilt = -0.17 + clamp(ptr.x * 0.16, -0.14, 0.14);
  vec2 pr = rot2(diskTilt) * pw;
  float tiltSquash = mix(4.35, 3.65, uExploded) + clamp(ptr.y * 0.85, -0.55, 0.55);

  // --- 1. RELATIVISTIC EQUATORIAL ACCRETION DISK ---
  vec2 eqCoord = vec2(pr.x, pr.y * tiltSquash);
  float rEq = length(eqCoord);
  float aEq = atan(eqCoord.y, eqCoord.x);
  float eqOuter = mix(0.56, 0.74, uExploded) + burstFlash * 0.16;
  float eqInnerMask = smoothstep(rH * 0.96, rH * 1.14, rEq);
  float eqOuterMask = 1.0 - smoothstep(rH * 1.35, eqOuter, rEq);
  float eqPlasma = plasmaTexture(rEq, aEq, uTime, charge);
  float frontHalf = smoothstep(0.028, -0.026, pr.y);
  float eqIntensity = eqInnerMask * eqOuterMask * (0.45 + eqPlasma * 1.15);

  // --- 2. GRAVITATIONALLY-LENSED UPPER & LOWER ARCHES ---
  float archOuter = rH * mix(2.08, 2.34, uExploded) + burstFlash * 0.12;
  float upperMask = smoothstep(-0.02, 0.08, pr.y);
  float lowerMask = smoothstep(0.02, -0.08, pr.y);
  vec2 upP = vec2(pr.x * 0.94, max(0.0, pr.y) * 1.06);
  float rUp = length(upP);
  float upBand = smoothstep(rH * 0.98, rH * 1.08, rUp) * (1.0 - smoothstep(rH * 1.16, archOuter, rUp));
  float upPlasma = plasmaTexture(rUp * 1.15, atan(upP.y, upP.x) * 1.2, uTime * 1.08, charge);
  float upperArch = upperMask * upBand * (0.35 + upPlasma * 1.05);

  vec2 loP = vec2(pr.x * 0.96, min(0.0, pr.y) * 1.24);
  float rLo = length(loP);
  float loBand = smoothstep(rH * 0.98, rH * 1.06, rLo) * (1.0 - smoothstep(rH * 1.1, rH * mix(1.62, 1.82, uExploded), rLo));
  float loPlasma = plasmaTexture(rLo * 1.25, atan(loP.y, loP.x), uTime * 0.96, charge);
  float lowerArch = lowerMask * loBand * (0.28 + loPlasma * 0.85);

  // --- 3. RELATIVISTIC DOPPLER BEAMING ---
  float doppler = clamp(1.0 - pr.x * 1.18, 0.42, 1.72);

  // --- 4. RAZOR-THIN BLAZING PHOTON RING & CORONA ---
  float photonDist = rw - rH * 1.02;
  float photonCore = exp(-pow(photonDist / (0.0085 + burstFlash * 0.006), 2.0));
  float photonHalo = exp(-max(0.0, photonDist) * (11.0 - uExploded * 2.5 - burstFlash * 4.0)) * smoothstep(rH * 0.94, rH * 1.02, rw);
  float innerRimShimmer = 0.85 + 0.15 * sin(ang * 7.0 - uTime * (2.6 + uHoverCore * 3.5));

  // Event horizon shadow occlusion
  float shadowMask = smoothstep(rH - 0.005, rH + 0.007, rw);
  float frontBelt = eqIntensity * frontHalf * smoothstep(0.055, 0.0, abs(pr.y)) * (0.7 + 0.5 * eqPlasma);
  float visibleDisk = (eqIntensity * mix(shadowMask, 1.0, frontHalf) + (upperArch + lowerArch) * shadowMask);

  // Anamorphic horizontal plasma flare
  float anamorphic = exp(-abs(pr.y) * (24.0 - burstFlash * 12.0)) * exp(-abs(pr.x) * (2.6 - burstFlash * 1.3));
  float flareBoost = (0.14 + uHoverCore * 0.22 + burstFlash * 1.35) * anamorphic;

  vec3 acidLime = vec3(0.8235, 1.0, 0.1569);
  vec3 ivoryHot = vec3(1.0, 0.985, 0.93);
  vec3 moltenAmber = vec3(1.0, 0.64, 0.16);
  vec3 deepCopper = vec3(0.72, 0.24, 0.05);

  // =========================================================================
  // DARK MODE ("EVENT HORIZON")
  // =========================================================================
  vec3 darkVoid = vec3(0.0078, 0.0078, 0.0118); // #020203

  float einstein = (rH * rH * 1.52) / max(0.0025, rw * rw);
  vec2 starCoord = pw * (1.0 - clamp(einstein, 0.0, 0.92)) + ptr * 0.04;
  float einsteinRingMask = exp(-pow((rw - rH * 1.28) / 0.055, 2.0));
  vec3 stars = sampleStarfield(starCoord, uTime, einsteinRingMask, uAccentA, acidLime) * shadowMask;

  float dust = fbm(pw * 2.2 + vec2(uTime * 0.03, -uTime * 0.02)) * exp(-rw * 1.75) * shadowMask;
  vec3 darkCol = darkVoid + stars + mix(uAccentB, uAccentA, 0.5) * dust * (0.12 + uExploded * 0.08);

  float heat = clamp(visibleDisk * doppler, 0.0, 2.2);
  vec3 diskColor = mix(deepCopper, moltenAmber, smoothstep(0.05, 0.65, heat));
  diskColor = mix(diskColor, mix(uAccentA, acidLime, 0.25 + uHoverCore * 0.25), smoothstep(0.25, 1.1, heat) * 0.48);
  diskColor = mix(diskColor, ivoryHot, smoothstep(0.95, 1.85, heat));

  darkCol += diskColor * heat * 0.95;

  vec3 photonCol = mix(moltenAmber, mix(uAccentA, acidLime, 0.42), 0.48);
  darkCol += photonCol * photonHalo * (0.68 + charge * 0.32) * innerRimShimmer;
  darkCol += mix(ivoryHot, acidLime, 0.18 + uHoverCore * 0.2) * photonCore * (1.45 + burstFlash * 1.2);

  darkCol *= mix(0.03, 1.0, shadowMask);
  darkCol += mix(moltenAmber, ivoryHot, smoothstep(0.35, 1.15, frontBelt * doppler)) * frontBelt * 1.05;

  darkCol += mix(uAccentA, ivoryHot, 0.45) * flareBoost;
  darkCol += mix(acidLime, ivoryHot, 0.5) * shockRing * 1.35;
  darkCol += uAccentA * exp(-pow((r - shockR * 0.84) / (shockWidth * 1.6), 2.0)) * (1.0 - bNorm) * burstActive * 0.6;

  float edgeFade = 1.0 - smoothstep(0.68, 1.18, r * (1.0 - uExploded * 0.14));
  darkCol = mix(darkVoid, darkCol, clamp(edgeFade + shockRing, 0.0, 1.0));

  // =========================================================================
  // LIGHT MODE ("TOTAL SOLAR ECLIPSE" on pure Museum Vellum Ivory #F5F3EC)
  // =========================================================================
  vec3 vellum = vec3(0.9608, 0.9529, 0.9255); // #F5F3EC (pure outer field — ZERO gray fog!)
  vec3 eclipseCore = vec3(0.0275, 0.0275, 0.0353); // #070709
  vec3 vermilion = vec3(0.8510, 0.3059, 0.0); // #D94E00
  vec3 burntAmber = vec3(0.7059, 0.3255, 0.0353); // #B45309
  vec3 solarGold = vec3(0.9333, 0.6824, 0.0627); // rich molten solar gold
  vec3 deepInk = vec3(0.0392, 0.0392, 0.0431); // #0A0A0B

  // Hard radial containment so the outer viewport stays 100% crisp #F5F3EC museum paper
  float coronaBound = 1.0 - smoothstep(rH * 1.08, rH * mix(2.45, 2.85, uExploded) + burstFlash * 0.16, rw);
  float eqBound = 1.0 - smoothstep(rH * 1.4, eqOuter * 0.82, rEq);

  // Start from pure #F5F3EC vellum + ultra-crisp sparse dark-ink astronomical pinpoints
  float inkStars = sampleDaylightStars(starCoord, uTime) * smoothstep(rH * 1.28, rH * 1.7, rw);
  vec3 lightCol = mix(vellum, deepInk, inkStars);

  // Fiery warm solar corona & gravitationally lensed arches (strictly contained, high-chroma warm inks)
  float rayTex = fbm(vec2(ang * 5.0 + uTime * 0.15, log(max(0.08, rw)) * 4.0 - uTime * 0.2));
  float solarRays = smoothstep(0.38, 0.84, rayTex) * coronaBound * smoothstep(rH * 0.96, rH * 1.08, rw);
  float warmCorona = clamp((photonHalo * 1.05 + solarRays * 0.65) * coronaBound, 0.0, 1.0);
  float lensedFlame = clamp((upperArch * 1.1 + lowerArch * 0.9 + eqIntensity * eqBound * 0.82) * doppler * 0.72, 0.0, 1.0);

  // Layer warm molten gold -> scorched vermilion -> burnt amber onto crisp #F5F3EC (zero muddy gray!)
  vec3 warmGlow = mix(solarGold, vermilion, smoothstep(0.18, 0.78, warmCorona));
  lightCol = mix(lightCol, warmGlow, warmCorona * 0.68);

  vec3 flameCol = mix(burntAmber, vermilion, smoothstep(0.2, 0.75, lensedFlame));
  flameCol = mix(flameCol, mix(solarGold, uAccentA, 0.28), smoothstep(0.55, 1.0, lensedFlame) * 0.55);
  lightCol = mix(lightCol, flameCol, clamp(lensedFlame * 0.78, 0.0, 0.82));

  // Crisp solar-ember & deep-ink detonation shockwave rings (vanish completely once burst ends)
  lightCol = mix(lightCol, vermilion, clamp(shockRing * 0.78, 0.0, 0.78));
  float inkShock = exp(-pow((r - shockR * 0.94) / 0.0085, 2.0)) * (1.0 - bNorm) * burstActive;
  lightCol = mix(lightCol, deepInk, clamp(inkShock * 0.62, 0.0, 0.62));

  // Pitch-black eclipsed singularity moon core (#070709)
  lightCol = mix(eclipseCore, lightCol, shadowMask);

  // Blazing warm-gold / incandescent diamond-ring photon rim hugging the eclipsed silhouette
  vec3 rimGold = mix(vermilion, vec3(1.0, 0.94, 0.76), smoothstep(0.25, 0.85, photonCore));
  lightCol = mix(lightCol, rimGold, clamp(photonCore * (0.94 + burstFlash * 0.1), 0.0, 0.98));

  // Signature diamond-ring solar flare at upper-left limb of eclipse
  float diamondDist = length(pw - vec2(-rH * 0.72, rH * 0.7));
  float diamondFlare = exp(-diamondDist * 13.5) * (0.85 + burstFlash * 0.65);
  float diamondHalo = exp(-diamondDist * 4.8) * 0.38;
  lightCol = mix(lightCol, solarGold, clamp(diamondHalo * shadowMask, 0.0, 0.55));
  lightCol = mix(lightCol, vec3(1.0, 0.97, 0.88), clamp(diamondFlare, 0.0, 0.96));

  // Blazing golden-vermilion front equatorial belt crossing the eclipse equator
  float frontEmber = clamp(frontBelt * doppler * 0.72, 0.0, 0.85);
  lightCol = mix(lightCol, mix(vermilion, solarGold, smoothstep(0.25, 0.75, frontEmber)), frontEmber * 0.72);

  vec3 finalCol = mix(darkCol, lightCol, uLight);

  // Subtle 8-bit anti-banding dither
  float dither = (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  fragColor = vec4(clamp(finalCol + dither, 0.0, 1.0), 1.0);
}
`;

function computeAccentPair(rawHue: number, isLight: boolean): { a: Vec3; b: Vec3 } {
  const h1 = remapHue(rawHue);
  const h2 = remapHue(h1 + 48);
  const rgb1 = nonPurpleRgb(isLight ? 0.46 : 0.78, isLight ? 0.165 : 0.185, h1);
  const rgb2 = nonPurpleRgb(isLight ? 0.52 : 0.7, isLight ? 0.15 : 0.165, h2);
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

/** High-craft Canvas2D Gargantua Black Hole / Total Solar Eclipse fallback when WebGL2 is unavailable. */
function drawBlackHole2DFallback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  ptrX: number,
  ptrY: number,
  colA: Vec3,
  lightMix: number,
  explodedMix: number,
  hoverMix: number,
  burstAge: number,
  centerYRatio: number,
) {
  const isLight = lightMix > 0.5;
  const cx = w * 0.5;
  const cy = h * centerYRatio;
  const minD = Math.min(w, h);
  const rA = Math.round(colA[0] * 255);
  const gA = Math.round(colA[1] * 255);
  const bA = Math.round(colA[2] * 255);

  const bNorm = burstAge > 0 && burstAge < 1.25 ? Math.min(1, burstAge / 1.12) : -1;
  const rH = minD * (0.154 - explodedMix * 0.038 - hoverMix * 0.014);

  ctx.save();
  // Pure museum vellum ivory (#F5F3EC) in daylight, pure pitch space (#020203) in obsidian
  ctx.fillStyle = isLight ? '#F5F3EC' : '#020203';
  ctx.fillRect(0, 0, w, h);

  // Subtle stars
  for (let i = 0; i < (isLight ? 42 : 90); i++) {
    const a = i * 2.39996 + t * 0.012;
    const dist = minD * (0.22 + ((i * 73) % 100) / 115);
    const sx = cx + Math.cos(a) * dist * 1.4;
    const sy = cy + Math.sin(a) * dist;
    const tw = 0.35 + 0.65 * Math.sin(t * 2 + i);
    ctx.fillStyle = isLight
      ? `rgba(10,10,11,${(tw * 0.22).toFixed(3)})`
      : `rgba(245,243,236,${(tw * 0.55).toFixed(3)})`;
    ctx.fillRect(sx, sy, i % 6 === 0 ? 2 : 1.2, i % 6 === 0 ? 2 : 1.2);
  }

  // Tightly contained solar corona (daylight) / gravitational plasma corona (obsidian)
  const coronaR = rH * (isLight ? 2.45 + explodedMix * 0.35 : 2.6 + explodedMix * 0.8);
  const corona = ctx.createRadialGradient(cx, cy, rH * 0.92, cx, cy, coronaR);
  if (isLight) {
    corona.addColorStop(0, 'rgba(217,78,0,0.72)');
    corona.addColorStop(0.28, 'rgba(234,179,8,0.44)');
    corona.addColorStop(0.65, 'rgba(180,83,9,0.14)');
    corona.addColorStop(1, 'rgba(245,243,236,0)');
  } else {
    corona.addColorStop(0, 'rgba(255,245,220,0.85)');
    corona.addColorStop(0.18, 'rgba(255,168,42,0.58)');
    corona.addColorStop(0.46, `rgba(${rA},${gA},${bA},0.28)`);
    corona.addColorStop(1, 'rgba(2,2,3,0)');
  }
  ctx.fillStyle = corona;
  ctx.beginPath();
  ctx.arc(cx, cy, coronaR, 0, Math.PI * 2);
  ctx.fill();

  const tilt = -0.17 + (ptrX - 0.5) * 0.14;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  for (let pass = 0; pass < 3; pass++) {
    const ar = rH * (1.15 + pass * 0.2);
    ctx.strokeStyle = isLight
      ? pass === 0
        ? 'rgba(217,78,0,0.72)'
        : `rgba(180,83,9,${(0.45 - pass * 0.12).toFixed(3)})`
      : pass === 0
        ? 'rgba(255,236,192,0.72)'
        : `rgba(${rA},${gA},${bA},${(0.48 - pass * 0.12).toFixed(3)})`;
    ctx.lineWidth = (4.5 - pass * 1.1) * (1 + explodedMix * 0.25);
    ctx.beginPath();
    ctx.arc(0, 0, ar, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, ar * 0.9, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
  }

  const diskRx = rH * (2.6 + explodedMix * 0.95);
  const diskRy = rH * (0.58 + (ptrY - centerYRatio) * 0.12);
  ctx.strokeStyle = isLight ? 'rgba(217,78,0,0.52)' : 'rgba(255,172,54,0.58)';
  ctx.lineWidth = rH * 0.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, diskRx * 0.8, Math.max(8, diskRy), 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  // Pitch-black eclipse moon / event horizon shadow sphere
  ctx.fillStyle = isLight ? '#070709' : '#010102';
  ctx.beginPath();
  ctx.arc(0, 0, rH, 0, Math.PI * 2);
  ctx.fill();

  // Blazing photon ring
  ctx.strokeStyle = isLight ? '#F59E0B' : '#D2FF28';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, rH * 1.02, 0, Math.PI * 2);
  ctx.stroke();

  // Front equatorial plasma belt
  const belt = ctx.createLinearGradient(-diskRx, 0, diskRx, 0);
  belt.addColorStop(0, 'rgba(255,180,60,0)');
  belt.addColorStop(0.3, isLight ? 'rgba(217,78,0,0.88)' : 'rgba(255,244,214,0.94)');
  belt.addColorStop(0.58, isLight ? 'rgba(234,179,8,0.85)' : `rgba(${rA},${gA},${bA},0.85)`);
  belt.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.strokeStyle = belt;
  ctx.lineWidth = Math.max(4, rH * 0.13);
  ctx.beginPath();
  ctx.ellipse(0, 0, diskRx * 0.82, Math.max(7, diskRy * 0.72), 0, 0.05, Math.PI - 0.05);
  ctx.stroke();
  ctx.restore();

  // Supernova detonation shockwave ring
  if (bNorm >= 0) {
    const ease = 1 - Math.pow(1 - bNorm, 3);
    const sr = rH + ease * minD * 0.56;
    ctx.strokeStyle = isLight
      ? `rgba(217,78,0,${((1 - bNorm) * 0.85).toFixed(3)})`
      : `rgba(210,255,40,${((1 - bNorm) * 0.92).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, (1 - bNorm) * 5.5);
    ctx.beginPath();
    ctx.arc(cx, cy, sr, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Full-bleed 60fps Interstellar Gargantua WebGL2 Black Hole Singularity (Event Horizon)
 * and Total Solar Eclipse on pure museum Vellum Ivory #F5F3EC (Daylight), complete with
 * gravitational Einstein-ring light bending, relativistic lensed accretion disk, supernova
 * detonation shockwaves, synchronized centerYRatio, Canvas2D fallback, reduced-motion static
 * mode, and visibility/viewport auto-pause.
 */
export function HeroCanvas({
  accentHue = 112,
  theme: themeProp,
  exploded = false,
  burstSeq = 0,
  hoverCore = false,
  centerYRatio = 0.47,
  className = '',
}: HeroCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inViewRef, inView] = useInView<HTMLDivElement>({ margin: '240px' });
  const reduced = useReducedMotion();
  const storeTheme = useDeck((s) => s.vault.prefs.theme);
  const theme: ArtTheme = themeProp ?? storeTheme ?? 'obsidian';

  const prevBurstRef = useRef(burstSeq);
  const prevExplodedRef = useRef(exploded);

  const targetRef = useRef({
    accentA: computeAccentPair(accentHue, theme === 'daylight').a,
    accentB: computeAccentPair(accentHue, theme === 'daylight').b,
    light: theme === 'daylight' ? 1 : 0,
    exploded: exploded ? 1 : 0,
    hoverCore: hoverCore ? 1 : 0,
    centerYRatio,
    burstAge: 0,
    ptrX: 0.5,
    ptrY: centerYRatio,
    reduced,
    inView,
  });

  const renderOnceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const pair = computeAccentPair(accentHue, theme === 'daylight');
    targetRef.current.accentA = pair.a;
    targetRef.current.accentB = pair.b;
    targetRef.current.light = theme === 'daylight' ? 1 : 0;
    targetRef.current.exploded = exploded ? 1 : 0;
    targetRef.current.hoverCore = hoverCore ? 1 : 0;
    targetRef.current.centerYRatio = centerYRatio;
    targetRef.current.reduced = reduced;
    targetRef.current.inView = inView;

    if (burstSeq !== prevBurstRef.current || (exploded && !prevExplodedRef.current)) {
      targetRef.current.burstAge = 0.001;
    }
    prevBurstRef.current = burstSeq;
    prevExplodedRef.current = exploded;

    if (reduced) renderOnceRef.current?.();
  }, [accentHue, theme, exploded, burstSeq, hoverCore, centerYRatio, reduced, inView]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    let prog: WebGLProgram | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let uRes: WebGLUniformLocation | null = null;
    let uTime: WebGLUniformLocation | null = null;
    let uPointer: WebGLUniformLocation | null = null;
    let uAccentA: WebGLUniformLocation | null = null;
    let uAccentB: WebGLUniformLocation | null = null;
    let uLight: WebGLUniformLocation | null = null;
    let uExploded: WebGLUniformLocation | null = null;
    let uHoverCore: WebGLUniformLocation | null = null;
    let uBurstAge: WebGLUniformLocation | null = null;
    let uCenterY: WebGLUniformLocation | null = null;

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
            uExploded = gl.getUniformLocation(prog, 'uExploded');
            uHoverCore = gl.getUniformLocation(prog, 'uHoverCore');
            uBurstAge = gl.getUniformLocation(prog, 'uBurstAge');
            uCenterY = gl.getUniformLocation(prog, 'uCenterY');
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

    const curA: Vec3 = [...targetRef.current.accentA];
    const curB: Vec3 = [...targetRef.current.accentB];
    let curLight = targetRef.current.light;
    let curExploded = targetRef.current.exploded;
    let curHover = targetRef.current.hoverCore;
    let curCenterYRatio = targetRef.current.centerYRatio;
    let curPtrX = targetRef.current.ptrX;
    let curPtrY = targetRef.current.ptrY;
    let elapsed = 0;

    const drawFrame = (timeSec: number) => {
      const bAge = targetRef.current.burstAge;
      if (gl && prog && !gl.isContextLost()) {
        gl.useProgram(prog);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, timeSec);
        gl.uniform2f(uPointer, curPtrX, 1 - curPtrY);
        gl.uniform3f(uAccentA, curA[0], curA[1], curA[2]);
        gl.uniform3f(uAccentB, curB[0], curB[1], curB[2]);
        gl.uniform1f(uLight, curLight);
        gl.uniform1f(uExploded, curExploded);
        gl.uniform1f(uHoverCore, curHover);
        gl.uniform1f(uBurstAge, bAge);
        gl.uniform1f(uCenterY, 1 - curCenterYRatio);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else if (ctx2d) {
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawBlackHole2DFallback(
          ctx2d,
          cssW,
          cssH,
          timeSec,
          curPtrX,
          curPtrY,
          curA,
          curLight,
          curExploded,
          curHover,
          bAge,
          curCenterYRatio,
        );
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
      curExploded = tgt.exploded;
      curHover = tgt.hoverCore;
      curCenterYRatio = tgt.centerYRatio;
      tgt.burstAge = 0;
      syncSize();
      drawFrame(3.2);
    };

    drawFrame(targetRef.current.reduced ? 3.2 : 0);

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
      targetRef.current.ptrX = 0.5;
      targetRef.current.ptrY = targetRef.current.centerYRatio;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        syncSize();
        if (targetRef.current.reduced) drawFrame(3.2);
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
      if (tgt.burstAge > 0) {
        tgt.burstAge += dt;
        if (tgt.burstAge > 1.32) tgt.burstAge = 0;
      }

      const cAlpha = 1 - Math.exp(-dt * 6.5);
      for (let i = 0; i < 3; i++) {
        curA[i] = curA[i]! + (tgt.accentA[i]! - curA[i]!) * cAlpha;
        curB[i] = curB[i]! + (tgt.accentB[i]! - curB[i]!) * cAlpha;
      }
      // Crisp quick transition on theme & vertical center alignment
      curLight += (tgt.light - curLight) * (1 - Math.exp(-dt * 12));
      curCenterYRatio += (tgt.centerYRatio - curCenterYRatio) * (1 - Math.exp(-dt * 14));
      curExploded += (tgt.exploded - curExploded) * (1 - Math.exp(-dt * 5.2));
      curHover += (tgt.hoverCore - curHover) * (1 - Math.exp(-dt * 9.0));

      const pAlpha = 1 - Math.exp(-dt * 5.2);
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
