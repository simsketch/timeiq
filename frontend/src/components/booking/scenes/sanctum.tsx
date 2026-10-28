"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { SceneContentProps } from "./types";

const TAU = Math.PI * 2;
const GOLD = "#ffc56e";
const CENTER = 3.15;
const smooth = (v: number) => THREE.MathUtils.smoothstep(v, 0, 1);
const noise = (i: number) => (Math.sin(i * 127.1 + 3.7) * 43758.5453 % 1 + 1) % 1;

function canvasTexture(width: number, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, texture, c: canvas.getContext("2d")! };
}

// Invented geometric writing: no font, alphabet, or borrowed magical emblem.
function sigil(c: CanvasRenderingContext2D, index: number) {
  c.beginPath(); c.moveTo(-5, 10); c.lineTo(-5, -10); c.lineTo(5, -4);
  c.moveTo(-9, 1); c.lineTo(8, 1);
  if (index % 3 === 0) { c.moveTo(-5, -10); c.lineTo(6, -13); c.lineTo(10, -7); }
  else if (index % 3 === 1) { c.moveTo(3, -6); c.lineTo(8, 8); c.lineTo(-5, 5); }
  else { c.moveTo(-5, 8); c.lineTo(5, 12); c.lineTo(5, 5); }
  if (index % 2) { c.moveTo(-10, -7); c.lineTo(-1, -3); }
  c.stroke(); c.fillRect(7, -12, 2.5, 2.5);
}

function dialTexture(kind: "hours" | "minutes" | "seconds" | "runes", small: boolean) {
  const result = canvasTexture(small ? 512 : 1024), c = result.c;
  c.scale(result.canvas.width / 1024, result.canvas.height / 1024); c.translate(512, 512);
  c.strokeStyle = GOLD; c.fillStyle = GOLD; c.textAlign = "center"; c.textBaseline = "middle";
  c.shadowColor = "#ffb954"; c.shadowBlur = 7;
  const circle = (r: number, width: number, alpha: number) => {
    c.globalAlpha = alpha; c.lineWidth = width; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
  };
  circle(455, 2.6, .9); circle(446, 3, .75);
  if (kind === "runes") {
    circle(405, 1, .4); c.globalAlpha = 1; c.lineWidth = 2.3;
    for (let i = 0; i < 48; i++) {
      c.save(); c.rotate(i / 48 * TAU); c.translate(0, -425); sigil(c, i); c.restore();
    }
  } else {
    const count = kind === "hours" ? 96 : 60;
    for (let i = 0; i < count; i++) {
      const major = i % (kind === "hours" ? 4 : 5) === 0;
      c.save(); c.rotate(i / count * TAU); c.globalAlpha = major ? 1 : .58;
      c.lineWidth = major ? 3 : 1.5;
      c.beginPath(); c.moveTo(0, -442); c.lineTo(0, major ? -420 : -432); c.stroke(); c.restore();
    }
    if (kind !== "seconds") {
      const count = kind === "hours" ? 24 : 12;
      c.font = kind === "hours" ? "25px Georgia, serif" : "23px Georgia, serif"; c.globalAlpha = .95;
      for (let i = 0; i < count; i++) {
        const a = i / count * TAU;
        c.fillText(String(kind === "hours" ? i : i * 5).padStart(2, "0"), Math.sin(a) * 391, -Math.cos(a) * 391);
      }
      circle(369, 1, .26);
    }
  }
  return result.texture;
}

function glowTexture() {
  const { texture, c } = canvasTexture(64);
  const glow = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "#fff8e5"); glow.addColorStop(.12, "#fff0c4dc");
  glow.addColorStop(.35, "#ffd28e45"); glow.addColorStop(1, "#ffc56e00");
  c.fillStyle = glow; c.fillRect(0, 0, 64, 64); return texture;
}

function rosetteTexture() {
  const { c, texture } = canvasTexture(512);
  c.translate(256, 256); c.strokeStyle = "#fff0c9"; c.fillStyle = GOLD;
  c.shadowColor = GOLD; c.shadowBlur = 12; c.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    c.save(); c.rotate(i / 8 * TAU);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-92, -65, -45, -146, 0, -178);
    c.bezierCurveTo(45, -146, 92, -65, 0, 0); c.stroke();
    c.beginPath(); c.arc(0, -201, 3, 0, TAU); c.fill(); c.restore();
  }
  for (const r of [40, 188, 215]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
  c.beginPath(); c.moveTo(0, -28); c.lineTo(20, 0); c.lineTo(0, 28); c.lineTo(-20, 0); c.closePath(); c.fill();
  return texture;
}

function softBandTexture() {
  const { c, texture } = canvasTexture(128, 8), g = c.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, "#ffffff00"); g.addColorStop(.72, "#ffffff35");
  g.addColorStop(.92, "#ffffff90"); g.addColorStop(1, "#ffffff00");
  c.fillStyle = g; c.fillRect(0, 0, 128, 8); return texture;
}

function arcGeometry(segments: number) {
  const geometry = new THREE.BufferGeometry(), indices: number[] = [], uv: number[] = [];
  for (let i = 0; i <= segments; i++) uv.push(0, i / segments, 1, i / segments);
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  for (let i = 0; i < segments; i++) { const v = i * 2; indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((segments + 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.9);
  return geometry;
}

function loopGeometry(small: boolean) {
  const positions: number[] = [], indices: number[] = [], count = small ? 120 : 200;
  for (let i = 0; i <= count; i++) {
    const a = i / count * TAU;
    for (const side of [-1, 1]) {
      const width = side * .022, r = 1.32 + width * Math.cos(a * 1.5);
      positions.push(Math.cos(a) * r, Math.sin(a * 2) * .58 + width * Math.sin(a * 1.5), Math.sin(a) * r);
    }
    if (i < count) { const v = i * 2; indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function archShape(width: number, bottom: number, shoulder: number) {
  const s = new THREE.Shape(), r = width / 2;
  s.moveTo(-r, bottom); s.lineTo(r, bottom); s.lineTo(r, shoulder);
  s.absarc(0, shoulder, r, 0, Math.PI, false); s.lineTo(-r, bottom); return s;
}

function hallGeometry(small: boolean) {
  const walls: THREE.BufferGeometry[] = [], frames: THREE.BufferGeometry[] = [], columns: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [], windows: THREE.BufferGeometry[] = [];
  const count = 16, radius = 15, width = 2 * radius * Math.tan(Math.PI / count) + .06;
  function place(g: THREE.BufferGeometry, angle: number, z = -radius) { g.translate(0, 0, z); g.rotateY(angle); return g; }
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU, wall = new THREE.Shape();
    wall.moveTo(-width / 2, 0); wall.lineTo(width / 2, 0); wall.lineTo(width / 2, 10); wall.lineTo(-width / 2, 10); wall.closePath();
    const opening = archShape(2.1, 2.5, 6.35);
    wall.holes.push(new THREE.Path(opening.getPoints(20).reverse()));
    walls.push(place(new THREE.ExtrudeGeometry(wall, { depth: .35, bevelEnabled: false, curveSegments: small ? 12 : 20 }), a));
    const border = archShape(2.55, 2.28, 6.35);
    border.holes.push(new THREE.Path(archShape(2.12, 2.51, 6.35).getPoints(24).reverse()));
    frames.push(place(new THREE.ExtrudeGeometry(border, { depth: .2, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 1, curveSegments: 16 }), a, -radius + .13));
    const window = new THREE.ShapeGeometry(opening, 20), uv = window.getAttribute("uv"), positions = window.getAttribute("position");
    for (let v = 0; v < positions.count; v++) uv.setXY(v, (positions.getX(v) + 1.05) / 2.1, (positions.getY(v) - 2.5) / 4.9);
    windows.push(place(window, a, -radius - .05));
    const col = new THREE.CylinderGeometry(.25, .33, 8.3, small ? 10 : 16);
    const colUv = col.getAttribute("uv");
    for (let v = 0; v < colUv.count; v++) colUv.setXY(v, colUv.getX(v) * 1.8, colUv.getY(v) * 8.3);
    col.translate(-width / 2 + .06, 4.15, -radius + .32); col.rotateY(a); columns.push(col);
    for (const y of [.23, .52, 8.1, 8.38]) {
      const g = new THREE.CylinderGeometry(.46, .48, .16, small ? 10 : 16);
      g.translate(-width / 2 + .06, y, -radius + .32); g.rotateY(a); trim.push(g);
    }
    const mullion = new THREE.BoxGeometry(.045, 4.7, .055);
    mullion.translate(0, 4.82, -radius + .025); mullion.rotateY(a); trim.push(mullion);
    const cross = new THREE.BoxGeometry(2.1, .04, .055);
    cross.translate(0, 5.65, -radius + .025); cross.rotateY(a); trim.push(cross);
  }
  const merge = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts); parts.forEach((p) => p.dispose()); return g!; };
  return { walls: merge(walls), frames: merge(frames), columns: merge(columns), trim: merge(trim), windows: merge(windows) };
}

function skyTexture() {
  const { c, texture } = canvasTexture(256, 512), gradient = c.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#242d63"); gradient.addColorStop(.5, "#131b42"); gradient.addColorStop(1, "#080d26");
  c.fillStyle = gradient; c.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 26; i++) {
    c.globalAlpha = .2 + noise(i + 80) * .65; c.fillStyle = "#d6dfff";
    c.beginPath(); c.arc(10 + noise(i) * 236, noise(i + 50) * 460, i % 7 ? .6 : 1.1, 0, TAU); c.fill();
  }
  return texture;
}

function stoneTexture(small: boolean) {
  const size = small ? 256 : 512;
  const { c, texture } = canvasTexture(size), data = c.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = x * 512 / size, sy = y * 512 / size;
    const row = Math.floor(sy / 64), col = Math.floor((sx + (row % 2) * 128) / 256);
    const block = noise(row * 17 + col + 42) * 24;
    const value = 140 + block + noise(x + y * size) * 25 + Math.sin(sx * .07 + Math.sin(sy * .04)) * 7;
    const p = (y * size + x) * 4;
    data.data[p] = value + 7; data.data[p + 1] = value + 4; data.data[p + 2] = value; data.data[p + 3] = 255;
  }
  c.putImageData(data, 0, 0); c.scale(size / 512, size / 512);
  for (let y = 0; y <= 512; y += 64) {
    c.strokeStyle = "#343039"; c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, y); c.lineTo(512, y); c.stroke();
    c.strokeStyle = "#d4c9ad66"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, y + 3); c.lineTo(512, y + 3); c.stroke();
    for (let x = (y % 128 === 0 ? 0 : 128); x < 512; x += 256) {
      c.strokeStyle = "#39343d"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 64); c.stroke();
    }
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(.55, .7); return texture;
}

function moonTexture() {
  const { c, texture } = canvasTexture(128, 256);
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#b1caff00"); g.addColorStop(.15, "#b1caff12");
  g.addColorStop(.9, "#c1d4ff38"); g.addColorStop(1, "#b1caff00");
  c.fillStyle = g; c.fillRect(0, 0, 128, 256);
  c.globalCompositeOperation = "destination-in";
  const edge = c.createLinearGradient(0, 0, 128, 0);
  edge.addColorStop(0, "#ffffff00"); edge.addColorStop(.2, "#ffffffff");
  edge.addColorStop(.8, "#ffffffff"); edge.addColorStop(1, "#ffffff00");
  c.fillStyle = edge; c.fillRect(0, 0, 128, 256); return texture;
}

function floorRuneTexture() {
  const { c, texture } = canvasTexture(1024);
  c.translate(512, 512); c.strokeStyle = "#1a111c"; c.fillStyle = "#79644d"; c.lineWidth = 5;
  for (let i = 0; i < 64; i++) {
    c.save(); c.rotate(i / 64 * TAU); c.translate(0, -442); c.scale(1.2, 1.2);
    sigil(c, i); c.translate(0, 1.5); c.strokeStyle = "#b9a17c70"; c.lineWidth = 1; sigil(c, i); c.restore();
  }
  return texture;
}

function carvedBandTexture() {
  const { c, texture } = canvasTexture(1024, 128);
  c.strokeStyle = "#211923"; c.fillStyle = "#a28b67"; c.lineWidth = 4;
  for (let i = 0; i < 32; i++) {
    c.save(); c.translate(16 + i * 32, 64); c.scale(1, 1.8); sigil(c, i);
    c.translate(0, 1.2); c.strokeStyle = "#c3b69880"; c.lineWidth = 1; sigil(c, i); c.restore();
  }
  return texture;
}

function chamberDetails(small: boolean) {
  const shafts: THREE.BufferGeometry[] = [], pools: THREE.BufferGeometry[] = [], sconces: THREE.BufferGeometry[] = [];
  const flames: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    // Two triangles per window: the light slants down from the arch into the hall.
    const shaft = new THREE.BufferGeometry();
    shaft.setAttribute("position", new THREE.Float32BufferAttribute([-.95, 6.8, -14.8, .95, 6.8, -14.8, -1.55, .04, -6.5, 1.55, .04, -6.5], 3));
    shaft.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
    shaft.setIndex([0, 2, 1, 1, 2, 3]); shaft.rotateY(a); shafts.push(shaft);
    const pool = new THREE.PlaneGeometry(3.1, 6); pool.rotateX(-Math.PI / 2); pool.translate(0, .018, -9.2); pool.rotateY(a); pools.push(pool);
    for (const [g, y, z] of [
      [new THREE.CylinderGeometry(.28, .13, .22, 8), 3.1, -14.2],
      [new THREE.BoxGeometry(.12, .7, .15), 2.82, -14.5],
      [new THREE.BoxGeometry(.13, .12, .7), 2.75, -14.4],
    ] as const) { g.translate(2.2, y, z); g.rotateY(a); sconces.push(g); }
    const v = new THREE.Vector3(2.2, 3.38, -14.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    flames.push([v.x, v.y, v.z]);
  }
  const profile = [[0, 0], [1.48, 0], [1.48, .12], [1.35, .2], [1.25, .24], [1.16, .34], [1.16, .64], [1.3, .72], [1.35, .79], [1.35, .88], [0, .88]].map(([x, y]) => new THREE.Vector2(x, y));
  const pedestal = new THREE.LatheGeometry(profile, small ? 16 : 32);
  const uv = pedestal.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i));
  const merge = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts)!; parts.forEach((p) => p.dispose()); return g; };
  return { shafts: merge(shafts), pools: merge(pools), sconces: merge(sconces), pedestal, flames };
}

function Chamber({ small, running, reduced }: Pick<SceneContentProps, "small" | "running" | "reduced">) {
  const resources = useMemo(() => {
    const flat = canvasTexture(1); flat.c.fillStyle = "#ffffff"; flat.c.fillRect(0, 0, 1, 1);
    return { ...hallGeometry(small), sky: skyTexture(), stone: stoneTexture(small), flat: flat.texture,
      moon: moonTexture(), glow: glowTexture(), floorRunes: floorRuneTexture(), carvedBand: carvedBandTexture() };
  }, [small]);
  const details = useMemo(() => chamberDetails(small), [small]);
  const candles = useRef<THREE.Group>(null), flicker = useRef(0);
  useFrame((_, delta) => {
    if (!running || reduced || !candles.current) return;
    flicker.current += Math.min(delta, .1);
    const t = flicker.current;
    candles.current.children.forEach((child, i) => {
      const f = .87 + Math.sin(t * 6 + i * 2) * .08 + Math.sin(t * 13 + i) * .05;
      if (child instanceof THREE.Sprite) child.scale.y = (child.userData.halo ? 1.4 : .48) * f;
      if (child instanceof THREE.Mesh) (child.material as THREE.MeshBasicMaterial).opacity = .32 * f;
    });
  });
  useEffect(() => () => Object.values(resources).forEach((v) => v.dispose()), [resources]);
  useEffect(() => () => { details.shafts.dispose(); details.pools.dispose(); details.sconces.dispose(); details.pedestal.dispose(); }, [details]);
  return <>
    <mesh geometry={resources.walls}><meshLambertMaterial color="#676176" map={resources.stone} side={THREE.DoubleSide} /></mesh>
    <mesh geometry={resources.frames}><meshLambertMaterial map={resources.stone} side={THREE.DoubleSide} color="#8c8291" /></mesh>
    <mesh geometry={resources.columns}><meshLambertMaterial color="#8b7e8a" map={resources.stone} side={THREE.DoubleSide} /></mesh>
    <mesh geometry={resources.trim}><meshLambertMaterial map={resources.stone} side={THREE.DoubleSide} color="#928475" /></mesh>
    <mesh geometry={resources.windows}><meshBasicMaterial map={resources.sky} color="#b9c9ff" side={THREE.DoubleSide} toneMapped={false} /></mesh>
    <mesh position={[0, 8.4, -9.5]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[2.8, 30, 64]} /><meshLambertMaterial map={resources.flat} color="#272a43" side={THREE.DoubleSide} /></mesh>
    <mesh position={[0, 8.35, -9.5]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[2.85, .12, 6, 64]} /><meshLambertMaterial map={resources.flat} side={THREE.DoubleSide} color="#82766f" emissive="#343954" emissiveIntensity={.3} /></mesh>
    <mesh position={[0, 8.55, -9.5]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[2.8, 48]} /><meshBasicMaterial map={resources.sky} side={THREE.DoubleSide} color="#a6b9ff" toneMapped={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}><circleGeometry args={[22, small ? 64 : 96]} /><meshLambertMaterial map={resources.flat} side={THREE.DoubleSide} color="#07080f" depthWrite={false} /></mesh>
    <mesh geometry={details.shafts}><meshBasicMaterial map={resources.moon} transparent blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
    <mesh geometry={details.pools} renderOrder={3}><meshBasicMaterial map={resources.moon} color="#a5bfff" transparent opacity={.45} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
    {[3.1, 3.62, 6.7, 6.76].map((r) => <mesh key={r} position={[0, .022, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}><ringGeometry args={[r, r + .012, small ? 64 : 128]} /><meshBasicMaterial color="#ad8b5b" side={THREE.DoubleSide} toneMapped={false} transparent opacity={r < 4 ? .28 : .16} depthWrite={false} /></mesh>)}
    <mesh position={[0, .025, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}><planeGeometry args={[8, 8]} /><meshBasicMaterial map={resources.floorRunes} transparent opacity={.44} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
    <mesh geometry={details.pedestal}><meshLambertMaterial map={resources.stone} side={THREE.DoubleSide} color="#777080" /></mesh>
    <mesh position={[0, .49, 0]}><cylinderGeometry args={[1.165, 1.165, .29, small ? 16 : 32, 1, true]} /><meshBasicMaterial map={resources.carvedBand} transparent opacity={.75} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
    <mesh position={[0, .89, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[1.19, .012, 4, 64]} /><meshBasicMaterial color="#b69c66" side={THREE.DoubleSide} toneMapped={false} /></mesh>
    <mesh geometry={details.sconces}><meshLambertMaterial map={resources.flat} color="#66503a" side={THREE.DoubleSide} /></mesh>
    <group ref={candles}>
      {details.flames.map((position, i) => <sprite key={`halo-${i}`} position={position} scale={[1.15, 1.4, 1]} userData={{ halo: true }}><spriteMaterial map={resources.glow} color="#ff913b" transparent opacity={.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>)}
      {details.flames.map((position, i) => <sprite key={i} position={position} scale={[.16, .48, 1]}><spriteMaterial map={resources.glow} color="#ffdd8d" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>)}
      {/* Wall light is a two-triangle glow, keeping the original point-light/shader budget. */}
      {[1, 7].map((i) => <mesh key={i} position={details.flames[i]} rotation={[0, i / 8 * TAU, 0]}><planeGeometry args={[4.5, 5.5]} /><meshBasicMaterial map={resources.glow} color="#ffad5f" transparent opacity={.32} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>)}
    </group>
  </>;
}

type EngineTextures = { hours: THREE.Texture; minutes: THREE.Texture; seconds: THREE.Texture; runes: THREE.Texture; glow: THREE.Texture; rosette: THREE.Texture; sector: THREE.Texture };

function Engine({ active, running, reduced, small, reflection = false, textures }: SceneContentProps & { reflection?: boolean; textures: EngineTextures }) {
  const hour = useRef<THREE.Group>(null), minute = useRef<THREE.Group>(null), second = useRef<THREE.Group>(null);
  const gimbal = useRef<THREE.Group>(null), rune = useRef<THREE.Group>(null), loop = useRef<THREE.Mesh>(null);
  const markerH = useRef<THREE.Group>(null), markerM = useRef<THREE.Group>(null), markerS = useRef<THREE.Group>(null);
  const arcMaterial = useRef<THREE.MeshBasicMaterial>(null), sectorMaterial = useRef<THREE.MeshBasicMaterial>(null), rosette = useRef<THREE.Mesh>(null);
  const state = useRef({ elapsed: 0, reveal: 0, duration: 0, hover: 0, pulse: 9, key: "", color: new THREE.Color(GOLD), accent: new THREE.Color() });
  const resources = useMemo(() => ({ arc: arcGeometry(small ? 48 : 96), sector: arcGeometry(small ? 48 : 96), loop: loopGeometry(small) }), [small]);
  useEffect(() => () => { resources.arc.dispose(); resources.sector.dispose(); resources.loop.dispose(); }, [resources]);
  const strength = reflection ? .11 : 1;
  useFrame((_, delta) => {
    if (!running) return;
    const s = state.current, dt = Math.min(delta, .1), now = new Date(Date.now());
    s.reveal += delta; if (!reduced) s.elapsed += dt;
    const id = active ? `${active.id}:${active.duration_minutes}` : "";
    if (s.key !== id) { s.key = id; if (active) s.pulse = 0; }
    s.pulse += dt;
    s.duration = THREE.MathUtils.damp(s.duration, active?.duration_minutes ?? s.duration, 5, dt);
    s.hover = THREE.MathUtils.damp(s.hover, active ? 1 : 0, 5, dt);
    if (active) s.color.lerp(s.accent.set(active.color), 1 - Math.exp(-dt * 5));
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000, minutes = now.getMinutes() + seconds / 60, hours = now.getHours() + minutes / 60;
    // Preview the meeting's span, then settle precisely back onto live time.
    const anticipate = reduced || s.pulse > 2.8 ? 0 : Math.sin(Math.PI * s.pulse / 2.8) ** 2 * Math.min(s.duration / 60, 1);
    if (markerH.current) markerH.current.rotation.z = -(hours / 24 + anticipate / 24) * TAU;
    if (markerM.current) markerM.current.rotation.z = -(minutes / 60 + anticipate) * TAU;
    if (markerS.current) markerS.current.rotation.z = -seconds / 60 * TAU;
    const t = s.elapsed;
    const ignite = (group: THREE.Group | null, delay: number) => {
      if (!group) return;
      if (group.userData.ignited) return;
      const amount = reduced ? 1 : smooth((s.reveal - delay) / .75);
      group.scale.setScalar(.85 + .15 * amount); group.visible = amount > .005;
      group.traverse((object) => {
        if ((object instanceof THREE.Mesh || object instanceof THREE.Sprite) && object.userData.ignition !== false) (object.material as THREE.MeshBasicMaterial).opacity = amount * strength;
      });
      if (amount === 1) group.userData.ignited = true;
    };
    ignite(second.current, 0); ignite(minute.current, .25); ignite(hour.current, .5); ignite(gimbal.current, .7);
    if (hour.current) hour.current.rotation.set(.03 + Math.sin(t * .09) * .035, Math.sin(t * .08) * .09, 0);
    if (minute.current) minute.current.rotation.set(-.13, .21 + Math.sin(t * .12) * .06, 0);
    if (second.current) second.current.rotation.set(.14, -.23, 0);
    if (gimbal.current) gimbal.current.rotation.set(.76 + Math.sin(t * .07) * .09, -.62 + Math.sin(t * .09) * .12, t * .025 + anticipate * TAU);
    if (rune.current) rune.current.rotation.z = -t * .045 - anticipate * TAU * .7;
    if (loop.current) {
      loop.current.rotation.set(.35 + Math.sin(t * .12) * .13, t * .055, -.3);
      (loop.current.material as THREE.MeshBasicMaterial).opacity = smooth(s.reveal / .65) * strength * .85;
    }
    if (rosette.current) {
      rosette.current.rotation.z = t * .075;
      (rosette.current.material as THREE.MeshBasicMaterial).opacity = smooth(s.reveal / 1.2) * strength * (.8 + Math.sin(t * .6) * .12);
    }
    if (s.hover < .001) {
      if (arcMaterial.current) arcMaterial.current.opacity = 0;
      if (sectorMaterial.current) sectorMaterial.current.opacity = 0;
      return;
    }
    const p = resources.arc.getAttribute("position") as THREE.BufferAttribute, fill = resources.sector.getAttribute("position") as THREE.BufferAttribute;
    const count = p.count / 2 - 1, span = Math.min(s.duration / 60, 1) * TAU * s.hover;
    for (let i = 0; i <= count; i++) {
      const a = minutes / 60 * TAU + i / count * span;
      for (let edge = 0; edge < 2; edge++) {
        const r = edge ? 1.785 : 1.717, fr = edge ? 1.8 : 1.34;
        p.setXYZ(i * 2 + edge, Math.sin(a) * r, Math.cos(a) * r, .035);
        fill.setXYZ(i * 2 + edge, Math.sin(a) * fr, Math.cos(a) * fr, .028);
      }
    }
    p.needsUpdate = true; fill.needsUpdate = true;
    if (sectorMaterial.current) { sectorMaterial.current.color.copy(s.color); sectorMaterial.current.opacity = s.hover * strength * .55; }
    if (arcMaterial.current) { arcMaterial.current.color.copy(s.color); arcMaterial.current.opacity = s.hover * strength * .95; }
  });
  const lightMaterial = (map?: THREE.Texture) => <meshBasicMaterial map={map} color={map ? "#ffffff" : GOLD} transparent opacity={strength} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />;
  const marker = (radius: number, size: number, length: number, color: string) => <>
    <mesh position={[0, radius - length / 2, .05]}><planeGeometry args={[size * .6, length]} /><meshBasicMaterial map={textures.glow} color={color} transparent opacity={strength} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    <mesh position={[0, radius, .055]} rotation={[0, 0, Math.PI / 4]}><planeGeometry args={[size, size]} /><meshBasicMaterial color={color} transparent opacity={strength} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    <mesh position={[0, 0, .045]} rotation={[0, 0, Math.PI / 2]}><ringGeometry args={[radius - size * .35, radius + size * .35, 20, 1, 0, .32]} />{lightMaterial()}</mesh>
    <sprite position={[0, radius, .06]} scale={[size * 7, size * 7, 1]}><spriteMaterial map={textures.glow} color={color} blending={THREE.AdditiveBlending} transparent opacity={strength} depthWrite={false} toneMapped={false} /></sprite>
  </>;
  return <group position={[0, reflection ? -CENTER : CENTER, 0]} scale={[1, reflection ? -1 : 1, 1]} renderOrder={reflection ? 2 : 0}>
    <group ref={hour}>
      <mesh><planeGeometry args={[5.2, 5.2]} />{lightMaterial(textures.hours)}</mesh>
      <group ref={markerH}>{marker(2.25, .095, .85, "#ffe5a3")}</group>
    </group>
    <group ref={minute}>
      <mesh><planeGeometry args={[3.96, 3.96]} />{lightMaterial(textures.minutes)}</mesh>
      <group ref={markerM}>{marker(1.72, .075, .62, "#fff6dc")}</group>
      <mesh geometry={resources.sector} userData={{ ignition: false }}><meshBasicMaterial ref={sectorMaterial} map={textures.sector} transparent opacity={0} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
      <mesh geometry={resources.arc} userData={{ ignition: false }}><meshBasicMaterial ref={arcMaterial} transparent opacity={0} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
    </group>
    <group ref={second}>
      <mesh><planeGeometry args={[2.94, 2.94]} />{lightMaterial(textures.seconds)}</mesh>
      <group ref={markerS}>{marker(1.28, .035, .3, "#bcffea")}</group>
    </group>
    <group ref={gimbal}>
      <mesh><torusGeometry args={[2.49, .012, 4, small ? 96 : 160]} />{lightMaterial()}</mesh>
      <mesh><planeGeometry args={[5.65, 5.65]} />{lightMaterial(textures.runes)}</mesh>
      <group ref={rune} rotation={[.85, .6, 0]}><mesh><planeGeometry args={[4.62, 4.62]} />{lightMaterial(textures.runes)}</mesh></group>
    </group>
    <mesh ref={rosette} position={[0, 0, .12]}><planeGeometry args={[1.32, 1.32]} />{lightMaterial(textures.rosette)}</mesh>
    <mesh ref={loop} geometry={resources.loop}><meshBasicMaterial color="#68f3b0" transparent opacity={strength * .8} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

export default function Sanctum(props: SceneContentProps) {
  const { running, reduced, small } = props;
  const resources = useMemo(() => ({
    hours: dialTexture("hours", small), minutes: dialTexture("minutes", small), seconds: dialTexture("seconds", small),
    runes: dialTexture("runes", small), glow: glowTexture(), rosette: rosetteTexture(), sector: softBandTexture(),
  }), [small]);
  const dust = useMemo(() => {
    const geometry = new THREE.BufferGeometry(), count = small ? 36 : 70, positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { positions[i * 3] = (noise(i) - .5) * 7; positions[i * 3 + 1] = noise(i + 100) * 7; positions[i * 3 + 2] = (noise(i + 200) - .5) * 6; }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); return geometry;
  }, [small]);
  const points = useRef<THREE.Points>(null), warmLight = useRef<THREE.PointLight>(null);
  const state = useRef({ elapsed: 0, reveal: 0 });
  useEffect(() => () => {
    resources.hours.dispose(); resources.minutes.dispose(); resources.seconds.dispose(); resources.runes.dispose(); resources.glow.dispose(); resources.rosette.dispose(); resources.sector.dispose(); dust.dispose();
  }, [resources, dust]);
  useFrame((_, delta) => {
    if (!running) return;
    const dt = Math.min(delta, .1), s = state.current;
    s.reveal += delta; if (!reduced) s.elapsed += dt;
    if (warmLight.current) warmLight.current.intensity = 64 * smooth(s.reveal / 1.5);
    if (points.current && !reduced) {
      const p = dust.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setY(i, (noise(i + 100) * 7 + s.elapsed * (.035 + noise(i + 300) * .04)) % 7);
      p.needsUpdate = true; points.current.rotation.y = s.elapsed * .008;
    }
  });
  return <>
    <color attach="background" args={["#080c22"]} />
    <fog attach="fog" args={["#111326", 20, 55]} />
    <ambientLight color="#8492cc" intensity={.7} />
    <hemisphereLight args={["#a8bbef", "#2b203b", .8]} />
    <pointLight ref={warmLight} position={[0, 3.25, .8]} color="#ffc477" intensity={0} distance={15} decay={2} />
    <pointLight position={[0, 7, -5.5]} color="#95acff" intensity={38} distance={19} decay={2} />
    <directionalLight position={[-4, 8, 4]} color="#9fb8ff" intensity={.85} />
    <Chamber small={small} running={running} reduced={reduced} />
    <Engine {...props} textures={resources} />
    <Engine {...props} textures={resources} reflection />
    <points ref={points} geometry={dust}><pointsMaterial map={resources.glow} color="#ffd39b" size={small ? .07 : .065} transparent opacity={.62} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></points>
  </>;
}
