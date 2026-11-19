// Solara Bay — the moving things: cars (traffic, parked, police, player),
// pedestrians and foot police, and how each of them drives, walks and chases.
import { CAR_TYPES, CITY, GRID, PED_SHIRTS, PED_SKINS, PITCH, ROAD, roadCenter } from './config.js';

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function laneOffset(angle) {
  // Right-hand driving: the lane sits 14 px to the right of the road centre.
  return { x: Math.sin(angle) * 14, y: -Math.cos(angle) * 14 };
}

export function makeCar(typeIndex, x, y, angle, driver) {
  const t = CAR_TYPES[typeIndex % CAR_TYPES.length];
  return {
    type: typeIndex % CAR_TYPES.length,
    name: t.name,
    color: t.color,
    x, y, angle,
    speed: 0,
    max: t.max,
    accel: t.accel,
    turn: t.turn,
    len: t.len,
    wid: t.wid,
    health: 100,
    driver,
    target: null,
    prevNode: null,
    stuck: 0,
    backoff: 0,
    dead: false,
    wreck: false,
    sirenPhase: Math.random() * 2,
  };
}

export function makePed(x, y, isCop = false) {
  return {
    x, y,
    angle: Math.random() * Math.PI * 2,
    speed: 0,
    state: 'walk',
    target: null,
    fleeX: 0, fleeY: 0, fleeTimer: 0,
    downTimer: 0,
    isCop,
    hp: 100,
    shirt: isCop ? '#2a3a5a' : PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)],
    skin: PED_SKINS[Math.floor(Math.random() * PED_SKINS.length)],
    arrest: 0,
    seed: Math.random() * 1000,
  };
}

// Steer a car toward a point, limited by its turn rate. Returns nothing.
function steerToward(car, tx, ty, dt, grip = 1) {
  const want = angleTo(car.x, car.y, tx, ty);
  const diff = angleDiff(car.angle, want);
  const maxTurn = car.turn * grip * dt * (0.45 + Math.min(1, Math.abs(car.speed) / 200));
  car.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
}

// A car ahead, roughly in front of `car` within `range`? `ignore` is one
// car to skip (the player's car, for police who are meant to ram it).
function carAhead(world, car, range, ignore = null) {
  let best = null;
  let bestD = range;
  for (const other of world.cars) {
    if (other === car || other === ignore || other.dead) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d > bestD) continue;
    const a = angleDiff(car.angle, angleTo(car.x, car.y, other.x, other.y));
    if (Math.abs(a) < 0.5 && d < bestD) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

export function stepTrafficCar(world, car, dt) {
  const city = world.city;
  if (!car.target) {
    const n = city.nearestNode(car.x, car.y);
    car.target = { i: n.i, j: n.j };
    car.prevNode = { i: n.i, j: n.j };
  }
  const node = city.nodePos(car.target.i, car.target.j);
  const d = dist(car.x, car.y, node.x, node.y);
  if (d < 26) {
    // Pick the next intersection: any neighbour except the one we came from,
    // unless it is the only way (a dead end at the city edge).
    const { i, j } = car.target;
    const options = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) continue;
      if (car.prevNode && ni === car.prevNode.i && nj === car.prevNode.j) continue;
      options.push({ i: ni, j: nj });
    }
    car.prevNode = { i, j };
    car.target = options.length ? options[Math.floor(Math.random() * options.length)] : { i, j };
    return;
  }
  const want = angleTo(car.x, car.y, node.x, node.y);
  const off = laneOffset(want);
  let steerX = node.x + off.x;
  let steerY = node.y + off.y;
  const ahead = carAhead(world, car, 85);
  // Go around a stopped car instead of queueing behind it forever: shift
  // the aim to the side with room (the oncoming lane, unless that side is
  // a building or the city edge, in which case the other side).
  if (ahead && ahead.speed < 30 && dist(car.x, car.y, ahead.x, ahead.y) < 75) {
    const perp = want - Math.PI / 2;
    const lx = car.x + Math.cos(perp) * 36;
    const ly = car.y + Math.sin(perp) * 36;
    const rx = car.x - Math.cos(perp) * 36;
    const ry = car.y - Math.sin(perp) * 36;
    const leftClear = lx > 24 && lx < CITY - 24 && ly > 24 && ly < CITY - 24 && !city.solidAt(lx, ly, 12);
    const rightClear = rx > 24 && rx < CITY - 24 && ry > 24 && ry < CITY - 24 && !city.solidAt(rx, ry, 12);
    const side = leftClear ? 1 : rightClear ? -1 : 0;
    if (side !== 0) {
      steerX += Math.cos(perp) * side * 34;
      steerY += Math.sin(perp) * side * 34;
    }
  }
  steerToward(car, steerX, steerY, dt);
  // One car at a time through an intersection: if another car is already
  // close to the node we are heading for and is closer to it than we are,
  // wait for it instead of driving into the crossing.
  let crossing = false;
  for (const other of world.cars) {
    if (other === car || other.dead) continue;
    if (dist(other.x, other.y, node.x, node.y) < 70
      && dist(other.x, other.y, node.x, node.y) < d) {
      crossing = true;
      break;
    }
  }
  const cruise = car.max * 0.32;
  let targetSpeed = ahead
    ? Math.min(cruise, Math.max(0, (dist(car.x, car.y, ahead.x, ahead.y) - 40) * 2))
    : cruise;
  if (crossing) targetSpeed = 0;
  car.speed += Math.max(-260 * dt, Math.min(200 * dt, targetSpeed - car.speed));
  // Stuck in a knot for a while? Re-route: pick another neighbour of the
  // node we were heading for, so the jam can unwind. A car that is merely
  // yielding counts too — a yield that never ends is the same jam.
  const blocked = !!ahead && dist(car.x, car.y, ahead.x, ahead.y) < 70;
  if ((targetSpeed > 40 && Math.abs(car.speed) < 15) || blocked) car.stuck += dt;
  else car.stuck = 0;
  if (car.stuck > 3) {
    car.stuck = 0;
    const { i, j } = car.target;
    const options = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) continue;
      options.push({ i: ni, j: nj });
    }
    if (options.length) {
      car.prevNode = { i, j };
      car.target = options[Math.floor(Math.random() * options.length)];
    }
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

export function stepPoliceCar(world, car, dt) {
  const p = world.player;
  const d = dist(car.x, car.y, p.x, p.y);
  if (car.backoff > 0) {
    // Just rammed: peel off backwards so the next car has a clear run and
    // the chase keeps moving instead of stacking up on the player.
    car.backoff -= dt;
    const away = angleTo(p.x, p.y, car.x, car.y);
    steerToward(car, car.x + Math.cos(away) * 100, car.y + Math.sin(away) * 100, dt);
    car.speed = Math.max(-180, car.speed - 500 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    return;
  }
  if (d < 46) {
    // Ramming the player: shove them and damage their car (or them).
    const push = angleTo(car.x, car.y, p.x, p.y);
    if (p.car) {
      p.car.health -= 4 * dt;
      p.car.x += Math.cos(push) * 60 * dt;
      p.car.y += Math.sin(push) * 60 * dt;
    } else {
      world.hurtPlayer(8 * dt, 'ram');
    }
    car.speed = -160;
    car.backoff = 0.7;
    return;
  }
  // Each police car aims at a different point around the player, so they
  // surround the getaway instead of all parking on the same spot.
  const ring = 34;
  const off = car.pursueOffset || 0;
  const tx = p.x + Math.cos(off) * ring;
  const ty = p.y + Math.sin(off) * ring;
  steerToward(car, tx, ty, dt, 1.15);
  const ahead = carAhead(world, car, 80, p.car);
  const targetSpeed = ahead ? 0 : Math.min(520, car.max * 1.35);
  car.speed += Math.max(-420 * dt, Math.min(340 * dt, targetSpeed - car.speed));
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

export function stepPlayerCar(world, car, input, dt) {
  const ax = input.axis();
  if (ax.y < 0) car.speed += car.accel * dt;
  else if (ax.y > 0) car.speed -= (car.speed > 0 ? 520 : 300) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  car.speed = Math.max(-160, Math.min(car.max, car.speed));
  const steer = ax.x * car.turn * dt * (0.35 + Math.min(1, Math.abs(car.speed) / 220));
  car.angle += steer * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

export function stepPed(world, ped, dt) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    return;
  }
  if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    const a = angleTo(ped.fleeX, ped.fleeY, ped.x, ped.y);
    ped.angle += angleDiff(ped.angle, a) * Math.min(1, 8 * dt);
    ped.x += Math.cos(ped.angle) * 175 * dt;
    ped.y += Math.sin(ped.angle) * 175 * dt;
    if (ped.fleeTimer <= 0) ped.state = 'walk';
    return;
  }
  if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 14) {
    ped.target = world.city.randomSidewalkPoint();
  }
  const a = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
  ped.angle += angleDiff(ped.angle, a) * Math.min(1, 6 * dt);
  ped.speed = 52;
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
}

export function stepFootCop(world, cop, dt) {
  const p = world.player;
  const d = dist(cop.x, cop.y, p.x, p.y);
  if (world.player.wanted > 0 && d < 750) {
    const a = angleTo(cop.x, cop.y, p.x, p.y);
    cop.angle += angleDiff(cop.angle, a) * Math.min(1, 8 * dt);
    cop.x += Math.cos(cop.angle) * 165 * dt;
    cop.y += Math.sin(cop.angle) * 165 * dt;
    if (d < 30) {
      cop.arrest += dt;
      if (cop.arrest > 1.2) world.busted = true;
    } else {
      cop.arrest = Math.max(0, cop.arrest - dt);
    }
    return;
  }
  cop.arrest = 0;
  stepPed(world, cop, dt);
}

export function scarePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.fleeX = x;
      ped.fleeY = y;
      ped.fleeTimer = 2.5 + Math.random() * 1.5;
    }
  }
}

export { CITY, PITCH, ROAD, roadCenter };
