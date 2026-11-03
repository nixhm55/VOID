import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import './soap-bubble.css';

export interface SoapBubbleMaterialProps {
  backdrop?: RefObject<HTMLElement | null> | HTMLElement | null;
  radius?: number;
  bevel?: number;
  iridescence?: number;
  filmScale?: number;
  oilOpacity?: number;
  oilCoverage?: number;
  oilEdge?: number;
  oilEdgeFade?: number;
  clearCenter?: number;
  tint?: string;
  soapColor?: string;
  soapPalette?: 'natural' | 'custom';
  soapPaletteRed?: string;
  soapPaletteGold?: string;
  soapPaletteGreen?: string;
  soapPaletteCyan?: string;
  soapPaletteBlue?: string;
  soapPaletteViolet?: string;
  soapShadeColor?: string;
  soapHighlightColor?: string;
  thickness?: number;
  drainage?: number;
  swirl?: number;
  reflectivity?: number;
  mirage?: number;
  seeThrough?: number;
  seeThroughBend?: number;
  opacity?: number;
  reach?: number;
  refraction?: number;
  glass?: number;
  dispersion?: number;
  environment?: 'studio' | 'window' | 'sky' | 'soft' | 'auto';
  tilt?: number;
  windowLight?: boolean;
  windowStyle?: 'edge' | 'bubble';
  windowLength?: number;
  windowMargin?: number;
  windowBend?: number;
  windowWidth?: number;
  windowHead?: number;
  windowTail?: number;
  glintShape?: 'auto' | 'dot' | 'dash' | 'pair' | 'none';
  glintSize?: number;
  glintIntensity?: number;
  glintDistance?: number;
  glintHeight?: number;
  windowSize?: number;
  windowIntensity?: number;
  windowGradient?: number;
  windowTwin?: boolean;
  windowTwinShape?: 'mirror' | 'arc' | 'crescent' | 'streak' | 'dot';
  keyLight?: boolean;
  topLength?: number;
  topFade?: number;
  topTail?: number;
  bottomShade?: boolean;
  bottomShadeColor?: string;
  wobble?: number;
  speed?: number;
  seed?: number;
  paused?: boolean;
  maxDpr?: number;
  children?: ReactNode;
}

const DEFAULT_MATERIAL: Required<
  Omit<SoapBubbleMaterialProps, 'backdrop' | 'children'>
> = {
  radius: 14,
  bevel: 24,
  iridescence: 0.5,
  filmScale: 1,
  oilOpacity: 1,
  oilCoverage: 0.73,
  oilEdge: 0,
  oilEdgeFade: 2.33,
  clearCenter: 0.57,
  tint: '#ffffff00',
  soapColor: 'auto',
  soapPalette: 'natural',
  soapPaletteRed: '#ff6685',
  soapPaletteGold: '#f6d365',
  soapPaletteGreen: '#83e8a9',
  soapPaletteCyan: '#60dce9',
  soapPaletteBlue: '#7799ff',
  soapPaletteViolet: '#c084fc',
  soapShadeColor: 'auto',
  soapHighlightColor: 'auto',
  thickness: 520,
  drainage: 0.6,
  swirl: 0.65,
  reflectivity: 1.6,
  mirage: 1,
  seeThrough: 0,
  seeThroughBend: 0.37,
  opacity: -1,
  reach: 2.6,
  refraction: 0.08,
  glass: 0.35,
  dispersion: 1,
  environment: 'auto',
  tilt: 1,
  windowLight: true,
  windowStyle: 'edge',
  windowLength: 1.3,
  windowMargin: 0.85,
  windowBend: 0.75,
  windowWidth: 0.8,
  windowHead: 0.7,
  windowTail: 0.6,
  glintShape: 'auto',
  glintSize: 1.65,
  glintIntensity: 0,
  glintDistance: -0.45,
  glintHeight: 0.65,
  windowSize: 0.75,
  windowIntensity: 0.85,
  windowGradient: 0.96,
  windowTwin: false,
  windowTwinShape: 'mirror',
  keyLight: true,
  topLength: 1,
  topFade: 0.4,
  topTail: 1,
  bottomShade: true,
  bottomShadeColor: '#ffffff',
  wobble: 1,
  speed: 1,
  seed: 7,
  paused: false,
  maxDpr: 2,
};

const SoapBubbleMaterialContext =
  createContext<SoapBubbleMaterialProps>(DEFAULT_MATERIAL);

export function SoapBubbleMaterial({
  children,
  ...props
}: SoapBubbleMaterialProps) {
  const parent = useContext(SoapBubbleMaterialContext);
  const merged = useMemo(() => ({ ...parent, ...props }), [parent, props]);
  return (
    <SoapBubbleMaterialContext.Provider value={merged}>
      <div className="soap-bubble-material-scope">{children}</div>
    </SoapBubbleMaterialContext.Provider>
  );
}

const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_press;
uniform float u_radius;
uniform float u_bevel;
uniform float u_iridescence;
uniform float u_oilCoverage;
uniform float u_oilEdgeFade;
uniform float u_clearCenter;
uniform float u_swirl;
uniform float u_drainage;
uniform float u_windowLength;
uniform float u_windowMargin;
uniform float u_windowBend;
uniform float u_windowSize;
uniform float u_windowWidth;
uniform float u_windowGradient;
uniform float u_windowHead;
uniform float u_windowTail;
uniform float u_windowIntensity;
uniform float u_windowTwin;
uniform float u_glintSize;
uniform float u_glintIntensity;
uniform float u_glintDistance;
uniform float u_glintHeight;
uniform vec3 u_bottomShadeColor;
uniform float u_seed;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

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
    mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = rot * p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

vec3 soapSpectrum(float phase) {
  vec3 cRed = vec3(1.0, 0.40, 0.52);
  vec3 cGold = vec3(0.965, 0.827, 0.396);
  vec3 cGreen = vec3(0.514, 0.910, 0.663);
  vec3 cCyan = vec3(0.376, 0.863, 0.914);
  vec3 cBlue = vec3(0.467, 0.600, 1.0);
  vec3 cViolet = vec3(0.753, 0.518, 0.988);

  float t = fract(phase) * 6.0;
  int idx = int(floor(t));
  float f = smoothstep(0.0, 1.0, fract(t));
  if (idx == 0) return mix(cRed, cGold, f);
  if (idx == 1) return mix(cGold, cGreen, f);
  if (idx == 2) return mix(cGreen, cCyan, f);
  if (idx == 3) return mix(cCyan, cBlue, f);
  if (idx == 4) return mix(cBlue, cViolet, f);
  return mix(cViolet, cRed, f);
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  vec2 halfSize = u_res * 0.5;
  vec2 p = px - halfSize;

  float r = clamp(u_radius, 2.0, min(halfSize.x, halfSize.y) - 0.5);
  float d = sdRoundBox(p, halfSize - 0.5, r);

  if (d > 1.0) {
    outColor = vec4(0.0);
    return;
  }

  float edgeAlpha = 1.0 - smoothstep(-0.75, 0.75, d);
  float distIn = max(0.0, -d);
  float minDim = min(halfSize.x, halfSize.y);
  float normDist = clamp(distIn / max(1.0, minDim), 0.0, 1.0);

  // Bevel profile along the rounded-rectangle perimeter
  float bevelPx = max(6.0, min(u_bevel, minDim * 0.92));
  float rimFactor = 1.0 - smoothstep(0.0, bevelPx, distIn);
  float rimCurve = pow(rimFactor, max(0.85, u_oilEdgeFade * 0.72));

  // Clear center mask (clearCenter + oilEdgeFade clears the middle while keeping oil on the rim)
  float centerClearMask = mix(1.0, rimCurve, clamp(u_clearCenter * 0.9 + (u_oilEdgeFade - 1.0) * 0.25, 0.0, 0.98));

  // Swirling Marangoni thin-film interference
  vec2 flowUv = p / max(24.0, minDim * 1.45);
  flowUv += u_pointer * 0.14;
  float n1 = fbm(flowUv * 1.65 + vec2(u_time * 0.16, -u_time * 0.11) + u_seed * 0.37);
  float n2 = fbm(flowUv * 2.4 - vec2(u_time * 0.12, u_time * 0.19) + n1 * u_swirl);
  float drainageShift = (px.y / max(1.0, u_res.y)) * u_drainage * 0.55;
  float filmPhase = n1 * 0.9 + n2 * 0.75 + drainageShift + rimFactor * 0.65;

  float coverageMask = smoothstep(1.0 - clamp(u_oilCoverage, 0.05, 1.0), 1.0, n1 * 0.65 + rimFactor * 0.65);
  vec3 oilCol = soapSpectrum(filmPhase);

  float oilStrength = clamp(u_iridescence, 0.0, 1.5) * coverageMask * centerClearMask;

  // Window reflection along top-left corner and top edge following the rounded-rectangle contour
  float marginPx = clamp(u_windowMargin * 4.2, 1.8, 10.0);
  float bandThick = clamp(u_windowWidth * u_windowSize * 2.8, 1.1, 5.5);
  float bandDist = abs(distIn - marginPx);
  float bandProfile = exp(-pow(bandDist / bandThick, 2.0));

  // Top-left to top-right progression
  float xNorm = clamp((px.x - r * 0.15) / max(1.0, u_res.x * clamp(u_windowLength * 0.62, 0.25, 0.98)), 0.0, 1.0);
  float topMask = smoothstep(halfSize.y * 1.05, 2.0, px.y + (1.0 - u_windowBend) * 6.0);
  float headShape = smoothstep(0.0, max(0.04, 0.14 * u_windowHead), xNorm);
  float tailFade = pow(max(0.0, 1.0 - xNorm), mix(0.65, 2.35, clamp(u_windowGradient, 0.0, 1.0)) / max(0.25, u_windowTail));
  float windowHighlight = bandProfile * topMask * headShape * tailFade * u_windowIntensity;

  // Optional glint past the window
  float glint = 0.0;
  if (u_glintIntensity > 0.001) {
    vec2 glintCenter = vec2(r + u_res.x * 0.42 + u_glintDistance * 18.0, marginPx + 2.0 - u_glintHeight * 2.5);
    float gd = length(px - glintCenter) / max(1.5, u_glintSize * 2.5);
    glint = exp(-gd * gd * 2.2) * u_glintIntensity;
  }

  // Optional twin window reflection at bottom-right
  float twinHighlight = 0.0;
  if (u_windowTwin > 0.5) {
    float xTwin = clamp((u_res.x - px.x - r * 0.15) / max(1.0, u_res.x * 0.55), 0.0, 1.0);
    float botMask = smoothstep(halfSize.y * 0.9, u_res.y - 2.0, px.y);
    twinHighlight = bandProfile * botMask * smoothstep(0.0, 0.15, xTwin) * pow(1.0 - xTwin, 1.6) * u_windowIntensity * 0.42;
  }

  // Soft bottom shade along the lower inner rim
  float bottomRim = smoothstep(u_res.y * 0.52, u_res.y - 1.0, px.y) * exp(-pow(distIn / max(3.0, bevelPx * 0.52), 1.65));
  vec3 bottomGlow = u_bottomShadeColor * bottomRim * 0.26;

  // Crisp outer rim specular edge
  float outerRim = exp(-pow(distIn / 1.35, 2.0)) * 0.46;

  vec3 color = vec3(0.0);
  color += oilCol * oilStrength * 0.72;
  color += vec3(0.98, 0.99, 1.0) * (windowHighlight * 0.88 + glint + twinHighlight + outerRim * 0.55);
  color += bottomGlow;

  float totalAlpha = clamp(
    oilStrength * 0.52 +
      windowHighlight * 0.78 +
      glint +
      twinHighlight +
      bottomRim * 0.24 +
      outerRim * 0.45,
    0.0,
    0.95
  ) * edgeAlpha;

  outColor = vec4(color, totalAlpha);
}
`;

function useSoapBubbleCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  props: Required<Omit<SoapBubbleMaterialProps, 'backdrop' | 'children'>>
) {
  const pointerRef = useRef<{ x: number; y: number; press: number }>({
    x: 0,
    y: 0,
    press: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

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

    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
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
    const uPointer = gl.getUniformLocation(prog, 'u_pointer');
    const uPress = gl.getUniformLocation(prog, 'u_press');
    const uRadius = gl.getUniformLocation(prog, 'u_radius');
    const uBevel = gl.getUniformLocation(prog, 'u_bevel');
    const uIridescence = gl.getUniformLocation(prog, 'u_iridescence');
    const uOilCoverage = gl.getUniformLocation(prog, 'u_oilCoverage');
    const uOilEdgeFade = gl.getUniformLocation(prog, 'u_oilEdgeFade');
    const uClearCenter = gl.getUniformLocation(prog, 'u_clearCenter');
    const uSwirl = gl.getUniformLocation(prog, 'u_swirl');
    const uDrainage = gl.getUniformLocation(prog, 'u_drainage');
    const uWindowLength = gl.getUniformLocation(prog, 'u_windowLength');
    const uWindowMargin = gl.getUniformLocation(prog, 'u_windowMargin');
    const uWindowBend = gl.getUniformLocation(prog, 'u_windowBend');
    const uWindowSize = gl.getUniformLocation(prog, 'u_windowSize');
    const uWindowWidth = gl.getUniformLocation(prog, 'u_windowWidth');
    const uWindowGradient = gl.getUniformLocation(prog, 'u_windowGradient');
    const uWindowHead = gl.getUniformLocation(prog, 'u_windowHead');
    const uWindowTail = gl.getUniformLocation(prog, 'u_windowTail');
    const uWindowIntensity = gl.getUniformLocation(prog, 'u_windowIntensity');
    const uWindowTwin = gl.getUniformLocation(prog, 'u_windowTwin');
    const uGlintSize = gl.getUniformLocation(prog, 'u_glintSize');
    const uGlintIntensity = gl.getUniformLocation(prog, 'u_glintIntensity');
    const uGlintDistance = gl.getUniformLocation(prog, 'u_glintDistance');
    const uGlintHeight = gl.getUniformLocation(prog, 'u_glintHeight');
    const uBottomShadeColor = gl.getUniformLocation(prog, 'u_bottomShadeColor');
    const uSeed = gl.getUniformLocation(prog, 'u_seed');

    const parseHexRgb = (hex: string): [number, number, number] => {
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
    };

    let width = 300;
    let height = 46;
    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(props.maxDpr || 2, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      const targetW = Math.max(1, Math.round(width * dpr));
      const targetH = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };
    syncSize();

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);

    let rafId = 0;
    const startTime = performance.now();
    const shadeRgb = parseHexRgb(props.bottomShadeColor);

    const render = (now: number) => {
      const elapsed = props.paused ? 0 : ((now - startTime) / 1000) * props.speed;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uPointer, pointerRef.current.x, pointerRef.current.y);
      gl.uniform1f(uPress, pointerRef.current.press);
      gl.uniform1f(uRadius, props.radius);
      gl.uniform1f(uBevel, props.bevel);
      gl.uniform1f(uIridescence, props.iridescence);
      gl.uniform1f(uOilCoverage, props.oilCoverage);
      gl.uniform1f(uOilEdgeFade, props.oilEdgeFade);
      gl.uniform1f(uClearCenter, props.clearCenter);
      gl.uniform1f(uSwirl, props.swirl);
      gl.uniform1f(uDrainage, props.drainage);
      gl.uniform1f(uWindowLength, props.windowLength);
      gl.uniform1f(uWindowMargin, props.windowMargin);
      gl.uniform1f(uWindowBend, props.windowBend);
      gl.uniform1f(uWindowSize, props.windowSize);
      gl.uniform1f(uWindowWidth, props.windowWidth);
      gl.uniform1f(uWindowGradient, props.windowGradient);
      gl.uniform1f(uWindowHead, props.windowHead);
      gl.uniform1f(uWindowTail, props.windowTail);
      gl.uniform1f(uWindowIntensity, props.windowIntensity);
      gl.uniform1f(uWindowTwin, props.windowTwin ? 1.0 : 0.0);
      gl.uniform1f(uGlintSize, props.glintSize);
      gl.uniform1f(uGlintIntensity, props.glintIntensity);
      gl.uniform1f(uGlintDistance, props.glintDistance);
      gl.uniform1f(uGlintHeight, props.glintHeight);
      gl.uniform3f(uBottomShadeColor, shadeRgb[0], shadeRgb[1], shadeRgb[2]);
      gl.uniform1f(uSeed, props.seed);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!props.paused) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [
    canvasRef,
    containerRef,
    props.bevel,
    props.bottomShadeColor,
    props.clearCenter,
    props.drainage,
    props.glintDistance,
    props.glintHeight,
    props.glintIntensity,
    props.glintSize,
    props.iridescence,
    props.maxDpr,
    props.oilCoverage,
    props.oilEdgeFade,
    props.paused,
    props.radius,
    props.seed,
    props.speed,
    props.swirl,
    props.windowBend,
    props.windowGradient,
    props.windowHead,
    props.windowIntensity,
    props.windowLength,
    props.windowMargin,
    props.windowSize,
    props.windowTail,
    props.windowTwin,
    props.windowWidth,
  ]);

  return pointerRef;
}

export interface SoapBubbleSearchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    Partial<SoapBubbleMaterialProps> {
  wrapperClassName?: string;
  inputClassName?: string;
  rightSlot?: ReactNode;
}

export const SoapBubbleSearch = forwardRef<HTMLInputElement, SoapBubbleSearchProps>(
  function SoapBubbleSearch(
    {
      wrapperClassName = '',
      inputClassName = '',
      rightSlot,
      style,
      radius,
      bevel,
      iridescence,
      oilCoverage,
      oilEdgeFade,
      clearCenter,
      seeThroughBend,
      windowLength,
      windowMargin,
      windowBend,
      windowSize,
      windowWidth,
      windowGradient,
      windowHead,
      windowTail,
      glintSize,
      glintIntensity,
      glintDistance,
      glintHeight,
      windowIntensity,
      windowTwin,
      bottomShadeColor,
      ...inputProps
    },
    ref
  ) {
    const ctx = useContext(SoapBubbleMaterialContext);
    const mergedProps = useMemo(() => {
      return {
        ...DEFAULT_MATERIAL,
        ...ctx,
        ...(radius !== undefined ? { radius } : {}),
        ...(bevel !== undefined ? { bevel } : {}),
        ...(iridescence !== undefined ? { iridescence } : {}),
        ...(oilCoverage !== undefined ? { oilCoverage } : {}),
        ...(oilEdgeFade !== undefined ? { oilEdgeFade } : {}),
        ...(clearCenter !== undefined ? { clearCenter } : {}),
        ...(seeThroughBend !== undefined ? { seeThroughBend } : {}),
        ...(windowLength !== undefined ? { windowLength } : {}),
        ...(windowMargin !== undefined ? { windowMargin } : {}),
        ...(windowBend !== undefined ? { windowBend } : {}),
        ...(windowSize !== undefined ? { windowSize } : {}),
        ...(windowWidth !== undefined ? { windowWidth } : {}),
        ...(windowGradient !== undefined ? { windowGradient } : {}),
        ...(windowHead !== undefined ? { windowHead } : {}),
        ...(windowTail !== undefined ? { windowTail } : {}),
        ...(glintSize !== undefined ? { glintSize } : {}),
        ...(glintIntensity !== undefined ? { glintIntensity } : {}),
        ...(glintDistance !== undefined ? { glintDistance } : {}),
        ...(glintHeight !== undefined ? { glintHeight } : {}),
        ...(windowIntensity !== undefined ? { windowIntensity } : {}),
        ...(windowTwin !== undefined ? { windowTwin } : {}),
        ...(bottomShadeColor !== undefined ? { bottomShadeColor } : {}),
      };
    }, [
      bevel,
      bottomShadeColor,
      clearCenter,
      ctx,
      glintDistance,
      glintHeight,
      glintIntensity,
      glintSize,
      iridescence,
      oilCoverage,
      oilEdgeFade,
      radius,
      seeThroughBend,
      windowBend,
      windowGradient,
      windowHead,
      windowIntensity,
      windowLength,
      windowMargin,
      windowSize,
      windowTail,
      windowTwin,
      windowWidth,
    ]);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [iconOffset, setIconOffset] = useState<{ x: number; y: number; scale: number }>({
      x: 0,
      y: 0,
      scale: 1,
    });

    const pointerRef = useSoapBubbleCanvas(canvasRef, containerRef, mergedProps);

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ny = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
      pointerRef.current.x = nx;
      pointerRef.current.y = ny;
      setIconOffset({
        x: Number((nx * 1.4).toFixed(2)),
        y: Number((ny * 1.1).toFixed(2)),
        scale: 1.04,
      });
    };

    const handlePointerLeave = () => {
      pointerRef.current.x = 0;
      pointerRef.current.y = 0;
      pointerRef.current.press = 0;
      setIconOffset({ x: 0, y: 0, scale: 1 });
    };

    const wrapStyle = {
      '--sb-radius': `${mergedProps.radius}px`,
      '--sb-icon-x': `${iconOffset.x}px`,
      '--sb-icon-y': `${iconOffset.y}px`,
      '--sb-icon-scale': String(iconOffset.scale),
      ...style,
    } as CSSProperties;

    return (
      <div
        ref={containerRef}
        className={`soap-bubble-search ${wrapperClassName}`.trim()}
        style={wrapStyle}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <canvas ref={canvasRef} className="soap-bubble-canvas" aria-hidden="true" />
        <span className="soap-bubble-optics" aria-hidden="true" />
        <span className="soap-bubble-search-icon" aria-hidden="true">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          ref={ref}
          type="text"
          aria-label={inputProps['aria-label'] || inputProps.placeholder || 'Search'}
          className={`soap-bubble-search-input ${inputClassName}`.trim()}
          {...inputProps}
        />
        {rightSlot ? <span className="soap-bubble-search-addon">{rightSlot}</span> : null}
      </div>
    );
  }
);

export function SoapBubbleSurface({
  as: Tag = 'div',
  radius = 14,
  children,
  className = '',
  style,
}: {
  as?: any;
  radius?: number;
  interactive?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Tag
      className={`soap-bubble-surface ${className}`.trim()}
      style={{ '--sb-radius': `${radius}px`, ...style } as CSSProperties}
    >
      <span className="soap-bubble-optics" aria-hidden="true" />
      {children}
    </Tag>
  );
}

export function SoapBubbleButton({
  children,
  style,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="soap-bubble-button" style={style} {...props}>
      <span className="soap-bubble-optics" aria-hidden="true" />
      {children}
    </button>
  );
}

export function SoapBubbleIconButton({
  children,
  style,
  tint,
  opacity,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tint?: string;
  opacity?: number;
}) {
  return (
    <button
      type="button"
      className="soap-bubble-icon-button"
      style={{ background: tint, opacity, ...style }}
      {...props}
    >
      <span className="soap-bubble-optics" aria-hidden="true" />
      {children}
    </button>
  );
}

export function SoapBubbleMenu({
  label = '•••',
  triggerLabel = 'More',
}: {
  round?: boolean;
  label?: ReactNode;
  triggerLabel?: string;
  items?: Array<{ label: string; onSelect?: () => void; disabled?: boolean }>;
}) {
  return (
    <button type="button" className="soap-bubble-icon-button" aria-label={triggerLabel}>
      {label}
    </button>
  );
}

export function SoapBubbleToggle({
  checked,
  onCheckedChange,
  'aria-label': ariaLabel,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (next: boolean) => void;
  'aria-label'?: string;
  scale?: number;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className="soap-bubble-button"
      onClick={() => onCheckedChange?.(!checked)}
    />
  );
}

export function SoapBubbleSlider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
}: {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (next: number) => void;
  label?: string;
  from?: string;
  to?: string;
  scale?: number;
}) {
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onValueChange?.(Number(e.target.value))}
    />
  );
}
