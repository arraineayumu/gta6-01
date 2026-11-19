// Solara Bay — the city itself: a grid of blocks, roads, buildings, parks and
// a beach, generated once per seed, plus the road graph traffic drives on
// and the named places missions point at.
import { BLOCK, CITY, GRID, PALETTE, PITCH, ROAD, roadCenter } from './config.js';

const DOWNTOWN = { x0: 3, x1: 5, y0: 3, y1: 5 };
const PARKS = [[1, 1], [7, 6]];
const ROOFS_DOWNTOWN = ['#5b6b7d', '#6b7d8c', '#4a5a6b', '#7d8a99'];
const ROOFS_SHOP = ['#a8574a', '#4a7a5a', '#c08a3a', '#5a6a9b'];
const ROOFS_HOUSE = ['#b0703f', '#7a6a9b', '#5a7a8c', '#9b4a5a', '#6b8c4a'];

function zoneOf(bx, by) {
  if (by === GRID - 1) return 'beach';
  for (const [px, py] of PARKS) if (bx === px && by === py) return 'park';
  if (bx >= DOWNTOWN.x0 && bx <= DOWNTOWN.x1 && by >= DOWNTOWN.y0 && by <= DOWNTOWN.y1) return 'downtown';
  if (bx === 4 || by === 4) return 'commercial';
  return 'residential';
}

function blockRect(bx, by) {
  return { x: bx * PITCH + ROAD, y: by * PITCH + ROAD, w: BLOCK, h: BLOCK };
}

function makeBuildings(rng, block, zone) {
  const inset = 18;
  const x0 = block.x + inset;
  const y0 = block.y + inset;
  const x1 = block.x + block.w - inset;
  const y1 = block.y + block.h - inset;
  const out = [];
  if (zone === 'downtown') {
    const w = rng.range(150, 190);
    const h = rng.range(150, 190);
    out.push({
      x: x0 + (x1 - x0 - w) / 2, y: y0 + (y1 - y0 - h) / 2, w, h,
      hgt: rng.range(70, 130), color: rng.pick(ROOFS_DOWNTOWN), kind: 'tower',
    });
  } else if (zone === 'commercial') {
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i += 1) {
      const w = rng.range(90, 150);
      const h = rng.range(60, 110);
      out.push({
        x: x0 + rng.range(0, Math.max(0, x1 - x0 - w)),
        y: y0 + rng.range(0, Math.max(0, y1 - y0 - h)),
        w, h, hgt: rng.range(16, 28), color: rng.pick(ROOFS_SHOP), kind: 'shop',
      });
    }
  } else if (zone === 'residential') {
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i += 1) {
      const w = rng.range(42, 66);
      const h = rng.range(42, 66);
      out.push({
        x: x0 + rng.range(0, Math.max(0, x1 - x0 - w)),
        y: y0 + rng.range(0, Math.max(0, y1 - y0 - h)),
        w, h, hgt: rng.range(10, 18), color: rng.pick(ROOFS_HOUSE), kind: 'house',
      });
    }
  }
  return out;
}

function makeTrees(rng, block, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: block.x + rng.range(24, block.w - 24),
      y: block.y + rng.range(24, block.h - 24),
      r: rng.range(10, 18),
    });
  }
  return out;
}

// A spot sits on the road beside a block: (bx, by) names the block, side
// names which edge of it, and t slides along that edge.
function spotNear(bx, by, side, t) {
  const b = blockRect(bx, by);
  if (side === 'n') return { x: b.x + b.w * t, y: b.y - ROAD / 2 };
  if (side === 's') return { x: b.x + b.w * t, y: b.y + b.h + ROAD / 2 };
  if (side === 'w') return { x: b.x - ROAD / 2, y: b.y + b.h * t };
  return { x: b.x + b.w + ROAD / 2, y: b.y + b.h * t };
}

export function generateCity(rng) {
  const blocks = [];
  const solids = [];
  for (let by = 0; by < GRID; by += 1) {
    for (let bx = 0; bx < GRID; bx += 1) {
      const rect = blockRect(bx, by);
      const zone = zoneOf(bx, by);
      const buildings = makeBuildings(rng, rect, zone);
      for (const b of buildings) solids.push(b);
      const trees = zone === 'park' ? makeTrees(rng, rect, rng.int(9, 14))
        : zone === 'residential' ? makeTrees(rng, rect, rng.int(1, 3)) : [];
      const pond = zone === 'park' && bx === 1;
      const umbrellas = zone === 'beach'
        ? Array.from({ length: rng.int(5, 8) }, () => ({
          x: rect.x + rng.range(20, rect.w - 20),
          y: rect.y + rng.range(30, rect.h - 20),
          color: rng.pick(['#e85a5a', '#e8b93a', '#4a8fd9', '#e8e6da']),
        }))
        : [];
      blocks.push({ bx, by, ...rect, zone, buildings, trees, pond, umbrellas });
    }
  }

  const spots = {
    player: spotNear(1, 6, 'n', 0.5),
    safehouse: spotNear(1, 6, 'n', 0.5),
    paintShop: spotNear(4, 6, 'e', 0.5),
    docks: spotNear(8, 4, 'e', 0.5),
    motel: spotNear(1, 7, 'w', 0.5),
    shops: [spotNear(2, 4, 's', 0.5), spotNear(6, 2, 'e', 0.5), spotNear(7, 4, 'w', 0.5)],
    bank: spotNear(4, 4, 's', 0.5),
    hideout: spotNear(7, 1, 'e', 0.5),
    hospital: spotNear(1, 2, 'w', 0.5),
    gunshop: spotNear(5, 4, 's', 0.5),
    pier: { x: roadCenter(4), y: CITY - 30 },
  };

  return {
    size: CITY,
    blocks,
    solids,
    spots,
    nodePos(i, j) {
      return { x: roadCenter(i), y: roadCenter(j) };
    },
    nearestNode(x, y) {
      const i = Math.max(0, Math.min(GRID, Math.round((x - ROAD / 2) / PITCH)));
      const j = Math.max(0, Math.min(GRID, Math.round((y - ROAD / 2) / PITCH)));
      return { i, j };
    },
    randomNode() {
      return { i: rng.int(0, GRID), j: rng.int(0, GRID) };
    },
    randomRoadPoint() {
      const n = this.randomNode();
      return { x: roadCenter(n.i) + rng.range(-14, 14), y: roadCenter(n.j) + rng.range(-14, 14) };
    },
    randomSidewalkPoint() {
      const bx = rng.int(0, GRID - 1);
      const by = rng.int(0, GRID - 1);
      const b = blockRect(bx, by);
      const edge = rng.int(0, 3);
      if (edge === 0) return { x: b.x + rng.range(0, b.w), y: b.y + 8 };
      if (edge === 1) return { x: b.x + rng.range(0, b.w), y: b.y + b.h - 8 };
      if (edge === 2) return { x: b.x + 8, y: b.y + rng.range(0, b.h) };
      return { x: b.x + b.w - 8, y: b.y + rng.range(0, b.h) };
    },
    solidAt(x, y, pad = 0) {
      for (let i = 0; i < solids.length; i += 1) {
        const s = solids[i];
        if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return s;
      }
      return null;
    },
    inWater(x, y) {
      return y > CITY + 4;
    },
  };
}

export { PALETTE };
