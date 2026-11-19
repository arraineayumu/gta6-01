// Solara Bay — shared tuning and constants.
// The city is a grid of blocks separated by roads. All sizes are in world
// pixels; the camera shows a 1280x720 window of it.

export const STEP = 1 / 60;
export const VIEW_W = 1280;
export const VIEW_H = 720;

export const BLOCK = 240; // side of one city block
export const ROAD = 64; // width of a road
export const PITCH = BLOCK + ROAD; // block + road, the grid pitch
export const GRID = 9; // blocks per side
export const CITY = GRID * PITCH + ROAD; // 2800, the city's full side

export const roadCenter = (i) => i * PITCH + ROAD / 2;
export const roadBand = (v) => {
  // Which road band (0..GRID) a coordinate sits in, or -1 when on a block.
  const m = ((v % PITCH) + PITCH) % PITCH;
  if (m < ROAD) return Math.floor(v / PITCH);
  return -1;
};
export const onRoad = (x, y) => roadBand(x) !== -1 || roadBand(y) !== -1;

export const SAVE_KEY = 'solara-bay-save-v1';

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#6d9c4c',
  sand: '#e8d39a',
  water: '#3f8fc4',
  waterDeep: '#2f76a8',
  sidewalk: '#b9b3a4',
  lot: '#8f8a7c',
  asphalt: '#4a4a52',
  asphaltDark: '#3d3d45',
  lineYellow: '#e8c33a',
  lineWhite: '#e8e6da',
  park: '#5d9b4a',
  roofDowntown: '#5b6b7d',
  roofShop: '#a8574a',
  roofHouse: '#b0703f',
  roofHouse2: '#7a6a9b',
};

export const CAR_TYPES = [
  { name: 'Coupe', color: '#c23b2e', max: 430, accel: 320, turn: 2.9, len: 46, wid: 22 },
  { name: 'Sedan', color: '#2e6fb0', max: 380, accel: 280, turn: 2.7, len: 48, wid: 22 },
  { name: 'Taxi', color: '#e8b93a', max: 390, accel: 290, turn: 2.8, len: 48, wid: 22 },
  { name: 'Van', color: '#7a7f87', max: 330, accel: 230, turn: 2.3, len: 56, wid: 24 },
  { name: 'Muscle', color: '#7d2a8c', max: 470, accel: 360, turn: 2.6, len: 50, wid: 23 },
  { name: 'Pickup', color: '#3f7a4a', max: 360, accel: 260, turn: 2.5, len: 54, wid: 24 },
  { name: 'Sport', color: '#e8e6da', max: 520, accel: 420, turn: 3.1, len: 46, wid: 21 },
];

export const PED_SHIRTS = ['#d96a4a', '#4a7ad9', '#e8d44a', '#9b4ad9', '#4ad9a0', '#d94a8a', '#e8e6da', '#5a3a2a'];
export const PED_SKINS = ['#e8b98a', '#c98a5a', '#8a5a3a', '#f0c8a0'];

export const WANTED_MAX = 5;
export const PLAYER_RUN = 225;
export const PLAYER_WALK = 145;
export const PISTOL_AMMO_START = 24;
