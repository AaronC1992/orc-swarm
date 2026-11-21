'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

global.window = global;
for (const name of ['util', 'data', 'maps', 'sim']) require(path.join(__dirname, '..', 'js', name));
G.fx = { emit() {}, explosion() {}, ice() {}, beam() {} };
G.audio = { play() {} };
for (const name of ['weapons', 'abilities']) require(path.join(__dirname, '..', 'js', name));
G.save.data = G.save.fresh();
G.save.data.up.cryo = 1;
G.computeStats();

const sim = G.sim, dt = 0.025;
function startOrc(seed, x, y) {
  sim.reset(); G.abilities.reset();
  G.run = { def: G.map.def, spawning: true, total: 1, aliveCap: 1, alive: 0, leaked: 0,
    hp: 50, hpMul: 100, dmg: new Float64Array(G.SRC.length) };
  sim.spawnOne();
  sim.x[0] = x; sim.y[0] = y; sim.vx[0] = 50; sim.vy[0] = 0; sim.anim[0] = seed; sim.spd[0] = 1;
}

test('Concrete Maze: most orcs bypass a guarded fork, reckless orcs still use the shortcut', () => {
  const map = G.map = G.buildMap(G.LEVELS.find(d => d.id === '6.1'));
  function crossMaze(seed) {
    startOrc(seed, 36, 540);
    let branch;
    for (let i = 0; i < 3600 && !G.run.leaked; i++) {
      sim.update(dt);
      if (branch === undefined && sim.x[0] > 900) branch = sim.y[0];
    }
    assert.equal(G.run.leaked, 1, 'both routes must reach the exit');
    return branch;
  }
  assert.ok(crossMaze(1) < 400);
  const def = G.TMAP.tesla;
  G.planTurretRoutes(map, [800, 990].map(x => ({ x, y: 390, def, aim: 0, arc: 0, st: G.tstat({ def }) })));
  assert.ok(crossMaze(1) > 700);
  assert.ok(crossMaze(4) < 400);
  G.planTurretRoutes(map, []);
  assert.ok(crossMaze(1) < 400);
});

test('Three Roads: a nearby blast or line warning causes a temporary sidestep, not a retreat', () => {
  G.map = G.buildMap(G.LEVELS.find(d => d.id === '3.2'));
  function walk(id) {
    startOrc(1, 400, 600);
    if (id === 'missile') G.abilities.use(id, { x: 478, y: 544 });
    if (id === 'cryo') G.abilities.use(id, { x: 360, y: 580 }, { x: 700, y: 580 });
    for (let i = 0; i < 30; i++) { sim.update(dt); G.abilities.update(dt); }
    assert.ok(sim.x[0] > 420, 'keep moving toward the exit');
    assert.equal(sim.dodge[0], 0, 'resume normal movement after impact');
    return sim.y[0];
  }
  const normal = walk();
  for (const id of ['missile', 'cryo']) assert.ok(walk(id) > normal + 8, id);
});
