"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MeetingType } from "./booking-profile";

interface SceneProps {
  active: MeetingType | null;
  running: boolean;
  reduced: boolean;
  small: boolean;
  /** Called once the shaders have compiled and the first frame can show. */
  onReady?: () => void;
}

type WatchShape = "hanging" | "ledge" | "puddle";
const TAU = Math.PI * 2;

// Ink, hands, and enamel share a UV grid: the time bends with the surface.
function dialGeometry() {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rings = 18, segments = 72;
  for (let ring = 0; ring <= rings; ring++) {
    for (let segment = 0; segment <= segments; segment++) {
      const angle = segment / segments * TAU;
      const x = Math.cos(angle) * ring / rings;
      const y = Math.sin(angle) * ring / rings;
      positions.push(x, y, 0);
      uvs.push(x / 2 + .5, y / 2 + .5);
      if (ring < rings && segment < segments) {
        const a = ring * (segments + 1) + segment, b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createEnamel() {
  // Cache the printed enamel; only the hands are repainted each second.
  const enamel = document.createElement("canvas");
  enamel.width = enamel.height = 1024;
  const ink = enamel.getContext("2d")!;
  const wash = ink.createRadialGradient(420, 340, 80, 512, 512, 570);
  wash.addColorStop(0, "#fff9e9"); wash.addColorStop(.7, "#eee2c7"); wash.addColorStop(1, "#c5ad83");
  ink.fillStyle = wash; ink.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 3400; i++) {
    const x = (Math.sin(i * 127.1) * 43758.5453 % 1 + 1) % 1 * 1024;
    const y = (Math.sin(i * 269.5) * 43758.5453 % 1 + 1) % 1 * 1024;
    ink.fillStyle = i % 2 ? "#7f6f4a08" : "#ffffff12";
    ink.fillRect(x, y, 1.5, 1.5);
  }
  ink.strokeStyle = "#ad9469"; ink.lineWidth = 1.5;
  ink.beginPath(); ink.arc(512, 512, 473, 0, TAU); ink.stroke();
  ink.beginPath(); ink.arc(512, 512, 465, 0, TAU); ink.stroke();
  for (let i = 0; i < 60; i++) {
    const angle = i / 60 * TAU, radius = i % 5 === 0 ? 424 : 443;
    ink.strokeStyle = "#5b5147"; ink.lineWidth = i % 5 === 0 ? 3.5 : 1.8;
    ink.beginPath();
    ink.moveTo(512 + Math.sin(angle) * radius, 512 - Math.cos(angle) * radius);
    ink.lineTo(512 + Math.sin(angle) * 455, 512 - Math.cos(angle) * 455); ink.stroke();
  }
  ink.fillStyle = "#403c40"; ink.font = "64px Georgia, serif";
  ink.textAlign = "center"; ink.textBaseline = "middle";
  for (let hour = 1; hour <= 12; hour++) {
    const angle = hour / 12 * TAU;
    ink.fillText(String(hour), 512 + Math.sin(angle) * 365, 512 - Math.cos(angle) * 365);
  }
  ink.font = "19px Georgia, serif"; ink.fillStyle = "#9a8765";
  ink.fillText("TimeIQ", 512, 315);
  return enamel;
}

function createDial(main: boolean, enamel: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = main ? 1024 : 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const c = canvas.getContext("2d")!;
  c.scale(canvas.width / 1024, canvas.height / 1024);
  function draw(now: Date) {
    c.drawImage(enamel, 0, 0);
    const minutes = now.getMinutes() + now.getSeconds() / 60;
    const hours = now.getHours() % 12 + minutes / 60;
    function hand(angle: number, length: number, width: number) {
      c.save(); c.translate(512, 512); c.rotate(angle);
      c.fillStyle = "#34333d";
      c.beginPath(); c.moveTo(-width / 2, 46); c.lineTo(-width / 2, -length + 40);
      c.lineTo(0, -length); c.lineTo(width / 2, -length + 40); c.lineTo(width / 2, 46); c.closePath(); c.fill();
      c.strokeStyle = "#b5a07b"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -24); c.lineTo(0, -length + 45); c.stroke(); c.restore();
    }
    hand(hours / 12 * TAU, 228, 19);
    hand(minutes / 60 * TAU, 337, 11);
    if (main) {
      c.save(); c.translate(512, 512); c.rotate(now.getSeconds() / 60 * TAU);
      c.strokeStyle = "#986039"; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(0, 76); c.lineTo(0, -370); c.stroke();
      c.beginPath(); c.arc(0, 58, 12, 0, TAU); c.stroke(); c.restore();
    }
    c.fillStyle = "#c49b52"; c.beginPath(); c.arc(512, 512, 19, 0, TAU); c.fill();
    c.fillStyle = "#4a4140"; c.beginPath(); c.arc(512, 512, 7, 0, TAU); c.fill();
    texture.needsUpdate = true;
  }
  draw(new Date());
  return { texture, draw };
}

function createArc() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  function draw(active: MeetingType | null, now: Date) {
    const c = canvas.getContext("2d")!;
    c.clearRect(0, 0, 512, 512);
    if (active) {
      const start = (now.getMinutes() + now.getSeconds() / 60) / 60 * TAU - Math.PI / 2;
      c.strokeStyle = active.color; c.shadowColor = active.color; c.shadowBlur = 9;
      c.lineWidth = 6; c.lineCap = "round";
      c.beginPath(); c.arc(256, 256, 242, start, start + Math.min(active.duration_minutes / 60, 1) * TAU); c.stroke();
    }
    texture.needsUpdate = true;
  }
  return { texture, draw };
}

function deform(geometry: THREE.BufferGeometry, original: Float32Array, shape: WatchShape) {
  const p = geometry.getAttribute("position") as THREE.BufferAttribute;
  const weights = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = original[i * 3], y = original[i * 3 + 1], z = original[i * 3 + 2];
    if (shape === "puddle") {
      // A low, irregular pool, with one gently lifted lip, rather than another hanging dial.
      p.setXYZ(i, x * (1.18 + y * .14) + .16 * Math.sin(y * 3), y * .83 + .06 * Math.sin(x * 4),
        z + .17 * (y + 1) + .035 * Math.sin(x * 3 + y * 2) + .13 * Math.pow(Math.max(0, x), 4));
      weights[i] = y * y;
      continue;
    }
    const hinge = (shape === "ledge" ? .22 : .50) + (shape === "ledge" ? .12 : .20) * Math.sin(x * 2.1 + .4);
    const d = Math.max(0, hinge - y), t = Math.max(0, y - hinge);
    const turn = Math.min(t / .24, Math.PI / 2);
    const back = Math.max(0, t - .24 * Math.PI / 2);
    // A rounded fold rolls over the support. Gravity stretches the lower lobe,
    // with an asymmetric, heavy tip. The rim uses exactly the same mapping.
    const weight = Math.exp(-((x - .3) ** 2) * 7);
    const down = hinge - d * (1.04 + (shape === "ledge" ? .24 : .11) * Math.pow(d, 1.35)) - .10 * weight * d * d;
    weights[i] = y > hinge ? 0 : -1.5 * weight * d * d;
    const up = hinge + .24 * Math.sin(turn) + back * .035;
    const width = 1 + .17 * Math.sin(d * 2.4) + .15 * Math.exp(-((d - 1.15) ** 2) * 12);
    p.setXYZ(i,
      x * width + .22 * d * d,
      y > hinge ? up : down,
      (y > hinge ? -.24 * (1 - Math.cos(turn)) - back * .98 : .09 * d + .10 * d * d + .06 * Math.sin(x * 3) * d) + z,
    );
  }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += .6;
  return weights;
}

function SoftWatch({ main = false, shape = "hanging", position, scale = 1, rotation = 0, active, running, reduced, elapsed, time, enamel }: {
  main?: boolean;
  shape?: WatchShape;
  position: [number, number, number];
  scale?: number;
  rotation?: number;
  active: MeetingType | null;
  running: boolean;
  reduced: boolean;
  elapsed: { current: number };
  time: { current: number };
  enamel: HTMLCanvasElement;
}) {
  const resources = useMemo(() => {
    const face = dialGeometry();
    const rim = new THREE.TorusGeometry(1.018, .043, 8, 88);
    const inner = new THREE.TorusGeometry(.969, .010, 4, 88);
    const arc = dialGeometry(); arc.translate(0, 0, .013);
    const geometries = main ? [face, rim, inner, arc] : [face, rim, inner];
    const originals = geometries.map((g) => new Float32Array(g.getAttribute("position").array));
    const weights = geometries.map((g, i) => deform(g, originals[i], shape));
    const bases = geometries.map((g) => new Float32Array(g.getAttribute("position").array));
    return { face, rim, inner, arc, geometries, originals: bases, weights, dial: createDial(main, enamel), highlight: createArc() };
  }, [main, shape, enamel]);
  const extra = useRef(0), lastDraw = useRef(-1), lastDeform = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const now = new Date();
    resources.highlight.draw(main ? active : null, now);
    resources.dial.draw(now); invalidate();
  }, [active, main, resources, invalidate]);
  useEffect(() => () => {
    new Set([...resources.geometries, resources.arc]).forEach((g) => g.dispose());
    resources.dial.texture.dispose(); resources.highlight.texture.dispose();
  }, [resources]);
  useFrame((_, delta) => {
    if (!running) return;
    const tick = Math.floor(time.current / (reduced ? 60000 : 1000));
    if (tick !== lastDraw.current) {
      const now = new Date(time.current);
      resources.dial.draw(now);
      if (main) resources.highlight.draw(active, now);
      lastDraw.current = tick;
    }
    const target = main && active ? .085 : 0;
    extra.current = reduced ? target : THREE.MathUtils.damp(extra.current, target, 4, Math.min(delta, .1));
    const breath = reduced ? 0 : Math.sin(elapsed.current * TAU / 9 + (main ? 0 : 1.2)) * .026;
    const melt = extra.current + breath;
    if (Math.abs(melt - lastDeform.current) < .0003) return;
    resources.geometries.forEach((g, index) => {
      const p = g.getAttribute("position") as THREE.BufferAttribute;
      const base = resources.originals[index], weights = resources.weights[index];
      for (let i = 0; i < p.count; i++) {
        if (shape === "puddle") p.setZ(i, base[i * 3 + 2] + weights[i] * melt);
        else p.setY(i, base[i * 3 + 1] + weights[i] * melt);
      }
      p.needsUpdate = true;
      if (g !== resources.arc) g.computeVertexNormals();
    });
    lastDeform.current = melt;
  });
  return (
    <group position={position} scale={scale} rotation={[0, -.08, rotation]}>
      <mesh geometry={resources.face} castShadow receiveShadow>
        <meshStandardMaterial map={resources.dial.texture} roughness={.64} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={resources.rim} castShadow>
        <meshPhysicalMaterial color="#bf9148" metalness={.88} roughness={.24} clearcoat={.5} onBeforeCompile={brassShader} />
      </mesh>
      <mesh geometry={resources.inner}>
        <meshStandardMaterial color="#eed4a0" metalness={.78} roughness={.28} onBeforeCompile={brassShader} />
      </mesh>
      {main && <mesh geometry={resources.arc}>
        <meshBasicMaterial map={resources.highlight.texture} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>}
      {shape !== "puddle" && <group position={[-.02, .49, -.65]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh><torusGeometry args={[.105, .023, 8, 28]} /><meshStandardMaterial color="#ad8141" metalness={.85} roughness={.3} /></mesh>
        <mesh position={[0, -.12, 0]}><cylinderGeometry args={[.068, .068, .095, 16]} /><meshStandardMaterial color="#c49b58" metalness={.8} roughness={.32} /></mesh>
      </group>}
    </group>
  );
}

function Branch({ points, radius }: { points: [number, number, number][]; radius: number }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const tube = new THREE.TubeGeometry(curve, 40, radius, 9, false);
    const p = tube.getAttribute("position"), colors: number[] = [];
    const color = new THREE.Color();
    for (let i = 0; i <= 40; i++) {
      const center = curve.getPointAt(i / 40), taper = 1 - i / 40 * .94;
      for (let j = 0; j <= 9; j++) {
        const index = i * 10 + j;
        const v = new THREE.Vector3().fromBufferAttribute(p, index).sub(center).multiplyScalar(taper * (1 + .08 * Math.sin(i * 1.7 + j * 2))).add(center);
        p.setXYZ(index, v.x, v.y, v.z);
        color.set("#604738").multiplyScalar(.87 + .16 * Math.sin(j * 2.1 + i * .6));
        colors.push(color.r, color.g, color.b);
      }
    }
    tube.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    tube.computeVertexNormals(); return tube;
  }, [points, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow><meshStandardMaterial vertexColors roughness={.94} /></mesh>;
}

const trunk: [number, number, number][] = [[-1.2, 1.25, -.2], [-1.4, 2.15, -.25], [-1.25, 2.9, -.3], [-.8, 3.65, -.35], [-1, 4.4, -.4], [-.7, 5, -.55]];
const arm: [number, number, number][] = [[-1.31, 2.8, -.3], [-.65, 3.54, -.24], [.1, 3.85, -.15], [.95, 3.89, -.18], [1.5, 4.12, -.25]];
const twig: [number, number, number][] = [[-1, 4.2, -.4], [-1.7, 4.43, -.35], [-1.98, 4.83, -.2]];

// Small, deterministic canvas surfaces, never downloaded texture assets.
function mineralTexture(sand: boolean) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!, data = c.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const grain = (Math.sin(x * 127.1 + y * 311.7) * 43758.5453 % 1 + 1) % 1;
    const cloud = Math.sin(x / 256 * TAU + Math.sin(y / 256 * TAU) * 2) * Math.sin((y * 2 + x) / 256 * TAU);
    const ripple = Math.pow(.5 + .5 * Math.sin(y / 256 * TAU * 28 + Math.sin(x / 256 * TAU) * 2.7 + Math.sin(x / 256 * TAU * 3)), 8);
    const strata = Math.pow(.5 + .5 * Math.sin(y * .22 + Math.sin(x * .04) * .8), 18);
    const value = sand ? 240 + cloud * 3 - ripple * 13 + grain * 4 : 231 + cloud * 6 + grain * 8 - strata * 3 - (grain > .985 ? 38 : 0);
    const i = (y * 256 + x) * 4;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = value; data.data[i + 3] = 255;
  }
  c.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(sand ? 28 : .7, sand ? 28 : .7);
  texture.anisotropy = 8;
  return texture;
}

function terrainHeight(x: number, z: number) {
  const clearing = 1 - Math.exp(-((x + .5) ** 2 + z ** 2) / 22);
  return (1 - THREE.MathUtils.smoothstep(-z, 32, 48)) * clearing * (
    .84 * Math.exp(-(((z + 7 + x * .36) / 4.2) ** 2)) +
    1.2 * Math.exp(-(((z - 6 + x * .31) / 3.2) ** 2)) +
    .13 * Math.sin(x * .17 + z * .12) * Math.sin(z * .16) + .06
  ) - 5.4 * THREE.MathUtils.smoothstep(-z, 12, 48);
}

function Desert() {
  const resources = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(180, 140, 144, 112);
    geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, 20);
    const p = geometry.getAttribute("position"), colors: number[] = [];
    const dark = new THREE.Color("#b06f3c"), light = new THREE.Color("#e3a865"), color = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = terrainHeight(x, z);
      p.setY(i, h);
      const blend = .48 + h * .38 + .07 * Math.sin(x * .4 + z * .23) + .04 * Math.sin(x * .85 - z * .6);
      color.copy(dark).lerp(light, THREE.MathUtils.clamp(blend, 0, 1));
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    const grain = mineralTexture(true), colorMap = grain.clone(); colorMap.colorSpace = THREE.SRGBColorSpace;
    return { geometry, grain, colorMap };
  }, []);
  useEffect(() => () => { resources.geometry.dispose(); resources.grain.dispose(); resources.colorMap.dispose(); }, [resources]);
  return <mesh geometry={resources.geometry} receiveShadow>
    <meshStandardMaterial vertexColors map={resources.colorMap} roughness={1} bumpMap={resources.grain} bumpScale={.12} />
  </mesh>;
}

function Plinth() {
  const resources = useMemo(() => {
    const outline = new THREE.Shape([
      [-1.87, -.61], [-.92, -.66], [1.68, -.63], [1.88, -.54], [1.91, .43], [1.78, .61],
      [.6, .65], [-.74, .64], [-1.81, .59], [-1.94, .46], [-1.93, -.42],
    ].map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: 2.33, bevelEnabled: true, bevelThickness: .055, bevelSize: .055, bevelSegments: 1, steps: 1 });
    geometry.translate(0, 0, -1.165);
    const p = geometry.getAttribute("position"), colors: number[] = [], color = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const wear = .018 * Math.sin(x * 7 + z * 3) * Math.sin(y * 11 + z * 4);
      const chip = .09 * Math.exp(-((x + 1.8) ** 2 + (y - .56) ** 2 + (z - 1.15) ** 2) * 28);
      p.setXYZ(i, x + wear, y + wear * .6 - chip, z + wear - chip * .5);
      color.set("#d8c6a8").multiplyScalar(.97 + .022 * Math.sin(y * 26 + x * .8 + Math.sin(z * 5)) + .018 * Math.sin(x * 12 + z * 3));
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const grain = mineralTexture(false), colorMap = grain.clone(); colorMap.colorSpace = THREE.SRGBColorSpace;
    return { geometry, grain, colorMap };
  }, []);
  useEffect(() => () => { resources.geometry.dispose(); resources.grain.dispose(); resources.colorMap.dispose(); }, [resources]);
  return <mesh geometry={resources.geometry} position={[-.55, .69, .1]} castShadow receiveShadow>
    <meshStandardMaterial vertexColors map={resources.colorMap} roughness={.93} bumpMap={resources.grain} bumpScale={.012} />
  </mesh>;
}

function ContactShadows() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
    const c = canvas.getContext("2d")!, gradient = c.createRadialGradient(64, 64, 3, 64, 64, 64);
    gradient.addColorStop(0, "#30202bcc"); gradient.addColorStop(.45, "#30202b68"); gradient.addColorStop(1, "#30202b00");
    c.fillStyle = gradient; c.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <>
    <mesh position={[-.45, .045, .3]} rotation={[-Math.PI / 2, 0, 0]} scale={[5.3, 3.5, 1]}><planeGeometry /><meshBasicMaterial map={texture} transparent opacity={.55} depthWrite={false} /></mesh>
    <mesh position={[-1.18, 1.36, .61]} rotation={[-Math.PI / 2, 0, 0]} scale={[.7, 1, 1]}><planeGeometry /><meshBasicMaterial map={texture} transparent opacity={.7} depthWrite={false} /></mesh>
    <mesh position={[-1.4, 1.36, .91]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.6, .75, 1]}><planeGeometry /><meshBasicMaterial map={texture} transparent opacity={.48} depthWrite={false} /></mesh>
  </>;
}

const HEADLAND: [number, number][] = [[0, 0], [0, 3.3], [.7, 3.7], [1.8, 3.5], [2.7, 4.4], [3.8, 4.5], [4.5, 4.1], [6, 4.2], [7, 5.3], [8.4, 5.4], [9.4, 4.7], [11, 4.6], [12.5, 3.6], [15, 3.3], [18, 2], [23, 1], [32, 0]];
function Headland({ position, color, scale }: { position: [number, number, number]; color: string; scale: number }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(HEADLAND.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false, steps: 1 }); g.translate(0, 0, -3);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={position} scale={scale}><meshStandardMaterial color={color} roughness={1} flatShading /></mesh>;
}

function skyProjection(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "gl_Position = vec4(position.xy, 1., 1.);");
}

function Sky() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1024;
    const c = canvas.getContext("2d")!;
    const sky = c.createLinearGradient(0, 0, 0, 1024);
    sky.addColorStop(0, "#9897d2"); sky.addColorStop(.22, "#c4a8c6");
    sky.addColorStop(.46, "#f2b688"); sky.addColorStop(.58, "#f8c27a"); sky.addColorStop(1, "#e7a161");
    c.fillStyle = sky; c.fillRect(0, 0, 1024, 1024);
    c.save(); c.translate(110, 480); c.scale(1.7, 1);
    const glow = c.createRadialGradient(0, 0, 5, 0, 0, 260);
    glow.addColorStop(0, "#ffd48a88"); glow.addColorStop(1, "#ffd48a00");
    c.fillStyle = glow; c.fillRect(-260, -260, 520, 520); c.restore();
    const cloud = (x: number, y: number, width: number) => {
      const pigment = c.createLinearGradient(x, y, x + width, y);
      pigment.addColorStop(0, "#fff2e300"); pigment.addColorStop(.35, "#fff2e336"); pigment.addColorStop(.72, "#fff2e322"); pigment.addColorStop(1, "#fff2e300");
      c.strokeStyle = pigment; c.lineWidth = 3; c.shadowColor = "#fff2e324"; c.shadowBlur = 6;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + width * .3, y - 5, x + width * .7, y + 2, x + width, y - 9); c.stroke();
    };
    cloud(-70, 160, 780); cloud(470, 274, 650); cloud(620, 282, 300);
    // One-time, sub-pixel pigment prevents banding without a grain shader.
    const data = c.getImageData(0, 0, 1024, 1024); let seed = 17;
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const noise = (seed >>> 30) - 1.5;
      data.data[i] += noise; data.data[i + 1] += noise; data.data[i + 2] += noise;
    }
    c.putImageData(data, 0, 0);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh frustumCulled={false} renderOrder={-100}>
    <planeGeometry args={[2, 2]} />
    <meshBasicMaterial map={texture} depthWrite={false} depthTest={false} side={THREE.DoubleSide} fog={false} toneMapped={false} onBeforeCompile={skyProjection} />
  </mesh>;
}

// Paint the sky/sand reflection directly into the brass shader. This avoids
// cubemap prefiltering and its extra render targets/programs on phone GPUs.
function brassShader(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
    vec3 reflection = inverseTransformDirection(reflect(-geometryViewDir, normal), viewMatrix);
    float sky = smoothstep(-.35, .55, reflection.y);
    float glint = pow(max(dot(reflection, normalize(vec3(-.8,.35,.6))), 0.), 36.);
    vec3 painted = mix(vec3(.16,.075,.022), vec3(.48,.34,.15), sky);
    painted += vec3(.9,.66,.28) * glint;
    outgoingLight += painted * .7;
    #include <opaque_fragment>
  `);
}

function Landscape({ active, running, reduced, small }: SceneProps) {
  const { invalidate, camera, pointer } = useThree();
  const elapsed = useRef(0), time = useRef(0);
  const enamel = useMemo(() => createEnamel(), []);
  const base = useMemo(() => new THREE.Vector3(small ? 4.5 : 4.6, small ? 5.6 : 5.4, small ? 16.8 : 15.8), [small]);
  const aim = useMemo(() => new THREE.Vector3(-.05, 2.5, 0), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    if (!running) return;
    invalidate();
    // Demand rendering is completely paused when hidden/offscreen. Reduced
    // motion still wakes on the minute; wall time never depends on the drip.
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      invalidate();
      timer = setTimeout(next, reduced ? 60000 - Date.now() % 60000 + 20 : 1000 / (small ? 16 : 24));
    };
    next();
    return () => clearTimeout(timer);
  }, [running, reduced, small, invalidate]);
  useEffect(() => { if (running) invalidate(); }, [active, running, reduced, small, invalidate]);
  useFrame((_, delta) => {
    if (!running) return;
    time.current = Date.now();
    elapsed.current += Math.min(delta, .1);
    const zoom = active && !reduced ? .18 : 0;
    const px = reduced || small ? 0 : pointer.x * .12, py = reduced || small ? 0 : pointer.y * .08;
    target.set(base.x + px - zoom, base.y + py, base.z - zoom * 2);
    if (reduced || elapsed.current < .15) camera.position.copy(target);
    else camera.position.lerp(target, 1 - Math.exp(-Math.min(delta, .1) * 3));
    camera.lookAt(aim);
  }, -1);
  const watch = { active: null, running, reduced, elapsed, time, enamel };
  return <>
    <Sky />
    <fog attach="fog" args={["#ebb98a", 30, 130]} />
    <hemisphereLight args={["#bab6ee", "#c27a3c", 1.15]} />
    <directionalLight position={[-8, 5, -6]} color="#ffc477" intensity={3.7} castShadow shadow-mapSize={[512, 512]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={7} shadow-camera-bottom={-5} shadow-normalBias={.025} shadow-bias={-.0002} shadow-radius={3} />
    <directionalLight position={[-4, 3, 8]} color="#f8c792" intensity={1.35} />
    <directionalLight position={[3, 6, -6]} color="#c9d2ff" intensity={1.0} />
    <Desert />
    <mesh position={[0, -5.38, -52.8]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[260, 7]} /><meshStandardMaterial color="#9eb1c2" roughness={.3} metalness={.2} />
    </mesh>
    <Headland position={[-9, -5.4, -61]} color="#c4864d" scale={1} />
    <Headland position={[-3, -5.4, -79]} color="#d6a06e" scale={.85} />
    <Plinth /><ContactShadows />
    <group position={[0, 0, .7]}><Branch points={trunk} radius={.135} /><Branch points={arm} radius={.10} /><Branch points={twig} radius={.057} /></group>
    <SoftWatch {...watch} main position={[.42, 3.4, 1.02]} scale={1.16} rotation={-.12} active={active} />
    <SoftWatch {...watch} shape="ledge" position={[-1.39, 1.27, 1.5]} scale={.74} rotation={-.08} />
    <group position={[2.25, terrainHeight(2.25, 1.6) + .035, 1.6]} rotation={[-Math.PI / 2, 0, -.3]}>
      <SoftWatch {...watch} shape="puddle" position={[0, 0, 0]} scale={.72} />
    </group>
  </>;
}

function WarmShaders({ onReady }: { onReady: (ready: boolean) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    gl.compileAsync(scene, camera).then(() => { if (!cancelled) onReady(true); });
    return () => { cancelled = true; };
  }, [gl, scene, camera, onReady]);
  return null;
}

export default function DesertScene(props: SceneProps) {
  const [compiled, setCompiled] = useState(false);
  const { onReady } = props;
  const handleReady = useCallback((ready: boolean) => {
    setCompiled(ready);
    if (ready) onReady?.();
  }, [onReady]);
  return <Canvas
    aria-hidden="true" frameloop={props.running && compiled ? "demand" : "never"}
    dpr={[1, props.small ? 1.25 : 1.75]} shadows={{ type: THREE.PCFShadowMap }}
    camera={{ position: [4.6, 5.4, 15.8], fov: props.small ? 31 : 33.5, near: .1, far: 190 }}
    gl={{ antialias: true, alpha: false, powerPreference: "low-power", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 }}
    style={{ position: "absolute", inset: 0, opacity: compiled ? 1 : 0 }}
  >
    <Landscape {...props} running={props.running && compiled} /><WarmShaders onReady={handleReady} />
  </Canvas>;
}
