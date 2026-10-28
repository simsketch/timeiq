import { NO_SCENE, RANDOM_SCENE, type SceneDefinition, type SceneId } from "./types";

export type { SceneId } from "./types";
export { NO_SCENE, RANDOM_SCENE } from "./types";

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
    backdrop: "linear-gradient(#a9c9e1, #d5dfdf 55%, #64744e)",
    ink: "dark",
    camera: {
      position: [9.5, 4.8, 18.8], positionSmall: [7.8, 7.6, 19.5], target: [0, 2.45, 0], fov: 40, fovSmall: 40, far: 210,
      minDistance: 15, maxDistance: 28, minPolarAngle: 45 * deg, maxPolarAngle: 84 * deg, azimuthRange: 45 * deg,
    },
    toneMappingExposure: .98,
    load: () => import("./solstice"),
  },
  maya: {
    id: "maya",
    name: "Maya calendar",
    blurb: "Carved calendar wheels set to today's Maya date, beside a stepped pyramid.",
    still: "/booking/maya-still.webp",
    still640: "/booking/maya-still-640.webp",
    backdrop: "linear-gradient(#e9c79a, #d79a62 60%, #6f7a4a)",
    ink: "dark",
    camera: {
      position: [7, 4, 13], target: [0, 2, 0], fov: 38, fovSmall: 42,
      minDistance: 8, maxDistance: 22, minPolarAngle: 50 * deg, maxPolarAngle: 86 * deg, azimuthRange: 60 * deg,
    },
    load: () => import("./maya"),
  },
  "world-clocks": {
    id: "world-clocks",
    name: "Wall of clocks",
    blurb: "Antique clocks, each keeping the real time in a city around the world.",
    still: "/booking/world-clocks-still.webp",
    still640: "/booking/world-clocks-still-640.webp",
    backdrop: "linear-gradient(#3a2c22, #5a4330 60%, #2c211a)",
    ink: "light",
    camera: {
      position: [0, 2.2, 9], target: [0, 2.2, 0], fov: 40, fovSmall: 46,
      minDistance: 5, maxDistance: 12, minPolarAngle: 70 * deg, maxPolarAngle: 100 * deg, azimuthRange: 35 * deg,
    },
    load: () => import("./world-clocks"),
  },
  "atomic": {
    id: "atomic",
    name: "Atomic clock",
    blurb: "Laser-cooled atoms rising and falling in a cesium fountain, ticking real seconds.",
    still: "/booking/atomic-still.webp",
    still640: "/booking/atomic-still-640.webp",
    backdrop: "linear-gradient(#0b1020, #141b33 60%, #0d1222)",
    ink: "light",
    camera: {
      position: [6, 3.5, 9], target: [0, 2.2, 0], fov: 38, fovSmall: 42,
      minDistance: 6, maxDistance: 15, minPolarAngle: 50 * deg, maxPolarAngle: 92 * deg, azimuthRange: 70 * deg,
    },
    load: () => import("./atomic"),
  },
  "lava-lamp": {
    id: "lava-lamp",
    name: "Lava lamp lounge",
    blurb: "A warm seventies den, lava lamps glowing beside a flip clock.",
    still: "/booking/lava-lamp-still.webp",
    still640: "/booking/lava-lamp-still-640.webp",
    backdrop: "linear-gradient(#302017, #5d3b27 65%, #39251a)",
    ink: "light",
    camera: {
      position: [4, 4.1, 11.5], positionSmall: [3.5, 4.7, 11.8], target: [0, 2.05, .25], fov: 40, fovSmall: 42, far: 70,
      minDistance: 8, maxDistance: 15, minPolarAngle: 60 * deg, maxPolarAngle: 84 * deg, azimuthRange: 32 * deg,
    },
    toneMappingExposure: 1.12,
    load: () => import("./lava-lamp"),
  },
  "digital-rain": {
    id: "digital-rain",
    name: "Digital rain",
    blurb: "Falling green code, with the real time resolving out of the stream.",
    still: "/booking/digital-rain-still.webp",
    still640: "/booking/digital-rain-still-640.webp",
    backdrop: "linear-gradient(#020604, #04120a 60%, #010302)",
    ink: "light",
    camera: {
      position: [0, 0, 10], target: [0, 0, 0], fov: 45, fovSmall: 52,
      minDistance: 6, maxDistance: 14, minPolarAngle: 70 * deg, maxPolarAngle: 110 * deg, azimuthRange: 40 * deg,
    },
    load: () => import("./digital-rain"),
  },
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

/** Resolve a stored choice for one page view: Random picks any scene. */
export function resolveSceneChoice(id: string | null | undefined): string | null | undefined {
  if (id !== RANDOM_SCENE) return id;
  return SCENE_IDS[Math.floor(Math.random() * SCENE_IDS.length)];
}

/** True when the host chose to show no scene on their booking page. */
export function isNoScene(id: string | null | undefined): boolean {
  return id === NO_SCENE;
}

export function sceneFor(id: string | null | undefined): SceneDefinition {
  return SCENES[(id && id in SCENES ? id : DEFAULT_SCENE) as SceneId];
}
