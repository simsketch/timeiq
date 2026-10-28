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
    <color attach="background" args={["#d79a62"]} />
    <ambientLight intensity={1.2} />
    <directionalLight position={[4, 6, 5]} intensity={2} />
    <mesh ref={mesh} position={[0, 2, 0]}><torusGeometry args={[1.6, .35, 24, 64]} /><meshStandardMaterial color="#b9a27c" roughness={.9} /></mesh>
  </>;
}
