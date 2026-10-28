"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneContentProps } from "./types";

const TAU = Math.PI * 2;
type Case = "station" | "local" | "cuckoo" | "porthole" | "sunburst" | "regulator" | "carriage" | "octagon";
type Dial = "arabic" | "roman" | "railway" | "deco";
type ClockSpec = {
  city: string; zone?: string; x: number; y: number; radius: number;
  kind: Case; dial: Dial; seconds?: boolean;
};

// A deliberately irregular salon hang, with room around the central dial.
const CLOCKS: ClockSpec[] = [
  { city: "Your time", x: -.12, y: 3.55, radius: 1.13, kind: "local", dial: "arabic", seconds: true },
  { city: "London", zone: "Europe/London", x: -2.15, y: 5.54, radius: .63, kind: "station", dial: "railway", seconds: true },
  { city: "Paris", zone: "Europe/Paris", x: 1.96, y: 5.42, radius: .59, kind: "sunburst", dial: "deco" },
  { city: "São Paulo", zone: "America/Sao_Paulo", x: -.27, y: 5.94, radius: .43, kind: "octagon", dial: "roman" },
  { city: "New York", zone: "America/New_York", x: -2.24, y: 3.43, radius: .61, kind: "cuckoo", dial: "roman" },
  { city: "Tokyo", zone: "Asia/Tokyo", x: 2.28, y: 3.49, radius: .64, kind: "porthole", dial: "railway", seconds: true },
  { city: "Sydney", zone: "Australia/Sydney", x: 2.05, y: 1.48, radius: .61, kind: "regulator", dial: "roman" },
  { city: "Los Angeles", zone: "America/Los_Angeles", x: -2.31, y: .92, radius: .52, kind: "octagon", dial: "arabic" },
  { city: "Dubai", zone: "Asia/Dubai", x: -.97, y: 1.17, radius: .43, kind: "carriage", dial: "roman" },
  { city: "Mumbai", zone: "Asia/Kolkata", x: .14, y: 1.13, radius: .39, kind: "carriage", dial: "arabic" },
  { city: "Nairobi", zone: "Africa/Nairobi", x: -.34, y: -.35, radius: .47, kind: "station", dial: "railway" },
];

function textureFrom(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function woodTexture(small: boolean) {
  const canvas = document.createElement("canvas");
  const width = small ? 128 : 256, height = small ? 512 : 1024;
  canvas.width = width; canvas.height = height;
  const c = canvas.getContext("2d")!;
  const data = c.createImageData(width, height);
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const x = px * 256 / width, y = py * 1024 / height;
    const ribbon = x + 7 * Math.sin(y * .005 + x * .025) + 3 * Math.sin(y * .012);
    const grain = Math.sin(ribbon * 1.8 + Math.sin(ribbon * .16) * 4);
    const figure = Math.sin(ribbon * .049 + Math.sin(y * .003) * 1.3);
    const pore = Math.pow(.5 + .5 * Math.sin(ribbon * 3.7 + y * .018), 18);
    const noise = (Math.sin(x * 127.1 + y * 311.7) * 43758.5453 % 1 + 1) % 1;
    const v = figure * 9 + grain * 2 - pore * 7 + noise * 4;
    const i = (py * width + px) * 4;
    data.data[i] = 79 + v; data.data[i + 1] = 43 + v * .67; data.data[i + 2] = 27 + v * .43; data.data[i + 3] = 255;
  }
  c.putImageData(data, 0, 0);
  return textureFrom(canvas);
}

function faceTexture(style: Dial, small: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = small ? 512 : 768;
  const c = canvas.getContext("2d")!;
  c.scale(canvas.width / 768, canvas.height / 768);
  const dark = style === "deco";
  const wash = c.createRadialGradient(300, 260, 30, 384, 384, 390);
  wash.addColorStop(0, dark ? "#344e49" : "#fff7e3");
  wash.addColorStop(.78, dark ? "#233d36" : "#eee1bf");
  wash.addColorStop(1, dark ? "#132c27" : "#c6af80");
  c.fillStyle = wash; c.fillRect(0, 0, 768, 768);
  for (let i = 0; i < 1200; i++) {
    const x = (Math.sin(i * 127.1) * 43758.5453 % 1 + 1) % 1 * 768;
    const y = (Math.sin(i * 269.5) * 43758.5453 % 1 + 1) % 1 * 768;
    c.fillStyle = i % 3 ? "#704a1c08" : "#ffffff13";
    c.fillRect(x, y, 1, 1);
  }
  c.strokeStyle = dark ? "#b59c65" : "#9d875b"; c.lineWidth = 1;
  for (const r of [354, 347, 259]) {
    c.beginPath(); c.arc(384, 384, r, 0, TAU); c.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * TAU, major = i % 5 === 0;
    c.strokeStyle = dark ? "#e4cc93" : "#2f302b";
    c.lineWidth = major ? (style === "railway" ? 7 : 3) : 1.5;
    const r = major ? 319 : 333;
    c.beginPath(); c.moveTo(384 + Math.sin(a) * r, 384 - Math.cos(a) * r);
    c.lineTo(384 + Math.sin(a) * 342, 384 - Math.cos(a) * 342); c.stroke();
  }
  const roman = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillStyle = dark ? "#f1db9f" : "#30332e";
  c.font = style === "railway" ? "500 53px Arial, sans-serif" : style === "roman" ? "45px Georgia, serif" : "54px Georgia, serif";
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU, r = style === "roman" ? 290 : 287;
    c.fillText(style === "roman" ? roman[i] : String(i || 12), 384 + Math.sin(a) * r, 384 - Math.cos(a) * r);
  }
  c.strokeStyle = dark ? "#b59c65" : "#aa956b";
  c.beginPath(); c.moveTo(346, 220); c.lineTo(384, 213); c.lineTo(422, 220); c.stroke();
  c.beginPath(); c.arc(384, 220, 4, 0, TAU); c.stroke();
  return textureFrom(canvas);
}

function plateTexture(text: string) {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 100;
  const c = canvas.getContext("2d")!;
  const brass = c.createLinearGradient(0, 0, 0, 100);
  brass.addColorStop(0, "#dfc491"); brass.addColorStop(.18, "#bfa16a");
  brass.addColorStop(.5, "#c9ad75"); brass.addColorStop(1, "#8e6b3c");
  c.fillStyle = brass; c.fillRect(0, 0, 512, 100);
  c.strokeStyle = "#694e2e"; c.lineWidth = 2; c.strokeRect(6, 6, 500, 88);
  for (let i = 0; i < 45; i++) {
    c.fillStyle = i % 2 ? "#fff7ce0c" : "#52310c0c";
    c.fillRect(0, i * 2.3, 512, .7);
  }
  c.textAlign = "center"; c.textBaseline = "middle"; c.font = "39px Georgia, serif";
  c.fillStyle = "#f1d59a"; c.fillText(text, 256, 52);
  c.fillStyle = "#392b20"; c.fillText(text, 256, 50);
  for (const x of [20, 492]) {
    c.fillStyle = "#755732"; c.beginPath(); c.arc(x, 50, 6, 0, TAU); c.fill();
    c.strokeStyle = "#3c2d1b"; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 4, 48); c.lineTo(x + 4, 52); c.stroke();
  }
  return textureFrom(canvas);
}

function handGeometry(minute: boolean) {
  const length = minute ? .71 : .49, width = minute ? .022 : .038;
  const shape = new THREE.Shape();
  shape.moveTo(-width, -.11); shape.lineTo(-width, length * .65);
  shape.lineTo(-width * 2, length * .72); shape.lineTo(0, length);
  shape.lineTo(width * 2, length * .72); shape.lineTo(width, length * .65);
  shape.lineTo(width, -.11); shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function createKit(small: boolean) {
  const wood = woodTexture(small);
  const surface = (parameters: THREE.MeshStandardMaterialParameters) => small
    ? new THREE.MeshLambertMaterial({ color: parameters.color, map: parameters.map })
    : new THREE.MeshStandardMaterial(parameters);
  const textures = { arabic: faceTexture("arabic", small), roman: faceTexture("roman", small), railway: faceTexture("railway", small), deco: faceTexture("deco", small) };
  const disk = new THREE.CylinderGeometry(1, 1, 1, small ? 32 : 64); disk.rotateX(Math.PI / 2);
  const octagon = new THREE.CylinderGeometry(1, 1, 1, 8); octagon.rotateX(Math.PI / 2); octagon.rotateZ(Math.PI / 8);
  const roofShape = new THREE.Shape([new THREE.Vector2(-1.26, .69), new THREE.Vector2(0, 1.85), new THREE.Vector2(1.26, .69)]);
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: .36, bevelEnabled: true, bevelSize: .045, bevelThickness: .035, bevelSegments: 1, steps: 1 });
  roof.translate(0, 0, -.16);
  const rayShape = new THREE.Shape([new THREE.Vector2(-.06, .93), new THREE.Vector2(0, 1.64), new THREE.Vector2(.06, .93)]);
  const ray = new THREE.ExtrudeGeometry(rayShape, { depth: .07, bevelEnabled: false });
  const rays = new THREE.BufferGeometry(), stride = ray.getAttribute("position").array.length;
  const positions = new Float32Array(stride * 24), normals = new Float32Array(stride * 24);
  for (let i = 0; i < 24; i++) {
    const piece = ray.clone(); piece.scale(i % 2 ? .73 : 1, i % 2 ? .85 : 1, 1); piece.rotateZ(i / 24 * TAU);
    positions.set(piece.getAttribute("position").array, i * stride);
    normals.set(piece.getAttribute("normal").array, i * stride); piece.dispose();
  }
  ray.dispose();
  rays.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  rays.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1), disk, octagon, roof, rays,
    face: new THREE.CircleGeometry(.86, small ? 40 : 64),
    rim: new THREE.TorusGeometry(.94, .055, 8, small ? 40 : 64),
    fine: new THREE.TorusGeometry(.875, .014, 5, small ? 40 : 64),
    sphere: new THREE.SphereGeometry(1, 12, 8),
    hour: handGeometry(false), minute: handGeometry(true),
    arc: new THREE.RingGeometry(.775, .812, 120),
  };
  const materials = {
    walnut: surface({ color: "#d7a77c", map: wood, roughness: .59, metalness: .03 }),
    darkWood: surface({ color: "#704d35", map: wood, roughness: .53 }),
    trim: surface({ color: "#52301f", roughness: .52 }),
    recess: surface({ color: "#201d17", roughness: .86 }),
    brass: surface({ color: "#b29354", roughness: .34, metalness: .62 }),
    gold: surface({ color: "#debc72", roughness: .3, metalness: .54 }),
    bronze: surface({ color: "#645235", roughness: .52, metalness: .48 }),
    green: surface({ color: "#243d34", roughness: .48, metalness: .22 }),
    ink: surface({ color: "#202d2c", roughness: .55, metalness: .1 }),
    red: surface({ color: "#914a33", roughness: .45, metalness: .2 }),
    enamel: {
      arabic: surface({ map: textures.arabic, roughness: .72 }),
      roman: surface({ map: textures.roman, roughness: .72 }),
      railway: surface({ map: textures.railway, roughness: .72 }),
      deco: surface({ map: textures.deco, roughness: .72 }),
    },
  };
  return { small, geometries, materials, dispose() {
    Object.values(geometries).forEach((g) => g.dispose());
    const { enamel, ...surfaces } = materials;
    [...Object.values(surfaces), ...Object.values(enamel)].forEach((m) => m.dispose());
    [wood, ...Object.values(textures)].forEach((t) => t.dispose());
  } };
}
type Kit = ReturnType<typeof createKit>;
type Surface = Exclude<keyof Kit["materials"], "enamel">;

function Block({ kit, at, size, surface = "walnut" }: { kit: Kit; at: [number, number, number]; size: [number, number, number]; surface?: Surface }) {
  return <mesh geometry={kit.geometries.box} material={kit.materials[surface]} position={at} scale={size} castShadow receiveShadow />;
}

function Plate({ kit, city, y, width = 1.6, z = .18 }: { kit: Kit; city: string; y: number; width?: number; z?: number }) {
  const texture = useMemo(() => plateTexture(city), [city]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={[0, y, z]}>
    <mesh geometry={kit.geometries.box} scale={[width, .28, .028]} castShadow>
      {kit.small ? <meshLambertMaterial map={texture} /> : <meshStandardMaterial map={texture} roughness={.46} metalness={.32} />}
    </mesh>
  </group>;
}

function Pendulum({ kit, running, reduced, phase, long = false }: { kit: Kit; running: boolean; reduced: boolean; phase: number; long?: boolean }) {
  const pivot = useRef<THREE.Group>(null), elapsed = useRef(0);
  const length = long ? 1.45 : .94;
  useFrame((_, delta) => {
    if (!running || !pivot.current) return;
    elapsed.current += Math.min(delta, .1);
    const wake = THREE.MathUtils.smoothstep(elapsed.current, .35 + phase, 1.4 + phase);
    pivot.current.rotation.z = reduced ? 0 : Math.sin(elapsed.current * 3.3 + phase) * .105 * wake;
  });
  return <group ref={pivot} position={[0, -.78, .35]}>
    <Block kit={kit} at={[0, -length / 2, 0]} size={[.027, length, .035]} surface="brass" />
    <mesh geometry={kit.geometries.disk} material={kit.materials.brass} position={[0, -length, 0]} scale={[.24, .29, .06]} castShadow />
    <mesh geometry={kit.geometries.disk} material={kit.materials.gold} position={[0, -length, .035]} scale={[.19, .24, .018]} />
  </group>;
}

function ClockCase({ kit, spec, running, reduced }: { kit: Kit; spec: ClockSpec; running: boolean; reduced: boolean }) {
  const { geometries: g, materials: m } = kit;
  const kind = spec.kind;
  return <>
    {kind === "cuckoo" ? <>
      <Block kit={kit} at={[0, -.35, -.06]} size={[2.04, 2.55, .45]} surface="darkWood" />
      <mesh geometry={g.roof} material={m.walnut} castShadow />
      <Block kit={kit} at={[0, -1.05, .2]} size={[.86, .92, .035]} surface="recess" />
      <Pendulum kit={kit} running={running} reduced={reduced} phase={.4} />
      {[-1, 1].map((side) => <group key={side}>
        <Block kit={kit} at={[side * .97, -.4, .25]} size={[.15, 2.5, .2]} />
        <group position={[side * .63, 1.22, .3]} rotation={[0, 0, side * .82]}>
          <Block kit={kit} at={[0, 0, 0]} size={[.12, 1.82, .16]} />
        </group>
        {[0, 1, 2].map((i) => <mesh key={i} geometry={g.sphere} material={m.walnut} position={[side * .99, .55 - i * .6, .36]} rotation={[0, 0, side * .4]} scale={[.18, .29, .08]} castShadow />)}
        <Block kit={kit} at={[side * .44, -1.95, .1]} size={[.015, .8, .02]} surface="bronze" />
        <mesh geometry={g.sphere} material={m.bronze} position={[side * .44, -2.35, .1]} scale={[.1, .25, .1]} castShadow />
      </group>)}
      <Plate kit={kit} city={spec.city} y={-2.87} width={1.85} z={.2} />
    </> : kind === "regulator" ? <>
      <Block kit={kit} at={[0, -.84, -.05]} size={[2.16, 3.9, .48]} surface="darkWood" />
      <mesh geometry={g.disk} material={m.walnut} position={[0, .51, -.05]} scale={[1.08, .82, .48]} castShadow />
      <Block kit={kit} at={[0, -1.66, .205]} size={[1.49, 1.79, .03]} surface="recess" />
      <Pendulum kit={kit} running={running} reduced={reduced} phase={.7} long />
      {[-1, 1].map((side) => <Block key={side} kit={kit} at={[side * .94, -1.4, .28]} size={[.16, 2.52, .14]} />)}
      <Block kit={kit} at={[0, -2.83, .09]} size={[2.45, .2, .68]} />
      <Block kit={kit} at={[0, -2.63, .15]} size={[2.22, .13, .58]} />
      <Plate kit={kit} city={spec.city} y={-2.58} width={1.62} z={.48} />
    </> : kind === "carriage" ? <>
      <Block kit={kit} at={[0, -.04, .02]} size={[2.05, 2.47, .5]} surface="brass" />
      <Block kit={kit} at={[0, -.04, .28]} size={[1.77, 2.15, .03]} surface="recess" />
      <Block kit={kit} at={[0, 1.22, .04]} size={[2.26, .16, .75]} surface="gold" />
      <Block kit={kit} at={[0, -1.29, .05]} size={[2.26, .18, .75]} surface="brass" />
      {[-1, 1].map((side) => <group key={side}>
        <Block kit={kit} at={[side * .91, -.02, .41]} size={[.12, 2.3, .13]} surface="gold" />
        <Block kit={kit} at={[side * .76, -1.48, .08]} size={[.25, .22, .57]} surface="bronze" />
      </group>)}
      <mesh geometry={g.rim} material={m.brass} position={[0, 1.46, .02]} scale={[.44, .27, .7]} castShadow />
      <Plate kit={kit} city={spec.city} y={-1.02} width={1.64} z={.42} />
    </> : <>
      <mesh geometry={kind === "octagon" ? g.octagon : g.disk} material={kind === "station" ? m.green : kind === "porthole" || kind === "sunburst" ? m.brass : m.darkWood} scale={[kind === "octagon" ? 1.2 : 1.08, kind === "octagon" ? 1.2 : 1.08, .35]} castShadow receiveShadow />
      {kind === "local" && <>
        <mesh geometry={g.rim} material={m.walnut} scale={[1.13, 1.13, 1.8]} position={[0, 0, .08]} castShadow />
        <mesh geometry={g.fine} material={m.brass} scale={[1.21, 1.21, 1]} position={[0, 0, .16]} />
      </>}
      {kind === "sunburst" && <mesh geometry={g.rays} material={m.gold} position={[0, 0, .01]} castShadow />}
      {kind === "porthole" && <>
        {Array.from({ length: 8 }, (_, i) => <mesh key={i} geometry={g.disk} material={m.bronze} position={[Math.sin(i / 8 * TAU) * 1.005, Math.cos(i / 8 * TAU) * 1.005, .24]} scale={[.048, .048, .038]} />)}
        <Block kit={kit} at={[-1.1, 0, .05]} size={[.22, .55, .3]} surface="bronze" />
        <Block kit={kit} at={[1.1, 0, .12]} size={[.19, .3, .24]} surface="gold" />
      </>}
      <Plate kit={kit} city={spec.city} y={kind === "sunburst" ? -1.91 : -1.41} width={kind === "local" ? 1.48 : 1.95} />
    </>}
    <mesh geometry={g.disk} material={m.bronze} scale={[.97, .97, .1]} position={[0, 0, .25]} castShadow />
    <mesh geometry={g.face} material={m.enamel[spec.dial]} position={[0, 0, .312]} receiveShadow />
    <mesh geometry={g.rim} material={kind === "station" ? m.bronze : m.gold} position={[0, 0, .32]} castShadow />
    <mesh geometry={g.fine} material={m.brass} position={[0, 0, .326]} />
  </>;
}

function Clock({ spec, kit, active, running, reduced, elapsed }: {
  spec: ClockSpec; kit: Kit; elapsed: MutableRefObject<number>;
} & Pick<SceneContentProps, "active" | "running" | "reduced">) {
  const hour = useRef<THREE.Group>(null), minute = useRef<THREE.Group>(null), second = useRef<THREE.Group>(null);
  const arc = useRef<THREE.Mesh>(null), duration = useRef<THREE.Mesh>(null);
  const state = useRef({ tick: -1, minutes: 0, hours: 0, seconds: 0, extra: 0, presence: 0, printed: "" });
  const resources = useMemo(() => {
    const format = new Intl.DateTimeFormat("en-GB", { timeZone: spec.zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 64;
    return { format, canvas, texture: textureFrom(canvas), arc: kit.geometries.arc.clone(), color: new THREE.Color() };
  }, [spec.zone, kit]);
  useEffect(() => () => { resources.texture.dispose(); resources.arc.dispose(); }, [resources]);
  useFrame((_, delta) => {
    if (!running) return;
    const now = Date.now(), s = state.current, tick = Math.floor(now / 1000);
    if (tick !== s.tick) {
      const parts = resources.format.formatToParts(now);
      s.hours = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
      s.minutes = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
      s.seconds = Number(parts.find((p) => p.type === "second")?.value ?? 0);
      s.tick = tick;
    }
    const dt = Math.min(delta, .5), fraction = (now % 1000) / 1000;
    const seconds = s.seconds + fraction;
    const mins = s.minutes + seconds / 60, hours = s.hours % 12 + mins / 60;
    const delay = Math.hypot(spec.x + .12, spec.y - 3.55) * .12;
    const wake = reduced ? 1 : THREE.MathUtils.smootherstep(elapsed.current, delay + .08, delay + .95);
    s.extra = reduced ? (active?.duration_minutes ?? 0) : THREE.MathUtils.damp(s.extra, active?.duration_minutes ?? 0, 4.2, dt);
    s.presence = reduced ? (active ? 1 : 0) : THREE.MathUtils.damp(s.presence, active ? 1 : 0, 4.5, dt);
    if (hour.current) hour.current.rotation.z = -(hours + s.extra / 60) / 12 * TAU * wake;
    if (minute.current) minute.current.rotation.z = -(mins + s.extra) / 60 * TAU * wake;
    if (second.current) second.current.rotation.z = -seconds / 60 * TAU * wake;
    if (arc.current) {
      arc.current.rotation.z = Math.PI / 2 - (mins + Math.min(s.extra, 60)) / 60 * TAU;
      resources.arc.setDrawRange(0, Math.max(0, Math.ceil(Math.min(s.extra / 60, 1) * 120)) * 6);
      const material = arc.current.material as THREE.MeshBasicMaterial;
      material.opacity = s.presence * .78;
      if (active) material.color.lerp(resources.color.set(active.color), 1 - Math.exp(-dt * 5));
    }
    if (duration.current) {
      const text = active ? `${active.duration_minutes} minutes` : s.printed;
      if (text !== s.printed) {
        const c = resources.canvas.getContext("2d")!;
        c.clearRect(0, 0, 256, 64); c.textAlign = "center"; c.textBaseline = "middle";
        c.font = "25px Georgia, serif"; c.fillStyle = "#594830"; c.fillText(text, 128, 33);
        const map = (duration.current.material as THREE.MeshBasicMaterial).map;
        if (map) map.needsUpdate = true;
        s.printed = text;
      }
      (duration.current.material as THREE.MeshBasicMaterial).opacity = s.presence * .9;
    }
  });
  const main = spec.kind === "local", carriage = spec.kind === "carriage";
  const ink = spec.dial === "deco" ? kit.materials.gold : kit.materials.ink;
  return <group position={[spec.x, spec.y, carriage ? .54 : .16]} scale={spec.radius}>
    <ClockCase kit={kit} spec={spec} running={running} reduced={reduced} />
    {main && <>
      <mesh ref={arc} geometry={resources.arc} position={[0, 0, .335]}><meshBasicMaterial color="#a47b42" transparent opacity={0} depthWrite={false} toneMapped={false} /></mesh>
      <mesh ref={duration} position={[0, -.36, .338]} scale={[.56, .14, 1]}><planeGeometry /><meshBasicMaterial map={resources.texture} transparent opacity={0} depthWrite={false} /></mesh>
    </>}
    <group ref={hour} position={[0, 0, .36]}><mesh geometry={kit.geometries.hour} material={ink} /></group>
    <group ref={minute} position={[0, 0, .377]}><mesh geometry={kit.geometries.minute} material={ink} /></group>
    {spec.seconds && <group ref={second} position={[0, 0, .395]}>
      <mesh geometry={kit.geometries.box} material={kit.materials.red} position={[0, .29, 0]} scale={[.009, .99, .008]} />
      <mesh geometry={kit.geometries.fine} material={kit.materials.red} position={[0, -.16, 0]} scale={[.052, .052, 1]} />
    </group>}
    <mesh geometry={kit.geometries.disk} material={kit.materials.gold} position={[0, 0, .409]} scale={[.052, .052, .028]} />
    <mesh geometry={kit.geometries.disk} material={kit.materials.ink} position={[0, 0, .426]} scale={[.019, .019, .012]} />
  </group>;
}

function WallPanels({ kit }: { kit: Kit }) {
  const meshes = useMemo(() => {
    // One draw per wood finish, rather than a draw per strip of panelling.
    const panel = new THREE.InstancedMesh(kit.geometries.box, kit.materials.walnut, 52);
    const trim = new THREE.InstancedMesh(kit.geometries.box, kit.materials.trim, 208);
    const post = new THREE.InstancedMesh(kit.geometries.box, kit.materials.darkWood, 13);
    const transform = new THREE.Object3D();
    function place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, w: number, h: number, d: number) {
      transform.position.set(x, y, z); transform.scale.set(w, h, d); transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    }
    for (let col = 0; col < 13; col++) {
      const x = (col - 6) * 1.74;
      for (let row = 0; row < 4; row++) {
        const y = -2.37 + row * 3.52, i = col * 4 + row;
        place(panel, i, x, y, -.16, 1.59, 3.34, .1);
        place(trim, i * 4, x - .8, y, -.075, .027, 3.37, .055);
        place(trim, i * 4 + 1, x + .8, y, -.075, .027, 3.37, .055);
        place(trim, i * 4 + 2, x, y - 1.67, -.075, 1.61, .025, .055);
        place(trim, i * 4 + 3, x, y + 1.67, -.075, 1.61, .025, .055);
      }
      place(post, col, x - .87, 3.5, -.025, .08, 20, .12);
    }
    for (const mesh of [panel, trim, post]) {
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
    }
    return [panel, trim, post];
  }, [kit]);
  useEffect(() => () => meshes.forEach((mesh) => mesh.dispose()), [meshes]);
  return <>{meshes.map((mesh, i) => <primitive key={i} object={mesh} />)}</>;
}

function Library({ kit }: { kit: Kit }) {
  return <>
    <Block kit={kit} at={[0, 4, -.49]} size={[80, 60, .55]} surface="darkWood" />
    <WallPanels kit={kit} />
    <Block kit={kit} at={[0, 7.05, .025]} size={[50, .13, .24]} />
    <Block kit={kit} at={[0, 7.19, -.01]} size={[50, .08, .17]} surface="brass" />
    <Block kit={kit} at={[0, -1.5, .03]} size={[50, .24, .3]} surface="darkWood" />
    {/* A deep shelf with shaped brackets and two freestanding carriage clocks. */}
    <Block kit={kit} at={[-.52, .44, .39]} size={[2.66, .14, 1.06]} />
    <Block kit={kit} at={[-.52, .34, .78]} size={[2.7, .11, .15]} surface="darkWood" />
    {[-1.44, .41].map((x) => <group key={x} position={[x, .12, .16]} rotation={[-.55, 0, 0]}>
      <Block kit={kit} at={[0, 0, 0]} size={[.15, .56, .23]} />
    </group>)}
    {/* Picture light: the pale underside is emissive, no bloom pass. */}
    <Block kit={kit} at={[0, 6.82, .02]} size={[.44, .33, .16]} surface="bronze" />
    <Block kit={kit} at={[0, 6.85, .41]} size={[.08, .08, .75]} surface="brass" />
    <group position={[0, 6.77, .82]} rotation={[-.22, 0, 0]}>
      <Block kit={kit} at={[0, 0, 0]} size={[2.55, .17, .31]} surface="brass" />
      <mesh geometry={kit.geometries.box} position={[0, -.092, .01]} scale={[2.35, .016, .24]}><meshBasicMaterial color="#ffe8ad" toneMapped={false} /></mesh>
    </group>
  </>;
}

function Dust({ small, running, reduced }: Pick<SceneContentProps, "small" | "running" | "reduced">) {
  const points = useRef<THREE.Points>(null), elapsed = useRef(0);
  const geometry = useMemo(() => {
    const count = small ? 16 : 42, positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = Math.sin(i * 127.1) * 3;
      positions[i * 3 + 1] = .3 + (Math.sin(i * 269.5) * .5 + .5) * 6.3;
      positions[i * 3 + 2] = .7 + (Math.sin(i * 183.3) * .5 + .5) * 1.3;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(positions, 3)); return g;
  }, [small]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    if (!running || reduced || !points.current) return;
    elapsed.current += Math.min(delta, .1);
    points.current.position.x = Math.sin(elapsed.current * .08) * .12;
    points.current.position.y = Math.sin(elapsed.current * .11) * .13;
  });
  return <points ref={points} geometry={geometry}><pointsMaterial color="#f2d6a2" transparent opacity={.26} size={small ? .013 : .016} sizeAttenuation depthWrite={false} /></points>;
}

export default function WorldClocks({ active, running, reduced, small }: SceneContentProps) {
  const kit = useMemo(() => createKit(small), [small]), elapsed = useRef(0), started = useRef(0);
  useEffect(() => () => kit.dispose(), [kit]);
  useFrame(() => {
    if (!running) return;
    const now = Date.now();
    if (!started.current) started.current = now;
    // Compilation / slow software frames must not stretch a 1.5s intro out
    // for seconds and leave the outer clocks displaying the wrong time.
    elapsed.current = (now - started.current) / 1000;
  }, -1);
  return <>
    <color attach="background" args={["#302118"]} />
    <fog attach="fog" args={["#302118", 24, 55]} />
    <ambientLight color="#f4d4a2" intensity={.67} />
    <hemisphereLight args={["#e2d9bc", "#32271e", .65]} />
    <directionalLight position={[-3.5, 7, 6]} color="#ffdfac" intensity={2.5} castShadow={!small} shadow-autoUpdate={false} shadow-needsUpdate shadow-mapSize={[512, 512]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} shadow-camera-near={.1} shadow-camera-far={18} shadow-bias={-.0005} shadow-normalBias={.018} shadow-radius={2.5} />
    <directionalLight position={[4, 2, 7]} color="#b5c6c9" intensity={.7} />
    <pointLight position={[0, 6.38, 1.2]} color="#ffc976" intensity={16} distance={8} decay={2} />
    <Library kit={kit} />
    {CLOCKS.map((clock) => {
      // The phone's wordmark and controls need quiet corners in its short band.
      const spec = small && clock.city === "London" ? { ...clock, y: 5.19, radius: .54 }
        : small && clock.city === "Sydney" ? { ...clock, y: 1.85, radius: .53 } : clock;
      return <Clock key={spec.city} spec={spec} kit={kit} elapsed={elapsed} active={active} running={running} reduced={reduced} />;
    })}
    <Dust small={small} running={running} reduced={reduced} />
  </>;
}
