"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { SceneContentProps } from "./types";

const TAU = Math.PI * 2;
const fract = (v: number) => v - Math.floor(v);
const noise = (v: number) => fract(Math.sin(v * 127.1 + 31.7) * 43758.5453);
const mod = (v: number, n: number) => ((v % n) + n) % n;
const JOINT = Math.atan2(.4, 3.2);
const SmallScene = createContext(false);
type SurfaceMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

function Surface({ roughness = .95, metalness = 0, bumpMap, bumpScale, ...props }: Omit<ThreeElements["meshStandardMaterial"], "ref">) {
  const small = useContext(SmallScene);
  // Carved canvas shading survives on phones; costly PBR and bump programs
  // don't. Lambert still receives the live sun, moon and brazier lighting.
  return small ? <meshLambertMaterial {...props} /> : <meshStandardMaterial {...props} roughness={roughness} metalness={metalness} bumpMap={bumpMap} bumpScale={bumpScale} />;
}

// Gregorian civil date -> integer JDN (no UTC conversion and no DST-length days).
// GMT 584283; 2012-12-21 = 13.0.0.0.0, 4 Ajaw, 3 K'ank'in.
function mayaDate(date: Date) {
  const m = date.getMonth() + 1, a = Math.floor((14 - m) / 12);
  const y = date.getFullYear() + 4800 - a, month = m + 12 * a - 3;
  const jdn = date.getDate() + Math.floor((153 * month + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  const days = jdn - 584283, h = mod(days + 348, 365);
  return {
    days, number: mod(days + 3, 13) + 1, sign: mod(days + 19, 20), h,
    month: Math.floor(h / 20), day: h % 20,
    count: [Math.floor(days / 144000), Math.floor(mod(days, 144000) / 7200), Math.floor(mod(days, 7200) / 360), Math.floor(mod(days, 360) / 20), mod(days, 20)],
  };
}

type MayaDate = ReturnType<typeof mayaDate>;

function canvas(w: number, h = w) {
  const element = document.createElement("canvas"); element.width = w; element.height = h;
  const context = element.getContext("2d")!;
  const texture = new THREE.CanvasTexture(element); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { element, context, texture };
}

function limestone(c: CanvasRenderingContext2D, w: number, h: number, seed = 0) {
  c.fillStyle = "#dac39a"; c.fillRect(0, 0, w, h);
  const grains = c.canvas.width < 1024 ? 260 : 900;
  for (let i = 0; i < grains; i++) {
    const x = noise(i * 7 + seed) * w, y = noise(i * 11 + 2 + seed) * h;
    c.fillStyle = i % 3 ? "#966c3c1f" : "#fff2cb38";
    c.beginPath(); c.ellipse(x, y, 1 + noise(i) * w * .025, 1 + noise(i + 5) * h * .01, noise(i + 3) * 3, 0, TAU); c.fill();
  }
  for (let i = 0; i < 40; i++) {
    const x = noise(i * 13 + seed) * w, y = noise(i * 17 + seed) * h;
    c.strokeStyle = "#52603c66"; c.lineWidth = .6;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * .025, y + h * .009); c.lineTo(x + w * .04, y + h * .035); c.stroke();
    if (i % 4 === 0) {
      c.strokeStyle = "#a4473030"; c.lineWidth = 2 + noise(i) * 5;
      c.beginPath(); c.moveTo(x, y + 5); c.lineTo(x + w * .035, y + 7); c.stroke();
    }
  }
}

function carved(c: CanvasRenderingContext2D, draw: () => void) {
  c.save(); c.translate(0, 1.5); c.fillStyle = "#eee0bc"; c.strokeStyle = "#eee0bc"; draw(); c.restore();
  c.save(); c.fillStyle = "#554d35"; c.strokeStyle = "#554d35"; draw(); c.restore();
}

// Positional numerals stack in base 20. Within a digit, dots sit above bars.
function numeral(c: CanvasRenderingContext2D, n: number, x: number, y: number, width: number) {
  c.save(); c.translate(x, y);
  const unit = width / 6, bars = Math.floor(n / 5), dots = n % 5;
  carved(c, () => {
    if (n === 0) {
      c.lineWidth = unit * .26;
      c.beginPath(); c.ellipse(0, 0, width * .37, unit * .82, -.08, 0, TAU); c.stroke();
      for (let i = -1; i < 2; i++) { c.beginPath(); c.moveTo(i * unit * .8, -unit * .65); c.quadraticCurveTo((i + .45) * unit, 0, i * unit * .8, unit * .66); c.stroke(); }
    } else {
      const height = bars * unit * .8 + (dots ? unit * 1.15 : 0);
      for (let i = 0; i < bars; i++) {
        c.beginPath(); c.roundRect(-width / 2, height / 2 - unit * .6 - i * unit * .8, width, unit * .48, unit * .2); c.fill();
      }
      for (let i = 0; i < dots; i++) { c.beginPath(); c.arc((i - (dots - 1) / 2) * unit * 1.32, -height / 2 + unit * .42, unit * .43, 0, TAU); c.fill(); }
    }
  });
  c.restore();
}

// Deliberately abstract marks, not purported transcriptions of Maya glyphs.
function cartouche(c: CanvasRenderingContext2D, index: number, size: number) {
  carved(c, () => {
    c.lineWidth = 1.8;
    c.beginPath(); c.roundRect(-size * .43, -size * .48, size * .86, size * .84, size * .16); c.stroke();
    const a = .18 + index % 4 * .035;
    c.beginPath(); c.moveTo(-size * .22, size * .1); c.lineTo(-size * .22, -size * a); c.lineTo(size * .15, -size * a); c.lineTo(size * .15, size * .08); c.lineTo(-size * .05, size * .08); c.lineTo(-size * .05, -size * .04); c.stroke();
    for (let j = 0; j < 1 + index % 3; j++) { c.beginPath(); c.arc((j - index % 3 / 2) * size * .14, size * .24, size * .032, 0, TAU); c.fill(); }
  });
}

function wheelFace(kind: "signs" | "numbers" | "months", small: boolean) {
  const item = canvas(small ? 768 : 1536), c = item.context, size = item.element.width;
  c.scale(size / 1024, size / 1024); limestone(c, 1024, 1024, 17);
  c.translate(512, 512);
  for (const r of kind === "numbers" ? [484, 464, 260] : [488, 470, 340, 322]) {
    carved(c, () => { c.lineWidth = 2.2; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); });
  }
  const count = kind === "numbers" ? 13 : kind === "signs" ? 20 : 19;
  for (let i = 0; i < count; i++) {
    // A real 365-position year: Wayeb' occupies five positions, not twenty.
    const angle = kind === "months" ? -(i * 20 + (i === 18 ? 2 : 9.5)) / 365 * TAU : -i / count * TAU;
    c.save(); c.translate(Math.cos(angle) * 405, -Math.sin(angle) * 405); c.rotate(-angle + Math.PI / 2);
    if (kind === "numbers") numeral(c, i + 1, 0, 0, 78);
    else cartouche(c, i + (kind === "months" ? 23 : 0), kind === "months" && i === 18 ? 53 : 87);
    c.restore();
  }
  if (kind === "months") for (let i = 0; i < 365; i++) {
    const a = -i / 365 * TAU;
    carved(c, () => {
      c.lineWidth = i % 20 === 0 ? 2.2 : .9; c.beginPath();
      c.moveTo(Math.cos(a) * (i % 20 === 0 ? 447 : 463), -Math.sin(a) * (i % 20 === 0 ? 447 : 463));
      c.lineTo(Math.cos(a) * 483, -Math.sin(a) * 483); c.stroke();
    });
  }
  return item.texture;
}

function gear(radius: number, teeth: number, depth: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= teeth * 4; i++) {
    const a = i / (teeth * 4) * TAU, r = radius + (i % 4 === 1 || i % 4 === 2 ? .055 : 0);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.translate(0, 0, -depth / 2); return g;
}

function clockFace() {
  const item = canvas(768), c = item.context;
  limestone(c, 768, 768, 8); c.translate(384, 384);
  // A sun-disc with 24 cut notches: the longer cuts mark the twelve hours.
  // The hands retain their familiar twelve-hour travel for immediate reading.
  for (const r of [360, 342, 255]) carved(c, () => { c.lineWidth = 4; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); });
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, major = i % 2 === 0;
    carved(c, () => {
      c.lineWidth = major ? 9 : 4;
      c.beginPath(); c.moveTo(Math.sin(a) * 327, -Math.cos(a) * 327);
      c.lineTo(Math.sin(a) * (major ? 278 : 305), -Math.cos(a) * (major ? 278 : 305)); c.stroke();
    });
  }
  // Four bar-and-dot numerals orient the dial without lettering.
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; numeral(c, i === 0 ? 12 : i * 3, Math.sin(a) * 227, -Math.cos(a) * 227, 45); }
  carved(c, () => {
    c.lineWidth = 5;
    c.beginPath(); c.arc(0, 0, 145, 0, TAU); c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      c.save(); c.rotate(a); c.beginPath(); c.moveTo(-16, -151); c.lineTo(0, -188); c.lineTo(16, -151); c.stroke(); c.restore();
    }
    for (const x of [-58, 58]) {
      c.beginPath(); c.ellipse(x, -37, 28, 18, 0, 0, TAU); c.stroke();
      c.beginPath(); c.arc(x, -37, 7, 0, TAU); c.fill();
    }
    c.beginPath(); c.moveTo(-18, -17); c.lineTo(-27, 37); c.lineTo(19, 37); c.stroke();
    c.beginPath(); c.roundRect(-57, 67, 114, 24, 7); c.stroke();
  });
  return item.texture;
}

function dynamicCarvings() {
  const stela = canvas(384, 1408), today = canvas(768, 208), duration = canvas(512, 192);
  function drawDate(date: MayaDate) {
    const c = stela.context; limestone(c, 384, 1408, 41);
    carved(c, () => { c.lineWidth = 4; c.beginPath(); c.roundRect(25, 24, 334, 1360, 56); c.stroke(); });
    c.save(); c.translate(192, 89); cartouche(c, 32, 75); c.restore();
    date.count.forEach((n, i) => {
      const y = 235 + i * 239;
      carved(c, () => { c.lineWidth = 2; c.beginPath(); c.roundRect(66, y - 88, 252, 171, 24); c.stroke(); });
      c.save(); c.translate(113, y); cartouche(c, 36 + i, 67); c.restore();
      numeral(c, n, 239, y, 103);
    }); stela.texture.needsUpdate = true;
    const t = today.context; limestone(t, 768, 208, 8);
    carved(t, () => { t.lineWidth = 2.5; t.beginPath(); t.roundRect(14, 12, 740, 184, 26); t.stroke(); });
    numeral(t, date.number, 97, 101, 77);
    t.save(); t.translate(267, 109); cartouche(t, date.sign, 134); t.restore();
    numeral(t, date.day, 462, 101, 77);
    t.save(); t.translate(640, 109); cartouche(t, date.month + 23, 134); t.restore();
    today.texture.needsUpdate = true;
  }
  function drawDuration(minutes: number) {
    const c = duration.context; limestone(c, 512, 192, 21);
    const wholeHours = minutes % 60 === 0, value = wholeHours ? minutes / 60 : minutes;
    const digits: number[] = []; let remainder = value;
    do { digits.unshift(remainder % 20); remainder = Math.floor(remainder / 20); } while (remainder > 0);
    digits.forEach((digit, i) => numeral(c, digit, 135, 91 + (i - (digits.length - 1) / 2) * 65, digits.length > 1 ? 62 : 95));
    carved(c, () => {
      c.lineWidth = 4; c.beginPath(); c.arc(326, 91, 49, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(326, 56); c.lineTo(326, 91); c.lineTo(wholeHours ? 351 : 326, wholeHours ? 91 : 127); c.stroke();
      if (!wholeHours) { c.beginPath(); c.arc(326, 29, 5, 0, TAU); c.fill(); }
    });
    carved(c, () => { c.lineWidth = 2; c.beginPath(); c.moveTo(69, 144); c.lineTo(443, 144); c.stroke(); });
    duration.texture.needsUpdate = true;
  }
  limestone(stela.context, 384, 1408); limestone(today.context, 768, 208); limestone(duration.context, 512, 192);
  return { stela, today, duration, drawDate, drawDuration };
}

function handGeometry(length: number, width: number) {
  const shape = new THREE.Shape(); shape.moveTo(-width / 2, -.14); shape.lineTo(-width / 2, length * .77); shape.lineTo(0, length); shape.lineTo(width / 2, length * .77); shape.lineTo(width / 2, -.14); shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: .018, bevelEnabled: false });
}

function stoneMaterial(small: boolean) {
  if (small) return new THREE.MeshLambertMaterial({ color: "#ede0c4" });
  const material = new THREE.MeshStandardMaterial({ color: "#ede0c4", roughness: .98 });
  // World-space mineral grain keeps long lintels from stretching into wood.
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vStone;\n${shader.vertexShader}`.replace("#include <project_vertex>", `
      vec4 stonePoint = vec4(transformed, 1.);
      #ifdef USE_INSTANCING
        stonePoint = instanceMatrix * stonePoint;
      #endif
      vStone = (modelMatrix * stonePoint).xyz;
      #include <project_vertex>
    `);
    shader.fragmentShader = `varying vec3 vStone;
      float grainHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float grainNoise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(grainHash(i),grainHash(i+vec3(1,0,0)),f.x),mix(grainHash(i+vec3(0,1,0)),grainHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(grainHash(i+vec3(0,0,1)),grainHash(i+vec3(1,0,1)),f.x),mix(grainHash(i+vec3(0,1,1)),grainHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      ${shader.fragmentShader}`.replace("#include <color_fragment>", `
        #include <color_fragment>
        float cloud = grainNoise(vStone * 2.8);
        float grit = grainHash(floor(vStone * 190.));
        float pit = step(.974, grit);
        diffuseColor.rgb *= .88 + cloud * .18 + grit * .07 - pit * .18;
        float lichen = smoothstep(.64,.82,grainNoise(vStone*6.7)) * smoothstep(.42,.76,cloud);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(.47,.62,.28), lichen*.58);
        float pigment = smoothstep(.70,.85,grainNoise(vStone*3.1+12.)) * (1.-smoothstep(.35,.6,cloud));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.53,.19,.10), pigment*.22);
      `);
  };
  return material;
}

function Calendar({ active, running, reduced, small }: SceneContentProps) {
  const signs = useRef<THREE.Group>(null), numbers = useRef<THREE.Group>(null), months = useRef<THREE.Group>(null);
  const hour = useRef<THREE.Mesh>(null), minute = useRef<THREE.Mesh>(null), second = useRef<THREE.Mesh>(null);
  const meeting = useRef<THREE.Mesh>(null), accent = useRef<THREE.Mesh>(null);
  const state = useRef({ started: -1, day: NaN, span: 0, opacity: 0, duration: 0 });
  const r = useMemo(() => {
    return {
      material: stoneMaterial(small), signs: wheelFace("signs", small), numbers: wheelFace("numbers", small), months: wheelFace("months", small),
      clock: clockFace(), dynamic: dynamicCarvings(),
      smallGear: gear(1.32, 40, .36), largeGear: gear(1.85, 365, .43), numberGear: gear(.83, 26, .12),
      hour: handGeometry(.57, .085), minute: handGeometry(.84, .048), second: handGeometry(.90, .012),
      box: new RoundedBoxGeometry(1, 1, 1, 1, .065),
      warm: new THREE.Color("#dfac55"), targetColor: new THREE.Color(), previewColor: new THREE.Color("#dfac55"),
    };
  }, [small]);
  useEffect(() => {
    // A viewport change replaces the lighter textures, so repaint their date
    // on the next live frame even though the civil day itself has not changed.
    state.current.day = NaN; state.current.duration = 0; state.current.opacity = 0;
    return () => {
    r.material.dispose(); r.signs.dispose(); r.numbers.dispose(); r.months.dispose(); r.clock.dispose();
    r.dynamic.stela.texture.dispose(); r.dynamic.today.texture.dispose(); r.dynamic.duration.texture.dispose();
    [r.smallGear, r.largeGear, r.numberGear, r.hour, r.minute, r.second, r.box].forEach(g => g.dispose());
    };
  }, [r]);
  useFrame((_, delta) => {
    if (!running) return;
    const now = new Date(Date.now()), date = mayaDate(now), s = state.current, dt = Math.min(delta, .1);
    const moment = performance.now(); if (s.started < 0) s.started = moment;
    if (date.days !== s.day) { r.dynamic.drawDate(date); s.day = date.days; }
    if (active && s.duration !== active.duration_minutes && s.opacity < .025) { s.duration = active.duration_minutes; r.dynamic.drawDuration(s.duration); }
    s.span = reduced ? (active?.duration_minutes ?? 0) / 1440 : THREE.MathUtils.damp(s.span, (active?.duration_minutes ?? 0) / 1440, 3.5, dt);
    s.opacity = THREE.MathUtils.damp(s.opacity, active && s.duration === active.duration_minutes ? 1 : 0, 5, dt);
    r.previewColor.lerp(r.targetColor.set(active?.color ?? "#dfac55"), 1 - Math.exp(-5 * dt));
    const enter = reduced ? 1 : 1 - Math.pow(1 - Math.min(1, (moment - s.started) / 1500), 3);
    // Date alignment is discrete. The temporary meeting gesture expresses a
    // fraction of a day as a turn, with equal travel at the wheels' pitch line.
    if (signs.current) signs.current.rotation.z = JOINT + date.sign / 20 * TAU + (1 - enter) * .45 + s.span * TAU;
    if (numbers.current) numbers.current.rotation.z = JOINT + (date.number - 1) / 13 * TAU + (1 - enter) * .65 + s.span * TAU * 20 / 13;
    if (months.current) months.current.rotation.z = JOINT + Math.PI + date.h / 365 * TAU - (1 - enter) * .3 - s.span * TAU * 1.32 / 1.85;
    const mins = now.getMinutes() + now.getSeconds() / 60, hours = now.getHours() % 12 + mins / 60;
    if (hour.current) hour.current.rotation.z = -hours / 12 * TAU;
    if (minute.current) minute.current.rotation.z = -mins / 60 * TAU;
    if (second.current) second.current.rotation.z = -(now.getSeconds() + now.getMilliseconds() / 1000) / 60 * TAU;
    const meetingMaterial = meeting.current?.material as SurfaceMaterial | undefined, accentMaterial = accent.current?.material as SurfaceMaterial | undefined;
    if (meetingMaterial) { meetingMaterial.opacity = s.opacity; meetingMaterial.emissive.copy(r.previewColor); meetingMaterial.emissiveIntensity = .13 * s.opacity; }
    if (accentMaterial) { accentMaterial.color.copy(r.warm).lerp(r.previewColor, s.opacity); accentMaterial.emissive.copy(accentMaterial.color); accentMaterial.emissiveIntensity = .2 + s.opacity * .25; }
  });
  const stone = <primitive object={r.material} attach="material" />;
  const face = (map: THREE.Texture) => <Surface map={map} bumpMap={map} bumpScale={.018} roughness={.95} />;
  return <group position={[0, 0, 1.6]} scale={small ? .94 : .86}>
    <mesh geometry={r.box} position={[0, .26, -.06]} scale={[7.1, .5, 1.72]} castShadow receiveShadow>{stone}</mesh>
    <mesh geometry={r.box} position={[0, .55, -.06]} scale={[6.55, .18, 1.45]} receiveShadow>{stone}</mesh>
    <mesh geometry={r.box} position={[-1.7, 1.05, -.1]} scale={[.55, 1.1, .72]} castShadow>{stone}</mesh>
    <mesh geometry={r.box} position={[1.5, 1.16, -.1]} scale={[.72, 1.4, .8]} castShadow>{stone}</mesh>
    <group position={[-1.7, 2.14, 0]}>
      <group ref={signs}>
        <mesh geometry={r.smallGear} castShadow receiveShadow>{stone}</mesh>
        <mesh position={[0, 0, .187]}><circleGeometry args={[1.315, small ? 64 : 96]} />{face(r.signs)}</mesh>
        <mesh position={[0, 0, -.187]} rotation={[0, Math.PI, 0]}><circleGeometry args={[1.315, 64]} />{face(r.signs)}</mesh>
      </group>
      <group ref={numbers} position={[0, 0, .25]}>
        <mesh geometry={r.numberGear} castShadow>{stone}</mesh>
        <mesh position={[0, 0, .067]}><circleGeometry args={[.825, 64]} />{face(r.numbers)}</mesh>
      </group>
      <mesh position={[0, 0, .36]} rotation={[Math.PI / 2, Math.PI / 4, 0]}><cylinderGeometry args={[.40, .45, .11, 4]} /><Surface color="#8d9a6b" roughness={.92} /></mesh>
      <mesh position={[0, 0, .43]} rotation={[0, 0, Math.PI / 4]}><torusGeometry args={[.31, .024, 5, 4]} /><Surface color="#637f5a" roughness={.7} /></mesh>
      <mesh position={[0, 0, .43]}><sphereGeometry args={[.075, 12, 8]} /><Surface color="#3b735c" roughness={.7} /></mesh>
      <mesh position={[0, 0, .201]} rotation={[0, 0, JOINT - .11]}><torusGeometry args={[1.10, .009, 4, 12, .22]} /><Surface color="#e8c67b" emissive="#bc8845" emissiveIntensity={.35} roughness={.6} /></mesh>
    </group>
    <group position={[1.5, 2.54, 0]}>
      <group ref={months}>
        <mesh geometry={r.largeGear} castShadow receiveShadow>{stone}</mesh>
        <mesh position={[0, 0, .222]}><circleGeometry args={[1.847, small ? 96 : 128]} />{face(r.months)}</mesh>
        <mesh position={[0, 0, -.222]} rotation={[0, Math.PI, 0]}><circleGeometry args={[1.847, 96]} />{face(r.months)}</mesh>
      </group>
      <mesh position={[0, 0, .27]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[1.13, 1.17, .17, small ? 64 : 96]} />{stone}</mesh>
      <mesh position={[0, 0, .362]}><circleGeometry args={[1.115, 64]} />{face(r.clock)}</mesh>
      <mesh ref={hour} geometry={r.hour} position={[0, 0, .39]}><Surface color="#142b29" roughness={.5} /></mesh>
      <mesh ref={minute} geometry={r.minute} position={[0, 0, .416]}><Surface color="#20765d" roughness={.5} /></mesh>
      <mesh ref={second} geometry={r.second} position={[0, 0, .443]}><Surface color="#76503c" roughness={.8} /></mesh>
      <mesh position={[0, 0, .47]}><sphereGeometry args={[.06, 12, 8]} /><Surface color="#38816a" roughness={.55} /></mesh>
      <mesh position={[0, 0, .236]} rotation={[0, 0, Math.PI + JOINT - .075]}><torusGeometry args={[1.68, .009, 4, 12, .15]} /><Surface color="#e8c67b" emissive="#bc8845" emissiveIntensity={.35} roughness={.6} /></mesh>
    </group>
    {/* Two fixed pointers touch the same interlocking day at the pitch line. */}
    <mesh ref={accent} position={[-.325, 2.31, .29]} rotation={[0, 0, JOINT - Math.PI / 2]}><coneGeometry args={[.115, .29, 3]} /><Surface color="#dfac55" roughness={.6} /></mesh>
    <mesh geometry={r.box} position={[0, .88, .49]} scale={[2.65, .65, .24]} castShadow>{stone}</mesh>
    <mesh position={[0, .88, .616]}><planeGeometry args={[2.59, .60]} />{face(r.dynamic.today.texture)}</mesh>
    <mesh geometry={r.box} position={[1.28, .285, .836]} scale={[1.9, .39, .06]}>{stone}</mesh>
    <mesh ref={meeting} position={[1.28, .285, .872]}><planeGeometry args={[1.82, .37]} /><Surface map={r.dynamic.duration.texture} bumpMap={r.dynamic.duration.texture} bumpScale={.013} roughness={.92} transparent opacity={0} depthWrite={false} /></mesh>
    <group position={[-4.08, 0, -.3]} rotation={[0, .075, -.025]}>
      <mesh geometry={r.box} position={[0, .22, 0]} scale={[1.25, .44, 1.1]} castShadow receiveShadow>{stone}</mesh>
      <mesh geometry={r.box} position={[0, 2.25, 0]} scale={[.88, 4.1, .58]} castShadow receiveShadow>{stone}</mesh>
      <mesh position={[0, 2.26, .297]}><planeGeometry args={[.76, 3.8]} />{face(r.dynamic.stela.texture)}</mesh>
      <mesh geometry={r.box} position={[0, 4.29, 0]} scale={[1.01, .22, .7]} castShadow>{stone}</mesh>
    </group>
  </group>;
}

type Stone = { position: [number, number, number]; scale: [number, number, number]; rotation?: number; color?: string };

// Shared by the staircase and its hovering ribbon of light.
const PYRAMID_X = 1.6, PYRAMID_Z = -8.6;
const STAIR_FRONT = -3.5, STAIR_RUN = 4.0, STAIR_RISE = 6.3;

function architecture() {
  const stones: Stone[] = [];
  // Nine high terraces, with projecting cornices and moss-dark masonry joints.
  for (let i = 0; i < 9; i++) {
    const width = 12.2 - i * 1.03, depth = 9.2 - i * .88, y = i * .7;
    stones.push({ position: [0, y + .35, PYRAMID_Z], scale: [width, .7, depth] });
    stones.push({ position: [0, y + .66, PYRAMID_Z], scale: [width + .18, .12, depth + .16], color: i % 3 === 0 ? "#c59e71" : "#e4c79a" });
    for (const side of [-1, 1]) {
      for (let j = 0; j < 4; j++) stones.push({ position: [side * width / 2, y + .3, PYRAMID_Z + (j - 1.5) * depth / 4], scale: [.025, .46, .043], color: "#697146" });
      for (let j = 0; j < 3; j++) stones.push({ position: [side * (1.7 + j * (width / 2 - 1.7) / 3), y + .31, PYRAMID_Z + depth / 2 + .018], scale: [.028, .43, .025], color: "#77764e" });
    }
    // Surviving fragments of the red-painted terrace friezes.
    stones.push({ position: [-width * .31, y + .5, PYRAMID_Z + depth / 2 + .021], scale: [width * .19, .07, .015], color: "#b66e4d" });
  }
  for (let i = 0; i < 45; i++) {
    const t = i / 45;
    stones.push({ position: [0, .07 + t * STAIR_RISE, STAIR_FRONT - t * STAIR_RUN], scale: [1.85, .145, .13], color: i % 4 ? "#e5c89d" : "#c0a678" });
    for (const side of [-1, 1]) stones.push({ position: [side * 1.10, .24 + t * STAIR_RISE, STAIR_FRONT - t * STAIR_RUN], scale: [.28, .32, .16], color: "#cfb28a" });
  }
  // Open temple doorway between piers, broad lintel, and a pierced roof comb.
  stones.push({ position: [0, 6.4, PYRAMID_Z], scale: [3.95, .24, 2.6] });
  for (const side of [-1, 1]) stones.push({ position: [side * 1.26, 7.09, PYRAMID_Z], scale: [.72, 1.25, 2.12] });
  stones.push({ position: [0, 7.08, PYRAMID_Z - .94], scale: [2.3, 1.2, .2], color: "#8b7650" });
  stones.push({ position: [0, 7.83, PYRAMID_Z], scale: [4.15, .30, 2.8], color: "#d7b18b" });
  stones.push({ position: [0, 8.07, PYRAMID_Z], scale: [3.65, .19, 2.3] });
  for (let i = -2; i <= 2; i++) stones.push({ position: [i * .60, 8.66, PYRAMID_Z - .1], scale: [.32, 1.04 - Math.abs(i) * .12, .42], color: i % 2 ? "#bb805c" : "#d2af80" });
  stones.push({ position: [0, 9.19, PYRAMID_Z - .1], scale: [3.1, .19, .55] });
  stones.push({ position: [0, 9.42, PYRAMID_Z - .1], scale: [1.6, .28, .6], color: "#c6a075" });
  return stones;
}

function Masonry() {
  const small = useContext(SmallScene);
  const mesh = useRef<THREE.InstancedMesh>(null), paving = useRef<THREE.InstancedMesh>(null);
  const r = useMemo(() => {
    const blocks = architecture();
    const tiles: Stone[] = [];
    for (let x = -9; x <= 9; x++) for (let z = -9; z <= 8; z++) {
      if (z < -3 && Math.abs(x) < 5) continue;
      if (noise(x * 4 + z * 73 + 300) < .14 && Math.abs(x) > 4) continue;
      tiles.push({ position: [x * 1.02 + (z % 2) * .5, -.04 + noise(x * 17 + z * 91) * .028, z * 1.03], scale: [.97, .12, .98], rotation: (noise(x + z * 41) - .5) * .035, color: new THREE.Color().setHSL(.095 + noise(x * 19 + z) * .025, .27, .49 + noise(x + z * 83) * .15).getStyle() });
    }
    return { material: stoneMaterial(small), blocks, tiles, box: new RoundedBoxGeometry(1, 1, 1, 1, .035) };
  }, [small]);
  useEffect(() => {
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    for (const [object, items] of [[mesh.current, r.blocks], [paving.current, r.tiles]] as const) {
      if (!object) continue;
      items.forEach((s, i) => { dummy.position.set(...s.position); dummy.scale.set(...s.scale); dummy.rotation.set(0, s.rotation ?? 0, 0); dummy.updateMatrix(); object.setMatrixAt(i, dummy.matrix); object.setColorAt(i, color.set(s.color ?? "#e6cda5")); });
      object.instanceMatrix.needsUpdate = true; if (object.instanceColor) object.instanceColor.needsUpdate = true;
    }
    return () => { r.box.dispose(); r.material.dispose(); };
  }, [r]);
  return <>
    <instancedMesh ref={mesh} position={[PYRAMID_X, 0, 0]} scale={[1, small ? .93 : 1, 1]} args={[r.box, r.material, r.blocks.length]} castShadow receiveShadow />
    <instancedMesh ref={paving} args={[r.box, r.material, r.tiles.length]} receiveShadow />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.15, 0]} receiveShadow><planeGeometry args={[180, 180]} /><Surface color="#52604a" roughness={1} /></mesh>
  </>;
}

function Jungle({ small, running, reduced }: Pick<SceneContentProps, "small" | "running" | "reduced">) {
  const canopy = useRef<THREE.InstancedMesh>(null), fronds = useRef<THREE.InstancedMesh>(null), trunks = useRef<THREE.InstancedMesh>(null);
  const vines = useRef<THREE.InstancedMesh>(null), broadleaf = useRef<THREE.InstancedMesh>(null), roots = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null), elapsed = useRef(0);
  const r = useMemo(() => {
    const foliage: { x: number; y: number; z: number; size: number; seed: number }[] = [];
    const trees: { x: number; z: number; h: number }[] = [];
    for (let i = 0; i < (small ? 48 : 72); i++) {
      const flank = i % 3 === 0;
      let x = flank ? (i % 2 ? -1 : 1) * (8 + noise(i * 3) * 15) : (noise(i * 3) - .5) * 76;
      const z = flank ? -11 + noise(i * 7) * 13 : -20 - noise(i * 7) * 26;
      // Keep a clearing around the temple silhouette, with ceibas at its sides.
      if (Math.abs(x - PYRAMID_X) < 7 && z > -30) x += x < PYRAMID_X ? -9 : 9;
      const h = 9 + noise(i * 13) * 6; trees.push({ x, z, h });
      for (let j = 0; j < 3; j++) foliage.push({ x: x + (noise(i * 19 + j) - .5) * 4, y: h - j * .9, z: z + (noise(i * 31 + j) - .5) * 4, size: 2.4 + noise(i * 11 + j) * 2.1, seed: i * 17 + j });
    }
    const leaves = new THREE.Shape(); leaves.moveTo(0, 0); leaves.quadraticCurveTo(.36, .55, 0, 1.2); leaves.quadraticCurveTo(-.24, .5, 0, 0);
    const silhouette = canvas(512), c = silhouette.context;
    // Overlapping lobes make a rounded canopy; scattered leaf tips soften its
    // outline. Every crown is still just two triangles, including on phones.
    for (let i = 0; i < 2400; i++) {
      const a = noise(i * 5) * TAU, radius = Math.sqrt(noise(i * 13));
      const cluster = .81 + Math.sin(a * 7 + .7) * .10 + Math.sin(a * 13) * .05;
      if (radius > cluster) continue;
      const x = 256 + Math.cos(a) * radius * 245, y = 254 + Math.sin(a) * radius * 200;
      const shade = 47 + (1 - y / 512) * 35 + noise(i) * 16;
      c.fillStyle = `rgb(${shade * .87},${shade},${shade * .70})`;
      c.beginPath(); c.ellipse(x, y, 8 + noise(i * 17) * 19, 5 + noise(i * 23) * 10, noise(i * 7) * TAU, 0, TAU); c.fill();
    }
    const leaf = new THREE.ShapeGeometry(leaves, 8), points = leaf.attributes.position;
    for (let i = 0; i < points.count; i++) points.setZ(i, Math.sin(points.getY(i) / 1.2 * Math.PI) * .22);
    leaf.computeVertexNormals();
    const root = new THREE.Shape(); root.moveTo(0, 0); root.lineTo(1.6, 0); root.quadraticCurveTo(.33, .24, 0, 1.9); root.closePath();
    const vine = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.08, -.8, .03), new THREE.Vector3(-.06, -1.6, 0), new THREE.Vector3(.03, -2.5, .04)]);
    return { foliage, trees, silhouette, canopy: new THREE.PlaneGeometry(2.2, 2.2), trunk: new THREE.CylinderGeometry(.13, .32, 1, 8), leaf, root: new THREE.ShapeGeometry(root), vine: new THREE.TubeGeometry(vine, 10, .018, 3, false), color: new THREE.Color() };
  }, [small]);
  useEffect(() => {
    const o = new THREE.Object3D();
    r.foliage.forEach((v, i) => {
      o.position.set(v.x, v.y, v.z); o.scale.set(v.size * 1.2, v.size, 1); o.rotation.set(0, (noise(v.seed + 1) - .5) * 1.1, (noise(v.seed + 2) - .5) * .17); o.updateMatrix();
      canopy.current?.setMatrixAt(i, o.matrix); canopy.current?.setColorAt(i, r.color.setHSL(.23 + noise(v.seed) * .07, .25 + noise(v.seed + 3) * .10, .40 + noise(v.seed + 4) * .18));
    });
    r.trees.forEach((v, i) => {
      o.position.set(v.x, v.h / 2, v.z); o.scale.set(1.5, v.h, 1.5); o.rotation.set(0, 0, .035 * Math.sin(i)); o.updateMatrix(); trunks.current?.setMatrixAt(i, o.matrix);
      for (let j = 0; j < 3; j++) {
        const a = j / 3 * TAU + i;
        o.position.set(v.x, .02, v.z); o.rotation.set(0, a, 0); o.scale.setScalar(.7 + noise(i) * .7); o.updateMatrix(); roots.current?.setMatrixAt(i * 3 + j, o.matrix);
        o.position.set(v.x + Math.cos(a), v.h - 1.1, v.z + Math.sin(a)); o.rotation.set(0, a, -.7); o.scale.set(.75, 3.1, .75); o.updateMatrix(); trunks.current?.setMatrixAt(r.trees.length + i * 3 + j, o.matrix);
        o.position.set(v.x + Math.cos(a) * 2, v.h - 1, v.z + Math.sin(a) * 2); o.rotation.set(0, a, .06); o.scale.setScalar(1.2 + noise(i * 3 + j)); o.updateMatrix(); vines.current?.setMatrixAt(i * 3 + j, o.matrix);
      }
    });
    // Curved broad leaves at the plaza edge, separate from feathered ferns.
    for (let i = 0; i < (small ? 28 : 48); i++) {
      const side = i % 2 ? -1 : 1, a = noise(i * 13) * TAU;
      const x = side * (4.1 + noise(Math.floor(i / 6) * 23) * 2.8), z = 2.7 - noise(Math.floor(i / 6) * 7) * 7;
      o.position.set(x, .12, z); o.rotation.set(.35 + noise(i * 5) * .8, a, (noise(i) - .5) * 1.7); o.scale.set(.8, 1.1 + noise(i * 7) * .9, 1); o.updateMatrix();
      broadleaf.current?.setMatrixAt(i, o.matrix); broadleaf.current?.setColorAt(i, r.color.setHSL(.24 + noise(i) * .05, .40, .18 + noise(i * 3) * .13));
    }
    // Feathered fern fronds: paired leaflets follow six bowed stems per plant.
    const count = small ? 12 : 20;
    for (let i = 0; i < count; i++) {
      const x = i < 4 ? [-4.4, 4.9, -6.9, 6.1][i] : (noise(i * 5) > .5 ? 1 : -1) * (6 + noise(i) * 4);
      const z = i < 4 ? [3.3, 2.8, -.6, -2][i] : (noise(i * 17) - .5) * 20;
      for (let stem = 0; stem < 6; stem++) for (let j = 0; j < 7; j++) for (let side = 0; side < 2; side++) {
        const a = stem / 6 * TAU + i, t = (j + 1) / 8, radius = t * 1.26, y = Math.sin(t * 2.2) * .9;
        o.position.set(x + Math.cos(a) * radius, .05 + y, z + Math.sin(a) * radius);
        o.rotation.set(.65 + t * .65, -a + Math.PI / 2, (side ? -1 : 1) * (.7 + t * .2)); o.scale.setScalar((1 - t * .6) * .38); o.updateMatrix();
        const index = i * 84 + stem * 14 + j * 2 + side;
        fronds.current?.setMatrixAt(index, o.matrix); fronds.current?.setColorAt(index, r.color.setHSL(.21 + noise(i) * .1, .28, .22 + t * .15));
      }
    }
    for (const object of [canopy.current, trunks.current, fronds.current, roots.current, vines.current, broadleaf.current]) if (object) { object.instanceMatrix.needsUpdate = true; if (object.instanceColor) object.instanceColor.needsUpdate = true; }
    return () => { r.canopy.dispose(); r.trunk.dispose(); r.leaf.dispose(); r.root.dispose(); r.vine.dispose(); r.silhouette.texture.dispose(); };
  }, [r, small]);
  useFrame((_, delta) => { if (!running || reduced || !group.current) return; elapsed.current += Math.min(delta, .1); group.current.rotation.z = Math.sin(elapsed.current * .16) * .003; });
  return <>
    <instancedMesh ref={trunks} args={[r.trunk, undefined, r.trees.length * 4]}><Surface color="#817d5b" roughness={1} /></instancedMesh>
    <instancedMesh ref={roots} args={[r.root, undefined, r.trees.length * 3]}><Surface color="#757752" side={THREE.DoubleSide} /></instancedMesh>
    <instancedMesh ref={vines} args={[r.vine, undefined, r.trees.length * 3]}><Surface color="#445a32" /></instancedMesh>
    <instancedMesh ref={broadleaf} args={[r.leaf, undefined, small ? 28 : 48]}><Surface side={THREE.DoubleSide} /></instancedMesh>
    <group ref={group}><instancedMesh ref={canopy} args={[r.canopy, undefined, r.foliage.length]}><Surface map={r.silhouette.texture} alphaTest={.45} roughness={1} side={THREE.DoubleSide} /></instancedMesh></group>
    <instancedMesh ref={fronds} args={[r.leaf, undefined, (small ? 12 : 20) * 84]}><Surface roughness={1} side={THREE.DoubleSide} /></instancedMesh>
  </>;
}

const skyVertex = `varying vec3 vDirection; void main(){ vDirection=(modelMatrix*vec4(position,1.)).xyz-cameraPosition; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const skyFragment = `
varying vec3 vDirection; uniform float uDay,uGolden; uniform vec3 uSun;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec3 d=normalize(vDirection); float h=max(d.y,0.);
  vec3 day=mix(vec3(.86,.76,.56),vec3(.39,.56,.55),smoothstep(-.05,.7,h));
  vec3 evening=mix(vec3(.91,.58,.33),vec3(.47,.48,.55),smoothstep(-.02,.6,h));
  vec3 night=mix(vec3(.19,.23,.30),vec3(.025,.043,.10),smoothstep(-.02,.25,h));
  vec3 color=mix(night,mix(day,evening,uGolden),uDay);
  float sun=max(dot(d,normalize(uSun)),0.);
  color+=vec3(1.,.59,.26)*pow(sun,18.)*.22*uDay;
  color=mix(color,vec3(2.5,1.7,.8),smoothstep(.9993,.9996,sun)*uDay);
  float cloud=sin(d.x*31.+d.z*13.+sin(d.z*29.))*sin(d.z*57.+d.x*11.);
  color+=vec3(.15,.13,.1)*smoothstep(.45,.96,cloud)*exp(-pow((h-.2)*9.,2.))*uDay;
  vec2 uv=vec2(atan(d.z,d.x)*165.,asin(d.y)*190.);
  float star=step(.975,hash(floor(uv)))*(1.-smoothstep(.02,.14,length(fract(uv)-.5)));
  color+=vec3(.7,.77,.85)*star*(1.-uDay)*smoothstep(.02,.2,h);
  vec3 moon=normalize(vec3(-.42,.12,-.95)); float lunar=max(dot(d,moon),0.);
  color+=vec3(.34,.43,.57)*pow(lunar,500.)*.16*(1.-uDay);
  vec3 right=normalize(cross(vec3(0.,1.,0.),moon)), up=cross(moon,right);
  vec2 m=vec2(dot(d,right),dot(d,up))/.023; float radius=length(m);
  if(radius<1.03 && lunar>.99) {
    float sphere=sqrt(max(0.,1.-radius*radius));
    float shade=.45+.55*max(dot(vec3(m,sphere),normalize(vec3(-.55,.35,.9))),0.);
    float maria=.96-.23*exp(-dot(m-vec2(-.32,.2),m-vec2(-.32,.2))*11.);
    maria-=.17*exp(-dot(m-vec2(.28,.37),m-vec2(.28,.37))*18.);
    maria-=.14*exp(-dot(m-vec2(.4,-.3),m-vec2(.4,-.3))*24.);
    maria+=(hash(floor(m*75.))-.5)*.035;
    color=mix(color,vec3(1.15,1.19,1.18)*maria*shade,(1.-smoothstep(.97,1.03,radius))*(1.-uDay));
  }
  gl_FragColor=vec4(color,1.);
  #include <colorspace_fragment>
}`;

function solar(hours: number) {
  const altitude = Math.sin((hours - 6) / 24 * TAU), daylight = THREE.MathUtils.smoothstep(altitude, -.15, .12);
  return { daylight, elevation: Math.max(.09, Math.min(Math.sin(40 * Math.PI / 180), altitude * .68)), angle: (hours - 12) / 24 * TAU, golden: Math.pow(1 - Math.max(0, altitude), 1.6) };
}

function Atmosphere({ running, reduced, small, active }: SceneContentProps) {
  const gl = useThree(s => s.gl);
  const key = useRef<THREE.DirectionalLight>(null), fill = useRef<THREE.HemisphereLight>(null), fog = useRef<THREE.Fog>(null);
  const lightBand = useRef<THREE.Mesh>(null), flames = useRef<THREE.Group>(null), flameLight = useRef<THREE.PointLight>(null);
  const state = useRef({ started: -1, elapsed: 0, opacity: 0 });
  const r = useMemo(() => ({
    sky: new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, vertexShader: skyVertex, fragmentShader: skyFragment, uniforms: { uDay: { value: 1 }, uGolden: { value: 1 }, uSun: { value: new THREE.Vector3(8, 6, 3) } } }),
    band: new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color() } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv; uniform float uTime,uOpacity; uniform vec3 uColor; void main(){float a=pow(max(0.,sin((vUv.y*3.5+uTime*.22)*6.283)),4.); float edge=1.-smoothstep(.22,.5,abs(vUv.x-.5));gl_FragColor=vec4(uColor,(.2+.8*a)*edge*uOpacity); #include <colorspace_fragment> }`.replace(" #include", "\n#include").replace("fragment> }", "fragment>\n}"),
    }),
    warm: new THREE.Color("#ffcf88"), cold: new THREE.Color("#91a8d3"), hazeDay: new THREE.Color("#c7c5a0"), hazeNight: new THREE.Color("#323e51"), accent: new THREE.Color(),
  }), []);
  useEffect(() => {
    const art = gl.domElement.closest<HTMLElement>('[data-scene="maya"]');
    if (!art) return;
    const update = () => { const d = new Date(); art.dataset.night = String(solar(d.getHours() + d.getMinutes() / 60).daylight < .25); };
    update(); const timer = running ? setInterval(update, 30000) : undefined;
    return () => { clearInterval(timer); delete art.dataset.night; };
  }, [gl, running]);
  const live = useRef<typeof r | null>(null);
  useEffect(() => { live.current = r; return () => { live.current = null; r.sky.dispose(); r.band.dispose(); }; }, [r]);
  useFrame((_, delta) => {
    const r = live.current;
    if (!running || !r) return;
    const now = new Date(Date.now()), hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600, sun = solar(hours), s = state.current, dt = Math.min(delta, .1);
    const moment = performance.now(); if (s.started < 0) s.started = moment;
    s.elapsed += dt; const intro = reduced ? 1 : THREE.MathUtils.smoothstep((moment - s.started) / 1000, 0, 1.5);
    s.opacity = THREE.MathUtils.damp(s.opacity, active ? .8 : 0, 3.5, dt);
    r.sky.uniforms.uDay.value = sun.daylight; r.sky.uniforms.uGolden.value = sun.golden;
    // Local civil-time sun, intentionally illustrative rather than a claim to
    // geographic solar noon. Night keeps a soft moon key and amber braziers.
    const direction = r.sky.uniforms.uSun.value as THREE.Vector3;
    direction.set(Math.sin(sun.angle) * 22, Math.tan(Math.asin(sun.elevation)) * 22, -Math.cos(sun.angle) * 22);
    if (key.current) { key.current.position.copy(direction); key.current.intensity = (.7 + 2.6 * sun.daylight) * (.5 + .5 * intro); key.current.color.copy(r.cold).lerp(r.warm, sun.daylight); }
    if (fill.current) { fill.current.intensity = .8 + sun.daylight * .75; fill.current.color.set(sun.daylight > .5 ? "#eee0bf" : "#a1b5d8"); }
    if (fog.current) fog.current.color.copy(r.hazeNight).lerp(r.hazeDay, sun.daylight);
    if (flames.current) { flames.current.visible = sun.daylight < .95; flames.current.scale.y = reduced ? 1 : 1 + Math.sin(s.elapsed * 1.3) * .035; }
    if (flameLight.current) flameLight.current.intensity = (1 - sun.daylight) * 16;
    r.band.uniforms.uTime.value = reduced ? 0 : s.elapsed;
    r.band.uniforms.uOpacity.value = s.opacity; r.band.uniforms.uColor.value.lerp(r.accent.set(active?.color ?? "#dfac55"), 1 - Math.exp(-5 * dt));
    if (lightBand.current) lightBand.current.visible = s.opacity > .001;
  });
  return <>
    <mesh material={r.sky}><sphereGeometry args={[100, 24, 12]} /></mesh>
    <fog ref={fog} attach="fog" args={["#c7c5a0", 12, 64]} />
    <hemisphereLight ref={fill} args={["#d1ded2", "#666447", 1.5]} />
    <directionalLight ref={key} position={[8, 9, 5]} intensity={3.2} color="#ffcf88" castShadow={!small} shadow-mapSize={[512, 512]} shadow-camera-left={-11} shadow-camera-right={11} shadow-camera-top={12} shadow-camera-bottom={-10} shadow-camera-near={.5} shadow-camera-far={48} shadow-bias={-.001} shadow-normalBias={.025} />
    <directionalLight position={[-4, 6, 8]} intensity={.55} color="#e9d7b0" />
    <group scale={[1, small ? .93 : 1, 1]}>
      <mesh ref={lightBand} material={r.band} position={[PYRAMID_X, STAIR_RISE / 2 + .26, STAIR_FRONT - STAIR_RUN / 2 + .03]} rotation={[-Math.atan2(STAIR_RUN, STAIR_RISE), 0, 0]}><planeGeometry args={[.62, Math.hypot(STAIR_RUN, STAIR_RISE)]} /></mesh>
      <pointLight ref={flameLight} position={[PYRAMID_X, 3.1, -4.2]} color="#ff9d48" distance={11} decay={2} intensity={0} />
      {[-1, 1].flatMap(side => [0, 1, 2].map(i => <group key={`${side}/${i}`} position={[PYRAMID_X + side * 1.43, .6 + i * 1.93, STAIR_FRONT - .1 - i * 1.4]}>
        <mesh castShadow><cylinderGeometry args={[.19, .24, .36, 8]} /><Surface color="#807b52" roughness={.94} /></mesh>
        <mesh position={[0, .2, 0]}><cylinderGeometry args={[.27, .13, .14, 10]} /><Surface color="#5a5039" roughness={1} /></mesh>
      </group>))}
      <group ref={flames}>
        {[-1, 1].flatMap(side => [0, 1, 2].map(i => <group key={`${side}/${i}`} position={[PYRAMID_X + side * 1.43, .99 + i * 1.93, STAIR_FRONT - .1 - i * 1.4]}>
          <mesh scale={[.095, .27, .095]}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#e9a548" transparent opacity={.8} /></mesh>
        </group>))}
      </group>
    </group>
  </>;
}

function ContactShade() {
  const map = useMemo(() => {
    const item = canvas(128), c = item.context, g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "#222e24aa"); g.addColorStop(.5, "#222e2455"); g.addColorStop(1, "#222e2400");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); return item.texture;
  }, []);
  useEffect(() => () => map.dispose(), [map]);
  return <mesh position={[-.6, .036, 1.6]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[11, 4]} /><meshBasicMaterial map={map} transparent depthWrite={false} /></mesh>;
}

export default function Scene(props: SceneContentProps) {
  return <SmallScene.Provider value={props.small}>
    <Atmosphere {...props} />
    <Masonry />
    <Jungle small={props.small} running={props.running} reduced={props.reduced} />
    <ContactShade />
    <Calendar {...props} />
  </SmallScene.Provider>;
}
