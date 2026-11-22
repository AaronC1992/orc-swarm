'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

global.window = global;
for (const name of ['util', 'data', 'maps', 'meta']) require(path.join(__dirname, '..', 'js', name));
G.audio = { play() {} };

// a brand-new save with the given wallet
function fresh(wallet) {
  G.save.data = Object.assign(G.save.fresh(), wallet);
  G.computeStats();
  return G.save.data;
}

test('every card sits on a tab and boosts a real stat, and every weapon has an unlock card', () => {
  const seen = new Set();
  for (const c of G.CARDS) {
    assert.ok(!seen.has(c.id), 'duplicate card id ' + c.id);
    seen.add(c.id);
    assert.ok(G.TAB_MAP[c.tab], c.id + ' is on an unknown tab');
    for (const [stat] of c.fx) assert.ok(stat in G.BASE_STATS, c.id + ' boosts unknown stat ' + stat);
  }
  for (const w of G.TURRETS.concat(G.ABILITIES)) {
    const c = G.CARD_MAP[w.id];
    assert.ok(c && c.kind === 'weapon' && c.tab === w.id, w.id + ' has no unlock card');
  }
  for (const t of G.TABS) {
    let hops = 0;
    for (let r = t; r.req; r = G.TAB_MAP[r.req]) {
      assert.ok(G.TAB_MAP[r.req] && G.TAB_MAP[r.req].weapon, t.id + ' builds on an unknown weapon');
      assert.ok(++hops < G.TABS.length, t.id + ' has a circular unlock chain');
    }
  }
});

test('buying spends the exact price, raises the level and refreshes the stats', () => {
  const d = fresh({ crystals: 1000 });
  const c = G.CARD_MAP.g_dmg, price = G.cardCost(c);
  assert.equal(G.cardStatus(c), 'ready');
  assert.equal(G.buyCard('g_dmg'), true);
  assert.equal(d.crystals, 1000 - price);
  assert.equal(G.level('g_dmg'), 1);
  assert.equal(G.S['g.dmg'], G.BASE_STATS['g.dmg'] + c.fx[0][2]);
  assert.ok(G.cardCost(c) > price, 'the next level costs more');
});

test('a card cannot be bought while poor, locked or maxed', () => {
  const d = fresh({ crystals: 1 });
  assert.equal(G.cardStatus(G.CARD_MAP.g_dmg), 'poor');
  assert.equal(G.buyCard('g_dmg'), false);
  assert.equal(d.crystals, 1);

  Object.assign(d, { crystals: 1e9, orbs: 99, cubes: 99 });
  assert.equal(G.cardStatus(G.CARD_MAP.c_dmg), 'locked', 'no Cannon yet');
  assert.equal(G.cardStatus(G.CARD_MAP.laser), 'locked', 'the Laser builds on the Cannon');
  assert.equal(G.buyCard('c_dmg'), false);
  assert.equal(G.buyCard('laser'), false);
  assert.deepEqual([d.crystals, d.orbs, d.cubes], [1e9, 99, 99]);

  d.up.g_dmg = G.CARD_MAP.g_dmg.max;
  assert.equal(G.cardStatus(G.CARD_MAP.g_dmg), 'max');
  assert.equal(G.buyCard('g_dmg'), false);
  assert.equal(G.level('g_dmg'), G.CARD_MAP.g_dmg.max);
  assert.equal(G.buyCard('no_such_card'), false);
});

test('unlocking a weapon opens its tab and the weapons that build on it', () => {
  const d = fresh({ crystals: 1e9, orbs: 99, cubes: 99 });
  G.meta.tab = 'laser';
  let m = G.meta.model();
  assert.equal(m.info.locked, true);
  assert.equal(m.unlock.status, 'locked');
  assert.equal(m.unlock.reason, 'Requires Cannon');
  assert.ok(m.cards.length > 0 && m.cards.every(i => i.status === 'locked'));

  for (const id of ['cannon', 'laser']) {
    const card = G.CARD_MAP[id], price = G.cardCost(card), cur = G.curKey[card.cur], had = d[cur];
    assert.equal(G.meta.buy(id), true, id);
    assert.equal(d[cur], had - price);
  }
  m = G.meta.model();
  assert.equal(m.info.locked, false);
  assert.equal(m.unlock, null);
  assert.ok(m.cards.every(i => i.status === 'ready'));
  assert.equal(G.turretCount(G.TMAP.laser), 1);
});

test('card values read the way the cards show them', () => {
  const v = (id, level) => G.cardValue(G.CARD_MAP[id], level);
  assert.deepEqual([v('g_dmg', 0), v('g_dmg', 1)], ['100%', '125%']);
  assert.deepEqual([v('g_count', 0), v('g_count', 1)], ['4', '5']);
  assert.deepEqual([v('g_pierce', 0), v('g_pierce', 1)], ['1', '2']);
  assert.deepEqual([v('hp', 0), v('hp', 1)], ['50 HP', '60 HP']);
  assert.deepEqual([v('slow', 0), v('slow', 1)], ['100%', '97%']);
  assert.deepEqual([v('gold', 0), v('gold', 1)], ['0%', '0.5%']);
  assert.equal(v('s_cd', 1), '20.2s');
  assert.equal(v('m_auto', 1), '', 'feature cards have no value');
});

test('income is tight: the economy branch is a boost, and finishing every upgrade takes several runs', () => {
  const d = fresh();
  const base = G.payPerKill();
  G.meta.tab = 'economy';
  const shown = parseFloat(G.meta.model().note.match(/\d[\d.]*/)[0]);
  assert.ok(shown > 0, 'a payout under one crystal must not read as zero');

  for (const id of ['pay', 'gold', 'silver']) d.up[id] = G.CARD_MAP[id].max;
  G.computeStats();
  const boosted = G.payPerKill();
  assert.ok(boosted > base * 1.5, 'the economy cards still matter');
  assert.ok(boosted < base * 3, 'but cannot triple the income');

  // one flawless pass through every level with the economy maxed, against the price of every crystal upgrade
  const pass = G.LEVELS.reduce((sum, def, i) => sum + def.orcs * boosted * Math.pow(G.ECON.growth, i), 0);
  let price = 0;
  for (const c of G.CARDS) {
    if (c.cur !== 'crystal') continue;
    for (let l = 0; l < c.max; l++) {
      d.up[c.id] = l;
      price += G.cardCost(c);
    }
  }
  assert.ok(price > pass * 2, 'buying everything must take more than two full campaign passes');
});
