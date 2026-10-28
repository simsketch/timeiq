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
    toneMappingExposure: 1,
    load: () => import("./time-machine"),
  },
  sanctum: {
    id: "sanctum",
    name: "Sanctum",
    blurb: "Golden rune circles turning around a loop of time.",
    still: "/booking/sanctum-still.webp",
    still640: "/booking/sanctum-still-640.webp",
    backdrop: "linear-gradient(#141226, #251c3a 60%, #3a2a3a)",
    ink: "light",
    camera: {
      position: [0, 2.2, 9.5], target: [0, 2, 0], fov: 40, fovSmall: 44,
      minDistance: 6, maxDistance: 14, minPolarAngle: 60 * deg, maxPolarAngle: 100 * deg, azimuthRange: 60 * deg,
    },
    load: () => import("./sanctum"),
  },
  orrery: {
    id: "orrery",
    name: "Orrery",
    blurb: "A brass clockwork solar system adrift in deep space.",
    still: "/booking/orrery-still.webp",
    still640: "/booking/orrery-still-640.webp",
    backdrop: "linear-gradient(#070a18, #10142c 60%, #1c1a33)",
    ink: "light",
    camera: {
      position: [6, 5, 11], target: [0, 0, 0], fov: 38, fovSmall: 42,
      minDistance: 7, maxDistance: 20, minPolarAngle: 25 * deg, maxPolarAngle: 95 * deg, azimuthRange: 180 * deg,
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
