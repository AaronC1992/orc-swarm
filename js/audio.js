'use strict';
/* Procedural WebAudio sound effects. No asset files. */

G.audio = (function () {
  let ac = null, master = null, noiseBuf = null;
  const last = {};
  const A = { muted: false };

  A.init = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    master = ac.createGain();
    master.gain.value = A.muted ? 0 : (G.save.data.vol !== undefined ? G.save.data.vol : 0.6);
    const comp = ac.createDynamicsCompressor();
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (master) master.gain.value = m ? 0 : (G.save.data.vol !== undefined ? G.save.data.vol : 0.6);
  };

  function noise(dur, vol, type, f0, f1, q, delay) {
    const t = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  function tone(type, f0, f1, dur, vol, delay) {
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  const S = {
    gun: [0.07, () => noise(0.06, 0.05, 'highpass', 2600, 1800, 0.7)],
    cannon: [0.1, () => { noise(0.18, 0.16, 'lowpass', 1400, 200, 0.7); tone('sine', 130, 45, 0.18, 0.25); }],
    flame: [0.13, () => noise(0.18, 0.05, 'bandpass', 900, 500, 0.6)],
    mortar: [0.08, () => { tone('sine', 110, 40, 0.22, 0.22); noise(0.25, 0.08, 'lowpass', 900, 200, 0.6); }],
    zap: [0.05, () => { tone('sawtooth', 1800, 200, 0.14, 0.07); noise(0.1, 0.07, 'highpass', 3000, 1500, 0.8); }],
    boom: [0.07, () => { noise(0.45, 0.22, 'lowpass', 1100, 90, 0.7); tone('sine', 90, 30, 0.35, 0.28); }],
    missile: [0.1, () => { noise(0.5, 0.12, 'bandpass', 500, 2400, 0.9); tone('sawtooth', 220, 600, 0.35, 0.04); }],
    jet: [0.5, () => noise(1.6, 0.12, 'bandpass', 500, 1800, 0.8)],
    orbital: [0.5, () => { tone('sawtooth', 120, 480, 1.2, 0.07); tone('sine', 240, 960, 1.2, 0.07); }],
    cryo: [0.3, () => { tone('sine', 2400, 600, 0.8, 0.1); noise(0.6, 0.07, 'highpass', 4000, 2000, 0.8); }],
    siren: [1, () => { for (let i = 0; i < 4; i++) tone('square', 520, 520, 0.5, 0.05, i * 0.55 - 0.0); for (let i = 0; i < 4; i++) tone('square', 400, 400, 0.5, 0.05, i * 0.55 + 0.27); }],
    nuke: [1, () => { noise(2.4, 0.5, 'lowpass', 900, 40, 0.7); tone('sine', 70, 20, 1.8, 0.5); }],
    click: [0.03, () => tone('square', 700, 500, 0.05, 0.05)],
    place: [0.03, () => { tone('square', 300, 200, 0.08, 0.08); noise(0.08, 0.08, 'lowpass', 800, 200, 0.7); }],
    error: [0.1, () => tone('square', 160, 120, 0.15, 0.08)],
    leak: [0.12, () => { tone('sawtooth', 200, 80, 0.25, 0.12); }],
    buy: [0.05, () => { tone('triangle', 520, 780, 0.12, 0.12); tone('triangle', 780, 1040, 0.12, 0.1, 0.08); }],
    win: [1, () => { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.35, 0.14, i * 0.14)); }],
    lose: [1, () => { [330, 262, 196, 130].forEach((f, i) => tone('sawtooth', f, f * 0.95, 0.4, 0.09, i * 0.2)); }],
    start: [0.5, () => { tone('square', 220, 440, 0.25, 0.08); noise(0.35, 0.1, 'bandpass', 300, 1500, 0.7); }],
  };

  A.play = function (name) {
    if (!ac || A.muted || ac.state !== 'running') return;
    const s = S[name];
    if (!s) return;
    const now = ac.currentTime;
    if (last[name] !== undefined && now - last[name] < s[0]) return;
    last[name] = now;
    s[1]();
  };

  return A;
})();
