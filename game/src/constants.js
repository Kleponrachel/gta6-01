// Velamar's grid, shared by every module. Kept in its own file so no two
// modules can import each other through it (textures <-> city).
export const PITCH = 80;
export const ROAD_LINES = [-280, -200, -120, -40, 40, 120, 200, 280];
export const CITY_HALF = 288;
export const GROUND_HALF = 320;
export const BLOCK_CENTERS = [-240, -160, -80, 0, 80, 160, 240];

// Fixed story locations, all on streets or sidewalks so missions can reach them.
export const LANDMARKS = {
  spawn: { x: -44, z: -124 },
  pistol: { x: -36, z: -116 },
  marina: { x: 120, z: 272 },
  docks: { x: -264, z: 120 },
  store: { x: 52, z: 52 },
  safehouse: { x: 0, z: -264 },
  harbor: { x: 264, z: -120 },
  autoshop: { x: -120, z: 208 },
};
