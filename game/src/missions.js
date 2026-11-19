// Solara Bay — the story: five missions for Danny Cole, a driver who owes
// the crew, told in briefings and driven by steps the world advances.
// A step is one job: enter a car, reach a place, hold E to do the job, or
// lose the heat. Each mission pays cash and moves the story on.
export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    contact: 'Sal',
    briefing: [
      'Sal: Danny. You owe the crew, and the crew collects.',
      'Sal: First job is easy. Steal a car — any car — and bring it to my paint shop.',
      'Sal: Walk up to a car and press E. Don\'t let the cops see you take it.',
    ],
    steps: [
      { kind: 'enter-car', text: 'Steal any car (walk up, press E)' },
      { kind: 'reach', marker: 'paintShop', radius: 80, text: 'Drive to Sal\'s paint shop' },
    ],
    reward: 200,
    completeLine: 'Sal: Not bad. Here — a pistol. You\'ll need it where we\'re going.',
    onComplete(world) {
      world.player.weapon = 'pistol';
      world.player.ammo += 24;
    },
  },
  {
    id: 'package-run',
    title: 'Package Run',
    contact: 'Sal',
    briefing: [
      'Sal: A package is waiting at the docks. Pick it up and get it to the motel.',
      'Sal: Ninety seconds. The buyer does not wait, and neither do I.',
    ],
    steps: [
      { kind: 'reach', marker: 'docks', radius: 70, text: 'Pick up the package at the docks' },
      { kind: 'reach', marker: 'motel', radius: 80, text: 'Deliver the package to the motel', timer: 90 },
    ],
    reward: 350,
    completeLine: 'Sal: On time. The buyer is happy, and happy buyers pay.',
  },
  {
    id: 'three-stops',
    title: 'Three Stops',
    contact: 'Mara',
    briefing: [
      'Mara: Three shops owe us protection money. You collect.',
      'Mara: Hold E at each shop till the owner pays up. Expect noise — the cops will come.',
    ],
    steps: [
      { kind: 'hold', marker: 'shops0', radius: 70, hold: 2, text: 'Collect from the first shop (hold E)' },
      { kind: 'hold', marker: 'shops1', radius: 70, hold: 2, text: 'Collect from the second shop (hold E)' },
      { kind: 'hold', marker: 'shops2', radius: 70, hold: 2, text: 'Collect from the last shop (hold E)' },
    ],
    reward: 500,
    completeLine: 'Mara: All three paid. You\'re learning, Danny.',
    onComplete(world) {
      world.player.ammo += 24;
    },
  },
  {
    id: 'lay-low',
    title: 'Lay Low',
    contact: 'Sal',
    briefing: [
      'Sal: The cops are all over you, Danny. Three stars.',
      'Sal: Break line of sight, lay low till the heat dies, then get to the safehouse.',
    ],
    steps: [
      { kind: 'lose-wanted', text: 'Lose the wanted level (stay out of sight)' },
      { kind: 'reach', marker: 'safehouse', radius: 80, text: 'Reach the safehouse' },
    ],
    reward: 400,
    completeLine: 'Sal: Clean. The heat forgot your name — for now.',
    onStart(world) {
      world.addWanted(3, 'mission');
    },
  },
  {
    id: 'bay-job',
    title: 'The Bay Job',
    contact: 'Mara',
    briefing: [
      'Mara: This is the big one. The Bay Bank, midday, two grand in the vault drawer.',
      'Mara: Grab the cash, lose four stars of heat, and meet me at the hideout. Then we\'re even.',
    ],
    steps: [
      { kind: 'reach', marker: 'bank', radius: 80, text: 'Get to the Bay Bank' },
      { kind: 'hold', marker: 'bank', radius: 80, hold: 5, text: 'Grab the cash (hold E) — the alarm will trip!' },
      { kind: 'reach', marker: 'hideout', radius: 80, text: 'Escape to the hideout' },
    ],
    reward: 2000,
    completeLine: 'Mara: Two grand, clean getaway. The Bay is yours now, Danny.',
    onHoldStart(world) {
      world.addWanted(4, 'alarm');
    },
  },
];

export function startMission(world, index) {
  const def = MISSIONS[index];
  if (!def) return false;
  world.mission = {
    index,
    def,
    step: 0,
    holdT: 0,
    timer: 0,
    holdStarted: false,
    done: false,
  };
  world.dialogue = { lines: def.briefing, i: 0, t: 0, contact: def.contact };
  if (def.onStart) def.onStart(world);
  return true;
}

export function missionMarker(world) {
  const m = world.mission;
  if (!m || m.done) return null;
  const step = m.def.steps[m.step];
  if (!step || !step.marker) return null;
  const spots = world.city.spots;
  if (step.marker.startsWith('shops')) {
    const n = Number(step.marker.slice(5));
    return spots.shops[n] || null;
  }
  return spots[step.marker] || null;
}

export function currentStepText(world) {
  const m = world.mission;
  if (!m) return 'Free roam — press Enter at the payphone to take a job';
  if (m.done) return 'Job done — nice work';
  return m.def.steps[m.step].text;
}
