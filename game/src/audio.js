// Solara Bay — all sound is synthesized with WebAudio: no audio files, no
// network. Every call is guarded, so a browser without audio (or a headless
// screenshot run) never breaks the game.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer(seconds = 1) {
    const c = ensure();
    if (!c) return null;
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type = 'sine', vol = 0.2, slideTo = 0) {
    const c = ensure();
    if (!c || muted) return;
    try {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(c.currentTime + dur + 0.02);
    } catch { /* audio is best-effort */ }
  }

  function burst(dur, vol, filterFreq) {
    const c = ensure();
    if (!c || muted) return;
    try {
      const buf = noiseBuffer(dur + 0.1);
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
      src.stop(c.currentTime + dur + 0.02);
    } catch { /* audio is best-effort */ }
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
      if (m) this.siren(false);
    },
    isMuted() {
      return muted;
    },
    click() {
      blip(660, 0.06, 'square', 0.08);
    },
    pickup() {
      blip(880, 0.09, 'sine', 0.16);
      setTimeout(() => blip(1320, 0.12, 'sine', 0.14), 70);
    },
    cash() {
      blip(990, 0.08, 'triangle', 0.16);
      setTimeout(() => blip(1320, 0.08, 'triangle', 0.16), 80);
      setTimeout(() => blip(1760, 0.14, 'triangle', 0.16), 160);
    },
    punch() {
      burst(0.08, 0.25, 500);
    },
    shot() {
      burst(0.14, 0.4, 2800);
      blip(160, 0.1, 'square', 0.2, 60);
    },
    crash(v) {
      burst(0.25, Math.min(0.5, 0.15 + v * 0.3), 900);
    },
    explosion() {
      burst(0.7, 0.55, 500);
      blip(90, 0.6, 'sine', 0.4, 35);
    },
    jingle() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((n, i) => setTimeout(() => blip(n, 0.16, 'triangle', 0.18), i * 110));
    },
    engine(on, speed01) {
      const c = ensure();
      if (!c) return;
      try {
        if (on && !muted) {
          if (!engineOsc) {
            engineOsc = c.createOscillator();
            engineGain = c.createGain();
            engineOsc.type = 'sawtooth';
            const f = c.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = 700;
            engineOsc.connect(f);
            f.connect(engineGain);
            engineGain.connect(master);
            engineOsc.start();
          }
          engineOsc.frequency.value = 55 + speed01 * 130;
          engineGain.gain.value = 0.03 + speed01 * 0.05;
        } else if (engineOsc) {
          engineGain.gain.value = 0;
        }
      } catch { /* audio is best-effort */ }
    },
    siren(on) {
      const c = ensure();
      if (!c) return;
      try {
        if (on && !muted) {
          if (!sirenOsc) {
            sirenOsc = c.createOscillator();
            sirenGain = c.createGain();
            sirenOsc.type = 'square';
            sirenOsc.frequency.value = 720;
            sirenGain.gain.value = 0.025;
            sirenOsc.connect(sirenGain);
            sirenGain.connect(master);
            sirenOsc.start();
          }
        } else if (sirenOsc) {
          sirenOsc.stop();
          sirenOsc = null;
          sirenGain = null;
        }
      } catch { /* audio is best-effort */ }
    },
    update(dt, policeNear) {
      // Two-tone wail: flip the siren note a few times a second.
      if (sirenOsc) {
        sirenTimer += dt;
        if (sirenTimer > 0.45) {
          sirenTimer = 0;
          sirenOsc.frequency.value = sirenOsc.frequency.value > 800 ? 700 : 950;
        }
      }
      this.siren(policeNear);
    },
    startMusic() {
      const c = ensure();
      if (!c || musicTimer) return;
      // A low-key synthwave loop: root notes with a soft bass and hats.
      const bass = [55, 55, 65.4, 49];
      musicTimer = setInterval(() => {
        if (muted) return;
        const root = bass[musicStep % bass.length];
        musicStep += 1;
        blip(root, 0.42, 'triangle', 0.1);
        blip(root * 2, 0.2, 'sine', 0.05);
        if (musicStep % 2 === 0) burst(0.03, 0.04, 6000);
      }, 460);
    },
    stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
}
