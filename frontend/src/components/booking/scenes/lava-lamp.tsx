"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneContentProps } from "./types";

const TAU = Math.PI * 2;
const metal = "#c4a57a";
const EconomyMaterials = createContext(false);

// Diffuse furnishings use vertex lighting on phones. The polished lamp
// hardware keeps its highlights; the room avoids several costly PBR programs.
function LoungeMaterial({
  color,
  map,
  vertexColors,
  side,
  metalness = 0,
  roughness = 0.8,
  bumpMap,
  bumpScale,
}: {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  side?: THREE.Side;
  metalness?: number;
  roughness?: number;
  bumpMap?: THREE.Texture | null;
  bumpScale?: number;
}) {
  const small = useContext(EconomyMaterials);
  if (small && metalness < 0.5)
    return (
      <meshLambertMaterial
        color={color}
        map={map}
        vertexColors={vertexColors}
        side={side}
      />
    );
  return (
    <meshStandardMaterial
      color={color}
      map={map}
      vertexColors={vertexColors}
      side={side}
      metalness={metalness}
      roughness={roughness}
      bumpMap={bumpMap}
      bumpScale={bumpScale}
    />
  );
}
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function surface(kind: "wood" | "rug" | "cloth") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!,
    image = ctx.createImageData(256, 256);
  const rugColors = [
    [190, 165, 124],
    [124, 74, 51],
    [170, 126, 66],
  ];
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const grain = Math.sin(
        x * 0.65 +
          Math.sin(y * 0.015 + x * 0.012) * 4 +
          Math.sin(y * 0.04) * 0.6,
      );
      const value =
        kind === "wood"
          ? 130 +
            grain * 12 +
            Math.sin(x * 0.06 + Math.sin(y * 0.009) * 2) * 16 +
            hash(x + y * 256) * 13
          : 180 +
            hash(x + y * 256) * 60 -
            (x % 3 === 0 || (kind === "cloth" && y % 3 === 0) ? 20 : 0);
      const i = (x + y * 256) * 4;
      if (kind === "rug") {
        const wx = (x / 256 - 0.5) * 7.5,
          wz = (y / 256 - 0.5) * 5;
        const stripe = Math.sin(
          Math.sqrt((wx + 1.4) ** 2 + (wz * 0.95) ** 2) * 4.5,
        );
        const rgb = rugColors[stripe > 0.58 ? 1 : stripe > -0.1 ? 2 : 0],
          grain = 0.9 + hash(x + y * 256) * 0.2;
        image.data[i] = rgb[0] * grain;
        image.data[i + 1] = rgb[1] * grain;
        image.data[i + 2] = rgb[2] * grain;
      } else image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(
    kind === "wood" ? 2 : kind === "rug" ? 1 : 5,
    kind === "cloth" ? 5 : 1,
  );
  if (kind === "rug") map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function Block({
  position,
  size,
  color,
  map,
  rotation = 0,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  map?: THREE.Texture;
  rotation?: number;
}) {
  return (
    <mesh
      position={position}
      rotation={[0, rotation, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={size} />
      <LoungeMaterial color={color} map={map} roughness={0.76} />
    </mesh>
  );
}

function roundedBox(w: number, h: number, d: number, r: number) {
  const shape = new THREE.Shape(),
    x = -w / 2,
    y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d - r * 2,
    bevelEnabled: true,
    bevelSize: r,
    bevelThickness: r,
    bevelSegments: 3,
    curveSegments: 6,
    steps: 1,
  });
  g.translate(0, 0, -d / 2 + r);
  return g;
}

// Repeated joinery uses one draw call per panel, including on phones.
function Slats({
  count,
  spacing,
  position,
  size,
  color,
  map,
}: {
  count: number;
  spacing: number;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  map?: THREE.Texture;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      matrix.makeTranslation((i - (count - 1) / 2) * spacing, 0, 0);
      mesh.current.setMatrixAt(i, matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [count, spacing]);
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, count]}
      position={position}
      castShadow
      receiveShadow
    >
      <boxGeometry args={size} />
      <LoungeMaterial color={color} map={map} roughness={0.76} />
    </instancedMesh>
  );
}

function ClockRays() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D(),
      color = new THREE.Color();
    for (let i = 0; i < 24; i++) {
      const angle = (i * TAU) / 24;
      object.position.set(-Math.sin(angle) * 0.7, Math.cos(angle) * 0.7, 0);
      object.rotation.z = angle;
      object.scale.set(i % 2 ? 0.63 : 1, i % 2 ? 0.66 : 1, 1);
      object.updateMatrix();
      mesh.current.setMatrixAt(i, object.matrix);
      mesh.current.setColorAt(i, color.set(i % 2 ? "#b99b5a" : "#9b6a38"));
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, 24]}>
      <coneGeometry args={[0.043, 0.65, 4]} />
      <LoungeMaterial metalness={0.55} roughness={0.4} />
    </instancedMesh>
  );
}

const lavaVertex = `
varying vec3 vPosition;
void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
// A bounded, four-body smooth union. No render targets, transmission pass,
// marching cubes or postprocessing; phone shaders take only 30 steps.
const lavaFragment = `
uniform float uWarm; uniform vec3 uColor; uniform vec3 uEye;
uniform vec4 uBodies[4]; uniform vec4 uHeights; uniform vec3 uBud;
varying vec3 vPosition;
float merge(float a,float b){float h=max(.14-abs(a-b),0.)/.14;return min(a,b)-h*h*.035;}
float egg(vec3 p,vec3 c,vec3 r){return (length((p-c)/r)-1.)*min(r.x,min(r.y,r.z));}
float field(vec3 p){
  float d=egg(p,vec3(0.,.565,0.),vec3(.405,.13,.405));
  for(int i=0;i<4;i++){
    vec4 body=uBodies[i];
    d=merge(d,egg(p,body.xyz,vec3(body.w,uHeights[i],body.w)));
  }
  d=merge(d,egg(p,uBud,vec3(.095,.13,.095)));
  d=merge(d,egg(p,vec3(.02,mix(.57,2.14,uWarm),0.),vec3(.19,.09,.19)));
  float radius=mix(.438,.183,clamp((p.y-.62)/1.58,0.,1.));
  return max(d,max(length(p.xz)-radius,max(.55-p.y,p.y-2.19)));
}
void main(){
  vec3 rd=normalize(vPosition-uEye),p=vPosition+rd*.004;bool hit=false;
  for(int i=0;i<STEPS;i++){
    float d=field(p);if(d<.0035){hit=true;break;}
    p+=rd*max(d*.78,.008);
    if(p.y<.53||p.y>2.22||length(p.xz)>.47)break;
  }
  vec3 color=uColor*.20;float alpha=.10;
  if(hit){
    float d=field(p),e=.006;
    vec3 n=normalize(vec3(field(p+vec3(e,0.,0.)),field(p+vec3(0.,e,0.)),field(p+vec3(0.,0.,e)))-d);
    float lambert=max(0.,dot(n,normalize(vec3(-.5,.3,1.))));
    float rim=pow(1.-max(0.,dot(n,-rd)),2.),core=pow(max(0.,dot(n,-rd)),3.);
    color=uColor*(.68+lambert*.48)+uColor*core*.50+vec3(1.,.65,.30)*rim*.30;
    color+=vec3(1.,.86,.56)*pow(max(0.,dot(reflect(rd,n),normalize(vec3(-.7,1.,1.)))),28.)*.32;
    alpha=1.;
  }
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const glassVertex = `
varying vec3 vNormal;varying vec3 vView;varying vec3 vPoint;
void main(){vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;vNormal=normalize(normalMatrix*normal);vPoint=position;gl_Position=projectionMatrix*p;}
`;
const glassFragment = `
varying vec3 vNormal;varying vec3 vView;varying vec3 vPoint;
void main(){
  vec3 n=normalize(vNormal),v=normalize(vView);
  float rim=pow(1.-abs(dot(n,v)),3.);
  float strip=pow(max(0.,dot(n,normalize(vec3(-.65,.12,1.)))),65.);
  float strip2=pow(max(0.,dot(n,normalize(vec3(.8,.05,.5)))),90.);
  float ends=1.-smoothstep(.0,.08,min(vPoint.y-.54,2.23-vPoint.y));
  gl_FragColor=vec4(vec3(.98,.83,.64),rim*.28+strip*.27+strip2*.12+ends*.16);
  #include <colorspace_fragment>
}
`;

function LavaLamp({
  color,
  position,
  scale,
  phase,
  nearest = false,
  active,
  running,
  reduced,
  small,
}: SceneContentProps & {
  color: string;
  position: [number, number, number];
  scale: number;
  phase: number;
  nearest?: boolean;
}) {
  const volume = useRef<THREE.Mesh>(null),
    light = useRef<THREE.PointLight>(null);
  const motion = useRef({ started: 0, time: phase, speed: 1 });
  const resources = useMemo(() => {
    const glass = new THREE.LatheGeometry(
      [
        [0.41, 0.54],
        [0.442, 0.62],
        [0.435, 0.76],
        [0.208, 2.13],
        [0.185, 2.23],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      small ? 24 : 40,
    );
    const base = new THREE.LatheGeometry(
      [
        [0, 0],
        [0.38, 0],
        [0.39, 0.045],
        [0.37, 0.1],
        [0.25, 0.39],
        [0.41, 0.51],
        [0.41, 0.55],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      small ? 24 : 40,
    );
    const cap = new THREE.LatheGeometry(
      [
        [0.19, 2.19],
        [0.21, 2.23],
        [0.14, 2.51],
        [0.095, 2.56],
        [0, 2.56],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      small ? 24 : 40,
    );
    const uniforms = {
      uBodies: {
        value: Array.from(
          { length: 4 },
          () => new THREE.Vector4(0, 0.59, 0, 0.16),
        ),
      },
      uHeights: { value: new THREE.Vector4(0.085, 0.085, 0.085, 0.085) },
      uBud: { value: new THREE.Vector3(0, 0.59, 0) },
      uWarm: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uEye: { value: new THREE.Vector3() },
    };
    const wax = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: lavaVertex,
      fragmentShader: lavaFragment,
      defines: { STEPS: small ? 30 : 42 },
      transparent: true,
      depthWrite: false,
    });
    const shell = new THREE.ShaderMaterial({
      vertexShader: glassVertex,
      fragmentShader: glassFragment,
      transparent: true,
      depthWrite: false,
    });
    return { glass, base, cap, wax, shell, accent: new THREE.Color(color) };
  }, [color, small]);
  useEffect(
    () => () => {
      resources.glass.dispose();
      resources.base.dispose();
      resources.cap.dispose();
      resources.wax.dispose();
      resources.shell.dispose();
    },
    [resources],
  );
  useFrame(({ camera }, delta) => {
    if (!running || !volume.current) return;
    const dt = Math.min(delta, 0.25),
      s = motion.current,
      now = Date.now();
    if (!s.started) s.started = now;
    const age = (now - s.started) / 1000;
    s.speed = THREE.MathUtils.damp(s.speed, active ? 2.5 : 1, 2, dt);
    if (!reduced) s.time += dt * s.speed;
    const wax = volume.current.material as THREE.ShaderMaterial;
    const warm = reduced ? 1 : THREE.MathUtils.smoothstep(age, 0.12, 1.65);
    wax.uniforms.uWarm.value = warm;
    // Trajectories are evaluated twelve times per frame on the CPU, rather
    // than hundreds of times per pixel in the raymarch and normal samples.
    for (let i = 0; i < 4; i++) {
      const t = s.time * (0.29 + i * 0.017) + i * 1.76,
        r = 0.155 + 0.035 * Math.sin(i * 2.4);
      const x = Math.sin(t * 1.37 + i) * 0.105,
        y = THREE.MathUtils.lerp(
          0.59,
          0.77 + (0.5 + 0.5 * Math.sin(t)) * 1.13,
          warm,
        ),
        z = Math.cos(t * 1.13 + i) * 0.1;
      wax.uniforms.uBodies.value[i].set(x, y, z, r);
      wax.uniforms.uHeights.value.setComponent(
        i,
        THREE.MathUtils.lerp(0.085, r * (1.18 + 0.38 * Math.cos(t)), warm),
      );
      if (i === 1)
        wax.uniforms.uBud.value.set(x + 0.1 * Math.sin(t), y + 0.24 * warm, z);
    }
    wax.uniforms.uEye.value.copy(camera.position);
    volume.current.worldToLocal(wax.uniforms.uEye.value);
    resources.accent.set(nearest && active ? active.color : color);
    wax.uniforms.uColor.value.lerp(resources.accent, 1 - Math.exp(-dt * 2.5));
    if (light.current) {
      light.current.color.copy(wax.uniforms.uColor.value);
      light.current.intensity =
        (9 + (reduced ? 0 : Math.sin(s.time * 0.7) * 0.45)) *
        (0.12 + 0.88 * THREE.MathUtils.smoothstep(age, 0, 1.35));
    }
  });
  return (
    <group position={position} scale={scale}>
      <mesh geometry={resources.base} castShadow>
        <LoungeMaterial color={metal} metalness={0.78} roughness={0.3} />
      </mesh>
      <mesh geometry={resources.cap} castShadow>
        <LoungeMaterial color={metal} metalness={0.8} roughness={0.28} />
      </mesh>
      <mesh
        ref={volume}
        geometry={resources.glass}
        material={resources.wax}
        renderOrder={1}
      />
      <mesh
        geometry={resources.glass}
        material={resources.shell}
        renderOrder={2}
      />
      <mesh position={[0, 0.545, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <pointLight
        ref={light}
        position={[0, 1.05, 0.1]}
        color={color}
        intensity={0.2}
        distance={5.5}
        decay={2}
      />
    </group>
  );
}

function halfPanel(top: boolean, reverse = false) {
  const g = new THREE.PlaneGeometry(0.365, 0.49 / 2);
  g.translate(0, top ? 0.49 / 4 : -0.49 / 4, 0);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    uv.setY(
      i,
      reverse ? 0.5 - uv.getY(i) * 0.5 : uv.getY(i) * 0.5 + (top ? 0.5 : 0),
    );
  return g;
}

function FlipClock({ active, running, reduced }: SceneContentProps) {
  const tops = useRef<THREE.MeshBasicMaterial[]>([]),
    bottoms = useRef<THREE.MeshBasicMaterial[]>([]);
  const fronts = useRef<THREE.MeshBasicMaterial[]>([]),
    backs = useRef<THREE.MeshBasicMaterial[]>([]),
    flaps = useRef<THREE.Group[]>([]);
  const badge = useRef<THREE.MeshBasicMaterial>(null);
  const state = useRef({
    digits: [-1, -1, -1, -1],
    started: [0, 0, 0, 0],
    activeId: "",
    hoverStarted: 0,
    opacity: 0,
    drawn: "",
    drawnColor: "",
  });
  const resources = useMemo(() => {
    const textures = Array.from({ length: 10 }, (_, digit) => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 192;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#191916";
      ctx.fillRect(0, 0, 128, 192);
      ctx.fillStyle = "#f5e9c8";
      ctx.font = "600 166px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(digit), 64, 105);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 80;
    const badgeTexture = new THREE.CanvasTexture(canvas);
    badgeTexture.colorSpace = THREE.SRGBColorSpace;
    return {
      textures,
      top: halfPanel(true),
      bottom: halfPanel(false),
      back: halfPanel(true, true),
      body: roundedBox(2.03, 0.91, 0.62, 0.08),
      canvas,
      badgeTexture,
    };
  }, []);
  useEffect(
    () => () => {
      resources.textures.forEach((t) => t.dispose());
      resources.top.dispose();
      resources.bottom.dispose();
      resources.back.dispose();
      resources.body.dispose();
      resources.badgeTexture.dispose();
    },
    [resources],
  );
  useFrame((_, delta) => {
    if (!running) return;
    const now = Date.now(),
      dt = Math.min(delta, 0.25),
      s = state.current;
    const id = active ? `${active.id}:${active.duration_minutes}` : "";
    if (id !== s.activeId) {
      s.activeId = id;
      s.hoverStarted = now;
    }
    const hoverAge = (now - s.hoverStarted) / 1000;
    // The drum previews the exact ending time. The sunburst still shows now.
    const p = reduced ? 1 : THREE.MathUtils.smoothstep(hoverAge, 0, 1.8);
    const offset = active ? Math.round(active.duration_minutes * p) : 0;
    const date = new Date(now + offset * 60000),
      hours = date.getHours();
    const text =
      String(hours % 12 || 12).padStart(2, "0") +
      String(date.getMinutes()).padStart(2, "0");
    for (let i = 0; i < 4; i++) {
      const digit = Number(text[i]);
      if (!tops.current[i] || !flaps.current[i]) continue;
      if (s.digits[i] !== digit) {
        const old = s.digits[i] < 0 ? digit : s.digits[i];
        tops.current[i].map = resources.textures[digit];
        bottoms.current[i].map = resources.textures[old];
        fronts.current[i].map = resources.textures[old];
        backs.current[i].map = resources.textures[digit];
        s.started[i] = s.digits[i] < 0 || reduced ? 0 : now;
        s.digits[i] = digit;
      }
      const f = Math.min(
        1,
        (now - s.started[i]) / (active && hoverAge < 1.9 ? 115 : 620),
      );
      flaps.current[i].visible = f < 1;
      flaps.current[i].rotation.x = Math.PI * (f * f * (3 - 2 * f));
      if (f === 1) bottoms.current[i].map = resources.textures[digit];
    }
    s.opacity = THREE.MathUtils.damp(s.opacity, active ? 1 : 0, 4, dt);
    if (badge.current) badge.current.opacity = s.opacity;
    const label = active
      ? `${active.duration_minutes} min later`
      : s.opacity > 0.01
        ? s.drawn
        : "";
    if (label !== s.drawn || (active && active.color !== s.drawnColor)) {
      const ctx = resources.canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 512, 80);
      ctx.fillStyle = active?.color || "#d4b178";
      ctx.font = "500 48px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 256, 42);
      if (badge.current?.map) badge.current.map.needsUpdate = true;
      s.drawn = label;
      s.drawnColor = active?.color || "";
    }
  });
  return (
    <group position={[-0.55, 1.09, 2.05]} rotation={[0, 0.18, 0]}>
      <mesh geometry={resources.body} castShadow>
        <LoungeMaterial color="#4a281a" roughness={0.44} />
      </mesh>
      <Block
        position={[0, 0.035, 0.322]}
        size={[1.87, 0.66, 0.024]}
        color="#bca274"
      />
      <Block
        position={[0, 0.045, 0.341]}
        size={[1.78, 0.58, 0.025]}
        color="#171914"
      />
      {[-0.658, -0.247, 0.247, 0.658].map((x, i) => (
        <group key={i} position={[x, 0.045, 0.361]}>
          <mesh geometry={resources.top}>
            <meshBasicMaterial
              ref={(m) => {
                if (m) tops.current[i] = m;
              }}
              map={resources.textures[0]}
            />
          </mesh>
          <mesh geometry={resources.bottom}>
            <meshBasicMaterial
              ref={(m) => {
                if (m) bottoms.current[i] = m;
              }}
              map={resources.textures[0]}
            />
          </mesh>
          <group
            ref={(g) => {
              if (g) flaps.current[i] = g;
            }}
            position={[0, 0, 0.005]}
          >
            <mesh geometry={resources.top}>
              <meshBasicMaterial
                ref={(m) => {
                  if (m) fronts.current[i] = m;
                }}
                map={resources.textures[0]}
                side={THREE.FrontSide}
              />
            </mesh>
            <mesh geometry={resources.back}>
              <meshBasicMaterial
                ref={(m) => {
                  if (m) backs.current[i] = m;
                }}
                map={resources.textures[0]}
                side={THREE.BackSide}
              />
            </mesh>
          </group>
          <Block
            position={[0, 0, 0.013]}
            size={[0.373, 0.013, 0.012]}
            color="#0b0d0b"
          />
          {[-0.19, 0.19].map((dx) => (
            <mesh
              key={dx}
              position={[dx, 0, 0.02]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.018, 0.018, 0.025, 8]} />
              <LoungeMaterial color="#bba47b" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
      {[-0.065, 0.065].map((y) => (
        <mesh key={y} position={[0, y + 0.045, 0.37]}>
          <circleGeometry args={[0.019, 12]} />
          <meshBasicMaterial color="#e9dab5" />
        </mesh>
      ))}
      <mesh position={[0, -0.355, 0.326]}>
        <planeGeometry args={[1.5, 0.17]} />
        <meshBasicMaterial
          ref={badge}
          map={resources.badgeTexture}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      {[-0.76, 0.76].map((x) => (
        <Block
          key={x}
          position={[x, -0.47, 0]}
          size={[0.18, 0.08, 0.35]}
          color="#1c1913"
        />
      ))}
    </group>
  );
}

function Sunburst({
  running,
  reduced,
}: Pick<SceneContentProps, "running" | "reduced">) {
  const hour = useRef<THREE.Group>(null),
    minute = useRef<THREE.Group>(null),
    second = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!running) return;
    const d = new Date(Date.now()),
      m = d.getMinutes() + d.getSeconds() / 60;
    if (hour.current)
      hour.current.rotation.z = (-((d.getHours() % 12) + m / 60) * TAU) / 12;
    if (minute.current) minute.current.rotation.z = (-m * TAU) / 60;
    if (second.current)
      second.current.rotation.z =
        (-(d.getSeconds() + (reduced ? 0 : d.getMilliseconds() / 1000)) * TAU) /
        60;
  });
  return (
    <group position={[0.6, 4.6, -2.37]}>
      <ClockRays />
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.07, 48]} />
        <LoungeMaterial color="#bea56f" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.042]}>
        <circleGeometry args={[0.411, 48]} />
        <LoungeMaterial color="#e4cf96" roughness={0.8} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <group key={i} rotation={[0, 0, (i * TAU) / 12]}>
          <Block
            position={[0, 0.357, 0.047]}
            size={[0.015, 0.055, 0.009]}
            color="#59412b"
          />
        </group>
      ))}
      <group ref={hour} position={[0, 0, 0.065]}>
        <Block
          position={[0, 0.106, 0]}
          size={[0.029, 0.225, 0.012]}
          color="#382e20"
        />
      </group>
      <group ref={minute} position={[0, 0, 0.08]}>
        <Block
          position={[0, 0.15, 0]}
          size={[0.018, 0.32, 0.012]}
          color="#382e20"
        />
      </group>
      <group ref={second} position={[0, 0, 0.09]}>
        <Block
          position={[0, 0.12, 0]}
          size={[0.008, 0.37, 0.009]}
          color="#a14f29"
        />
      </group>
      <mesh position={[0, 0, 0.11]}>
        <sphereGeometry args={[0.032, 12, 8]} />
        <LoungeMaterial color="#b08947" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Fern({ small }: { small: boolean }) {
  const geometry = useMemo(() => {
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    for (let f = 0; f < (small ? 9 : 13); f++) {
      const angle = f * 2.399,
        reach = 0.65 + hash(f) * 0.55,
        height = 0.65 + hash(f + 20) * 0.65;
      for (let j = 1; j < 13; j++) {
        const t = j / 13,
          r = reach * t,
          y = height * Math.sin(t * Math.PI * 0.7),
          ax = Math.cos(angle) * r,
          az = Math.sin(angle) * r;
        for (const side of [-1, 1]) {
          const spread = (1 - t) * 0.3,
            bx = ax + Math.cos(angle + side * 1.1) * spread,
            bz = az + Math.sin(angle + side * 1.1) * spread;
          const mx = (ax + bx) / 2,
            mz = (az + bz) / 2,
            w = (1 - t) * 0.045,
            n = positions.length / 3,
            tint = 0.75 + hash(f * 13 + j) * 0.6;
          positions.push(
            ax,
            y,
            az,
            mx - w,
            y + 0.06,
            mz,
            bx,
            y + 0.06,
            bz,
            mx + w,
            y + 0.075,
            mz,
          );
          for (let i = 0; i < 4; i++)
            colors.push(0.12 * tint, 0.29 * tint, 0.1 * tint);
          indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [small]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[3.15, 0.82, -0.85]}>
      <mesh position={[0, -0.28, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.25, 0.58, 24]} />
        <LoungeMaterial color="#b97b47" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[0.31, 24]} />
        <LoungeMaterial color="#241b11" />
      </mesh>
      <mesh geometry={geometry} castShadow>
        <LoungeMaterial vertexColors side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin((i * TAU) / 3) * 0.22,
            -0.56,
            Math.cos((i * TAU) / 3) * 0.22,
          ]}
        >
          <cylinderGeometry args={[0.025, 0.025, 0.6, 8]} />
          <LoungeMaterial color="#4a3020" />
        </mesh>
      ))}
    </group>
  );
}

function Rug({ small, map }: { small: boolean; map: THREE.Texture }) {
  const geometry = useMemo(() => {
    const p: number[] = [],
      c: number[] = [],
      idx: number[] = [],
      cream = new THREE.Color("#bea57c"),
      rust = new THREE.Color("#7c4a33"),
      mustard = new THREE.Color("#aa7e42"),
      color = new THREE.Color();
    for (let i = 0; i < (small ? 2200 : 6000); i++) {
      const x = (hash(i * 5) - 0.5) * 7.5,
        z = (hash(i * 5 + 1) - 0.5) * 5;
      if ((x / 3.75) ** 2 + (z / 2.5) ** 2 > 1) continue;
      const y = 0.02 + hash(i * 5 + 2) * 0.025,
        n = p.length / 3;
      p.push(
        x - 0.004,
        0.008,
        z,
        x + 0.004,
        0.008,
        z,
        x + (hash(i * 5 + 3) - 0.5) * 0.02,
        y,
        z + 0.008,
      );
      const stripe = Math.sin(
        Math.sqrt((x + 1.4) ** 2 + (z * 0.95) ** 2) * 4.5,
      );
      color
        .copy(stripe > 0.58 ? rust : stripe > -0.1 ? mustard : cream)
        .multiplyScalar(0.9 + hash(i + 8) * 0.25);
      for (let j = 0; j < 3; j++) c.push(color.r, color.g, color.b);
      idx.push(n, n + 1, n + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [small]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[0, 0.015, 1.2]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[3.75, 2.5, 1]}
        receiveShadow
      >
        <circleGeometry args={[1, 64]} />
        <LoungeMaterial
          map={map}
          bumpMap={map}
          bumpScale={0.025}
          roughness={1}
        />
      </mesh>
      <mesh geometry={geometry} receiveShadow>
        <LoungeMaterial vertexColors side={THREE.DoubleSide} roughness={1} />
      </mesh>
    </group>
  );
}

function RecordPlayer({
  running,
  reduced,
}: Pick<SceneContentProps, "running" | "reduced">) {
  const record = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (running && !reduced && record.current)
      record.current.rotation.y += Math.min(delta, 0.1) * 0.32;
  });
  return (
    <group position={[2, 1.57, 0]} rotation={[0, -0.14, 0]}>
      <Block position={[0, 0.1, 0]} size={[1.18, 0.2, 0.87]} color="#56311e" />
      <Block position={[0, 0.21, 0]} size={[1.1, 0.04, 0.8]} color="#a7946b" />
      <group ref={record} position={[-0.13, 0.25, 0]}>
        <mesh>
          <cylinderGeometry args={[0.365, 0.365, 0.018, 48]} />
          <LoungeMaterial color="#121914" roughness={0.32} metalness={0.25} />
        </mesh>
        {[0.19, 0.24, 0.29, 0.335].map((r) => (
          <mesh key={r} position={[0, 0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, 0.002, 3, 48]} />
            <LoungeMaterial color="#36382a" roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[0, 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.106, 24]} />
          <LoungeMaterial color="#c57939" />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.04, 8]} />
          <LoungeMaterial color="#c6bfa0" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      <group position={[0.41, 0.29, -0.24]} rotation={[0, -0.35, 0]}>
        <mesh>
          <cylinderGeometry args={[0.05, 0.05, 0.11, 16]} />
          <LoungeMaterial color="#3c4034" metalness={0.6} roughness={0.3} />
        </mesh>
        <Block
          position={[-0.055, 0.05, 0.23]}
          size={[0.025, 0.025, 0.47]}
          color="#c6bfa0"
        />
        <Block
          position={[-0.06, 0.015, 0.46]}
          size={[0.07, 0.05, 0.13]}
          color="#282b22"
        />
      </group>
      <Block
        position={[0, 0.5, -0.43]}
        size={[1.19, 0.58, 0.025]}
        color="#4a2d1d"
      />
    </group>
  );
}

export default function LavaLounge(props: SceneContentProps) {
  const { small, running, reduced } = props;
  const resources = useMemo(
    () => ({
      wood: surface("wood"),
      rug: surface("rug"),
      cloth: surface("cloth"),
      cushion: roundedBox(1.5, 0.34, 1.12, 0.15),
      back: roundedBox(1.55, 0.83, 0.32, 0.15),
    }),
    [],
  );
  useEffect(
    () => () => {
      resources.wood.dispose();
      resources.rug.dispose();
      resources.cloth.dispose();
      resources.cushion.dispose();
      resources.back.dispose();
    },
    [resources],
  );
  return (
    <EconomyMaterials.Provider value={small}>
      <color attach="background" args={["#211712"]} />
      <fog attach="fog" args={["#241811", 15, 36]} />
      <ambientLight color="#e4b280" intensity={0.45} />
      <hemisphereLight args={["#f4c799", "#352019", 0.58]} />
      <directionalLight
        position={[-3, 6, 5]}
        color="#ffd5a0"
        intensity={2.1}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-4}
        shadow-normalBias={0.035}
        shadow-bias={-0.0003}
      />
      <directionalLight position={[6, 4, 1]} color="#829e9b" intensity={0.45} />
      <Block
        position={[0, -0.12, 0]}
        size={[80, 0.2, 80]}
        color="#513621"
        map={resources.wood}
      />
      <Block
        position={[0, 7, -2.65]}
        size={[60, 14, 0.3]}
        color="#64412a"
        map={resources.wood}
      />
      <Slats
        count={45}
        spacing={0.65}
        position={[0, 6, -2.486]}
        size={[0.014, 12, 0.018]}
        color="#291e14"
      />
      <Block
        position={[0, 0.13, -2.45]}
        size={[60, 0.22, 0.09]}
        color="#36271a"
      />
      <Rug small={small} map={resources.rug} />
      <Sunburst running={running} reduced={reduced} />
      <Block
        position={[0, 1.02, -0.14]}
        size={[5.6, 0.97, 1.12]}
        color="#714425"
        map={resources.wood}
      />
      <Block
        position={[0, 1.54, -0.13]}
        size={[5.78, 0.13, 1.27]}
        color="#a27144"
        map={resources.wood}
      />
      {[-1.84, 0, 1.84].map((x) => (
        <group key={x}>
          <Block
            position={[x, 1.035, 0.438]}
            size={[1.77, 0.86, 0.035]}
            color="#754c2d"
            map={resources.wood}
          />
          <Slats
            count={13}
            spacing={0.125}
            position={[x, 1.035, 0.474]}
            size={[0.038, 0.81, 0.036]}
            color="#8c613a"
            map={resources.wood}
          />
          <Block
            position={[x + 0.65, 1.28, 0.52]}
            size={[0.16, 0.027, 0.06]}
            color={metal}
          />
        </group>
      ))}
      {[-2.38, 2.38].flatMap((x) =>
        [-0.48, 0.27].map((z) => (
          <mesh
            key={`${x}:${z}`}
            position={[x, 0.28, z]}
            rotation={[0, 0, -x * 0.045]}
            castShadow
          >
            <cylinderGeometry args={[0.065, 0.038, 0.55, 8]} />
            <LoungeMaterial color="#573720" roughness={0.7} />
          </mesh>
        )),
      )}
      <LavaLamp
        {...props}
        position={[-1.9, 1.61, -0.12]}
        color="#ff9f27"
        scale={0.88}
        phase={1.4}
        nearest
      />
      <LavaLamp
        {...props}
        position={[-0.55, 1.61, -0.32]}
        color="#f13c85"
        scale={1.08}
        phase={3.9}
      />
      <LavaLamp
        {...props}
        position={[0.77, 1.61, -0.12]}
        color="#39c6b2"
        scale={0.76}
        phase={0.3}
      />
      <RecordPlayer running={running} reduced={reduced} />
      <group position={[-0.55, 0.61, 2.03]}>
        <mesh scale={[1.27, 1, 0.82]} castShadow receiveShadow>
          <cylinderGeometry args={[1.15, 1.15, 0.11, 56]} />
          <LoungeMaterial
            color="#956540"
            map={resources.wood}
            roughness={0.56}
          />
        </mesh>
        {[-0.85, 0.85].flatMap((x) =>
          [-0.43, 0.43].map((z) => (
            <mesh
              key={`${x}:${z}`}
              position={[x, -0.29, z]}
              rotation={[z * 0.1, 0, -x * 0.12]}
            >
              <cylinderGeometry args={[0.043, 0.025, 0.56, 8]} />
              <LoungeMaterial color="#54351e" roughness={0.75} />
            </mesh>
          )),
        )}
      </group>
      <FlipClock {...props} />
      <group position={[-3.75, 0, 1.33]} rotation={[0, 0.48, 0]}>
        {[-0.72, 0.72].map((x, i) => (
          <group
            key={x}
            position={[x, 0, i * 0.15]}
            rotation={[0, -i * 0.17, 0]}
          >
            <mesh
              geometry={resources.cushion}
              position={[0, 0.55, 0]}
              castShadow
              receiveShadow
            >
              <LoungeMaterial
                color="#b84e1d"
                map={resources.cloth}
                roughness={0.98}
              />
            </mesh>
            <mesh
              geometry={resources.back}
              position={[0, 1.01, -0.53]}
              rotation={[-0.13, 0, 0]}
              castShadow
            >
              <LoungeMaterial
                color="#a3441c"
                map={resources.cloth}
                roughness={1}
              />
            </mesh>
            {[-0.53, 0.53].map((dx) => (
              <Block
                key={dx}
                position={[dx, 0.22, 0]}
                size={[0.075, 0.33, 0.075]}
                color="#422d1d"
              />
            ))}
          </group>
        ))}
        <mesh
          geometry={resources.back}
          position={[-1.48, 0.85, 0]}
          rotation={[0, Math.PI / 2, 0]}
          castShadow
        >
          <LoungeMaterial color="#ad451b" map={resources.cloth} roughness={1} />
        </mesh>
      </group>
      <Fern small={small} />
    </EconomyMaterials.Provider>
  );
}
