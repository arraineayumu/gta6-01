// Solara Bay — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// The game moves between screens: title, play, paused, wasted, busted and
// story complete. Missions start one after another; finishing all five
// completes the story and free roam goes on.
//
// ?seed=N fixes the city. ?shot=title|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. Progress saves to localStorage.
import { STEP, VIEW_W } from './config.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createWorld, loadGame, applySave, clearSave, resetWorld, saveGame, stepWorld, EVENT_BUSTED, EVENT_MISSION_DONE, EVENT_STORY_DONE, EVENT_WASTED } from './world.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';
import { MISSIONS, startMission } from './missions.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const world = createWorld(seed);
world.audio = audio;
const renderer = createRenderer(canvas);

window.__errors = [];
window.addEventListener('error', (e) => {
  window.__errors.push(String(e.message || e.error));
  document.title = `ERROR: ${window.__errors[0]}`;
});
window.addEventListener('unhandledrejection', (e) => {
  window.__errors.push(String(e.reason));
  document.title = `ERROR: ${window.__errors[0]}`;
});

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { mouseX: canvas.width / 2, mouseY: canvas.height / 2, best: 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      document.title = 'SHOT-READY';
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const save = loadGame();
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let started = false;

  function announce(message) {
    status.textContent = message;
  }

  function startFresh() {
    resetWorld(world);
    world.audio = audio;
    world.missionIndex = 0;
    startMission(world, 0);
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    announce('Playing. Follow the yellow marker.');
  }

  function startContinued() {
    resetWorld(world);
    world.audio = audio;
    if (save) {
      applySave(world, save);
      if (world.missionIndex < MISSIONS.length) startMission(world, world.missionIndex);
    } else {
      startMission(world, 0);
    }
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    announce('Playing. Welcome back to Solara Bay.');
  }

  function respawn(kind) {
    const p = world.player;
    p.money = Math.max(0, p.money - 100);
    p.health = 100;
    p.wanted = 0;
    p.car = null;
    const spot = kind === 'wasted' ? world.city.spots.hospital : world.city.spots.safehouse;
    p.x = spot.x;
    p.y = spot.y;
    world.camera.x = p.x;
    world.camera.y = p.y;
    world.wasted = false;
    world.busted = false;
    world.cops = [];
    world.cars = world.cars.filter((c) => c.driver !== 'police');
    screen = SCREEN_PLAY;
    saveGame(world);
    announce('Playing.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      return;
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        if (save && !started) startContinued();
        else startFresh();
        started = true;
      } else if (input.held('KeyN') && save) {
        clearSave();
        startFresh();
        started = true;
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        saveGame(world);
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (input.held('KeyQ')) {
        saveGame(world);
        screen = SCREEN_TITLE;
        announce('Solara Bay. Press Enter to play.');
      }
      return;
    }
    if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) respawn(screen === SCREEN_WASTED ? 'wasted' : 'busted');
      return;
    }
    if (screen === SCREEN_STORY) {
      if (actions & ACTION_CONFIRM) screen = SCREEN_PLAY;
      return;
    }
    if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  }

  function handleEvents() {
    const e = world.events;
    world.events = 0;
    if (e & EVENT_WASTED) {
      audio.engine(false, 0);
      screen = SCREEN_WASTED;
      announce('Wasted.');
      return;
    }
    if (e & EVENT_BUSTED) {
      audio.engine(false, 0);
      screen = SCREEN_BUSTED;
      announce('Busted.');
      return;
    }
    if (e & EVENT_STORY_DONE) {
      screen = SCREEN_STORY;
      announce('The Bay Job is done.');
      return;
    }
    if (e & EVENT_MISSION_DONE) {
      // The next mission starts once its briefing is read.
      if (!world.dialogue && world.missionIndex < MISSIONS.length) {
        startMission(world, world.missionIndex);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    // Mouse position in world coordinates, for aiming.
    const s = (canvas.clientWidth / VIEW_W) * world.camera.zoom;
    input.mouse.worldX = world.camera.x + (input.mouse.x - canvas.width / 2) / s;
    input.mouse.worldY = world.camera.y + (input.mouse.y - canvas.height / 2) / s;
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepWorld(world, input, input.takeActions(), STEP);
        accumulator -= STEP;
        handleEvents();
        if (screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
      if (screen === SCREEN_TITLE) {
        // The city stays alive behind the title.
        stepWorld(world, input, 0, STEP);
      }
    }
    renderer.draw(world, screen, { mouseX: input.mouse.x, mouseY: input.mouse.y, best: 0 });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara Bay. Press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
