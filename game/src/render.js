// Solara Bay — the renderer: a top-down sun-soaked city, the people and cars
// in it, the effects, and the HUD with its minimap. Everything is drawn on
// one canvas; screens (title, pause, wasted, busted, story) paint over it.
import { CITY, GRID, PALETTE, PITCH, ROAD, VIEW_H, VIEW_W, roadCenter } from './config.js';
import { dist } from './entities.js';
import { missionMarker } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_STORY = 'story';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function fmtClock(min) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtMoney(n) {
  return `$${Math.floor(n).toLocaleString('en-US')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let vw = 0;
  let vh = 0;

  function resize() {
    const w = canvas.clientWidth || VIEW_W;
    const h = canvas.clientHeight || VIEW_H;
    if (w !== vw || h !== vh) {
      vw = w;
      vh = h;
      canvas.width = w;
      canvas.height = h;
    }
  }

  function viewOf(state) {
    resize();
    const s = (vw / VIEW_W) * state.camera.zoom;
    return {
      s,
      ox: vw / 2 - state.camera.x * s,
      oy: vh / 2 - state.camera.y * s,
      x0: state.camera.x - vw / 2 / s,
      y0: state.camera.y - vh / 2 / s,
      x1: state.camera.x + vw / 2 / s,
      y1: state.camera.y + vh / 2 / s,
    };
  }

  function drawGround(state, v) {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, vw, vh);
    // Beach sand and the sea south of the city.
    const sandY0 = (GRID - 1) * PITCH + ROAD;
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(v.ox, sandY0 * v.s + v.oy, CITY * v.s, (CITY - sandY0) * v.s);
    const waterY = CITY * v.s + v.oy;
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(0, waterY, vw, vh - waterY);
    ctx.fillStyle = PALETTE.water;
    for (let x = 0; x < vw; x += 90) {
      const wave = Math.sin((x + state.time * 40) * 0.02) * 4;
      ctx.fillRect(x, waterY + 6 + wave, 60, 3);
    }
    // Parks.
    for (const b of state.city.blocks) {
      if (b.zone !== 'park') continue;
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(b.x * v.s + v.ox, b.y * v.s + v.oy, b.w * v.s, b.h * v.s);
      if (b.pond) {
        ctx.fillStyle = '#4a90c4';
        ctx.beginPath();
        ctx.ellipse((b.x + b.w * 0.6) * v.s + v.ox, (b.y + b.h * 0.6) * v.s + v.oy, 46 * v.s, 30 * v.s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRoads(state, v) {
    ctx.fillStyle = PALETTE.asphalt;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      ctx.fillRect(v.ox, (c - ROAD / 2) * v.s + v.oy, CITY * v.s, ROAD * v.s);
      ctx.fillRect((c - ROAD / 2) * v.s + v.ox, v.oy, ROAD * v.s, CITY * v.s);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.lineYellow;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      for (let d = 0; d < CITY; d += 56) {
        ctx.fillRect(v.ox + d * v.s, (c - 2) * v.s + v.oy, 28 * v.s, 4 * v.s);
        ctx.fillRect((c - 2) * v.s + v.ox, v.oy + d * v.s, 4 * v.s, 28 * v.s);
      }
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = PALETTE.lineWhite;
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        const cx = roadCenter(i);
        const cy = roadCenter(j);
        for (let k = -2; k <= 2; k += 1) {
          ctx.fillRect((cx + k * 12 - 4) * v.s + v.ox, (cy - ROAD / 2 + 4) * v.s + v.oy, 8 * v.s, 12 * v.s);
          ctx.fillRect((cx + k * 12 - 4) * v.s + v.ox, (cy + ROAD / 2 - 16) * v.s + v.oy, 8 * v.s, 12 * v.s);
        }
      }
    }
  }

  function drawBlocks(state, v) {
    for (const b of state.city.blocks) {
      if (b.x > v.x1 || b.x + b.w < v.x0 || b.y > v.y1 || b.y + b.h < v.y0) continue;
      // Sidewalk ring.
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(b.x * v.s + v.ox, b.y * v.s + v.oy, b.w * v.s, b.h * v.s);
      ctx.fillStyle = b.zone === 'beach' ? PALETTE.sand : PALETTE.lot;
      ctx.fillRect((b.x + 10) * v.s + v.ox, (b.y + 10) * v.s + v.oy, (b.w - 20) * v.s, (b.h - 20) * v.s);
      for (const t of b.trees) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.arc((t.x + 4) * v.s + v.ox, (t.y + 5) * v.s + v.oy, t.r * v.s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3f7a34';
        ctx.beginPath();
        ctx.arc(t.x * v.s + v.ox, t.y * v.s + v.oy, t.r * v.s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5d9b4a';
        ctx.beginPath();
        ctx.arc((t.x - 3) * v.s + v.ox, (t.y - 3) * v.s + v.oy, (t.r - 4) * v.s, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const u of b.umbrellas) {
        ctx.fillStyle = '#8a6a3a';
        ctx.fillRect((u.x - 1) * v.s + v.ox, u.y * v.s + v.oy, 2 * v.s, 10 * v.s);
        ctx.fillStyle = u.color;
        ctx.beginPath();
        ctx.arc(u.x * v.s + v.ox, u.y * v.s + v.oy, 11 * v.s, Math.PI, 0);
        ctx.fill();
      }
      for (const bd of b.buildings) {
        const bx = bd.x * v.s + v.ox;
        const by = bd.y * v.s + v.oy;
        const bw = bd.w * v.s;
        const bh = bd.h * v.s;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(bx + 6 * v.s, by + 7 * v.s, bw, bh);
        ctx.fillStyle = bd.color;
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(bx, by, bw, 6 * v.s);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);
        if (bd.kind === 'tower') {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          for (let wy = 14; wy < bd.h - 10; wy += 22) {
            for (let wx = 12; wx < bd.w - 10; wx += 20) {
              ctx.fillRect((bd.x + wx) * v.s + v.ox, (bd.y + wy) * v.s + v.oy, 9 * v.s, 7 * v.s);
            }
          }
          ctx.fillStyle = '#3a3a44';
          ctx.fillRect((bd.x + bd.w / 2 - 16) * v.s + v.ox, (bd.y + bd.h / 2 - 12) * v.s + v.oy, 32 * v.s, 24 * v.s);
        } else if (bd.kind === 'shop') {
          ctx.fillStyle = '#e8e6da';
          ctx.fillRect(bx + 6 * v.s, by + 4 * v.s, bw - 12 * v.s, 10 * v.s);
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(bx + bw * 0.25, by + bh * 0.25, bw * 0.5, bh * 0.5);
        }
      }
    }
  }

  function drawCar(state, v, car) {
    const x = car.x * v.s + v.ox;
    const y = car.y * v.s + v.oy;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(car.angle);
    const s = v.s;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2 * s, 3 * s, (car.len / 2) * s, (car.wid / 2 + 2) * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14141a';
    ctx.fillRect((-car.len / 2 + 4) * s, (-car.wid / 2 - 2) * s, 12 * s, 5 * s);
    ctx.fillRect((-car.len / 2 + 4) * s, (car.wid / 2 - 3) * s, 12 * s, 5 * s);
    ctx.fillRect((car.len / 2 - 16) * s, (-car.wid / 2 - 2) * s, 12 * s, 5 * s);
    ctx.fillRect((car.len / 2 - 16) * s, (car.wid / 2 - 3) * s, 12 * s, 5 * s);
    ctx.fillStyle = car.wreck ? '#2a2a30' : car.color;
    ctx.beginPath();
    ctx.roundRect((-car.len / 2) * s, (-car.wid / 2) * s, car.len * s, car.wid * s, 7 * s);
    ctx.fill();
    if (!car.wreck) {
      ctx.fillStyle = '#bfe0ea';
      ctx.beginPath();
      ctx.roundRect((-car.len / 6) * s, (-car.wid / 2 + 3) * s, (car.len / 3) * s, (car.wid - 6) * s, 4 * s);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect((-car.len / 2 + 3) * s, (-car.wid / 2 + 2) * s, car.len * s * 0.25, 3 * s);
      if (car.driver === 'police') {
        const flash = Math.floor(state.time * 6) % 2 === 0;
        ctx.fillStyle = flash ? '#ff2a2a' : '#2a6aff';
        ctx.fillRect((-6) * s, (-car.wid / 2 - 1) * s, 12 * s, 4 * s);
        ctx.fillStyle = flash ? '#2a6aff' : '#ff2a2a';
        ctx.fillRect((-6) * s, (car.wid / 2 - 3) * s, 12 * s, 4 * s);
      }
    }
    ctx.restore();
    if (car.health < 35 && !car.wreck) {
      ctx.fillStyle = 'rgba(90,90,90,0.5)';
      ctx.beginPath();
      ctx.arc(x + Math.sin(state.time * 3) * 6, y - 8, 7 + Math.sin(state.time * 5) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPerson(state, v, p, isPlayer) {
    const x = p.x * v.s + v.ox;
    const y = p.y * v.s + v.oy;
    const s = v.s;
    if (p.state === 'down') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y, 13 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.shirt;
      ctx.beginPath();
      ctx.ellipse(x, y, 11 * s, 5 * s, p.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 2 * s, y + 3 * s, 9 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isPlayer ? '#e86a1a' : p.shirt;
    ctx.beginPath();
    ctx.arc(x, y, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(x + Math.cos(p.angle) * 3 * s, y + Math.sin(p.angle) * 3 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 12 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.isCop) {
      ctx.fillStyle = '#1d2f52';
      ctx.beginPath();
      ctx.arc(x, y - 2 * s, 6 * s, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawMarker(state, v) {
    const marker = missionMarker(state);
    if (!marker) return;
    const x = marker.x * v.s + v.ox;
    const y = marker.y * v.s + v.oy;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.arc(x, y, 34 * pulse * v.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 26 * pulse * v.s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd23a';
    ctx.save();
    ctx.translate(x, y - 34 * v.s);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7 * v.s, -7 * v.s, 14 * v.s, 14 * v.s);
    ctx.restore();
    // A beam into the sky so the marker reads from far away.
    ctx.fillStyle = 'rgba(255,210,58,0.13)';
    ctx.fillRect(x - 5 * v.s, y - 320 * v.s, 10 * v.s, 320 * v.s);
  }

  function drawParticles(state, v) {
    for (const pt of state.particles) {
      const a = clamp(pt.life / pt.maxLife, 0, 1);
      const x = pt.x * v.s + v.ox;
      const y = pt.y * v.s + v.oy;
      if (pt.kind === 'ring') {
        ctx.strokeStyle = `rgba(255,210,58,${a})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, (1 - a) * 90 * v.s + 10, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = pt.kind === 'smoke' ? a * 0.6 : a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(x, y, pt.size * v.s * (pt.kind === 'smoke' ? 1 + (1 - a) : 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawPickups(state, v) {
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      const x = pk.x * v.s + v.ox;
      const y = pk.y * v.s + v.oy;
      const bob = Math.sin(state.time * 3 + pk.x) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y + 8, 12 * v.s, 5 * v.s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pk.kind === 'health' ? '#e8e6da' : pk.kind === 'ammo' ? '#3a3a44' : '#2fae5a';
      ctx.beginPath();
      ctx.arc(x, y + bob, 11 * v.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pk.kind === 'health' ? '#c23b2e' : pk.kind === 'ammo' ? '#ffd23a' : '#fff';
      ctx.lineWidth = 2.5;
      if (pk.kind === 'health') {
        ctx.beginPath();
        ctx.moveTo(x - 5 * v.s, y + bob);
        ctx.lineTo(x + 5 * v.s, y + bob);
        ctx.moveTo(x, y + bob - 5 * v.s);
        ctx.lineTo(x, y + bob + 5 * v.s);
        ctx.stroke();
      } else {
        ctx.fillStyle = pk.kind === 'ammo' ? '#ffd23a' : '#fff';
        ctx.font = `bold ${12 * v.s}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pk.kind === 'ammo' ? 'A' : '$', x, y + bob + 0.5);
      }
    }
  }

  function drawMinimap(state) {
    const size = 168;
    const mx = vw - size - 14;
    const my = 14;
    const k = size / CITY;
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    ctx.beginPath();
    ctx.roundRect(mx - 6, my - 6, size + 12, size + 12, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, size, size);
    ctx.clip();
    ctx.fillStyle = '#3f6a34';
    ctx.fillRect(mx, my, size, size);
    ctx.fillStyle = '#2f76a8';
    ctx.fillRect(mx, my + (CITY - 40) * k, size, 40 * k);
    ctx.fillStyle = '#e8d39a';
    ctx.fillRect(mx, my + ((GRID - 1) * PITCH + ROAD) * k, size, (CITY - ((GRID - 1) * PITCH + ROAD)) * k);
    ctx.strokeStyle = '#8a8a92';
    ctx.lineWidth = 2;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i) * k;
      ctx.beginPath();
      ctx.moveTo(mx, my + c);
      ctx.lineTo(mx + size, my + c);
      ctx.moveTo(mx + c, my);
      ctx.lineTo(mx + c, my + size);
      ctx.stroke();
    }
    const marker = missionMarker(state);
    if (marker) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.25;
      ctx.fillStyle = '#ffd23a';
      ctx.save();
      ctx.translate(mx + marker.x * k, my + marker.y * k);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4 * pulse, -4 * pulse, 8 * pulse, 8 * pulse);
      ctx.restore();
    }
    for (const car of state.cars) {
      if (car.dead) continue;
      ctx.fillStyle = car.driver === 'police' ? (Math.floor(state.time * 6) % 2 === 0 ? '#ff2a2a' : '#2a6aff') : '#d8d8d8';
      ctx.fillRect(mx + car.x * k - 2, my + car.y * k - 2, 4, 4);
    }
    for (const cop of state.cops) {
      ctx.fillStyle = '#2a6aff';
      ctx.fillRect(mx + cop.x * k - 2, my + cop.y * k - 2, 4, 4);
    }
    const p = state.player;
    ctx.fillStyle = '#37e05a';
    ctx.save();
    ctx.translate(mx + p.x * k, my + p.y * k);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('N', mx + size - 12, my + 14);
  }

  function drawHud(state, view) {
    const p = state.player;
    // Health, money, wanted.
    ctx.fillStyle = 'rgba(10,14,20,0.72)';
    ctx.beginPath();
    ctx.roundRect(12, 12, 250, 64, 10);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.roundRect(24, 24, 150, 14, 7);
    ctx.fill();
    ctx.fillStyle = p.health > 50 ? '#37c65a' : p.health > 25 ? '#e8a33a' : '#e83a3a';
    ctx.beginPath();
    ctx.roundRect(24, 24, 150 * clamp(p.health / 100, 0, 1), 14, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fmtMoney(p.money), 184, 37);
    ctx.font = '20px system-ui, sans-serif';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < p.wanted ? '#ffd23a' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', 24 + i * 24, 66);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(fmtClock(state.clockMin), vw - 200, 30);
    ctx.textAlign = 'left';
    const weapon = p.weapon === 'pistol' ? `Pistol  ${p.ammo}` : 'Fists';
    ctx.fillText(weapon, 24, 96);
    if (p.car) {
      const mph = Math.round(Math.abs(p.car.speed) * 0.16);
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${mph}`, vw - 200, 108);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('mph', vw - 200, 124);
      ctx.textAlign = 'right';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(p.car.name, vw - 285, 96);
      ctx.textAlign = 'left';
    }
    // Mission objective.
    const m = state.mission;
    if (m && !m.done) {
      const step = m.def.steps[m.step];
      ctx.fillStyle = 'rgba(10,14,20,0.72)';
      const text = `${m.def.title} — ${step.text}`;
      ctx.font = 'bold 15px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 28;
      ctx.beginPath();
      ctx.roundRect((vw - w) / 2, vh - 96, w, 34, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd23a';
      ctx.textAlign = 'center';
      ctx.fillText(text, vw / 2, vh - 73);
      ctx.textAlign = 'left';
      if (step.timer !== undefined) {
        ctx.fillStyle = m.timer < 15 ? '#ff5a4a' : '#fff';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(Math.max(0, m.timer))}s`, vw / 2, vh - 108);
        ctx.textAlign = 'left';
      }
      if (step.kind === 'hold' && m.holdT > 0) {
        ctx.fillStyle = '#222';
        ctx.fillRect((vw - 200) / 2, vh - 56, 200, 8);
        ctx.fillStyle = '#ffd23a';
        ctx.fillRect((vw - 200) / 2, vh - 56, 200 * clamp(m.holdT / step.hold, 0, 1), 8);
      }
    } else if (!m) {
      ctx.fillStyle = 'rgba(10,14,20,0.6)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Free roam — find a payphone job: press Enter to take the next mission', 16, vh - 18);
    }
    // Dialogue.
    const d = state.dialogue;
    if (d) {
      const line = d.lines[d.i];
      ctx.fillStyle = 'rgba(10,14,20,0.82)';
      ctx.beginPath();
      ctx.roundRect(140, vh - 168, vw - 280, 58, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd23a';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(d.contact, 158, vh - 144);
      ctx.fillStyle = '#fff';
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText(line, 158, vh - 122);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('Enter ▸', vw - 158, vh - 122);
      ctx.textAlign = 'left';
    }
    // Banner (job done, pickups).
    if (state.banner) {
      const a = clamp(state.banner.t / 0.3, 0, 1) * clamp((state.banner.dur - state.banner.t) / 0.5, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffd23a';
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.banner.text, vw / 2, 150);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
    // Contextual hint.
    if (!p.car && !state.dialogue) {
      const near = state.cars.find((c) => !c.dead && !c.wreck && dist(p.x, p.y, c.x, c.y) < 58);
      if (near) {
        ctx.fillStyle = 'rgba(10,14,20,0.72)';
        ctx.font = 'bold 15px system-ui, sans-serif';
        const t = `Press E — steal the ${near.name}`;
        const w = ctx.measureText(t).width + 24;
        ctx.beginPath();
        ctx.roundRect((vw - w) / 2, vh - 52, w, 30, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(t, vw / 2, vh - 32);
        ctx.textAlign = 'left';
      }
    }
    // Crosshair when armed.
    if (!p.car && p.weapon === 'pistol') {
      const mx = view.mouseX;
      const my = view.mouseY;
      if (mx !== undefined) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx - 13, my);
        ctx.lineTo(mx - 5, my);
        ctx.moveTo(mx + 5, my);
        ctx.lineTo(mx + 13, my);
        ctx.moveTo(mx, my - 13);
        ctx.lineTo(mx, my - 5);
        ctx.moveTo(mx, my + 5);
        ctx.lineTo(mx, my + 13);
        ctx.stroke();
      }
    }
    // Damage flash and low-health pulse.
    if (p.hurtT < 0.4) {
      ctx.fillStyle = `rgba(200,30,30,${0.25 * (1 - p.hurtT / 0.4)})`;
      ctx.fillRect(0, 0, vw, vh);
    } else if (p.health < 30 && !p.car) {
      ctx.fillStyle = `rgba(200,30,30,${0.08 + Math.sin(state.time * 5) * 0.05})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    drawMinimap(state);
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(8,10,18,0.45)';
    ctx.fillRect(0, 0, vw, vh);
    const grad = ctx.createLinearGradient(0, vh * 0.28, 0, vh * 0.48);
    grad.addColorStop(0, '#ffd23a');
    grad.addColorStop(0.55, '#ff7a3a');
    grad.addColorStop(1, '#e83a6a');
    ctx.fillStyle = grad;
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SOLARA BAY', vw / 2, vh * 0.42);
    ctx.fillStyle = '#fff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('An open-world crime story — steal, drive, run jobs, outrun the law', vw / 2, vh * 0.42 + 38);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('WASD move & drive · E steal car · Mouse + click shoot · F punch · Shift sprint · Esc pause', vw / 2, vh * 0.62);
    ctx.fillText('Missions pay. The police remember. The Bay never sleeps.', vw / 2, vh * 0.62 + 26);
    const blink = Math.floor(state.time * 1.6) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#ffd23a';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(best > 0 || state.save ? 'Press ENTER to play' : 'Press ENTER to start', vw / 2, vh * 0.76);
    }
    if (state.save) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`Save found — ${fmtMoney(state.save.money)} · mission ${state.save.missionIndex + 1} of 5`, vw / 2, vh * 0.76 + 30);
    }
    ctx.textAlign = 'left';
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,10,18,0.6)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', vw / 2, vh * 0.4);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Esc — resume · Enter — save & resume · M — mute · Q — quit to title', vw / 2, vh * 0.4 + 36);
    ctx.textAlign = 'left';
  }

  function drawEnd(state, kind) {
    ctx.fillStyle = kind === 'story' ? 'rgba(10,20,12,0.55)' : 'rgba(20,8,10,0.6)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center';
    if (kind === 'wasted') {
      ctx.fillStyle = '#ff5a4a';
      ctx.font = 'bold 84px system-ui, sans-serif';
      ctx.fillText('WASTED', vw / 2, vh * 0.42);
      ctx.fillStyle = '#fff';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('The Bay claimed another one. You wake up at the hospital, lighter by $100.', vw / 2, vh * 0.42 + 36);
    } else if (kind === 'busted') {
      ctx.fillStyle = '#6aa8ff';
      ctx.font = 'bold 84px system-ui, sans-serif';
      ctx.fillText('BUSTED', vw / 2, vh * 0.42);
      ctx.fillStyle = '#fff';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('The Solara Bay PD has you. You post bail — $100 — and walk out clean.', vw / 2, vh * 0.42 + 36);
    } else {
      ctx.fillStyle = '#ffd23a';
      ctx.font = 'bold 72px system-ui, sans-serif';
      ctx.fillText('THE BAY JOB — DONE', vw / 2, vh * 0.4);
      ctx.fillStyle = '#fff';
      ctx.font = '19px system-ui, sans-serif';
      ctx.fillText('Two grand, a clean getaway, and the whole city knows the name Danny Cole.', vw / 2, vh * 0.4 + 38);
      ctx.fillText('Free roam continues — the Bay is yours now.', vw / 2, vh * 0.4 + 66);
    }
    ctx.fillStyle = '#ffd23a';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('Press ENTER to keep playing', vw / 2, vh * 0.62);
    ctx.textAlign = 'left';
  }

  function draw(state, screen, view) {
    const v = viewOf(state);
    drawGround(state, v);
    drawRoads(state, v);
    drawBlocks(state, v);
    drawPickups(state, v);
    drawMarker(state, v);
    for (const car of state.cars) {
      if (car.x < v.x0 - 80 || car.x > v.x1 + 80 || car.y < v.y0 - 80 || car.y > v.y1 + 80) continue;
      drawCar(state, v, car);
    }
    for (const ped of state.peds) {
      if (ped.x < v.x0 - 40 || ped.x > v.x1 + 40 || ped.y < v.y0 - 40 || ped.y > v.y1 + 40) continue;
      drawPerson(state, v, ped, false);
    }
    for (const cop of state.cops) {
      if (cop.x < v.x0 - 40 || cop.x > v.x1 + 40 || cop.y < v.y0 - 40 || cop.y > v.y1 + 40) continue;
      drawPerson(state, v, cop, false);
    }
    if (!(state.player.car && state.wasted)) drawPerson(state, v, state.player, true);
    drawParticles(state, v);
    if (screen === SCREEN_PLAY) drawHud(state, view);
    if (screen === SCREEN_TITLE) drawTitle(state, view.best);
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_WASTED) drawEnd(state, 'wasted');
    if (screen === SCREEN_BUSTED) drawEnd(state, 'busted');
    if (screen === SCREEN_STORY) drawEnd(state, 'story');
    if (screen === SCREEN_OVER) drawEnd(state, 'story');
  }

  return { draw, resize };
}
