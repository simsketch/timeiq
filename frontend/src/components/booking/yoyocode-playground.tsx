"use client";

import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import {
  Float,
  OrthographicCamera,
  Html,
  ContactShadows,
  Sparkles,
} from "@react-three/drei";
import { useRef, useState, useMemo, useEffect } from "react";
import * as THREE from "three";

export interface PlaygroundEventType {
  id: number;
  name: string;
  slug: string;
  duration_minutes: number;
  color: string;
}

interface YoyoCodePlaygroundProps {
  eventTypes: PlaygroundEventType[];
  onSelect: (event: PlaygroundEventType) => void;
}

/* -------------------------------------------------------------------------- */
/*                                 Clock core                                 */
/* -------------------------------------------------------------------------- */

function IsometricClock() {
  const hour = useRef<THREE.Group>(null);
  const minute = useRef<THREE.Group>(null);
  const second = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (hour.current) hour.current.rotation.z -= delta * 0.06;
    if (minute.current) minute.current.rotation.z -= delta * 0.7;
    if (second.current) second.current.rotation.z -= delta * 1.8;
  });

  // Tick positions — 12 marks around face (XY plane, upright)
  const ticks = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return {
        x: Math.sin(a) * 1.35,
        y: Math.cos(a) * 1.35,
        major: i % 3 === 0,
      };
    });
  }, []);

  // Clock is upright (face in XY plane, normal along +Z) and slightly tilted
  // backward for a dynamic isometric read. Float gives it a gentle idle bob.
  return (
    <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.3}>
      <group position={[0, 1.6, 0]} rotation={[-0.08, 0.25, 0]}>
        {/* Back plate (closes the cylinder so light doesn't bleed through) */}
        <mesh position={[0, 0, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.48, 1.48, 0.05, 96]} />
          <meshStandardMaterial
            color="#f3f0ff"
            metalness={0.1}
            roughness={0.6}
          />
        </mesh>
        {/* Dial face — opaque enamel so ticks + hands read cleanly */}
        <mesh position={[0, 0, -0.04]}>
          <circleGeometry args={[1.42, 96]} />
          <meshStandardMaterial
            color="#faf8ff"
            metalness={0.05}
            roughness={0.5}
          />
        </mesh>
        {/* Soft inner radial vignette */}
        <mesh position={[0, 0, -0.039]}>
          <circleGeometry args={[1.42, 96]} />
          <meshBasicMaterial
            color="#ede9fe"
            transparent
            opacity={0.45}
          />
        </mesh>

        {/* Outer aurora bezel */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.5, 0.08, 32, 128]} />
          <meshStandardMaterial
            color="#6366f1"
            emissive="#8b5cf6"
            emissiveIntensity={0.75}
            metalness={0.95}
            roughness={0.12}
          />
        </mesh>

        {/* Secondary bezel ring — aurora gradient-feeling accent */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <torusGeometry args={[1.42, 0.03, 24, 96]} />
          <meshStandardMaterial
            color="#22d3ee"
            emissive="#22d3ee"
            emissiveIntensity={0.5}
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>

        {/* Glass crystal (thin transparent cover — gives depth + reflections) */}
        <mesh position={[0, 0, 0.03]}>
          <circleGeometry args={[1.42, 96]} />
          <meshPhysicalMaterial
            color="#ffffff"
            transmission={0.95}
            thickness={0.15}
            roughness={0.05}
            clearcoat={1}
            clearcoatRoughness={0.02}
            ior={1.45}
            reflectivity={0.6}
            transparent
            opacity={0.5}
          />
        </mesh>

        {/* Inner hairline accent */}
        <mesh position={[0, 0, 0.045]}>
          <ringGeometry args={[1.18, 1.21, 96]} />
          <meshBasicMaterial color="#6366f1" transparent opacity={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.045]}>
          <ringGeometry args={[0.62, 0.64, 64]} />
          <meshBasicMaterial color="#a78bfa" transparent opacity={0.22} />
        </mesh>

        {/* Tick marks (upright, facing camera) */}
        {ticks.map((t, i) => (
          <mesh key={i} position={[t.x, t.y, 0.05]}>
            <sphereGeometry args={[t.major ? 0.065 : 0.035, 16, 16]} />
            <meshStandardMaterial
              color={t.major ? "#6366f1" : "#94a3b8"}
              emissive={t.major ? "#6366f1" : "#000000"}
              emissiveIntensity={t.major ? 0.6 : 0}
            />
          </mesh>
        ))}

        {/* Hour hand — rotates around Z, pointing up by default */}
        <group ref={hour} position={[0, 0, 0.09]}>
          <mesh position={[0, 0.38, 0]}>
            <boxGeometry args={[0.1, 0.82, 0.06]} />
            <meshStandardMaterial
              color="#1a1a2e"
              metalness={0.55}
              roughness={0.22}
            />
          </mesh>
        </group>

        {/* Minute hand */}
        <group ref={minute} position={[0, 0, 0.11]}>
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.065, 1.22, 0.06]} />
            <meshStandardMaterial
              color="#6366f1"
              emissive="#6366f1"
              emissiveIntensity={0.45}
            />
          </mesh>
        </group>

        {/* Second hand (accent) */}
        <group ref={second} position={[0, 0, 0.13]}>
          <mesh position={[0, 0.62, 0]}>
            <boxGeometry args={[0.025, 1.32, 0.035]} />
            <meshStandardMaterial
              color="#f97316"
              emissive="#f97316"
              emissiveIntensity={1.1}
            />
          </mesh>
          {/* Counterweight */}
          <mesh position={[0, -0.18, 0]}>
            <boxGeometry args={[0.06, 0.32, 0.035]} />
            <meshStandardMaterial
              color="#f97316"
              emissive="#f97316"
              emissiveIntensity={0.9}
            />
          </mesh>
        </group>

        {/* Pivot */}
        <mesh position={[0, 0, 0.15]}>
          <cylinderGeometry args={[0.14, 0.14, 0.06, 32]} />
          <meshStandardMaterial
            color="#ffffff"
            metalness={0.85}
            roughness={0.12}
          />
        </mesh>
        <mesh position={[0, 0, 0.18]}>
          <cylinderGeometry args={[0.05, 0.05, 0.04, 24]} />
          <meshStandardMaterial
            color="#6366f1"
            emissive="#6366f1"
            emissiveIntensity={0.7}
          />
        </mesh>
      </group>
    </Float>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Orbiting event card                             */
/* -------------------------------------------------------------------------- */

function OrbitingEvent({
  event,
  index,
  total,
  onSelect,
}: {
  event: PlaygroundEventType;
  index: number;
  total: number;
  onSelect: (e: PlaygroundEventType) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [down, setDown] = useState(false);
  const baseAngle = (index / Math.max(total, 1)) * Math.PI * 2;
  // Slightly elongated orbit: wider on X than Y so it reads from iso angle
  const radiusX = 3.6;
  const radiusY = 1.4;
  const targetScale = useRef(1);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime * 0.22 + baseAngle;
    // Orbit lives in a tilted plane around the clock center (0, 1.6, 0)
    const ox = Math.cos(t) * radiusX;
    const oy = Math.sin(t) * radiusY;
    groupRef.current.position.x = ox;
    groupRef.current.position.y = 1.6 + oy;
    // Push chips behind/in front depending on angle for parallax depth
    groupRef.current.position.z = Math.sin(t) * 0.6;

    // Card always faces the camera (billboard on Y)
    groupRef.current.rotation.y = 0;
    groupRef.current.rotation.z =
      Math.sin(state.clock.elapsedTime * 0.7 + baseAngle) * 0.05;

    // Scale spring
    targetScale.current = down ? 0.94 : hovered ? 1.15 : 1;
    groupRef.current.scale.lerp(
      new THREE.Vector3(
        targetScale.current,
        targetScale.current,
        targetScale.current
      ),
      0.15
    );
  });

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  };
  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    setDown(false);
    document.body.style.cursor = "";
  };
  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDown(true);
  };
  const handleUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDown(false);
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(event);
  };

  return (
    <group
      ref={groupRef}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onClick={handleClick}
    >
      {/* Card body (glass) */}
      <mesh>
        <boxGeometry args={[1.6, 0.78, 0.12]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transmission={0.85}
          thickness={0.35}
          roughness={0.08}
          clearcoat={1}
          clearcoatRoughness={0.04}
          ior={1.35}
          transparent
          opacity={0.96}
        />
      </mesh>

      {/* Back glow plane when hovered */}
      <mesh position={[0, 0, -0.08]}>
        <planeGeometry args={[1.9, 1.05]} />
        <meshBasicMaterial
          color={event.color}
          transparent
          opacity={hovered ? 0.35 : 0.12}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Front accent tint on hover */}
      <mesh position={[0, 0, 0.061]}>
        <planeGeometry args={[1.6, 0.78]} />
        <meshBasicMaterial
          color={event.color}
          transparent
          opacity={hovered ? 0.14 : 0}
        />
      </mesh>

      {/* Accent bar */}
      <mesh position={[-0.75, 0, 0.065]}>
        <boxGeometry args={[0.05, 0.62, 0.008]} />
        <meshStandardMaterial
          color={event.color}
          emissive={event.color}
          emissiveIntensity={hovered ? 1.6 : 0.65}
        />
      </mesh>

      {/* Label overlay — screen-space HTML, no 3D transform, predictable sizing */}
      <Html
        position={[0, 0, 0.07]}
        center
        zIndexRange={[20, 10]}
        pointerEvents="none"
      >
        <div
          className="pointer-events-none select-none flex flex-col items-center gap-1.5"
          style={{ width: 170 }}
        >
          <div
            className="font-display leading-tight tracking-[-0.02em] text-center text-pretty"
            style={{ color: "#0b0b14", fontSize: 19, fontWeight: 700 }}
          >
            {event.name}
          </div>
          <div
            className="font-mono uppercase rounded-full"
            style={{
              color: "#ffffff",
              background: `linear-gradient(135deg, ${event.color}, ${event.color}cc)`,
              boxShadow: `0 4px 12px -4px ${event.color}aa`,
              fontSize: 9.5,
              letterSpacing: "0.22em",
              padding: "2.5px 9px",
            }}
          >
            {event.duration_minutes} min
          </div>
        </div>
      </Html>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Ground disc                                 */
/* -------------------------------------------------------------------------- */

function GroundDisc() {
  return (
    <group position={[0, -0.4, 0]}>
      {/* Hazy base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.5, 64]} />
        <meshBasicMaterial color="#e0e7ff" transparent opacity={0.18} />
      </mesh>
      {/* Aurora ring rings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[2.0, 2.03, 96]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[3.2, 3.23, 96]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[4.4, 4.43, 96]} />
        <meshBasicMaterial color="#ec4899" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Scene root                                   */
/* -------------------------------------------------------------------------- */

function SceneRoot({ eventTypes, onSelect }: YoyoCodePlaygroundProps) {
  const root = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame(() => {
    if (!root.current) return;
    root.current.rotation.y = THREE.MathUtils.lerp(
      root.current.rotation.y,
      pointer.x * 0.15,
      0.05
    );
    root.current.rotation.x = THREE.MathUtils.lerp(
      root.current.rotation.x,
      pointer.y * -0.06,
      0.05
    );
  });

  // Prefer at least 4 chips for visual density
  const chips = useMemo(() => {
    if (eventTypes.length === 0) return [];
    const out: PlaygroundEventType[] = [...eventTypes];
    while (out.length < 4) out.push(...eventTypes);
    return out.slice(0, Math.max(4, eventTypes.length));
  }, [eventTypes]);

  return (
    <group ref={root}>
      <IsometricClock />
      <GroundDisc />
      <ContactShadows
        position={[0, -0.38, 0]}
        opacity={0.5}
        scale={10}
        blur={2.6}
        far={4}
        resolution={512}
      />
      {chips.map((event, i) => (
        <OrbitingEvent
          key={`${event.id}-${i}`}
          event={event}
          index={i}
          total={chips.length}
          onSelect={onSelect}
        />
      ))}
      <Sparkles
        count={70}
        scale={[9, 5, 9]}
        size={4}
        speed={0.35}
        color="#a78bfa"
        opacity={0.7}
        position={[0, 1.8, 0]}
      />
      <Sparkles
        count={30}
        scale={[6, 3, 6]}
        size={2.2}
        speed={0.6}
        color="#22d3ee"
        opacity={0.55}
        position={[0, 2, 0]}
      />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Isometric camera                               */
/* -------------------------------------------------------------------------- */

function IsoCamera() {
  const ref = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();
  useEffect(() => {
    if (!ref.current) return;
    ref.current.lookAt(0, 1.4, 0);
    ref.current.updateProjectionMatrix();
  }, []);
  // Tuned zooms so full composition breathes without cropping chips
  const zoom = size.width < 720 ? 54 : size.width < 1100 ? 68 : 82;
  return (
    <OrthographicCamera
      ref={ref}
      makeDefault
      position={[7, 5.5, 9]}
      zoom={zoom}
      near={0.1}
      far={100}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                              Canvas wrapper                                */
/* -------------------------------------------------------------------------- */

export function YoyoCodePlayground({
  eventTypes,
  onSelect,
}: YoyoCodePlaygroundProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <IsoCamera />

      {/* Lighting rig */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.3}
        color="#ffffff"
      />
      <pointLight
        position={[-4, 3, 3]}
        intensity={16}
        color="#ec4899"
        distance={12}
      />
      <pointLight
        position={[4, 3, -4]}
        intensity={16}
        color="#22d3ee"
        distance={12}
      />
      <pointLight
        position={[0, 5, 0]}
        intensity={10}
        color="#a78bfa"
        distance={10}
      />

      <SceneRoot eventTypes={eventTypes} onSelect={onSelect} />
    </Canvas>
  );
}
