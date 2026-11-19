// Solara Bay — the world: one state object and the step that advances it.
// Everything that happens in the city runs through here: moving, driving,
// traffic, pedestrians, police, wanted heat, combat, missions and saving.
import { CITY, PLAYER_RUN, PLAYER_WALK, PISTOL_AMMO_START, SAVE_KEY, STEP, roadCenter } from './config.js';
import { createRandom } from './random.js';
import { generateCity } from './city.js';
import {
  angleDiff, angleTo, dist, makeCar, makePed, scarePeds,
  stepFootCop, stepPed, stepPlayerCar, stepPoliceCar, stepTrafficCar,
} from './entities.js';
import { MISSIONS, missionMarker, startMission } from './missions.js';

export const EVENT_NONE = 0;
export const EVENT_MISSION_DONE = 1;
export const EVENT_STORY_DONE = 2;
export const EVENT_WASTED = 4;
export const EVENT_BUSTED = 8;

const TRAFFIC_WANT = 14;
const PEDS_WANT = 22;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function pushOutOfSolids(city, x, y, r) {
  // Push a circle out of every building it overlaps. Returns corrected [x, y].
  for (const s of city.solids) {
    const nx = clamp(x, s.x, s.x + s.w);
    const ny = clamp(y, s.y, s.y + s.h);
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 === 0) {
        x = s.x - r;
        continue;
      }
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    }
  }
  return [x, y];
}

export function addParticle(world, p) {
  world.particles.push({ life: p.life ?? 0.6, maxLife: p.life ?? 0.6, ...p });
}

export function addExplosion(world, x, y) {
  for (let i = 0; i < 26; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 260;
    addParticle(world, {
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      size: 5 + Math.random() * 9, color: Math.random() < 0.5 ? '#ff9a2a' : '#ff5a2a',
      kind: 'fire', life: 0.4 + Math.random() * 0.4,
    });
  }
  for (let i = 0; i < 14; i += 1) {
    addParticle(world, {
      x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30,
      vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 40,
      size: 10 + Math.random() * 14, color: '#5a5a5a', kind: 'smoke', life: 1.2 + Math.random(),
    });
  }
  addParticle(world, { x, y, vx: 0, vy: 0, size: 8, color: '#ffd23a', kind: 'ring', life: 0.5 });
  scarePeds(world, x, y, 420);
  world.audio.explosion();
}

function spawnTrafficCar(world, nearPlayer) {
  const city = world.city;
  let p;
  if (nearPlayer) {
    p = city.randomRoadPoint();
    let tries = 0;
    while (dist(p.x, p.y, world.player.x, world.player.y) < 320 && tries < 8) {
      p = city.randomRoadPoint();
      tries += 1;
    }
  } else {
    p = city.randomRoadPoint();
  }
  const angle = Math.random() < 0.5 ? 0 : Math.PI / 2;
  const car = makeCar(Math.floor(Math.random() * 7), p.x, p.y, angle + (Math.random() < 0.5 ? 0 : Math.PI), 'traffic');
  car.speed = 60 + Math.random() * 60;
  world.cars.push(car);
  return car;
}

function spawnPed(world) {
  const p = world.city.randomSidewalkPoint();
  let tries = 0;
  while (dist(p.x, p.y, world.player.x, world.player.y) < 220 && tries < 8) {
    const q = world.city.randomSidewalkPoint();
    p.x = q.x;
    p.y = q.y;
    tries += 1;
  }
  const ped = makePed(p.x, p.y);
  world.peds.push(ped);
  return ped;
}

function spawnPoliceCar(world) {
  const p = world.city.randomRoadPoint();
  let tries = 0;
  while (dist(p.x, p.y, world.player.x, world.player.y) < 420 && tries < 10) {
    const q = world.city.randomRoadPoint();
    p.x = q.x;
    p.y = q.y;
    tries += 1;
  }
  const car = makeCar(Math.floor(Math.random() * 7), p.x, p.y, angleTo(p.x, p.y, world.player.x, world.player.y), 'police');
  car.color = '#1d2f52';
  car.max = 500;
  car.pursueOffset = Math.random() * Math.PI * 2;
  world.cars.push(car);
  return car;
}

function spawnFootCop(world) {
  const a = Math.random() * Math.PI * 2;
  const x = clamp(world.player.x + Math.cos(a) * 420, 40, CITY - 40);
  const y = clamp(world.player.y + Math.sin(a) * 420, 40, CITY - 40);
  const cop = makePed(x, y, true);
  world.cops.push(cop);
  return cop;
}

function populate(world) {
  for (let i = 0; i < TRAFFIC_WANT; i += 1) spawnTrafficCar(world, false);
  for (let i = 0; i < 8; i += 1) {
    const p = world.city.randomRoadPoint();
    const angle = Math.random() < 0.5 ? 0 : Math.PI / 2;
    const car = makeCar(Math.floor(Math.random() * 7), p.x, p.y, angle, 'parked');
    // Park at the curb, not in the middle of the lane: a car parked on
    // the centre line can deadlock the whole intersection behind it.
    // Set the offset from the road centre itself, so it is always clear.
    const n = world.city.nearestNode(p.x, p.y);
    const side = Math.random() < 0.5 ? -1 : 1;
    if (angle === 0) car.y = roadCenter(n.j) + side * 24;
    else car.x = roadCenter(n.i) + side * 24;
    world.cars.push(car);
  }
  for (let i = 0; i < PEDS_WANT; i += 1) spawnPed(world);
  const s = world.city.spots;
  world.pickups.push({ kind: 'health', x: s.hospital.x + 30, y: s.hospital.y + 30 });
  world.pickups.push({ kind: 'ammo', x: s.gunshop.x + 30, y: s.gunshop.y + 30 });
  world.pickups.push({ kind: 'cash', x: s.bank.x - 40, y: s.bank.y + 20, value: 60 });
  world.pickups.push({ kind: 'cash', x: s.motel.x + 40, y: s.motel.y - 20, value: 40 });
  world.pickups.push({ kind: 'cash', x: s.docks.x - 30, y: s.docks.y + 40, value: 80 });
}

export function createWorld(seed) {
  const rng = createRandom(seed);
  const city = generateCity(rng);
  const start = city.spots.player;
  const world = {
    seed,
    city,
    rng,
    time: 0,
    clockMin: 9 * 60,
    player: {
      x: start.x, y: start.y, angle: -Math.PI / 2,
      health: 100, money: 50, wanted: 0,
      weapon: 'fists', ammo: 0, car: null,
      punchT: 0, shootT: 0, hurtT: 99, runDust: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    particles: [],
    pickups: [],
    mission: null,
    missionIndex: 0,
    storyDone: false,
    dialogue: null,
    banner: null,
    hiddenTimer: 0,
    crimeTimer: 99,
    busted: false,
    wasted: false,
    stats: { carsStolen: 0, kills: 0, missionsDone: 0, shotsFired: 0 },
    camera: { x: start.x, y: start.y, zoom: 1 },
    events: EVENT_NONE,
    audio: null,
    saveVersion: 1,
  };
  world.addWanted = (n, reason) => {
    const p = world.player;
    p.wanted = Math.min(5, p.wanted + n);
    world.hiddenTimer = 0;
    world.crimeTimer = 0;
    void reason;
  };
  world.hurtPlayer = (dmg) => {
    const p = world.player;
    if (world.wasted || world.busted) return;
    p.health -= dmg;
    p.hurtT = 0;
    if (p.health <= 0) {
      p.health = 0;
      world.wasted = true;
      world.events |= EVENT_WASTED;
    }
  };
  populate(world);
  return world;
}

export function resetWorld(world) {
  const fresh = createWorld(world.seed);
  fresh.audio = world.audio;
  Object.keys(world).forEach((k) => delete world[k]);
  Object.assign(world, fresh);
}

function witnessed(world, x, y, radius) {
  for (const cop of world.cops) if (dist(cop.x, cop.y, x, y) < radius) return true;
  for (const car of world.cars) {
    if (car.driver === 'police' && dist(car.x, car.y, x, y) < radius) return true;
  }
  for (const ped of world.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, x, y) < radius * 0.55) return true;
  }
  return false;
}

function nearestCar(world, x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of world.cars) {
    if (car.dead || car.wreck) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function shootRay(world, x, y, angle, range) {
  // Nearest living ped/cop/car along the ray, within a 14 px corridor.
  let best = null;
  let bestD = range;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  function consider(e, r) {
    const ex = e.x - x;
    const ey = e.y - y;
    const along = ex * dx + ey * dy;
    if (along < 0 || along > bestD) return;
    const perp = Math.abs(ex * dy - ey * dx);
    if (perp < r + 10) {
      best = e;
      bestD = along;
    }
  }
  for (const ped of world.peds) if (ped.state !== 'down') consider(ped, 12);
  for (const cop of world.cops) consider(cop, 12);
  for (const car of world.cars) if (!car.dead) consider(car, 24);
  return { hit: best, dist: bestD };
}

function damagePed(world, ped, dmg, fromX, fromY) {
  ped.hp -= dmg;
  if (ped.hp <= 0 && ped.state !== 'down') {
    ped.state = 'down';
    ped.downTimer = 25;
    world.stats.kills += 1;
    if (ped.isCop) world.addWanted(2, 'cop down');
    else if (witnessed(world, ped.x, ped.y, 500)) world.addWanted(1, 'ped down');
    for (let i = 0; i < 8; i += 1) {
      addParticle(world, {
        x: ped.x, y: ped.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120,
        size: 3 + Math.random() * 3, color: '#c23b2e', kind: 'spark', life: 0.5,
      });
    }
  } else if (ped.state !== 'down') {
    ped.state = 'flee';
    ped.fleeX = fromX;
    ped.fleeY = fromY;
    ped.fleeTimer = 3;
  }
}

function damageCar(world, car, dmg) {
  // The player's car takes half damage: a chase should last long enough
  // to be fun, and the player can only get a new car by stealing one.
  if (world.player.car === car) dmg *= 0.5;
  car.health -= dmg;
  if (car.health <= 0 && !car.wreck) {
    car.wreck = true;
    car.dead = true;
    addExplosion(world, car.x, car.y);
    if (world.player.car === car) {
      world.player.car = null;
      world.player.x = car.x + 40;
      world.player.y = car.y;
      world.hurtPlayer(25);
    }
  } else if (car.health < 35) {
    addParticle(world, {
      x: car.x, y: car.y - 6, vx: (Math.random() - 0.5) * 20, vy: -50,
      size: 8 + Math.random() * 6, color: '#5a5a5a', kind: 'smoke', life: 1,
    });
  }
}

function stepMission(world, input, dt) {
  const m = world.mission;
  if (!m || m.done) return;
  const step = m.def.steps[m.step];
  const p = world.player;
  if (step.timer !== undefined) {
    m.timer -= dt;
    if (m.timer <= 0) {
      world.banner = { text: 'Too slow — the job fell through. Try again.', t: 0, dur: 3 };
      startMission(world, m.index);
      return;
    }
  }
  if (step.kind === 'enter-car') {
    if (p.car) advanceStep(world);
    return;
  }
  if (step.kind === 'reach') {
    const marker = missionMarker(world);
    if (marker && dist(p.x, p.y, marker.x, marker.y) < step.radius) {
      advanceStep(world);
    }
    return;
  }
  if (step.kind === 'hold') {
    const marker = missionMarker(world);
    const near = marker && dist(p.x, p.y, marker.x, marker.y) < step.radius;
    const holding = near && input.held('KeyE');
    if (holding) {
      if (!m.holdStarted) {
        m.holdStarted = true;
        if (m.def.onHoldStart) m.def.onHoldStart(world);
      }
      m.holdT += dt;
      if (m.holdT >= step.hold) advanceStep(world);
    } else {
      m.holdT = Math.max(0, m.holdT - dt * 2);
    }
    return;
  }
  if (step.kind === 'lose-wanted') {
    if (p.wanted === 0) advanceStep(world);
  }
}

function advanceStep(world) {
  const m = world.mission;
  m.step += 1;
  m.holdT = 0;
  m.holdStarted = false;
  if (m.step >= m.def.steps.length) completeMission(world);
  else {
    const next = m.def.steps[m.step];
    if (next.timer !== undefined) m.timer = next.timer;
    world.audio.pickup();
  }
}

function completeMission(world) {
  const m = world.mission;
  m.done = true;
  world.player.money += m.def.reward;
  world.stats.missionsDone += 1;
  world.missionIndex += 1;
  world.banner = { text: `Job done — $${m.def.reward}`, t: 0, dur: 3.5 };
  world.dialogue = { lines: [m.def.completeLine], i: 0, t: 0, contact: m.def.contact };
  world.audio.jingle();
  world.audio.cash();
  if (m.def.onComplete) m.def.onComplete(world);
  world.events |= EVENT_MISSION_DONE;
  if (world.missionIndex >= MISSIONS.length) {
    world.storyDone = true;
    world.events |= EVENT_STORY_DONE;
  }
  saveGame(world);
}

function stepDialogue(world, input, actions, dt) {
  const d = world.dialogue;
  if (!d) return;
  d.t += dt;
  if ((actions & 1) || d.t > 5) {
    d.i += 1;
    d.t = 0;
    if (d.i >= d.lines.length) world.dialogue = null;
  }
}

function stepWanted(world, dt) {
  const p = world.player;
  world.crimeTimer += dt;
  if (p.wanted === 0) {
    world.hiddenTimer = 0;
    return;
  }
  // Heat dies only while no police can see the player and no fresh crime.
  let nearestCop = Infinity;
  for (const car of world.cars) {
    if (car.driver === 'police') nearestCop = Math.min(nearestCop, dist(car.x, car.y, p.x, p.y));
  }
  for (const cop of world.cops) nearestCop = Math.min(nearestCop, dist(cop.x, cop.y, p.x, p.y));
  const playerHidden = nearestCop > 560 && world.crimeTimer > 15;
  if (playerHidden) {
    world.hiddenTimer += dt;
    if (world.hiddenTimer > 22) {
      p.wanted -= 1;
      world.hiddenTimer = 0;
    }
  } else {
    world.hiddenTimer = 0;
    // Reinforcements only while the trail is hot. Once the player is
    // hidden, the police stop coming — otherwise fresh units would keep
    // arriving forever and the heat could never die (Lay Low would be
    // impossible no matter how well the player hid).
    const wantCars = Math.min(p.wanted, 3);
    const wantCops = p.wanted >= 2 ? Math.min(p.wanted - 1, 3) : 0;
    let haveCars = 0;
    for (const car of world.cars) if (car.driver === 'police' && !car.dead) haveCars += 1;
    for (let i = haveCars; i < wantCars; i += 1) spawnPoliceCar(world);
    for (let i = world.cops.length; i < wantCops; i += 1) spawnFootCop(world);
  }
  if (p.wanted === 0) {
    world.cars = world.cars.filter((c) => c.driver !== 'police' || dist(c.x, c.y, p.x, p.y) < 900);
    if (world.cops.length > 0 && Math.random() < dt * 0.5) world.cops.pop();
  }
}

function collideCarWithSolids(world, car, dt) {
  const r = 20;
  const before = world.city.solidAt(car.x, car.y, 0);
  if (!before) return;
  // Back out along the direction of travel, then push out of the rect.
  car.x -= Math.cos(car.angle) * Math.abs(car.speed) * dt * 2;
  car.y -= Math.sin(car.angle) * Math.abs(car.speed) * dt * 2;
  const [nx, ny] = pushOutOfSolids(world.city, car.x, car.y, r);
  const hitSpeed = Math.abs(car.speed);
  car.x = nx;
  car.y = ny;
  if (hitSpeed > 90) {
    damageCar(world, car, hitSpeed * 0.06);
    world.audio.crash(hitSpeed / 500);
    for (let i = 0; i < 6; i += 1) {
      addParticle(world, {
        x: car.x, y: car.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160,
        size: 3, color: '#ffd23a', kind: 'spark', life: 0.3,
      });
    }
  }
  car.speed *= -0.25;
}

function collideCars(world) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.dead || b.dead) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      const min = 44;
      if (d > 0 && d < min) {
        const push = (min - d) / 2 + 1;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 120) {
          damageCar(world, a, rel * 0.01);
          damageCar(world, b, rel * 0.01);
          world.audio.crash(rel / 500);
        }
        // Both cars shed speed on impact instead of swapping it — a swap
        // keeps two head-on cars driving into each other forever.
        a.speed *= 0.25;
        b.speed *= 0.25;
      }
    }
  }
}

function stepPlayer(world, input, actions, dt) {
  const p = world.player;
  p.punchT = Math.max(0, p.punchT - dt);
  p.shootT = Math.max(0, p.shootT - dt);
  p.hurtT += dt;
  if (p.health < 100 && p.hurtT > 8) p.health = Math.min(100, p.health + 2 * dt);

  if (p.car) {
    const car = p.car;
    stepPlayerCar(world, car, input, dt);
    collideCarWithSolids(world, car, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Running over pedestrians.
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      if (dist(ped.x, ped.y, car.x, car.y) < 26 && Math.abs(car.speed) > 130) {
        damagePed(world, ped, 200, car.x, car.y);
        damageCar(world, car, 4);
        world.audio.crash(0.4);
      }
    }
    for (const cop of world.cops) {
      if (dist(cop.x, cop.y, car.x, car.y) < 26 && Math.abs(car.speed) > 130) {
        damagePed(world, cop, 200, car.x, car.y);
        damageCar(world, car, 4);
      }
    }
    if ((actions & 8) && Math.abs(car.speed) < 60) {
      // Exit the car: step out to its side.
      const side = { x: car.x + Math.sin(car.angle) * 26, y: car.y - Math.cos(car.angle) * 26 };
      const [nx, ny] = pushOutOfSolids(world.city, side.x, side.y, 12);
      p.x = clamp(nx, 20, CITY - 20);
      p.y = clamp(ny, 20, CITY - 20);
      p.angle = car.angle;
      car.driver = 'parked';
      car.speed = 0;
      p.car = null;
      world.audio.click();
    }
    return;
  }

  // On foot.
  const ax = input.axis();
  const len = Math.hypot(ax.x, ax.y) || 1;
  const running = input.held('ShiftLeft') || input.held('ShiftRight');
  const speed = running ? PLAYER_RUN : PLAYER_WALK;
  let nx = p.x + (ax.x / len) * speed * dt * (ax.x || ax.y ? 1 : 0);
  let ny = p.y + (ax.y / len) * speed * dt * (ax.x || ax.y ? 1 : 0);
  if (ax.x || ax.y) {
    p.angle = Math.atan2(ax.y, ax.x);
    p.runDust -= dt;
    if (running && p.runDust <= 0) {
      p.runDust = 0.18;
      addParticle(world, { x: p.x, y: p.y + 8, vx: 0, vy: 0, size: 4, color: '#c9c2ae', kind: 'dust', life: 0.4 });
    }
  }
  [nx, ny] = pushOutOfSolids(world.city, nx, ny, 12);
  p.x = clamp(nx, 16, CITY - 16);
  p.y = clamp(ny, 16, CITY - 16);
  if (world.city.inWater(p.x, p.y)) p.y = CITY - 16;

  if (actions & 8) {
    const car = nearestCar(world, p.x, p.y, 58);
    if (car) {
      const wasPolice = car.driver === 'police';
      const wasTraffic = car.driver === 'traffic';
      car.driver = 'player';
      car.target = null;
      p.car = car;
      world.stats.carsStolen += 1;
      if ((wasPolice || wasTraffic) && witnessed(world, p.x, p.y, 420)) {
        world.addWanted(wasPolice ? 2 : 1, 'theft');
      }
      world.audio.click();
    }
  }

  if ((actions & 4) && p.punchT <= 0) {
    p.punchT = 0.35;
    world.audio.punch();
    const range = 52;
    const hit = (e) => {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < range && Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, e.x, e.y))) < 1.1) {
        damagePed(world, e, 14, p.x, p.y);
        return true;
      }
      return false;
    };
    let landed = false;
    for (const ped of world.peds) if (hit(ped)) landed = true;
    for (const cop of world.cops) if (hit(cop)) landed = true;
    if (landed && witnessed(world, p.x, p.y, 420)) world.addWanted(1, 'assault');
  }

  if (input.mouse.down && p.weapon === 'pistol' && p.ammo > 0 && p.shootT <= 0) {
    p.shootT = 0.28;
    p.ammo -= 1;
    world.stats.shotsFired += 1;
    const aim = Math.atan2(input.mouse.worldY - p.y, input.mouse.worldX - p.x);
    const { hit, dist: hd } = shootRay(world, p.x, p.y, aim, 430);
    const ex = p.x + Math.cos(aim) * hd;
    const ey = p.y + Math.sin(aim) * hd;
    addParticle(world, { x: ex, y: ey, vx: 0, vy: 0, size: 7, color: '#ffe9a8', kind: 'flash', life: 0.12 });
    addParticle(world, {
      x: p.x + Math.cos(aim) * 18, y: p.y + Math.sin(aim) * 18,
      vx: Math.cos(aim) * 300, vy: Math.sin(aim) * 300,
      size: 2, color: '#ffe9a8', kind: 'spark', life: 0.15,
    });
    world.audio.shot();
    scarePeds(world, p.x, p.y, 260);
    if (hit) {
      if (hit.isCop !== undefined) damagePed(world, hit, 30, p.x, p.y);
      else damageCar(world, hit, 16);
    }
    if (witnessed(world, p.x, p.y, 620)) world.addWanted(1, 'gunfire');
  }
}

export function stepWorld(world, input, actions, dt) {
  world.time += dt;
  world.clockMin += dt * 0.5;
  if (world.banner) {
    world.banner.t += dt;
    if (world.banner.t > world.banner.dur) world.banner = null;
  }
  stepDialogue(world, input, actions, dt);
  stepMission(world, input, dt);
  stepPlayer(world, input, actions, dt);

  for (const car of world.cars) {
    if (car.dead) continue;
    if (car.driver === 'traffic') stepTrafficCar(world, car, dt);
    else if (car.driver === 'police') stepPoliceCar(world, car, dt);
    if (car.driver !== 'player') collideCarWithSolids(world, car, dt);
    if (car.driver !== 'player') {
      const [nx, ny] = pushOutOfSolids(world.city, car.x, car.y, 18);
      car.x = nx;
      car.y = ny;
    }
    car.x = clamp(car.x, 16, CITY - 16);
    car.y = clamp(car.y, 16, CITY - 16);
    if (car.health < 35 && !car.wreck && Math.random() < dt * 2) {
      addParticle(world, {
        x: car.x, y: car.y - 6, vx: (Math.random() - 0.5) * 20, vy: -50,
        size: 8 + Math.random() * 6, color: '#5a5a5a', kind: 'smoke', life: 1,
      });
    }
  }
  collideCars(world);

  for (const ped of world.peds) stepPed(world, ped, dt);
  for (const cop of world.cops) stepFootCop(world, cop, dt);

  // Keep the streets alive near the player; drop what drifted far away.
  let traffic = 0;
  for (const car of world.cars) if (car.driver === 'traffic') traffic += 1;
  if (traffic < TRAFFIC_WANT && Math.random() < dt * 2) spawnTrafficCar(world, true);
  world.cars = world.cars.filter((c) => {
    if (c.dead && c.wreck) return dist(c.x, c.y, world.player.x, world.player.y) < 700;
    if (c.driver === 'traffic' && dist(c.x, c.y, world.player.x, world.player.y) > 1100) return false;
    return true;
  });
  if (world.peds.length < PEDS_WANT && Math.random() < dt * 3) spawnPed(world);
  world.peds = world.peds.filter((p) => p.state !== 'down' || p.downTimer > 0);
  world.peds = world.peds.filter((p) => dist(p.x, p.y, world.player.x, world.player.y) < 1100 || p.state === 'down');

  // Pickups.
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    if (dist(world.player.x, world.player.y, pk.x, pk.y) < 30) {
      pk.taken = true;
      if (pk.kind === 'health') world.player.health = Math.min(100, world.player.health + 40);
      if (pk.kind === 'ammo') world.player.ammo += 12;
      if (pk.kind === 'cash') world.player.money += pk.value;
      world.audio.pickup();
      world.banner = { text: pk.kind === 'cash' ? `+$${pk.value}` : pk.kind === 'health' ? '+40 health' : '+12 ammo', t: 0, dur: 1.6 };
    }
  }

  stepWanted(world, dt);

  for (const pt of world.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.kind === 'smoke' || pt.kind === 'fire') pt.vy -= 12 * dt;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);

  // Camera follows the player, wider when driving.
  const targetZoom = world.player.car ? 0.82 : 1;
  world.camera.zoom += (targetZoom - world.camera.zoom) * Math.min(1, 2 * dt);
  const k = Math.min(1, 5 * dt);
  world.camera.x += (world.player.x - world.camera.x) * k;
  world.camera.y += (world.player.y - world.camera.y) * k;

  const audio = world.audio;
  if (audio) {
    const driving = world.player.car ? Math.abs(world.player.car.speed) / world.player.car.max : 0;
    audio.engine(!!world.player.car, driving);
    let policeNear = false;
    for (const car of world.cars) {
      if (car.driver === 'police' && dist(car.x, car.y, world.player.x, world.player.y) < 700) policeNear = true;
    }
    audio.update(dt, policeNear && world.player.wanted > 0);
  }
}

export function saveGame(world) {
  try {
    const p = world.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: p.money,
      missionIndex: world.missionIndex,
      storyDone: world.storyDone,
      x: p.x, y: p.y,
      health: p.health,
      weapon: p.weapon, ammo: p.ammo,
      stats: world.stats,
    }));
  } catch { /* storage can be off */ }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function applySave(world, save) {
  const p = world.player;
  p.money = save.money ?? 50;
  p.health = save.health ?? 100;
  p.weapon = save.weapon ?? 'fists';
  p.ammo = save.ammo ?? 0;
  p.x = save.x ?? p.x;
  p.y = save.y ?? p.y;
  world.missionIndex = save.missionIndex ?? 0;
  world.storyDone = !!save.storyDone;
  world.stats = { ...world.stats, ...(save.stats ?? {}) };
  world.camera.x = p.x;
  world.camera.y = p.y;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* storage can be off */ }
}
