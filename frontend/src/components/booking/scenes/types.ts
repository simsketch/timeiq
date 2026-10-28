import type { ComponentType } from "react";
import type { MeetingType } from "../booking-profile";

export type SceneId = "soft-watches" | "time-machine" | "sanctum" | "orrery" | "solstice" | "maya";

/** A host can also choose no scene: the booking page is just their profile. */
export const NO_SCENE = "none";

/**
 * What every scene's content receives. The shared SceneCanvas owns the
 * <Canvas>, the camera and its controls, frame pacing and the ready signal;
 * a scene only renders its world (meshes, lights, sky, fog) and animates it in
 * useFrame. Scenes must never move the camera.
 */
export interface SceneContentProps {
  /** The meeting type being hovered or focused, or null. Show its duration. */
  active: MeetingType | null;
  /** False while hidden or offscreen; skip work in useFrame when false. */
  running: boolean;
  /** prefers-reduced-motion is not used today (it shows the painting), but
   *  scenes should still honor it: no ambient motion, clocks still correct. */
  reduced: boolean;
  /** Phone-sized viewport: lighter geometry, no costly effects. */
  small: boolean;
}

type Vec3 = [number, number, number];

export interface SceneCamera {
  position: Vec3;
  target: Vec3;
  fov: number;
  /** fov on phones, usually a little narrower or wider to fit the band. */
  fovSmall: number;
  /** Phone camera position, if the composition needs a different framing. */
  positionSmall?: Vec3;
  near?: number;
  far?: number;
  /** Orbit limits around target, in world units and radians. */
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  /** Azimuth limits relative to the default view's azimuth. */
  azimuthRange: number;
}

export interface SceneDefinition {
  id: SceneId;
  name: string;
  /** One line for the Settings picker. */
  blurb: string;
  /** Painted fallback (1024x1536 and 640x960 WebP) under /public/booking. */
  still: string;
  still640: string;
  /** CSS background behind the loader, matching the scene's sky. */
  backdrop: string;
  /** Ink for the wordmark, caption and camera buttons over the art. */
  ink: "dark" | "light";
  camera: SceneCamera;
  toneMappingExposure?: number;
  shadows?: boolean;
  load: () => Promise<{ default: ComponentType<SceneContentProps> }>;
}
