"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneContentProps } from "./types";

const TAU = Math.PI * 2;
const DIAL_Y = 1.28;
const DIAL_Z = 1.45;
const fract = (n: number) => n - Math.floor(n);
const noise = (n: number) => fract(Math.sin(n * 127.1 + 41.7) * 43758.5453);

// A civil-time sundial: 15 degrees per local hour, noon to the north.
// This is a clock, rather than a latitude/geolocation-dependent ephemeris.
function solarTime(hours: number) {
  const angle = (hours - 12) / 24 * TAU;
  const daylight = THREE.MathUtils.smoothstep(Math.sin((hours - 6) / 24 * TAU), -.12, .18);
  const elevation = Math.max(.19, Math.sin((hours - 6) / 24 * TAU) * 1.25);
  return { angle, daylight, elevation: THREE.MathUtils.lerp(.035, elevation, daylight) };
}

function mineralTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!;
  const image = c.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const cloud = Math.sin(x * .043 + Math.sin(y * .029) * 2) * Math.cos(y * .056 + x * .013);
    const grain = noise(x + y * 256);
    const lichen = Math.max(0, cloud - .45) * 18;
    const vein = Math.pow(.5 + .5 * Math.sin(y * .17 + Math.sin(x * .031) * 5), 18) * 3;
    const v = 214 + cloud * 5 + grain * 13 - vein;
    const i = (x + y * 256) * 4;
    image.data[i] = v - lichen * .5;
    image.data[i + 1] = v + lichen * .2;
    image.data[i + 2] = v - 6 - lichen;
    image.data[i + 3] = 255;
  }
  c.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.repeat.set(.65, .65);
  return texture;
}

function stoneGeometry(width: number, height: number, depth: number, seed: number) {
  const shape = new THREE.Shape();
  const corners = [
    [-.5, -.46], [-.37, -.52], [.36, -.5], [.52, -.34],
    [.46, .36], [.28, .51], [-.31, .48], [-.5, .3],
  ];
  corners.forEach(([x, y], i) => {
    const px = x * width + (noise(seed + i) - .5) * width * .12;
    const py = y * height + (noise(seed + i * 7) - .5) * height * .035;
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  });
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth * .8, bevelEnabled: true, bevelSize: depth * .1,
    bevelThickness: depth * .1, bevelSegments: 2, curveSegments: 1,
  });
  g.translate(0, height * .5, -depth * .4);
  const p = g.getAttribute("position"), colors: number[] = [];
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const wear = Math.sin(x * 14 + z * 7 + seed) * Math.sin(y * 9 + z * 4) * .025;
    p.setXYZ(i, x + wear, y + wear * .5, z + wear);
    color.set("#d8d3c3").multiplyScalar(.91 + noise(seed + Math.floor(y * 3)) * .08 + y / height * .06);
    colors.push(color.r, color.g, color.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// Matte stone needs no PBR highlights on a phone. Keep its mapped, vertex-
// colored diffuse program shared with the ground and every altar surface.
function StoneMaterial({ small, map, color = "#ffffff", vertexColors = false, bumpScale = .035 }: {
  small: boolean; map: THREE.Texture; color?: string; vertexColors?: boolean; bumpScale?: number;
}) {
  return small
    ? <meshLambertMaterial map={map} color={color} vertexColors />
    : <meshStandardMaterial map={map} color={color} vertexColors={vertexColors} bumpMap={map} bumpScale={bumpScale} roughness={1} />;
}

function Stones({ small, depth }: { small: boolean; depth: THREE.RawShaderMaterial }) {
  const resources = useMemo(() => {
    const texture = mineralTexture();
    const material = small
      ? new THREE.MeshLambertMaterial({ map: texture, vertexColors: true })
      : new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: .025, roughness: 1, vertexColors: true });
    // Three unequal gates and scattered single stones form a complete original ring.
    const pieces = [
      [-3.15, 0, -3.45, 1.12, 3.7, 1.02, -.2], [-.88, 0, -4.55, 1.18, 3.85, 1.1, -.13],
      [-2.02, 3.69, -4.02, 3.65, .71, 1.26, .44],
      [1.0, 0, -4.7, 1.05, 4.15, 1.08, .11], [3.22, 0, -3.5, 1.18, 3.95, 1.15, .36],
      [2.1, 3.96, -4.1, 3.75, .65, 1.32, -.46],
      [-4.7, 0, -.4, 1.25, 3.35, 1.1, -.8], [-4.18, 0, 1.8, 1.08, 2.85, .92, -.45],
      [-4.5, 2.88, .68, 1.25, .64, 3.6, -.24],
      [4.8, 0, -.4, 1.28, 3.4, 1.08, .42], [4.1, 0, 2.6, 1.08, 2.05, .95, -.2],
      [-2.9, 0, 4.0, 1.28, .54, 1.5, .4], [2.0, 0, 4.85, 1.6, .38, .9, -.6],
      [.9, 0, -6, .82, 1.3, .92, -.2],
    ];
    const stones = pieces.map(([x, y, z, w, h, d, rotation], i) => ({
      geometry: stoneGeometry(w, h, d, i * 11 + 5), position: [x, y, z] as [number, number, number], rotation,
    }));
    return { texture, material, stones };
  }, [small]);
  useEffect(() => () => {
    resources.stones.forEach((s) => s.geometry.dispose());
    resources.material.dispose(); resources.texture.dispose();
  }, [resources]);
  return <group>
    {/* The raw depth program has the same cache key in the warm-up and shadow
        targets. Warming it here avoids a cold compile on the first shadow pass. */}
    <mesh visible={false} geometry={resources.stones[0].geometry} material={depth} />
    {resources.stones.map((s, i) => <mesh key={i} geometry={s.geometry} material={resources.material} customDepthMaterial={depth} position={s.position} rotation={[0, s.rotation, i % 2 ? .025 : -.018]} castShadow receiveShadow />)}
  </group>;
}

function groundHeight(x: number, z: number) {
  const clearing = THREE.MathUtils.smoothstep(Math.hypot(x, z), 6, 18);
  return clearing * (.4 + .6 * Math.sin(x * .09 + z * .05) * Math.sin(z * .14)
    + 3.4 * Math.exp(-((x + 22) ** 2 / 180 + (z + 32) ** 2 / 190))
    + 5 * Math.exp(-((x - 28) ** 2 / 250 + (z + 46) ** 2 / 260))
    + 3 * Math.exp(-((x + 43) ** 2 / 370 + (z - 10) ** 2 / 240)));
}

function Meadow({ small, running, reduced }: Pick<SceneContentProps, "small" | "running" | "reduced">) {
  const grass = useRef<THREE.InstancedMesh>(null);
  const resources = useMemo(() => {
    // Concentrate detail around the circle; the perimeter stays beyond the
    // camera's far plane even at the widest allowed orbit and zoom.
    const rings = small ? 40 : 64, slices = small ? 80 : 128;
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let ring = 0; ring <= rings; ring++) for (let segment = 0; segment <= slices; segment++) {
      const radius = 240 * Math.pow(ring / rings, 1.8), angle = segment / slices * TAU;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      positions.push(x, 0, z); uvs.push(x / 220 + .5, -z / 220 + .5);
      if (ring < rings && segment < slices) {
        const a = ring * (slices + 1) + segment, b = a + slices + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const terrain = new THREE.BufferGeometry();
    terrain.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    terrain.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); terrain.setIndex(indices);
    const p = terrain.getAttribute("position"), colors: number[] = [];
    const light = new THREE.Color("#9ca779"), dark = new THREE.Color("#6f8c70"), color = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, groundHeight(x, z) - .035);
      const path = Math.exp(-((x - .25) ** 2 / 6 + (z - 3.5) ** 2 / 22));
      color.copy(dark).lerp(light, .35 + Math.sin(x * .15 + z * .11) * .06 + path * .45);
      colors.push(color.r, color.g, color.b);
    }
    terrain.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); terrain.computeVertexNormals();
    const texture = mineralTexture(); texture.repeat.set(75, 75);
    const blade = new THREE.BufferGeometry();
    blade.setAttribute("position", new THREE.Float32BufferAttribute([-.035, 0, 0, .035, 0, 0, -.026, .19, 0, .026, .19, 0, .045, .4, 0], 3));
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]); blade.computeVertexNormals();
    const count = small ? 662 : 2400, seedCount = small ? 12 : 0;
    const seedFlags = new Float32Array(count);
    for (let i = count - seedCount; i < count; i++) seedFlags[i] = 1;
    blade.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seedFlags, 1));
    const wind = { value: 0 };
    const grassMaterial = small
      ? new THREE.MeshLambertMaterial({ color: "#b4bd8e", emissive: "#526542", emissiveIntensity: .25, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: "#b4bd8e", emissive: "#526542", emissiveIntensity: .25, roughness: 1, side: THREE.DoubleSide });
    grassMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = wind;
      shader.vertexShader = "uniform float uWind; attribute float aSeed;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        float phase = instanceMatrix[3].x * .6 + instanceMatrix[3].z * .4;
        transformed.x += sin(uWind * .55 + phase) * position.y * position.y * .45;
        transformed.x += aSeed * sin(uWind * .12 + phase) * .7;
        transformed.y += aSeed * sin(uWind * .18 + phase) * .15;
      `);
    };
    grassMaterial.userData.wind = wind;
    return { terrain, texture, blade, wind, grassMaterial, count, seedCount };
  }, [small]);
  useEffect(() => {
    if (!grass.current) return;
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    for (let i = 0; i < resources.count; i++) {
      const angle = noise(i * 3 + 2) * TAU, radius = 3.3 + Math.sqrt(noise(i * 7 + 3)) * 17;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      dummy.position.set(x, groundHeight(x, z) - .03, z);
      dummy.rotation.set(0, noise(i * 13) * TAU, (noise(i * 19) - .5) * .2);
      dummy.scale.setScalar(.4 + noise(i * 23) * .65);
      const seed = i >= resources.count - resources.seedCount;
      if (seed) {
        dummy.position.set((noise(i * 3) - .5) * 18, .6 + noise(i * 7) * 2.6, (noise(i * 17) - .5) * 14);
        dummy.scale.setScalar(.17);
      }
      dummy.updateMatrix();
      grass.current.setMatrixAt(i, dummy.matrix);
      color.set(seed ? "#fff0bd" : i % 4 ? "#c8c8a1" : "#a2b08a").multiplyScalar(.8 + noise(i * 17) * .4);
      grass.current.setColorAt(i, color);
    }
    grass.current.instanceMatrix.needsUpdate = true;
    if (grass.current.instanceColor) grass.current.instanceColor.needsUpdate = true;
    grass.current.computeBoundingSphere();
    return () => {
      resources.terrain.dispose(); resources.texture.dispose(); resources.blade.dispose(); resources.grassMaterial.dispose();
    };
  }, [resources]);
  useFrame((_, delta) => {
    if (!running || reduced || !grass.current) return;
    const material = grass.current.material as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
    material.userData.wind.value += Math.min(delta, .1);
  });
  return <>
    <mesh geometry={resources.terrain} receiveShadow><StoneMaterial small={small} vertexColors map={resources.texture} bumpScale={.045} /></mesh>
    <instancedMesh ref={grass} args={[resources.blade, resources.grassMaterial, resources.count]} />
  </>;
}

interface DialLight {
  angle: number; length: number; endLength: number; span: number; opacity: number;
  captionOpacity: number; caption: string; color: string;
}

function createDial(small: boolean) {
  const base = document.createElement("canvas"); base.width = base.height = 1024;
  const c = base.getContext("2d")!;
  const wash = c.createRadialGradient(400, 300, 30, 512, 512, 660);
  wash.addColorStop(0, "#e5dbb8"); wash.addColorStop(1, "#a9aa8a");
  c.fillStyle = wash; c.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < (small ? 3500 : 14000); i++) {
    c.fillStyle = i % 3 ? "#514f3410" : "#ffffeb28";
    c.fillRect(noise(i + 17) * 1024, noise(i * 3 + 5) * 1024, 1 + noise(i) * 3, 1 + noise(i * 7) * 2);
  }
  c.strokeStyle = "#6b7059"; c.lineWidth = 2;
  for (const r of [470, 458, 390, 125]) { c.beginPath(); c.arc(512, 512, r, 0, TAU); c.stroke(); }
  c.textAlign = "center"; c.textBaseline = "middle";
  for (let hour = 0; hour < 24; hour++) {
    const a = (hour - 12) / 24 * TAU;
    const x = Math.sin(a), y = -Math.cos(a);
    c.lineWidth = hour % 3 ? 1.4 : 3;
    c.strokeStyle = hour % 3 ? "#73775f99" : "#5a614b";
    c.beginPath(); c.moveTo(512 + x * 130, 512 + y * 130);
    c.lineTo(512 + x * 385, 512 + y * 385); c.stroke();
    c.font = "34px Georgia, serif"; c.fillStyle = "#414c3e";
    c.fillText(String(hour).padStart(2, "0"), 512 + x * 425, 512 + y * 425);
    for (let q = 1; q < 4; q++) {
      const angle = a + q / 4 / 24 * TAU;
      c.beginPath(); c.moveTo(512 + Math.sin(angle) * 450, 512 - Math.cos(angle) * 450);
      c.lineTo(512 + Math.sin(angle) * 458, 512 - Math.cos(angle) * 458); c.stroke();
    }
  }
  c.strokeStyle = "#525b4238"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(35, 385); c.lineTo(163, 402); c.lineTo(190, 460); c.lineTo(257, 480); c.stroke();
  c.beginPath(); c.moveTo(820, 880); c.lineTo(780, 760); c.lineTo(804, 695); c.stroke();
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = small ? 512 : 1024;
  const ink = canvas.getContext("2d")!;
  ink.scale(canvas.width / 1024, canvas.height / 1024);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  function draw(date: Date, light?: DialLight) {
    ink.drawImage(base, 0, 0);
    // Civil time is carved in the same stone as the hour lines.
    ink.fillStyle = "#d0cbaa"; ink.fillRect(322, 635, 380, 126);
    ink.textAlign = "center"; ink.textBaseline = "middle";
    ink.fillStyle = "#394b3d"; ink.font = "80px Georgia, serif";
    ink.fillText(`${String(date.getHours()).padStart(2, "0")} : ${String(date.getMinutes()).padStart(2, "0")}`, 512, 679);
    ink.font = "18px Georgia, serif"; ink.fillStyle = "#5d6954";
    ink.fillText("L O C A L   T I M E", 512, 733);
    // Phones bake the light onto this face: the same civil-time geometry with
    // three fewer GPU programs; only clock ticks repaint after the hover settles.
    if (light) {
      const k = 512 / 2.08;
      const shadow = (angle: number, length: number, color: string, opacity: number) => {
        ink.save(); ink.translate(512, 512); ink.rotate(angle);
        ink.globalAlpha = opacity; ink.fillStyle = color;
        ink.beginPath(); ink.moveTo(-.16 * k, 0); ink.lineTo(.16 * k, 0);
        ink.lineTo(.035 * k, -length * k); ink.lineTo(-.035 * k, -length * k); ink.closePath(); ink.fill(); ink.restore();
      };
      shadow(light.angle, light.length, "#293d33", .58);
      if (light.opacity > .002) {
        const a = light.angle - Math.PI / 2, b = a + light.span;
        ink.save(); ink.globalAlpha = light.opacity * .19; ink.fillStyle = light.color;
        ink.beginPath(); ink.arc(512, 512, 1.88 * k, a, b);
        ink.arc(512, 512, .25 * k, b, a, true); ink.closePath(); ink.fill();
        ink.globalAlpha = light.opacity * .9; ink.strokeStyle = light.color; ink.lineWidth = 10;
        ink.beginPath(); ink.arc(512, 512, 1.82 * k, a, b); ink.stroke(); ink.restore();
        shadow(light.angle + light.span, light.endLength, light.color, light.opacity * .42);
      }
      ink.save(); ink.globalAlpha = light.captionOpacity; ink.fillStyle = light.color;
      ink.font = "45px Georgia, serif"; ink.fillText(light.caption, 512, 862); ink.restore();
    }
    texture.needsUpdate = true;
  }
  return { texture, draw };
}

const arcVertex = `varying vec2 vPoint; void main() { vPoint = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const arcFragment = `
  varying vec2 vPoint;
  uniform float uAngle, uSpan, uOpacity;
  uniform vec3 uColor;
  void main() {
    float r = length(vPoint);
    float angle = atan(vPoint.x, vPoint.y);
    float offset = mod(angle - uAngle + 6.2831853, 6.2831853);
    float sector = (1. - smoothstep(uSpan - .012, uSpan + .012, offset)) * smoothstep(0., .012, offset);
    float band = smoothstep(.22, .35, r) * (1. - smoothstep(1.86, 1.89, r));
    float edge = smoothstep(1.75, 1.79, r) * (1. - smoothstep(1.85, 1.88, r));
    gl_FragColor = vec4(uColor, sector * band * (.18 + edge * .72) * uOpacity);
  }
`;

function Sundial({ active, running, reduced, small, depth }: SceneContentProps & { depth: THREE.RawShaderMaterial }) {
  const shadow = useRef<THREE.Mesh>(null), ghost = useRef<THREE.Mesh>(null);
  const label = useRef<THREE.MeshBasicMaterial>(null);
  const state = useRef({ tick: -1, label: "", opacity: 0, span: 0, captionOpacity: 0, captionKey: "", painted: "" });
  const resources = useMemo(() => {
    const dial = createDial(small), texture = mineralTexture();
    const base = stoneGeometry(4.65, .62, 4.3, 108); base.translate(0, .2, DIAL_Z);
    const foot = stoneGeometry(2.55, .5, 2.3, 71); foot.translate(0, 0, DIAL_Z);
    const gnomon = new THREE.CylinderGeometry(.035, .17, 1.22, 4, 1); gnomon.translate(0, .61, 0);
    const rim = new THREE.CylinderGeometry(2.1, 2.2, .6, 48);
    const face = new THREE.CircleGeometry(2.08, 64);
    for (const geometry of [gnomon, rim, face]) {
      const colors = new Float32Array(geometry.getAttribute("position").count * 3).fill(1);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    const arc = new THREE.ShaderMaterial({
      vertexShader: arcVertex, fragmentShader: arcFragment, transparent: true, depthWrite: false,
      uniforms: { uAngle: { value: 0 }, uSpan: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color("#d3bb79") } },
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const caption = document.createElement("canvas"); caption.width = 512; caption.height = 96;
    const captionTexture = new THREE.CanvasTexture(caption); captionTexture.colorSpace = THREE.SRGBColorSpace;
    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-.16, 0, 0, .16, 0, 0, .035, 0, -1, -.035, 0, -1], 3));
    shadowGeometry.setIndex([0, 1, 2, 0, 2, 3]); shadowGeometry.computeVertexNormals();
    return { dial, texture, base, foot, gnomon, rim, face, arc, caption, captionTexture, shadowGeometry, accent: new THREE.Color() };
  }, [small]);
  const live = useRef<typeof resources | null>(null);
  useEffect(() => {
    live.current = resources;
    state.current.tick = -1; state.current.painted = "";
    return () => {
      live.current = null;
      resources.dial.texture.dispose(); resources.texture.dispose(); resources.base.dispose(); resources.foot.dispose();
      resources.gnomon.dispose(); resources.rim.dispose(); resources.face.dispose(); resources.arc.dispose(); resources.captionTexture.dispose(); resources.shadowGeometry.dispose();
    };
  }, [resources]);
  useFrame((_, delta) => {
    const resources = live.current;
    if (!running || !resources) return;
    const now = Date.now(), date = new Date(now);
    const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const solar = solarTime(hours), end = solarTime(hours + (active?.duration_minutes ?? 0) / 60);
    const dt = Math.min(delta, .1), s = state.current;
    if (!small && Math.floor(now / 60000) !== s.tick) { resources.dial.draw(date); s.tick = Math.floor(now / 60000); }
    s.opacity = reduced ? (active ? 1 : 0) : THREE.MathUtils.damp(s.opacity, active ? 1 : 0, 4, dt);
    s.span = THREE.MathUtils.damp(s.span, (active?.duration_minutes ?? 0) / 1440 * TAU, 4, dt);
    const uniforms = resources.arc.uniforms;
    uniforms.uAngle.value = solar.angle; uniforms.uSpan.value = Math.min(s.span, TAU - .001); uniforms.uOpacity.value = s.opacity;
    if (active) uniforms.uColor.value.lerp(resources.accent.set(active.color), 1 - Math.exp(-dt * 5));
    if (shadow.current) { shadow.current.rotation.y = -solar.angle; shadow.current.scale.z = Math.min(1.22 / solar.elevation, 1.96); }
    if (ghost.current) {
      ghost.current.rotation.y = -solar.angle - s.span;
      ghost.current.scale.z = Math.min(1.22 / end.elevation, 1.96);
      const material = ghost.current.material as THREE.MeshBasicMaterial;
      material.opacity = s.opacity * .42; material.color.copy(uniforms.uColor.value);
    }
    const key = active ? `${active.duration_minutes}/${active.color}` : "";
    s.captionOpacity = THREE.MathUtils.damp(s.captionOpacity, active && key === s.captionKey ? 1 : 0, 7, dt);
    if (label.current) label.current.opacity = s.captionOpacity;
    const text = active ? `${active.duration_minutes} MIN  /  ${new Date(now + active.duration_minutes * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}` : s.label;
    if (active && (key === s.captionKey || s.captionOpacity < .025) && (text !== s.label || key !== s.captionKey)) {
      const c = resources.caption.getContext("2d")!; c.clearRect(0, 0, 512, 96);
      c.textAlign = "center"; c.textBaseline = "middle"; c.font = "33px Georgia, serif";
      c.fillStyle = active.color; c.fillText(text, 256, 48);
      resources.captionTexture.needsUpdate = true; s.label = text; s.captionKey = key;
    }
    const paint = `${Math.floor(now / 1000)}/${s.span.toFixed(3)}/${s.opacity.toFixed(2)}/${s.captionOpacity.toFixed(2)}/${uniforms.uColor.value.getHexString()}/${s.label}`;
    if (small && paint !== s.painted) {
      resources.dial.draw(date, {
        angle: solar.angle, length: Math.min(1.22 / solar.elevation, 1.96), endLength: Math.min(1.22 / end.elevation, 1.96),
        span: s.span, opacity: s.opacity, captionOpacity: s.captionOpacity, caption: s.label, color: uniforms.uColor.value.getStyle(),
      });
      s.painted = paint;
    }
  });
  return <>
    <mesh geometry={resources.foot} customDepthMaterial={depth} castShadow receiveShadow><StoneMaterial small={small} map={resources.texture} color="#b8bba9" vertexColors /></mesh>
    <mesh geometry={resources.base} customDepthMaterial={depth} castShadow receiveShadow><StoneMaterial small={small} map={resources.texture} color="#ded5bf" vertexColors /></mesh>
    <mesh geometry={resources.rim} position={[0, .95, DIAL_Z]} customDepthMaterial={depth} castShadow receiveShadow><StoneMaterial small={small} map={resources.texture} color="#c8c6b1" bumpScale={0} /></mesh>
    <mesh geometry={resources.face} position={[0, DIAL_Y, DIAL_Z]} rotation={[-Math.PI / 2, 0, 0]}><StoneMaterial small={small} map={resources.dial.texture} bumpScale={0} /></mesh>
    <mesh geometry={resources.gnomon} customDepthMaterial={depth} position={[0, DIAL_Y + .006, DIAL_Z]} rotation={[0, .3, 0]} castShadow><StoneMaterial small={small} color="#a5ad9b" map={resources.texture} bumpScale={0} /></mesh>
    {!small && <group>
    <mesh ref={shadow} geometry={resources.shadowGeometry} position={[0, DIAL_Y + .008, DIAL_Z]}><meshBasicMaterial color="#293d33" transparent opacity={.58} depthWrite={false} /></mesh>
    <mesh position={[0, DIAL_Y + .016, DIAL_Z]} rotation={[-Math.PI / 2, 0, 0]} material={resources.arc}><circleGeometry args={[2.02, 64]} /></mesh>
    <mesh ref={ghost} geometry={resources.shadowGeometry} position={[0, DIAL_Y + .021, DIAL_Z]}><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    <mesh position={[0, DIAL_Y + .025, DIAL_Z + 1.45]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2.5, .47]} /><meshBasicMaterial ref={label} map={resources.captionTexture} transparent opacity={0} toneMapped={false} depthWrite={false} /></mesh>
    </group>}
  </>;
}

const skyVertex = `varying vec3 vDirection; void main() { vDirection = (modelMatrix * vec4(position, 1.)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const skyFragment = `
  varying vec3 vDirection;
  uniform vec3 uTop, uHorizon, uSun;
  uniform float uDay;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDirection);
    float h = smoothstep(-.005, .12, d.y);
    vec3 color = mix(uHorizon, uTop, h);
    float alignment = max(dot(d, normalize(uSun)), 0.);
    color += mix(vec3(.55,.65,.8), vec3(1.,.7,.34), uDay) * pow(alignment, 12.) * .23 * smoothstep(-.01,.07,d.y);
    float disc = smoothstep(.99993, .99996, alignment);
    color = mix(color, mix(vec3(.91,.94,1.), vec3(1.,.91,.66), uDay), disc);
    vec2 starUV = vec2(atan(d.z,d.x) * 160., asin(d.y) * 200.);
    float star = step(.986, hash(vec3(floor(starUV),2.))) * (1.-smoothstep(.035,.19,length(fract(starUV)-.5)));
    color += star * (1. - uDay) * smoothstep(.01, .1, d.y);
    float cloud = sin(d.x * 19. + d.z * 8. + sin(d.z * 21.) * .8) * sin(d.z * 35. + d.x * 7.);
    color += smoothstep(.65, 1., cloud) * exp(-pow((d.y - .17) * 9., 2.)) * .032 * smoothstep(0.,.08,d.y);
    gl_FragColor = vec4(color, 1.);
    #include <colorspace_fragment>
  }
`;

function Atmosphere({ running, reduced, small }: SceneContentProps) {
  const light = useRef<THREE.DirectionalLight>(null), fill = useRef<THREE.HemisphereLight>(null);
  const fog = useRef<THREE.Fog>(null), seeds = useRef<THREE.Points>(null);
  const elapsed = useRef(0), introStart = useRef<number | null>(null);
  const resources = useMemo(() => {
    const sky = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, vertexShader: skyVertex, fragmentShader: skyFragment,
      uniforms: { uTop: { value: new THREE.Color("#304e70") }, uHorizon: { value: new THREE.Color("#c6c2aa") }, uSun: { value: new THREE.Vector3(-20, 20, 10) }, uDay: { value: 1 } },
    });
    const mist = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#c5d0bc") } },
      vertexShader: `varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec3 uColor; void main() {
        vec2 p=(vUv-.5)*2.; float r=length(p);
        float wisps=.5+.5*sin(p.x*15.+p.y*11.+sin(p.y*9.+uTime*.04)*2.);
        float a=smoothstep(.17,.4,r)*(1.-smoothstep(.55,1.,r))*(.025+wisps*.065);
        gl_FragColor=vec4(uColor,a);
      }`,
    });
    const particles = new THREE.BufferGeometry(), positions: number[] = [];
    for (let i = 0; i < (small ? 12 : 28); i++) positions.push((noise(i * 3 + 9) - .5) * 18, .5 + noise(i * 7) * 3.2, (noise(i * 17) - .5) * 14);
    particles.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return { sky, mist, particles, top: new THREE.Color(), horizon: new THREE.Color(), warm: new THREE.Color("#ffd3a1"), dayLight: new THREE.Color("#fff2df"), cool: new THREE.Color("#d1deff"), dayTop: new THREE.Color("#234a60"), duskTop: new THREE.Color("#706b80"), dayHorizon: new THREE.Color("#d3d5bb"), nightFill: new THREE.Color("#aac6ed"), dayFill: new THREE.Color("#d8e3f1"), nightGround: new THREE.Color("#687c99"), dayGround: new THREE.Color("#828d75"), duskHorizon: new THREE.Color("#e4ba9e") };
  }, [small]);
  const live = useRef<typeof resources | null>(null);
  useEffect(() => {
    live.current = resources;
    return () => { live.current = null; resources.sky.dispose(); resources.mist.dispose(); resources.particles.dispose(); };
  }, [resources]);
  useFrame((_, delta) => {
    const resources = live.current;
    if (!running || !resources) return;
    const now = Date.now(), date = new Date(now);
    if (introStart.current === null) introStart.current = now;
    const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const solar = solarTime(hours);
    elapsed.current += Math.min(delta, .1);
    const intro = reduced ? 1 : THREE.MathUtils.smoothstep((now - introStart.current) / 1000, 0, 1.65);
    const golden = Math.pow(1 - Math.max(0, Math.sin((hours - 6) / 24 * TAU)), 3) * solar.daylight;
    resources.top.set("#253f65").lerp(resources.dayTop, solar.daylight).lerp(resources.duskTop, golden * .55);
    resources.horizon.set("#94b1c4").lerp(resources.dayHorizon, solar.daylight).lerp(resources.duskHorizon, golden * .7);
    const sun = resources.sky.uniforms.uSun.value as THREE.Vector3;
    sun.set(-Math.sin(solar.angle) * 28, THREE.MathUtils.lerp(1, solar.elevation * 28, intro), Math.cos(solar.angle) * 28);
    resources.sky.uniforms.uTop.value.copy(resources.top); resources.sky.uniforms.uHorizon.value.copy(resources.horizon);
    resources.sky.uniforms.uDay.value = solar.daylight;
    if (light.current) {
      light.current.position.copy(sun); light.current.intensity = (1.65 + solar.daylight * 1.8) * (.16 + intro * .84);
      light.current.color.copy(resources.cool).lerp(resources.dayLight, solar.daylight).lerp(resources.warm, golden * .65);
    }
    if (fill.current) {
      fill.current.intensity = (1.4 - solar.daylight * .05) * (.55 + intro * .45);
      fill.current.color.copy(resources.nightFill).lerp(resources.dayFill, solar.daylight);
      fill.current.groundColor.copy(resources.nightGround).lerp(resources.dayGround, solar.daylight);
    }
    if (fog.current) fog.current.color.copy(resources.horizon);
    resources.mist.uniforms.uColor.value.copy(resources.horizon);
    if (!reduced) {
      resources.mist.uniforms.uTime.value = elapsed.current;
      if (seeds.current) { seeds.current.rotation.y = Math.sin(elapsed.current * .035) * .12; seeds.current.position.y = Math.sin(elapsed.current * .15) * .12; }
    }
  });
  return <>
    <mesh material={resources.sky} renderOrder={-100}><sphereGeometry args={[130, 32, 16]} /></mesh>
    <fog ref={fog} attach="fog" args={["#c6c2aa", 24, 105]} />
    <hemisphereLight ref={fill} args={["#d8e3f1", "#828d75", 1.1]} />
    <directionalLight ref={light} position={[-20, 20, 10]} intensity={.2} castShadow shadow-mapSize={small ? [512, 512] : [1024, 1024]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-camera-near={.5} shadow-camera-far={75} shadow-bias={-.0003} shadow-normalBias={.025} />
    <directionalLight position={[5, 9, 12]} intensity={.45} color="#d2dece" />
    {!small && <mesh material={resources.mist} position={[0, .21, -1]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[52, 52]} /></mesh>}
    {!small && <points ref={seeds} geometry={resources.particles}><pointsMaterial color="#e9ddad" size={.035} transparent opacity={.5} depthWrite={false} sizeAttenuation /></points>}
  </>;
}

export default function Solstice(props: SceneContentProps) {
  // All casters are opaque, stationary stone. A tiny shared depth shader avoids
  // main-target/shadow-target variants and is covered by compileAsync above.
  const depth = useMemo(() => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    side: THREE.BackSide,
    vertexShader: `precision highp float;
      uniform mat4 projectionMatrix, modelViewMatrix;
      in vec3 position;
      void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `precision highp float;
      out vec4 depthColor;
      #include <packing>
      void main() { depthColor = packDepthToRGBA(gl_FragCoord.z); }`,
  }), []);
  useEffect(() => () => depth.dispose(), [depth]);
  return <>
    <Atmosphere {...props} />
    <Meadow small={props.small} running={props.running} reduced={props.reduced} />
    <Stones small={props.small} depth={depth} />
    <Sundial {...props} depth={depth} />
  </>;
}
