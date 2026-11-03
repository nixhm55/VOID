import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from 'react';
import './liquid-glass-orb.css';

export type LiquidGlassOrbState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'searching'
  | 'speaking'
  | 'success'
  | 'error';

export type ThinkingAnimation = 'ripples' | 'spiral' | 'scan';
export type SearchingAnimation = 'lens' | 'small-lens';
export type GrainMode = 'fine' | 'coarse' | 'none';
export type FlowType = 'drift' | 'swirl' | 'pulse';

export interface LiquidGlassOrbHandle {
  setAudioLevel: (level: number) => void;
}

export interface LiquidGlassOrbProps {
  baseColor?: string;
  colorA?: string;
  colorB?: string;
  colorC?: string;
  seed?: number;
  startTime?: number;
  speed?: number;
  distortion?: number;
  clusterCount?: number;
  clusterIntensity?: number;
  clusterSize?: number;
  scale?: number;
  spotSize?: number;
  rotation?: number;
  softness?: number;
  relief?: number;
  refraction?: number;
  roughness?: number;
  reflection?: number;
  caustics?: number;
  dispersion?: number;
  colorDistribution?: number;
  grain?: number;
  grainSize?: number;
  paused?: boolean;
  animateDistortion?: boolean;
  grainMode?: GrainMode;
  flowType?: FlowType;
  state?: LiquidGlassOrbState;
  thinkingAnimation?: ThinkingAnimation;
  searchingAnimation?: SearchingAnimation;
  preserveWhites?: boolean;
  animateEntrance?: boolean;
  size?: number;
  audioLevel?: number;
  getAudioLevel?: () => number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_foldPhase;
uniform float u_seed;
uniform vec3 u_baseColor;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;
uniform float u_distortion;
uniform float u_clusterCount;
uniform float u_clusterIntensity;
uniform float u_clusterSize;
uniform float u_scale;
uniform float u_spotSize;
uniform float u_rotation;
uniform float u_softness;
uniform float u_relief;
uniform float u_refraction;
uniform float u_roughness;
uniform float u_reflection;
uniform float u_caustics;
uniform float u_dispersion;
uniform float u_colorDist;
uniform float u_grain;
uniform float u_grainSize;
uniform int u_preserveWhites;
uniform float u_audio;

// State weights (smoothly interpolated 0..1)
uniform float u_wIdle;
uniform float u_wListening;
uniform float u_wThinking;
uniform float u_wSearching;
uniform float u_wSpeaking;
uniform float u_wSuccess;
uniform float u_wError;

uniform int u_thinkingMode;   // 0=ripples, 1=spiral, 2=scan
uniform int u_searchingMode;  // 0=lens, 1=small-lens
uniform vec2 u_lensPos;
uniform float u_lensRadius;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.03 + vec2(1.9, 7.3);
    a *= 0.5;
  }
  return v;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdArc(vec2 p, float r, float halfAngle) {
  // U-shaped arc opening upward (bottom half of circle)
  vec2 q = vec2(abs(p.x), -p.y);
  float ang = atan(q.x, q.y);
  if (ang < halfAngle) {
    return abs(length(q) - r);
  }
  vec2 endPt = vec2(sin(halfAngle), cos(halfAngle)) * r;
  return length(q - endPt);
}

// Smooth height contribution for 3D embossed glass shapes
float ridgeProfile(float d, float width, float softness) {
  float s = clamp(1.0 - d / max(0.001, width), 0.0, 1.0);
  return smoothstep(0.0, 1.0, pow(s, mix(1.2, 0.65, softness)));
}

// 1. Listening: Embossed 3D Glass Microphone
float micRelief(vec2 p, float pulse) {
  vec2 mp = p / (1.0 + pulse * 0.06);
  // Capsule head centered at (0.0, 0.14)
  float dCapsule = sdSegment(mp, vec2(0.0, 0.02), vec2(0.0, 0.28)) - 0.125;
  float hHead = smoothstep(0.06, -0.04, dCapsule) * (0.85 + 0.25 * cos(clamp(dCapsule / 0.125, -1.0, 1.0) * 1.57));

  // U-shaped holder cradle around capsule
  float dCradle = sdArc(mp - vec2(0.0, 0.12), 0.245, 1.62) - 0.032;
  float hCradle = smoothstep(0.045, -0.015, dCradle) * 0.78;

  // Vertical stem
  float dStem = sdSegment(mp, vec2(0.0, -0.125), vec2(0.0, -0.32)) - 0.032;
  float hStem = smoothstep(0.045, -0.015, dStem) * 0.75;

  // Horizontal base
  float dBase = sdSegment(mp, vec2(-0.14, -0.32), vec2(0.14, -0.32)) - 0.032;
  float hBase = smoothstep(0.045, -0.015, dBase) * 0.75;

  // Voice wave rings around microphone when audio is active
  float r = length(mp - vec2(0.0, 0.12));
  float waveRing = sin(r * 22.0 - u_time * 5.5) * exp(-max(0.0, r - 0.26) * 4.5) * pulse * 0.32;

  return max(max(hHead, hCradle), max(hStem, hBase)) + waveRing;
}

// 2. Thinking: Ripples / Spiral / Scan
float thinkingRelief(vec2 p, float t, int mode) {
  float r = length(p);
  if (mode == 1) {
    // Two-arm spiral
    float a = atan(p.y, p.x);
    float sp = sin(a * 2.0 - r * 11.0 + t * 2.6);
    return (sp * 0.5 + 0.5) * (1.0 - smoothstep(0.75, 0.98, r)) * 0.72;
  } else if (mode == 2) {
    // Curved scanning folds
    float bend = p.y + 0.22 * (p.x * p.x);
    float sc = sin(bend * 9.5 - t * 2.4) * 0.5 + 0.5;
    return pow(sc, 1.5) * (1.0 - smoothstep(0.78, 0.98, r)) * 0.7;
  }
  // Default: Concentric ripples (as in video at 0:02)
  float wave = cos(r * 15.5 - t * 2.8) * 0.5 + 0.5;
  float ringEnv = 1.0 - smoothstep(0.76, 0.98, r);
  return pow(wave, 1.35) * ringEnv * 0.78;
}

// 3. Searching: Magnifying Glass Lens + Handle
float searchingRelief(vec2 p, vec2 lensCenter, float lensR) {
  vec2 lp = p - lensCenter;
  float r = length(lp);
  // Raised glass rim of the magnifying lens + convex dome inside
  float dRim = abs(r - lensR) - 0.042;
  float hRim = smoothstep(0.045, -0.012, dRim) * 0.95;
  float hDome = smoothstep(lensR, 0.0, r) * 0.52 * (1.0 - (r / max(0.001, lensR)) * (r / max(0.001, lensR)) * 0.45);

  // Diagonal handle extending down-right at -45 deg
  vec2 dir = normalize(vec2(0.72, -0.72));
  vec2 hStart = lensCenter + dir * (lensR + 0.035);
  vec2 hEnd = lensCenter + dir * (lensR + 0.34);
  float dHandle = sdSegment(p, hStart, hEnd) - 0.046;
  float hHandle = smoothstep(0.045, -0.012, dHandle) * 0.88;

  return max(max(hRim, hDome), hHandle);
}

// 4. Success: Embossed 3D Checkmark
float successRelief(vec2 p) {
  vec2 a = vec2(-0.26, -0.02);
  vec2 b = vec2(-0.06, -0.22);
  vec2 c = vec2(0.30, 0.22);
  float d1 = sdSegment(p, a, b) - 0.058;
  float d2 = sdSegment(p, b, c) - 0.058;
  float d = min(d1, d2);
  return smoothstep(0.05, -0.015, d) * 0.92;
}

// 5. Error: Stationary 3D Cross
float errorRelief(vec2 p) {
  float d1 = sdSegment(p, vec2(-0.25, -0.25), vec2(0.25, 0.25)) - 0.056;
  float d2 = sdSegment(p, vec2(-0.25, 0.25), vec2(0.25, -0.25)) - 0.056;
  float d = min(d1, d2);
  return smoothstep(0.05, -0.015, d) * 0.92;
}

// Combined glass heightfield H(p)
float surfaceHeight(vec2 p) {
  float r = length(p);
  float sphereBase = sqrt(max(0.0, 1.0 - min(0.995, r * r)));

  // Organic fluid folds (Idle & Speaking)
  float ca = cos(u_rotation);
  float sa = sin(u_rotation);
  vec2 rp = mat2(ca, -sa, sa, ca) * p;
  vec2 q = rp * (1.8 + u_scale * 2.2) + vec2(u_seed * 0.13, u_seed * 0.29);

  float f1 = fbm(q + vec2(u_foldPhase * 0.22, -u_foldPhase * 0.17));
  float f2 = fbm(q * 1.65 - vec2(u_foldPhase * 0.19, u_foldPhase * 0.24) + f1 * u_distortion);
  float folds = sin((f1 * 3.2 + f2 * 2.6) * 3.14159) * 0.5 + 0.5;
  folds = pow(folds, mix(1.8, 0.85, clamp(u_softness, 0.0, 1.0)));

  // Extra speaking local wrinkle modulation
  float speakWrinkle = 0.0;
  if (u_wSpeaking > 0.001) {
    float sw = fbm(rp * 3.1 + vec2(u_foldPhase * 0.35, u_foldPhase * 0.28));
    speakWrinkle = (sw - 0.5) * u_audio * 0.38 * u_wSpeaking;
  }

  float hIdle = folds * 0.38 * (u_wIdle + u_wSpeaking) + speakWrinkle;
  float hListen = u_wListening > 0.001 ? micRelief(p, u_audio) * u_wListening : 0.0;
  float hThink = u_wThinking > 0.001 ? thinkingRelief(p, u_time, u_thinkingMode) * u_wThinking : 0.0;
  float hSearch = u_wSearching > 0.001 ? searchingRelief(p, u_lensPos, u_lensRadius) * u_wSearching : 0.0;
  float hSucc = u_wSuccess > 0.001 ? successRelief(p) * u_wSuccess : 0.0;
  float hErr = u_wError > 0.001 ? errorRelief(p) * u_wError : 0.0;

  // Ambient organic folds still gently undulate behind symbol states
  float symbolWeight = clamp(u_wListening + u_wThinking + u_wSearching + u_wSuccess + u_wError, 0.0, 1.0);
  float baseFolds = folds * 0.14 * symbolWeight;

  return sphereBase * 0.45 + (hIdle + baseFolds + hListen + hThink + hSearch + hSucc + hErr) * (u_relief * 0.22);
}

// Underlying Fluid Glass Gradient field sampled through refracted rays
vec3 sampleFluidGradient(vec2 uv, float t) {
  vec2 p = uv * (1.25 + u_spotSize * 0.55) + vec2(u_seed * 0.07, -u_seed * 0.11);
  float n1 = fbm(p + vec2(t * 0.08, -t * 0.06));
  float n2 = fbm(p * 1.8 - vec2(t * 0.07, t * 0.09) + n1 * u_distortion * 1.35);
  float clusters = sin(n1 * u_clusterCount + n2 * 3.8) * 0.5 + 0.5;
  clusters = pow(clusters, max(0.5, 2.2 - u_clusterIntensity * 0.35));

  // Diagonal light/dark sweeping bands like the ReactDrops Monochrome preset
  float sweep = smoothstep(-0.65, 0.75, uv.x * 0.75 - uv.y * 0.65 + (n2 - 0.5) * 1.15);
  float darkCore = smoothstep(0.28, 0.86, clusters * (1.0 - sweep * 0.65));
  float midTone = smoothstep(0.18, 0.78, n2 * (0.6 + 0.4 * sweep));

  vec3 col = u_baseColor;
  col = mix(col, u_colorC, clamp(midTone * 0.85, 0.0, 1.0));
  col = mix(col, u_colorB, clamp(clusters * 0.78, 0.0, 1.0));
  col = mix(col, u_colorA, clamp(darkCore * 0.92, 0.0, 1.0));

  if (u_preserveWhites == 1) {
    float whiteKeep = smoothstep(0.58, 0.92, sweep * (1.0 - darkCore * 0.7));
    col = mix(col, vec3(0.99, 0.995, 1.0), whiteKeep * 0.88);
  }
  return col;
}

void main() {
  vec2 p = v_uv;
  float r = length(p);

  // Anti-aliased circular boundary
  float pixelSize = 2.0 / max(1.0, min(u_res.x, u_res.y));
  float circleMask = 1.0 - smoothstep(0.965 - pixelSize * 1.5, 0.965 + pixelSize * 1.5, r);
  if (circleMask <= 0.001) {
    outColor = vec4(0.0);
    return;
  }

  // Finite-difference surface normals from heightfield H(p)
  float eps = 0.0065;
  float hC = surfaceHeight(p);
  float hX = surfaceHeight(p + vec2(eps, 0.0));
  float hY = surfaceHeight(p + vec2(0.0, eps));
  vec2 grad = vec2(hX - hC, hY - hC) / eps;

  // Combine with spherical rim normal for realistic 3D glass edge curvature
  float rimZ = sqrt(max(0.02, 1.0 - min(0.98, r * r)));
  vec3 normal = normalize(vec3(-grad.x * 0.55 + p.x * 0.48, -grad.y * 0.55 + p.y * 0.48, rimZ));

  // Chromatic dispersion & refraction of the fluid gradient
  vec2 refractOffset = normal.xy * (0.22 * u_refraction);
  float disp = 0.038 * u_dispersion * (0.35 + length(grad) * 0.42);

  // Inside the searching lens, magnify the fluid gradient
  vec2 sampleBase = p;
  if (u_wSearching > 0.01) {
    vec2 lp = p - u_lensPos;
    float lr = length(lp);
    if (lr < u_lensRadius) {
      float mag = mix(1.0, 0.58, smoothstep(u_lensRadius, 0.0, lr) * u_wSearching);
      sampleBase = u_lensPos + lp * mag;
    }
  }

  vec3 colR = sampleFluidGradient(sampleBase + refractOffset * (1.0 + disp), u_time);
  vec3 colG = sampleFluidGradient(sampleBase + refractOffset, u_time);
  vec3 colB = sampleFluidGradient(sampleBase + refractOffset * (1.0 - disp), u_time);
  vec3 refractedColor = vec3(colR.r, colG.g, colB.b);

  // Subtle spectral edge prism dispersion (cyan/blue/amber/violet fringes along steep glass bevels)
  float curvature = clamp(length(grad) * 0.24, 0.0, 1.0);
  float angle = atan(normal.y, normal.x);
  vec3 prismTint = mix(
    vec3(0.24, 0.62, 1.0),
    vec3(0.98, 0.74, 0.28),
    sin(angle * 2.0 + hC * 6.0) * 0.5 + 0.5
  );
  refractedColor = mix(refractedColor, prismTint, curvature * 0.28 * clamp(u_dispersion, 0.0, 1.5));

  // Studio softbox specular reflections & Fresnel rim light
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 lightDir1 = normalize(vec3(-0.48, 0.56, 0.68));
  vec3 lightDir2 = normalize(vec3(0.52, -0.44, 0.73));
  vec3 half1 = normalize(lightDir1 + viewDir);
  vec3 half2 = normalize(lightDir2 + viewDir);

  float specPower = mix(42.0, 10.0, clamp(u_roughness, 0.0, 1.0));
  float spec1 = pow(max(0.0, dot(normal, half1)), specPower) * u_reflection;
  float spec2 = pow(max(0.0, dot(normal, half2)), specPower * 0.7) * u_reflection * 0.45;
  float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.2) * u_reflection * 0.55;

  // Inner rim shadow & glass bevel depth
  float edgeBevel = smoothstep(0.82, 0.965, r);
  float topRimLight = smoothstep(0.965, 0.89, r) * smoothstep(0.82, 0.93, r) * (0.55 + 0.45 * (-p.x + p.y));

  vec3 finalColor = refractedColor;
  finalColor += vec3(1.0) * (spec1 * 0.72 + spec2 * 0.38 + topRimLight * 0.45);
  finalColor = mix(finalColor, vec3(0.96, 0.98, 1.0), fresnel * 0.42);
  finalColor *= 1.0 - edgeBevel * 0.18;

  // Fine film grain
  if (u_grain > 0.001) {
    float g = hash21(floor(gl_FragCoord.xy / max(1.0, u_grainSize)) + fract(u_time * 17.0)) - 0.5;
    finalColor += g * u_grain * 0.11;
  }

  outColor = vec4(clamp(finalColor, 0.0, 1.0), circleMask);
}
`;

function hexToRgbNorm(hex: string): [number, number, number] {
  const clean = String(hex || '#ffffff').replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) / 255,
      parseInt(clean[1] + clean[1], 16) / 255,
      parseInt(clean[2] + clean[2], 16) / 255,
    ];
  }
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255,
    ];
  }
  return [1, 1, 1];
}

// Cubic bezier evaluator for searchingAnimation="lens" (0.167, 0.723, 0.448, 0.924)
function sampleCubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  let u = t;
  for (let i = 0; i < 5; i++) {
    const curX =
      3 * (1 - u) * (1 - u) * u * x1 +
      3 * (1 - u) * u * u * x2 +
      u * u * u -
      t;
    const dx =
      3 * (1 - u) * (1 - u) * x1 +
      6 * (1 - u) * u * (x2 - x1) +
      3 * u * u * (1 - x2);
    if (Math.abs(dx) < 1e-5) break;
    u = Math.max(0, Math.min(1, u - curX / dx));
  }
  return (
    3 * (1 - u) * (1 - u) * u * y1 +
    3 * (1 - u) * u * u * y2 +
    u * u * u
  );
}

export const LiquidGlassOrb = forwardRef<LiquidGlassOrbHandle, LiquidGlassOrbProps>(
  function LiquidGlassOrb(
    {
      baseColor = '#ffffff',
      colorA = '#000000',
      colorB = '#4d4d4d',
      colorC = '#a9a9a9',
      seed = 145,
      startTime = 18,
      speed = 1.5,
      distortion = 0.8,
      clusterCount = 7.2,
      clusterIntensity = 3,
      clusterSize = 22.5,
      scale = 0.23,
      spotSize = 1.15,
      rotation = 0,
      softness = 0.31,
      relief = 2.94,
      refraction = 0.65,
      roughness = 0,
      reflection = 1.3,
      caustics = 0,
      dispersion = 1,
      colorDistribution = 0,
      grain = 0.3,
      grainSize = 1,
      paused = false,
      animateDistortion = true,
      grainMode = 'fine',
      flowType = 'drift',
      state = 'idle',
      thinkingAnimation = 'ripples',
      searchingAnimation = 'lens',
      preserveWhites = true,
      animateEntrance = true,
      size = 250,
      audioLevel = 0.55,
      getAudioLevel,
      className = '',
      style,
      onClick,
    },
    ref
  ) {
    void grainMode;
    void flowType;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const liveAudioRef = useRef<number>(audioLevel);
    const propAudioRef = useRef<number>(audioLevel);
    propAudioRef.current = audioLevel;

    const stateRef = useRef<LiquidGlassOrbState>(state);
    stateRef.current = state;

    const thinkingRef = useRef<ThinkingAnimation>(thinkingAnimation);
    thinkingRef.current = thinkingAnimation;

    const searchingRef = useRef<SearchingAnimation>(searchingAnimation);
    searchingRef.current = searchingAnimation;

    useImperativeHandle(
      ref,
      () => ({
        setAudioLevel: (level: number) => {
          liveAudioRef.current = Math.max(0, Math.min(1, Number(level) || 0));
        },
      }),
      []
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      });
      if (!gl) return;

      const compile = (type: number, src: string) => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };

      const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      if (!vs || !fs) return;

      const prog = gl.createProgram();
      if (!prog) return;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.deleteProgram(prog);
        return;
      }

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );

      const posLoc = gl.getAttribLocation(prog, 'a_pos');
      const uRes = gl.getUniformLocation(prog, 'u_res');
      const uTime = gl.getUniformLocation(prog, 'u_time');
      const uFoldPhase = gl.getUniformLocation(prog, 'u_foldPhase');
      const uSeed = gl.getUniformLocation(prog, 'u_seed');
      const uBaseColor = gl.getUniformLocation(prog, 'u_baseColor');
      const uColorA = gl.getUniformLocation(prog, 'u_colorA');
      const uColorB = gl.getUniformLocation(prog, 'u_colorB');
      const uColorC = gl.getUniformLocation(prog, 'u_colorC');
      const uDistortion = gl.getUniformLocation(prog, 'u_distortion');
      const uClusterCount = gl.getUniformLocation(prog, 'u_clusterCount');
      const uClusterIntensity = gl.getUniformLocation(prog, 'u_clusterIntensity');
      const uClusterSize = gl.getUniformLocation(prog, 'u_clusterSize');
      const uScale = gl.getUniformLocation(prog, 'u_scale');
      const uSpotSize = gl.getUniformLocation(prog, 'u_spotSize');
      const uRotation = gl.getUniformLocation(prog, 'u_rotation');
      const uSoftness = gl.getUniformLocation(prog, 'u_softness');
      const uRelief = gl.getUniformLocation(prog, 'u_relief');
      const uRefraction = gl.getUniformLocation(prog, 'u_refraction');
      const uRoughness = gl.getUniformLocation(prog, 'u_roughness');
      const uReflection = gl.getUniformLocation(prog, 'u_reflection');
      const uCaustics = gl.getUniformLocation(prog, 'u_caustics');
      const uDispersion = gl.getUniformLocation(prog, 'u_dispersion');
      const uColorDist = gl.getUniformLocation(prog, 'u_colorDist');
      const uGrain = gl.getUniformLocation(prog, 'u_grain');
      const uGrainSize = gl.getUniformLocation(prog, 'u_grainSize');
      const uPreserveWhites = gl.getUniformLocation(prog, 'u_preserveWhites');
      const uAudio = gl.getUniformLocation(prog, 'u_audio');

      const uWIdle = gl.getUniformLocation(prog, 'u_wIdle');
      const uWListening = gl.getUniformLocation(prog, 'u_wListening');
      const uWThinking = gl.getUniformLocation(prog, 'u_wThinking');
      const uWSearching = gl.getUniformLocation(prog, 'u_wSearching');
      const uWSpeaking = gl.getUniformLocation(prog, 'u_wSpeaking');
      const uWSuccess = gl.getUniformLocation(prog, 'u_wSuccess');
      const uWError = gl.getUniformLocation(prog, 'u_wError');

      const uThinkingMode = gl.getUniformLocation(prog, 'u_thinkingMode');
      const uSearchingMode = gl.getUniformLocation(prog, 'u_searchingMode');
      const uLensPos = gl.getUniformLocation(prog, 'u_lensPos');
      const uLensRadius = gl.getUniformLocation(prog, 'u_lensRadius');

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pxSize = Math.max(64, Math.round(size * dpr));
      canvas.width = pxSize;
      canvas.height = pxSize;

      const baseRgb = hexToRgbNorm(baseColor);
      const colARgb = hexToRgbNorm(colorA);
      const colBRgb = hexToRgbNorm(colorB);
      const colCRgb = hexToRgbNorm(colorC);

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      const weights = {
        idle: stateRef.current === 'idle' ? 1 : 0,
        listening: stateRef.current === 'listening' ? 1 : 0,
        thinking: stateRef.current === 'thinking' ? 1 : 0,
        searching: stateRef.current === 'searching' ? 1 : 0,
        speaking: stateRef.current === 'speaking' ? 1 : 0,
        success: stateRef.current === 'success' ? 1 : 0,
        error: stateRef.current === 'error' ? 1 : 0,
      };

      let rafId = 0;
      const mountTime = performance.now();
      let lastTime = mountTime;
      let foldPhase = startTime;
      let smoothedAudio = 0.2;

      const render = (now: number) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        const elapsed = (now - mountTime) / 1000;

        // 1.2-second power4.out entrance from 8% (0.08) to 100% (1.0)
        let entranceScale = 1;
        if (animateEntrance && !prefersReducedMotion) {
          const tEnt = Math.min(1, elapsed / 1.2);
          const eased = 1 - Math.pow(1 - tEnt, 4);
          entranceScale = 0.08 + 0.92 * eased;
        }

        // Smoothly interpolate state weights
        const curState = stateRef.current;
        const lerpRate = Math.min(1, dt * 6.5);
        weights.idle += ((curState === 'idle' ? 1 : 0) - weights.idle) * lerpRate;
        weights.listening += ((curState === 'listening' ? 1 : 0) - weights.listening) * lerpRate;
        weights.thinking += ((curState === 'thinking' ? 1 : 0) - weights.thinking) * lerpRate;
        weights.searching += ((curState === 'searching' ? 1 : 0) - weights.searching) * lerpRate;
        weights.speaking += ((curState === 'speaking' ? 1 : 0) - weights.speaking) * lerpRate;
        weights.success += ((curState === 'success' ? 1 : 0) - weights.success) * lerpRate;
        weights.error += ((curState === 'error' ? 1 : 0) - weights.error) * lerpRate;

        // Live audio level or irregular syllable simulation
        const rawExternal = getAudioLevel
          ? getAudioLevel()
          : liveAudioRef.current ?? propAudioRef.current;
        const simSyllable =
          0.35 +
          0.3 * Math.sin(elapsed * 6.3) * Math.sin(elapsed * 2.1 + 0.7) +
          0.2 * Math.cos(elapsed * 11.4);
        const targetAudio =
          rawExternal > 0.02
            ? Math.max(0, Math.min(1, rawExternal))
            : curState === 'listening' || curState === 'speaking'
              ? Math.max(0.08, simSyllable * (propAudioRef.current || 0.55))
              : 0;
        smoothedAudio += (targetAudio - smoothedAudio) * Math.min(1, dt * 10);

        // Speaking adds at most 10% speed to native folds with smoothed voice envelope
        const effectiveSpeed =
          paused || prefersReducedMotion
            ? 0
            : speed * (1 + 0.1 * smoothedAudio * weights.speaking);
        if (animateDistortion) {
          foldPhase += dt * effectiveSpeed;
        }

        // Subtle scale & motion when speaking or listening
        const voiceScaleBoost =
          1 +
          smoothedAudio * (0.045 * weights.speaking + 0.03 * weights.listening);
        const totalScale = entranceScale * voiceScaleBoost;
        canvas.style.transform = `scale(${totalScale.toFixed(4)})`;

        // Searching lens trajectory: 2.83-second elliptical laps tilted 45 degrees
        const lapPeriod = 2.83 / Math.max(0.25, speed / 1.5);
        const lapProgress = (elapsed % lapPeriod) / lapPeriod;
        const bezierPhase = sampleCubicBezier(
          lapProgress,
          0.167,
          0.723,
          0.448,
          0.924
        );
        // Slowest pass at 1:30 on the clock (45 deg)
        const theta = bezierPhase * Math.PI * 2 + Math.PI * 0.25;
        const isSmallLens = searchingRef.current === 'small-lens';
        const rx = isSmallLens ? 0.26 : 0.22;
        const ry = isSmallLens ? 0.15 : 0.13;
        const ex = Math.cos(theta) * rx;
        const ey = Math.sin(theta) * ry;
        const cos45 = 0.70710678;
        const lensX = (ex - ey) * cos45 - 0.04;
        const lensY = (ex + ey) * cos45 + 0.04;
        const lensRadius = isSmallLens ? 0.22 : 0.31;

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, startTime + elapsed * (paused ? 0 : speed * 0.65));
        gl.uniform1f(uFoldPhase, foldPhase);
        gl.uniform1f(uSeed, seed);
        gl.uniform3f(uBaseColor, baseRgb[0], baseRgb[1], baseRgb[2]);
        gl.uniform3f(uColorA, colARgb[0], colARgb[1], colARgb[2]);
        gl.uniform3f(uColorB, colBRgb[0], colBRgb[1], colBRgb[2]);
        gl.uniform3f(uColorC, colCRgb[0], colCRgb[1], colCRgb[2]);
        gl.uniform1f(uDistortion, distortion);
        gl.uniform1f(uClusterCount, clusterCount);
        gl.uniform1f(uClusterIntensity, clusterIntensity);
        gl.uniform1f(uClusterSize, clusterSize);
        gl.uniform1f(uScale, scale);
        gl.uniform1f(uSpotSize, spotSize);
        gl.uniform1f(uRotation, (rotation * Math.PI) / 180);
        gl.uniform1f(uSoftness, softness);
        gl.uniform1f(uRelief, relief);
        gl.uniform1f(uRefraction, refraction);
        gl.uniform1f(uRoughness, roughness);
        gl.uniform1f(uReflection, reflection);
        gl.uniform1f(uCaustics, caustics);
        gl.uniform1f(uDispersion, dispersion);
        gl.uniform1f(uColorDist, colorDistribution);
        gl.uniform1f(uGrain, grain);
        gl.uniform1f(uGrainSize, grainSize);
        gl.uniform1i(uPreserveWhites, preserveWhites ? 1 : 0);
        gl.uniform1f(uAudio, smoothedAudio);

        gl.uniform1f(uWIdle, weights.idle);
        gl.uniform1f(uWListening, weights.listening);
        gl.uniform1f(uWThinking, weights.thinking);
        gl.uniform1f(uWSearching, weights.searching);
        gl.uniform1f(uWSpeaking, weights.speaking);
        gl.uniform1f(uWSuccess, weights.success);
        gl.uniform1f(uWError, weights.error);

        const tMode =
          thinkingRef.current === 'spiral'
            ? 1
            : thinkingRef.current === 'scan'
              ? 2
              : 0;
        gl.uniform1i(uThinkingMode, tMode);
        gl.uniform1i(uSearchingMode, isSmallLens ? 1 : 0);
        gl.uniform2f(uLensPos, lensX, lensY);
        gl.uniform1f(uLensRadius, lensRadius);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        rafId = window.requestAnimationFrame(render);
      };

      rafId = window.requestAnimationFrame(render);

      return () => {
        window.cancelAnimationFrame(rafId);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      };
    }, [
      animateDistortion,
      animateEntrance,
      baseColor,
      caustics,
      clusterCount,
      clusterIntensity,
      clusterSize,
      colorA,
      colorB,
      colorC,
      colorDistribution,
      dispersion,
      distortion,
      getAudioLevel,
      grain,
      grainSize,
      paused,
      preserveWhites,
      reflection,
      refraction,
      relief,
      rotation,
      roughness,
      scale,
      seed,
      size,
      softness,
      speed,
      spotSize,
      startTime,
    ]);

    return (
      <div
        className={`liquid-glass-orb-root ${className}`.trim()}
        style={{ '--lgo-size': `${size}px`, ...style } as CSSProperties}
        onClick={onClick}
        data-testid="liquid-glass-orb"
        data-orb-state={state}
      >
        <canvas ref={canvasRef} className="liquid-glass-orb-canvas" />
      </div>
    );
  }
);
