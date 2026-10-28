import type { SceneDefinition, SceneId } from "./types";

export type { SceneId } from "./types";

export const DEFAULT_SCENE: SceneId = "soft-watches";

const deg = Math.PI / 180;

export const SCENES: Record<SceneId, SceneDefinition> = {
  "soft-watches": {
    id: "soft-watches",
    name: "Soft watches",
    blurb: "Melting pocket watches in a golden-hour desert.",
    still: "/booking/desert-still.webp",
    still640: "/booking/desert-still-640.webp",
    backdrop: "linear-gradient(#d6d3ed, #eed6c7 60%, #e8b98d)",
    ink: "dark",
    camera: {
      position: [4.6, 5.4, 15.8], positionSmall: [4.5, 5.6, 16.8], target: [-.05, 2.5, 0],
      fov: 33.5, fovSmall: 31, far: 190,
      minDistance: 9, maxDistance: 22, minPolarAngle: 55 * deg, maxPolarAngle: 86 * deg, azimuthRange: 50 * deg,
    },
    load: () => import("./soft-watches"),
  },
  "time-machine": {
    id: "time-machine",
    name: "The Time Machine",
    blurb: "A Victorian brass machine in a gaslit study, its dials set to today.",
    still: "/booking/time-machine-still.webp",
    still640: "/booking/time-machine-still-640.webp",
    backdrop: "linear-gradient(#182421, #302b20 60%, #49301e)",
    ink: "light",
    camera: {
      position: [5.6, 5.8, 13.2], positionSmall: [3.9, 4.1, 10], target: [0, 1.8, 0],
      fov: 35, fovSmall: 39, far: 45,
      minDistance: 6.3, maxDistance: 16.5, minPolarAngle: 56 * deg, maxPolarAngle: 82 * deg, azimuthRange: 34 * deg,
    },
    toneMappingExposure: 1.25,
    load: () => import("./time-machine"),
  },
  sanctum: {
    id: "sanctum",
    name: "Sanctum",
    blurb: "Golden rune circles turning around a loop of time.",
    still: "/booking/sanctum-still.webp",
    still640: "/booking/sanctum-still-640.webp",
    backdrop: "linear-gradient(#101329, #1b1d35 60%, #171827)",
    ink: "light",
    camera: {
      position: [.5, 4.7, 11.8], positionSmall: [.25, 4.4, 9.7], target: [0, 3.3, 0], fov: 39, fovSmall: 40,
      minDistance: 8, maxDistance: 13.5, minPolarAngle: 68 * deg, maxPolarAngle: 85 * deg, azimuthRange: 42 * deg,
    },
    toneMappingExposure: 1.1,
    shadows: false,
    load: () => import("./sanctum"),
  },
  orrery: {
    id: "orrery",
    name: "Orrery",
    blurb: "A brass clockwork solar system adrift in deep space.",
    still: "/booking/orrery-still.webp",
    still640: "/booking/orrery-still-640.webp",
    backdrop: "#050913",
    ink: "light",
    shadows: false,
    toneMappingExposure: 1.1,
    camera: {
      position: [7.5, 7.6, 14], positionSmall: [3.6, 3.9, 6.7], target: [0, -.7, 0],
      fov: 38, fovSmall: 39, far: 150,
      minDistance: 5, maxDistance: 22, minPolarAngle: 50 * deg, maxPolarAngle: 78 * deg,
      // Finite ±180° limits wrap to the same angle in OrbitControls.
      azimuthRange: Infinity,
    },
    load: () => import("./orrery"),
  },
  solstice: {
    id: "solstice",
    name: "Solstice",
    blurb: "An ancient stone circle keeping time by the sun.",
    still: "/booking/solstice-still.webp",
    still640: "/booking/solstice-still-640.webp",
    backdrop: "linear-gradient(#c9d4e6, #ecd8bf 60%, #b8a07a)",
    ink: "dark",
    camera: {
      position: [9, 4.5, 14], target: [0, 1.5, 0], fov: 36, fovSmall: 40,
      minDistance: 9, maxDistance: 26, minPolarAngle: 45 * deg, maxPolarAngle: 86 * deg, azimuthRange: 180 * deg,
    },
    load: () => import("./solstice"),
  },
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

export function sceneFor(id: string | null | undefined): SceneDefinition {
  return SCENES[(id && id in SCENES ? id : DEFAULT_SCENE) as SceneId];
}
