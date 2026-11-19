// Solara Bay — keyboard and mouse. The game reads held keys every frame and
// consumes edge-triggered actions (confirm, pause, punch, enter, mute) once.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_PUNCH = 4;
export const ACTION_ENTER = 8;
export const ACTION_MUTE = 16;

const KEYMAP = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  KeyF: ACTION_PUNCH,
  KeyE: ACTION_ENTER,
  KeyM: ACTION_MUTE,
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function codeOf(e) {
    return e.code || e.key;
  }

  window.addEventListener('keydown', (e) => {
    const c = codeOf(e);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
    if (!e.repeat) pressed.add(c);
    keys.add(c);
  });
  window.addEventListener('keyup', (e) => keys.delete(codeOf(e)));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
    mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (e) => {
    mouse.down = true;
    mouse.clicked = true;
    if (e.button === 0) pressed.add('Mouse0');
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  return {
    mouse,
    held(code) {
      return keys.has(code);
    },
    axis() {
      // Movement axis: x right, y down. Arrows and WASD both work.
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      return { x, y };
    },
    takeActions() {
      let out = 0;
      for (const [code, bit] of Object.entries(KEYMAP)) {
        if (pressed.has(code)) out |= bit;
      }
      if (pressed.has('Mouse0')) out |= ACTION_CONFIRM;
      pressed.clear();
      return out;
    },
    consumeClick() {
      const c = mouse.clicked;
      mouse.clicked = false;
      return c;
    },
  };
}
