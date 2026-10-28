"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneContentProps } from "./types";

const TAU = Math.PI * 2, RAD = Math.PI / 180;
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const RADII = [1.55, 1.95, 2.35, 2.75, 3.15, 3.55, 3.95];
const PALETTES = [
  ["#53798d", "#acccd0"], ["#b57255", "#ebbc85"], ["#84a5a1", "#d2ddc1"],
  ["#698d7b", "#b6d2a7"], ["#b58b58", "#e4cba1"], ["#86739f", "#c5aed3"], ["#9f7350", "#e9c17c"],
];
const GEARS = [
  { x: 0, z: 0, r: .72, teeth: 36 },
  { x: 1.075, z: 0, r: .38, teeth: 19 },
  { x: -.5375, z: .931, r: .38, teeth: 19 },
  { x: -.5375, z: -.931, r: .38, teeth: 19 },
  { x: .285, z: .89, r: .24, teeth: 12 },
  { x: -.914, z: -.198, r: .24, teeth: 12 },
  { x: .628, z: -.692, r: .24, teeth: 12 },
];

function texture(width: number, height: number, paint: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext("2d")!);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return map;
}

// Painted reflections avoid an environment capture and its render targets.
function brassShader(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
    vec3 r = inverseTransformDirection(reflect(-geometryViewDir, normal), viewMatrix);
    float band = pow(.5 + .5 * sin(r.y * 13. + r.x * 2.), 12.);
    float glint = pow(max(dot(r, normalize(vec3(-.5,.8,.4))), 0.), 24.);
    outgoingLight += vec3(.25,.135,.045) * (.3 + band * .7);
    outgoingLight += vec3(.9,.65,.3) * glint * .65;
    #include <opaque_fragment>
  `);
}

function gearGeometry(radius: number, teeth: number) {
  const shape = new THREE.Shape();
  const profile = [[0, .91], [.19, .91], [.32, 1.035], [.68, 1.035], [.81, .91]];
  for (let i = 0; i < teeth; i++) for (const [step, r] of profile) {
    const a = (i + step) / teeth * TAU;
    const x = Math.cos(a) * radius * r, y = Math.sin(a) * radius * r;
    if (i === 0 && step === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, radius * .62, 0, TAU, true); shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: .065, bevelEnabled: true, bevelThickness: .009, bevelSize: .009, bevelSegments: 1, curveSegments: 24, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, -.0325, 0);
  return g;
}

function dialTexture(small: boolean) {
  const size = small ? 1024 : 2048;
  return texture(size, size, (c) => {
    c.scale(size / 1024, size / 1024); c.translate(512, 512);
    c.fillStyle = "#151e2a"; c.fillRect(-512, -512, 1024, 1024);
    for (const r of [448, 454, 502, 508]) {
      c.strokeStyle = r === 454 ? "#c2a469" : "#625742"; c.lineWidth = 1;
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    }
    for (let i = 0; i < 144; i++) {
      const a = i / 144 * TAU, major = i % 6 === 0;
      c.strokeStyle = major ? "#e2c68b" : "#8b7c5b"; c.lineWidth = major ? 2 : .8;
      c.beginPath(); c.moveTo(Math.sin(a) * 499, -Math.cos(a) * 499);
      c.lineTo(Math.sin(a) * (major ? 486 : 492), -Math.cos(a) * (major ? 486 : 492)); c.stroke();
    }
    c.font = "20px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle";
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU;
      c.save(); c.translate(Math.sin(a) * 472, -Math.cos(a) * 472); c.rotate(a);
      c.fillStyle = i % 6 === 0 ? "#fff0c8" : "#cdbd96"; c.fillText(String(i).padStart(2, "0"), 0, 0); c.restore();
    }
  });
}

// Low-precision orbital elements and principal lunar perturbations, following
// Paul Schlyter (stjarnhimlen.se/comp/ppcomp.html). Uses actual elongation.
function lunarPhase(ms: number) {
  const d = ms / 86400000 + 2440587.5 - 2451543.5;
  const sin = (a: number) => Math.sin(a * RAD), cos = (a: number) => Math.cos(a * RAD);
  function anomaly(m: number, e: number) {
    const mean = (m % 360) * RAD;
    let E = mean + e * Math.sin(mean) * (1 + e * Math.cos(mean));
    for (let i = 0; i < 3; i++) E -= (E - e * Math.sin(E) - mean) / (1 - e * Math.cos(E));
    return Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e) / RAD;
  }
  const msun = 356.047 + .9856002585 * d, ws = 282.9404 + .0000470935 * d;
  const sun = anomaly(msun, .016709 - .000000001151 * d) + ws;
  const node = 125.1228 - .0529538083 * d, w = 318.0634 + .1643573223 * d;
  const m = 115.3654 + 13.0649929509 * d, v = anomaly(m, .0549) + w;
  let moon = Math.atan2(sin(node) * cos(v) + cos(node) * sin(v) * cos(5.1454), cos(node) * cos(v) - sin(node) * sin(v) * cos(5.1454)) / RAD;
  const D = m + w + node - (msun + ws);
  moon += -1.274 * sin(m - 2 * D) + .658 * sin(2 * D) - .186 * sin(msun);
  return (((moon - sun) / 360) % 1 + 1) % 1;
}

function arcGeometry(segments: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((segments + 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
  const indices = [];
  for (let i = 0; i < segments; i++) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  g.setIndex(indices); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
  return g;
}

function updateArc(g: THREE.BufferGeometry, radius: number, width: number, angle: number, span: number, y: number) {
  const p = g.getAttribute("position"), segments = p.count / 2 - 1;
  for (let i = 0; i <= segments; i++) {
    const a = angle + span * i / segments;
    for (let j = 0; j < 2; j++) {
      const r = radius + (j ? width : -width);
      p.setXYZ(i * 2 + j, Math.sin(a) * r, y, -Math.cos(a) * r);
    }
  }
  p.needsUpdate = true;
}

function createResources(small: boolean) {
  const segments = small ? 80 : 144;
  const brass = new THREE.MeshStandardMaterial({ color: "#c59a51", metalness: .82, roughness: .28 });
  const paleBrass = new THREE.MeshStandardMaterial({ color: "#e9c77b", metalness: .72, roughness: .25 });
  const darkBrass = new THREE.MeshStandardMaterial({ color: "#61513a", metalness: .8, roughness: .34 });
  [brass, paleBrass, darkBrass].forEach((material) => { material.onBeforeCompile = brassShader; });
  const enamel = new THREE.MeshStandardMaterial({ color: "#13212d", metalness: .5, roughness: .32 });
  const dial = dialTexture(small);
  const dialMat = new THREE.MeshStandardMaterial({ map: dial, metalness: .38, roughness: .46, side: THREE.DoubleSide });
  const halo = texture(128, 128, (c) => {
    const gradient = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "#ffe0a9b0"); gradient.addColorStop(.22, "#ffbc6660"); gradient.addColorStop(.5, "#ffad3b16"); gradient.addColorStop(1, "#ffad3b00");
    c.fillStyle = gradient; c.fillRect(0, 0, 128, 128);
  });
  const sunMap = texture(256, 128, (c) => {
    const image = c.createImageData(256, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
      const wave = Math.sin(x * TAU / 256 * 9 + Math.sin(y * .15) * 2) * Math.sin(y * .29 + Math.sin(x * TAU / 256 * 5));
      const grain = Math.sin(x * 127.1 + y * 311.7) * 43758.54 % 1;
      const i = (y * 256 + x) * 4;
      image.data[i] = 245 + wave * 10; image.data[i + 1] = 171 + wave * 25 + grain * 7;
      image.data[i + 2] = 75 + wave * 18; image.data[i + 3] = 255;
    }
    c.putImageData(image, 0, 0);
  });
  const planetMaps = PALETTES.map(([a, b], planet) => texture(256, 128, (c) => {
    c.fillStyle = a; c.fillRect(0, 0, 256, 128);
    for (let y = 0; y < 128; y++) {
      c.globalAlpha = .15 + .35 * (.5 + .5 * Math.sin(y * (.18 + planet * .04) + Math.sin(y * .06) * 2));
      c.fillStyle = b; c.fillRect(0, y, 256, 1);
    }
    c.globalAlpha = .1;
    for (let i = 0; i < 180; i++) {
      const x = (Math.sin(i * 127.1) * 43758.54 % 1 + 1) % 1 * 256;
      const y = (Math.sin(i * 311.7) * 42317.11 % 1 + 1) % 1 * 128;
      c.fillStyle = i % 2 ? a : b; c.beginPath(); c.ellipse(x, y, 6, 1.5, 0, 0, TAU); c.fill();
    }
  }));
  const planets = planetMaps.map((map) => new THREE.MeshStandardMaterial({ map, roughness: .55, metalness: .15, emissive: "#a77a39", emissiveIntensity: 0 }));
  const labels = DAYS.map((day) => texture(128, 64, (c) => {
    c.fillStyle = "#e6d6b5"; c.font = "26px Georgia, serif"; c.textAlign = "center";
    c.fillText(day, 64, 35); c.fillStyle = "#9e8a64"; c.fillRect(53, 47, 22, 1);
  }));
  const labelMaterials = labels.map((map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, opacity: .75 }));
  const engraving = texture(128, 64, (c) => {
    c.fillStyle = "#382b19"; c.font = "40px Georgia, serif"; c.textAlign = "center"; c.fillText("42", 64, 45);
  });
  const readoutCanvas = document.createElement("canvas"); readoutCanvas.width = 768; readoutCanvas.height = 320;
  const readout = new THREE.CanvasTexture(readoutCanvas); readout.colorSpace = THREE.SRGBColorSpace;
  const nebula = texture(1024, 512, (c) => {
    c.fillStyle = "#050913"; c.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 24; i++) {
      const x = 150 + i * 30, y = 265 + Math.sin(i * .28) * 85;
      c.save(); c.translate(x, y); c.scale(2, .65);
      const wash = c.createRadialGradient(0, 0, 0, 0, 0, 110);
      wash.addColorStop(0, i % 3 ? "#28476b10" : "#75516c14"); wash.addColorStop(1, "#00000000");
      c.fillStyle = wash; c.fillRect(-110, -110, 220, 220); c.restore();
    }
  });
  const starGeometry = new THREE.BufferGeometry(), positions = [], colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < (small ? 500 : 1000); i++) {
    const u = ((Math.sin(i * 127.1 + 3) * 43758.5453 % 1) + 1) % 1;
    const v = ((Math.sin(i * 311.7 + 7) * 23127.123 % 1) + 1) % 1;
    const y = 1 - 2 * u, a = v * TAU, radius = 42 + (i % 17) * 2;
    positions.push(Math.sqrt(1 - y * y) * Math.cos(a) * radius, y * radius, Math.sqrt(1 - y * y) * Math.sin(a) * radius);
    color.set(i % 5 === 0 ? "#b1c9ff" : i % 7 === 0 ? "#f7ce9a" : "#e2e6ef").multiplyScalar(.35 + (i % 9) * .07);
    colors.push(color.r, color.g, color.b);
  }
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); starGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const moonMaterial = new THREE.ShaderMaterial({
    uniforms: { phase: { value: 0 } }, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: `varying vec2 vUv; uniform float phase;
      void main() {
        vec2 p = vUv * 2. - 1.; float r = dot(p,p); if(r > 1.) discard;
        vec3 n = vec3(p, sqrt(1.-r)); vec3 light = vec3(sin(phase), .0, -cos(phase));
        float shade = smoothstep(-.035,.06,dot(n,light));
        float grain = .92 + .06 * sin(p.x*43.+sin(p.y*21.))*sin(p.y*36.);
        vec3 tint = mix(vec3(.065,.085,.12), vec3(.85,.88,.87)*grain, shade * (.65+.35*n.z));
        gl_FragColor = vec4(tint, 1.-smoothstep(.96,1.,r));
      }`,
  });
  const sphere = new THREE.SphereGeometry(1, small ? 24 : 40, small ? 16 : 24);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, small ? 24 : 48);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const orbitGeometries = RADII.map((r) => new THREE.TorusGeometry(r, .009, 5, segments));
  const gearGeometries = GEARS.map((g) => gearGeometry(g.r, g.teeth));
  const outerArc = arcGeometry(48), trailArc = arcGeometry(48);
  const arcMaterial = new THREE.MeshBasicMaterial({ color: "#9dcbe3", transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
  return { brass, paleBrass, darkBrass, enamel, dialMat, halo, sunMap, planets, labelMaterials, engraving, readout, nebula, starGeometry, moonMaterial, sphere, cylinder, box, orbitGeometries, gearGeometries, outerArc, trailArc, arcMaterial,
    dispose() {
      [brass, paleBrass, darkBrass, enamel, dialMat, ...planets, ...labelMaterials, moonMaterial, arcMaterial].forEach((m) => m.dispose());
      [dial, halo, sunMap, ...planetMaps, ...labels, engraving, readout, nebula].forEach((t) => t.dispose());
      [sphere, cylinder, box, starGeometry, ...orbitGeometries, ...gearGeometries, outerArc, trailArc].forEach((g) => g.dispose());
    },
  };
}

function paintReadout(map: THREE.CanvasTexture<HTMLCanvasElement>, now: Date, duration: number, opacity: number, color: THREE.Color) {
  const canvas = map.image;
  const c = canvas.getContext("2d")!; c.clearRect(0, 0, 768, 320);
  const pad = (n: number) => String(n).padStart(2, "0");
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillStyle = "#aa9771"; c.font = "19px Georgia, serif"; c.fillText("L O C A L   T I M E", 384, 38);
  c.fillStyle = "#f4e3be"; c.font = "90px Georgia, serif";
  c.fillText(`${pad(now.getHours())}:${pad(now.getMinutes())}`, 360, 112);
  c.font = "31px Georgia, serif"; c.fillStyle = "#b5a483"; c.fillText(pad(now.getSeconds()), 527, 132);
  c.fillStyle = "#bba989"; c.font = "22px Georgia, serif";
  c.fillText(now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }).toUpperCase(), 384, 188);
  c.strokeStyle = "#74644a"; c.lineWidth = 1; c.beginPath(); c.moveTo(235, 225); c.lineTo(533, 225); c.stroke();
  if (opacity > .005) {
    const end = new Date(now.getTime() + duration * 60000);
    c.globalAlpha = opacity; c.fillStyle = `#${color.getHexString()}`; c.font = "26px Georgia, serif";
    c.fillText(`+${Math.round(duration)} MIN  ·  ${pad(end.getHours())}:${pad(end.getMinutes())}`, 384, 271); c.globalAlpha = 1;
  }
  map.needsUpdate = true;
}

function updateMoon(material: THREE.ShaderMaterial, ms: number) {
  material.uniforms.phase.value = lunarPhase(ms) * TAU;
}

export default function Orrery({ active, running, reduced, small }: SceneContentProps) {
  const resources = useMemo(() => createResources(small), [small]);
  useEffect(() => () => resources.dispose(), [resources]);
  const world = useRef<THREE.Group>(null), arms = useRef<THREE.Group>(null), gears = useRef<THREE.Group>(null);
  const pointer = useRef<THREE.Group>(null), preview = useRef<THREE.Group>(null), moon = useRef<THREE.Group>(null);
  const readout = useRef<THREE.Sprite>(null), sun = useRef<THREE.Mesh>(null), stars = useRef<THREE.Points>(null);
  const phase = useRef({ elapsed: 0, duration: 0, visible: 0, gear: 0, lastTick: -1, lastLabel: -1, lastDuration: 0, color: new THREE.Color("#9dcbe3"), targetColor: new THREE.Color("#9dcbe3") });

  useFrame(({ camera }, delta) => {
    if (!running) return;
    const s = phase.current, dt = Math.min(delta, .1), nowMs = Date.now(), now = new Date(nowMs);
    s.elapsed += dt;
    const intro = reduced ? 1 : THREE.MathUtils.smootherstep(s.elapsed / 1.6, 0, 1);
    const amount = active ? Math.max(0, active.duration_minutes) : 0;
    if (active) { s.lastDuration = amount; s.targetColor.set(active.color); }
    s.visible = THREE.MathUtils.damp(s.visible, active ? 1 : 0, 5, dt);
    s.duration = THREE.MathUtils.damp(s.duration, amount, 3.4, dt);
    s.color.lerp(s.targetColor, 1 - Math.exp(-dt * 5));
    const day = (now.getDay() + 6) % 7;
    const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600 + now.getMilliseconds() / 3600000;
    const angle = hours / 24 * TAU, span = s.duration / 1440 * TAU;
    if (world.current) { world.current.scale.setScalar(.84 + intro * .16); world.current.position.y = -.35 * (1 - intro); }
    if (arms.current) arms.current.children.forEach((arm, i) => {
      const open = reduced ? 1 : THREE.MathUtils.smootherstep((s.elapsed - i * .055) / 1.2, 0, 1);
      const a = angle + (i - day) / 7 * TAU - (1 - open) * .8;
      arm.rotation.y = -a;
      const bar = arm.children[0], planet = arm.children[1];
      const radius = .65 + (RADII[i] - .65) * open;
      bar.scale.z = radius - .5; bar.position.z = -(radius + .5) / 2;
      planet.position.z = -radius;
      const orb = planet.children[0];
      const size = (.145 + i * .012) * (i === day ? 1.45 : 1);
      orb.scale.setScalar(size);
      if (!reduced) orb.rotation.y = s.elapsed * .045 + i;
      const glow = planet.children[1] as THREE.Sprite;
      (glow.material as THREE.SpriteMaterial).opacity = i === day ? .68 : 0;
      resources.planets[i].setValues({ emissiveIntensity: i === day ? .3 : 0 });
      resources.labelMaterials[i].setValues({ opacity: i === day ? 1 : .62 });
      resources.labelMaterials[i].color.set(i === day ? "#ffd48a" : "#c1ced8");
      planet.children[2].position.y = size + .19;
    });
    if (!reduced) s.gear += dt * (.08 + s.visible * 1.4 + (1 - intro) * .7);
    if (gears.current) gears.current.children.forEach((gear, i) => {
      gear.rotation.y = (i === 0 ? 1 : -36 / GEARS[i].teeth) * s.gear + (i === 0 ? 0 : Math.PI / GEARS[i].teeth);
    });
    if (pointer.current) pointer.current.rotation.y = -angle;
    if (preview.current) { preview.current.rotation.y = -(angle + span); preview.current.visible = s.visible > .005; }
    resources.arcMaterial.color.copy(s.color); resources.arcMaterial.setValues({ opacity: s.visible * .9 });
    updateArc(resources.outerArc, 4.88, .035, angle, span, .12);
    updateArc(resources.trailArc, RADII[day], .022, angle, span, .17 + day * .035);
    if (moon.current) {
      const r = RADII[day];
      moon.current.position.set(Math.sin(angle) * r + .43, .45 + day * .035, -Math.cos(angle) * r + .23);
      moon.current.quaternion.copy(camera.quaternion);
    }
    const tick = Math.floor(nowMs / 1000);
    if (tick !== s.lastTick) { updateMoon(resources.moonMaterial, nowMs); s.lastTick = tick; }
    // Repaint at 8 Hz during the duration fade, otherwise once a second.
    const labelTick = Math.floor(nowMs / (s.visible > .005 ? 125 : 1000));
    if (labelTick !== s.lastLabel) {
      paintReadout(resources.readout, now, s.lastDuration, s.visible, s.color);
      s.lastLabel = labelTick;
    }
    if (readout.current) readout.current.material.opacity = intro;
    if (sun.current && !reduced) sun.current.scale.setScalar(.48 + Math.sin(s.elapsed * .65) * .008);
    if (stars.current && !reduced) stars.current.rotation.y = s.elapsed * .0012;
  });

  const r = resources;
  return <>
    <color attach="background" args={["#050913"]} />
    <mesh><sphereGeometry args={[90, 32, 16]} /><meshBasicMaterial map={r.nebula} side={THREE.BackSide} depthWrite={false} toneMapped={false} /></mesh>
    <points ref={stars} geometry={r.starGeometry}><pointsMaterial vertexColors size={small ? .085 : .065} sizeAttenuation transparent opacity={.85} depthWrite={false} toneMapped={false} /></points>
    <hemisphereLight args={["#aebfe6", "#302039", 1.65]} />
    <directionalLight position={[-7, 10, 4]} color="#ffdfa3" intensity={3.8} />
    <directionalLight position={[6, 3, -8]} color="#8eb9ec" intensity={2.5} />
    <pointLight position={[0, 1.2, 0]} color="#ffc16b" intensity={5} distance={9} decay={2} />
    <group ref={world}>
      {/* Both faces are finished; the instrument floats without a floor. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh material={r.brass}><torusGeometry args={[4.96, .037, 8, small ? 96 : 160]} /></mesh>
        <mesh material={r.paleBrass}><torusGeometry args={[4.4, .026, 8, small ? 96 : 160]} /></mesh>
        <mesh material={r.darkBrass} position={[0, 0, -.065]} scale={[1, 1, .25]}><torusGeometry args={[4.68, .22, 6, small ? 96 : 160]} /></mesh>
        <mesh material={r.dialMat} position={[0, 0, .03]}><ringGeometry args={[4.41, 4.94, small ? 96 : 160]} /></mesh>
        {r.orbitGeometries.map((geometry, i) => <mesh key={i} geometry={geometry} material={r.darkBrass} position={[0, 0, .13 + i * .035]} />)}
      </group>
      {[0, 1, 2, 3].map((i) => <group key={i} rotation={[0, i * Math.PI / 2 + .2, 0]}>
        <mesh geometry={r.box} material={r.darkBrass} position={[0, -.14, -2.7]} scale={[.055, .07, 3.75]} />
        <mesh geometry={r.sphere} material={r.paleBrass} position={[0, .04, -4.68]} scale={.065} />
      </group>)}
      <mesh geometry={r.cylinder} material={r.enamel} position={[0, -.28, 0]} scale={[1.27, .18, 1.27]} />
      <mesh geometry={r.cylinder} material={r.brass} position={[0, -.39, 0]} scale={[1.12, .09, 1.12]} />
      <mesh geometry={r.cylinder} material={r.darkBrass} position={[0, -.52, 0]} scale={[.58, .24, .58]} />
      <mesh geometry={r.sphere} material={r.brass} position={[0, -.68, 0]} scale={[.25, .16, .25]} />
      <group ref={gears} position={[0, -.05, 0]}>
        {GEARS.map((gear, i) => <group key={i} position={[gear.x, 0, gear.z]}>
          <mesh geometry={r.gearGeometries[i]} material={i % 2 ? r.paleBrass : r.brass} />
          {[0, 1, 2].map((spoke) => <mesh key={spoke} geometry={r.box} material={r.brass} rotation={[0, spoke * TAU / 3, 0]} scale={[gear.r * 1.65, .04, gear.r * .12]} />)}
          <mesh geometry={r.cylinder} material={r.darkBrass} scale={[gear.r * .2, .11, gear.r * .2]} />
          {i === 1 && <mesh position={[0, .043, -.295]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.16, .08]} /><meshBasicMaterial map={r.engraving} transparent depthWrite={false} /></mesh>}
        </group>)}
      </group>
      <mesh geometry={r.cylinder} material={r.brass} position={[0, .4, 0]} scale={[.06, 1.75, .06]} />
      {[.14, .27, .4, .54].map((y) => <mesh key={y} geometry={r.cylinder} material={r.paleBrass} position={[0, y, 0]} scale={[.25 - y * .16, .045, .25 - y * .16]} />)}
      <mesh ref={sun} geometry={r.sphere} position={[0, 1.13, 0]} scale={.48}><meshStandardMaterial map={r.sunMap} emissiveMap={r.sunMap} color="#ffd590" emissive="#ffb34b" emissiveIntensity={1.6} roughness={.8} /></mesh>
      <sprite position={[0, 1.13, 0]} scale={[3.5, 3.5, 1]}><spriteMaterial map={r.halo} transparent opacity={.7} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
      <group ref={arms}>
        {RADII.map((radius, i) => <group key={i} position={[0, .13 + i * .035, 0]}>
          <mesh geometry={r.box} material={i % 2 ? r.paleBrass : r.brass} scale={[.032, .028, radius - .5]} position={[0, 0, -(radius + .5) / 2]} />
          <group position={[0, .18, -radius]}>
            <mesh geometry={r.sphere} material={r.planets[i]} scale={.145 + i * .012} />
            <sprite scale={[1.25, 1.25, 1]}><spriteMaterial map={r.halo} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></sprite>
            <sprite material={r.labelMaterials[i]} position={[0, .4, 0]} scale={[.6, .3, 1]} />
            <mesh geometry={r.cylinder} material={r.brass} position={[0, -.12, 0]} scale={[.035, .24, .035]} />
            {i === 4 && <mesh rotation={[.6, 0, .2]} material={r.paleBrass}><torusGeometry args={[.31, .013, 5, 48]} /></mesh>}
          </group>
        </group>)}
      </group>
      <group ref={pointer}>
        <mesh geometry={r.box} material={r.paleBrass} position={[0, .1, -4.62]} scale={[.024, .07, .62]} />
        <mesh position={[0, .1, -4.93]} rotation={[-Math.PI / 2, 0, 0]}><coneGeometry args={[.075, .16, 3]} /><meshBasicMaterial color="#fff0c8" toneMapped={false} /></mesh>
        <mesh geometry={r.sphere} position={[0, .13, -4.35]} scale={.055}><meshBasicMaterial color="#ffe2a5" toneMapped={false} /></mesh>
      </group>
      <group ref={preview}>
        <mesh geometry={r.box} material={r.arcMaterial} position={[0, .12, -4.66]} scale={[.045, .045, .58]} />
        <mesh geometry={r.sphere} material={r.arcMaterial} position={[0, .15, -4.94]} scale={.075} />
      </group>
      <mesh geometry={r.outerArc} material={r.arcMaterial} />
      <mesh geometry={r.trailArc} material={r.arcMaterial} />
      <group ref={moon}><mesh material={r.moonMaterial}><planeGeometry args={[.28, .28]} /></mesh></group>
      <sprite ref={readout} position={[0, 4.3, 0]} scale={small ? [6.5, 2.71, 1] : [5.6, 2.33, 1]} renderOrder={5}><spriteMaterial map={r.readout} transparent depthTest={false} depthWrite={false} toneMapped={false} /></sprite>
    </group>
  </>;
}
