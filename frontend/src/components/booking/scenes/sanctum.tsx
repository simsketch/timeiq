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

function clockTexture() {
  const result = canvasTexture(1024, 320);
  function draw(now: Date) {
    const c = result.c; c.clearRect(0, 0, 1024, 320);
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#bfa585"; c.font = "19px Georgia, serif"; c.fillText("L O C A L   T I M E", 512, 66);
    c.fillStyle = "#ffe7b6"; c.font = "96px Georgia, serif";
    c.fillText([now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":"), 512, 152);
    c.strokeStyle = "#ad895755"; c.lineWidth = 1; c.beginPath(); c.moveTo(320, 218); c.lineTo(704, 218); c.stroke();
    result.texture.needsUpdate = true;
  }
  return { ...result, draw };
}

function durationTexture() {
  const { c, texture } = canvasTexture(512, 96);
  c.textAlign = "center"; c.textBaseline = "middle"; c.font = "30px Georgia, serif"; c.fillStyle = "#ffffff";
  return { texture, draw(duration: number) {
    c.clearRect(0, 0, 512, 96); c.fillText(`${duration} MINUTES`, 256, 48); texture.needsUpdate = true;
  } };
}

function arcGeometry(segments: number) {
  const geometry = new THREE.BufferGeometry(), indices: number[] = [];
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

function stoneTexture() {
  const { c, texture } = canvasTexture(256), data = c.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const value = 170 + noise(x + y * 256) * 28 + Math.sin(x * .023 + Math.sin(y * .04)) * 13, p = (y * 256 + x) * 4;
    data.data[p] = value; data.data[p + 1] = value; data.data[p + 2] = value; data.data[p + 3] = 255;
  }
  c.putImageData(data, 0, 0); c.strokeStyle = "#666977"; c.lineWidth = 1;
  for (let y = 0; y <= 256; y += 64) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke();
    for (let x = (y % 128 === 0 ? 0 : 64); x < 256; x += 128) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 64); c.stroke(); }
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(.7, .55); return texture;
}

function Chamber({ small }: { small: boolean }) {
  const resources = useMemo(() => {
    // A one-pixel map lets plain stone and textured stone share one vertex-lit shader.
    // Keep side/map/tone-mapping variants consistent to make compilation cheap.
    const flat = canvasTexture(1); flat.c.fillStyle = "#ffffff"; flat.c.fillRect(0, 0, 1, 1);
    return { ...hallGeometry(small), sky: skyTexture(), stone: stoneTexture(), flat: flat.texture };
  }, [small]);
  useEffect(() => () => Object.values(resources).forEach((v) => v.dispose()), [resources]);
  return <>
    <mesh geometry={resources.walls}><meshLambertMaterial color="#4c4c66" map={resources.stone} side={THREE.DoubleSide} /></mesh>
    <mesh geometry={resources.frames}><meshLambertMaterial map={resources.flat} side={THREE.DoubleSide} color="#787286" /></mesh>
    <mesh geometry={resources.columns}><meshLambertMaterial color="#706a7b" map={resources.stone} side={THREE.DoubleSide} /></mesh>
    <mesh geometry={resources.trim}><meshLambertMaterial map={resources.flat} side={THREE.DoubleSide} color="#7e7168" /></mesh>
    <mesh geometry={resources.windows}><meshBasicMaterial map={resources.sky} color="#b9c9ff" side={THREE.DoubleSide} toneMapped={false} /></mesh>
    {/* The oculus and all sixteen bays continue behind the visitor. */}
    <mesh position={[0, 8.4, -9.5]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[2.8, 30, 64]} /><meshLambertMaterial map={resources.flat} color="#272a43" side={THREE.DoubleSide} /></mesh>
    <mesh position={[0, 8.35, -9.5]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[2.85, .12, 6, 64]} /><meshLambertMaterial map={resources.flat} side={THREE.DoubleSide} color="#82766f" emissive="#343954" emissiveIntensity={.3} /></mesh>
    <mesh position={[0, 8.55, -9.5]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[2.8, 48]} /><meshBasicMaterial map={resources.sky} side={THREE.DoubleSide} color="#a6b9ff" toneMapped={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}><circleGeometry args={[22, small ? 64 : 96]} /><meshLambertMaterial map={resources.flat} side={THREE.DoubleSide} color="#07080f" depthWrite={false} /></mesh>
    {[3.1, 3.22, 6.7, 6.76].map((r) => <mesh key={r} position={[0, .012, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}><ringGeometry args={[r, r + .012, small ? 64 : 128]} /><meshBasicMaterial color="#ad8b5b" side={THREE.DoubleSide} toneMapped={false} transparent opacity={r < 4 ? .28 : .16} depthWrite={false} /></mesh>)}
    <mesh position={[0, .18, 0]}><cylinderGeometry args={[1.23, 1.45, .36, small ? 32 : 64]} /><meshLambertMaterial map={resources.flat} side={THREE.DoubleSide} color="#2a2a39" /></mesh>
    <mesh position={[0, .38, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[1.16, .018, 5, 64]} /><meshBasicMaterial color="#b69c66" side={THREE.DoubleSide} toneMapped={false} /></mesh>
  </>;
}

type EngineTextures = { hours: THREE.Texture; minutes: THREE.Texture; seconds: THREE.Texture; runes: THREE.Texture; glow: THREE.Texture };

function Engine({ active, running, reduced, small, reflection = false, textures }: SceneContentProps & { reflection?: boolean; textures: EngineTextures }) {
  const hour = useRef<THREE.Group>(null), minute = useRef<THREE.Group>(null), second = useRef<THREE.Group>(null);
  const gimbal = useRef<THREE.Group>(null), rune = useRef<THREE.Group>(null), loop = useRef<THREE.Mesh>(null);
  const markerH = useRef<THREE.Group>(null), markerM = useRef<THREE.Group>(null), markerS = useRef<THREE.Group>(null);
  const arcMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const state = useRef({ elapsed: 0, reveal: 0, duration: 0, hover: 0, pulse: 9, key: "", color: new THREE.Color(GOLD), accent: new THREE.Color() });
  const resources = useMemo(() => ({ arc: arcGeometry(small ? 64 : 120), loop: loopGeometry(small) }), [small]);
  useEffect(() => () => { resources.arc.dispose(); resources.loop.dispose(); }, [resources]);
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
    // The markers remain honest while the rune gimbals anticipate the meeting.
    if (markerH.current) markerH.current.rotation.z = -hours / 24 * TAU;
    if (markerM.current) markerM.current.rotation.z = -minutes / 60 * TAU;
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
    const anticipate = reduced || s.pulse > 2.2 ? 0 : Math.sin(Math.PI * s.pulse / 2.2) ** 2 * Math.min(s.duration / 60, 1) * TAU;
    if (gimbal.current) gimbal.current.rotation.set(.76 + Math.sin(t * .07) * .09, -.62 + Math.sin(t * .09) * .12, t * .025 + anticipate);
    if (rune.current) rune.current.rotation.z = -t * .045 - anticipate * .7;
    if (loop.current) {
      loop.current.rotation.set(.35 + Math.sin(t * .12) * .13, t * .055, -.3);
      (loop.current.material as THREE.MeshBasicMaterial).opacity = smooth(s.reveal / .65) * strength * .85;
    }
    if (s.hover < .001) { if (arcMaterial.current) arcMaterial.current.opacity = 0; return; }
    const p = resources.arc.getAttribute("position") as THREE.BufferAttribute;
    const count = p.count / 2 - 1, span = Math.min(s.duration / 60, 1) * TAU * s.hover;
    for (let i = 0; i <= count; i++) {
      const a = minutes / 60 * TAU + i / count * span;
      for (let edge = 0; edge < 2; edge++) { const r = edge ? 1.785 : 1.717; p.setXYZ(i * 2 + edge, Math.sin(a) * r, Math.cos(a) * r, .035); }
    }
    p.needsUpdate = true;
    if (arcMaterial.current) { arcMaterial.current.color.copy(s.color); arcMaterial.current.opacity = s.hover * strength * .95; }
  });
  const lightMaterial = (map?: THREE.Texture) => <meshBasicMaterial map={map} color={map ? "#ffffff" : GOLD} transparent opacity={strength} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />;
  const marker = (radius: number, size: number) => <>
    <mesh position={[0, radius, .045]} rotation={[0, 0, Math.PI / 4]}><planeGeometry args={[size, size]} /><meshBasicMaterial color="#fff3d2" transparent opacity={strength} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    <sprite position={[0, radius, .05]} scale={[size * 6, size * 6, 1]}><spriteMaterial map={textures.glow} color={GOLD} blending={THREE.AdditiveBlending} transparent opacity={strength} depthWrite={false} toneMapped={false} /></sprite>
  </>;
  return <group position={[0, reflection ? -CENTER : CENTER, 0]} scale={[1, reflection ? -1 : 1, 1]} renderOrder={reflection ? 2 : 0}>
    <group ref={hour}>
      <mesh><planeGeometry args={[5.2, 5.2]} />{lightMaterial(textures.hours)}</mesh>
      <group ref={markerH}>{marker(2.25, .095)}</group>
    </group>
    <group ref={minute}>
      <mesh><planeGeometry args={[3.96, 3.96]} />{lightMaterial(textures.minutes)}</mesh>
      <group ref={markerM}>{marker(1.72, .075)}</group>
      <mesh geometry={resources.arc} userData={{ ignition: false }}><meshBasicMaterial ref={arcMaterial} transparent opacity={0} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
    </group>
    <group ref={second}>
      <mesh><planeGeometry args={[2.94, 2.94]} />{lightMaterial(textures.seconds)}</mesh>
      <group ref={markerS}>{marker(1.28, .045)}</group>
    </group>
    <group ref={gimbal}>
      <mesh><torusGeometry args={[2.49, .012, 4, small ? 96 : 160]} />{lightMaterial()}</mesh>
      <mesh><planeGeometry args={[5.65, 5.65]} />{lightMaterial(textures.runes)}</mesh>
      <group ref={rune} rotation={[.85, .6, 0]}><mesh><planeGeometry args={[4.62, 4.62]} />{lightMaterial(textures.runes)}</mesh></group>
    </group>
    <mesh ref={loop} geometry={resources.loop}><meshBasicMaterial color="#68f3b0" transparent opacity={strength * .8} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

export default function Sanctum(props: SceneContentProps) {
  const { active, running, reduced, small } = props;
  const resources = useMemo(() => ({
    hours: dialTexture("hours", small), minutes: dialTexture("minutes", small), seconds: dialTexture("seconds", small),
    runes: dialTexture("runes", small), glow: glowTexture(), clock: clockTexture(), duration: durationTexture(),
  }), [small]);
  const dust = useMemo(() => {
    const geometry = new THREE.BufferGeometry(), count = small ? 36 : 70, positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { positions[i * 3] = (noise(i) - .5) * 7; positions[i * 3 + 1] = noise(i + 100) * 7; positions[i * 3 + 2] = (noise(i + 200) - .5) * 6; }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); return geometry;
  }, [small]);
  const timeDisplay = useRef<THREE.Mesh>(null), durationDisplay = useRef<THREE.MeshBasicMaterial>(null), points = useRef<THREE.Points>(null), warmLight = useRef<THREE.PointLight>(null);
  const state = useRef({ elapsed: 0, reveal: 0, second: -1, duration: -1, hover: 0, accent: new THREE.Color(GOLD), resources });
  useEffect(() => () => {
    resources.hours.dispose(); resources.minutes.dispose(); resources.seconds.dispose(); resources.runes.dispose(); resources.glow.dispose(); resources.clock.texture.dispose(); resources.duration.texture.dispose(); dust.dispose();
  }, [resources, dust]);
  useFrame((_, delta) => {
    if (!running) return;
    const dt = Math.min(delta, .1), s = state.current, now = Date.now();
    if (s.resources !== resources) { s.resources = resources; s.second = -1; s.duration = -1; s.hover = 0; }
    s.reveal += delta; if (!reduced) s.elapsed += dt;
    const duration = active?.duration_minutes ?? 0, second = Math.floor(now / 1000);
    if (second !== s.second) { resources.clock.draw(new Date(now)); s.second = second; }
    if (active && duration !== s.duration && s.hover < .04) {
      resources.duration.draw(duration);
      s.duration = duration;
    }
    s.hover = THREE.MathUtils.damp(s.hover, active && duration === s.duration ? 1 : 0, 7, dt);
    if (durationDisplay.current) {
      durationDisplay.current.opacity = s.hover;
      if (active) durationDisplay.current.color.lerp(s.accent.set(active.color), 1 - Math.exp(-dt * 5));
    }
    if (timeDisplay.current) (timeDisplay.current.material as THREE.MeshBasicMaterial).opacity = reduced ? 1 : smooth((s.reveal - .35) / 1.1);
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
    <Chamber small={small} />
    <Engine {...props} textures={resources} />
    <Engine {...props} textures={resources} reflection />
    <mesh ref={timeDisplay} position={[0, CENTER, 1.55]} renderOrder={4}><planeGeometry args={[2.65, .828]} /><meshBasicMaterial map={resources.clock.texture} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
    <mesh position={[0, CENTER - .29, 1.56]} renderOrder={4}><planeGeometry args={[1.8, .3375]} /><meshBasicMaterial ref={durationDisplay} map={resources.duration.texture} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} /></mesh>
    <points ref={points} geometry={dust}><pointsMaterial map={resources.glow} color="#ffd39b" size={small ? .07 : .065} transparent opacity={.62} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></points>
  </>;
}
