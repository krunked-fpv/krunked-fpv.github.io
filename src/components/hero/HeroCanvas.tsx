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

float fbm3(vec2 p) {
  float v = 0.0;
  float amp = 0.54;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += amp * vnoise(p);
    p = rot * p * 2.06 + vec2(2.7, 5.9);
    amp *= 0.48;
  }
  return v;
}

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float sq(float x) {
  return x * x;
}

// Multi-scale crisp pinpoint deep-space starfield with parallax, 4-point glints & neon-purple Einstein sheen
vec3 sampleStarfield(
  vec2 baseCoord,
  vec2 ptrOffset,
  float time,
  float einsteinBoost,
  vec3 accentA,
  vec3 acidLime,
  vec3 neonPurple,
  vec3 ultraPlasma
) {
  vec3 stars = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 24.0 + fl * 28.0;
    vec2 sp = baseCoord + ptrOffset * (0.018 + fl * 0.016);
    vec2 gv = sp * scale + vec2(fl * 17.3, fl * 9.1);
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    vec2 rnd = hash22(id + fl * 31.7);
    vec2 pos = (rnd - 0.5) * 0.72;
    vec2 delta = f - pos;
    float d = length(delta);

    float bright = step(0.842 - fl * 0.038, rnd.x);
    float twinkle = 0.68 + 0.32 * sin(time * (1.7 + rnd.y * 3.4) + rnd.x * 42.0);
    float radius = 0.056 - fl * 0.008 + einsteinBoost * 0.030;
    float core = smoothstep(radius, 0.0, d) * bright * twinkle;

    // Crisp 4-point optical diffraction glint on rare brightest foreground stars
    float glintMask = step(0.952, rnd.x) * (1.0 - step(0.5, fl));
    float crossGlint =
      (exp(-abs(delta.x) * 42.0) * exp(-abs(delta.y) * 9.5) +
        exp(-abs(delta.y) * 42.0) * exp(-abs(delta.x) * 9.5)) *
      glintMask *
      twinkle *
      0.58;

    // Electric neon-purple, ultraviolet, warm ivory, accent & subtle acid-lime astronomical star tints
    vec3 cosmicTint = mix(
      mix(neonPurple, ultraPlasma, rnd.x),
      mix(accentA, acidLime, step(0.88, rnd.y)),
      step(0.56, rnd.y)
    );
    vec3 tint = mix(vec3(0.97, 0.96, 0.92), cosmicTint, 0.44 + einsteinBoost * 0.34);
    stars += tint * (core * (0.94 - fl * 0.22) + crossGlint);
  }
  return stars;
}

// Crisp sparse astronomical ink pinpoints for archival Solar Eclipse daylight plate
float sampleDaylightStars(vec2 sp, float time) {
  float dots = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float scale = 22.0 + fl * 24.0;
    vec2 gv = sp * scale + vec2(fl * 13.7, fl * 5.9);
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    vec2 rnd = hash22(id + fl * 23.1);
    vec2 pos = (rnd - 0.5) * 0.74;
    float d = length(f - pos);
    float pick = step(0.895, rnd.x);
    float tw = 0.70 + 0.30 * sin(time * 1.4 + rnd.y * 30.0);
    dots += smoothstep(0.044, 0.012, d) * pick * tw * (0.26 - fl * 0.07);
  }
  return clamp(dots, 0.0, 0.30);
}

// Seamless 360-deg Keplerian spiral accretion filaments + orbiting hot plasma knots
// Returns x = total filament density, y = incandescent plasma knot intensity
vec2 plasmaField(float radial, float angle, float time, float charge) {
  float rSafe = max(0.075, radial);
  float omega = (0.82 + charge * 0.68) / pow(rSafe, 0.72);
  float logR = log(rSafe);

  // Seamless circular phase coordinates (zero atan branch-cut seam on approaching limb)
  float spiralA = angle + logR * 6.2 - time * omega;
  float spiralB = angle * 2.0 + logR * 10.6 - time * (omega * 1.24);
  vec2 scA = vec2(cos(spiralA), sin(spiralA));
  vec2 scB = vec2(cos(spiralB), sin(spiralB));

  // Turbulent shear domain warp + dual-band sheared Keplerian filaments
  float warp = fbm3(scA * (1.7 + radial * 3.8) + vec2(radial * 5.2 - time * 0.24, -time * 0.16));
  float f1 = fbm(scA * (3.0 + radial * 7.2) + vec2(warp * 1.85, radial * 10.5 - time * 0.38));
  float f2 = fbm3(scB * (2.5 + radial * 5.4) - vec2(warp * 1.45, radial * 17.0 + time * 0.30));

  // Fine radial magnetorotational shear striations
  float striations = 0.52 + 0.48 * sin(radial * 56.0 - time * 2.4 + warp * 5.0 + f1 * 2.6);
  float bands = smoothstep(0.24, 0.88, f1 * 0.60 + f2 * 0.40) * (0.56 + 0.66 * striations);

  // Luminous hot plasma knots orbiting inward with sheared comet-like plasma wakes
  float laneScale = 23.0;
  float laneId = floor(radial * laneScale);
  float laneFrac = fract(radial * laneScale) - 0.5;
  float laneR = max(0.10, (laneId + 0.5) / laneScale);
  float knotOmega = (0.98 + charge * 0.78) / pow(laneR, 0.72);
  float knotCount = 2.0 + mod(laneId, 3.0);
  float knotPhase = angle + hash21(vec2(laneId, 11.7)) * 6.2831853 - time * knotOmega;
  float knotArc = fract((knotPhase * knotCount) / 6.2831853) - 0.5;
  float shearedArc = knotArc < 0.0 ? knotArc * 4.8 : knotArc * 13.5;
  float knot = exp(-(laneFrac * laneFrac * 28.0 + shearedArc * shearedArc * 4.2));
  float knotGate = step(0.46, hash21(vec2(laneId, 29.3)));
  float hotKnots = knot * knotGate * (0.72 + 0.52 * warp);

  float density = clamp(bands * 1.42 + hotKnots * 0.78, 0.0, 1.85);
  return vec2(density, hotKnots);
}

void main() {
  float minDim = max(1.0, min(uRes.x, uRes.y));
  // Center locked pixel-for-pixel with arena core (uCenterY is in GL Y-up space: 1.0 - centerYRatio)
  vec2 centerPx = vec2(uRes.x * 0.5, uRes.y * uCenterY);
  vec2 p = (gl_FragCoord.xy - centerPx) / minDim;

  // Pointer offset relative to center for interactive 3D disk tilt & parallax
  vec2 ptr = (uPointer - vec2(0.5, uCenterY)) * vec2(uRes.x / minDim, uRes.y / minDim);
  float r = length(p);
  float ang = atan(p.y, p.x + 1e-6);

  // --- SUPERNOVA MULTI-RING SHOCKWAVE ENVELOPE (0..1.30s) ---
  float burstActive = step(0.0001, uBurstAge) * (1.0 - smoothstep(1.04, 1.30, uBurstAge));
  float bNorm = clamp(uBurstAge / 1.14, 0.0, 1.0);
  float bInv = 1.0 - bNorm;
  float bEase = 1.0 - bInv * bInv * bInv;
  float shockR = 0.12 + bEase * 1.08;
  float shockW = 0.024 + bNorm * 0.032;
  float shockRing1 = exp(-sq((r - shockR) / shockW)) * (1.0 - bNorm) * burstActive;
  float shockRing2 =
    exp(-sq((r - shockR * 0.82) / (shockW * 1.45))) * (1.0 - bNorm * 0.92) * burstActive;
  float shockRing3 =
    exp(-sq((r - shockR * 0.64) / (shockW * 1.15))) * (1.0 - bNorm * 0.85) * burstActive;
  float shockRipple =
    (sin((r - shockR) * 64.0) * shockRing1 * 0.022 + sin((r - shockR * 0.82) * 44.0) * shockRing2 * 0.011);
  float burstFlash = exp(-uBurstAge * 4.6) * step(0.0001, uBurstAge);

  // Dynamic event horizon shadow radius with tighter gravitational hover pinch
  float rH = mix(0.154, 0.114, uExploded);
  rH -= uHoverCore * 0.017 * (1.0 - uExploded * 0.45);
  rH += burstFlash * 0.024 * sin(uBurstAge * 20.0);
  float charge = clamp(uHoverCore * 0.88 + uExploded * 0.62 + burstFlash * 1.5, 0.0, 2.1);

  // Relativistic gravitational distortion wave warp
  vec2 dir = p / max(0.0001, r);
  vec2 pw = p + dir * shockRipple;
  float rw = length(pw);

  // Subtle hover gravitational coiling swirl right outside the photon sphere
  float coilAmt = uHoverCore * 0.14 * exp(-max(0.0, rw - rH) * 9.5) * smoothstep(rH * 0.95, rH * 1.04, rw);
  vec2 pCoil = rot2(coilAmt) * pw;

  // Interactive 3D Gargantua disk plane tilt
  float diskTilt = -0.175 + clamp(ptr.x * 0.17, -0.14, 0.14);
  vec2 pr = rot2(diskTilt) * pCoil;
  float tiltSquash = mix(4.25, 3.55, uExploded) + clamp(ptr.y * 0.85, -0.55, 0.55) - uHoverCore * 0.24;

  // --- 1. RELATIVISTIC EQUATORIAL ACCRETION DISK ---
  vec2 eqCoord = vec2(pr.x, pr.y * tiltSquash);
  float rEq = length(eqCoord);
  float aEq = atan(eqCoord.y, eqCoord.x + 1e-6);
  float eqOuter = mix(0.62, 0.80, uExploded) + burstFlash * 0.18 + uHoverCore * 0.03;

  // Slight ISCO plunge cliff lets the double photon ring pop crisply against dark space
  float eqInnerMask = smoothstep(rH * 1.02, rH * 1.16, rEq);
  float eqOuterMask = 1.0 - smoothstep(rH * 1.38, eqOuter, rEq);
  float eqRadialHeat = mix(0.48, 1.40, exp(-max(0.0, rEq - rH * 1.14) * 4.2));
  vec2 eqField = plasmaField(rEq, aEq, uTime, charge);
  float eqIntensity = eqInnerMask * eqOuterMask * eqRadialHeat * (0.38 + eqField.x * 1.10);
  float eqKnots = eqInnerMask * eqOuterMask * eqField.y;
  // Outer disk radial factor drives vivid neon-purple outer ribbons -> molten gold/ivory inner wall
  float eqOuterRatio = smoothstep(rH * 1.18, eqOuter * 0.78, rEq);

  // Front-vs-back hemisphere occlusion across the curved 3D shadow silhouette
  float frontArcOffset = -0.011 * (1.0 - smoothstep(0.0, rH * 1.35, abs(pr.x)));
  float frontHalf = smoothstep(0.030, -0.024, pr.y - frontArcOffset);

  // --- 2. GRAVITATIONALLY-LENSED UPPER & LOWER ARCHES ---
  float archOuter = rH * mix(2.18, 2.46, uExploded) + burstFlash * 0.14 + uHoverCore * 0.02;
  float upperMask = smoothstep(-0.018, 0.075, pr.y);
  float lowerMask = smoothstep(0.018, -0.075, pr.y);

  vec2 upP = vec2(pr.x * 0.935, max(0.0, pr.y) * 1.055);
  float rUp = length(upP);
  float upBand = smoothstep(rH * 0.99, rH * 1.085, rUp) * (1.0 - smoothstep(rH * 1.16, archOuter, rUp));
  vec2 upField = plasmaField(rUp * 1.14, atan(upP.y, upP.x + 1e-6), uTime * 1.08, charge);
  float upperArch = upperMask * upBand * (0.36 + upField.x * 1.06);
  float upperKnots = upperMask * upBand * upField.y * 0.74;
  float upOuterRatio = smoothstep(rH * 1.08, archOuter * 0.82, rUp);

  vec2 loP = vec2(pr.x * 0.955, min(0.0, pr.y) * 1.24);
  float rLo = length(loP);
  float loOuter = rH * mix(1.70, 1.94, uExploded) + burstFlash * 0.08;
  float loBand = smoothstep(rH * 0.985, rH * 1.06, rLo) * (1.0 - smoothstep(rH * 1.11, loOuter, rLo));
  vec2 loField = plasmaField(rLo * 1.24, atan(loP.y, loP.x + 1e-6), uTime * 0.96, charge);
  float lowerArch = lowerMask * loBand * (0.30 + loField.x * 0.90);
  float lowerKnots = lowerMask * loBand * loField.y * 0.56;
  float loOuterRatio = smoothstep(rH * 1.06, loOuter * 0.82, rLo);

  // --- 3. RELATIVISTIC DOPPLER BEAMING (Left Approaching White-Hot -> Right Receding Ultraviolet/Amber) ---
  float dopplerDir = clamp(-pr.x * 1.55, -1.0, 1.0);
  float doppler = clamp(1.0 + dopplerDir * 0.78, 0.36, 1.92);
  float dopplerLimb = smoothstep(-0.35, 0.88, dopplerDir);

  // --- 4. DOUBLE PHOTON RING + MICRO-CAUSTIC SHIMMER + ELECTRIC NEON-PURPLE DISPERSION ---
  float rPhotonPrimary = rH * 1.036;
  float rPhotonSub = rH * 1.004;
  float dP1 = rw - rPhotonPrimary;
  float dP2 = rw - rPhotonSub;

  float causticA = 0.78 + 0.22 * sin(ang * 8.0 - uTime * (2.8 + uHoverCore * 4.2));
  float causticB =
    0.66 + 0.34 * sin(ang * 19.0 + uTime * (5.2 + uHoverCore * 5.8) + sin(ang * 5.0 - uTime * 2.2) * 1.4);

  // Primary razor-sharp photon ring + vivid neon-purple outer chromatic dispersion fringe
  float photonW = 0.0058 + burstFlash * 0.0052;
  float photonCore = exp(-sq(dP1 / photonW));
  float photonDispOuter = exp(-sq((dP1 - 0.0052) / (photonW * 1.95)));
  float photonDispInner = exp(-sq((dP1 + 0.0028) / (photonW * 0.95)));

  // Ultra-fine inner secondary gravitationally-lensed sub-ring right on the shadow cliff
  float subRing = exp(-sq(dP2 / (0.0022 + burstFlash * 0.0016))) * (0.68 + 0.52 * causticB);

  float photonHalo =
    exp(-max(0.0, dP1) * (10.6 - uExploded * 2.4 - burstFlash * 4.2 - uHoverCore * 2.0)) *
    smoothstep(rH * 0.96, rH * 1.028, rw);

  // Crisp event horizon shadow occlusion
  float shadowMask = smoothstep(rH - 0.0035, rH + 0.0045, rw);

  // Curved volumetric front equatorial belt sweeping cleanly in front of the obsidian sphere
  float frontThickness = smoothstep(0.072, 0.004, abs(pr.y - frontArcOffset));
  float frontEdgeSheath = smoothstep(0.088, 0.018, abs(pr.y - frontArcOffset)) * (1.0 - frontThickness * 0.55);
  float frontBelt = eqIntensity * frontHalf * frontThickness * (0.76 + 0.52 * eqField.x);
  float frontKnots = eqKnots * frontHalf * frontThickness;
  float visibleEq = eqIntensity * mix(shadowMask, 1.0, frontHalf);
  float visibleArch = (upperArch + lowerArch) * shadowMask;
  float visibleDisk = visibleEq + visibleArch;
  float visibleKnots = eqKnots * mix(shadowMask, 1.0, frontHalf) + (upperKnots + lowerKnots) * shadowMask;

  // Weighted outer-ribbon factor across equatorial ribbons & vaulted Einstein arches
  float archNeonWeight = (upperArch * (0.58 + 0.42 * upOuterRatio) + lowerArch * (0.62 + 0.38 * loOuterRatio)) * shadowMask;
  float eqNeonWeight = visibleEq * (0.28 + 0.72 * eqOuterRatio);
  float neonFactor = clamp((archNeonWeight * 1.15 + eqNeonWeight) / max(0.001, visibleDisk), 0.0, 1.0);

  // Shared Einstein gravitational lensing coordinate for starfields
  float rE = rH * 1.25;
  float einstein = (rE * rE) / max(0.0028, rw * rw);
  vec2 starCoord = pw * (1.0 - clamp(einstein, 0.0, 0.93));

  // Electric Neon-Purple Event Horizon palette + incandescent core highlights
  vec3 neonPurple = vec3(0.74, 0.16, 1.0);
  vec3 ultraPlasma = vec3(0.90, 0.30, 1.0);
  vec3 cosmicViolet = vec3(0.44, 0.07, 0.90);
  vec3 lavenderHot = vec3(0.96, 0.78, 1.0);
  vec3 acidLime = vec3(0.8235, 1.0, 0.1569);
  vec3 ivoryHot = vec3(1.0, 0.988, 0.935);
  vec3 moltenGold = vec3(1.0, 0.76, 0.22);
  vec3 moltenAmber = vec3(1.0, 0.52, 0.12);

  vec3 darkCol = vec3(0.0);
  vec3 lightCol = vec3(0.0);

  // =========================================================================
  // DARK MODE ("EVENT HORIZON" -- Electric Neon-Purple Gargantua)
  // =========================================================================
  if (uLight < 0.999) {
    vec3 darkVoid = vec3(0.0078, 0.0078, 0.0118); // #020203

    float einsteinRingMask = exp(-sq((rw - rH * 1.28) / 0.048));
    vec3 stars = sampleStarfield(
      starCoord,
      ptr,
      uTime,
      einsteinRingMask,
      uAccentA,
      acidLime,
      neonPurple,
      ultraPlasma
    ) * shadowMask;

    // Delicate gravitationally-lensed tangential Einstein star arcs gleaming in neon purple & ultraviolet
    float arcPhase = sin(ang * 22.0 + 0.4 * sin(ang * 7.0));
    float arcGlints = smoothstep(0.93, 0.998, arcPhase) * einsteinRingMask * shadowMask;
    float arcSub =
      smoothstep(0.905, 0.995, sin(ang * 34.0 - 1.7)) *
      exp(-sq((rw - rH * 1.37) / 0.024)) *
      shadowMask;
    vec3 einsteinArcs =
      mix(ultraPlasma, ivoryHot, 0.36) * arcGlints * 0.56 +
      mix(neonPurple, acidLime, 0.24) * arcSub * 0.30;

    // Lush cosmic violet & electric neon-purple deep-space dust nebula + gravitational corona halo
    float dustA = fbm3(pw * 2.25 + vec2(uTime * 0.025, -uTime * 0.018));
    float dustB = fbm3(pr * 3.4 - vec2(uTime * 0.032, uTime * 0.014));
    float nebulaEnv = exp(-rw * 1.85) * shadowMask;
    float coronaGlow = exp(-max(0.0, rw - rH * 1.02) * (3.6 - uExploded * 0.65)) * shadowMask;

    vec3 nebulaCol =
      cosmicViolet * (dustA * 0.28 + coronaGlow * (0.28 + uExploded * 0.14 + uHoverCore * 0.14)) * nebulaEnv +
      neonPurple * dustB * exp(-rw * 2.35) * (0.20 + uExploded * 0.10) * shadowMask +
      mix(uAccentB, cosmicViolet, 0.62) * dustA * exp(-rw * 2.6) * 0.08 * shadowMask;

    darkCol = darkVoid + stars + einsteinArcs + nebulaCol;

    // Relativistic accretion plasma: vivid neon purple & ultraviolet outer ribbons/arches ->
    // molten amber/gold mid-bands -> blazing incandescent ivory-white + subtle acid-lime inner edge
    float heat = clamp(visibleDisk * doppler, 0.0, 2.50);

    // Outer & lensed-arch ultraviolet / neon-purple plasma spectrum
    vec3 violetSpectrum = mix(cosmicViolet, neonPurple, smoothstep(0.04, 0.48, heat));
    violetSpectrum = mix(violetSpectrum, ultraPlasma, smoothstep(0.38, 1.05, heat));
    violetSpectrum = mix(violetSpectrum, lavenderHot, smoothstep(1.05, 1.90, heat) * 0.72);

    // Inner relativistic incandescent thermal core (molten amber/gold -> ivory-white + subtle acid-lime)
    vec3 coreSpectrum = mix(moltenAmber, moltenGold, smoothstep(0.08, 0.55, heat));
    coreSpectrum = mix(
      coreSpectrum,
      mix(moltenGold, acidLime, 0.28 + uHoverCore * 0.18),
      smoothstep(0.45, 1.15, heat) * dopplerLimb * 0.42
    );
    coreSpectrum = mix(coreSpectrum, ivoryHot, smoothstep(0.92, 1.78, heat));

    // Blend outer neon-purple ribbons & arches seamlessly into the blinding inner Doppler core
    float purpleBlend = clamp(neonFactor * (1.12 - smoothstep(0.95, 1.95, heat) * 0.42) + 0.16, 0.0, 0.96);
    vec3 diskColor = mix(coreSpectrum, violetSpectrum, purpleBlend);
    // Blazing white-hot incandescent peak at the very hottest approaching edge
    diskColor = mix(diskColor, ivoryHot, smoothstep(1.38, 2.25, heat) * (0.45 + 0.55 * dopplerLimb));

    darkCol += diskColor * heat * 0.98;

    // Luminous orbiting plasma knots (ultraviolet outer eddies -> incandescent ivory/gold inner knots)
    vec3 knotCol = mix(mix(moltenGold, ivoryHot, dopplerLimb), mix(ultraPlasma, lavenderHot, 0.5), neonFactor);
    darkCol += knotCol * visibleKnots * doppler * 0.84;

    // Gravitational photon corona & Double Photon Ring with electric neon-purple outer chromatic shimmer
    float ringDoppler = 0.70 + 0.56 * dopplerLimb;
    vec3 photonHaloCol = mix(neonPurple, ultraPlasma, 0.35 + 0.40 * dopplerLimb);
    photonHaloCol = mix(photonHaloCol, moltenGold, 0.18 * (1.0 - dopplerLimb));
    darkCol += photonHaloCol * photonHalo * (0.76 + charge * 0.38) * causticA * ringDoppler;

    // Electric neon-purple outer chromatic shimmer wrapping the razor photon ring
    darkCol +=
      mix(neonPurple, ultraPlasma, 0.45 + 0.35 * causticB) *
      photonDispOuter *
      (0.95 + uHoverCore * 0.42 + burstFlash * 0.75) *
      causticA;
    // Inner hot chromatic glint (ultraviolet -> subtle acid-lime on approaching limb)
    darkCol +=
      mix(ultraPlasma, acidLime, 0.34 * dopplerLimb) *
      photonDispInner *
      (0.56 + uHoverCore * 0.38 + burstFlash * 0.55) *
      ringDoppler;
    // Blazing primary razor photon core
    darkCol +=
      mix(ivoryHot, mix(lavenderHot, acidLime, 0.38 * dopplerLimb), 0.24 + uHoverCore * 0.16) *
      photonCore *
      (1.46 + burstFlash * 1.25) *
      ringDoppler;

    // Pure hypnotic pitch-black event horizon void center (unobstructed when exploded!)
    darkCol *= mix(0.008, 1.0, shadowMask);

    // Ultra-fine inner secondary gravitationally-lensed sub-ring perched right on the black cliff edge
    float subRingClip = smoothstep(rH - 0.0025, rH + 0.001, rw);
    vec3 subRingCol = mix(neonPurple, mix(lavenderHot, ivoryHot, 0.55), dopplerLimb);
    darkCol += subRingCol * subRing * subRingClip * (0.86 + uHoverCore * 0.48 + burstFlash * 0.72) * ringDoppler;

    // Volumetric front equatorial plasma belt: neon-purple sheath + molten gold/ivory blazing spine
    float frontHeat = frontBelt * doppler;
    vec3 frontCol = mix(
      mix(neonPurple, moltenAmber, 0.46),
      mix(moltenGold, ivoryHot, smoothstep(0.32, 1.15, frontHeat)),
      0.38 + 0.50 * dopplerLimb
    );
    frontCol = mix(frontCol, mix(ivoryHot, acidLime, 0.24), smoothstep(0.95, 1.75, frontHeat) * dopplerLimb);
    darkCol += mix(neonPurple, ultraPlasma, 0.45) * eqIntensity * frontHalf * frontEdgeSheath * doppler * 0.56;
    darkCol += frontCol * frontBelt * 1.06;
    darkCol += mix(ultraPlasma, ivoryHot, 0.45 + 0.45 * dopplerLimb) * frontKnots * doppler * 0.76;

    // Sleek Panavision anamorphic horizontal lens flare (incandescent core + electric neon-purple wings)
    float anamCore = exp(-abs(pr.y) * (42.0 - burstFlash * 18.0)) * exp(-abs(pr.x) * (2.5 - burstFlash * 1.2));
    float anamWing = exp(-abs(pr.y) * (15.5 - burstFlash * 7.5)) * exp(-abs(pr.x) * (1.72 - burstFlash * 0.78));
    float flareGain = 0.15 + uHoverCore * 0.30 + burstFlash * 1.42;
    vec3 wingTint = mix(neonPurple, ultraPlasma, 0.35 + 0.40 * dopplerLimb);
    darkCol += mix(ivoryHot, lavenderHot, 0.22) * anamCore * flareGain * 1.05;
    darkCol += wingTint * anamWing * flareGain * 0.62;

    // Multi-ring electric neon-purple relativistic supernova shockwave
    darkCol += mix(ultraPlasma, ivoryHot, 0.44) * shockRing1 * 1.52;
    darkCol += mix(neonPurple, acidLime, 0.24) * shockRing2 * 0.94;
    darkCol += mix(cosmicViolet, moltenGold, 0.32) * shockRing3 * 0.56;

    // Clean cinema vignette framing so orbiting world pods pop with razor contrast
    float edgeFade = 1.0 - smoothstep(0.66, 1.14, r * (1.0 - uExploded * 0.14));
    darkCol = mix(darkVoid, darkCol, clamp(edgeFade + shockRing1 + shockRing2 * 0.72, 0.0, 1.0));
  }

  // =========================================================================
  // LIGHT MODE ("TOTAL SOLAR ECLIPSE" -- Archival Vellum + Royal Ultraviolet)
  // =========================================================================
  if (uLight > 0.001) {
    vec3 vellum = vec3(0.9608, 0.9529, 0.9255); // #F5F3EC (100% pure outer vellum -- zero muddy gray!)
    vec3 eclipseCore = vec3(0.0275, 0.0275, 0.0353); // #070709 velvet obsidian disk
    vec3 vermilion = vec3(0.8510, 0.3059, 0.0); // #D94E00
    vec3 burntAmber = vec3(0.7059, 0.3255, 0.0353); // #B45309
    vec3 solarGold = vec3(0.9569, 0.6941, 0.0706); // molten archival gold
    vec3 royalUltra = vec3(0.50, 0.10, 0.86); // electric royal ultraviolet harmonic accent
    vec3 sunWhite = vec3(1.0, 0.992, 0.935);
    vec3 deepInk = vec3(0.0392, 0.0392, 0.0431); // #0A0A0B

    // Strict radial containment so outer viewport stays 100% crisp #F5F3EC museum paper
    float coronaOuter = rH * mix(2.42, 2.80, uExploded) + burstFlash * 0.16;
    float coronaBound = 1.0 - smoothstep(rH * 1.06, coronaOuter, rw);
    float coronaOuterEdge = smoothstep(rH * 1.38, coronaOuter * 0.88, rw);
    float eqBound = 1.0 - smoothstep(rH * 1.38, eqOuter * 0.78, rEq);

    // Pure #F5F3EC vellum + ultra-crisp sparse archival ink pinpoints
    float inkStars = sampleDaylightStars(starCoord + ptr * 0.025, uTime) * smoothstep(rH * 1.32, rH * 1.75, rw);
    lightCol = mix(vellum, deepInk, inkStars);

    // Finely etched radially-streamed solar eclipse corona rays kissed with royal ultraviolet at outer tips
    float pAng = atan(pr.y, pr.x + 1e-6);
    vec2 pSc = vec2(cos(pAng), sin(pAng));
    float streamerTex = fbm3(pSc * 7.2 + vec2(log(max(0.08, rw)) * 2.1 - uTime * 0.14, uTime * 0.05));
    float fineNeedles = 0.5 + 0.5 * sin(pAng * 34.0 + streamerTex * 3.4 - uTime * 0.32);
    float dipoleShape = 0.52 + 0.48 * pow(max(0.0001, abs(cos(pAng))), 1.35);
    float etchedRays =
      smoothstep(0.34, 0.86, streamerTex * 0.66 + fineNeedles * 0.34) *
      dipoleShape *
      coronaBound *
      smoothstep(rH * 0.97, rH * 1.05, rw);

    // Sculpted vermilion solar prominence arcs leaping gently off the chromosphere
    float promWave = fbm3(pSc * 5.2 + vec2(uTime * 0.18, -uTime * 0.12));
    float promLoops =
      smoothstep(0.56, 0.88, promWave) *
      exp(-max(0.0, rw - rH * 1.015) * (24.0 - uHoverCore * 5.0)) *
      smoothstep(rH * 0.985, rH * 1.015, rw);

    float warmCorona = clamp((photonHalo * 0.92 + etchedRays * 0.80) * coronaBound, 0.0, 1.0);
    float lensedFlame =
      clamp((upperArch * 1.05 + lowerArch * 0.88 + eqIntensity * eqBound * 0.80) * doppler * 0.68, 0.0, 1.0);

    // Layer molten solar gold -> fiery vermilion -> electric royal ultraviolet outer coronal kiss onto pure #F5F3EC
    vec3 coronaTint = mix(solarGold, vermilion, smoothstep(0.22, 0.78, warmCorona));
    coronaTint = mix(coronaTint, royalUltra, coronaOuterEdge * 0.58);
    lightCol = mix(lightCol, coronaTint, warmCorona * 0.70);

    vec3 flameCol = mix(burntAmber, vermilion, smoothstep(0.18, 0.74, lensedFlame));
    flameCol = mix(flameCol, mix(solarGold, uAccentA, 0.22), smoothstep(0.56, 1.0, lensedFlame) * 0.48);
    flameCol = mix(flameCol, royalUltra, neonFactor * 0.36);
    lightCol = mix(lightCol, flameCol, clamp(lensedFlame * 0.78, 0.0, 0.84));

    // Fiery vermilion chromosphere & prominences
    lightCol = mix(lightCol, mix(vermilion, solarGold, 0.22), clamp(promLoops * 0.88, 0.0, 0.92));

    // Crisp multi-ring archival shockwaves (vermilion + electric royal ultraviolet + deep ink)
    lightCol = mix(lightCol, vermilion, clamp(shockRing1 * 0.80, 0.0, 0.80));
    lightCol = mix(lightCol, royalUltra, clamp(shockRing2 * 0.68, 0.0, 0.68));
    float inkShock = exp(-sq((r - shockR * 0.93) / 0.0075)) * (1.0 - bNorm) * burstActive;
    lightCol = mix(lightCol, deepInk, clamp(inkShock * 0.64, 0.0, 0.64));

    // Velvet obsidian eclipse disk (#070709) with subtle tactile inner limb contrast
    float innerLimb = smoothstep(rH * 0.82, rH, rw);
    vec3 diskInk = mix(eclipseCore, vec3(0.015, 0.015, 0.020), innerLimb * 0.45);
    lightCol = mix(diskInk, lightCol, shadowMask);

    // Double incised golden-vermilion eclipse rim with delicate royal-ultraviolet outer prism whisper
    lightCol = mix(lightCol, royalUltra, clamp(photonDispOuter * 0.42 * shadowMask, 0.0, 0.48));
    vec3 rimGold = mix(vermilion, sunWhite, smoothstep(0.28, 0.88, photonCore));
    lightCol = mix(lightCol, rimGold, clamp(photonCore * (0.94 + burstFlash * 0.1), 0.0, 0.98));
    lightCol = mix(lightCol, solarGold, clamp(subRing * 0.68, 0.0, 0.76));

    // Razor-crisp Solar Diamond-Ring glint + royal-ultraviolet prism dispersion + Baily's beads on upper-left limb
    vec2 diamondPos = vec2(-0.72, 0.694) * (rH * 1.016);
    vec2 dVec = pw - diamondPos;
    float dDist = length(dVec);
    vec2 dRot = rot2(0.7854) * dVec;
    float dSpikes =
      exp(-abs(dVec.x) * 140.0) * exp(-abs(dVec.y) * 13.5) +
      exp(-abs(dVec.y) * 140.0) * exp(-abs(dVec.x) * 13.5) +
      (exp(-abs(dRot.x) * 180.0) * exp(-abs(dRot.y) * 24.0) +
        exp(-abs(dRot.y) * 180.0) * exp(-abs(dRot.x) * 24.0)) *
        0.58;
    float diamondPulse = 0.92 + 0.08 * sin(uTime * 2.6) + uHoverCore * 0.25 + burstFlash * 0.65;
    float diamondCore = exp(-dDist * 30.0) * diamondPulse;
    float diamondHalo = exp(-dDist * 7.8) * 0.44 * diamondPulse;
    float diamondUltraRing = exp(-sq((dDist - 0.042) / 0.022)) * 0.36 * diamondPulse * shadowMask;

    // Two jewel-like Baily's beads peeking past adjacent upper-left lunar craters
    float bead1 = exp(-length(pw - vec2(-0.835, 0.550) * (rH * 1.014)) * 78.0) * (0.76 + 0.24 * sin(uTime * 3.4));
    float bead2 = exp(-length(pw - vec2(-0.575, 0.818) * (rH * 1.014)) * 84.0) * (0.76 + 0.24 * sin(uTime * 2.9 + 1.4));

    lightCol = mix(lightCol, royalUltra, clamp(diamondUltraRing, 0.0, 0.44));
    lightCol = mix(lightCol, mix(vermilion, solarGold, 0.58), clamp(diamondHalo * shadowMask, 0.0, 0.62));
    lightCol = mix(lightCol, sunWhite, clamp(diamondCore + dSpikes * 0.82 * diamondPulse + (bead1 + bead2) * 0.9, 0.0, 0.98));

    // Sculpted molten-vermilion front equatorial ribbon crossing the eclipse equator
    float frontEmber = clamp(frontBelt * doppler * 0.72, 0.0, 0.86);
    lightCol = mix(lightCol, mix(vermilion, solarGold, smoothstep(0.24, 0.78, frontEmber)), frontEmber * 0.74);
  }

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

/** High-craft Canvas2D Electric Neon-Purple Black Hole / Total Solar Eclipse fallback when WebGL2 is unavailable. */
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
  const rH = minD * (0.154 - explodedMix * 0.04 - hoverMix * 0.015);

  ctx.save();
  // Pure museum vellum ivory (#F5F3EC) in daylight, pure pitch space (#020203) in obsidian
  ctx.fillStyle = isLight ? '#F5F3EC' : '#020203';
  ctx.fillRect(0, 0, w, h);

  // Crisp pinpoint starfield with neon-purple glints & subtle pointer parallax
  const pxOff = (ptrX - 0.5) * 14;
  const pyOff = (ptrY - centerYRatio) * 14;
  for (let i = 0; i < (isLight ? 40 : 96); i++) {
    const a = i * 2.39996 + t * 0.01;
    const dist = minD * (0.21 + ((i * 73) % 100) / 112);
    const depth = (i % 3) * 0.45 + 0.4;
    const sx = cx + Math.cos(a) * dist * 1.42 + pxOff * depth;
    const sy = cy + Math.sin(a) * dist + pyOff * depth;
    const tw = 0.4 + 0.6 * Math.sin(t * 1.9 + i);
    if (isLight) {
      ctx.fillStyle = `rgba(10,10,11,${(tw * 0.2).toFixed(3)})`;
    } else if (i % 5 === 0) {
      ctx.fillStyle = `rgba(188,52,255,${(tw * 0.72).toFixed(3)})`;
    } else if (i % 9 === 0) {
      ctx.fillStyle = `rgba(214,91,255,${(tw * 0.68).toFixed(3)})`;
    } else if (i % 13 === 0) {
      ctx.fillStyle = `rgba(210,255,40,${(tw * 0.62).toFixed(3)})`;
    } else {
      ctx.fillStyle = `rgba(245,243,236,${(tw * 0.58).toFixed(3)})`;
    }
    const sz = i % 7 === 0 ? 1.9 : 1.15;
    ctx.fillRect(sx, sy, sz, sz);
  }

  // Cosmic violet / neon-purple corona (obsidian) or royal-ultraviolet-kissed solar corona (daylight)
  const coronaR = rH * (isLight ? 2.45 + explodedMix * 0.35 : 2.95 + explodedMix * 0.85);
  const corona = ctx.createRadialGradient(cx, cy, rH * 0.94, cx, cy, coronaR);
  if (isLight) {
    corona.addColorStop(0, 'rgba(217,78,0,0.74)');
    corona.addColorStop(0.28, 'rgba(245,158,11,0.42)');
    corona.addColorStop(0.62, 'rgba(128,26,219,0.18)');
    corona.addColorStop(1, 'rgba(245,243,236,0)');
  } else {
    corona.addColorStop(0, 'rgba(255,248,228,0.88)');
    corona.addColorStop(0.16, 'rgba(214,91,255,0.68)');
    corona.addColorStop(0.38, 'rgba(188,52,255,0.42)');
    corona.addColorStop(0.68, 'rgba(112,18,230,0.18)');
    corona.addColorStop(1, 'rgba(2,2,3,0)');
  }
  ctx.fillStyle = corona;
  ctx.beginPath();
  ctx.arc(cx, cy, coronaR, 0, Math.PI * 2);
  ctx.fill();

  const tilt = -0.175 + (ptrX - 0.5) * 0.14;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  // Finely etched coronal streamers in daylight mode (vermilion, gold & royal ultraviolet)
  if (isLight) {
    for (let ray = 0; ray < 32; ray++) {
      const ra = (ray / 32) * Math.PI * 2 + Math.sin(t * 0.3 + ray) * 0.02;
      const dipole = 0.55 + 0.45 * Math.abs(Math.cos(ra));
      const len = rH * (1.28 + dipole * (0.74 + (ray % 3) * 0.14));
      ctx.strokeStyle =
        ray % 3 === 0
          ? 'rgba(128,26,219,0.22)'
          : ray % 2 === 0
            ? 'rgba(217,78,0,0.22)'
            : 'rgba(245,158,11,0.26)';
      ctx.lineWidth = ray % 4 === 0 ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ra) * rH * 1.02, Math.sin(ra) * rH * 1.02);
      ctx.lineTo(Math.cos(ra) * len, Math.sin(ra) * len);
      ctx.stroke();
    }
  } else {
    // Neon-purple Einstein ring hairline arc in dark mode
    ctx.strokeStyle = 'rgba(214,91,255,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, rH * 1.28, -Math.PI * 0.86, -Math.PI * 0.14);
    ctx.stroke();
  }

  // Gravitationally-lensed upper & lower accretion arches (vivid neon purple & ultraviolet in dark mode)
  for (let pass = 0; pass < 3; pass++) {
    const ar = rH * (1.14 + pass * 0.22);
    ctx.strokeStyle = isLight
      ? pass === 0
        ? 'rgba(217,78,0,0.74)'
        : pass === 1
          ? 'rgba(180,83,9,0.40)'
          : 'rgba(128,26,219,0.28)'
      : pass === 0
        ? 'rgba(255,244,220,0.82)'
        : pass === 1
          ? 'rgba(214,91,255,0.62)'
          : 'rgba(188,52,255,0.38)';
    ctx.lineWidth = (4.4 - pass * 1.05) * (1 + explodedMix * 0.24);
    ctx.beginPath();
    ctx.arc(0, 0, ar, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, ar * 0.89, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
  }

  // Back equatorial disk: electric neon-purple outer ribbons -> molten gold/ivory Doppler inner limb
  const diskRx = rH * (2.72 + explodedMix * 0.96);
  const diskRy = rH * (0.56 + (ptrY - centerYRatio) * 0.12);
  const backDisk = ctx.createLinearGradient(-diskRx, 0, diskRx, 0);
  if (isLight) {
    backDisk.addColorStop(0, 'rgba(128,26,219,0)');
    backDisk.addColorStop(0.24, 'rgba(217,78,0,0.62)');
    backDisk.addColorStop(0.68, 'rgba(180,83,9,0.40)');
    backDisk.addColorStop(0.88, 'rgba(128,26,219,0.24)');
    backDisk.addColorStop(1, 'rgba(128,26,219,0)');
  } else {
    backDisk.addColorStop(0, 'rgba(188,52,255,0)');
    backDisk.addColorStop(0.18, 'rgba(214,91,255,0.72)');
    backDisk.addColorStop(0.36, 'rgba(255,248,228,0.84)');
    backDisk.addColorStop(0.62, 'rgba(255,168,46,0.58)');
    backDisk.addColorStop(0.84, 'rgba(188,52,255,0.52)');
    backDisk.addColorStop(1, 'rgba(112,18,230,0)');
  }
  ctx.strokeStyle = backDisk;
  ctx.lineWidth = rH * 0.22;
  ctx.beginPath();
  ctx.ellipse(0, 0, diskRx * 0.82, Math.max(8, diskRy), 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  // Pitch-black eclipse moon / event horizon shadow sphere
  ctx.fillStyle = isLight ? '#070709' : '#010102';
  ctx.beginPath();
  ctx.arc(0, 0, rH, 0, Math.PI * 2);
  ctx.fill();

  // Double Photon Ring with electric neon-purple outer shimmer
  if (!isLight) {
    ctx.strokeStyle = 'rgba(188,52,255,0.78)';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.arc(0, 0, rH * 1.046, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = isLight ? '#D94E00' : '#F5F3EC';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, rH * 1.034, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = isLight ? 'rgba(255,246,214,0.88)' : '#D65BFF';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(0, 0, rH * 1.005, 0, Math.PI * 2);
  ctx.stroke();

  // Front equatorial plasma belt (neon-purple sheath + incandescent ivory/gold Doppler spine)
  const belt = ctx.createLinearGradient(-diskRx, 0, diskRx, 0);
  if (isLight) {
    belt.addColorStop(0, 'rgba(217,78,0,0)');
    belt.addColorStop(0.28, 'rgba(217,78,0,0.88)');
    belt.addColorStop(0.56, 'rgba(245,158,11,0.86)');
    belt.addColorStop(1, 'rgba(128,26,219,0)');
  } else {
    belt.addColorStop(0, 'rgba(188,52,255,0)');
    belt.addColorStop(0.18, 'rgba(214,91,255,0.84)');
    belt.addColorStop(0.36, 'rgba(255,250,236,0.96)');
    belt.addColorStop(0.58, 'rgba(255,176,56,0.80)');
    belt.addColorStop(0.82, 'rgba(188,52,255,0.72)');
    belt.addColorStop(1, 'rgba(112,18,230,0)');
  }
  ctx.strokeStyle = belt;
  ctx.lineWidth = Math.max(4, rH * 0.13);
  ctx.beginPath();
  ctx.ellipse(0, 0, diskRx * 0.84, Math.max(7, diskRy * 0.7), 0, 0.04, Math.PI - 0.04);
  ctx.stroke();

  // Panavision anamorphic horizontal lens flare in electric neon purple + incandescent core
  if (!isLight) {
    const flare = ctx.createLinearGradient(-diskRx * 1.18, 0, diskRx * 1.18, 0);
    flare.addColorStop(0, 'rgba(158,46,255,0)');
    flare.addColorStop(0.28, 'rgba(188,52,255,0.34)');
    flare.addColorStop(0.5, 'rgba(255,248,255,0.52)');
    flare.addColorStop(0.72, 'rgba(214,91,255,0.34)');
    flare.addColorStop(1, 'rgba(158,46,255,0)');
    ctx.fillStyle = flare;
    ctx.fillRect(-diskRx * 1.18, -1.75, diskRx * 2.36, 3.5);
  }
  ctx.restore();

  // Razor-crisp Solar Diamond-Ring Glint with royal-ultraviolet edge dispersion on upper-left limb
  if (isLight) {
    const dx = cx - rH * 0.72 * 1.016;
    const dy = cy - rH * 0.694 * 1.016;
    const dg = ctx.createRadialGradient(dx, dy, 0, dx, dy, rH * 0.38);
    dg.addColorStop(0, 'rgba(255,253,240,0.98)');
    dg.addColorStop(0.24, 'rgba(245,179,18,0.72)');
    dg.addColorStop(0.54, 'rgba(217,78,0,0.26)');
    dg.addColorStop(0.76, 'rgba(128,26,219,0.20)');
    dg.addColorStop(1, 'rgba(245,243,236,0)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(dx, dy, rH * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // 4-point diffraction glint spikes
    ctx.strokeStyle = 'rgba(255,253,240,0.92)';
    ctx.lineWidth = 1.4;
    const sp = rH * 0.28;
    ctx.beginPath();
    ctx.moveTo(dx - sp, dy);
    ctx.lineTo(dx + sp, dy);
    ctx.moveTo(dx, dy - sp);
    ctx.lineTo(dx, dy + sp);
    ctx.stroke();
  }

  // Multi-ring electric neon-purple / royal-ultraviolet detonation shockwave
  if (bNorm >= 0) {
    const ease = 1 - Math.pow(1 - bNorm, 3);
    const sr = rH + ease * minD * 0.58;
    ctx.strokeStyle = isLight
      ? `rgba(217,78,0,${((1 - bNorm) * 0.85).toFixed(3)})`
      : `rgba(214,91,255,${((1 - bNorm) * 0.94).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, (1 - bNorm) * 5.2);
    ctx.beginPath();
    ctx.arc(cx, cy, sr, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = isLight
      ? `rgba(128,26,219,${((1 - bNorm) * 0.64).toFixed(3)})`
      : `rgba(188,52,255,${((1 - bNorm) * 0.68).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.8, (1 - bNorm) * 2.8);
    ctx.beginPath();
    ctx.arc(cx, cy, sr * 0.84, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Full-bleed 60fps Electric Neon-Purple Gargantua WebGL2 Black Hole Singularity (Event Horizon)
 * and Museum Archival Total Solar Eclipse on pure Vellum Ivory #F5F3EC (Daylight), complete with
 * double photon ring, ultraviolet plasma ribbons & Keplerian knots, relativistic Doppler beaming,
 * Einstein-ring star arcs, multi-ring supernova shockwaves, synchronized centerYRatio, Canvas2D
 * fallback, reduced-motion static mode, and visibility/viewport auto-pause.
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
            gl = candidate;
            prog = p;
            bindUniforms(gl, prog);
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
      if (gl && !gl.isContextLost()) gl.viewport(0, 0, pw, ph);
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
        prog = restored;
        bindUniforms(gl, prog);
        syncSize();
        drawFrame(targetRef.current.reduced ? STATIC_TIME : elapsed);
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

      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      elapsed += dt;

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
      // Crisp quick transition on theme & vertical center alignment
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
      document.removeEventListener('visibilitychange', onVisChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
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
