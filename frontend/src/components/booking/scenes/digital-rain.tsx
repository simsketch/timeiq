"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneContentProps } from "./types";

// The clock is a volume of individual suspended characters, not a texture of
// a clock face. The same atlas and instanced draw also supply the falling rain.
const GLYPHS = Array.from("ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789abcdefgh+").slice(0, 64);
const DIGITS: Record<string, string[]> = {
  "0": ["01110", "11011", "11011", "11011", "11011", "11011", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "11011", "00011", "00110", "01100", "11000", "11111"],
  "3": ["11110", "00011", "00011", "01110", "00011", "00011", "11110"],
  "4": ["10010", "10010", "11010", "11111", "00010", "00010", "00010"],
  "5": ["11111", "11000", "11000", "11110", "00011", "00011", "11110"],
  "6": ["01110", "11000", "11000", "11110", "11011", "11011", "01110"],
  "7": ["11111", "00011", "00010", "00110", "00100", "01100", "01100"],
  "8": ["01110", "11011", "11011", "01110", "11011", "11011", "01110"],
  "9": ["01110", "11011", "11011", "01111", "00011", "00011", "01110"],
  ":": ["00", "11", "11", "00", "11", "11", "00"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "m": ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  "i": ["1", "0", "1", "1", "1", "1", "1"],
  "n": ["0000", "0000", "1110", "1001", "1001", "1001", "1001"],
  " ": ["00", "00", "00", "00", "00", "00", "00"],
};

function hash(n: number) { return THREE.MathUtils.euclideanModulo(Math.sin(n * 127.1 + 41.7) * 43758.5453, 1); }
function ease(n: number) { const t = THREE.MathUtils.clamp(n, 0, 1); return t * t * (3 - 2 * t); }

function glyphAtlas() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  c.textAlign = "center"; c.textBaseline = "middle"; c.font = "46px monospace";
  GLYPHS.forEach((glyph, i) => {
    const x = (i % 8) * 64 + 32, y = Math.floor(i / 8) * 64 + 32;
    c.fillStyle = "#ffffff"; c.shadowColor = "#ffffffaa"; c.shadowBlur = 8;
    c.fillText(glyph, x, y); c.shadowBlur = 0; c.fillText(glyph, x, y);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const vertexShader = `
  attribute vec3 aOrigin;
  attribute vec4 aFlow;
  attribute vec4 aTarget;
  attribute float aInk;
  uniform float uTime;
  uniform float uFlow;
  uniform float uIntro;
  uniform float uForm;
  uniform float uHover;
  uniform float uPreview;
  uniform float uSeconds;
  uniform vec3 uAccent;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlyph;
  float hash(float x) { return fract(sin(x * 127.1 + 41.7) * 43758.5453); }
  void main() {
    vUv = uv;
    float seed = aFlow.x;
    float role = aTarget.w;
    float fall = 9.5 - mod(uFlow * aFlow.y + seed * 19., 19.);
    vec3 p = vec3(aOrigin.x, fall + aFlow.z * .31, aOrigin.z);
    float leading = 1. - smoothstep(0., 2., aFlow.z);
    float tail = exp(-aFlow.z * .105);
    float edge = smoothstep(-4.1, -3.5, p.y) * (1. - smoothstep(7.8, 9.5, p.y));
    // A single central stream opens the scene, followed by the deeper layers.
    float reveal = smoothstep(aFlow.w, aFlow.w + .28, uIntro);
    float size = .20;
    vColor = mix(vec3(.014, .48, .095), vec3(.55, 1., .67), leading * .8);
    vAlpha = tail * edge * reveal * .64;
    // Leave a quiet pocket behind the wordmark at the composed view.
    vAlpha *= 1. - smoothstep(2.5, 5.5, p.y) * (1. - smoothstep(-5., -2.5, p.x)) * .65;
    if (role > .5) {
      float form = role < 1.5 ? uForm : uHover;
      vec3 target = aTarget.xyz;
      // The characters have real depth and a slight bow across the formation.
      p = mix(vec3(target.x, fall + aFlow.z * .08, target.z - .8), target, form);
      size = role < 1.5 ? .175 : .102;
      vAlpha = aInk * form * (.87 + .13 * sin(seed * 81. + uTime * .8));
      vColor = mix(vec3(.42, 1., .60), uAccent, uPreview * .95);
      if (role > 1.5) vColor = mix(vec3(.20, .85, .43), uAccent, uHover);
      if (role > .5 && role < 1.5 && abs(target.x) < .3)
        vAlpha *= .64 + .36 * pow(.5 + .5 * cos(uSeconds * 6.2831853), 3.);
    } else {
      // The rain yields to the locked glyphs, without a rectangular clearing.
      float clearing = exp(-pow(abs(p.x) / 3.55, 6.) - pow(abs(p.y - .5) / 1.7, 4.));
      vAlpha *= 1. - clearing * .88 * uForm;
      vColor = mix(vColor, uAccent, uPreview * .34);
    }
    float flicker = step(.985, hash(floor(uTime * 1.3 + seed * 8.) + seed * 153.));
    vAlpha *= 1. - flicker * .35;
    vGlyph = floor(hash(seed * 913. + aFlow.z * 17. + floor(uTime * mix(.8, .16, step(.5, role)) + seed * 11.)) * 64.);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    // World-aligned quads preserve parallax when visitors orbit the chamber.
    mv += modelViewMatrix * vec4(position.x * size, position.y * size * 1.45, 0., 0.);
    vAlpha *= exp(-max(0., -mv.z - 9.) * .048);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlyph;
  void main() {
    vec2 cell = vec2(mod(vGlyph, 8.), 7. - floor(vGlyph / 8.));
    vec2 atlasUv = (cell + .07 + vUv * .86) / 8.;
    float ink = texture2D(uAtlas, atlasUv).a;
    float alpha = ink * vAlpha;
    if (alpha < .008) discard;
    // A soft halo was painted into each atlas cell: no bloom render target.
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

interface LetterCell { index: number; character: number; x: number; y: number }

function buildRain(small: boolean) {
  const origins: number[] = [], flow: number[] = [], targets: number[] = [], ink: number[] = [];
  const clockCells: LetterCell[] = [], durationCells: LetterCell[] = [];
  function add(x: number, z: number, seed: number, speed: number, trail: number, reveal: number, target: number[], on: number) {
    const index = ink.length;
    origins.push(x, 0, z); flow.push(seed, speed, trail, reveal); targets.push(...target); ink.push(on);
    return index;
  }
  const columns = small ? 31 : 49, rows = small ? 23 : 30;
  for (let layer = 0; layer < 4; layer++) for (let column = 0; column < columns; column++) {
    const id = layer * columns + column, seed = hash(id + 1);
    const x = (column - (columns - 1) / 2) * (small ? .66 : .45) + hash(id + 3) * .19;
    const z = 2.1 - layer * 3.3 + hash(id + 7) * .6;
    const reveal = layer === 0 && column === Math.floor(columns / 2) ? -.2 : .08 + hash(id + 11) * .65;
    for (let row = 0; row < rows; row++)
      add(x, z, seed, .78 + hash(id + 17) * 1.3, row, reveal, [0, 0, 0, 0], 1);
  }
  function lettering(template: string, scale: number, y: number, cells: LetterCell[], role: number) {
    const widths = Array.from(template).map((letter) => DIGITS[letter][0].length);
    const total = widths.reduce((sum, width) => sum + width + 1, -1);
    let left = -total / 2;
    Array.from(template).forEach((letter, character) => {
      const repeat = 2;
      for (let row = 0; row < 7 * repeat; row++) for (let col = 0; col < widths[character] * repeat; col++) {
        const x = (left + (col + .5) / repeat) * scale;
        const yy = y + (3.5 - (row + .5) / repeat) * scale * 1.36;
        const i = ink.length, seed = hash(i + 78);
        const z = 1.05 + .15 * Math.cos(x * .55) + (seed - .5) * .14;
        const index = add(x, z, seed, 1.7, seed * 20, .6,
          [x, yy, z, role], 0);
        cells.push({ index, character, x: Math.floor(col / repeat), y: Math.floor(row / repeat) });
      }
      left += widths[character] + 1;
    });
  }
  lettering("00:00", .232, .65, clockCells, 1);
  // Fixed slots keep transitions smooth when the duration changes digit count.
  lettering("+000 min", .117, -1.3, durationCells, 2);
  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(plane.index);
  for (const [name, attribute] of Object.entries(plane.attributes)) geometry.setAttribute(name, attribute);
  plane.dispose();
  geometry.instanceCount = ink.length;
  geometry.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(new Float32Array(origins), 3));
  geometry.setAttribute("aFlow", new THREE.InstancedBufferAttribute(new Float32Array(flow), 4));
  geometry.setAttribute("aTarget", new THREE.InstancedBufferAttribute(new Float32Array(targets), 4));
  const inkAttribute = new THREE.InstancedBufferAttribute(new Float32Array(ink), 1);
  inkAttribute.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute("aInk", inkAttribute);
  const atlas = glyphAtlas();
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: {
      uAtlas: { value: atlas }, uTime: { value: 0 }, uFlow: { value: 0 },
      uIntro: { value: 0 }, uForm: { value: 0 }, uHover: { value: 0 }, uPreview: { value: 0 },
      uSeconds: { value: 0 }, uAccent: { value: new THREE.Color("#65fca0") },
    },
  });
  return { geometry, material, atlas, inkAttribute, clockCells, durationCells,
    desired: new Float32Array(ink), accent: new THREE.Color() };
}

function setLetters(cells: LetterCell[], text: string, desired: Float32Array) {
  for (const cell of cells) {
    const pattern = DIGITS[text[cell.character]] ?? DIGITS[" "];
    desired[cell.index] = pattern[cell.y]?.[cell.x] === "1" ? 1 : 0;
  }
}

// The floor is a dark phosphor pool. Its wide ripples mark seconds and give
// the suspended glyphs a physical place in the otherwise unbounded darkness.
const floorFragment = `
  uniform float uSeconds;
  uniform float uIntro;
  uniform float uHover;
  uniform vec3 uAccent;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - .5) * 44.;
    float r = length(p * vec2(.78, 1.));
    float pool = exp(-r * r * .045);
    float wave = fract(uSeconds * .5);
    float ripple = exp(-pow((r - wave * 9.) * 7., 2.)) * (1. - wave) * .09;
    float rings = (exp(-pow((r - 3.1) * 35., 2.)) + exp(-pow((r - 3.2) * 42., 2.))) * .035;
    vec3 color = mix(vec3(.018, .31, .10), uAccent * .35, uHover);
    gl_FragColor = vec4(color * (pool * .075 + ripple + rings) * uIntro, 1.);
    #include <colorspace_fragment>
  }
`;

export default function DigitalRain({ active, running, reduced, small }: SceneContentProps) {
  const rain = useMemo(() => buildRain(small), [small]);
  const floor = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: floorFragment, toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSeconds: { value: 0 }, uIntro: { value: 0 }, uHover: { value: 0 }, uAccent: { value: new THREE.Color("#65fca0") } },
  }), []);
  const state = useRef({ started: 0, hoverStarted: 0, elapsed: 0, flow: 0, hover: 0, preview: 0, hoverAge: 0, activeId: "",
    minute: -1, pendingMinute: -1, change: 10, text: "", duration: "" });
  const resources = useRef<{ rain: ReturnType<typeof buildRain>; floor: THREE.ShaderMaterial } | null>(null);
  useEffect(() => {
    resources.current = { rain, floor };
    // A responsive geometry rebuild needs fresh masks, without replaying intro.
    state.current.text = ""; state.current.duration = "";
  }, [rain, floor]);
  useEffect(() => () => {
    rain.geometry.dispose(); rain.material.dispose(); rain.atlas.dispose();
  }, [rain]);
  useEffect(() => () => floor.dispose(), [floor]);

  useFrame((_, delta) => {
    if (!running || !resources.current) return;
    const { rain, floor } = resources.current;
    const now = Date.now(), date = new Date(now), s = state.current;
    const dt = Math.min(delta, 1), u = rain.material.uniforms;
    if (!s.started) s.started = now;
    s.elapsed = (now - s.started) / 1000;
    const id = active ? `${active.id}:${active.duration_minutes}` : "";
    if (id !== s.activeId) { s.hoverStarted = now; s.activeId = id; }
    s.hoverAge = (now - s.hoverStarted) / 1000;
    s.hover = THREE.MathUtils.damp(s.hover, active ? 1 : 0, 3.8, dt);
    // Traverse precisely the offered span, then settle back to the live clock.
    const preview = active ? active.duration_minutes * ease(s.hoverAge / 2.7) * (1 - ease((s.hoverAge - 4.4) / 1.4)) : 0;
    s.preview = THREE.MathUtils.damp(s.preview, preview, 8, dt);
    s.flow += reduced ? 0 : dt * (1 + s.hover * 2.4);
    const minute = date.getHours() * 60 + date.getMinutes();
    if (s.minute < 0) { s.minute = minute; s.pendingMinute = minute; }
    if (minute !== s.pendingMinute) { s.pendingMinute = minute; s.change = 0; }
    s.change += dt;
    if (s.change > .42) s.minute = s.pendingMinute;
    const shown = (s.minute + Math.round(s.preview)) % 1440;
    const text = `${String(Math.floor(shown / 60)).padStart(2, "0")}:${String(shown % 60).padStart(2, "0")}`;
    if (text !== s.text) { setLetters(rain.clockCells, text, rain.desired); s.text = text; }
    const duration = active ? `+${String(Math.min(999, Math.round(active.duration_minutes))).padStart(3, " ")} min` : s.duration;
    if (duration !== s.duration) { setLetters(rain.durationCells, duration, rain.desired); s.duration = duration; }
    const ink = rain.inkAttribute.array;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 13);
    for (const cell of rain.clockCells) ink[cell.index] += (rain.desired[cell.index] - ink[cell.index]) * k;
    for (const cell of rain.durationCells) ink[cell.index] += (rain.desired[cell.index] - ink[cell.index]) * k;
    rain.inkAttribute.needsUpdate = true;
    rain.accent.set(active?.color ?? "#65fca0");
    u.uAccent.value.lerp(rain.accent, 1 - Math.exp(-dt * 3));
    u.uTime.value = reduced ? 0 : s.elapsed;
    u.uFlow.value = s.flow;
    u.uIntro.value = reduced ? 1.5 : s.elapsed;
    const reform = s.change < .85 ? 1 - Math.sin(s.change / .85 * Math.PI) * .96 : 1;
    u.uForm.value = (reduced ? 1 : ease((s.elapsed - .48) / 1.05)) * reform;
    u.uHover.value = s.hover;
    u.uPreview.value = s.hover * (1 - ease((s.hoverAge - 4.4) / 1.4));
    u.uSeconds.value = reduced ? 0 : date.getSeconds() + date.getMilliseconds() / 1000;
    floor.uniforms.uSeconds.value = u.uSeconds.value;
    floor.uniforms.uIntro.value = reduced ? 1 : ease(s.elapsed / 1.5);
    floor.uniforms.uHover.value = s.hover;
    floor.uniforms.uAccent.value.copy(u.uAccent.value);
  });

  return <>
    <color attach="background" args={["#010705"]} />
    <fogExp2 attach="fog" args={["#010705", .045]} />
    <mesh geometry={rain.geometry} material={rain.material} frustumCulled={false} />
    <mesh position={[0, -3.8, -2]} rotation={[-Math.PI / 2, 0, 0]} material={floor}>
      <planeGeometry args={[44, 44]} />
    </mesh>
  </>;
}
