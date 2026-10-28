"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ElementRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { MeetingType } from "../booking-profile";
import type { SceneContentProps, SceneDefinition } from "./types";

/** Imperative handle for the on-page camera buttons. */
export interface CameraRig {
  zoom(direction: 1 | -1): void;
  orbit(direction: 1 | -1): void;
  reset(): void;
}

type Controls = ElementRef<typeof OrbitControls>;

// After this long without input the camera drifts back to the composed view.
const IDLE_RETURN_MS = 7000;

function Pacer({ running, small }: { running: boolean; small: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!running) return;
    // Demand rendering: nothing draws while hidden or offscreen. 24fps is
    // plenty for slow ambient motion and damped camera moves; phones get 16.
    const timer = setInterval(() => invalidate(), 1000 / (small ? 16 : 24));
    invalidate();
    return () => clearInterval(timer);
  }, [running, small, invalidate]);
  return null;
}

function Rig({ definition, small, active, rigRef }: {
  definition: SceneDefinition;
  small: boolean;
  active: MeetingType | null;
  rigRef: MutableRefObject<CameraRig | null>;
}) {
  const controls = useRef<Controls>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const cam = definition.camera;
  const home = useMemo(() => new THREE.Vector3(...(small && cam.positionSmall ? cam.positionSmall : cam.position)), [cam, small]);
  const target = useMemo(() => new THREE.Vector3(...cam.target), [cam]);
  const homeAzimuth = useMemo(() => Math.atan2(home.x - target.x, home.z - target.z), [home, target]);
  const state = useRef({ interacting: false, last: 0, goal: null as THREE.Spherical | null });
  const scratch = useMemo(() => ({ offset: new THREE.Vector3(), spherical: new THREE.Spherical(), want: new THREE.Vector3() }), []);

  const spherical = useCallback(() => {
    const c = controls.current;
    scratch.offset.copy(camera.position).sub(c ? c.target : target);
    return new THREE.Spherical().setFromVector3(scratch.offset);
  }, [camera, scratch, target]);

  useEffect(() => {
    rigRef.current = {
      zoom(direction) {
        const s = state.current.goal ?? spherical();
        s.radius = THREE.MathUtils.clamp(s.radius * (direction > 0 ? .82 : 1.22), cam.minDistance, cam.maxDistance);
        state.current.goal = s;
        invalidate();
      },
      orbit(direction) {
        const s = state.current.goal ?? spherical();
        s.theta = THREE.MathUtils.clamp(s.theta + direction * .28, homeAzimuth - cam.azimuthRange, homeAzimuth + cam.azimuthRange);
        state.current.goal = s;
        invalidate();
      },
      reset() {
        state.current.goal = null;
        state.current.last = 0;
        invalidate();
      },
    };
    return () => { rigRef.current = null; };
  }, [rigRef, spherical, cam, homeAzimuth, invalidate]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    const k = 1 - Math.exp(-Math.min(delta, .1) * 2.6);
    const s = state.current;
    if (s.goal) {
      // Button moves ease toward their goal, then count as fresh input.
      const now = spherical();
      now.radius += (s.goal.radius - now.radius) * k;
      now.theta += (s.goal.theta - now.theta) * k;
      now.phi += (s.goal.phi - now.phi) * k;
      camera.position.copy(c.target).add(scratch.offset.setFromSpherical(now));
      if (Math.abs(now.radius - s.goal.radius) < .01 && Math.abs(now.theta - s.goal.theta) < .002) s.goal = null;
      s.last = performance.now();
    } else if (!s.interacting && performance.now() - s.last > IDLE_RETURN_MS) {
      // Drift home, leaning in a little while a meeting is highlighted.
      scratch.want.copy(home).sub(target).multiplyScalar(active ? .9 : 1).add(target);
      camera.position.lerp(scratch.want, k * .6);
      c.target.lerp(target, k * .6);
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={cam.target}
      enableDamping
      dampingFactor={.08}
      enablePan={false}
      enableZoom={false}
      // Phones scroll with one finger, so dragging is desktop-only there; the
      // on-page buttons orbit and zoom everywhere.
      enableRotate={!small}
      rotateSpeed={.45}
      minDistance={cam.minDistance}
      maxDistance={cam.maxDistance}
      minPolarAngle={cam.minPolarAngle}
      maxPolarAngle={cam.maxPolarAngle}
      minAzimuthAngle={homeAzimuth - cam.azimuthRange}
      maxAzimuthAngle={homeAzimuth + cam.azimuthRange}
      onStart={() => { state.current.interacting = true; state.current.goal = null; }}
      onEnd={() => { state.current.interacting = false; state.current.last = performance.now(); }}
    />
  );
}

function WarmShaders({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    // Compile every program before revealing the canvas, so the crossfade
    // never shows a half-drawn first frame.
    gl.compileAsync(scene, camera).then(() => { if (!cancelled) onReady(); });
    return () => { cancelled = true; };
  }, [gl, scene, camera, onReady]);
  return null;
}

export function SceneCanvas({ definition, Content, active, running, small, rigRef, onReady }: {
  definition: SceneDefinition;
  Content: ComponentType<SceneContentProps>;
  active: MeetingType | null;
  running: boolean;
  small: boolean;
  rigRef: MutableRefObject<CameraRig | null>;
  onReady: () => void;
}) {
  const [compiled, setCompiled] = useState(false);
  const ready = useCallback(() => { setCompiled(true); onReady(); }, [onReady]);
  const cam = definition.camera;
  const live = running && compiled;
  return (
    <Canvas
      aria-hidden="true"
      frameloop={live ? "demand" : "never"}
      dpr={[1, small ? 1.25 : 1.75]}
      shadows={definition.shadows === false ? false : { type: THREE.PCFShadowMap }}
      camera={{ position: small && cam.positionSmall ? cam.positionSmall : cam.position, fov: small ? cam.fovSmall : cam.fov, near: cam.near ?? .1, far: cam.far ?? 200 }}
      gl={{ antialias: true, alpha: false, powerPreference: "low-power", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: definition.toneMappingExposure ?? 1 }}
      style={{ position: "absolute", inset: 0, opacity: compiled ? 1 : 0, cursor: small ? "default" : "grab" }}
    >
      <Pacer running={live} small={small} />
      <Rig definition={definition} small={small} active={active} rigRef={rigRef} />
      <Content active={active} running={live} reduced={false} small={small} />
      <WarmShaders onReady={ready} />
    </Canvas>
  );
}
