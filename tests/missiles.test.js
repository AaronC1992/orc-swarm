'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

global.window = global;
for (const name of ['util', 'data', 'maps', 'sim']) require(path.join(__dirname, '..', 'js', name));
G.fx = { emit() {}, explosion() {}, corpse() {} };
G.audio = { play() {} };
require(path.join(__dirname, '..', 'js', 'abilities'));

test('holding maxed missiles over a single spawn leaves gaps in the wave', t => {
  let seed = 123;
  t.mock.method(Math, 'random', () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
  G.save.data = G.save.fresh();
  for (const c of G.CARDS.filter(c => c.tab === 'missile')) G.save.data.up[c.id] = c.max;
  G.computeStats();
  const def = G.LEVELS.find(d => d.id === '1.1'), sim = G.sim, A = G.abilities;
  G.map = G.buildMap(def); sim.reset(); A.reset();
  G.state = 'battle'; G.input = { down: true, ...def.spawns[0] };
  const run = G.run = { def, total: def.orcs, hpMul: def.hp, aliveCap: def.orcs, alive: 0, spawning: true,
    hp: G.S.hp, kills: 0, leaked: 0, pay: 1, crystals: 0, dmg: new Float64Array(G.SRC.length) };
  let sawReload = false;
  for (let i = 0; i < 6000 && run.hp > 0 && (sim.spawned < def.orcs || run.alive); i++) {
    sim.update(0.025); A.update(0.025);
    if (!sawReload && A.missilesLeft === 0) {
      sawReload = true;
      assert.equal(A.use('missile', G.input), false, 'a manual click cannot skip the rack reload');
    }
  }
  assert.ok(sawReload);
  assert.ok(run.kills > def.orcs / 2, 'the launcher still clears most of an early wave');
  assert.ok(run.leaked >= def.orcs * 0.05, 'a stationary launcher must leave work for the turrets');
});
