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
    backdrop: "linear-gradient(#2a1d17, #4a3020 60%, #6b4527)",
    ink: "light",
    camera: {
      position: [5.2, 3.2, 8.4], target: [0, 1.4, 0], fov: 38, fovSmall: 40,
      minDistance: 5, maxDistance: 13, minPolarAngle: 50 * deg, maxPolarAngle: 85 * deg, azimuthRange: 70 * deg,
    },
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
    // Compact procedural poster: this scene has no downloaded fallback assets.
    still: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221024%22%20height%3D%221536%22%20viewBox%3D%220%200%201024%201536%22%3E%3Cdefs%3E%3CradialGradient%20id%3D%22b%22%3E%3Cstop%20stop-color%3D%22%23172238%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23050913%22%2F%3E%3C%2FradialGradient%3E%3ClinearGradient%20id%3D%22g%22%3E%3Cstop%20stop-color%3D%22%237d5c2d%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23ebcc85%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%239b7438%22%2F%3E%3C%2FlinearGradient%3E%3CradialGradient%20id%3D%22s%22%3E%3Cstop%20stop-color%3D%22%23fff0bb%22%2F%3E%3Cstop%20offset%3D%22.38%22%20stop-color%3D%22%23ffc56a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffb44b%22%20stop-opacity%3D%220%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cpath%20fill%3D%22url(%23b)%22%20d%3D%22M0%200h1024v1536H0z%22%2F%3E%3Cpath%20stroke%3D%22%23adbedc%22%20stroke-width%3D%222%22%20opacity%3D%22.5%22%20d%3D%22M94%20240h2m122%20120h2m630-160h2M750%20390h2M180%201100h2m700%20180h2M530%20125h2M70%20920h2m855-300h2M420%201370h2%22%2F%3E%3Cg%20transform%3D%22translate(512%20830)%20scale(1%20.65)%22%20fill%3D%22none%22%20stroke%3D%22url(%23g)%22%3E%3Ccircle%20r%3D%22448%22%20stroke-width%3D%225%22%2F%3E%3Ccircle%20r%3D%22428%22%20stroke-width%3D%222%22%2F%3E%3Ccircle%20r%3D%22438%22%20stroke-width%3D%228%22%20stroke-dasharray%3D%221%2023%22%2F%3E%3Ccircle%20r%3D%22380%22%2F%3E%3Ccircle%20r%3D%22330%22%2F%3E%3Ccircle%20r%3D%22280%22%2F%3E%3Ccircle%20r%3D%22230%22%2F%3E%3Ccircle%20r%3D%22180%22%2F%3E%3Ccircle%20r%3D%22130%22%2F%3E%3Cpath%20stroke-width%3D%223%22%20d%3D%22M0%200%20170-95M0%200%20300%20160M0%200%20100%20310M0%200-240%20220M0%200-340-110M0%200-150-265M0%200%2010-130%22%2F%3E%3Ccircle%20r%3D%2273%22%20stroke-width%3D%2217%22%20stroke-dasharray%3D%228%206%22%2F%3E%3Ccircle%20cx%3D%2298%22%20r%3D%2232%22%20stroke-width%3D%2210%22%20stroke-dasharray%3D%226%205%22%2F%3E%3Ccircle%20cx%3D%22-75%22%20cy%3D%2270%22%20r%3D%2232%22%20stroke-width%3D%2210%22%20stroke-dasharray%3D%226%205%22%2F%3E%3C%2Fg%3E%3Cpath%20stroke%3D%22%23c6a466%22%20stroke-width%3D%227%22%20d%3D%22M512%20830v-130%22%2F%3E%3Cg%20stroke%3D%22%23d6ba7c%22%20stroke-width%3D%222%22%3E%3Ccircle%20cx%3D%22682%22%20cy%3D%22768%22%20r%3D%2219%22%20fill%3D%22%23c39566%22%2F%3E%3Ccircle%20cx%3D%22812%22%20cy%3D%22934%22%20r%3D%2218%22%20fill%3D%22%238da29c%22%2F%3E%3Ccircle%20cx%3D%22612%22%20cy%3D%221032%22%20r%3D%2220%22%20fill%3D%22%238d79a8%22%2F%3E%3Ccircle%20cx%3D%22272%22%20cy%3D%22973%22%20r%3D%2219%22%20fill%3D%22%23a18460%22%2F%3E%3Ccircle%20cx%3D%22172%22%20cy%3D%22758%22%20r%3D%2218%22%20fill%3D%22%237a9aa5%22%2F%3E%3Ccircle%20cx%3D%22362%22%20cy%3D%22658%22%20r%3D%2220%22%20fill%3D%22%23b4c0a4%22%2F%3E%3Ccircle%20cx%3D%22522%22%20cy%3D%22746%22%20r%3D%2217%22%20fill%3D%22%23ac7c57%22%2F%3E%3C%2Fg%3E%3Ccircle%20cx%3D%22512%22%20cy%3D%22710%22%20r%3D%22120%22%20fill%3D%22url(%23s)%22%20opacity%3D%22.35%22%2F%3E%3Ccircle%20cx%3D%22512%22%20cy%3D%22710%22%20r%3D%2235%22%20fill%3D%22%23ffdc8d%22%2F%3E%3C%2Fsvg%3E",
    still640: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221024%22%20height%3D%221536%22%20viewBox%3D%220%200%201024%201536%22%3E%3Cdefs%3E%3CradialGradient%20id%3D%22b%22%3E%3Cstop%20stop-color%3D%22%23172238%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23050913%22%2F%3E%3C%2FradialGradient%3E%3ClinearGradient%20id%3D%22g%22%3E%3Cstop%20stop-color%3D%22%237d5c2d%22%2F%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%23ebcc85%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%239b7438%22%2F%3E%3C%2FlinearGradient%3E%3CradialGradient%20id%3D%22s%22%3E%3Cstop%20stop-color%3D%22%23fff0bb%22%2F%3E%3Cstop%20offset%3D%22.38%22%20stop-color%3D%22%23ffc56a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffb44b%22%20stop-opacity%3D%220%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Cpath%20fill%3D%22url(%23b)%22%20d%3D%22M0%200h1024v1536H0z%22%2F%3E%3Cpath%20stroke%3D%22%23adbedc%22%20stroke-width%3D%222%22%20opacity%3D%22.5%22%20d%3D%22M94%20240h2m122%20120h2m630-160h2M750%20390h2M180%201100h2m700%20180h2M530%20125h2M70%20920h2m855-300h2M420%201370h2%22%2F%3E%3Cg%20transform%3D%22translate(512%20830)%20scale(1%20.65)%22%20fill%3D%22none%22%20stroke%3D%22url(%23g)%22%3E%3Ccircle%20r%3D%22448%22%20stroke-width%3D%225%22%2F%3E%3Ccircle%20r%3D%22428%22%20stroke-width%3D%222%22%2F%3E%3Ccircle%20r%3D%22438%22%20stroke-width%3D%228%22%20stroke-dasharray%3D%221%2023%22%2F%3E%3Ccircle%20r%3D%22380%22%2F%3E%3Ccircle%20r%3D%22330%22%2F%3E%3Ccircle%20r%3D%22280%22%2F%3E%3Ccircle%20r%3D%22230%22%2F%3E%3Ccircle%20r%3D%22180%22%2F%3E%3Ccircle%20r%3D%22130%22%2F%3E%3Cpath%20stroke-width%3D%223%22%20d%3D%22M0%200%20170-95M0%200%20300%20160M0%200%20100%20310M0%200-240%20220M0%200-340-110M0%200-150-265M0%200%2010-130%22%2F%3E%3Ccircle%20r%3D%2273%22%20stroke-width%3D%2217%22%20stroke-dasharray%3D%228%206%22%2F%3E%3Ccircle%20cx%3D%2298%22%20r%3D%2232%22%20stroke-width%3D%2210%22%20stroke-dasharray%3D%226%205%22%2F%3E%3Ccircle%20cx%3D%22-75%22%20cy%3D%2270%22%20r%3D%2232%22%20stroke-width%3D%2210%22%20stroke-dasharray%3D%226%205%22%2F%3E%3C%2Fg%3E%3Cpath%20stroke%3D%22%23c6a466%22%20stroke-width%3D%227%22%20d%3D%22M512%20830v-130%22%2F%3E%3Cg%20stroke%3D%22%23d6ba7c%22%20stroke-width%3D%222%22%3E%3Ccircle%20cx%3D%22682%22%20cy%3D%22768%22%20r%3D%2219%22%20fill%3D%22%23c39566%22%2F%3E%3Ccircle%20cx%3D%22812%22%20cy%3D%22934%22%20r%3D%2218%22%20fill%3D%22%238da29c%22%2F%3E%3Ccircle%20cx%3D%22612%22%20cy%3D%221032%22%20r%3D%2220%22%20fill%3D%22%238d79a8%22%2F%3E%3Ccircle%20cx%3D%22272%22%20cy%3D%22973%22%20r%3D%2219%22%20fill%3D%22%23a18460%22%2F%3E%3Ccircle%20cx%3D%22172%22%20cy%3D%22758%22%20r%3D%2218%22%20fill%3D%22%237a9aa5%22%2F%3E%3Ccircle%20cx%3D%22362%22%20cy%3D%22658%22%20r%3D%2220%22%20fill%3D%22%23b4c0a4%22%2F%3E%3Ccircle%20cx%3D%22522%22%20cy%3D%22746%22%20r%3D%2217%22%20fill%3D%22%23ac7c57%22%2F%3E%3C%2Fg%3E%3Ccircle%20cx%3D%22512%22%20cy%3D%22710%22%20r%3D%22120%22%20fill%3D%22url(%23s)%22%20opacity%3D%22.35%22%2F%3E%3Ccircle%20cx%3D%22512%22%20cy%3D%22710%22%20r%3D%2235%22%20fill%3D%22%23ffdc8d%22%2F%3E%3C%2Fsvg%3E",
    backdrop: "#050913",
    ink: "light",
    shadows: false,
    toneMappingExposure: 1.1,
    camera: {
      position: [7.5, 15.2, 12.45], positionSmall: [4, 11.5, 11.3], target: [0, 0, 0],
      fov: 35, fovSmall: 37, far: 150,
      minDistance: 10, maxDistance: 25, minPolarAngle: 25 * deg, maxPolarAngle: 72 * deg,
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
