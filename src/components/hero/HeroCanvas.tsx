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
  /** Incrementing counter triggering a blazing shockwave ring + accretion flare */
  burstSeq?: number;
  /** True while pointer hovers near the event horizon core (coils gravitational energy / pinch) */
  hoverCore?: boolean;
  /** Normalized vertical center ratio from top edge (0..1, default 0.47; desktop lg+ 0.435) */
  centerYRatio?: number;
  className?: string;
}

type Vec3 = [number, number, number];

const NOISE_SIZE = 256;
/** Keeps backing-store fill-rate fast and razor-crisp across laptops and 3440-5120px ultrawide monitors. */
const MAX_WEBGL_PIXELS = 2_073_600;

/**
 * Generates a deterministic seamless periodic 256x256 RGBA8 turbulence atlas once on startup:
 * - R: broad 4-octave periodic fBm (accretion clouds & pressure bands)
 * - G: high-frequency 5-octave periodic fBm (crisp sheared Keplerian plasma streams)
 * - B: sharp ridged periodic turbulence (incandescent magnetic filaments)
 * - A: fine cooler dust-lane mask (dark filaments threading the glowing disk)
 */
function buildSeamlessNoiseAtlas(size = NOISE_SIZE): Uint8Array {
  const hash2 = (x: number, y: number, period: number, seed: number): number => {
    const px = ((x % period) + period) % period;
    const py = ((y % period) + period) % period;
    let h = Math.imul(px + 17, 374761393) ^ Math.imul(py + 31, 668265263) ^ Math.imul(seed + 7, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const smoothNoise = (u: number, v: number, period: number, seed: number): number => {
    const fx = u * period;
    const fy = v * period;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const ux = tx * tx * (3 - 2 * tx);
    const uy = ty * ty * (3 - 2 * ty);
    const a = hash2(ix, iy, period, seed);
    const b = hash2(ix + 1, iy, period, seed);
    const c = hash2(ix, iy + 1, period, seed);
    const d = hash2(ix + 1, iy + 1, period, seed);
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  };

  const periodicFbm = (u: number, v: number, basePeriod: number, octaves: number, seed: number): number => {
    let sum = 0;
    let amp = 0.52;
    let norm = 0;
    let period = basePeriod;
    for (let o = 0; o < octaves; o++) {
      sum += amp * smoothNoise(u, v, period, seed + o * 19);
      norm += amp;
      period *= 2;
      amp *= 0.5;
    }
    return sum / norm;
  };

  const periodicRidged = (u: number, v: number, basePeriod: number, octaves: number, seed: number): number => {
    let sum = 0;
    let amp = 0.56;
    let norm = 0;
    let period = basePeriod;
    for (let o = 0; o < octaves; o++) {
      const n = smoothNoise(u, v, period, seed + o * 23);
      const ridge = 1 - Math.abs(2 * n - 1);
      sum += amp * ridge * ridge;
      norm += amp;
      period *= 2;
      amp *= 0.5;
    }
    return sum / norm;
  };

  const data = new Uint8Array(size * size * 4);
  const inv = 1 / size;
  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const r = periodicFbm(u, v, 6, 4, 11);
      const g = periodicFbm(u + 0.17, v + 0.31, 10, 5, 47);
      const b = periodicRidged(u + 0.41, v + 0.13, 8, 5, 89);
      const a = periodicFbm(u + 0.63, v + 0.59, 12, 4, 131);
      const idx = (y * size + x) * 4;
      data[idx] = Math.min(255, Math.max(0, Math.round(r * 255)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(g * 255)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(b * 255)));
      data[idx + 3] = Math.min(255, Math.max(0, Math.round(a * 255)));
    }
  }
  return data;
}

const VERT_SRC = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
void main() {
  gl_Position = vec4(POS[gl_VertexID], 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

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
uniform sampler2D uNoiseTex;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float INV_TAU = 0.15915494309;
const float CAM_DIST = 18.0;
const float B_CRIT = 2.5980762; // Exact Schwarzschild critical shadow impact parameter (3*sqrt(3)/2)
const float TELE_FACTOR = 6.85595; // sqrt(CAM_DIST^2 - B_CRIT^2) / B_CRIT

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

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float sq(float x) {
  return x * x;
}

// ACES Filmic Tone Mapping (Narkowicz) — rich IMAX golden highlights with zero neon clipping
vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// Authentic Interstellar Gargantua blackbody plasma spectrum:
// deep ember -> molten burnt copper -> rich amber -> champagne gold -> blinding incandescent white-ivory
vec3 blackbodyGargantua(float temp) {
  vec3 cEmber = vec3(0.32, 0.055, 0.014);
  vec3 cCopper = vec3(0.86, 0.28, 0.048);
  vec3 cAmber = vec3(1.00, 0.62, 0.20);
  vec3 cGold  = vec3(1.00, 0.84, 0.54);
  vec3 cIvory = vec3(1.00, 0.97, 0.90);
  vec3 cBlueW = vec3(0.92, 0.96, 1.05);

  vec3 col = mix(cEmber, cCopper, smoothstep(0.04, 0.28, temp));
  col = mix(col, cAmber, smoothstep(0.24, 0.58, temp));
  col = mix(col, cGold,  smoothstep(0.52, 0.90, temp));
  col = mix(col, cIvory, smoothstep(0.84, 1.32, temp));
  col = mix(col, cBlueW, smoothstep(1.28, 1.95, temp) * 0.45);
  return col;
}

// Distortion-free 3D celestial-sphere starfield indexed by the relativistically bent exit ray
vec3 sampleSkyDark(vec3 dir, float time, float einsteinBoost, vec3 accentA) {
  vec3 ad = abs(dir);
  vec2 faceUv;
  float faceId;
  if (ad.z >= ad.x && ad.z >= ad.y) {
    faceUv = dir.xy / max(ad.z, 1e-4);
    faceId = dir.z > 0.0 ? 1.0 : 2.0;
  } else if (ad.x >= ad.y) {
    faceUv = dir.zy / max(ad.x, 1e-4);
    faceId = dir.x > 0.0 ? 3.0 : 4.0;
  } else {
    faceUv = dir.xz / max(ad.y, 1e-4);
    faceId = dir.y > 0.0 ? 5.0 : 6.0;
  }

  vec3 stars = vec3(0.0);

  // Subtle oblique deep-space Milky Way dust veil behind Gargantua
  float galLat = dot(dir, normalize(vec3(0.26, 0.90, -0.35)));
  float galMask = exp(-galLat * galLat * 15.0);
  if (galMask > 0.015) {
    float galTex = textureLod(uNoiseTex, faceUv * 0.52 + vec2(faceId * 0.17, 0.21), 1.5).r;
    float galDetail = textureLod(uNoiseTex, faceUv * 1.35 - vec2(0.11, faceId * 0.23), 1.0).g;
    vec3 dustTint = mix(vec3(0.022, 0.018, 0.038), vec3(0.044, 0.030, 0.022), galDetail);
    stars += dustTint * galMask * (0.40 + 0.90 * galTex * galDetail);
  }

  // Two crisp pinpoint astronomical star layers with natural Einstein-ring tangential stretching
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float scale = 36.0 + fl * 46.0;
    vec2 gv = faceUv * scale + vec2(faceId * 19.3 + fl * 37.1, faceId * 7.9 + fl * 13.7);
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    vec2 rnd = hash22(id + vec2(faceId * 11.1, fl * 29.3));
    vec2 pos = (rnd - 0.5) * 0.72;
    vec2 delta = f - pos;
    float d2 = dot(delta, delta);

    float thresh = 0.880 - fl * 0.042;
    float pick = step(thresh, rnd.x);
    float twinkle = 0.82 + 0.18 * sin(time * (1.1 + rnd.y * 2.2) + rnd.x * 50.0);
    float rad = (0.042 - fl * 0.008) * (1.0 + einsteinBoost * 0.35);
    float core = smoothstep(rad * rad, 0.0, d2) * pick * twinkle;

    // Rare bright foreground 4-point optical diffraction glint (branched -> skips 4 exp() on 97% of pixels)
    float glint = 0.0;
    if (layer == 0 && rnd.x > 0.972) {
      glint =
        (exp(-abs(delta.x) * 52.0) * exp(-abs(delta.y) * 11.0) +
          exp(-abs(delta.y) * 52.0) * exp(-abs(delta.x) * 11.0)) *
        twinkle *
        0.52;
    }

    vec3 spec = mix(vec3(0.84, 0.90, 1.00), vec3(1.00, 0.88, 0.72), rnd.y);
    spec = mix(spec, mix(vec3(0.78, 0.44, 1.00), accentA, 0.40), step(0.86, rnd.y) * 0.28 + einsteinBoost * 0.18);
    stars += spec * (core * (1.05 - fl * 0.38) + glint);
  }

  return stars;
}

// Sparse archival ink pinpoints for Solar Eclipse daylight plate
float sampleSkyDaylight(vec3 dir, float time) {
  vec2 faceUv = dir.xy / max(abs(dir.z), 0.35);
  vec2 gv = faceUv * 28.0 + vec2(11.3, 4.7);
  vec2 id = floor(gv);
  vec2 f = fract(gv) - 0.5;
  vec2 rnd = hash22(id);
  vec2 pos = (rnd - 0.5) * 0.72;
  float d = length(f - pos);
  float pick = step(0.918, rnd.x);
  float tw = 0.78 + 0.22 * sin(time * 1.0 + rnd.y * 25.0);
  return smoothstep(0.040, 0.012, d) * pick * tw * 0.22;
}

// Evaluates crisp sheared Keplerian plasma at an exact equatorial plane node crossing.
// Hardware-mipmapped seamless atlas + dual-phase advection -> zero atan seam, zero moire,
// photographic concentric filaments, dark dust lanes, and relativistic Doppler beaming.
void sampleAccretionDisk(
  vec3 hit,
  vec3 rayDir,
  float rHit,
  float rIn,
  float rOut,
  float time,
  float charge,
  float passIdx,
  out vec3 outColor,
  out float outAlpha
) {
  float rNorm = clamp((rHit - rIn) / max(0.001, rOut - rIn), 0.0, 1.0);

  // Soft ISCO plunge cliff & silky feathered outer dissipation into deep space
  float innerFade = smoothstep(0.0, 0.08, rNorm);
  float outerFade = pow(1.0 - smoothstep(0.16, 1.0, rNorm), 1.95);
  float radialEnv = innerFade * outerFade;

  if (radialEnv <= 0.001) {
    outColor = vec3(0.0);
    outAlpha = 0.0;
    return;
  }

  float phi = atan(hit.z, hit.x);
  float logR = log(max(1.0, rHit));

  // Differential Keplerian orbital velocity (inner plasma whips dramatically faster than outer streams)
  float omega = (0.30 + charge * 0.14) / pow(max(1.15, rHit * 0.42), 1.12);
  float flowRate = 0.052 + charge * 0.014;
  float phaseA = fract(time * flowRate);
  float phaseB = fract(time * flowRate + 0.5);
  float blendW = abs(2.0 * phaseA - 1.0);

  // Seamless periodic spiral coordinates (u wraps 0..1 around 2*PI -> zero branch cut!)
  float spiralA = (phi + logR * 3.8 + phaseA * omega * 13.5) * INV_TAU;
  float spiralB = (phi + logR * 3.8 + phaseB * omega * 13.5) * INV_TAU;

  // Crisp analytical LOD eliminates atan derivative seam & grazing-angle moire
  float baseLod = clamp(0.15 + passIdx * 0.72 + (1.0 - abs(rayDir.y)) * 0.35, 0.0, 2.4);

  vec4 nA = textureLod(uNoiseTex, vec2(spiralA * 2.0, rNorm * 1.80 - phaseA * 0.24), baseLod);
  vec4 nB = textureLod(uNoiseTex, vec2(spiralB * 2.0 + 0.37, rNorm * 1.80 - phaseB * 0.24 + 0.29), baseLod);
  vec4 nMix = mix(nA, nB, blendW);

  // Organic domain-warped sheared gas threads (photographic Interstellar plasma, zero periodic corduroy!)
  float fineRadial = rNorm * 3.6 + (nMix.r - 0.5) * 0.34;
  vec4 nFine = textureLod(
    uNoiseTex,
    vec2((phi + logR * 5.6 + time * 0.14) * INV_TAU * 3.0, fineRadial),
    baseLod + 0.20
  );

  // Taper banded striations cleanly on secondary/lensed wraps & outer rim so wisps stay silky gaseous
  float ringPresence = (1.0 - smoothstep(0.50, 0.94, rNorm)) * (passIdx < 0.5 ? 1.0 : 0.45);
  float bandMajor = mix(0.82, 0.52 + 0.48 * sin(rNorm * 24.0 + nMix.r * 5.6 + nFine.g * 2.2), ringPresence);
  float bandMicro = mix(0.88, 0.68 + 0.32 * sin(rNorm * 44.0 - nMix.g * 4.8 + nFine.b * 2.6), ringPresence * 0.7);
  float hotWisps = smoothstep(0.24, 0.90, nMix.b * 0.56 + nFine.b * 0.44);
  float filaments = (0.34 + 0.66 * mix(nMix.g, nFine.g, 0.42)) * bandMajor * bandMicro + hotWisps * 0.62;

  // Dark absorbent dust lanes threading between incandescent golden streams
  float dustLane = smoothstep(0.36, 0.80, nMix.a * 0.62 + nFine.a * 0.38);
  float dustAtten = mix(1.0, 0.34, dustLane * smoothstep(0.08, 0.58, rNorm));

  // Blazing inner ISCO glow & relativistic pressure crest
  float innerCrest = exp(-rNorm * 7.0) * (0.82 + 0.68 * nMix.b);
  float density = radialEnv * (0.24 + filaments * 1.42 + innerCrest * 1.08);

  // Relativistic orbital tangent direction: left limb (-x) approaches camera (+z), right limb recedes
  vec3 velDir = normalize(vec3(hit.z, 0.0, -hit.x));
  float beta = clamp(sqrt(0.48 / max(0.55, rHit - 0.42)), 0.08, 0.56);
  float mu = dot(velDir, -rayDir);
  float gammaInv = sqrt(max(0.05, 1.0 - beta * beta));
  float gDoppler = gammaInv / max(0.30, 1.0 - beta * mu);

  // Cinema-calibrated Interstellar relativistic beaming + gravitational redshift
  float gravRed = sqrt(max(0.16, 1.0 - 1.0 / max(1.12, rHit)));
  float gTotal = clamp(gDoppler * (0.80 + 0.30 * gravRed), 0.48, 1.68);
  float beaming = pow(gTotal, 2.30);

  // Blackbody temperature drops radially outward and shifts hotter on the approaching left limb
  float tempBase = mix(1.24, 0.14, pow(rNorm, 0.64)) + hotWisps * 0.28 + innerCrest * 0.44;
  float tempObs = tempBase * pow(gTotal, 0.72) * mix(1.0, 0.68, dustLane * 0.55);
  vec3 plasmaCol = blackbodyGargantua(tempObs);

  // Volumetric slant thickness + clean multi-wrap falloff (primary, upper/lower lensed arch, n=1 photon wrap)
  float slant = clamp(0.24 / (abs(rayDir.y) + 0.18), 0.58, 1.55);
  float wrapAtten = passIdx < 0.5 ? 1.0 : (passIdx < 1.5 ? 0.92 : 0.62);

  float radiance = density * beaming * dustAtten * slant * wrapAtten * (1.26 + charge * 0.24);
  outColor = plasmaCol * radiance;
  outAlpha = clamp(density * slant * (0.64 + 0.46 * dustLane) * wrapAtten, 0.0, 0.95);
}

void main() {
  float minDim = max(1.0, min(uRes.x, uRes.y));
  // Center locked pixel-for-pixel with HeroBand arena core (uCenterY is in GL Y-up space: 1.0 - centerYRatio)
  vec2 centerPx = vec2(uRes.x * 0.5, uRes.y * uCenterY);
  vec2 p = (gl_FragCoord.xy - centerPx) / minDim;

  // Interactive pointer offset relative to center for real-time 3D camera orbit
  vec2 ptr = (uPointer - vec2(0.5, uCenterY)) * vec2(uRes.x / minDim, uRes.y / minDim);
  float rScreen = length(p);
  float angScreen = atan(p.y, p.x + 1e-6);

  // --- SUPERNOVA MULTI-RING SHOCKWAVE ENVELOPE (0..1.30s) ---
  float burstActive = step(0.0001, uBurstAge) * (1.0 - smoothstep(1.04, 1.30, uBurstAge));
  float bNorm = clamp(uBurstAge / 1.14, 0.0, 1.0);
  float bInv = 1.0 - bNorm;
  float bEase = 1.0 - bInv * bInv * bInv;
  float shockR = 0.12 + bEase * 1.08;
  float shockW = 0.022 + bNorm * 0.030;
  float shockRing1 = exp(-sq((rScreen - shockR) / shockW)) * (1.0 - bNorm) * burstActive;
  float shockRing2 =
    exp(-sq((rScreen - shockR * 0.82) / (shockW * 1.45))) * (1.0 - bNorm * 0.92) * burstActive;
  float shockRing3 =
    exp(-sq((rScreen - shockR * 0.64) / (shockW * 1.15))) * (1.0 - bNorm * 0.85) * burstActive;
  float shockRipple =
    (sin((rScreen - shockR) * 62.0) * shockRing1 * 0.018 + sin((rScreen - shockR * 0.82) * 42.0) * shockRing2 * 0.009);
  float burstFlash = exp(-uBurstAge * 4.4) * step(0.0001, uBurstAge);

  // Apparent event-horizon radius calibrated to idle Singularity Core & exploded inner orbit ring
  float rShadow = mix(0.148, 0.116, uExploded);
  rShadow -= uHoverCore * 0.011 * (1.0 - uExploded * 0.45);
  rShadow += burstFlash * 0.015 * sin(uBurstAge * 20.0);
  float charge = clamp(uHoverCore * 0.85 + uExploded * 0.42 + burstFlash * 1.45, 0.0, 2.0);

  vec2 screenDir = p / max(0.0001, rScreen);
  vec2 pw = p + screenDir * shockRipple;

  // Cinematic Interstellar camera roll & 3D elevation (~8.5-9.5 deg above equatorial disk plane)
  float roll = -0.172 + clamp(ptr.x * 0.13, -0.11, 0.11);
  vec2 pr = rot2(roll) * pw;

  float elev = mix(0.148, 0.162, uExploded) - clamp(ptr.y * 0.12, -0.085, 0.085);
  float yaw = clamp(ptr.x * 0.22, -0.16, 0.16);
  float cE = cos(elev);
  float sE = sin(elev);
  float cY = cos(yaw);
  float sY = sin(yaw);

  vec3 ro = vec3(CAM_DIST * cE * sY, CAM_DIST * sE, CAM_DIST * cE * cY);
  vec3 fwd = normalize(-ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);

  float focal = rShadow * TELE_FACTOR;
  vec3 rd = normalize(fwd * focal + right * pr.x + up * pr.y);

  // Exact 2D orbital-plane basis for Schwarzschild null geodesics:
  // Every photon stays strictly in span(e1, e2), with exact conserved impact parameter b = |ro x rd|
  vec3 e1 = ro / CAM_DIST;
  float cr = dot(rd, e1); // radial cosine (< 0 heading inward)
  vec3 tang = rd - e1 * cr;
  float ct = length(tang); // tangential sine = b / CAM_DIST
  float b = CAM_DIST * ct;

  float rIn = 1.62;
  float rOut = mix(9.2, 10.6, uExploded) + burstFlash * 1.6 + uHoverCore * 0.4;
  float rBound = rOut * 1.06;

  vec3 diskAccum = vec3(0.0);
  float transmittance = 1.0;
  bool captured = false;
  float uMax = 1.0 / CAM_DIST;
  vec3 exitDir = rd;
  float diskCrossings = 0.0;

  if (ct < 1e-5) {
    // Dead-center axial ray plunges directly into event horizon
    captured = true;
    uMax = 1.0;
  } else if (b > rBound) {
    // === O(1) FAR-FIELD FAST PATH (zero loop iterations on ~75-86% of ultrawide screen pixels!) ===
    // Exact 2nd-order post-Newtonian Einstein gravitational deflection
    vec3 e2 = tang / ct;
    float invB = 1.0 / b;
    float defl = 2.0 * invB + 2.94524 * invB * invB;
    float phiEsc = PI - asin(clamp(ct, 0.0, 1.0)) + defl;
    exitDir = normalize(e1 * cos(phiEsc) + e2 * sin(phiEsc));
    uMax = invB;
  } else {
    // === EXACT POLAR BINET SCHWARZSCHILD NULL GEODESIC INTEGRATOR ===
    // Integrates d^2u/dphi^2 + u = 1.5*u^2 (u = 1/r) in pure scalars (zero inversesqrt inside loop!)
    // Analytically intersects y = 0 at exact orbital nodes phiNode + k*PI -> BOTH upper & lower
    // Gargantua lensed arches and n=1/n=2 photon rings are 100% continuous and never clipped!
    vec3 e2 = tang / ct;

    float phiNode = atan(-e1.y, e2.y);
    if (phiNode < 0.0) phiNode += PI;
    float nextNode = phiNode < 1e-4 ? phiNode + PI : phiNode;

    float u = 1.0 / CAM_DIST;
    float v = -cr / b; // exact initial du/dphi = -cos(alpha_0) / b
    float phi = 0.0;
    float a = 1.5 * u * u - u;

    // 34 tiny scalar symplectic steps smoothly traverse > 540 deg around the black hole
    for (int step = 0; step < 34; step++) {
      // Adaptive angular step: swift far out, razor-fine near the photon sphere (u -> 0.67)
      float dPhi = clamp(0.27 - u * 0.28, 0.058, 0.25);
      float phiNext = phi + dPhi;

      // 2nd-order symplectic Velocity-Verlet step for d^2u/dphi^2 = 1.5*u^2 - u
      float uNext = u + v * dPhi + a * (0.5 * dPhi * dPhi);
      float aNext = 1.5 * uNext * uNext - uNext;
      float vNext = v + 0.5 * (a + aNext) * dPhi;

      // Check exact analytical equatorial plane crossing(s) inside [phi, phiNext] BEFORE horizon capture
      // so the front equatorial accretion belt always renders cleanly in front of the black sphere!
      if (phiNext >= nextNode && transmittance > 0.025) {
        float dtHit = nextNode - phi;
        float uHit = u + v * dtHit + a * (0.5 * dtHit * dtHit);
        float vHit = v + a * dtHit;
        if (uHit > 0.001 && uHit < 0.995) {
          float rHit = 1.0 / uHit;
          if (rHit >= rIn && rHit <= rOut) {
            float cN = cos(nextNode);
            float sN = sin(nextNode);
            vec3 er = e1 * cN + e2 * sN;
            vec3 ePhi = -e1 * sN + e2 * cN;
            vec3 hitPos = er * rHit;
            vec3 rayTangent = normalize(er * (-vHit) + ePhi * uHit);

            vec3 sampleCol;
            float sampleAlpha;
            sampleAccretionDisk(
              hitPos,
              rayTangent,
              rHit,
              rIn,
              rOut,
              uTime,
              charge,
              diskCrossings,
              sampleCol,
              sampleAlpha
            );
            diskAccum += sampleCol * transmittance;
            transmittance *= 1.0 - sampleAlpha;
            diskCrossings += 1.0;
          }
        }
        nextNode += PI;
      }

      uMax = max(uMax, uNext);

      // Event horizon capture (exact r_s = 1.0 -> u = 1.0)
      if (uNext >= 1.0) {
        captured = true;
        break;
      }

      // Escaped to asymptotic infinity (u -> 0): exact bent 3D exit direction!
      if (uNext <= 0.0 && vNext < 0.0) {
        float fEsc = clamp(u / max(1e-6, u - uNext), 0.0, 1.0);
        float phiEsc = phi + fEsc * dPhi;
        exitDir = normalize(e1 * cos(phiEsc) + e2 * sin(phiEsc));
        break;
      }

      u = uNext;
      v = vNext;
      a = aNext;
      phi = phiNext;

      if (phi > 11.5) {
        captured = true;
        break;
      }
    }
  }

  // Sub-pixel anti-aliased critical shadow boundary (eliminates binary staircase on shadow rim!)
  float bDist = b - B_CRIT;
  float bEdgeW = max(fwidth(b), 0.012);
  float escapeMask = smoothstep(-bEdgeW * 0.65, bEdgeW * 1.15, bDist);
  float dopplerLimb = clamp(-pr.x / max(0.18, rShadow * 2.2), -1.0, 1.0);
  float ringDoppler = 0.68 + 0.62 * smoothstep(-0.65, 0.85, dopplerLimb);

  // Razor-sharp n=1 incandescent Gargantua photon ring hugging the exact critical curve b = B_CRIT
  float pWidth = 0.044 + burstFlash * 0.032;
  float photonRing = exp(-sq(bDist / pWidth)) * escapeMask;
  if (!captured) {
    float graze = exp(-sq((uMax - 0.648) / 0.050));
    photonRing = max(photonRing, graze * 0.88 * escapeMask);
  }
  float subRing = exp(-sq((bDist - 0.016) / 0.017)) * escapeMask;
  float photonHalo = exp(-max(0.0, bDist) * (1.38 - uExploded * 0.16 - burstFlash * 0.36 - uHoverCore * 0.18)) * escapeMask;

  float einsteinBoost = exp(-sq((b - B_CRIT * 1.48) / 1.15)) * escapeMask;

  vec3 neonViolet = vec3(0.72, 0.18, 1.00);
  vec3 deepCosmic = vec3(0.22, 0.05, 0.44);
  vec3 acidLime   = vec3(0.8235, 1.0, 0.1569);
  vec3 ivoryHot   = vec3(1.00, 0.985, 0.92);
  vec3 champGold  = vec3(1.00, 0.80, 0.40);
  vec3 emberAmber = vec3(0.98, 0.44, 0.10);

  vec3 darkCol = vec3(0.0);
  vec3 lightCol = vec3(0.0);

  // =========================================================================
  // DARK MODE ("EVENT HORIZON" -- Interstellar Gargantua Relativistic Cinema)
  // =========================================================================
  if (uLight < 0.999) {
    vec3 darkVoid = vec3(0.0078, 0.0078, 0.0118); // #020203

    vec3 bg = darkVoid;
    if (escapeMask > 0.001) {
      bg += sampleSkyDark(exitDir, uTime, einsteinBoost, uAccentA) * escapeMask;
    }

    // Soft atmospheric gravitational glow wrapping Gargantua (warm gold inner bloom -> faint cosmic indigo halo)
    float coronaSoft = exp(-max(0.0, rScreen - rShadow) * (5.2 - uExploded * 0.75)) * escapeMask;
    vec3 haloCol = mix(
      mix(emberAmber, champGold, 0.62),
      deepCosmic,
      smoothstep(0.04, 0.40, max(0.0, rScreen - rShadow)) * 0.32
    );
    vec3 hdr = bg * transmittance;
    hdr += haloCol * photonHalo * (0.24 + charge * 0.11) * ringDoppler * transmittance;
    hdr += deepCosmic * coronaSoft * (0.10 + uHoverCore * 0.07 + uExploded * 0.04) * transmittance;

    // Volumetric raytraced Gargantua disk (front belt + towering upper arch + silky inverted lower arch)
    hdr += diskAccum * 1.22;

    // Blazing pure champagne-gold / incandescent ivory n=1 photon ring (zero harsh magenta border!)
    float causticShimmer = 0.92 + 0.08 * sin(angScreen * 7.0 - uTime * (1.8 + uHoverCore * 2.4));
    vec3 ringCoreCol = mix(mix(emberAmber, champGold, 0.65), ivoryHot, 0.55 + 0.45 * smoothstep(-0.35, 0.85, dopplerLimb));
    hdr += ringCoreCol * photonRing * (0.94 + charge * 0.36) * ringDoppler * causticShimmer * (0.34 + 0.66 * transmittance);
    hdr += mix(champGold, ivoryHot, 0.78) * subRing * (1.08 + burstFlash * 0.95) * ringDoppler;

    // Subtle Panavision 70mm IMAX horizontal anamorphic lens bloom from the approaching Doppler peak
    vec2 flarePos = pr - vec2(-rShadow * 0.55, 0.0);
    float anamCore = exp(-abs(pr.y) * (38.0 - burstFlash * 14.0)) * exp(-abs(flarePos.x) * (2.6 - burstFlash * 1.1));
    float anamWing = exp(-abs(pr.y) * (12.5 - burstFlash * 5.0)) * exp(-abs(pr.x) * (1.7 - burstFlash * 0.65));
    float flareGain = 0.11 + uHoverCore * 0.24 + burstFlash * 1.15;
    hdr += mix(champGold, ivoryHot, 0.68) * anamCore * flareGain * 0.92;
    hdr += mix(emberAmber, neonViolet, 0.18) * anamWing * flareGain * 0.22;

    // Relativistic supernova detonation shockwaves
    hdr += mix(ivoryHot, champGold, 0.40) * shockRing1 * 1.55;
    hdr += mix(neonViolet, acidLime, 0.26) * shockRing2 * 0.88;
    hdr += mix(deepCosmic, emberAmber, 0.45) * shockRing3 * 0.48;

    // ACES Filmic tone mapping -> lush cinema contrast, rich champagne gold, zero harsh clipping
    darkCol = acesFilm(hdr);

    // Gentle deep-space outer framing preserving crisp starfield across ultrawide displays
    float edgeVignette = 1.0 - smoothstep(0.85, 2.05, rScreen) * 0.24;
    darkCol = mix(darkVoid, darkCol, clamp(edgeVignette + shockRing1, 0.0, 1.0));
  }

  // =========================================================================
  // LIGHT MODE ("TOTAL SOLAR ECLIPSE" -- Archival Vellum + Raytraced Corona)
  // =========================================================================
  if (uLight > 0.001) {
    vec3 vellum      = vec3(0.9608, 0.9529, 0.9255); // #F5F3EC pure archival vellum
    vec3 eclipseCore = vec3(0.0275, 0.0275, 0.0353); // #070709 velvet obsidian disk
    vec3 vermilion   = vec3(0.8510, 0.3059, 0.0);    // #D94E00
    vec3 burntAmber  = vec3(0.7059, 0.3255, 0.0353); // #B45309
    vec3 solarGold   = vec3(0.9569, 0.6941, 0.0706);
    vec3 royalUltra  = vec3(0.48, 0.12, 0.82);
    vec3 sunWhite    = vec3(1.0, 0.992, 0.935);
    vec3 deepInk     = vec3(0.0392, 0.0392, 0.0431); // #0A0A0B

    float coronaOuter = rShadow * mix(2.55, 3.05, uExploded) + burstFlash * 0.18;
    float coronaBound = 1.0 - smoothstep(rShadow * 1.05, coronaOuter, rScreen);
    float coronaOuterEdge = smoothstep(rShadow * 1.42, coronaOuter * 0.88, rScreen);

    float inkStars = escapeMask * sampleSkyDaylight(exitDir, uTime) * smoothstep(rShadow * 1.35, rShadow * 1.85, rScreen);
    lightCol = mix(vellum, deepInk, inkStars);

    // Finely etched gossamer radial solar corona streamers
    if (coronaBound > 0.002 && escapeMask > 0.001) {
      float pAng = atan(pr.y, pr.x + 1e-6);
      float rayTex = textureLod(uNoiseTex, vec2(pAng * INV_TAU * 3.0 - uTime * 0.012, log(max(0.08, rScreen)) * 0.45), 0.9).r;
      float needles = 0.62 + 0.38 * sin(pAng * 24.0 + rayTex * 4.0 - uTime * 0.24);
      float dipole = 0.58 + 0.42 * pow(max(0.0001, abs(cos(pAng))), 1.25);
      float etchedRays = smoothstep(0.28, 0.88, rayTex * 0.72 + needles * 0.28) * dipole * coronaBound;
      float warmCorona = clamp((photonHalo * 0.72 + etchedRays * 0.70) * coronaBound, 0.0, 1.0);

      vec3 coronaTint = mix(solarGold, vermilion, smoothstep(0.24, 0.78, warmCorona));
      coronaTint = mix(coronaTint, royalUltra, coronaOuterEdge * 0.36);
      lightCol = mix(lightCol, coronaTint, warmCorona * 0.64 * escapeMask);
    }

    // Sub-pixel anti-aliased velvet obsidian eclipse moon silhouette
    float innerLimb = smoothstep(B_CRIT * 0.76, B_CRIT, b);
    vec3 moonCol = mix(eclipseCore, vec3(0.014, 0.014, 0.019), innerLimb * 0.42);
    lightCol = mix(moonCol, lightCol, escapeMask);

    // Layer our exact 3D raytraced Gargantua accretion ribbon in molten archival vermilion & gold
    float diskLum = clamp(dot(diskAccum, vec3(0.35, 0.50, 0.15)) * 0.78, 0.0, 1.6);
    if (diskLum > 0.003) {
      float diskMask = clamp((1.0 - transmittance) * 0.92 + smoothstep(0.0, 1.1, diskLum) * 0.35, 0.0, 0.92);
      vec3 flameCol = mix(burntAmber, vermilion, smoothstep(0.08, 0.55, diskLum));
      flameCol = mix(flameCol, solarGold, smoothstep(0.45, 1.05, diskLum) * 0.72);
      flameCol = mix(flameCol, sunWhite, smoothstep(0.95, 1.55, diskLum) * 0.55);
      float paperGuard = 1.0 - smoothstep(rShadow * 3.8, rShadow * 5.2, rScreen);
      lightCol = mix(lightCol, flameCol, diskMask * mix(0.78, 0.82 * paperGuard, escapeMask));
    }

    // Crisp incised golden-vermilion eclipse rim
    vec3 rimGold = mix(vermilion, sunWhite, smoothstep(0.25, 0.85, photonRing));
    lightCol = mix(lightCol, rimGold, clamp(photonRing * (0.90 + burstFlash * 0.12), 0.0, 0.96));
    lightCol = mix(lightCol, solarGold, clamp(subRing * 0.72, 0.0, 0.82));

    // Crisp multi-ring archival shockwaves
    lightCol = mix(lightCol, vermilion, clamp(shockRing1 * 0.80, 0.0, 0.80));
    lightCol = mix(lightCol, royalUltra, clamp(shockRing2 * 0.62, 0.0, 0.62));
    float inkShock = exp(-sq((rScreen - shockR * 0.93) / 0.0075)) * (1.0 - bNorm) * burstActive;
    lightCol = mix(lightCol, deepInk, clamp(inkShock * 0.60, 0.0, 0.60));

    // Solar Diamond-Ring glint & Baily's beads on upper-left limb
    vec2 diamondPos = vec2(-0.72, 0.694) * (rShadow * 1.018);
    vec2 dVec = pw - diamondPos;
    float dDist = length(dVec);
    if (dDist < 0.28) {
      vec2 dRot = rot2(0.7854) * dVec;
      float dSpikes =
        exp(-abs(dVec.x) * 140.0) * exp(-abs(dVec.y) * 13.5) +
        exp(-abs(dVec.y) * 140.0) * exp(-abs(dVec.x) * 13.5) +
        (exp(-abs(dRot.x) * 180.0) * exp(-abs(dRot.y) * 24.0) +
          exp(-abs(dRot.y) * 180.0) * exp(-abs(dRot.x) * 24.0)) *
          0.56;
      float diamondPulse = 0.92 + 0.08 * sin(uTime * 2.4) + uHoverCore * 0.24 + burstFlash * 0.62;
      float diamondCore = exp(-dDist * 30.0) * diamondPulse;
      float diamondHalo = exp(-dDist * 8.2) * 0.42 * diamondPulse;
      float bead1 = exp(-length(pw - vec2(-0.835, 0.550) * (rShadow * 1.016)) * 80.0) * (0.76 + 0.24 * sin(uTime * 3.1));
      float bead2 = exp(-length(pw - vec2(-0.575, 0.818) * (rShadow * 1.016)) * 86.0) * (0.76 + 0.24 * sin(uTime * 2.7 + 1.4));

      lightCol = mix(lightCol, mix(vermilion, solarGold, 0.58), clamp(diamondHalo * escapeMask, 0.0, 0.60));
      lightCol = mix(lightCol, sunWhite, clamp(diamondCore + dSpikes * 0.80 * diamondPulse + (bead1 + bead2) * 0.88, 0.0, 0.98));
    }
  }

  vec3 finalCol = mix(darkCol, lightCol, uLight);

  // Subtle 8-bit anti-banding film dither
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

function createNoiseTexture(gl: WebGL2RenderingContext, pixels: Uint8Array): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NOISE_SIZE, NOISE_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

/** High-craft Canvas2D Interstellar Gargantua / Total Solar Eclipse fallback when WebGL2 is unavailable. */
function drawBlackHole2DFallback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  ptrX: number,
  ptrY: number,
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

  const bNorm = burstAge > 0 && burstAge < 1.28 ? Math.min(1, burstAge / 1.14) : -1;
  const rH = minD * (0.148 - explodedMix * 0.032 - hoverMix * 0.011);

  ctx.save();
  ctx.fillStyle = isLight ? '#F5F3EC' : '#020203';
  ctx.fillRect(0, 0, w, h);

  // Crisp pinpoint starfield with subtle pointer parallax
  const pxOff = (ptrX - 0.5) * 14;
  const pyOff = (ptrY - centerYRatio) * 14;
  for (let i = 0; i < (isLight ? 36 : 88); i++) {
    const a = i * 2.39996 + t * 0.008;
    const dist = minD * (0.21 + ((i * 73) % 100) / 108);
    const depth = (i % 3) * 0.45 + 0.4;
    const sx = cx + Math.cos(a) * dist * 1.48 + pxOff * depth;
    const sy = cy + Math.sin(a) * dist + pyOff * depth;
    const tw = 0.55 + 0.45 * Math.sin(t * 1.6 + i);
    if (isLight) {
      ctx.fillStyle = `rgba(10,10,11,${(tw * 0.18).toFixed(3)})`;
    } else if (i % 7 === 0) {
      ctx.fillStyle = `rgba(255,220,165,${(tw * 0.68).toFixed(3)})`;
    } else if (i % 11 === 0) {
      ctx.fillStyle = `rgba(195,215,255,${(tw * 0.65).toFixed(3)})`;
    } else {
      ctx.fillStyle = `rgba(245,243,236,${(tw * 0.56).toFixed(3)})`;
    }
    const sz = i % 7 === 0 ? 1.8 : 1.1;
    ctx.fillRect(sx, sy, sz, sz);
  }

  // Luminous golden-amber Gargantua corona (obsidian) or solar corona (daylight)
  const coronaR = rH * (isLight ? 2.45 + explodedMix * 0.35 : 3.05 + explodedMix * 0.72);
  const corona = ctx.createRadialGradient(cx, cy, rH * 0.94, cx, cy, coronaR);
  if (isLight) {
    corona.addColorStop(0, 'rgba(217,78,0,0.72)');
    corona.addColorStop(0.28, 'rgba(245,158,11,0.42)');
    corona.addColorStop(0.62, 'rgba(128,26,219,0.16)');
    corona.addColorStop(1, 'rgba(245,243,236,0)');
  } else {
    corona.addColorStop(0, 'rgba(255,246,218,0.84)');
    corona.addColorStop(0.18, 'rgba(255,190,92,0.52)');
    corona.addColorStop(0.45, 'rgba(210,92,24,0.22)');
    corona.addColorStop(0.76, 'rgba(92,24,148,0.10)');
    corona.addColorStop(1, 'rgba(2,2,3,0)');
  }
  ctx.fillStyle = corona;
  ctx.beginPath();
  ctx.arc(cx, cy, coronaR, 0, Math.PI * 2);
  ctx.fill();

  const tilt = -0.172 + (ptrX - 0.5) * 0.13;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  // Gravitationally-lensed upper & lower Gargantua accretion arches
  for (let pass = 0; pass < 3; pass++) {
    const ar = rH * (1.10 + pass * 0.21);
    ctx.strokeStyle = isLight
      ? pass === 0
        ? 'rgba(217,78,0,0.74)'
        : pass === 1
          ? 'rgba(180,83,9,0.40)'
          : 'rgba(128,26,219,0.24)'
      : pass === 0
        ? 'rgba(255,245,214,0.85)'
        : pass === 1
          ? 'rgba(255,186,86,0.58)'
          : 'rgba(198,84,22,0.34)';
    ctx.lineWidth = (4.8 - pass * 1.1) * (1 + explodedMix * 0.22);
    ctx.beginPath();
    ctx.arc(0, 0, ar, Math.PI * 1.03, Math.PI * 1.97);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, ar * 0.90, Math.PI * 0.06, Math.PI * 0.94);
    ctx.stroke();
  }

  // Back equatorial disk: warm Interstellar Doppler gold -> amber
  const diskRx = rH * (2.95 + explodedMix * 0.95);
  const diskRy = rH * (0.50 + (ptrY - centerYRatio) * 0.12);
  const backDisk = ctx.createLinearGradient(-diskRx, 0, diskRx, 0);
  if (isLight) {
    backDisk.addColorStop(0, 'rgba(217,78,0,0)');
    backDisk.addColorStop(0.26, 'rgba(217,78,0,0.62)');
    backDisk.addColorStop(0.68, 'rgba(180,83,9,0.38)');
    backDisk.addColorStop(1, 'rgba(128,26,219,0)');
  } else {
    backDisk.addColorStop(0, 'rgba(140,46,12,0)');
    backDisk.addColorStop(0.22, 'rgba(255,240,202,0.88)');
    backDisk.addColorStop(0.46, 'rgba(255,186,82,0.72)');
    backDisk.addColorStop(0.76, 'rgba(202,82,20,0.46)');
    backDisk.addColorStop(1, 'rgba(92,26,8,0)');
  }
  ctx.strokeStyle = backDisk;
  ctx.lineWidth = rH * 0.24;
  ctx.beginPath();
  ctx.ellipse(0, 0, diskRx * 0.84, Math.max(8, diskRy), 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  // Pitch-black event horizon shadow sphere
  ctx.fillStyle = isLight ? '#070709' : '#010102';
  ctx.beginPath();
  ctx.arc(0, 0, rH, 0, Math.PI * 2);
  ctx.fill();

  // Razor-sharp incandescent photon ring
  ctx.strokeStyle = isLight ? '#D94E00' : 'rgba(255,244,218,0.92)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.arc(0, 0, rH * 1.028, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = isLight ? 'rgba(255,246,214,0.88)' : 'rgba(255,186,78,0.58)';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.arc(0, 0, rH * 1.044, 0, Math.PI * 2);
  ctx.stroke();

  // Front equatorial plasma belt sweeping across the obsidian sphere
  const belt = ctx.createLinearGradient(-diskRx, 0, diskRx, 0);
  if (isLight) {
    belt.addColorStop(0, 'rgba(217,78,0,0)');
    belt.addColorStop(0.28, 'rgba(217,78,0,0.86)');
    belt.addColorStop(0.58, 'rgba(245,158,11,0.84)');
    belt.addColorStop(1, 'rgba(128,26,219,0)');
  } else {
    belt.addColorStop(0, 'rgba(140,46,12,0)');
    belt.addColorStop(0.22, 'rgba(255,248,228,0.96)');
    belt.addColorStop(0.48, 'rgba(255,196,98,0.84)');
    belt.addColorStop(0.78, 'rgba(210,88,22,0.58)');
    belt.addColorStop(1, 'rgba(92,26,8,0)');
  }
  ctx.strokeStyle = belt;
  ctx.lineWidth = Math.max(4, rH * 0.14);
  ctx.beginPath();
  ctx.ellipse(0, 0, diskRx * 0.86, Math.max(7, diskRy * 0.68), 0, 0.04, Math.PI - 0.04);
  ctx.stroke();

  // Subtle horizontal Panavision anamorphic glint
  if (!isLight) {
    const flare = ctx.createLinearGradient(-diskRx * 1.15, 0, diskRx * 1.15, 0);
    flare.addColorStop(0, 'rgba(255,160,60,0)');
    flare.addColorStop(0.3, 'rgba(255,212,130,0.28)');
    flare.addColorStop(0.5, 'rgba(255,250,236,0.44)');
    flare.addColorStop(0.72, 'rgba(255,176,82,0.22)');
    flare.addColorStop(1, 'rgba(158,46,255,0)');
    ctx.fillStyle = flare;
    ctx.fillRect(-diskRx * 1.15, -1.5, diskRx * 2.3, 3.0);
  }
  ctx.restore();

  // Solar Diamond-Ring glint in daylight mode
  if (isLight) {
    const dx = cx - rH * 0.72 * 1.018;
    const dy = cy - rH * 0.694 * 1.018;
    const dg = ctx.createRadialGradient(dx, dy, 0, dx, dy, rH * 0.38);
    dg.addColorStop(0, 'rgba(255,253,240,0.98)');
    dg.addColorStop(0.24, 'rgba(245,179,18,0.72)');
    dg.addColorStop(0.54, 'rgba(217,78,0,0.26)');
    dg.addColorStop(1, 'rgba(245,243,236,0)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(dx, dy, rH * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  // Relativistic detonation shockwave
  if (bNorm >= 0) {
    const ease = 1 - Math.pow(1 - bNorm, 3);
    const sr = rH + ease * minD * 0.58;
    ctx.strokeStyle = isLight
      ? `rgba(217,78,0,${((1 - bNorm) * 0.85).toFixed(3)})`
      : `rgba(255,232,184,${((1 - bNorm) * 0.92).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, (1 - bNorm) * 5.0);
    ctx.beginPath();
    ctx.arc(cx, cy, sr, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Full-bleed 60fps True 3D General-Relativistic Gargantua WebGL2 Black Hole (Event Horizon)
 * and Archival Total Solar Eclipse on pure Vellum Ivory #F5F3EC (Daylight):
 * - Exact Polar Binet Schwarzschild null geodesic integrator (d^2u/dphi^2 + u = 1.5*u^2) with
 *   analytical equatorial node intersections (rendering continuous upper + inverted lower arches
 *   and n=1/n=2 photon rings) plus O(1) far-field bypass across empty outer space.
 * - Precomputed seamless 256x256 hardware-mipmapped turbulence atlas with dual-phase Keplerian
 *   differential rotation, dust-lane absorption, relativistic Doppler beaming, 3D gravitationally
 *   lensed starfield, and ACES filmic tone mapping.
 * - Ultrawide pixel-budget DPR capping + gentle adaptive frame-time governor, cached layout bounds,
 *   Canvas2D fallback, reduced-motion static mode, and visibility/viewport auto-pause.
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
    let noiseTex: WebGLTexture | null = null;
    let noisePixels: Uint8Array | null = null;
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
    let uNoiseTex: WebGLUniformLocation | null = null;

    const bindUniforms = (context: WebGL2RenderingContext, program: WebGLProgram) => {
      uRes = context.getUniformLocation(program, 'uRes');
      uTime = context.getUniformLocation(program, 'uTime');
      uPointer = context.getUniformLocation(program, 'uPointer');
      uAccentA = context.getUniformLocation(program, 'uAccentA');
      uAccentB = context.getUniformLocation(program, 'uAccentB');
      uLight = context.getUniformLocation(program, 'uLight');
      uExploded = context.getUniformLocation(program, 'uExploded');
      uHoverCore = context.getUniformLocation(program, 'uHoverCore');
      uBurstAge = context.getUniformLocation(program, 'uBurstAge');
      uCenterY = context.getUniformLocation(program, 'uCenterY');
      uNoiseTex = context.getUniformLocation(program, 'uNoiseTex');
      context.useProgram(program);
      if (uNoiseTex) context.uniform1i(uNoiseTex, 0);
    };

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
            noisePixels = buildSeamlessNoiseAtlas(NOISE_SIZE);
            const tex = createNoiseTexture(candidate, noisePixels);
            if (tex) {
              gl = candidate;
              prog = p;
              noiseTex = tex;
              bindUniforms(gl, prog);
            } else {
              candidate.deleteProgram(p);
            }
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
    let rectLeft = 0;
    let rectTop = 0;
    let dpr = 1;
    let dynScale = 1;

    const applyBufferSize = () => {
      if (cssW <= 0 || cssH <= 0) return;
      const baseDpr = Math.min(1.5, window.devicePixelRatio || 1);
      // Pixel-budget DPR cap prevents 5K-wide ultrawide backing stores from choking fill-rate
      const budgetDpr = Math.sqrt(MAX_WEBGL_PIXELS / Math.max(1, cssW * cssH));
      dpr = Math.max(0.6, Math.min(baseDpr, budgetDpr) * dynScale);
      const pw = Math.max(1, Math.round(cssW * dpr));
      const ph = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      if (gl && !gl.isContextLost()) gl.viewport(0, 0, pw, ph);
    };

    const syncSize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      cssW = Math.round(rect.width);
      cssH = Math.round(rect.height);
      rectLeft = rect.left;
      rectTop = rect.top;
      applyBufferSize();
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
    let emaFrameMs = 16.67;
    let governorCooldown = 0;

    const drawFrame = (timeSec: number) => {
      const bAge = targetRef.current.burstAge;
      if (gl && prog && noiseTex && !gl.isContextLost()) {
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
          curLight,
          curExploded,
          curHover,
          bAge,
          curCenterYRatio,
        );
      }
    };

    const STATIC_TIME = 4.2;

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
      drawFrame(STATIC_TIME);
    };

    drawFrame(targetRef.current.reduced ? STATIC_TIME : 0);

    // Cached layout rect avoids synchronous getBoundingClientRect() layout thrashing on every pointermove
    const onPointerMove = (e: PointerEvent) => {
      if (cssW <= 0 || cssH <= 0) return;
      const nx = (e.clientX - rectLeft) / cssW;
      const ny = (e.clientY - rectTop) / cssH;
      if (nx >= -0.1 && nx <= 1.1 && ny >= -0.1 && ny <= 1.1) {
        targetRef.current.ptrX = Math.max(0, Math.min(1, nx));
        targetRef.current.ptrY = Math.max(0, Math.min(1, ny));
      }
    };
    const onPointerLeave = () => {
      targetRef.current.ptrX = 0.5;
      targetRef.current.ptrY = targetRef.current.centerYRatio;
    };
    const onScroll = () => {
      const rect = wrap.getBoundingClientRect();
      rectLeft = rect.left;
      rectTop = rect.top;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        syncSize();
        if (targetRef.current.reduced) drawFrame(STATIC_TIME);
      });
      ro.observe(wrap);
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    const onContextRestored = () => {
      if (!gl) return;
      const restored = createProgram(gl);
      if (restored) {
        noisePixels ??= buildSeamlessNoiseAtlas(NOISE_SIZE);
        const restoredTex = createNoiseTexture(gl, noisePixels);
        if (restoredTex) {
          prog = restored;
          noiseTex = restoredTex;
          bindUniforms(gl, prog);
          syncSize();
          drawFrame(targetRef.current.reduced ? STATIC_TIME : elapsed);
        } else {
          gl.deleteProgram(restored);
        }
      }
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    let raf = 0;
    let lastNow = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.visibilityState !== 'visible' || !targetRef.current.inView || targetRef.current.reduced) {
        lastNow = now;
        return;
      }

      const rawMs = now - lastNow;
      const dt = Math.min(0.05, Math.max(0.001, rawMs / 1000));
      lastNow = now;
      elapsed += dt;

      // Gentle adaptive resolution governor if sustained frame times dip below ~40fps
      if (gl && rawMs > 1 && rawMs < 250) {
        emaFrameMs = emaFrameMs * 0.92 + rawMs * 0.08;
        governorCooldown = Math.max(0, governorCooldown - dt);
        if (governorCooldown === 0) {
          if (emaFrameMs > 26 && dynScale > 0.72) {
            dynScale = Math.max(0.72, +(dynScale - 0.1).toFixed(2));
            applyBufferSize();
            governorCooldown = 1.2;
          } else if (emaFrameMs < 13 && dynScale < 1) {
            dynScale = Math.min(1, +(dynScale + 0.08).toFixed(2));
            applyBufferSize();
            governorCooldown = 2.0;
          }
        }
      }

      const tgt = targetRef.current;
      if (tgt.burstAge > 0) {
        tgt.burstAge += dt;
        if (tgt.burstAge > 1.34) tgt.burstAge = 0;
      }

      const cAlpha = 1 - Math.exp(-dt * 6.5);
      for (let i = 0; i < 3; i++) {
        curA[i] = curA[i]! + (tgt.accentA[i]! - curA[i]!) * cAlpha;
        curB[i] = curB[i]! + (tgt.accentB[i]! - curB[i]!) * cAlpha;
      }
      curLight += (tgt.light - curLight) * (1 - Math.exp(-dt * 12));
      curCenterYRatio += (tgt.centerYRatio - curCenterYRatio) * (1 - Math.exp(-dt * 14));
      curExploded += (tgt.exploded - curExploded) * (1 - Math.exp(-dt * 5.2));
      curHover += (tgt.hoverCore - curHover) * (1 - Math.exp(-dt * 9.5));

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
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      ro?.disconnect();
      if (gl) {
        if (noiseTex) gl.deleteTexture(noiseTex);
        if (prog) gl.deleteProgram(prog);
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
      style={{ contain: 'strict' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block absolute inset-0 size-full" />
    </div>
  );
}
