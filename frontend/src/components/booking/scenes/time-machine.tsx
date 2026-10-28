"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneContentProps } from "./types";

type Point = [number, number, number];
type Transform = { position: Point; scale?: Point; rotation?: Point };
const TAU = Math.PI * 2;
const noise = (n: number) => (Math.sin(n * 127.1 + 19.7) * 43758.5453 % 1 + 1) % 1;

function canvas(width: number, height = width) {
  const image = document.createElement("canvas"); image.width = width; image.height = height;
  // CPU-backed canvases avoid a synchronous GPU-to-GPU readback when Three
  // uploads the procedural pigment, especially under software rendering.
  return { image, c: image.getContext("2d", { willReadFrequently: true })! };
}

function texture(image: HTMLCanvasElement) {
  const map = new THREE.CanvasTexture(image);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return map;
}

function reflectionTexture(brass: boolean) {
  const { image, c } = canvas(256);
  const field = c.createRadialGradient(91, 71, 9, 128, 128, 167);
  field.addColorStop(0, brass ? "#ffedb7" : "#fff5e0");
  field.addColorStop(.3, brass ? "#d7a752" : "#d8cdb8");
  field.addColorStop(.65, brass ? "#775026" : "#807d72");
  field.addColorStop(1, brass ? "#2d1c10" : "#3e4244");
  c.fillStyle = field; c.fillRect(0, 0, 256, 256);
  const lamp = c.createRadialGradient(65, 90, 2, 65, 90, 44);
  lamp.addColorStop(0, "#fff4d9"); lamp.addColorStop(.18, "#fff1cfb0"); lamp.addColorStop(1, "#fff1cf00");
  c.fillStyle = lamp; c.fillRect(0, 0, 256, 256);
  return texture(image);
}

// Phone metal, wood, ivory and crystal share this short shader and its
// instanced variant, instead of compiling separate PBR/light variants.
function phoneMaterial(color: string, reflection: THREE.Texture, white: THREE.Texture, map = white, opacity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(color) }, reflection: { value: reflection }, surface: { value: map }, alpha: { value: opacity } },
    transparent: opacity < 1,
    vertexShader: `
      varying vec2 texcoord;
      varying vec3 viewDirection;
      varying vec3 surfaceNormal;
      void main() {
        vec3 p = position;
        vec3 n = normal;
        #ifdef USE_INSTANCING
          p = (instanceMatrix * vec4(p, 1.)).xyz;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 viewPosition = modelViewMatrix * vec4(p, 1.);
        surfaceNormal = normalize(normalMatrix * n);
        viewDirection = -viewPosition.xyz;
        texcoord = uv;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      uniform sampler2D reflection;
      uniform sampler2D surface;
      uniform float alpha;
      varying vec2 texcoord;
      varying vec3 viewDirection;
      varying vec3 surfaceNormal;
      void main() {
        vec3 view = normalize(viewDirection);
        vec3 normal = normalize(surfaceNormal);
        vec3 x = normalize(vec3(view.z, 0., -view.x));
        vec3 y = cross(view, x);
        vec2 matcap = vec2(dot(x, normal), dot(y, normal)) * .495 + .5;
        vec4 pigment = texture2D(surface, texcoord);
        gl_FragColor = vec4(tint * pigment.rgb * texture2D(reflection, matcap).rgb, alpha * pigment.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// Painted lamp/window reflections avoid an environment map, render targets,
// postprocessing, and the extra pass required by transmissive glass.
function polishedBrass(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
    vec3 reflected = inverseTransformDirection(reflect(-geometryViewDir, normal), viewMatrix);
    float upper = smoothstep(-.4, .8, reflected.y);
    float lamp = pow(max(dot(reflected, normalize(vec3(-.6,.7,.7))), 0.), 24.);
    float windowLight = pow(max(dot(reflected, normalize(vec3(1.,.5,-.6))), 0.), 18.);
    outgoingLight += mix(vec3(.045,.018,.006), vec3(.24,.15,.065), upper);
    outgoingLight += vec3(.9,.55,.19) * lamp + vec3(.23,.32,.39) * windowLight;
    #include <opaque_fragment>
  `);
}

function woodTexture() {
  const { image, c } = canvas(256, 512);
  c.fillStyle = "#56301d"; c.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 850; i++) {
    const x = noise(i) * 256;
    c.strokeStyle = i % 3 ? "#1b0c0730" : "#e0a66516"; c.lineWidth = .35 + noise(i + 500) * 1.7;
    c.beginPath(); c.moveTo(x, 0);
    c.bezierCurveTo(x + 8 * Math.sin(i), 160, x - 6 * Math.sin(i), 330, x + Math.sin(i * 3) * 4, 512); c.stroke();
  }
  const map = texture(image); map.wrapS = map.wrapT = THREE.RepeatWrapping; return map;
}

function wallpaperTexture() {
  const { image, c } = canvas(256);
  c.fillStyle = "#152d2b"; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = "#77917d18"; c.lineWidth = 1;
  for (const x of [0, 128, 256]) {
    c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 52, 60, x - 52, 68, x, 128);
    c.bezierCurveTo(x + 52, 188, x - 52, 196, x, 256); c.stroke();
    for (const y of [40, 168]) {
      c.beginPath(); c.ellipse(x + 10, y, 8, 22, -.5, 0, TAU); c.stroke();
      c.beginPath(); c.ellipse(x - 10, y + 48, 8, 22, .5, 0, TAU); c.stroke();
    }
  }
  const map = texture(image); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(20, 7.5); return map;
}

function rugTexture() {
  const { image, c } = canvas(1024, 768);
  c.fillStyle = "#602d2b"; c.fillRect(0, 0, 1024, 768);
  const diamond = (x: number, y: number, w: number, h: number, fill: string) => {
    c.fillStyle = fill; c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w, y);
    c.lineTo(x, y + h); c.lineTo(x - w, y); c.closePath(); c.fill();
  };
  for (const [inset, color, weight] of [[22, "#c39659", 5], [37, "#202f30", 17], [62, "#b48c59", 3], [91, "#c89c60", 4]] as const) {
    c.strokeStyle = color; c.lineWidth = weight; c.strokeRect(inset, inset, 1024 - inset * 2, 768 - inset * 2);
  }
  for (let x = 66; x < 1000; x += 44) { diamond(x, 68, 9, 15, "#c7a16b"); diamond(x, 700, 9, 15, "#c7a16b"); }
  for (let y = 110; y < 680; y += 44) { diamond(68, y, 15, 9, "#c7a16b"); diamond(956, y, 15, 9, "#c7a16b"); }
  for (let row = 0; row < 7; row++) for (let col = 0; col < 12; col++) {
    const x = 126 + col * 70, y = 135 + row * 82;
    diamond(x, y, 12, 21, "#b68c5660"); diamond(x, y, 5, 10, "#243a36");
    c.fillStyle = "#bb8b55"; c.fillRect(x - 2, y - 29, 4, 5); c.fillRect(x - 2, y + 24, 4, 5);
  }
  diamond(512, 384, 220, 265, "#bd9056"); diamond(512, 384, 203, 246, "#283c39");
  diamond(512, 384, 174, 213, "#ba8857"); diamond(512, 384, 160, 195, "#60362c");
  diamond(512, 384, 107, 140, "#c0a06b"); diamond(512, 384, 89, 116, "#293c39"); diamond(512, 384, 37, 57, "#a67446");
  for (let i = 0; i < 16000; i++) {
    c.fillStyle = i % 2 ? "#130e0920" : "#f8dfad0c"; c.fillRect(noise(i) * 1024, noise(i + 610) * 768, 1, 2);
  }
  return texture(image);
}

function wheelTexture() {
  const { image, c } = canvas(1024);
  const glow = c.createRadialGradient(355, 270, 20, 512, 512, 650);
  glow.addColorStop(0, "#efcc82"); glow.addColorStop(.43, "#bd8a42"); glow.addColorStop(.8, "#98703c"); glow.addColorStop(1, "#61431e");
  c.fillStyle = glow; c.fillRect(0, 0, 1024, 1024); c.translate(512, 512);
  for (let i = 0; i < 144; i++) {
    const a = i / 144 * TAU;
    c.strokeStyle = i % 6 ? "#59391450" : "#fff1bd90"; c.lineWidth = i % 6 ? 1 : 2;
    c.beginPath(); c.moveTo(Math.cos(a) * 102, Math.sin(a) * 102);
    c.lineTo(Math.cos(a) * (i % 6 ? 410 : 440), Math.sin(a) * (i % 6 ? 410 : 440)); c.stroke();
  }
  for (const r of [96, 104, 118, 290, 297, 405, 414, 440, 452, 475, 484]) {
    c.strokeStyle = "#624219"; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    c.strokeStyle = "#f6dca18a"; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r + 3, 0, TAU); c.stroke();
  }
  for (let i = 0; i < 24; i++) {
    c.save(); c.rotate(i / 24 * TAU); c.translate(0, -351); c.strokeStyle = "#69481f"; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 0, 20, 44, 0, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(0, -30); c.lineTo(8, 0); c.lineTo(0, 30); c.lineTo(-8, 0); c.closePath(); c.stroke(); c.restore();
  }
  return texture(image);
}

type DialKind = "hours" | "days" | "thousands" | "millions";
function makeDial(kind: DialKind) {
  const size = kind === "hours" || kind === "days" ? 512 : 256;
  const base = canvas(size), live = canvas(size), c = base.c;
  c.scale(size / 512, size / 512);
  const enamel = c.createRadialGradient(204, 160, 15, 256, 256, 260);
  enamel.addColorStop(0, "#fff7dc"); enamel.addColorStop(.8, "#e8dbba"); enamel.addColorStop(1, "#bda47a");
  c.fillStyle = enamel; c.fillRect(0, 0, 512, 512);
  for (const r of [232, 224, 202]) {
    c.strokeStyle = r === 202 ? "#b3a07e" : "#736144"; c.lineWidth = 1;
    c.beginPath(); c.arc(256, 256, r, 0, TAU); c.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * TAU, r = i % 5 ? 213 : 205;
    c.strokeStyle = "#514939"; c.lineWidth = i % 5 ? 1.3 : 2.8;
    c.beginPath(); c.moveTo(256 + Math.sin(a) * r, 256 - Math.cos(a) * r);
    c.lineTo(256 + Math.sin(a) * 221, 256 - Math.cos(a) * 221); c.stroke();
  }
  c.fillStyle = "#453b2e"; c.textAlign = "center"; c.textBaseline = "middle";
  if (kind === "hours") {
    c.font = "27px Georgia, serif";
    ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"].forEach((n, i) => {
      const a = i / 12 * TAU; c.fillText(n, 256 + Math.sin(a) * 177, 256 - Math.cos(a) * 177);
    });
    c.font = "13px Georgia, serif"; c.fillText("LOCAL HOURS", 256, 150);
  } else if (kind === "days") {
    c.font = "23px Georgia, serif"; c.fillText("DAYS", 256, 128);
    c.font = "12px Georgia, serif"; c.fillText("THE PRESENT", 256, 369);
  } else {
    c.font = "26px Georgia, serif"; c.fillText(kind === "thousands" ? "THOUSANDS" : "MILLIONS", 256, 296);
    c.font = "20px Georgia, serif"; c.fillText("OF DAYS", 256, 334);
    c.font = "30px Georgia, serif"; c.fillText("0", 256, 116); c.fillText("5", 398, 260); c.fillText("10", 256, 405);
    c.strokeStyle = "#473e2e"; c.lineWidth = 7; c.beginPath(); c.moveTo(256, 256); c.lineTo(185, 165); c.stroke();
    c.fillStyle = "#8f642e"; c.beginPath(); c.arc(256, 256, 12, 0, TAU); c.fill();
  }
  const map = texture(live.image);
  const draw = (now: Date, minutes: number, strength: number, accent: string, duration: number) => {
    const ink = live.c; ink.clearRect(0, 0, size, size); ink.drawImage(base.image, 0, 0);
    ink.save(); ink.scale(size / 512, size / 512); ink.textAlign = "center"; ink.textBaseline = "middle";
    if (kind === "days") {
      ink.fillStyle = "#3f392f"; ink.font = "100px Georgia, serif"; ink.fillText(String(now.getDate()).padStart(2, "0"), 256, 236);
      ink.font = "27px Georgia, serif"; ink.fillText(now.toLocaleDateString("en", { month: "short", year: "numeric" }).toUpperCase(), 256, 316);
      ink.font = "18px Georgia, serif"; ink.fillText(now.toLocaleDateString("en", { weekday: "long" }).toUpperCase(), 256, 174);
    } else if (kind === "hours") {
      const realMinutes = now.getMinutes() + now.getSeconds() / 60;
      const hand = (angle: number, length: number, width: number, color: string) => {
        ink.save(); ink.translate(256, 256); ink.rotate(angle); ink.fillStyle = color;
        ink.beginPath(); ink.moveTo(0, -length); ink.lineTo(width, -length * .62); ink.lineTo(width * .45, 23);
        ink.lineTo(-width * .45, 23); ink.lineTo(-width, -length * .62); ink.closePath(); ink.fill(); ink.restore();
      };
      if (strength > .002) {
        ink.globalAlpha = strength * .8; ink.strokeStyle = accent; ink.lineWidth = 12; ink.lineCap = "round";
        const start = realMinutes / 60 * TAU - Math.PI / 2;
        ink.beginPath(); ink.arc(256, 256, 239, start, start + Math.min(minutes / 60, 1) * TAU); ink.stroke();
        ink.globalAlpha = strength * .3; hand(realMinutes / 60 * TAU, 158, 5, "#473e2e"); ink.globalAlpha = 1;
      }
      const shifted = realMinutes + minutes;
      hand((now.getHours() % 12 + shifted / 60) / 12 * TAU, 104, 9, "#3a342c");
      hand(shifted / 60 * TAU, 158, 6, "#3a342c");
      ink.fillStyle = "#a27438"; ink.beginPath(); ink.arc(256, 256, 12, 0, TAU); ink.fill();
      // Actual local time remains legible even while the hands take a trip.
      ink.fillStyle = "#41392c"; ink.font = "29px Georgia, serif";
      ink.fillText(`${String(now.getHours() % 12 || 12).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, 256, 333);
      ink.font = "12px Georgia, serif"; ink.fillText(now.getHours() < 12 ? "A.M. · LOCAL TIME" : "P.M. · LOCAL TIME", 256, 363);
      if (strength > .002) {
        ink.globalAlpha = strength; ink.fillStyle = accent; ink.font = "bold 23px Georgia, serif";
        ink.fillText(`+ ${duration} MIN`, 256, 405); ink.globalAlpha = 1;
      }
    }
    ink.restore(); map.needsUpdate = true;
  };
  live.c.drawImage(base.image, 0, 0); return { map, draw };
}

function Tube({ points, radius = .045, material, small }: { points: Point[]; radius?: number; material: THREE.Material; small: boolean }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), small ? 20 : 36, radius, small ? 6 : 8, false), [points, radius, small]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} castShadow />;
}

function Rod({ from, to, radius = .04, material }: { from: Point; to: Point; radius?: number; material: THREE.Material }) {
  const pose = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a);
    return { center: a.add(b).multiplyScalar(.5), rotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), length: d.length() };
  }, [from, to]);
  return <mesh position={pose.center} quaternion={pose.rotation} material={material} castShadow><cylinderGeometry args={[radius, radius, pose.length, 8]} /></mesh>;
}

function Copies({ transforms, geometry, material }: { transforms: Transform[]; geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D();
    transforms.forEach((item, i) => {
      object.position.set(...item.position); object.scale.set(...(item.scale ?? [1, 1, 1])); object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.updateMatrix(); mesh.current!.setMatrixAt(i, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [transforms]);
  return <instancedMesh ref={mesh} args={[geometry, material, transforms.length]} receiveShadow />;
}

function quartzGeometry() {
  const geometry = new THREE.CylinderGeometry(.105, .12, 1.17, 6, 9, false), p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = y * 1.3, taper = 1 - .45 * Math.pow(Math.abs(y) / .585, 8);
    p.setXYZ(i, (x * Math.cos(a) - z * Math.sin(a)) * taper, y, (x * Math.sin(a) + z * Math.cos(a)) * taper);
  }
  geometry.computeVertexNormals(); return geometry;
}

// Bake stationary phone meshes into material batches. Moving groups get their
// own local batches, so orbiting, clock hands and the lever remain fully 3D.
function batchMeshes(root: THREE.Group, exclude: Set<THREE.Object3D>) {
  const originals: THREE.Mesh[] = [], batches: THREE.Mesh[] = [];
  const buckets = new Map<THREE.Material, { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }>();
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), transform = new THREE.Matrix4(), normalTransform = new THREE.Matrix3();
  const vertex = new THREE.Vector3(), normal = new THREE.Vector3();
  const collect = (object: THREE.Object3D) => {
    if (exclude.has(object)) return;
    if (object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh) && !Array.isArray(object.material)) {
      const source = object.geometry, position = source.getAttribute("position"), n = source.getAttribute("normal"), uv = source.getAttribute("uv");
      if (!position || !n || !uv) return;
      let bucket = buckets.get(object.material);
      if (!bucket) { bucket = { positions: [], normals: [], uvs: [], indices: [] }; buckets.set(object.material, bucket); }
      const offset = bucket.positions.length / 3;
      transform.multiplyMatrices(inverse, object.matrixWorld); normalTransform.getNormalMatrix(transform);
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(transform); normal.fromBufferAttribute(n, i).applyMatrix3(normalTransform).normalize();
        bucket.positions.push(vertex.x, vertex.y, vertex.z); bucket.normals.push(normal.x, normal.y, normal.z); bucket.uvs.push(uv.getX(i), uv.getY(i));
      }
      const index = source.getIndex();
      for (let i = 0; i < (index?.count ?? position.count); i++) bucket.indices.push(offset + (index ? index.getX(i) : i));
      object.visible = false; originals.push(object);
    }
    object.children.forEach(collect);
  };
  root.children.forEach(collect);
  buckets.forEach((data, material) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2)); geometry.setIndex(data.indices); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material); root.add(mesh); batches.push(mesh);
  });
  return () => { batches.forEach((mesh) => { root.remove(mesh); mesh.geometry.dispose(); }); originals.forEach((mesh) => { mesh.visible = true; }); };
}

const runners: Point[][] = [-.84, .84].map((x) => [[x, .48, -1.48], [x, .24, -1.21], [x, .22, .65], [x, .3, 1.47], [x, .68, 1.7]]);
const handrails: Point[][] = [-.59, .59].map((x) => [[x, .53, -.5], [x, 1.81, -.37], [x, 2.14, .12], [x, 1.95, .69], [x, .61, .96]]);

export default function TimeMachine({ active, running, reduced, small }: SceneContentProps) {
  const resources = useMemo(() => {
    const wood = woodTexture(), rug = rugTexture(), wheel = wheelTexture(), wallpaper = wallpaperTexture();
    // Phones use two tiny, canvas-painted reflection fields. They keep the
    // brass dimensional without compiling the desktop PBR/light variants.
    const metalReflection = reflectionTexture(true), softReflection = reflectionTexture(false);
    const blank = canvas(2); blank.c.fillStyle = "#fff"; blank.c.fillRect(0, 0, 2, 2); const white = texture(blank.image);
    const brass = small ? phoneMaterial("#ffffff", metalReflection, white) : new THREE.MeshStandardMaterial({ color: "#d6ad65", metalness: .76, roughness: .27 });
    const darkBrass = small ? phoneMaterial("#825a2c", softReflection, white) : new THREE.MeshStandardMaterial({ color: "#825a2c", metalness: .7, roughness: .37 });
    const ivory = small ? phoneMaterial("#e5d5af", softReflection, white) : new THREE.MeshStandardMaterial({ color: "#e5d5af", roughness: .35, metalness: .12 });
    const walnut = small ? phoneMaterial("#a48363", softReflection, white, wood) : new THREE.MeshStandardMaterial({ color: "#644831", map: wood, roughness: .48 });
    const leather = small ? phoneMaterial("#532421", softReflection, white) : new THREE.MeshStandardMaterial({ color: "#532421", roughness: .44, metalness: .06 });
    const crystal = small ? phoneMaterial("#c5dce1", softReflection, white, white, .76) : new THREE.MeshPhysicalMaterial({ color: "#c5dce1", roughness: .12, metalness: .2, clearcoat: 1, transparent: true, opacity: .76 });
    const enamel = small ? phoneMaterial("#eadabd", softReflection, white) : new THREE.MeshStandardMaterial({ color: "#eadabd", roughness: .7 });
    const wheelFace = small ? phoneMaterial("#ffffff", softReflection, white, wheel) : new THREE.MeshStandardMaterial({ map: wheel, metalness: .58, roughness: .34 });
    if (!small) brass.onBeforeCompile = darkBrass.onBeforeCompile = wheelFace.onBeforeCompile = polishedBrass;
    const hours = makeDial("hours"), days = makeDial("days"), thousands = makeDial("thousands"), millions = makeDial("millions");
    const quartz = quartzGeometry(), box = new THREE.BoxGeometry(1, 1, 1), rivet = new THREE.SphereGeometry(.033, small ? 6 : 8, 5);
    const saddle = new THREE.Shape();
    saddle.moveTo(-.4, -.38); saddle.bezierCurveTo(-.65, -.25, -.48, .16, -.22, .35);
    saddle.bezierCurveTo(-.13, .43, -.15, .68, 0, .71); saddle.bezierCurveTo(.15, .68, .13, .43, .22, .35);
    saddle.bezierCurveTo(.48, .16, .65, -.25, .4, -.38); saddle.quadraticCurveTo(0, -.52, -.4, -.38);
    const seat = new THREE.ExtrudeGeometry(saddle, { depth: .13, bevelEnabled: true, bevelSize: .045, bevelThickness: .035, bevelSegments: 2, curveSegments: small ? 8 : 14 });
    seat.rotateX(Math.PI / 2);
    const dust = new THREE.BufferGeometry(), positions = new Float32Array((small ? 24 : 54) * 3);
    for (let i = 0; i < positions.length / 3; i++) { positions[i * 3] = -2.8 + noise(i) * 5.2; positions[i * 3 + 1] = .7 + noise(i + 100) * 3.8; positions[i * 3 + 2] = -2 + noise(i + 300) * 4; }
    dust.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dustMaterial = new THREE.PointsMaterial({ color: "#ffdc9b", size: small ? .017 : .012, transparent: true, opacity: .28, depthWrite: false });
    const shimmer = new THREE.MeshBasicMaterial({ color: "#c9b6ef", transparent: true, opacity: 0, wireframe: true, depthWrite: false });
    const lampGlow = new THREE.MeshBasicMaterial({ color: "#ffdf9e", toneMapped: false });
    return { wood, rug, wheel, wallpaper, metalReflection, softReflection, white, brass, darkBrass, ivory, walnut, leather, crystal, enamel, wheelFace, hours, days, thousands, millions, quartz, box, rivet, seat, dust, dustMaterial, shimmer, lampGlow };
  }, [small]);
  useEffect(() => () => {
    resources.wood.dispose(); resources.rug.dispose(); resources.wheel.dispose(); resources.wallpaper.dispose();
    resources.metalReflection.dispose(); resources.softReflection.dispose(); resources.white.dispose();
    for (const dial of [resources.hours, resources.days, resources.thousands, resources.millions]) dial.map.dispose();
    for (const g of [resources.quartz, resources.box, resources.rivet, resources.seat, resources.dust]) g.dispose();
    for (const m of [resources.brass, resources.darkBrass, resources.ivory, resources.walnut, resources.leather, resources.crystal, resources.enamel, resources.wheelFace, resources.dustMaterial, resources.shimmer, resources.lampGlow]) m.dispose();
  }, [resources]);
  const wheel = useRef<THREE.Group>(null), lever = useRef<THREE.Group>(null), dust = useRef<THREE.Points>(null);
  const world = useRef<THREE.Group>(null);
  const aura = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>(null);
  const gas = useRef<THREE.PointLight>(null), fire = useRef<THREE.PointLight>(null), key = useRef<THREE.DirectionalLight>(null);
  const mantelHour = useRef<THREE.Group>(null), mantelMinute = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!small || !world.current || !wheel.current || !lever.current) return;
    const moving = new Set<THREE.Object3D>();
    for (const object of [wheel.current, lever.current, dust.current, aura.current, mantelHour.current, mantelMinute.current]) if (object) moving.add(object);
    const clean = [batchMeshes(world.current, moving), batchMeshes(wheel.current, new Set()), batchMeshes(lever.current, new Set())];
    return () => clean.forEach((dispose) => dispose());
  }, [small, resources]);
  const animation = useRef({ elapsed: 0, hover: 0, minutes: 0, lastPaint: -1, lastDate: "", duration: 0, accent: "#a5c4bc", color: new THREE.Color("#a5c4bc"), target: new THREE.Color() });
  useFrame((_, delta) => {
    if (!running) return;
    const now = Date.now(), date = new Date(now), s = animation.current, dt = Math.min(delta, .1);
    s.elapsed += dt;
    const intro = reduced ? 1 : THREE.MathUtils.smoothstep(s.elapsed, 0, 1.5), goal = active ? 1 : 0, duration = Math.max(0, active?.duration_minutes ?? 0);
    s.hover = reduced ? goal : THREE.MathUtils.damp(s.hover, goal, 4, dt);
    s.minutes = reduced ? duration : THREE.MathUtils.damp(s.minutes, duration, 3.5, dt);
    if (active) { s.duration = duration; s.accent = active.color; }
    s.target.set(s.accent); s.color.lerp(s.target, 1 - Math.exp(-dt * 4));
    if (wheel.current && !reduced) wheel.current.rotation.z -= dt * intro * (.032 + s.hover * .53);
    if (lever.current) lever.current.rotation.x = -.12 + s.hover * .63;
    if (dust.current && !reduced) { dust.current.position.y = Math.sin(s.elapsed * .15) * .12; dust.current.rotation.y = Math.sin(s.elapsed * .07) * .04; }
    if (gas.current) gas.current.intensity = (5 + 18 * intro) * (reduced ? 1 : 1 + Math.sin(s.elapsed * 1.7) * .015);
    if (fire.current) fire.current.intensity = (4 + 15 * intro) * (reduced ? 1 : 1 + Math.sin(s.elapsed * 2.6) * .05 + Math.sin(s.elapsed * 4.1) * .025);
    if (key.current) key.current.intensity = .8 + 2 * intro;
    resources.lampGlow.color.setRGB(1, .53 + .27 * intro, .24 + .27 * intro);
    if (aura.current) {
      aura.current.material.color.copy(s.color); aura.current.material.opacity = s.hover * .018;
      if (!reduced) aura.current.rotation.y = s.elapsed * .06;
    }
    if (mantelMinute.current) mantelMinute.current.rotation.z = -(date.getMinutes() + date.getSeconds() / 60) / 60 * TAU;
    if (mantelHour.current) mantelHour.current.rotation.z = -(date.getHours() % 12 + date.getMinutes() / 60) / 12 * TAU;
    // Stable clocks upload once a second; only a moving duration needs 10Hz.
    const colorChange = Math.abs(s.color.r - s.target.r) + Math.abs(s.color.g - s.target.g) + Math.abs(s.color.b - s.target.b);
    const moving = Math.abs(s.minutes - duration) > .02 || Math.abs(s.hover - goal) > .002 || colorChange > .002;
    const tick = Math.floor(now / (moving ? 100 : 1000));
    if (tick !== s.lastPaint) { resources.hours.draw(date, s.minutes, s.hover, `#${s.color.getHexString()}`, s.duration); s.lastPaint = tick; }
    const day = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (day !== s.lastDate) { resources.days.draw(date, 0, 0, "", 0); s.lastDate = day; }
  });
  const rivets = useMemo(() => Array.from({ length: small ? 36 : 48 }, (_, i) => ({ position: [Math.sin(i / (small ? 36 : 48) * TAU) * 1.43, Math.cos(i / (small ? 36 : 48) * TAU) * 1.43, .115] as Point })), [small]);
  const panelTrim = useMemo(() => {
    const items: Transform[] = [];
    for (let i = 0; i < 18; i++) {
      const x = -11.9 + i * 1.4; items.push({ position: [x, .96, -3.93], scale: [.045, 1.72, .05] });
      items.push({ position: [x + .1, .96, -3.92], scale: [.018, 1.48, .04] });
    }
    for (const y of [.14, .23, 1.7, 1.82, 5.5]) items.push({ position: [0, y, -3.9], scale: [24, .05, .09] });
    return items;
  }, []);
  const boards = useMemo(() => Array.from({ length: 24 }, (_, i) => ({ position: [-11.5 + i, -.045, 4] as Point, scale: [.985, .08, 24] as Point })), []);
  const books = useMemo(() => ["#53302c", "#24413d", "#6e5130", "#2c3547", "#7a402d"].map((color, category) => ({ color, positions: Array.from({ length: small ? 6 : 9 }, (_, i) => {
    const index = i * 5 + category, row = Math.floor(index / 15), column = index % 15, h = .42 + noise(index + 90) * .23;
    return { position: [2.39 + column * .134, 1.21 + row * .89 + h / 2, -3.44] as Point, scale: [.1 + noise(index) * .025, h, .3] as Point, rotation: [0, 0, (noise(index + 5) - .5) * .035] as Point };
  }) })), [small]);
  const segments = small ? 36 : 64;
  const dial = (map: THREE.Texture, x: number, y: number, radius: number) => <group key={x} position={[x, y, .087]}>
    <mesh material={resources.darkBrass} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[radius + .055, radius + .055, .095, segments]} /></mesh>
    <mesh position={[0, 0, .051]}><circleGeometry args={[radius, segments]} />{small ? <meshBasicMaterial map={map} /> : <meshStandardMaterial map={map} roughness={.56} emissive="#fff0d5" emissiveIntensity={.02} />}</mesh>
    <mesh position={[0, 0, .058]} material={resources.brass}><torusGeometry args={[radius + .015, .026, 6, segments]} /></mesh>
  </group>;

  return <>
    <color attach="background" args={["#141b1b"]} />
    <fog attach="fog" args={["#141b1b", 15, 33]} />
    <group ref={world}>
    <hemisphereLight args={["#b5c9df", "#6c4325", .48]} />
    <directionalLight ref={key} position={[-3, 6, 5]} intensity={.8} color="#ffd096" castShadow={!small} shadow-mapSize={[512, 512]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={5} shadow-camera-bottom={-3} shadow-camera-far={18} shadow-normalBias={.035} shadow-bias={-.0003} />
    <directionalLight position={[4, 5, -2]} color="#a7c9e3" intensity={1.7} />
    <directionalLight position={[1, 3, 7]} color="#ffdeb0" intensity={.5} />
    <pointLight ref={gas} position={[-2.3, 2.8, -.25]} color="#ffc16e" intensity={5} distance={11} decay={2} />
    <pointLight ref={fire} position={[-3.25, .9, -2.9]} color="#ff863b" intensity={4} distance={9} decay={2} />

    {/* A full room encloses every allowed orbit, including the front wall. */}
    <mesh position={[0, 4.88, 4]}><boxGeometry args={[24, 10, 26]} />{small ? <meshBasicMaterial color="#111b1a" side={THREE.BackSide} /> : <meshStandardMaterial color="#1d2927" side={THREE.BackSide} roughness={1} />}</mesh>
    <Copies transforms={boards} geometry={resources.box} material={resources.walnut} />
    <mesh position={[0, 4.5, -4.06]} receiveShadow><boxGeometry args={[24, 9, .18]} />{small ? <meshBasicMaterial map={resources.wallpaper} /> : <meshStandardMaterial map={resources.wallpaper} roughness={.96} />}</mesh>
    <mesh position={[0, .92, -4]} material={resources.walnut} receiveShadow><boxGeometry args={[24, 1.84, .15]} /></mesh>
    <Copies transforms={panelTrim} geometry={resources.box} material={resources.darkBrass} />
    {[-11.9, 11.9].map((x) => <group key={x} position={[x, 0, 2]}>
      <mesh position={[0, .9, 0]} material={resources.walnut}><boxGeometry args={[.16, 1.8, 12]} /></mesh>
      {[.17, 1.73, 1.84].map((y) => <mesh key={y} position={[-Math.sign(x) * .1, y, 0]} material={resources.darkBrass}><boxGeometry args={[.07, .045, 12]} /></mesh>)}
    </group>)}
    <mesh position={[0, .012, .05]} rotation={[-Math.PI / 2, 0, -.08]} receiveShadow><planeGeometry args={[5.5, 4.5]} />{small ? <meshBasicMaterial map={resources.rug} color="#b4a18b" /> : <meshStandardMaterial map={resources.rug} roughness={1} />}</mesh>

    <group position={[-.35, 3.5, -3.88]}>
      <mesh material={resources.walnut}><boxGeometry args={[2.02, 2.85, .14]} /></mesh>
      <mesh position={[0, 0, .08]}><planeGeometry args={[1.8, 2.63]} /><meshBasicMaterial color="#223643" /></mesh>
      <mesh position={[.52, .82, .09]}><circleGeometry args={[.14, 24]} /><meshBasicMaterial color="#8b9eaa" /></mesh>
      {[0, -.43].map((x) => <mesh key={x} position={[x, 0, .13]} material={resources.walnut}><boxGeometry args={[.045, 2.65, .09]} /></mesh>)}
      {[-.43, .44].map((y) => <mesh key={y} position={[0, y, .13]} material={resources.walnut}><boxGeometry args={[1.8, .045, .09]} /></mesh>)}
      {[-1.17, 1.17].map((x) => <mesh key={x} position={[x, .03, .04]}><boxGeometry args={[.35, 3.1, .15]} />{small ? <meshBasicMaterial color="#301d21" /> : <meshStandardMaterial color="#422729" roughness={.9} />}</mesh>)}
    </group>

    <group position={[-3.2, 0, -3.58]}>
      <mesh position={[0, 1.13, 0]} material={resources.walnut}><boxGeometry args={[2.3, 2.2, .45]} /></mesh>
      <mesh position={[0, .87, .24]}><boxGeometry args={[1.51, 1.53, .08]} />{small ? <meshBasicMaterial color="#160e0c" /> : <meshStandardMaterial color="#160e0c" roughness={1} />}</mesh>
      {[-.94, .94].map((x) => <mesh key={x} position={[x, 1, .3]} material={resources.darkBrass}><boxGeometry args={[.16, 1.8, .13]} /></mesh>)}
      <mesh position={[0, 2.24, .1]} material={resources.walnut}><boxGeometry args={[2.6, .19, .78]} /></mesh>
      <mesh position={[0, .12, .35]} material={resources.walnut}><boxGeometry args={[2.65, .2, 1.15]} /></mesh>
      <mesh position={[0, .48, .3]}><planeGeometry args={[1.18, .45]} /><meshBasicMaterial color="#e07627" transparent opacity={.32} /></mesh>
      {[-.43, -.12, .22, .47].map((x, i) => <mesh key={x} position={[x, .35 + i % 2 * .06, .39]} rotation={[0, 0, .15 * (i % 2 ? 1 : -1)]}><cylinderGeometry args={[.08, .11, .55, 7]} />{small ? <meshBasicMaterial color="#793417" /> : <meshStandardMaterial color="#311c12" emissive="#c54d14" emissiveIntensity={.45} />}</mesh>)}
      <group position={[0, 2.67, .05]}>
        <mesh material={resources.walnut} scale={[1, 1.1, .55]}><sphereGeometry args={[.39, 24, 16]} /></mesh>
        <mesh position={[0, -.29, .03]} material={resources.walnut}><boxGeometry args={[.85, .19, .44]} /></mesh>
        <mesh position={[0, .01, .245]} material={resources.enamel}><circleGeometry args={[.265, 32]} /></mesh>
        <mesh position={[0, .01, .255]} material={resources.brass}><torusGeometry args={[.273, .018, 6, 32]} /></mesh>
        {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.sin(i / 12 * TAU) * .218, .01 + Math.cos(i / 12 * TAU) * .218, .26]} rotation={[0, 0, -i / 12 * TAU]} material={resources.darkBrass}><boxGeometry args={[.013, .033, .008]} /></mesh>)}
        <group ref={mantelHour} position={[0, .01, .272]}><mesh position={[0, .06, 0]} material={resources.darkBrass}><boxGeometry args={[.022, .15, .008]} /></mesh></group>
        <group ref={mantelMinute} position={[0, .01, .277]}><mesh position={[0, .09, 0]} material={resources.darkBrass}><boxGeometry args={[.013, .21, .008]} /></mesh></group>
      </group>
    </group>

    <group position={[3.36, 0, -3.65]}>
      <mesh position={[0, 2.1, -.06]} material={resources.walnut}><boxGeometry args={[2.22, 4.2, .31]} /></mesh>
      <mesh position={[0, 2.1, .12]}><boxGeometry args={[1.97, 3.9, .04]} /><meshBasicMaterial color="#1b1410" /></mesh>
      {[-1.08, 1.08].map((x) => <mesh key={x} position={[x, 2.1, .22]} material={resources.walnut}><boxGeometry args={[.15, 4.25, .54]} /></mesh>)}
      {[.24, 1.15, 2.04, 2.93, 3.86, 4.22].map((y) => <mesh key={y} position={[0, y, .22]} material={resources.walnut}><boxGeometry args={[2.25, .12, .61]} /></mesh>)}
    </group>
    {books.map((batch) => <BookBatch key={batch.color} transforms={batch.positions} color={batch.color} geometry={resources.box} small={small} />)}

    <group position={[-2.3, 0, -.25]}>
      <mesh position={[0, .12, 0]} material={resources.darkBrass}><cylinderGeometry args={[.34, .4, .14, 24]} /></mesh>
      <mesh position={[0, 1.28, 0]} material={resources.brass}><cylinderGeometry args={[.035, .055, 2.3, 10]} /></mesh>
      <mesh position={[0, .31, 0]} material={resources.brass}><sphereGeometry args={[.11, 12, 8]} /></mesh>
      <mesh position={[0, 2.61, 0]} material={resources.lampGlow}><sphereGeometry args={[.28, 24, 16, 0, TAU, .3, Math.PI - .7]} /></mesh>
      <mesh position={[0, 2.83, 0]} material={resources.brass}><torusGeometry args={[.11, .022, 6, 24]} /></mesh>
      <mesh position={[0, 2.39, 0]} material={resources.darkBrass}><cylinderGeometry args={[.14, .08, .14, 16]} /></mesh>
      <mesh position={[0, 2.89, 0]} material={resources.crystal}><cylinderGeometry args={[.067, .067, .31, 12, 1, true]} /></mesh>
    </group>
    <mesh position={[-1.5, 1.425, .025]} rotation={[-.18, 0, .58]}>
      <coneGeometry args={[1.05, 3, 16, 1, true]} />
      <meshBasicMaterial color="#ffb968" transparent opacity={.012} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>

    {/* The machine is built from scratch, including its engraved reverse. */}
    {runners.map((points, i) => <Tube key={i} points={points} radius={.075} material={resources.brass} small={small} />)}
    {[-1.05, .2, 1.1].map((z) => <Rod key={z} from={[-.84, .26, z]} to={[.84, .26, z]} radius={.052} material={resources.darkBrass} />)}
    <mesh position={[0, .41, .07]} material={resources.walnut} castShadow><boxGeometry args={[1.54, .16, 2.52]} /></mesh>
    <mesh position={[0, .52, .07]} material={resources.brass}><boxGeometry args={[1.59, .045, 2.57]} /></mesh>
    <mesh position={[0, .548, .07]} material={resources.walnut}><boxGeometry args={[1.43, .025, 2.4]} /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <Rod from={[side * .77, .53, -.94]} to={[side * .91, 2.5, -.86]} radius={.066} material={resources.darkBrass} />
      <Rod from={[side * .78, .53, .95]} to={[side * 1.02, 1.37, 1.42]} radius={.047} material={resources.brass} />
      <mesh geometry={resources.quartz} material={resources.crystal} position={[side * .65, 1.15, -.1]} castShadow />
      {[.55, 1.74].map((y) => <mesh key={y} position={[side * .65, y, -.1]} material={resources.ivory}><cylinderGeometry args={[.14, .14, .16, 12]} /></mesh>)}
      <mesh position={[side * .65, 1.86, -.1]} material={resources.brass}><sphereGeometry args={[.075, 12, 8]} /></mesh>
    </group>)}
    {handrails.map((points, i) => <Tube key={i} points={points} material={resources.brass} small={small} />)}
    <mesh position={[0, 1.26, .04]} material={resources.ivory}><cylinderGeometry args={[.12, .17, 1.45, 12]} /></mesh>
    <mesh geometry={resources.seat} position={[0, 2.05, .05]} material={resources.leather} castShadow />
    <mesh position={[0, 1.87, -.1]} material={resources.brass} scale={[.49, .09, .46]}><sphereGeometry args={[1, 24, 12]} /></mesh>

    <group position={[0, 2.45, -.94]}>
      <Rod from={[-1.13, 0, 0]} to={[1.13, 0, 0]} radius={.075} material={resources.brass} />
      <group ref={wheel}>
        <mesh material={resources.darkBrass} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[1.5, 1.5, .15, segments]} /></mesh>
        {[-1, 1].map((side) => <group key={side} position={[0, 0, side * .081]} rotation={[0, side === 1 ? 0 : Math.PI, 0]}>
          <mesh material={resources.wheelFace}><circleGeometry args={[1.49, segments]} /></mesh>
          <mesh material={resources.brass} position={[0, 0, .017]}><torusGeometry args={[1.51, .042, 8, segments]} /></mesh>
          <mesh material={resources.brass} position={[0, 0, .018]}><torusGeometry args={[1.31, .015, 6, segments]} /></mesh>
          <mesh material={resources.brass} position={[0, 0, .025]}><torusGeometry args={[.31, .028, 8, 32]} /></mesh>
          <mesh material={resources.ivory} position={[0, 0, .04]}><circleGeometry args={[.265, 32]} /></mesh>
          <mesh material={resources.brass} position={[0, 0, .08]} scale={[1, 1, .35]}><sphereGeometry args={[.14, 16, 10]} /></mesh>
        </group>)}
        <Copies transforms={rivets} geometry={resources.rivet} material={resources.brass} />
      </group>
    </group>

    <group position={[0, 1.37, 1.42]} rotation={[-.45, 0, 0]}>
      <mesh material={resources.walnut} castShadow><boxGeometry args={[2.17, 1.24, .18]} /></mesh>
      <mesh position={[0, 0, .072]} material={resources.brass}><boxGeometry args={[2.23, 1.3, .035]} /></mesh>
      <mesh position={[0, 0, .096]} material={resources.walnut}><boxGeometry args={[2.1, 1.17, .025]} /></mesh>
      {dial(resources.hours.map, .43, .055, .475)}
      {dial(resources.days.map, -.62, .21, .315)}
      {dial(resources.thousands.map, -.75, -.393, .145)}
      {dial(resources.millions.map, -.25, -.393, .145)}
      {[-1.03, 1.03].flatMap((x) => [-.55, .55].map((y) => <mesh key={`${x}-${y}`} position={[x, y, .125]} material={resources.ivory}><sphereGeometry args={[.025, 8, 6]} /></mesh>))}
    </group>
    <group position={[1.03, .95, .86]}>
      <mesh material={resources.darkBrass}><sphereGeometry args={[.13, 16, 10]} /></mesh>
      <group ref={lever} rotation={[-.12, 0, 0]}>
        <mesh position={[0, .45, 0]} material={resources.brass} castShadow><cylinderGeometry args={[.032, .048, .9, 10]} /></mesh>
        <mesh position={[0, .95, 0]} material={resources.ivory} scale={[1, 1.5, 1]} castShadow><sphereGeometry args={[.093, 16, 10]} /></mesh>
        <mesh position={[0, .83, 0]} material={resources.darkBrass}><torusGeometry args={[.06, .015, 6, 16]} /></mesh>
      </group>
    </group>
    <mesh ref={aura} position={[0, 1.8, 0]} scale={[1.5, 1.9, 1.75]} material={resources.shimmer}><icosahedronGeometry args={[1, 2]} /></mesh>
    <points ref={dust} geometry={resources.dust} material={resources.dustMaterial} />
    </group>
  </>;
}

function BookBatch({ transforms, color, geometry, small }: { transforms: Transform[]; color: string; geometry: THREE.BufferGeometry; small: boolean }) {
  const material = useMemo(() => small ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: .85 }), [color, small]);
  useEffect(() => () => material.dispose(), [material]);
  return <Copies transforms={transforms} geometry={geometry} material={material} />;
}
