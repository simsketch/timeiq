"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
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

// A polar grid, rather than a triangle fan, lets enamel and printed ink fold
// continuously across the support. UVs remain attached to the soft surface.
function dialGeometry() {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rings = 20, segments = 80;
  for (let ring = 0; ring <= rings; ring++) {
    for (let segment = 0; segment <= segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
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

function createDial(main: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = main ? 1024 : 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const context = canvas.getContext("2d")!;
  context.scale(canvas.width / 1024, canvas.height / 1024);
  function draw() {
    const c = context, center = 512;
    c.clearRect(0, 0, 1024, 1024);
    c.fillStyle = main ? "#f6efd9" : "#eadfc6";
    c.fillRect(0, 0, 1024, 1024);
    c.strokeStyle = "#b9a780";
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(center, center, 472, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 60; i++) {
      const angle = i / 60 * Math.PI * 2;
      const radius = i % 5 === 0 ? 423 : 443;
      c.strokeStyle = "#524a43";
      c.lineWidth = i % 5 === 0 ? 4 : 2;
      c.beginPath();
      c.moveTo(center + Math.sin(angle) * radius, center - Math.cos(angle) * radius);
      c.lineTo(center + Math.sin(angle) * 459, center - Math.cos(angle) * 459);
      c.stroke();
    }
    c.fillStyle = "#39353c";
    c.font = "66px Georgia, serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    for (let hour = 1; hour <= 12; hour++) {
      const angle = hour / 12 * Math.PI * 2;
      c.fillText(String(hour), center + Math.sin(angle) * 366, center - Math.cos(angle) * 366);
    }
    c.font = "18px Georgia, serif";
    c.fillStyle = "#8b7961";
    c.fillText("TimeIQ", center, 310);
    const now = main ? new Date() : new Date(2026, 0, 1, 8, 22);
    const minutes = now.getMinutes() + now.getSeconds() / 60;
    const hours = now.getHours() % 12 + minutes / 60;
    function hand(angle: number, length: number, width: number) {
      c.save(); c.translate(center, center); c.rotate(angle);
      c.fillStyle = "#35323c";
      c.beginPath(); c.moveTo(-width / 2, 40); c.lineTo(-width / 2, -length + 30);
      c.lineTo(0, -length); c.lineTo(width / 2, -length + 30); c.lineTo(width / 2, 40); c.closePath(); c.fill();
      c.restore();
    }
    hand(hours / 12 * Math.PI * 2, 225, 15);
    hand(minutes / 60 * Math.PI * 2, 330, 9);
    c.fillStyle = "#b68a43"; c.beginPath(); c.arc(center, center, 18, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#40383b"; c.beginPath(); c.arc(center, center, 6, 0, Math.PI * 2); c.fill();
    texture.needsUpdate = true;
  }
  draw();
  return { texture, draw };
}

function createArc() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  function draw(active: MeetingType | null) {
    const c = canvas.getContext("2d")!;
    c.clearRect(0, 0, 512, 512);
    if (active) {
      const now = new Date();
      const start = (now.getMinutes() + now.getSeconds() / 60) / 60 * Math.PI * 2 - Math.PI / 2;
      c.strokeStyle = active.color;
      c.shadowColor = active.color; c.shadowBlur = 11;
      c.lineWidth = 7; c.lineCap = "round";
      c.beginPath(); c.arc(256, 256, 242, start, start + Math.min(active.duration_minutes / 60, 1) * Math.PI * 2); c.stroke();
    }
    texture.needsUpdate = true;
  }
  return { texture, draw };
}

function deform(geometry: THREE.BufferGeometry, original: Float32Array, fold: number, extra: number) {
  const p = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = original[i * 3], y = original[i * 3 + 1], z = original[i * 3 + 2];
    const d = Math.max(0, .23 - y + x * .08);
    // Upper enamel rests on the support; the lower half stretches down and
    // curls forward. Everything, including the rim and hands, shares this map.
    const meltedY = y > .23 ? .23 + (y - .23) * .16 : y - d * d * (.52 + extra);
    const meltedZ = y > .23 ? -(y - .23) * .95 : Math.sin(d * 2.9) * .18 + d * d * .07;
    p.setXYZ(i,
      x * (1 - fold * d * .03) + fold * d * d * .1,
      THREE.MathUtils.lerp(y * .12, meltedY, fold),
      THREE.MathUtils.lerp(-y, meltedZ, fold) + z,
    );
  }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  // The initial rigid bounds do not contain the fully hanging watch.
  geometry.computeBoundingSphere();
}

function SoftWatch({ main = false, position, scale = 1, rotation = 0, active, reduced, elapsed }: {
  main?: boolean;
  position: [number, number, number];
  scale?: number;
  rotation?: number;
  active: MeetingType | null;
  reduced: boolean;
  elapsed: { current: number };
}) {
  const resources = useMemo(() => {
    const face = dialGeometry();
    const rim = new THREE.TorusGeometry(1.015, .039, 8, 100);
    const inner = new THREE.TorusGeometry(.958, .009, 4, 100);
    const arc = dialGeometry();
    arc.translate(0, 0, .012);
    const geometries = [face, rim, inner, arc];
    return {
      face, rim, inner, arc, geometries,
      originals: geometries.map((geometry) => new Float32Array(geometry.getAttribute("position").array)),
      dial: createDial(main), highlight: createArc(),
    };
  }, [main]);
  const extra = useRef(0);
  const lastDraw = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    resources.highlight.draw(main ? active : null);
    resources.dial.draw();
    lastDraw.current = Date.now();
    invalidate();
  }, [active, main, resources, invalidate]);
  useEffect(() => () => {
    resources.geometries.forEach((geometry) => geometry.dispose());
    resources.dial.texture.dispose(); resources.highlight.texture.dispose();
  }, [resources]);
  useFrame((_, delta) => {
    if (main && Date.now() - lastDraw.current > 15000) {
      resources.dial.draw();
      resources.highlight.draw(active);
      lastDraw.current = Date.now();
    }
    const load = reduced ? 1 : THREE.MathUtils.smootherstep(elapsed.current, 0, 1.6);
    const target = main && active ? .1 : 0;
    extra.current = reduced ? target : THREE.MathUtils.damp(extra.current, target, 4, Math.min(delta, .1));
    const breath = reduced ? 0 : Math.sin(elapsed.current * Math.PI / 4) * .012;
    resources.geometries.forEach((geometry, i) => {
      if (main || i !== 3) deform(geometry, resources.originals[i], load, extra.current + breath);
    });
  });
  return (
    <group position={position} scale={scale} rotation={[0, -.07, rotation]}>
      <mesh geometry={resources.face} castShadow receiveShadow>
        <meshStandardMaterial map={resources.dial.texture} roughness={.46} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={resources.rim} castShadow>
        <meshPhysicalMaterial color="#b88b43" metalness={.82} roughness={.3} clearcoat={.55} />
      </mesh>
      <mesh geometry={resources.inner}>
        <meshStandardMaterial color="#d6af64" metalness={.75} roughness={.3} />
      </mesh>
      {main && <mesh geometry={resources.arc}>
        <meshBasicMaterial map={resources.highlight.texture} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>}
      <mesh position={[0, .35, -.82]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[.105, .025, 8, 24]} />
        <meshPhysicalMaterial color="#b88b43" metalness={.8} roughness={.3} />
      </mesh>
    </group>
  );
}

function Branch({ points, radius }: { points: [number, number, number][]; radius: number }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const tube = new THREE.TubeGeometry(curve, 36, radius, 8, false);
    const p = tube.getAttribute("position");
    // Taper each ring toward the tip, preserving a smooth sculptural branch.
    for (let i = 0; i <= 36; i++) {
      const center = curve.getPointAt(i / 36);
      const taper = 1 - i / 36 * .88;
      for (let j = 0; j <= 8; j++) {
        const index = i * 9 + j;
        const v = new THREE.Vector3().fromBufferAttribute(p, index).sub(center).multiplyScalar(taper).add(center);
        p.setXYZ(index, v.x, v.y, v.z);
      }
    }
    tube.computeVertexNormals();
    return tube;
  }, [points, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow><meshStandardMaterial color="#655044" roughness={.9} /></mesh>;
}

const trunk: [number, number, number][] = [[-1.2, 1.5, -.2], [-1.4, 2.3, -.25], [-1.25, 3.05, -.3], [-.8, 3.75, -.35], [-1, 4.5, -.4], [-.7, 5.05, -.55]];
const arm: [number, number, number][] = [[-1.31, 2.9, -.3], [-.65, 3.54, -.24], [.1, 3.77, -.15], [.95, 3.83, -.18], [1.5, 4.05, -.25]];
const twig: [number, number, number][] = [[-1, 4.25, -.4], [-1.7, 4.5, -.35], [-1.95, 4.88, -.2]];

// A stepped headland that drops sheer into the sea on its seaward (left) end,
// like the Catalan coast behind the soft watches. Flat shading keeps the
// strata readable when the low sun rakes across them.
const HEADLAND: [number, number][] = [
  [0, 0], [0, 4.2], [.6, 4.6], [1.4, 4.4], [2.1, 5.3], [3.4, 5.5], [4, 5], [5.2, 5.1],
  [6, 6.4], [7.6, 6.6], [8.3, 6], [10, 5.9], [11.2, 4.8], [13, 4.6], [14.5, 3.6],
  [17, 3.2], [20, 2.1], [24, 1.2], [30, .4], [36, 0],
];

function Headland({ position, color, scale }: { position: [number, number, number]; color: string; scale: number }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(HEADLAND.map(([x, y]) => new THREE.Vector2(x, y)));
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: false, steps: 1 });
    extruded.translate(0, 0, -3.5);
    return extruded;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={position} scale={[scale, scale, scale]}>
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
  );
}

function Sky() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: {},
    vertexShader: `varying vec3 vWorld; void main(){ vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld - cameraPosition).y;
        vec3 low = vec3(.97, .73, .52);
        vec3 high = vec3(.76, .75, .89);
        vec3 color = mix(low, high, smoothstep(-.035, .32, h));
        gl_FragColor = vec4(color, 1.);
      }
    `,
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh material={material}><sphereGeometry args={[120, 24, 16]} /></mesh>;
}

function Landscape({ active, running, reduced, small }: SceneProps) {
  const { invalidate, camera, pointer } = useThree();
  const elapsed = useRef(0);
  const keyLight = useRef<THREE.DirectionalLight>(null);
  const base = useMemo(() => new THREE.Vector3(small ? 3.7 : 4.2, 3.4, small ? 13.4 : 14.2), [small]);
  const aim = useMemo(() => new THREE.Vector3(-.15, 2.65, 0), []);
  useEffect(() => {
    if (!running) return;
    // An eight-second breathing fold needs only 16fps on phones, 24 on desktop.
    // No animation frames are requested while offscreen or in a hidden tab.
    invalidate();
    const timer = setInterval(() => invalidate(), reduced ? 15000 : 1000 / (small ? 16 : 24));
    return () => clearInterval(timer);
  }, [running, reduced, small, invalidate]);
  useEffect(() => { if (running) invalidate(); }, [active, running, reduced, small, invalidate]);
  useFrame((_, delta) => {
    if (!running) return;
    elapsed.current += Math.min(delta, .1);
    const zoom = active && !reduced ? .24 : 0;
    const px = reduced || small ? 0 : pointer.x * .16;
    const py = reduced || small ? 0 : pointer.y * .1;
    const target = new THREE.Vector3(base.x + px - zoom, base.y + py, base.z - zoom * 2);
    if (reduced || elapsed.current < .15) camera.position.copy(target);
    else camera.position.lerp(target, 1 - Math.exp(-Math.min(delta, .1) * 3));
    camera.lookAt(aim);
    if (keyLight.current) {
      const warm = reduced ? 1 : THREE.MathUtils.smootherstep(elapsed.current, 0, 1.6);
      keyLight.current.color.setRGB(1, .88 - warm * .17, .72 - warm * .25);
    }
  });
  return (
    <>
      <Sky />
      <fog attach="fog" args={["#e8be92", 35, 115]} />
      <hemisphereLight args={["#d4d2ff", "#9d714e", 2.1]} />
      <directionalLight ref={keyLight} position={[-7, 6, 3]} intensity={3.2} castShadow shadow-mapSize={[512, 512]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-normalBias={.04} shadow-bias={-.0003} shadow-radius={4} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#bd895a" roughness={1} />
      </mesh>
      <mesh position={[0, .02, -58]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[260, 22]} />
        <meshStandardMaterial color="#a9b9c4" roughness={.08} metalness={.35} />
      </mesh>
      <Headland position={[-11, 0, -62]} color="#b97a45" scale={1} />
      <Headland position={[-4, 0, -80]} color="#cfa57a" scale={.85} />
      <RoundedBox args={[3.6, 1.4, 2.3]} radius={.075} smoothness={3} position={[-.55, .72, .1]} castShadow receiveShadow>
        <meshStandardMaterial color="#bca187" roughness={.85} />
      </RoundedBox>
      <Branch points={trunk} radius={.14} />
      <Branch points={arm} radius={.11} />
      <Branch points={twig} radius={.065} />
      <SoftWatch main position={[.55, 3.65, .03]} scale={1.13} rotation={-.12} active={active} reduced={reduced} elapsed={elapsed} />
      <SoftWatch position={[-1.35, 1.34, 1.27]} scale={.77} rotation={.24} active={null} reduced={reduced} elapsed={elapsed} />
      <group position={[2.25, .1, .9]} rotation={[-Math.PI / 2, 0, -.4]} scale={[.58, .7, .3]}>
        <SoftWatch position={[0, 0, 0]} active={null} reduced={reduced} elapsed={elapsed} />
      </group>
    </>
  );
}

function WarmShaders({ onReady }: { onReady: (ready: boolean) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    // KHR_parallel_shader_compile lets the browser keep painting the profile
    // while physical-material programs compile, especially on mobile GPUs.
    gl.compileAsync(scene, camera).then(() => {
      if (!cancelled) onReady(true);
    });
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
  return (
    <Canvas
      aria-hidden="true"
      frameloop={props.running && compiled ? "demand" : "never"}
      dpr={[1, props.small ? 1.25 : 1.75]}
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{ position: [4.2, 3.4, 14.2], fov: props.small ? 35 : 37, near: .1, far: 180 }}
      gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0, opacity: compiled ? 1 : 0 }}
    >
      <Landscape {...props} running={props.running && compiled} />
      <WarmShaders onReady={handleReady} />
    </Canvas>
  );
}
