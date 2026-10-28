"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { SceneContentProps } from "./types";

const TAU = Math.PI * 2;
const DIAL_Y = 1.28;
const DIAL_Z = 1.45;
const fract = (n: number) => n - Math.floor(n);
const noise = (n: number) => fract(Math.sin(n * 127.1 + 41.7) * 43758.5453);

// Civil-time azimuth stays shared by the key light and both dial shadows.
// Art-directed midsummer elevation is deliberately capped at atan(.73) = 36°.
function solarTime(hours: number) {
  const h = ((hours % 24) + 24) % 24;
  const altitude = Math.sin((h - 5.5) / 15 * Math.PI);
  const daylight = THREE.MathUtils.smoothstep(altitude, -.16, .16);
  return {
    angle: (hours - 12) / 24 * TAU,
    daylight,
    elevation: Math.max(.12, Math.min(.73, altitude * .73)),
    golden: Math.pow(1 - Math.max(0, altitude), 1.6) * daylight,
  };
}

// Continuous layered noise: every face samples the same field, including seams.
function field(x: number, y: number, z: number, seed = 0) {
  return Math.sin(x * 1.71 + Math.sin(z * 1.37 + seed) * 1.8 + seed)
    * Math.cos(y * 1.43 + Math.sin(x * .87 + seed) * 1.4)
    * Math.sin(z * 1.91 + Math.cos(y * 1.13) * 1.2 + seed);
}

function softNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(noise(ix + iy * 57), noise(ix + 1 + iy * 57), u),
    THREE.MathUtils.lerp(noise(ix + (iy + 1) * 57), noise(ix + 1 + (iy + 1) * 57), u), v);
}

function mineralTexture(small: boolean) {
  const size = small ? 256 : 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d")!;
  const image = c.createImageData(size, size);
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const x = col * 512 / size, y = row * 512 / size;
    const cloud = softNoise(x * .019, y * .019);
    const fine = softNoise(x * .13, y * .13);
    const grain = noise(x + y * 512);
    const pits = Math.pow(noise(x * 7 + y * 179), 24);
    const streak = Math.pow(.5 + .5 * Math.sin(x * .15 + Math.sin(y * .012) * 3 + cloud * 2), 28);
    const lichen = THREE.MathUtils.smoothstep(softNoise(x * .035 + 27, y * .035 + 13) * .7 + cloud * .3, .64, .8);
    const ochre = cloud > .55;
    const v = 154 + cloud * 30 + fine * 18 + grain * 14 - pits * 29 - streak * 5;
    const i = (col + row * size) * 4;
    image.data[i] = THREE.MathUtils.lerp(v, ochre ? 163 : 131, lichen * .7);
    image.data[i + 1] = THREE.MathUtils.lerp(v * .98, ochre ? 142 : 143, lichen * .7);
    image.data[i + 2] = THREE.MathUtils.lerp(v * .94, ochre ? 92 : 126, lichen * .7);
    image.data[i + 3] = 255;
  }
  c.putImageData(image, 0, 0);
  c.scale(size / 512, size / 512);
  // Thin mineral fissures and their sun-bleached edges; deliberately irregular.
  for (let i = 0; i < 24; i++) {
    let x = noise(i * 5 + 8) * 512, y = noise(i * 11) * 512;
    c.beginPath(); c.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (noise(i * 19 + j * 3) - .5) * 25; y += 6 + noise(i + j * 13) * 23;
      c.lineTo(x, y);
    }
    c.strokeStyle = "#292b2948"; c.lineWidth = .6 + noise(i) * 1.3; c.stroke();
    c.translate(1, 0); c.strokeStyle = "#e7ddbb30"; c.lineWidth = .7; c.stroke(); c.translate(-1, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  // Phones use diffuse stone; avoid building maps their material never samples.
  if (!small) {
    const roughCanvas = document.createElement("canvas"); roughCanvas.width = roughCanvas.height = size;
    const roughContext = roughCanvas.getContext("2d")!, rough = roughContext.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 207 + image.data[i + 1] * .17;
      rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = v; rough.data[i + 3] = 255;
    }
    roughContext.putImageData(rough, 0, 0);
    const roughness = new THREE.CanvasTexture(roughCanvas);
    roughness.wrapS = roughness.wrapT = THREE.RepeatWrapping;
    texture.userData.roughness = roughness;
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function dialBaseGeometry(width: number, height: number, depth: number, seed: number, small = false) {
  const g = new RoundedBoxGeometry(width, height, depth, small ? 3 : 7, Math.min(width, height, depth) * .28);
  const p = g.getAttribute("position"), normal = g.getAttribute("normal"), uv = g.getAttribute("uv"), colors: number[] = [];
  const color = new THREE.Color(), moss = new THREE.Color("#535c3d");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // World-scaled UVs keep mineral grain the same size on tall uprights and
    // fallen slabs. Rounded corners blend through the same continuous field.
    if (Math.abs(normal.getY(i)) > .7) uv.setXY(i, x * .65, z * .65);
    else if (Math.abs(normal.getX(i)) > Math.abs(normal.getZ(i))) uv.setXY(i, z * .65, y * .65);
    else uv.setXY(i, x * .65, y * .65);
    const broad = field(x * 2.1, y * 1.5, z * 2, seed);
    const chips = field(x * 8, y * 7, z * 9, seed + 2);
    const pits = Math.pow(Math.max(0, field(x * 27, y * 24, z * 29, seed + 4)), 3);
    const wear = broad * .18 + chips * .035 - pits * .045;
    const level = y / height + .5;
    const taper = 1 - Math.max(0, y / height) * (.09 + noise(seed) * .14);
    const shoulder = 1 + Math.sin(level * 5.2 + seed) * .09 + Math.sin(level * 11 + seed * 3) * .045;
    const crown = THREE.MathUtils.smoothstep(level, .72, 1) * field(x * 3, 0, z * 3, seed) * .1;
    p.setXYZ(i, x * taper * shoulder + normal.getX(i) * wear + Math.sin(y * 1.7 + seed) * .045,
      y + height * .5 + normal.getY(i) * wear + crown,
      z * taper * (1 + Math.sin(level * 6 + seed * 2) * .08) + normal.getZ(i) * wear);
    const base = 1 - THREE.MathUtils.smoothstep(y / height + .5, .02, .28);
    color.set("#e3ded1").multiplyScalar(.95 - base * .31 - Math.max(0, -broad) * .18 - pits * .4);
    color.lerp(moss, base * .32);
    colors.push(color.r, color.g, color.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  // RoundedBox has duplicated triangle vertices. Average coincident normals so
  // the displaced surface remains sculpted instead of showing triangle facets.
  const normals = g.getAttribute("normal"), sums = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${Math.round(p.getX(i) * 10000)},${Math.round(p.getY(i) * 10000)},${Math.round(p.getZ(i) * 10000)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i), n = sums.get(k) ?? new THREE.Vector3();
    n.x += normals.getX(i); n.y += normals.getY(i); n.z += normals.getZ(i); sums.set(k, n);
  }
  sums.forEach((n) => n.normalize());
  for (let i = 0; i < p.count; i++) { const n = sums.get(key(i))!; normals.setXYZ(i, n.x, n.y, n.z); }
  return g;
}

function stoneGeometry(width: number, height: number, depth: number, seed: number, small: boolean) {
  // Uniformly spaced face vertices, unlike RoundedBox's edge-only subdivisions.
  // Indexed faces keep a desktop upright around 1,600 vertices (phones ~500).
  const segments = (length: number) => Math.round(THREE.MathUtils.clamp(length * (small ? 4 : 8), small ? 5 : 10, small ? 16 : 32));
  const g = new THREE.BoxGeometry(width, height, depth, segments(width), segments(height), segments(depth));
  const p = g.getAttribute("position"), uv = g.getAttribute("uv"), colors: number[] = [];
  const half = new THREE.Vector3(width, height, depth).multiplyScalar(.5);
  const radius = Math.min(width, height, depth) * .32;
  const core = half.clone().subScalar(radius), lower = core.clone().negate();
  const point = new THREE.Vector3(), nearest = new THREE.Vector3(), normal = new THREE.Vector3();
  const color = new THREE.Color(), moss = new THREE.Color("#535c3d");
  const lintel = height < Math.max(width, depth) * .35;
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i);
    nearest.copy(point).clamp(lower, core);
    normal.copy(point).sub(nearest).normalize();
    point.copy(nearest).addScaledVector(normal, radius);
    const { x, y, z } = point, level = y / height + .5;
    const broad = field(x * 1.5, y * 1.3, z * 1.6, seed);
    const middle = field(x * 4.3, y * 3.7, z * 4.1, seed + 3);
    const fine = field(x * 12, y * 11, z * 13, seed + 7);
    const hollow = Math.exp(-((x / width - .18 * Math.sin(seed)) ** 2 * 22
      + (level - .48 - Math.sin(seed * 2) * .18) ** 2 * 19 + (z / depth - .4) ** 2 * 8));
    const wear = Math.min(width, height, depth) * (broad * .17 + middle * .075 + fine * .018 - hollow * .19);
    const taper = lintel ? 1 : 1 - THREE.MathUtils.smoothstep(level, .3, 1) * (.12 + noise(seed) * .2);
    const shoulder = lintel ? 1 : 1 + Math.sin(level * 6.3 + seed) * .12 + Math.sin(level * 12 + seed * 2) * .045;
    const long = width > depth ? x / half.x : z / half.z;
    // Eroded bearing sockets and a bowed underside, rather than a straight beam.
    const sag = lintel ? -.13 * (1 - long * long) : 0;
    const sockets = lintel ? (1 - THREE.MathUtils.smoothstep(level, .15, .5)) * .13
      * (Math.exp(-((long - .65) ** 2) * 60) + Math.exp(-((long + .65) ** 2) * 60)) : 0;
    const crown = THREE.MathUtils.smoothstep(level, .65, 1)
      * ((x / width * .19 + z / depth * .13) * Math.sin(seed + 1) + broad * .1);
    p.setXYZ(i,
      x * taper * shoulder + normal.x * wear + Math.sin(level * 4 + seed) * .065,
      y + half.y + normal.y * wear + crown + sag + sockets,
      z * taper * (lintel ? 1 : 1 + Math.sin(level * 7 + seed * 1.7) * .14) + normal.z * wear + x / width * .11 * Math.sin(seed));
    if (Math.abs(normal.y) > .7) uv.setXY(i, x * .65, z * .65);
    else if (Math.abs(normal.x) > Math.abs(normal.z)) uv.setXY(i, z * .65, y * .65);
    else uv.setXY(i, x * .65, y * .65);
    const base = 1 - THREE.MathUtils.smoothstep(level, .02, .28);
    color.set("#e3ded1").multiplyScalar(.95 - base * .31 - Math.max(0, -broad) * .18);
    color.lerp(moss, base * .32); colors.push(color.r, color.g, color.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  // Join normals across the six UV seams after carving the continuous surface.
  const normals = g.getAttribute("normal"), sums = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${Math.round(p.getX(i) * 10000)},${Math.round(p.getY(i) * 10000)},${Math.round(p.getZ(i) * 10000)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i), n = sums.get(k) ?? new THREE.Vector3();
    n.x += normals.getX(i); n.y += normals.getY(i); n.z += normals.getZ(i); sums.set(k, n);
  }
  sums.forEach((n) => n.normalize());
  for (let i = 0; i < p.count; i++) { const n = sums.get(key(i))!; normals.setXYZ(i, n.x, n.y, n.z); }
  return g;
}

function StoneMaterial({ small, map, color = "#ffffff", vertexColors = false, bumpScale = .035 }: {
  small: boolean; map: THREE.Texture; color?: string; vertexColors?: boolean; bumpScale?: number;
}) {
  return small
    ? <meshLambertMaterial map={map} color={color} vertexColors={vertexColors} />
    : <meshStandardMaterial map={map} color={color} vertexColors={vertexColors} bumpMap={map} bumpScale={bumpScale} roughnessMap={map.userData.roughness ?? null} roughness={.98} />;
}

function Stones({ small, depth }: { small: boolean; depth: THREE.RawShaderMaterial }) {
  const resources = useMemo(() => {
    const texture = mineralTexture(small);
    const material = small
      ? new THREE.MeshLambertMaterial({ map: texture, vertexColors: true })
      : new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: .035, roughnessMap: texture.userData.roughness, roughness: .98, vertexColors: true });
    // An asymmetric enclosure: broken gates, leaning uprights and buried fragments.
    const pieces = [
      [-3.15, -.12, -3.45, 1.17, 3.8, 1.12, -.2, -.07], [-.88, -.08, -4.55, 1.1, 3.9, 1.05, -.13, .035],
      [-2.02, 3.64, -4.02, 3.5, .73, 1.26, .44, -.025],
      [1.0, -.12, -4.7, 1.15, 4.15, 1.08, .11, -.05], [3.22, -.14, -3.5, 1.26, 3.95, 1.2, .36, .045],
      [2.1, 3.82, -4.1, 3.65, .68, 1.32, -.46, .035],
      [-4.7, -.15, -.4, 1.36, 3.45, 1.22, -.8, -.08], [-4.18, -.12, 1.8, 1.08, 2.95, .92, -.45, .055],
      [-4.5, 2.85, .68, 1.25, .64, 3.5, -.24, -.05],
      [4.8, -.13, -.4, 1.28, 3.6, 1.18, .42, -.08], [4.1, -.1, 2.6, 1.08, 2.13, .95, -.2, .09],
      [-2.9, -.16, 4.0, 1.48, .7, 1.65, .4, -.1], [2.0, -.19, 4.85, 2.5, .62, 1.1, -.6, .04],
      [.9, -.16, -6, .82, 1.5, .92, -.2, .14], [-6.5, -.21, 3.1, .95, .82, 2.7, -.65, .08],
      [5.7, -.28, -4.2, 2.6, .68, 1.15, .8, -.12],
    ];
    const stones = pieces.map(([x, y, z, w, h, d, rotation, lean], i) => ({
      geometry: stoneGeometry(w, h, d, i * 11 + 5, small), position: [x, y, z] as [number, number, number], rotation, lean,
      scale: [1, 1, 1] as [number, number, number], footprint: [w, d],
    }));
    const rubble = [0, 1, 2].map((i) => stoneGeometry(.9, .55, .8, 190 + i * 17, small));
    [[-3.5, -.22, 2.5], [3.4, -.19, 3.9], [-1.8, -.24, -5.4], [5.4, -.22, 1.8], [-5.2, -.21, -2.6], [1.7, -.26, 5.6]].forEach(([x, y, z], i) => {
      const scale: [number, number, number] = [.65 + noise(i + 2) * .65, .7 + noise(i + 5) * .5, .65 + noise(i + 9) * .6];
      stones.push({ geometry: rubble[i % 3], position: [x, y, z], rotation: noise(i * 7) * TAU, lean: (noise(i + 6) - .5) * .4, scale, footprint: [.9 * scale[0], .8 * scale[2]] });
    });
    const contact = document.createElement("canvas"); contact.width = contact.height = 64;
    const c = contact.getContext("2d")!, fade = c.createRadialGradient(32, 32, 1, 32, 32, 32);
    fade.addColorStop(0, "#101914b0"); fade.addColorStop(.4, "#10191465"); fade.addColorStop(1, "#10191400");
    c.fillStyle = fade; c.fillRect(0, 0, 64, 64);
    const contactMap = new THREE.CanvasTexture(contact);
    return { texture, material, stones, contactMap };
  }, [small]);
  useEffect(() => () => {
    new Set(resources.stones.map((s) => s.geometry)).forEach((g) => g.dispose());
    resources.material.dispose(); resources.texture.userData.roughness?.dispose(); resources.texture.dispose(); resources.contactMap.dispose();
  }, [resources]);
  return <group>
    <mesh visible={false} geometry={resources.stones[0].geometry} material={depth} />
    {resources.stones.map((s, i) => <group key={i}>
      <mesh geometry={s.geometry} material={resources.material} customDepthMaterial={depth} position={s.position} scale={s.scale} rotation={[s.lean * .4, s.rotation, s.lean]} castShadow={!small} receiveShadow={!small} />
      {s.position[1] < 0 && <mesh position={[s.position[0], .006, s.position[2]]} rotation={[-Math.PI / 2, 0, -s.rotation]}>
        <planeGeometry args={[s.footprint[0] * 2.2, s.footprint[1] * 2.2]} />
        <meshBasicMaterial map={resources.contactMap} transparent depthWrite={false} />
      </mesh>}
    </group>)}
  </group>;
}

function groundHeight(x: number, z: number) {
  const clearing = THREE.MathUtils.smoothstep(Math.hypot(x, z), 8, 26);
  return clearing * (.4 + 1.1 * Math.sin(x * .047 + z * .021) * Math.sin(z * .063)
    + 2.4 * Math.exp(-((x + 27) ** 2 / 230 + (z + 40) ** 2 / 200))
    + 3.6 * Math.exp(-((x - 34) ** 2 / 380 + (z + 61) ** 2 / 300))
    + 3 * Math.exp(-((x + 43) ** 2 / 370 + (z - 10) ** 2 / 240)));
}

function Meadow({ small, running, reduced }: Pick<SceneContentProps, "small" | "running" | "reduced">) {
  const grass = useRef<THREE.InstancedMesh>(null), flowers = useRef<THREE.InstancedMesh>(null);
  const resources = useMemo(() => {
    const rings = small ? 42 : 70, slices = small ? 80 : 144;
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [], colors: number[] = [];
    const light = new THREE.Color("#83915c"), dark = new THREE.Color("#526c43"), earth = new THREE.Color("#a29272"), color = new THREE.Color();
    for (let ring = 0; ring <= rings; ring++) for (let segment = 0; segment <= slices; segment++) {
      const radius = 240 * Math.pow(ring / rings, 1.8), angle = segment / slices * TAU;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      positions.push(x, groundHeight(x, z) - .035, z); uvs.push(x / 22, z / 22);
      const path = Math.exp(-((x - .25) ** 2 / 5 + (z - 3.5) ** 2 / 40));
      color.copy(dark).lerp(light, .48 + field(x * .4, 0, z * .4) * .25).lerp(earth, path * .68);
      colors.push(color.r, color.g, color.b);
      if (ring < rings && segment < slices) {
        const a = ring * (slices + 1) + segment, b = a + slices + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const terrain = new THREE.BufferGeometry();
    terrain.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    terrain.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); terrain.setIndex(indices);
    terrain.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); terrain.computeVertexNormals();
    const groundCanvas = document.createElement("canvas"); groundCanvas.width = groundCanvas.height = 128;
    const gc = groundCanvas.getContext("2d")!, groundImage = gc.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) {
      const v = 211 + noise(i) * 36; groundImage.data[i * 4] = groundImage.data[i * 4 + 1] = groundImage.data[i * 4 + 2] = v; groundImage.data[i * 4 + 3] = 255;
    }
    gc.putImageData(groundImage, 0, 0);
    const texture = new THREE.CanvasTexture(groundCanvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(10, 10);
    const blade = new THREE.BufferGeometry();
    blade.setAttribute("position", new THREE.Float32BufferAttribute([
      -.035, 0, 0, .035, 0, 0, -.03, .27, .025, .03, .27, .025, .09, .59, .045,
      0, 0, -.028, 0, 0, .028, .02, .22, -.02, .02, .22, .02, .045, .48, .07,
    ], 3));
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 5, 6, 7, 6, 8, 7, 7, 8, 9]); blade.computeVertexNormals();
    const count = small ? 1700 : 10500, flowerCount = small ? 55 : 240;
    const wind = { value: 0 };
    const grassMaterial = new THREE.MeshLambertMaterial({ color: "#e5ead5", emissive: "#526339", emissiveIntensity: .12, side: THREE.DoubleSide });
    grassMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = wind;
      shader.vertexShader = "uniform float uWind;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        float phase = instanceMatrix[3].x * .6 + instanceMatrix[3].z * .4;
        transformed.x += (sin(uWind * .9 + phase) + sin(uWind * .41 + phase * 1.7) * .5) * position.y * position.y * .38;
      `);
    };
    grassMaterial.userData.wind = wind;
    return { terrain, texture, blade, wind, grassMaterial, count, flowerCount };
  }, [small]);
  useEffect(() => {
    if (!grass.current || !flowers.current) return;
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    for (let i = 0; i < resources.count; i++) {
      const angle = noise(i * 3 + 2) * TAU, radius = 2.8 + Math.pow(noise(i * 7 + 3), .78) * 13.5;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      const path = Math.exp(-((x - .25) ** 2 / 4 + (z - 4) ** 2 / 20));
      dummy.position.set(x, groundHeight(x, z) - .04, z);
      dummy.rotation.set(0, noise(i * 13) * TAU, (noise(i * 19) - .5) * .3);
      dummy.scale.setScalar((.28 + noise(i * 23) * .67) * (1 - path * .75)); dummy.updateMatrix();
      grass.current.setMatrixAt(i, dummy.matrix);
      color.set(i % 7 === 0 ? "#9c9c70" : i % 3 ? "#7b8f58" : "#465f41").multiplyScalar(.8 + noise(i * 17) * .5);
      grass.current.setColorAt(i, color);
    }
    for (let i = 0; i < resources.flowerCount; i++) {
      const angle = noise(i * 13 + 4) * TAU, radius = 5 + noise(i * 19 + 1) * 12;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      dummy.position.set(x, groundHeight(x, z) + .16 + noise(i * 7) * .3, z);
      dummy.rotation.set(noise(i) * 2, noise(i * 3) * TAU, 0);
      dummy.scale.setScalar(.025 + noise(i * 17) * .025); dummy.updateMatrix(); flowers.current.setMatrixAt(i, dummy.matrix);
      flowers.current.setColorAt(i, color.set(i % 4 === 0 ? "#dbc5ed" : i % 3 ? "#f0e5b5" : "#e7b35f"));
    }
    for (const mesh of [grass.current, flowers.current]) {
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
    }
    return () => { resources.terrain.dispose(); resources.texture.userData.roughness?.dispose(); resources.texture.dispose(); resources.blade.dispose(); resources.grassMaterial.dispose(); };
  }, [resources]);
  useFrame((_, delta) => {
    if (!running || reduced || !grass.current) return;
    (grass.current.material as THREE.MeshLambertMaterial).userData.wind.value += Math.min(delta, .1);
  });
  return <>
    <mesh geometry={resources.terrain} receiveShadow={!small}><meshLambertMaterial map={resources.texture} vertexColors /></mesh>
    <instancedMesh ref={grass} args={[resources.blade, resources.grassMaterial, resources.count]} />
    <instancedMesh ref={flowers} args={[undefined, undefined, resources.flowerCount]}><icosahedronGeometry args={[1, 0]} /><meshLambertMaterial emissive="#a99a6b" emissiveIntensity={.25} /></instancedMesh>
  </>;
}

// Separate ridge layers hold their silhouettes while fog supplies aerial depth.
function Landscape({ running, small }: Pick<SceneContentProps, "running" | "small">) {
  const trees = useRef<THREE.InstancedMesh>(null), trunks = useRef<THREE.InstancedMesh>(null);
  const treeCount = small ? 24 : 42, lobes = 5;
  const resources = useMemo(() => {
    const ridges = [0, 1, 2].map((layer) => {
      const positions: number[] = [], indices: number[] = [];
      for (let i = 0; i <= 180; i++) {
        // Closed ridge rings stay inside the far plane at every allowed orbit;
        // a flat backdrop exposes a clipped edge when viewed along its plane.
        const angle = i / 180 * TAU, radius = 48 + layer * 25;
        const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        const y = 1.3 + layer * 1.1 + Math.sin(x * .037 + layer * 2) * 1.4 + Math.sin(x * .077 + layer) * .7;
        positions.push(x, y, z, x, -20, z);
        if (i < 180) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
      return { geometry, material: new THREE.MeshBasicMaterial({ color: "#889ca2", side: THREE.DoubleSide, fog: false, toneMapped: false }) };
    });
    const canopy = new THREE.SphereGeometry(1, small ? 8 : 12, small ? 6 : 8), p = canopy.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const swell = 1 + field(x * 3.4, y * 3.1, z * 3.7, 17) * .22;
      p.setXYZ(i, x * swell, y * swell, z * swell);
    }
    canopy.computeVertexNormals();
    return { ridges, canopy, day: [new THREE.Color("#6e8b8c"), new THREE.Color("#95abb5"), new THREE.Color("#b5c4ce")], night: [new THREE.Color("#293d50"), new THREE.Color("#405269"), new THREE.Color("#52647c")], dusk: new THREE.Color("#a08e9b") };
  }, [small]);
  useEffect(() => {
    if (trees.current && trunks.current) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < treeCount; i++) {
        // Overlapping crowns in three copses, with occasional younger trees.
        const copse = i % 3, x = [-31, 3, 39][copse] + (noise(i * 17 + 5) - .5) * 19;
        const z = [-63, -79, -68][copse] + (noise(i * 5 + 4) - .5) * 12;
        const scale = .45 + noise(i * 7) * .6, ground = groundHeight(x, z);
        dummy.position.set(x, ground + scale * .9, z); dummy.rotation.set(0, noise(i * 3) * TAU, (noise(i + 2) - .5) * .18);
        dummy.scale.set(scale, scale * 1.3, scale); dummy.updateMatrix(); trunks.current.setMatrixAt(i, dummy.matrix);
        for (let j = 0; j < lobes; j++) {
          const angle = j * 2.4 + noise(i * 11) * TAU, spread = j === 0 ? 0 : .6 + noise(i * 19 + j) * .6;
          dummy.position.set(x + Math.cos(angle) * spread * scale,
            ground + scale * (j === 0 ? 2.65 : 1.95 + noise(i * 23 + j) * .65), z + Math.sin(angle) * spread * scale);
          dummy.rotation.set(noise(i + j) * .4, angle, (noise(i * 3 + j) - .5) * .4);
          const size = scale * (.7 + noise(i * 13 + j) * .4);
          dummy.scale.set(size * 1.15, size * (.8 + noise(i + j * 7) * .4), size); dummy.updateMatrix();
          trees.current.setMatrixAt(i * lobes + j, dummy.matrix);
        }
      }
      trees.current.instanceMatrix.needsUpdate = true; trees.current.computeBoundingSphere();
      trunks.current.instanceMatrix.needsUpdate = true; trunks.current.computeBoundingSphere();
    }
    return () => {
      resources.canopy.dispose();
      resources.ridges.forEach((r) => { r.geometry.dispose(); r.material.dispose(); });
    };
  }, [resources, treeCount]);
  useFrame(() => {
    if (!running) return;
    const date = new Date(), solar = solarTime(date.getHours() + date.getMinutes() / 60);
    resources.ridges.forEach((r, i) => r.material.color.copy(resources.night[i]).lerp(resources.day[i], solar.daylight).lerp(resources.dusk, solar.golden * .45));
  });
  return <>
    {resources.ridges.map((r, i) => <mesh key={i} geometry={r.geometry} material={r.material} renderOrder={-10 - i} />)}
    <instancedMesh ref={trees} args={[resources.canopy, undefined, treeCount * lobes]}><meshLambertMaterial color="#456050" /></instancedMesh>
    <instancedMesh ref={trunks} args={[undefined, undefined, treeCount]}><cylinderGeometry args={[.065, .12, 1.4, 5]} /><meshLambertMaterial color="#454b42" /></instancedMesh>
  </>;
}

interface DialLight {
  angle: number; length: number; endLength: number; span: number; opacity: number;
  color: string;
}

function createDial(small: boolean) {
  const base = document.createElement("canvas"); base.width = base.height = 1024;
  const c = base.getContext("2d")!;
  const wash = c.createRadialGradient(400, 300, 30, 512, 512, 660);
  wash.addColorStop(0, "#cfc3a5"); wash.addColorStop(1, "#aaa387");
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
    const roman = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
    // Major incisions have a pale lower lip, like shallow cuts in limestone.
    if (hour % 2 === 0) {
      const text = roman[hour % 12], tx = 512 + x * 425, ty = 512 + y * 425;
      c.fillStyle = "#f3e6c286"; c.fillText(text, tx + 1, ty + 2);
      c.fillStyle = "#555143"; c.fillText(text, tx, ty);
    }
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
  function draw(light?: DialLight) {
    ink.drawImage(base, 0, 0);
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
  const state = useRef({ opacity: 0, span: 0, painted: "" });
  const resources = useMemo(() => {
    const dial = createDial(small), texture = mineralTexture(small);
    const base = dialBaseGeometry(4.65, .62, 4.3, 108, small); base.translate(0, .2, DIAL_Z);
    const foot = dialBaseGeometry(2.55, .5, 2.3, 71, small); foot.translate(0, 0, DIAL_Z);
    const gnomon = new THREE.CylinderGeometry(.035, .17, 1.22, 16, 1); gnomon.translate(0, .61, 0);
    const rim = new THREE.CylinderGeometry(2.1, 2.2, .6, 64);
    const rimUV = rim.getAttribute("uv");
    for (let i = 0; i < rimUV.count; i++) rimUV.setXY(i, rimUV.getX(i) * 8, rimUV.getY(i) * .6);
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
    const shadowGeometry = new THREE.BufferGeometry();
    shadowGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-.16, 0, 0, .16, 0, 0, .035, 0, -1, -.035, 0, -1], 3));
    shadowGeometry.setIndex([0, 1, 2, 0, 2, 3]); shadowGeometry.computeVertexNormals();
    return { dial, texture, base, foot, gnomon, rim, face, arc, shadowGeometry, accent: new THREE.Color() };
  }, [small]);
  const live = useRef<typeof resources | null>(null);
  useEffect(() => {
    live.current = resources;
    state.current.painted = ""; resources.dial.draw();
    return () => {
      live.current = null;
      resources.dial.texture.dispose(); resources.texture.userData.roughness?.dispose(); resources.texture.dispose(); resources.base.dispose(); resources.foot.dispose();
      resources.gnomon.dispose(); resources.rim.dispose(); resources.face.dispose(); resources.arc.dispose(); resources.shadowGeometry.dispose();
    };
  }, [resources]);
  useFrame((_, delta) => {
    const resources = live.current;
    if (!running || !resources) return;
    const now = Date.now(), date = new Date(now);
    const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const solar = solarTime(hours), end = solarTime(hours + (active?.duration_minutes ?? 0) / 60);
    const dt = Math.min(delta, .1), s = state.current;
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
    const paint = `${Math.floor(now / 1000)}/${s.span.toFixed(3)}/${s.opacity.toFixed(2)}/${uniforms.uColor.value.getHexString()}`;
    if (small && paint !== s.painted) {
      resources.dial.draw({
        angle: solar.angle, length: Math.min(1.22 / solar.elevation, 1.96), endLength: Math.min(1.22 / end.elevation, 1.96),
        span: s.span, opacity: s.opacity, color: uniforms.uColor.value.getStyle(),
      });
      s.painted = paint;
    }
  });
  return <>
    <mesh geometry={resources.foot} customDepthMaterial={depth} castShadow={!small} receiveShadow={!small}><StoneMaterial small={small} map={resources.texture} color="#b8bba9" vertexColors /></mesh>
    <mesh geometry={resources.base} customDepthMaterial={depth} castShadow={!small} receiveShadow={!small}><StoneMaterial small={small} map={resources.texture} color="#ded5bf" vertexColors /></mesh>
    <mesh geometry={resources.rim} position={[0, .95, DIAL_Z]} customDepthMaterial={depth} castShadow={!small} receiveShadow={!small}><StoneMaterial small={small} map={resources.texture} color="#c8c6b1" bumpScale={.025} /></mesh>
    <mesh geometry={resources.face} position={[0, DIAL_Y, DIAL_Z]} rotation={[-Math.PI / 2, 0, 0]}><StoneMaterial small={small} map={resources.dial.texture} bumpScale={0} /></mesh>
    <mesh geometry={resources.gnomon} customDepthMaterial={depth} position={[0, DIAL_Y + .006, DIAL_Z]} rotation={[0, .3, 0]} castShadow={!small}><StoneMaterial small={small} color="#a5ad9b" map={resources.texture} bumpScale={0} /></mesh>
    {!small && <group>
    <mesh ref={shadow} geometry={resources.shadowGeometry} position={[0, DIAL_Y + .008, DIAL_Z]}><meshBasicMaterial color="#293d33" transparent opacity={.58} depthWrite={false} /></mesh>
    <mesh position={[0, DIAL_Y + .016, DIAL_Z]} rotation={[-Math.PI / 2, 0, 0]} material={resources.arc}><circleGeometry args={[2.02, 64]} /></mesh>
    <mesh ref={ghost} geometry={resources.shadowGeometry} position={[0, DIAL_Y + .021, DIAL_Z]}><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    </group>}
  </>;
}

const skyVertex = `varying vec3 vDirection; void main() { vDirection = (modelMatrix * vec4(position, 1.)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const skyFragment = `
  varying vec3 vDirection;
  uniform vec3 uTop, uMiddle, uHorizon, uSun, uMoon, uVeil;
  uniform vec2 uResolution;
  uniform float uDay, uGolden;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDirection);
    float h = max(d.y, 0.);
    // The phone camera sees a shallower strip of sky: bring indigo closer to
    // the night horizon while preserving the established daytime gradient.
    vec3 color = mix(uHorizon, uMiddle, smoothstep(-.035, mix(.07,.18,uDay), h));
    color = mix(color, uTop, smoothstep(mix(.015,.04,uDay), mix(.13,.3,uDay), h));
    float alignment = max(dot(d, normalize(uSun)), 0.);
    color += vec3(1.,.49,.19) * pow(alignment, 12.) * (.025 + uGolden * .2) * uDay;
    float sunDisc = smoothstep(.99980, .99987, alignment) * uDay;
    color = mix(color, vec3(3.,1.9,.85), sunDisc);
    float cloud = sin(d.x * 21. + d.z * 11. + sin(d.z * 31.) * .8) * sin(d.z * 53. + d.x * 16.);
    float wisps = smoothstep(.15, .95, cloud) * exp(-pow((d.y - .12 - sin(d.x * 8.) * .018) * 12., 2.));
    color = mix(color, uHorizon * 1.12, wisps * (.11 + uGolden * .1) * uDay);
    vec2 starUV = vec2(atan(d.z,d.x) * 215., asin(d.y) * 240.);
    float star = step(.981, hash(vec3(floor(starUV),2.))) * (1.-smoothstep(.025,.21,length(fract(starUV)-.5)));
    color += vec3(.65,.78,1.) * star * (1. - uDay) * smoothstep(.015, .1, d.y) * .8;
    // A shaded lunar sphere in the sky shader: no bloom pass, disc sprite or
    // texture request. The two broad lobes give its glow a soft atmospheric halo.
    vec3 moon = normalize(uMoon), right = normalize(cross(vec3(0.,1.,0.), moon));
    vec3 up = cross(moon, right);
    vec2 m = vec2(dot(d,right), dot(d,up)) / .018;
    float r = length(m), facing = max(dot(d,moon),0.);
    float halo = pow(facing, 2200.) * .28 + pow(facing, 350.) * .045;
    color += vec3(.47,.62,1.) * halo * (1. - uDay);
    if (r < 1.02 && facing > .99) {
      float sphere = sqrt(max(0.,1.-r*r));
      float shade = .42 + .58 * max(dot(vec3(m,sphere),normalize(vec3(-.6,.35,.8))),0.);
      float maria = .96 - .24 * exp(-dot(m-vec2(-.32,.26),m-vec2(-.32,.26))*12.);
      maria -= .19 * exp(-dot(m-vec2(.27,.43),m-vec2(.27,.43))*20.);
      maria -= .14 * exp(-dot(m-vec2(.4,-.23),m-vec2(.4,-.23))*25.);
      maria += (hash(vec3(floor(m*65.),7.))-.5)*.04;
      vec3 surface = vec3(1.25,1.34,1.5) * shade * maria;
      color = mix(color,surface,(1.-smoothstep(.97,1.02,r))*(1.-uDay));
    }
    // Retain the daytime haze; night wordmark contrast is handled in CSS.
    vec2 screen = gl_FragCoord.xy / uResolution;
    float veil = exp(-pow((screen.x-.09)/.32,2.)-pow((screen.y-.97)/.24,2.));
    color = mix(color,uVeil,veil * .30 * uDay);
    gl_FragColor = vec4(color, 1.);
    #include <colorspace_fragment>
  }
`;

// A few feathered light shafts sit in the enclosure, aligned to the same sun.
// Phones omit both these transparent layers and the ground mist.
function LightShafts({ running }: { running: boolean }) {
  const group = useRef<THREE.Group>(null);
  const resources = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color("#ffce8a") } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv; uniform float uOpacity; uniform vec3 uColor; void main(){
        float width=mix(.47,.12,vUv.y); float edge=1.-smoothstep(width*.15,width,abs(vUv.x-.5));
        float fade=sin(vUv.y*3.14159); gl_FragColor=vec4(uColor,edge*fade*fade*uOpacity);
      }`,
    });
    return { material };
  }, []);
  const live = useRef<typeof resources | null>(null);
  useEffect(() => { live.current = resources; return () => { live.current = null; resources.material.dispose(); }; }, [resources]);
  useFrame(() => {
    const resources = live.current;
    if (!running || !resources) return;
    const d = new Date(), solar = solarTime(d.getHours() + d.getMinutes() / 60);
    resources.material.uniforms.uOpacity.value = solar.golden * .14;
    if (group.current) { group.current.rotation.y = -solar.angle; group.current.visible = solar.golden > .015; }
  });
  return <group ref={group}>
    {[-2.3, .7, 3.1].map((x, i) => <mesh key={i} material={resources.material} position={[x, 1.7, i * 1.1 - 1]} rotation={[-.9, 0, -.2]}><planeGeometry args={[1.6, 8]} /></mesh>)}
  </group>;
}

function Atmosphere({ running, reduced, small }: SceneContentProps) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const art = gl.domElement.closest<HTMLElement>('[data-scene="solstice"]');
    if (!art) return;
    const update = () => {
      const date = new Date(), solar = solarTime(date.getHours() + date.getMinutes() / 60);
      art.dataset.night = String(solar.daylight < .25);
    };
    update();
    const timer = running ? setInterval(update, 1000) : undefined;
    return () => { clearInterval(timer); delete art.dataset.night; };
  }, [gl, running]);
  const light = useRef<THREE.DirectionalLight>(null), fill = useRef<THREE.HemisphereLight>(null), rim = useRef<THREE.DirectionalLight>(null), bounce = useRef<THREE.DirectionalLight>(null);
  const fog = useRef<THREE.Fog>(null), seeds = useRef<THREE.Points>(null);
  const elapsed = useRef(0);
  const resources = useMemo(() => {
    const sky = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, vertexShader: skyVertex, fragmentShader: skyFragment,
      uniforms: {
        uTop: { value: new THREE.Color() }, uMiddle: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3(-.24, .19, -.95) },
        uVeil: { value: new THREE.Color() }, uResolution: { value: new THREE.Vector2(1, 1) },
        uDay: { value: 1 }, uGolden: { value: 0 },
      },
    });
    const mist = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color() } },
      vertexShader: `varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime,uOpacity; uniform vec3 uColor; void main() {
        vec2 p=(vUv-.5)*2.; float r=length(p);
        float wisps=.5+.5*sin(p.x*17.+p.y*11.+sin(p.y*9.+uTime*.05)*2.);
        float a=smoothstep(.15,.3,r)*(1.-smoothstep(.5,1.,r))*(.045+wisps*.1)*uOpacity;
        gl_FragColor=vec4(uColor,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const particles = new THREE.BufferGeometry(), positions: number[] = [];
    for (let i = 0; i < 32; i++) positions.push((noise(i * 3 + 9) - .5) * 18, .5 + noise(i * 7) * 3.2, (noise(i * 17) - .5) * 14);
    particles.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const palette = {
      night: ["#090d28", "#1b2549", "#7b8d9f"],
      dawn: ["#655d9d", "#d295b4", "#f3bb94"],
      day: ["#17558e", "#6ca5cf", "#d6e1e7"],
      golden: ["#524f91", "#c88a8e", "#f7b269"],
    };
    return {
      sky, mist, particles, palette: Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, v.map((c) => new THREE.Color(c))])),
      warm: new THREE.Color("#ffbd78"), dayKey: new THREE.Color("#ffe0ac"), cool: new THREE.Color("#adc9ff"),
      nightFill: new THREE.Color("#769bd1"), dayFill: new THREE.Color("#9cbeee"),
      nightGround: new THREE.Color("#28334c"), dayGround: new THREE.Color("#656843"),
      veilDay: new THREE.Color("#c2d9e8"), veilNight: new THREE.Color("#abb8d0"), veilDawn: new THREE.Color("#e0c4d2"),
    };
  }, []);
  const live = useRef<typeof resources | null>(null);
  useEffect(() => {
    live.current = resources;
    return () => { live.current = null; resources.sky.dispose(); resources.mist.dispose(); resources.particles.dispose(); };
  }, [resources]);
  useFrame(({ size }, delta) => {
    const resources = live.current;
    if (!running || !resources) return;
    const date = new Date(), hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const solar = solarTime(hours), u = resources.sky.uniforms;
    elapsed.current += Math.min(delta, .1);
    const sunset = hours > 12;
    const twilight = solar.golden;
    for (const [i, key] of ["uTop", "uMiddle", "uHorizon"].entries()) {
      u[key].value.copy(resources.palette.night[i]).lerp(resources.palette.day[i], solar.daylight)
        .lerp(resources.palette[sunset ? "golden" : "dawn"][i], Math.min(1, twilight * 1.85));
    }
    const sun = u.uSun.value as THREE.Vector3;
    sun.set(-Math.sin(solar.angle) * 28, solar.elevation * 28, Math.cos(solar.angle) * 28);
    u.uDay.value = solar.daylight; u.uGolden.value = twilight;
    u.uResolution.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
    u.uVeil.value.copy(resources.veilNight).lerp(resources.veilDay, solar.daylight).lerp(resources.veilDawn, twilight);
    if (light.current) {
      light.current.position.copy(sun);
      // Moonlight has its own sensible height, while azimuth and the dial keep
      // ticking through the night. Day shadows always share the capped sun.
      if (solar.daylight < .01) light.current.position.set(-12, 18, -24);
      light.current.intensity = THREE.MathUtils.lerp(1.5, 3.6, solar.daylight);
      light.current.color.copy(resources.cool).lerp(resources.dayKey, solar.daylight).lerp(resources.warm, twilight);
    }
    if (fill.current) {
      fill.current.intensity = THREE.MathUtils.lerp(1.15, 1.02, solar.daylight);
      fill.current.color.copy(resources.nightFill).lerp(resources.dayFill, solar.daylight);
      fill.current.groundColor.copy(resources.nightGround).lerp(resources.dayGround, solar.daylight);
    }
    if (bounce.current) bounce.current.intensity = THREE.MathUtils.lerp(.95, .3, solar.daylight);
    if (rim.current) rim.current.intensity = THREE.MathUtils.lerp(.7, 1.35, solar.daylight);
    if (fog.current) fog.current.color.copy(u.uHorizon.value);
    resources.mist.uniforms.uColor.value.copy(u.uHorizon.value);
    resources.mist.uniforms.uOpacity.value = twilight * 1.4 + (1 - solar.daylight) * .16;
    if (!reduced) {
      resources.mist.uniforms.uTime.value = elapsed.current;
      if (seeds.current) { seeds.current.rotation.y = Math.sin(elapsed.current * .035) * .12; seeds.current.position.y = Math.sin(elapsed.current * .15) * .12; }
    }
  });
  return <>
    <mesh material={resources.sky} renderOrder={-100}><sphereGeometry args={[180, 32, 20]} /></mesh>
    <fog ref={fog} attach="fog" args={["#d6e1e7", 26, 125]} />
    <hemisphereLight ref={fill} args={["#9cbeee", "#656843", 1]} />
    <directionalLight ref={light} position={[-20, 15, 10]} intensity={3.6} castShadow={!small} shadow-mapSize={[1536, 1536]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-camera-near={.5} shadow-camera-far={85} shadow-bias={-.00025} shadow-normalBias={.035} shadow-radius={2} />
    <directionalLight ref={bounce} position={[8, 6, 14]} intensity={.3} color="#aabfe4" />
    <directionalLight ref={rim} position={[-7, 8, -10]} intensity={1.35} color="#c7dbff" />
    {!small && <>
      <LightShafts running={running} />
      <mesh material={resources.mist} position={[0, .27, -1]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[58, 58]} /></mesh>
      <mesh material={resources.mist} position={[0, .65, -11]} rotation={[-Math.PI / 2 + .045, 0, .3]}><planeGeometry args={[70, 42]} /></mesh>
      <points ref={seeds} geometry={resources.particles}><pointsMaterial color="#eeddb0" size={.025} transparent opacity={.5} depthWrite={false} sizeAttenuation /></points>
    </>}
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
    <Landscape running={props.running} small={props.small} />
    <Stones small={props.small} depth={depth} />
    <Sundial {...props} depth={depth} />
  </>;
}
