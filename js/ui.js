'use strict';
/* DOM HUD, toolbars, mouse/keyboard input, level select, result and pause screens. */

G.ui = (function () {
  const $ = id => document.getElementById(id);
  const W = G.weapons, A = G.abilities, sim = G.sim;
  const fxCv = $('fx');
  const input = G.input = { x: 960, y: 540, down: false, drag: null, inside: false };
  const U = { sel: null, placing: null, dragging: null };
  const slots = [];
  const last = {};
  const ICONS = { missile: 'missile', strafe: 'plane', bomb: 'bomb', orbital: 'orbital', cryo: 'snow', nuke: 'nuke' };
  let toastT = 0;

  /* ----------------------------------------------------------- small utils */
  function setText(id, s) {
    if (last[id] !== s) { last[id] = s; $(id).textContent = s; }
  }
  U.toast = function (msg, ms) {
    const t = $('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.add('hidden'), ms || 1800);
  };
  document.querySelectorAll('canvas[data-icon]').forEach(c => {
    G.icon(c.getContext('2d'), c.dataset.icon, c.width / 2, c.height / 2, c.width * 0.8, c.dataset.color || '#e8edf5');
  });

  // pixel-art HUD counters, 2 screen px per art pixel like the battlefield
  const PIX = {
    orc: ['..ggg..', '.ggggg.', '.gdgdg.', '.ggggg.', '..ggg..', '.ggggg.', 'ggggggg', 'g.ggg.g', 'g.ggg.g', '..g.g..', '..g.g..', '.gg.gg.'],
    skel: ['..www..', '.wwwww.', '.wdwdw.', '.wwwww.', '..wdw..', '...w...', '.wwwww.', 'w.wdw.w', 'w.www.w', '..wdw..', '..w.w..', '.ww.ww.'],
  };
  const PCOL = { g: '#00a500', d: '#063d06', w: '#cfcfcf', o: '#005a00' };
  function pixArt(ctx, rows, ox, oy, outline) {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      if (outline) { ctx.fillStyle = PCOL.o; ctx.fillRect((ox + x) * 2 - 2, (oy + y) * 2, 2, 2); }
      ctx.fillStyle = ch === 'd' ? (rows === PIX.skel ? '#3a3a3a' : PCOL.d) : PCOL[ch];
      ctx.fillRect((ox + x) * 2, (oy + y) * 2, 2, 2);
    }
  }
  document.querySelectorAll('canvas[data-pix]').forEach(c => {
    const ctx = c.getContext('2d'), k = c.dataset.pix;
    if (k === 'horde') [[0, 2], [3, 0], [6, 2], [9, 1]].forEach(([x, y]) => pixArt(ctx, PIX.orc, x, y, true));
    else pixArt(ctx, PIX[k], 0, 1, false);
  });

  /* ------------------------------------------------------------- screens */
  const SCREENS = ['screen-title', 'screen-upgrades', 'screen-levels', 'screen-result', 'screen-pause'];
  function showOnly(ids) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', ids.indexOf(s) < 0);
  }

  U.show = function (state) {
    U.board.cancel();
    $('buildTools').classList.toggle('hidden', state !== 'build');
    if (state !== 'upgrades') G.meta.close();
    $('hud').classList.toggle('hidden', state !== 'build' && state !== 'battle' && state !== 'result');
    $('fx').style.pointerEvents = (state === 'build' || state === 'battle') ? 'auto' : 'none';
    if (state === 'title') showOnly(['screen-title']);
    else if (state === 'upgrades') { showOnly(['screen-upgrades']); G.meta.open(); }
    else if (state === 'levels') { showOnly(['screen-levels']); U.buildLevels(); }
    else if (state === 'result') showOnly(['screen-result']);
    else showOnly([]);
    if (state === 'build' || state === 'battle') {
      const b = state === 'build';
      $('banner').classList.toggle('hidden', !b);
      $('btnStart').classList.toggle('hidden', !b);
      $('battlectl').classList.toggle('hidden', b);
      $('btnMenu').classList.remove('hidden');
      U.buildToolbar();
      U.hint();
    }
  };

  U.hint = function () {
    const b = G.state === 'build';
    $('hintL').innerHTML = b
      ? '<b>1-9</b> pick a turret, <b>click</b> to place<br><b>Drag</b> a turret or its handle to aim<br><b>Wheel</b> widens / narrows the arc<br><b>Right-click</b> removes, <b>R</b> recalls all<br><b>Space</b> starts the battle, <b>Esc</b> menu'
      : '<b>Click</b> to fire, <b>1-9</b> pick an ability<br>Line abilities: <b>drag</b> a line, release to fire<br><b>F</b> speed, <b>Esc</b> pause';
  };

  /* -------------------------------------------------------------- toolbar */
  U.buildToolbar = function () {
    const tb = $('toolbar');
    tb.innerHTML = ''; slots.length = 0;
    if (G.state === 'build') {
      G.TURRETS.filter(d => G.turretCount(d) > 0).forEach((d, i) => {
        const s = document.createElement('div'); s.className = 'slot'; s.title = d.name + ': ' + d.desc;
        const c = document.createElement('canvas'); c.width = c.height = 72;
        W.drawIcon(c.getContext('2d'), d, 36, 38, 1);
        const k = document.createElement('div'); k.className = 'key'; k.textContent = i + 1;
        const n = document.createElement('div'); n.className = 'cnt';
        s.append(c, k, n);
        s.addEventListener('click', () => U.pickType(d));
        tb.appendChild(s);
        slots.push({ d, el: s, cnt: n });
      });
    } else if (G.state === 'battle') {
      A.unlocked().forEach((a, i) => {
        const s = document.createElement('div'); s.className = 'slot'; s.title = a.name + ': ' + a.desc;
        const c = document.createElement('canvas'); c.width = c.height = 72;
        G.icon(c.getContext('2d'), ICONS[a.id], 36, 38, 46, '#eef2f7');
        const k = document.createElement('div'); k.className = 'key'; k.textContent = i + 1;
        const v = document.createElement('div'); v.className = 'cdv';
        const t = document.createElement('div'); t.className = 'cdt';
        s.append(c, k, v, t);
        s.addEventListener('click', () => { A.arm(a.id); G.audio.play('click'); U.refreshSlots(); });
        tb.appendChild(s);
        let ammo;
        if (a.id === 'missile') {
          ammo = document.createElement('div'); ammo.className = 'cnt'; s.appendChild(ammo);
        }
        slots.push({ a, el: s, cdv: v, cdt: t, ammo });
      });
    }
    U.refreshSlots();
  };

  U.refreshSlots = function () {
    for (const s of slots) {
      if (s.d) {
        // placed / total, like the original toolbar ("7/7" once every gunner is on the map)
        const tot = G.turretCount(s.d);
        s.cnt.textContent = (tot - W.left(s.d)) + '/' + tot;
        s.el.classList.toggle('sel', U.placing === s.d);
      } else {
        s.el.classList.toggle('sel', A.armed === s.a.id);
      }
    }
  };

  U.pickType = function (d) {
    if (G.state !== 'build') return;
    if (W.left(d) <= 0) { G.audio.play('error'); return; }
    U.placing = U.placing === d ? null : d;
    U.sel = null;
    G.audio.play('click');
    U.refreshSlots();
  };

  /* ----------------------------------------------------------------- HUD */
  U.updateHud = function () {
    const run = G.run;
    if (!run) return;
    setText('hptxt', Math.ceil(run.hp) + ' / ' + run.maxhp);
    const pct = Math.max(0, run.hp / run.maxhp * 100) + '%';
    if (last.hpw !== pct) { last.hpw = pct; $('hpfill').style.width = pct; }
    setText('c-rem', G.fmt(run.remaining));
    setText('c-alive', G.fmt(run.alive));
    setText('c-kills', G.fmt(run.kills));
    const showHint = G.state === 'build' && !G.turrets.length && !U.placing;
    if (last.hint !== showHint) { last.hint = showHint; $('hintL').classList.toggle('show', showHint); }
    if (G.state === 'battle') {
      for (const s of slots) {
        if (!s.a) continue;
        const cd = A.cd[s.a.id] || 0, mx = A.maxCd(s.a.id);
        if (s.ammo) s.ammo.textContent = A.missilesLeft + '/' + s.a.rackSize;
        s.cdv.style.height = cd > 0 ? Math.min(100, cd / mx * 100) + '%' : '0';
        s.cdt.textContent = cd > 0.05 ? (cd >= 10 ? Math.ceil(cd) : cd.toFixed(1)) : '';
        s.el.classList.toggle('sel', A.armed === s.a.id);
        s.el.classList.toggle('off', cd > 0);
      }
      setText('btnSpeed', 'x' + G.speed);
    }
  };

  /* --------------------------------------------------------- level select */
  let previewTimer = 0;
  U.buildLevels = function () {
    const grid = $('levelgrid');
    grid.innerHTML = '';
    clearTimeout(previewTimer);
    const d = G.save.data, queue = [];
    G.LEVELS.forEach((def, i) => {
      const rec = d.levels[def.id] || {};
      const unlocked = i === 0 || (d.levels[G.LEVELS[i - 1].id] && d.levels[G.LEVELS[i - 1].id].won);
      const card = document.createElement('div');
      card.className = 'lcard' + (unlocked ? '' : ' locked');
      const c = document.createElement('canvas'); c.width = 240; c.height = 135;
      const lid = document.createElement('div'); lid.className = 'lid'; lid.textContent = def.id;
      const badge = document.createElement('div'); badge.className = 'badge';
      badge.innerHTML = rec.perfect ? '<span style="color:#ff7ad9">PERFECT</span>' : rec.won ? '<span style="color:#7bf06a">CLEARED</span>' : unlocked ? '' : 'LOCKED';
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = def.name;
      const sub = document.createElement('div'); sub.className = 'sub';
      sub.innerHTML = '<span>' + G.fmt(def.orcs) + ' orcs</span><span>' + (rec.best ? 'best ' + G.fmt(rec.best) + ' kills' : '') + '</span>';
      card.append(c, lid, badge, nm, sub);
      if (unlocked) card.addEventListener('click', () => { G.audio.play('click'); G.startLevel(i); });
      grid.appendChild(card);
      queue.push(() => G.drawPreview(c, def));
    });
    (function next() {
      const f = queue.shift();
      if (!f) return;
      f();
      previewTimer = setTimeout(next, 8);
    })();
  };

  /* --------------------------------------------------------------- result */
  U.showResult = function (res) {
    const t = $('resTitle');
    t.textContent = res.win ? (res.perfect ? 'Perfect Victory!' : 'Victory!') : 'Defeat';
    t.className = res.win ? 'win' : 'lose';
    let h = '<div><span class="k">Orcs killed:</span> ' + G.fmt(res.kills) + ' / ' + G.fmt(res.total) + '</div>';
    h += '<div><span class="k">Orcs leaked:</span> ' + G.fmt(res.leaked) + '</div>';
    h += '<div><span class="k">Crystals:</span> <span class="c">+' + G.fmt(res.crystals) + '</span></div>';
    if (res.orbs) h += '<div><span class="k">Orbs:</span> <span class="o">+' + res.orbs + '</span></div>';
    if (res.cubes) h += '<div><span class="k">Cubes:</span> <span class="p">+' + res.cubes + '</span></div>';
    if (res.bestNuke) h += '<div><span class="k">Best nuke:</span> ' + G.fmt(res.bestNuke) + ' kills</div>';
    if (G.S.dstats) {
      const rows = [];
      let tot = 0;
      for (let i = 0; i < G.SRC.length; i++) { tot += res.dmg[i]; rows.push([G.SRC[i], res.dmg[i]]); }
      rows.sort((a, b) => b[1] - a[1]);
      h += '<table>';
      for (const [n, v] of rows.slice(0, 7)) if (v > 0) h += '<tr><td>' + n + '</td><td>' + (tot ? Math.round(v / tot * 100) : 0) + '%</td><td><span class="bar" style="width:' + Math.round(v / tot * 220) + 'px"></span></td></tr>';
      h += '</table>';
    }
    $('resBody').innerHTML = h;
    $('btnResNext').classList.toggle('hidden', !(res.win && G.levelIdx < G.LEVELS.length - 1));
    showOnly(['screen-result']);
  };

  /* ---------------------------------------------------------------- input */
  function pos(e) {
    const m = G.toStage(e);
    input.x = m.x; input.y = m.y;
    return m;
  }

  function boardDown(m, type) {
    G.audio.init();
    Object.assign(input, m, { inside: true });
    if (G.paused) return;
    if (G.state === 'build') {
      if (U.placing) {
        const t = W.place(U.placing, m.x, m.y);
        if (t) {
          G.audio.play('place'); U.sel = t;
          if (type === 'touch' || type === 'xr' || W.left(U.placing) <= 0) U.placing = null;
          U.refreshSlots();
        } else G.audio.play('error');
        return;
      }
      if (U.sel) {
        const h = W.handlePos(U.sel);
        if ((h.x - m.x) ** 2 + (h.y - m.y) ** 2 < 28 * 28) { U.dragging = { mode: 'aim', t: U.sel }; return; }
      }
      const t = W.pick(m.x, m.y);
      if (t) { U.sel = t; U.dragging = { mode: 'move', t, ox: t.x - m.x, oy: t.y - m.y }; return; }
      U.sel = null;
    } else if (G.state === 'battle') {
      input.down = true;
      const def = A.def[A.armed];
      if (!A.ready(A.armed)) { G.audio.play('error'); return; }
      if (def.mode === 'click') A.use(A.armed, { x: m.x, y: m.y });
      else input.drag = { x: m.x, y: m.y };
    }
  }

  function boardMove(m) {
    Object.assign(input, m);
    const d = U.dragging;
    if (d && G.state === 'build') {
      if (d.mode === 'aim') W.aimAt(d.t, m.x, m.y);
      else {
        const t = d.t, p = W.canPlaceAt(t.def, m.x + d.ox, m.y + d.oy, t);
        if (p) {
          if (t.def.kind === 'lob') { t.ax += p.x - t.x; t.ay += p.y - t.y; }
          t.x = p.x; t.y = p.y;
          t.st = G.tstat(t);
          W.clampAim(t);
        }
      }
    }
  }

  function boardUp(m) {
    Object.assign(input, m);
    if (U.dragging) { U.dragging = null; return; }
    if (!G.paused && G.state === 'battle') {
      if (input.drag) {
        if (A.use(A.armed, input.drag, m)) { /* fired */ }
        input.drag = null;
      }
      input.down = false;
    }
  }
  U.board = { down: boardDown, move: boardMove, up: boardUp, cancel() {
    input.down = false; input.drag = null; input.inside = false; U.dragging = null;
  } };
  G.bindBoard(fxCv, U.board);
  $('buildDone').onclick = () => { U.placing = null; U.sel = null; U.refreshSlots(); };
  $('buildRemove').onclick = () => {
    if (U.sel) W.remove(U.sel);
    U.sel = null; U.placing = null; U.refreshSlots();
  };
  $('arcLess').onclick = () => { if (U.sel) W.adjustArc(U.sel, -0.04); };
  $('arcMore').onclick = () => { if (U.sel) W.adjustArc(U.sel, 0.04); };

  fxCv.addEventListener('contextmenu', e => {
    e.preventDefault();
    const m = pos(e);
    if (G.paused) return;
    if (G.state === 'build') {
      const t = W.pick(m.x, m.y);
      if (t) { W.remove(t); if (U.sel === t) U.sel = null; G.audio.play('click'); U.refreshSlots(); }
      else { U.placing = null; U.sel = null; U.refreshSlots(); }
    } else if (G.state === 'battle') {
      input.drag = null; A.armed = 'missile';
    }
  });

  fxCv.addEventListener('wheel', e => {
    if (G.state !== 'build' || !U.sel) return;
    e.preventDefault();
    W.adjustArc(U.sel, e.deltaY < 0 ? 0.04 : -0.04);
  }, { passive: false });

  fxCv.addEventListener('pointerenter', () => { input.inside = true; });
  fxCv.addEventListener('pointerleave', () => { input.inside = false; });

  window.addEventListener('keydown', e => {
    if (e.repeat && e.code !== 'Space') return;
    G.audio.init();
    const st = G.state;
    if (e.code === 'KeyM') { G.audio.setMuted(!G.audio.muted); setText('btnSound', ''); $('btnSound').textContent = 'Sound: ' + (G.audio.muted ? 'Off' : 'On'); return; }
    if (st === 'upgrades') {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); G.meta.step(e.code === 'ArrowLeft' ? -1 : 1); G.audio.play('click'); return; }
      // a focused button keeps its own Enter / Space behaviour
      if ((e.code === 'Enter' || e.code === 'Space') && e.target.tagName !== 'BUTTON') { e.preventDefault(); G.go('levels'); return; }
    }
    if (st === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); G.go('upgrades'); return; }
    if (st === 'build') {
      if (e.code === 'Space') { e.preventDefault(); G.beginBattle(); return; }
      if (e.code === 'KeyR') { W.recallAll(); U.sel = null; U.placing = null; U.refreshSlots(); G.audio.play('click'); return; }
      if (e.code === 'Delete' || e.code === 'Backspace') { if (U.sel) { W.remove(U.sel); U.sel = null; U.refreshSlots(); } return; }
      if (e.code === 'Escape') {
        if (!U.placing && !U.sel) { $('btnMenu').click(); return; }
        U.placing = null; U.sel = null; U.refreshSlots(); return;
      }
      const n = /^Digit(\d)$/.exec(e.code);
      if (n && slots[+n[1] - 1]) U.pickType(slots[+n[1] - 1].d);
    } else if (st === 'battle') {
      if (e.code === 'Escape' || e.code === 'KeyP') { G.setPaused(!G.paused); return; }
      if (e.code === 'KeyF') { G.speed = G.speed >= 3 ? 1 : G.speed + 1; return; }
      const n = /^Digit(\d)$/.exec(e.code);
      if (n && slots[+n[1] - 1]) { A.arm(slots[+n[1] - 1].a.id); G.audio.play('click'); }
    } else if (st === 'result' && e.code === 'Enter') {
      G.go('upgrades');
    }
  });

  /* --------------------------------------------------------------- buttons */
  $('btnContinue').addEventListener('click', () => { G.audio.init(); G.audio.play('click'); G.go('upgrades'); });
  $('btnNew').addEventListener('click', () => {
    if (window.confirm('Erase all progress and start a new game?')) { G.save.reset(); G.computeStats(); G.audio.play('click'); U.toast('Progress erased'); }
  });
  $('btnSound').addEventListener('click', () => {
    G.audio.init(); G.audio.setMuted(!G.audio.muted);
    $('btnSound').textContent = 'Sound: ' + (G.audio.muted ? 'Off' : 'On');
    G.audio.play('click');
  });
  $('btnPlay').addEventListener('click', () => { G.audio.play('click'); G.go('levels'); });
  $('btnUpBack').addEventListener('click', () => { G.audio.play('click'); G.go('title'); });
  $('btnLevelsBack').addEventListener('click', () => { G.audio.play('click'); G.go('upgrades'); });
  $('btnStart').addEventListener('click', () => G.beginBattle());
  $('btnSpeed').addEventListener('click', () => { G.speed = G.speed >= 3 ? 1 : G.speed + 1; });
  $('btnPause').addEventListener('click', () => G.setPaused(true));
  $('btnMenu').addEventListener('click', () => {
    if (G.state === 'battle') G.setPaused(true);
    else { G.save.data.layouts[G.run.def.id] = W.layout(); G.save.commit(); G.go('levels'); }
  });
  $('btnResume').addEventListener('click', () => G.setPaused(false));
  $('btnRestart').addEventListener('click', () => { G.setPaused(false); G.startLevel(G.levelIdx); });
  $('btnQuit').addEventListener('click', () => { G.setPaused(false); G.go('upgrades'); });
  $('btnResAgain').addEventListener('click', () => G.startLevel(G.levelIdx));
  $('btnResNext').addEventListener('click', () => G.startLevel(G.levelIdx + 1));
  $('btnResUp').addEventListener('click', () => G.go('upgrades'));

  U.input = input;
  return U;
})();
