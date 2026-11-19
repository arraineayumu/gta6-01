// Solara Bay — the screenshot scenes behind ?shot=title|drive|chase|mission.
// Each one plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a simple autopilot that drives the road ring,
// so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { GRID, PITCH, ROAD, STEP, roadBand, roadCenter } from './config.js';
import { angleDiff, angleTo, dist } from './entities.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { startMission } from './missions.js';
import { stepWorld } from './world.js';

const RING = [[3, 3], [6, 3], [6, 6], [3, 6]];

// The next point to steer at on the way to `dest`, following the road
// grid: straight at it when it shares the car's road, otherwise the
// intersection that puts the car on the destination's road.
function routeTarget(world, car, dest) {
  const rowBand = roadBand(car.y);
  const colBand = roadBand(car.x);
  const destRow = roadBand(dest.y);
  const destCol = roadBand(dest.x);
  if (rowBand !== -1 && destRow !== -1 && rowBand === destRow) return dest;
  if (colBand !== -1 && destCol !== -1 && colBand === destCol) return dest;
  if (rowBand !== -1) {
    const col = destCol !== -1
      ? destCol
      : Math.max(0, Math.min(GRID, Math.round((dest.x - ROAD / 2) / PITCH)));
    // Aim at the road's centre line, not the car's current offset — a
    // target that keeps the car's own y lets it rub along the block edge
    // and wedge itself into a building corner.
    return { x: roadCenter(col), y: roadCenter(rowBand) };
  }
  if (colBand !== -1) {
    const row = destRow !== -1
      ? destRow
      : Math.max(0, Math.min(GRID, Math.round((dest.y - ROAD / 2) / PITCH)));
    return { x: roadCenter(colBand), y: roadCenter(row) };
  }
  // Off-road (shoved onto a block or the beach): head for the nearest road
  // centre line, not the nearest intersection — cutting diagonally to a
  // node crosses buildings and never gets the car back on the road.
  const rowIdx = Math.max(0, Math.min(GRID, Math.round((car.y - ROAD / 2) / PITCH)));
  const colIdx = Math.max(0, Math.min(GRID, Math.round((car.x - ROAD / 2) / PITCH)));
  const rowY = roadCenter(rowIdx);
  const colX = roadCenter(colIdx);
  return Math.abs(car.y - rowY) < Math.abs(car.x - colX)
    ? { x: car.x, y: rowY }
    : { x: colX, y: car.y };
}

function ringTarget(world, car) {
  // The next ring corner ahead of the car.
  let best = RING[0];
  let bestD = Infinity;
  for (const [i, j] of RING) {
    const n = world.city.nodePos(i, j);
    const d = dist(car.x, car.y, n.x, n.y);
    if (d < bestD) {
      bestD = d;
      best = [i, j];
    }
  }
  const idx = RING.findIndex(([i, j]) => i === best[0] && j === best[1]);
  const next = RING[(idx + 1) % RING.length];
  return world.city.nodePos(next[0], next[1]);
}

function autopilotInput(world, destFn) {
  const car = world.player.car;
  return {
    axis() {
      if (!car) return { x: 0, y: 0 };
      const dest = destFn ? destFn(world, car) : ringTarget(world, car);
      let t = routeTarget(world, car, dest);
      // Overtake: a slow car ahead would cap the player at traffic speed
      // (~160) forever, so shift the aim into the oncoming lane to pass
      // it. The shift is relative to the route, not the car, so the aim
      // point stays still while the car closes on it.
      const blocker = carAheadOf(world, car, 120);
      if (blocker) {
        const routeAngle = angleTo(car.x, car.y, t.x, t.y);
        const left = routeAngle - Math.PI / 2;
        t = { x: t.x + Math.cos(left) * 30, y: t.y + Math.sin(left) * 30 };
      }
      const d = dist(car.x, car.y, t.x, t.y);
      const diff = angleDiff(car.angle, angleTo(car.x, car.y, t.x, t.y));
      const steer = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
      // Brake before a corner: when the waypoint is close and the road
      // after it turns away from the road we are on, slow down first —
      // otherwise momentum carries the car into the block past the turn.
      const turnAhead = !blocker && d < 260
        && Math.abs(angleDiff(angleTo(car.x, car.y, t.x, t.y), angleTo(car.x, car.y, dest.x, dest.y))) > 0.5;
      // The game's brake is also reverse: holding it past a stop drives
      // the car backwards, and steering flips when reversing — so never
      // brake at low speed, and never brake for a U-turn. Coast instead
      // and let the car roll around, then drive forward.
      const spd = Math.abs(car.speed);
      let throttle;
      if (Math.abs(diff) > 2.4) {
        throttle = spd > 120 ? 0 : -1;
      } else if (turnAhead) {
        // Creep toward the corner when slow, brake only when fast — a
        // brake that holds the car still 200 px short of the turn never
        // lets it reach the turn at all.
        throttle = spd > 150 ? 1 : spd > 60 ? 0 : -1;
      } else if (Math.abs(diff) > 0.6) {
        throttle = spd > 80 ? 1 : 0;
      } else if (Math.abs(diff) > 0.35) {
        throttle = 0;
      } else {
        throttle = -1;
      }
      return { x: steer, y: throttle };
    },
    held() {
      return false;
    },
    mouse: { down: false, worldX: world.player.x, worldY: world.player.y },
  };
}

function carAheadOf(world, car, range) {
  let best = null;
  let bestD = range;
  for (const other of world.cars) {
    if (other === car || other.dead) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d > bestD) continue;
    const a = angleDiff(car.angle, angleTo(car.x, car.y, other.x, other.y));
    if (Math.abs(a) < 0.4 && d < bestD) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

function putPlayerInCar(world) {
  // Prefer a fast car near the player so the shot shows speed, not a van.
  let best = null;
  let bestScore = Infinity;
  for (const car of world.cars) {
    if (car.dead || car.wreck) continue;
    const d = dist(world.player.x, world.player.y, car.x, car.y);
    const fast = car.max >= 430 ? 0 : 1000;
    const score = fast + d;
    if (score < bestScore) {
      best = car;
      bestScore = score;
    }
  }
  if (!best) return null;
  best.driver = 'player';
  best.target = null;
  best.health = 100;
  world.player.car = best;
  world.player.x = best.x;
  world.player.y = best.y;
  world.player.angle = best.angle;
  return best;
}

function idleInput(world) {
  return {
    axis() {
      return { x: 0, y: 0 };
    },
    held() {
      return false;
    },
    mouse: { down: false, worldX: world.player.x, worldY: world.player.y },
  };
}

function simulate(world, seconds, input) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, input, 0, STEP);
    if (world.wasted || world.busted) break;
  }
}

// Step in half-second chunks until `done` says the frame is the one we
// want, or `maxSeconds` runs out — so a shot catches the car at speed,
// the chase close behind, or the mission marker in view. `minSeconds`
// keeps the check from firing on the first chunk, before the car has
// actually accelerated (a stolen car starts at its cruise speed).
function simulateUntil(world, input, maxSeconds, done, minSeconds = 0) {
  let elapsed = 0;
  while (elapsed < maxSeconds) {
    simulate(world, 0.5, input);
    elapsed += 0.5;
    if (world.wasted || world.busted) break;
    if (elapsed >= minSeconds && done && done(world)) break;
  }
}

function straightEnough(car) {
  const a = ((car.angle % Math.PI) + Math.PI) % Math.PI;
  return Math.min(a, Math.PI - a) < 0.12
    || Math.abs(a - Math.PI / 2) < 0.12;
}

/** Set `world` to the named scene and return the screen to draw over it. */
export function stageShot(name, world) {
  if (name === 'drive') {
    putPlayerInCar(world);
    simulateUntil(world, autopilotInput(world), 30, (w) => {
      const car = w.player.car;
      return !!car && Math.abs(car.speed) > 240 && straightEnough(car);
    }, 4);
    // A clean drive: the autopilot is a reckless driver, so the heat it
    // picked up running over pedestrians is cleared for this frame.
    world.player.wanted = 0;
    world.cars = world.cars.filter((c) => c.driver !== 'police');
    world.cops = [];
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    putPlayerInCar(world);
    // Get up to speed first, then the heat comes on: the police spawn
    // 420+ px away, so the frame catches the car at speed with the chase
    // closing in behind it, instead of the cars piling on top of it.
    simulateUntil(world, autopilotInput(world), 12, (w) => {
      const car = w.player.car;
      return !!car && Math.abs(car.speed) > 260 && straightEnough(car);
    }, 2);
    world.addWanted(3, 'shot');
    simulateUntil(world, autopilotInput(world), 8, (w) => {
      const car = w.player.car;
      if (!car || Math.abs(car.speed) < 200) return false;
      return w.cars.some((c) => c.driver === 'police' && !c.dead
        && dist(c.x, c.y, w.player.x, w.player.y) < 500);
    }, 1);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    startMission(world, 1);
    putPlayerInCar(world);
    // Collect the package at the docks, then drive toward the motel.
    const docks = world.city.spots.docks;
    world.player.x = docks.x;
    world.player.y = docks.y;
    if (world.player.car) {
      world.player.car.x = docks.x;
      world.player.car.y = docks.y;
    }
    simulate(world, 1.5, idleInput(world));
    const motel = world.city.spots.motel;
    simulateUntil(world, autopilotInput(world, () => motel), 22, (w) => {
      const car = w.player.car;
      // Close enough that the marker is in view, but still far enough
      // east that the frame is city, not the empty grass past its edge.
      return !!car && Math.abs(car.speed) > 100
        && w.player.x > 750
        && dist(w.player.x, w.player.y, motel.x, motel.y) < 700;
    });
    return { screen: SCREEN_PLAY };
  }
  // Title: the city alive behind the logo.
  simulate(world, 6, idleInput(world));
  return { screen: SCREEN_TITLE };
}
