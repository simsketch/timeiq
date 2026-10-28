"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SceneContentProps } from "./types";

type V3 = [number, number, number];
const TAU = Math.PI * 2;
const ORIGIN: V3 = [-.8, 1.92, -.12];
const ease = (x: number) => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };
function clockDigits(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
}

// Bake fixed hardware by material. Hundreds of bolts and windings become a
// handful of draws, especially useful on phones and software WebGL drivers.
function hardwareBuilder() {
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), size = new THREE.Vector3();
  const matrix = new THREE.Matrix4(), euler = new THREE.Euler();
  function add(g: THREE.BufferGeometry, material: THREE.Material, p: V3, scale: V3 = [1, 1, 1], rotation: V3 = [0, 0, 0], parent?: THREE.Matrix4) {
    quaternion.setFromEuler(euler.set(...rotation)); matrix.compose(position.set(...p), quaternion, size.set(...scale));
    if (parent) matrix.premultiply(parent);
    const copy = g.index ? g.toNonIndexed() : g.clone(); copy.applyMatrix4(matrix);
    const list = parts.get(material) ?? []; list.push(copy); parts.set(material, list);
  }
  function finish() {
    return Array.from(parts, ([material, list]) => {
      const geometry = mergeGeometries(list, false)!; list.forEach((g) => g.dispose()); return { material, geometry };
    });
  }
  return { add, finish };
}

// Painted softbox reflections avoid an HDR map and its render targets.
function brushedMetal(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
    vec3 r = inverseTransformDirection(reflect(-geometryViewDir, normal), viewMatrix);
    float strip = pow(max(0., 1. - abs(r.x * .65 + r.z * .76 - .28)), 38.);
    float edge = pow(1. - max(dot(normal, geometryViewDir), 0.), 3.);
    outgoingLight += vec3(.27,.39,.52) * strip + vec3(.045,.075,.11) * edge;
    outgoingLight += vec3(.075,.012,.008) * pow(max(r.z, 0.), 7.);
    #include <opaque_fragment>
  `);
}

// Bent-wire numerals, shared between all the glass tubes. No font assets.
const NUMERALS: number[][][] = [
  [[.5, 0], [.1, .08], [0, .4], [.05, .85], [.5, 1], [.95, .85], [1, .4], [.9, .08], [.5, 0]],
  [[.25, .75], [.58, 1], [.58, 0]],
  [[0, .8], [.18, .98], [.65, 1], [1, .8], [.9, .56], [.1, .1], [0, 0], [1, 0]],
  [[0, .9], [.4, 1], [.92, .88], [.85, .62], [.46, .51], [.86, .45], [1, .21], [.7, .01], [.2, 0], [0, .1]],
  [[.8, 0], [.8, 1], [0, .3], [1, .3]],
  [[1, 1], [.08, 1], [.04, .55], [.6, .57], [.96, .4], [.96, .15], [.7, 0], [.23, 0], [0, .12]],
  [[.92, .94], [.5, 1], [.1, .7], [0, .25], [.24, .01], [.74, 0], [1, .23], [.85, .49], [.4, .54], [.03, .35]],
  [[0, 1], [1, 1], [.4, 0]],
  [[.48, .52], [.08, .73], [.16, .96], [.67, 1], [.95, .8], [.8, .6], [.48, .52], [.04, .3], [.15, .04], [.7, 0], [1, .22], [.85, .42], [.48, .52]],
  [[.92, .63], [.55, .49], [.1, .55], [0, .8], [.25, 1], [.73, .98], [1, .75], [.9, .3], [.6, .03], [.12, 0]],
];

function numeralGeometry(points: number[][], radius: number, segments: number) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3((x - .5) * .235, y * .46 + .19, 0)), false, "centripetal");
  return new THREE.TubeGeometry(curve, segments, radius, 5, false);
}

function softTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d")!, g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "#ffffff"); g.addColorStop(.13, "#ffffffb0"); g.addColorStop(.45, "#ffffff22"); g.addColorStop(1, "#ffffff00");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function plateTexture(title: string, sub: string) {
  const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#aab9bf"; c.textAlign = "center"; c.font = "500 35px serif"; c.fillText(title, 384, 47);
  c.fillStyle = "#6f838d"; c.font = "22px monospace"; c.fillText(sub, 384, 91);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function benchTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!; c.fillStyle = "#54616a"; c.fillRect(0, 0, 256, 256);
  for (let y = 16; y < 256; y += 32) for (let x = 16; x < 256; x += 32) {
    c.fillStyle = "#85959d"; c.beginPath(); c.arc(x, y + 1, 3.4, 0, TAU); c.fill();
    c.fillStyle = "#141f28"; c.beginPath(); c.arc(x, y, 2.8, 0, TAU); c.fill();
  }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1.8); t.anisotropy = 4; return t;
}

function useLab(small: boolean) {
  const lab = useMemo(() => {
    const metal = new THREE.MeshStandardMaterial({ color: "#9caeb8", metalness: .82, roughness: .28 }); metal.onBeforeCompile = brushedMetal;
    const dark = new THREE.MeshStandardMaterial({ color: "#111d28", metalness: .6, roughness: .38 }); dark.onBeforeCompile = brushedMetal;
    const copper = new THREE.MeshStandardMaterial({ color: "#b76438", metalness: .8, roughness: .3 }); copper.onBeforeCompile = brushedMetal;
    const glass = new THREE.MeshPhongMaterial({ color: "#94bfd9", specular: "#c5deff", shininess: 90, transparent: true, opacity: .12, depthWrite: false, side: small ? THREE.FrontSide : THREE.DoubleSide });
    const amber = new THREE.MeshBasicMaterial({ color: "#ff9e42", toneMapped: false });
    const amberHalo = new THREE.MeshBasicMaterial({ color: "#ff8025", transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ghost = new THREE.MeshBasicMaterial({ color: "#89c8ff", transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    const dormant = new THREE.MeshBasicMaterial({ color: "#aa704d", transparent: true, opacity: .065, depthWrite: false });
    const red = new THREE.MeshBasicMaterial({ color: "#ff3435", toneMapped: false });
    const digits = NUMERALS.map((p) => numeralGeometry(p, .007, small ? 28 : 44));
    const halos = NUMERALS.map((p) => numeralGeometry(p, .025, small ? 28 : 44));
    const bulb = new THREE.LatheGeometry([
      new THREE.Vector2(0, .07), new THREE.Vector2(.147, .07), new THREE.Vector2(.154, .15),
      new THREE.Vector2(.154, .59), new THREE.Vector2(.143, .73), new THREE.Vector2(.1, .79), new THREE.Vector2(0, .81),
    ], small ? 12 : 20);
    const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, small ? 16 : 28);
    const ring = new THREE.TorusGeometry(1, .065, 6, small ? 20 : 36);
    const open = new THREE.CylinderGeometry(1, 1, 1, small ? 18 : 32, 1, true);
    const glow = softTexture(), bench = benchTexture();
    const title = plateTexture("Cesium fountain", "9 192 631 770 Hz");
    const clockPlate = plateTexture("Local time", "Atomic frequency standard");
    const duration = plateTexture("Meeting span", "");
    const tint = new THREE.Color();
    function updatePreview(minutes: number, color: string | null, opacity: number, changed: boolean) {
      ghost.opacity = opacity;
      if (color) ghost.color.lerp(tint.set(color), .13);
      if (!changed || !color) return;
      const canvas = duration.image as HTMLCanvasElement, c = canvas.getContext("2d")!;
      c.clearRect(0, 0, canvas.width, canvas.height); c.fillStyle = color;
      c.textAlign = "center"; c.font = "500 94px serif"; c.fillText(`${minutes} minutes`, 384, 99); duration.needsUpdate = true;
    }
    const materials = [metal, dark, copper, glass, amber, amberHalo, ghost, dormant, red];
    return { metal, dark, copper, glass, amber, amberHalo, ghost, dormant, red, digits, halos, bulb, box, cylinder, ring, open, glow, bench, title, clockPlate, duration, materials, updatePreview };
  }, [small]);
  useEffect(() => () => {
    lab.materials.forEach((m) => m.dispose());
    [...lab.digits, ...lab.halos, lab.bulb, lab.box, lab.cylinder, lab.ring, lab.open].forEach((g) => g.dispose());
    [lab.glow, lab.bench, lab.title, lab.clockPlate, lab.duration].forEach((t) => t.dispose());
  }, [lab]);
  return lab;
}
type Lab = ReturnType<typeof useLab>;
type ClockState = { digits: string; ghostDigits: string; hover: number; intro: number; launch: number; flash: number };

function Block({ lab, position, scale, dark = false }: { lab: Lab; position: V3; scale: V3; dark?: boolean }) {
  return <mesh geometry={lab.box} material={dark ? lab.dark : lab.metal} position={position} scale={scale} castShadow receiveShadow />;
}
function Cylinder({ lab, position, radius, height, dark = false, rotation }: { lab: Lab; position: V3; radius: number; height: number; dark?: boolean; rotation?: V3 }) {
  return <mesh geometry={lab.cylinder} material={dark ? lab.dark : lab.metal} position={position} rotation={rotation} scale={[radius, height, radius]} castShadow />;
}
const CABLES: V3[][] = [
  [[-.8, 4.47, -.51], [-.25, 4.3, -.55], [.15, 3.2, -.7], [.2, 1.3, -.9], [1.2, 1.17, -.8], [1.9, 1.35, .6]],
  [[-.8, 2.66, -.55], [-.2, 2.5, -.65], [.35, 1.4, -.7], [1.1, 1.16, -.6], [2, 1.3, .6]],
  [[-1.27, 1.92, -.14], [-1.8, 1.6, -.5], [-2.25, 1.16, -.5], [-2.65, 1.2, .7]],
  [[-.8, 5.26, -.22], [-1.45, 4.9, -.55], [-1.63, 2.4, -.8], [-1.6, 1.2, -1.2], [1.6, 1.18, -1]],
];

function Apparatus({ lab, small }: { lab: Lab; small: boolean }) {
  const hardware = useMemo(() => {
    const { add, finish } = hardwareBuilder();
    const cylinder = (p: V3, r: number, h: number, dark = false, rotation: V3 = [0, 0, 0], parent?: THREE.Matrix4) => add(lab.cylinder, dark ? lab.dark : lab.metal, p, [r, h, r], rotation, parent);
    const block = (p: V3, scale: V3, dark = false) => add(lab.box, dark ? lab.dark : lab.metal, p, scale);
    cylinder([-.8, 1.18, -.12], .66, .18, true);
    cylinder([-.8, 1.43, -.12], .38, .4);
    const tube = new THREE.CylinderGeometry(.275, .275, 3.2, small ? 16 : 28);
    const globe = new THREE.SphereGeometry(.5, small ? 16 : 28, 14);
    add(tube, lab.glass, [-.8, 3.38, -.12]); add(globe, lab.glass, ORIGIN); tube.dispose(); globe.dispose();
    [1.56, 2.28, 3.08, 3.89, 4.89, 5.28].forEach((y, index) => {
      const radius = index < 2 ? .58 : .42, bolts = small ? 6 : 8;
      cylinder([-.8, y, -.12], radius, .105);
      cylinder([-.8, y - .066, -.12], radius * .9, .026, true);
      for (let i = 0; i < bolts; i++) {
        const a = i / bolts * TAU;
        cylinder([-.8 + Math.cos(a) * radius * .81, y + .069, -.12 + Math.sin(a) * radius * .81], .032, .045, true);
      }
    });
    cylinder([-.8, 5.08, -.12], .32, .34); cylinder([-.8, 5.42, -.12], .13, .2, true);
    [2.69, 4.48].forEach((y) => {
      add(lab.open, lab.dark, [-.8, y, -.12], [.49, .24, .49]);
      const count = small ? 5 : 8;
      for (let i = 0; i < count; i++) add(lab.ring, lab.copper, [-.8, y + (i / (count - 1) - .5) * .19, -.12], [.51, .51, .38], [Math.PI / 2, 0, 0]);
      block([-.29, y, -.12], [.12, .19, .2], true);
    });
    [3.29, 3.69].forEach((y) => cylinder([-.8, y, -.12], .49, .25));
    add(lab.open, lab.copper, [-.8, 3.49, -.12], [.38, .22, .38]);
    [-1, 1].forEach((side) => block([-.8 + side * .405, 3.49, -.12], [.055, .45, .2]));
    const parent = new THREE.Matrix4(), q = new THREE.Quaternion(), circle = new THREE.CircleGeometry(.236, 20);
    [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((a) => {
      parent.compose(new THREE.Vector3(...ORIGIN), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(1, 1, 1));
      add(lab.open, lab.metal, [0, 0, .5], [.24, .23, .24], [Math.PI / 2, 0, 0], parent);
      add(lab.ring, lab.metal, [0, 0, .63], [.285, .285, .7], [0, 0, 0], parent);
      add(circle, lab.glass, [0, 0, .637], [1, 1, 1], [0, 0, 0], parent);
      for (let i = 0; i < 6; i++) cylinder([Math.cos(i * TAU / 6) * .274, Math.sin(i * TAU / 6) * .274, .658], .022, .04, true, [Math.PI / 2, 0, 0], parent);
    });
    circle.dispose();
    [-1.38, -.22].forEach((x) => { cylinder([x, 3.19, -.54], .033, 4.02); cylinder([x, 1.17, -.54], .11, .13, true); });
    block([-.8, 5.03, -.56], [1.34, .12, .22], true);
    block([-.8, 2.95, .3], [1.26, .22, .08], true);
    const cableMaterials = CABLES.map((points, i) => {
      const material = new THREE.MeshStandardMaterial({ color: i === 0 ? "#85543c" : i === 1 ? "#284968" : "#101c27", roughness: .5, metalness: .15 });
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), small ? 16 : 28, i === 3 ? .04 : .022, 5, false);
      add(g, material, [0, 0, 0]); g.dispose(); return material;
    });
    return { meshes: finish(), cableMaterials };
  }, [lab, small]);
  useEffect(() => () => { hardware.meshes.forEach(({ geometry }) => geometry.dispose()); hardware.cableMaterials.forEach((m) => m.dispose()); }, [hardware]);
  return <>
    {hardware.meshes.map(({ geometry, material }, i) => <mesh key={i} geometry={geometry} material={material} castShadow={material !== lab.glass} />)}
    <mesh position={[-.8, 2.95, .345]}><planeGeometry args={[1.26, .21]} /><meshBasicMaterial map={lab.title} transparent depthWrite={false} /></mesh>
  </>;
}

function Beam({ lab, start, end, index, state, running, small }: { lab: Lab; start: V3; end: V3; index: number; state: MutableRefObject<ClockState>; running: boolean; small: boolean }) {
  const beam = useRef<THREE.Group>(null);
  const shape = useMemo(() => {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    return { center: a.clone().add(b).multiplyScalar(.5), length: a.distanceTo(b), quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()) };
  }, [start, end]);
  useFrame(() => {
    if (!running || !beam.current) return;
    const on = ease((state.current.intro - .12 - index * .1) / .35);
    beam.current.scale.set(on, 1, on);
  });
  return <group position={shape.center} quaternion={shape.quaternion}>
    <group ref={beam} scale={[0, 1, 0]}>
      <mesh geometry={lab.cylinder} material={lab.red} scale={[.005, shape.length, .005]} />
      <mesh geometry={lab.cylinder} scale={[small ? .035 : .045, shape.length, small ? .035 : .045]}><meshBasicMaterial color="#fd293b" transparent opacity={.035} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
    </group>
  </group>;
}

const COOLING: [V3, V3][] = [
  [[-2.3, 1.92, -.12], ORIGIN], [[.7, 1.92, -.12], ORIGIN],
  [[-.8, 1.92, -1.4], ORIGIN], [[-.8, 1.92, 1.24], ORIGIN],
  [[-.8, 1.24, -.12], ORIGIN], [[-.8, 2.56, -.12], ORIGIN],
];
const PATH: V3[] = [[-2.65, 1.28, 1.12], [-1.7, 1.28, .9], [-1.45, 1.28, -.9], [.35, 1.28, -.75], [.65, 1.28, .1]];
const PROBE: [V3, V3] = [[-1.48, 2.09, -.1], [-.12, 2.09, -.1]];

function Optics({ lab, state, running, small }: { lab: Lab; state: MutableRefObject<ClockState>; running: boolean; small: boolean }) {
  return <>
    <Block lab={lab} position={[-2.45, 1.235, 1.13]} scale={[.74, .29, .48]} dark />
    {[0, 1, 2, 3, 4].map((i) => <Block key={i} lab={lab} position={[-2.7 + i * .12, 1.395, 1.13]} scale={[.03, .06, .47]} />)}
    {PATH.slice(1).map((p, i) => <group key={i} position={p} rotation={[0, i % 2 ? .65 : -.6, 0]}>
      <Cylinder lab={lab} position={[0, -.1, 0]} radius={.037} height={.27} />
      <Block lab={lab} position={[0, -.11, 0]} scale={[.27, .06, .25]} dark />
      <mesh geometry={lab.ring} material={lab.dark} rotation={[0, Math.PI / 2, 0]} scale={[.135, .135, .7]} />
      <mesh rotation={[0, Math.PI / 2, 0]}><circleGeometry args={[.11, 16]} /><meshStandardMaterial color="#cadbe5" metalness={.95} roughness={.12} onBeforeCompile={brushedMetal} side={THREE.DoubleSide} /></mesh>
    </group>)}
    {PATH.slice(0, -1).map((p, i) => <Beam key={i} lab={lab} start={p} end={PATH[i + 1]} index={i} state={state} running={running} small={small} />)}
    <Beam lab={lab} start={PROBE[0]} end={PROBE[1]} index={6} state={state} running={running} small={small} />
    <sprite position={ORIGIN} scale={[2.4, 1.8, 1]}><spriteMaterial map={lab.glow} color="#ff2436" transparent opacity={.055} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
    {COOLING.map(([start, end], i) => <group key={i}>
      <Beam lab={lab} start={start} end={end} index={i} state={state} running={running} small={small} />
      {i < 4 && <group position={start} rotation={i < 2 ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
        <Cylinder lab={lab} position={[0, 0, 0]} radius={.1} height={.3} dark />
        <Cylinder lab={lab} position={[0, .13, 0]} radius={.115} height={.04} />
      </group>}
    </group>)}
    {COOLING.slice(0, 4).map(([p], i) => <group key={i}>
      <Cylinder lab={lab} position={[p[0], 1.455, p[2]]} radius={.044} height={.74} />
      <Cylinder lab={lab} position={[p[0], 1.11, p[2]]} radius={.1} height={.055} dark />
    </group>)}
  </>;
}

function Nixie({ lab, x, digit, state, running, ghost = false }: { lab: Lab; x: number; digit: number; state: MutableRefObject<ClockState>; running: boolean; ghost?: boolean }) {
  const wire = useRef<THREE.Mesh>(null), halo = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!running || !wire.current) return;
    const text = ghost ? state.current.ghostDigits : state.current.digits;
    const n = Number(text[digit]);
    if (wire.current.geometry !== lab.digits[n]) { wire.current.geometry = lab.digits[n]; if (halo.current) halo.current.geometry = lab.halos[n]; }
  });
  return <group position={[x, 0, 0]}>
    <mesh geometry={lab.bulb} material={lab.glass} />
    <Cylinder lab={lab} position={[0, .07, 0]} radius={.158} height={.12} dark />
    <mesh geometry={lab.digits[8]} material={lab.dormant} position={[0, 0, -.035]} />
    <mesh ref={wire} geometry={lab.digits[0]} material={ghost ? lab.ghost : lab.amber} position={[0, 0, .02]} />
    {!ghost && <mesh ref={halo} geometry={lab.halos[0]} material={lab.amberHalo} position={[0, 0, .018]} />}
    <mesh position={[0, .43, -.05]} scale={[.44, .8, 1]}><planeGeometry /><meshBasicMaterial map={lab.glow} color={ghost ? "#7aafff" : "#ff8020"} transparent opacity={ghost ? .03 : .12} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    {!ghost && <mesh position={[-.09, .45, .107]} rotation={[0, -.2, -.025]}><planeGeometry args={[.012, .43]} /><meshBasicMaterial color="#a0c2da" transparent opacity={.2} depthWrite={false} /></mesh>}
  </group>;
}

function Instrument({ lab, state, running }: { lab: Lab; state: MutableRefObject<ClockState>; running: boolean }) {
  const ghostBank = useRef<THREE.Group>(null), span = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (!running) return;
    if (ghostBank.current) ghostBank.current.scale.setScalar(.44 + state.current.hover * .015);
    if (span.current) span.current.opacity = state.current.hover;
  });
  return <group position={[1.35, 1.15, 1.02]} rotation={[0, -.07, 0]}>
    <Block lab={lab} position={[0, .36, -.18]} scale={[2.92, .64, 1.13]} dark />
    <Block lab={lab} position={[0, .67, -.18]} scale={[2.95, .07, 1.16]} />
    <Block lab={lab} position={[0, .33, .4]} scale={[2.77, .52, .04]} />
    <Block lab={lab} position={[0, .96, -.53]} scale={[2.92, .57, .2]} dark />
    <Block lab={lab} position={[0, .72, 0]} scale={[2.56, .06, .56]} dark />
    {Array.from({ length: 6 }, (_, i) => <group key={i} position={[0, .73, .04]}><Nixie lab={lab} x={-.99 + i * .38 + (i > 1 ? .07 : 0) + (i > 3 ? .07 : 0)} digit={i} state={state} running={running} /></group>)}
    {[-.385, .445].map((x) => <group key={x} position={[x, 1.16, .075]}>
      {[-.09, .09].map((y) => <mesh key={y} position={[0, y, 0]} material={lab.amber}><sphereGeometry args={[.022, 8, 6]} /></mesh>)}
    </group>)}
    <mesh position={[-.79, .38, .426]}><planeGeometry args={[.95, .21]} /><meshBasicMaterial map={lab.clockPlate} transparent depthWrite={false} /></mesh>
    <group ref={ghostBank} position={[-.49, .035, .46]} scale={.44}>
      {Array.from({ length: 6 }, (_, i) => <Nixie key={i} lab={lab} x={i * .38 + (i > 1 ? .08 : 0) + (i > 3 ? .08 : 0)} digit={i} state={state} running={running} ghost />)}
    </group>
    <mesh position={[.24, .4, .437]}><planeGeometry args={[1.35, .225]} /><meshBasicMaterial ref={span} map={lab.duration} transparent opacity={0} depthWrite={false} toneMapped={false} /></mesh>
    <Cylinder lab={lab} position={[1.08, .32, .47]} radius={.14} height={.14} dark rotation={[Math.PI / 2, 0, 0]} />
    <Block lab={lab} position={[1.08, .36, .552]} scale={[.016, .09, .009]} />
    {[-1.37, 1.37].map((x) => <group key={x}>
      <Block lab={lab} position={[x, .37, .51]} scale={[.035, .35, .035]} />
      {[.2, .53].map((y) => <Cylinder key={y} lab={lab} position={[x, y, .45]} radius={.035} height={.045} dark rotation={[Math.PI / 2, 0, 0]} />)}
    </group>)}
    {[-1.12, 1.12].map((x) => <Block key={x} lab={lab} position={[x, -.04, -.2]} scale={[.24, .12, .64]} dark />)}
  </group>;
}

function Atoms({ lab, small, state, running, reduced }: { lab: Lab; small: boolean; state: MutableRefObject<ClockState>; running: boolean; reduced: boolean }) {
  const points = useRef<THREE.Points>(null), halo = useRef<THREE.Sprite>(null), trap = useRef<THREE.Sprite>(null), flash = useRef<THREE.SpriteMaterial>(null);
  const geometry = useMemo(() => {
    const n = small ? 55 : 110, positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = i * 2.399963, r = .13 * Math.sqrt((i + .5) / n), z = Math.sin(i * 23.73) * .08;
      positions.set([Math.cos(a) * r, Math.sin(a) * r * .7, z], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(positions, 3)); return g;
  }, [small]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    if (!running || !points.current || !halo.current) return;
    const s = state.current, gather = ease((s.intro - .45) / .65);
    const height = reduced ? 0 : 2.82 * 4 * s.launch * (1 - s.launch);
    points.current.position.y = ORIGIN[1] + height;
    points.current.scale.setScalar(gather * (reduced ? 1 : 1 + .24 * Math.sin(s.launch * Math.PI)));
    halo.current.position.y = ORIGIN[1] + height;
    halo.current.scale.set(.72 * gather, .62 * gather, 1);
    if (trap.current) trap.current.scale.setScalar(.48 * gather);
    if (flash.current) flash.current.opacity = s.flash * .72;
  });
  return <>
    <points ref={points} geometry={geometry} position={ORIGIN}>
      <pointsMaterial color="#a9e8ff" size={small ? .038 : .03} map={lab.glow} transparent opacity={.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} sizeAttenuation />
    </points>
    <sprite ref={halo} position={ORIGIN}><spriteMaterial map={lab.glow} color="#59baff" transparent opacity={.7} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
    <sprite ref={trap} position={ORIGIN} scale={0}><spriteMaterial map={lab.glow} color="#7bcfff" transparent opacity={.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
    <sprite position={[-.8, 2.09, -.1]} scale={[.9, .6, 1]}><spriteMaterial ref={flash} map={lab.glow} color="#bceaff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
  </>;
}

function Room({ lab }: { lab: Lab }) {
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.23, 0]} receiveShadow><planeGeometry args={[100, 100]} /><meshStandardMaterial color="#111d29" metalness={.18} roughness={.46} /></mesh>
    <mesh position={[0, 4, -5.4]}><planeGeometry args={[60, 14]} /><meshStandardMaterial color="#101c29" roughness={.85} /></mesh>
    {[-7.2, -3.6, 0, 3.6, 7.2].map((x) => <Block key={x} lab={lab} position={[x, 3.1, -5.32]} scale={[.018, 6.6, .025]} dark />)}
    {[1.3, 4.9].map((y) => <Block key={y} lab={lab} position={[0, y, -5.3]} scale={[24, .018, .025]} dark />)}
    <Block lab={lab} position={[2.8, 5.65, -3.8]} scale={[4.7, .14, .26]} dark />
    <mesh position={[2.8, 5.58, -3.8]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4.4, .2]} /><meshBasicMaterial color="#769fc7" toneMapped={false} /></mesh>
    <Block lab={lab} position={[0, .93, 0]} scale={[6.3, .29, 3.5]} dark />
    <mesh position={[0, 1.084, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[6.24, 3.45]} /><meshStandardMaterial map={lab.bench} metalness={.62} roughness={.4} onBeforeCompile={brushedMetal} /></mesh>
    <Block lab={lab} position={[0, 1.01, 1.765]} scale={[6.3, .045, .018]} />
    {[-2.45, 2.45].map((x) => [-1.08, 1.08].map((z) => <group key={`${x}-${z}`}>
      <Cylinder lab={lab} position={[x, .37, z]} radius={.19} height={.92} dark />
      <Cylinder lab={lab} position={[x, -.13, z]} radius={.27} height={.12} />
    </group>))}
    <Block lab={lab} position={[0, .12, -.91]} scale={[4.9, .12, .12]} dark />
  </>;
}

export default function Atomic({ active, running, reduced, small }: SceneContentProps) {
  const lab = useLab(small);
  const state = useRef<ClockState>({ digits: "000000", ghostDigits: "000000", hover: 0, intro: 0, launch: 0, flash: 0 });
  const preview = useRef({ id: "", start: 0, born: 0, offset: 0, minutes: 0, lastSecond: -1, launched: false, lab: null as Lab | null });
  const light = useRef<THREE.PointLight>(null), rackLight = useRef<THREE.PointLight>(null);
  useFrame((_, delta) => {
    if (!running) return;
    const s = state.current, p = preview.current, dt = Math.min(delta, .1), now = Date.now();
    if (!p.born) p.born = now;
    s.digits = clockDigits(now); s.intro = reduced ? 2 : (now - p.born) / 1000;
    s.hover = reduced ? (active ? 1 : 0) : THREE.MathUtils.damp(s.hover, active ? 1 : 0, 5, dt);
    const id = active ? `${active.id}:${active.duration_minutes}:${active.color}` : "";
    const changed = id !== p.id;
    const resourcesChanged = p.lab !== lab;
    p.lab = lab;
    if (changed) {
      p.id = id;
      if (active) { p.start = now; p.minutes = active.duration_minutes; }
    }
    const age = (now - p.start) / 1000, progress = ease(age / 4.5);
    // The main tubes always tell real time; the lower bank previews one span.
    const span = p.minutes * 60000;
    const returnToClock = ease((age - 5.1) / 1.8);
    s.ghostDigits = clockDigits(now + span * progress * (1 - returnToClock));
    lab.updatePreview(active?.duration_minutes ?? 0, active?.color ?? null, s.hover * (1 - returnToClock * .8) * .95, changed || resourcesChanged);
    const fast = active && !reduced ? Math.sin(progress * Math.PI) * (1 - returnToClock) : 0;
    const wallPhase = (now % 1000) / 1000;
    if (fast > .015) p.offset = (p.offset + dt * fast * 6) % 1;
    else p.offset = THREE.MathUtils.damp(p.offset, Math.round(p.offset), 4, dt);
    if (Math.abs(p.offset - Math.round(p.offset)) < .0001) p.offset = 0;
    s.launch = (wallPhase + p.offset) % 1;
    const second = Math.floor(now / 1000);
    if (!p.launched && s.intro > 1.15 && second !== p.lastSecond) p.launched = true;
    p.lastSecond = second;
    if (!p.launched) s.launch = 0;
    const height = 2.82 * 4 * s.launch * (1 - s.launch);
    s.flash = p.launched && !reduced ? Math.exp(-((height - .17) ** 2) / .06) : 0;
    if (light.current) light.current.intensity = ease(s.intro / 1.2) * (1.8 + s.flash * 1.2);
    if (rackLight.current) rackLight.current.intensity = ease((s.intro - .2) / .8) * 1.5;
  }, -1);
  return <>
    <color attach="background" args={["#09131f"]} />
    <fog attach="fog" args={["#09131f", 13, 34]} />
    <hemisphereLight args={["#93b8e0", "#10161e", .75]} />
    <directionalLight position={[-4, 7, 5]} color="#b5d4ef" intensity={2.1} castShadow shadow-mapSize={[512, 512]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={7} shadow-camera-bottom={-4} shadow-normalBias={.035} shadow-bias={-.0003} />
    <directionalLight position={[4, 5, -4]} color="#487dae" intensity={2.5} />
    <pointLight ref={light} position={[-.8, 2.1, .6]} color="#ff273b" intensity={0} distance={3.7} decay={2} />
    <pointLight ref={rackLight} position={[1.3, 2.25, 1.65]} color="#ff983d" intensity={0} distance={3.4} decay={2} />
    <Room lab={lab} /><Apparatus lab={lab} small={small} />
    <Optics lab={lab} state={state} running={running} small={small} />
    <Instrument lab={lab} state={state} running={running} />
    <Atoms lab={lab} small={small} state={state} running={running} reduced={reduced} />
  </>;
}
