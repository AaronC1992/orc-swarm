'use strict';
/* Game flow: scaling, run setup, main loop, state machine, rewards. */

(function () {
  const $ = id => document.getElementById(id);
  const stage = $('stage'), world = $('world'), terrain = $('terrain'), decal = $('decal');
  const fctx = $('fx').getContext('2d');
  const sim = G.sim, fx = G.fx, W = G.weapons, A = G.abilities, U = G.ui;
  const MAX_ALIVE = 30000;

  G.state = 'boot';
  G.paused = false;
  G.speed = 1;
  G.levelIdx = 0;

  G.save.load();
  G.computeStats();
  G.render.init($('glc'));
  fx.initDecal(decal);
  $('btnSound').textContent = 'Sound: On';

  const coarse = matchMedia('(pointer: coarse)');
  const fit = G.fit = function () {
    const mobile = coarse.matches && !G.inVR;
    document.body.classList.toggle('touch-ui', mobile);
    const top = mobile ? 44 : 0, bottom = mobile ? 96 : 0;
    const s = Math.min(innerWidth / G.W, (innerHeight - top - bottom) / G.H);
    G.view.s = s;
    G.view.ox = (innerWidth - G.W * s) / 2;
    G.view.oy = top + (innerHeight - top - bottom - G.H * s) / 2;
    const transform = 'translate(' + G.view.ox + 'px,' + G.view.oy + 'px) scale(' + s + ')';
    stage.style.transform = mobile ? 'none' : transform;
    $('board').style.transform = mobile ? transform : 'none';
  };
  coarse.addEventListener('change', fit);
  window.addEventListener('resize', fit);
  fit();

  /* ----------------------------------------------------------- run setup */
  function newRun(def, demo) {
    const S = G.S, idx = G.LEVELS.indexOf(def);
    return {
      def, demo: !!demo, total: demo ? 16000 : def.orcs, spawning: false, alive: 0, remaining: demo ? 16000 : def.orcs,
      aliveCap: demo ? 9000 : Math.min(MAX_ALIVE, def.orcs), hpMul: def.hp,
      pay: Math.pow(1.1, idx) * S.pay, kills: 0, leaked: 0, golds: 0, crystals: 0, bestNuke: 0,
      hp: demo ? 1e9 : S.hp, maxhp: demo ? 1e9 : S.hp, dmg: new Float64Array(G.SRC.length), doneAt: 0,
    };
  }

  function setupRun(def, demo) {
    G.computeStats();
    G.map = G.buildMap(def);
    G.renderTerrain(G.map, terrain);
    fx.initDecal(decal);
    sim.reset();
    W.reset();
    A.reset();
    G.run = newRun(def, demo);
    W.refresh();
  }

  function startDemo() {
    const idx = 1;
    if (!G.run || !G.run.demo || G.run.def !== G.LEVELS[idx]) {
      setupRun(G.LEVELS[idx], true);
      const order = ['gunner', 'flame', 'cannon', 'mortar'];
      let pi = 0;
      for (const id of order) {
        const d = G.TMAP[id];
        while (G.turretCount(d) > W.placed(id) && pi < G.map.spots.length) {
          const p = G.map.spots[pi++];
          W.place(d, p.x, p.y);
        }
      }
      G.planTurretRoutes(G.map, G.turrets);
    } else {
      sim.reset(); fx.clear();
      G.run = newRun(G.LEVELS[idx], true);
    }
    G.run.spawning = true;
  }

  G.startLevel = function (i) {
    G.levelIdx = i;
    const def = G.LEVELS[i];
    setupRun(def, false);
    W.restore(G.save.data.layouts[def.id]);
    G.paused = false; G.speed = 1;
    U.placing = null; U.sel = null;
    G.go('build');
  };

  G.beginBattle = function () {
    if (G.state !== 'build') return;
    if (!G.turrets.length) { G.audio.play('error'); U.toast('Place at least one turret first!'); return; }
    G.save.data.layouts[G.run.def.id] = W.layout();
    G.save.commit();
    G.planTurretRoutes(G.map, G.turrets);
    G.run.spawning = true;
    G.speed = 1;
    U.placing = null; U.sel = null;
    G.audio.play('start');
    G.go('battle');
  };

  G.go = function (s) {
    if (s === 'title') startDemo();
    G.state = s;
    U.show(s);
  };

  G.setPaused = function (p) {
    if (G.state !== 'battle') return;
    U.board.cancel();
    G.paused = p;
    $('screen-pause').classList.toggle('hidden', !p);
  };

  /* ------------------------------------------------------------- finish */
  function finish(win) {
    const run = G.run, def = run.def, d = G.save.data;
    run.spawning = false;
    G.state = 'result';
    const rec = d.levels[def.id] || (d.levels[def.id] = {});
    const perfect = win && run.leaked === 0;
    let orbs = 0, cubes = 0;
    if (win && !rec.won) orbs = 2;
    if (perfect && !rec.perfect) cubes = 1;
    const crystals = Math.floor(run.crystals);
    d.crystals += crystals; d.orbs += orbs; d.cubes += cubes;
    if (win) rec.won = true;
    if (perfect) rec.perfect = true;
    rec.best = Math.max(rec.best || 0, run.kills);
    d.stats.kills += run.kills; d.stats.runs++;
    G.save.commit();
    G.audio.play(win ? 'win' : 'lose');
    U.show('result');
    U.showResult({ win, perfect, kills: run.kills, total: run.total, leaked: run.leaked, crystals, orbs, cubes, bestNuke: run.bestNuke, dmg: run.dmg });
  }

  /* ---------------------------------------------------------- simulation */
  let lastLeaked = 0;
  function simulate(sdt) {
    const run = G.run;
    const n = Math.min(6, Math.max(1, Math.ceil(sdt / 0.025))), h = sdt / n, t0 = performance.now();
    for (let k = 0; k < n; k++) {
      sim.update(h);
      W.update(h);
      A.update(h);
      fx.update(h);
      if (performance.now() - t0 > 30) break;   // frame budget: slow down instead of stuttering
    }
    fx.flushDecals();
    if (run.leaked !== lastLeaked) { if (run.leaked > lastLeaked) G.audio.play('leak'); lastLeaked = run.leaked; }

    if (run.demo) {
      if (sim.time > run.def.dur + 30) startDemo();
      return;
    }
    if (G.state !== 'battle') return;
    if (run.hp <= 0) { finish(false); return; }
    if (sim.spawned >= run.total) {
      if (!run.doneAt) run.doneAt = sim.time;
      if (run.alive <= 0) { finish(true); return; }
      if (sim.time - run.doneAt > 150) {
        // failsafe: orcs that never find the exit are counted as leaks so the level can end
        for (let i = 0; i < sim.n; i++) if (!sim.dead[i]) sim.leak(i);
      }
    }
  }

  G.simulate = simulate;

  /* ---------------------------------------------------------------- draw */
  function markers(now, build) {
    const run = G.run, def = run.def, pulse = 0.5 + 0.5 * Math.sin(now / 300);
    fctx.save();
    fctx.textAlign = 'center'; fctx.font = 'bold 20px "Trebuchet MS", sans-serif';
    for (const e of def.exits) {
      const x = Math.min(G.W - 60, e.x), y = e.y;
      fctx.strokeStyle = 'rgba(255,70,60,' + (0.35 + 0.3 * pulse) + ')'; fctx.lineWidth = 4;
      fctx.setLineDash([14, 10]);
      fctx.beginPath(); fctx.arc(e.x, e.y, e.r, 0, G.TAU); fctx.stroke();
      fctx.setLineDash([]);
      if (build) { fctx.fillStyle = 'rgba(255,120,110,0.95)'; fctx.fillText('YOUR BASE', x, y - e.r - 14); }
    }
    if (build) {
      for (const s of def.spawns) {
        fctx.strokeStyle = 'rgba(120,255,100,' + (0.35 + 0.3 * pulse) + ')'; fctx.lineWidth = 4;
        fctx.setLineDash([10, 8]); fctx.beginPath(); fctx.arc(s.x, s.y, s.r, 0, G.TAU); fctx.stroke(); fctx.setLineDash([]);
        fctx.fillStyle = 'rgba(150,255,130,0.95)'; fctx.fillText('ORCS', Math.max(60, s.x + 20), s.y - s.r - 12);
      }
    }
    fctx.restore();
  }

  function draw(now) {
    const st = G.state;
    if (st === 'tree') { G.meta.draw(now); return; }
    if (st === 'levels' || st === 'boot') return;
    const shake = fx.shake;
    world.style.transform = shake > 0.05 ? 'translate(' + ((Math.random() - 0.5) * shake * 2).toFixed(1) + 'px,' + ((Math.random() - 0.5) * shake * 2).toFixed(1) + 'px)' : '';
    G.render.draw(now);
    fctx.clearRect(0, 0, G.W, G.H);
    const build = st === 'build', inp = U.input;
    if (st !== 'title') markers(now, build);
    W.draw(fctx, now, build, U.sel, build && U.placing ? inp : null);
    A.draw(fctx, now);
    fx.draw(fctx);
    if (build && U.placing && inp.inside) W.drawGhost(fctx, U.placing, inp.x, inp.y);
    if (st === 'battle' && inp.inside && !G.paused) A.drawAim(fctx, now, inp, inp.drag);
    $('flash').style.opacity = fx.flash > 0 ? Math.min(1, fx.flash) : 0;
    $('leakv').style.opacity = fx.leak > 0 ? Math.min(1, fx.leak / 0.35) : 0;
  }

  /* ----------------------------------------------------------------- loop */
  let last = performance.now();
  G.gameFrame = function (now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const st = G.state;
    if (!G.paused) {
      if (st === 'battle' || st === 'result' || st === 'title') simulate(dt * (st === 'battle' ? G.speed : 1));
      else if (st === 'build') fx.update(dt);
    }
    draw(now);
    if (st === 'build' || st === 'battle' || st === 'result') U.updateHud();
  };
  function frame(now) {
    requestAnimationFrame(frame);
    if (!G.inVR) G.gameFrame(now);
  }

  G.go('title');
  requestAnimationFrame(frame);
})();
