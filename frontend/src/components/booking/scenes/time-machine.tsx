"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { SceneContentProps } from "./types";

// Placeholder until this scene is built.
export default function Scene({ running }: SceneContentProps) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => { if (running && mesh.current) mesh.current.rotation.y += delta * .3; });
  return <>
    <color attach="background" args={["#1d1a2e"]} />
    <ambientLight intensity={1.2} />
    <directionalLight position={[4, 6, 5]} intensity={2} />
    <mesh ref={mesh} position={[0, 1.5, 0]}><torusKnotGeometry args={[1, .3, 128, 16]} /><meshStandardMaterial color="#c9a45c" metalness={.8} roughness={.3} /></mesh>
  </>;
}
