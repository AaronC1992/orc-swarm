'use strict';
/* Upgrades screen: a tab per weapon (plus Defense and Economy) above a grid of upgrade cards.
   model() only reads the save, so the VR menu can draw the same screen without any DOM. */

G.meta = (function () {
  const $ = id => document.getElementById(id);
  const M = { tab: 'gunner' };
  const WALLET = [
    { cur: 'crystal', name: 'Crystals', color: '#59b8ff', how: 'earned from kills' },
    { cur: 'orb', name: 'Orbs', color: '#ffa03a', how: "earned from a level's first win" },
    { cur: 'cube', name: 'Cubes', color: '#ff6fd8', how: 'earned from a flawless first win' },
  ];
  const CUR = {};
  for (const w of WALLET) CUR[w.cur] = w;
  const STATES = ['ready', 'poor', 'locked', 'max'];

  const chips = {};   // currency -> { el, b }
  const tabEls = {};  // tab id -> button
  const refs = {};    // card id -> the parts of its card element that change
  let built = false, gridKey = '', iconKey = '', guard = 0;

  /* ------------------------------------------------------------------ model */
  M.model = function () {
    const d = G.save.data;
    const tab = G.TAB_MAP[M.tab] || G.TABS[0];
    const info = G.tabInfo(tab);
    let note = '';
    if (tab.id === 'economy') {
      const p = G.payPerKill();
      note = 'Avg. payout: ' + (p < 10 ? Math.round(p * 100) / 100 : G.fmt(p)) + ' crystals per orc on Level 1';
    }
    return {
      wallet: WALLET.map(w => ({ cur: w.cur, name: w.name, color: w.color, have: d[G.curKey[w.cur]] })),
      tabs: G.TABS.map(t => Object.assign({ tab: t, selected: t === tab }, G.tabInfo(t))),
      tab, info, note,
      unlock: info.locked ? G.cardInfo(G.CARD_MAP[tab.weapon]) : null,
      cards: G.cardsOf(tab.id).map(c => G.cardInfo(c)),
    };
  };

  M.select = function (id) {
    if (!G.TAB_MAP[id] || id === M.tab) return;
    M.tab = id;
    M.refresh();
    scrollTab();
  };

  M.step = function (dir) {
    const n = G.TABS.length;
    const i = G.TABS.findIndex(t => t.id === M.tab);
    M.select(G.TABS[(i + dir + n) % n].id);
  };

  M.buy = function (id) {
    const c = G.CARD_MAP[id];
    if (!c) return false;
    const st = G.cardStatus(c);
    if (st === 'max') return false;
    if (st !== 'ready') { deny(c); return false; }
    G.buyCard(c);
    G.audio.play('buy');
    M.refresh(id);
    return true;
  };

  M.open = function () {
    build();
    if (!G.TAB_MAP[M.tab]) M.tab = G.TABS[0].id;
    gridKey = '';
    M.refresh();
    scrollTab();
  };

  M.close = function () {};

  M.refresh = function (bought) {
    if (!built) return;
    const m = M.model();
    paintWallet(m);
    paintTabs(m);
    paintInfo(m);
    const key = m.tab.id + (m.unlock ? ':locked' : '');
    if (key !== gridKey) {
      gridKey = key;
      buildGrid(m);
    } else {
      for (const i of m.unlock ? [m.unlock].concat(m.cards) : m.cards) paintCard(refs[i.card.id], i, i.card.id === bought);
    }
  };

  /* -------------------------------------------------------------------- dom */
  function make(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function icon(name, color, px, cls) {
    const c = make('canvas', cls);
    c.width = c.height = px;
    G.icon(c.getContext('2d'), name, px / 2, px / 2, px * 0.8, color);
    return c;
  }

  // restart a CSS animation class and drop it again once it has played
  function flash(el, cls, ms) {
    clearTimeout(el['t_' + cls]);
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el['t_' + cls] = setTimeout(() => el.classList.remove(cls), ms);
  }

  function deny(c) {
    G.audio.play('error');
    if (refs[c.id]) flash(refs[c.id].el, 'shake', 320);
    if (chips[c.cur]) flash(chips[c.cur].el, 'lack', 500);
  }

  function scrollTab() {
    const bar = $('upTabs'), b = tabEls[M.tab];
    if (!b || !bar.clientWidth) return;
    const want = b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2;
    bar.scrollLeft = Math.max(0, Math.min(bar.scrollWidth - bar.clientWidth, want));
  }

  function build() {
    if (built) return;
    built = true;
    for (const w of WALLET) {
      const el = document.querySelector('#wallet .chip[data-cur="' + w.cur + '"]');
      chips[w.cur] = { el, b: el.querySelector('b') };
    }
    buildTabs();
    $('upTabs').addEventListener('click', e => {
      const b = e.target.closest('button.tab');
      if (!b) return;
      if (b.dataset.tab !== M.tab) G.audio.play('click');
      M.select(b.dataset.tab);
      if (e.detail) b.blur(); // keep Enter meaning Play after a mouse click
    });
    $('upGrid').addEventListener('click', e => {
      const b = e.target.closest('button.buy');
      if (!b) return;
      if (e.detail) b.blur();
      // a double-click on Unlock must not also buy whatever card slides into that spot
      if (performance.now() < guard) return;
      M.buy(b.closest('.ucard').dataset.id);
    });
  }

  function buildTabs() {
    const bar = $('upTabs');
    bar.textContent = '';
    let group = '', row = null;
    for (const t of G.TABS) {
      if (t.group !== group) {
        group = t.group;
        const g = make('div', 'tg');
        row = make('div', 'tgt');
        g.append(make('div', 'tgl', group), row);
        bar.appendChild(g);
      }
      const b = make('button', 'tab');
      b.type = 'button';
      b.dataset.tab = t.id;
      b.style.setProperty('--c', t.color);
      b.append(icon(t.icon, t.color, 76, 'ti'), icon('lock', '#8a93a1', 40, 'bd lk'), icon('crown', '#ffd84a', 40, 'bd cr'), make('span', null, t.name));
      row.appendChild(b);
      tabEls[t.id] = b;
    }
  }

  function buildGrid(m) {
    const grid = $('upGrid');
    grid.textContent = '';
    for (const k in refs) delete refs[k];
    for (const i of m.unlock ? [m.unlock].concat(m.cards) : m.cards) {
      const r = buildCard(i.card);
      refs[i.card.id] = r;
      grid.appendChild(r.el);
      paintCard(r, i, false);
    }
    grid.scrollTop = 0;
    guard = performance.now() + 250;
  }

  function weaponArt(tab) {
    const c = make('canvas');
    c.width = c.height = 192;
    const ctx = c.getContext('2d');
    if (tab.ability) G.icon(ctx, tab.icon, 96, 96, 150, tab.color);
    else G.weapons.drawIcon(ctx, G.TMAP[tab.id], 96, 100, 2.4);
    return c;
  }

  function buildCard(c) {
    const t = G.TAB_MAP[c.tab];
    const el = make('div', 'ucard k-' + c.kind);
    el.dataset.id = c.id;
    el.style.setProperty('--c', t.color);
    const r = { el };

    const ic = make('div', 'ic');
    ic.appendChild(c.kind === 'weapon' ? weaponArt(t) : icon(c.icon, t.color, 104));

    const mid = make('div', 'mid');
    mid.append(make('div', 'nm', c.name), make('div', 'ds', c.desc));
    if (c.kind === 'stat') {
      const pips = make('div', 'pips');
      r.pips = [];
      for (let n = 0; n < c.max; n++) r.pips.push(pips.appendChild(make('i')));
      r.count = pips.appendChild(make('span'));
      mid.appendChild(pips);
    } else if (c.kind === 'weapon') {
      r.why = mid.appendChild(make('div', 'why'));
    }

    el.append(ic, mid);
    if (c.kind === 'stat') {
      const val = make('div', 'val');
      r.val = val.appendChild(make('b'));
      r.next = val.appendChild(make('small'));
      el.appendChild(val);
    }

    const buy = make('button', 'buy');
    buy.type = 'button';
    const pr = make('span', 'pr');
    pr.appendChild(icon(c.cur, CUR[c.cur].color, 52));
    r.price = pr.appendChild(make('span'));
    buy.append(make('span', 'lb', 'UNLOCK'), pr);
    r.buy = buy;
    el.append(buy, make('div', 'done', c.kind === 'stat' ? 'MAX' : 'UNLOCKED'));
    return r;
  }

  function label(i) {
    const c = i.card;
    if (i.status === 'locked') return c.name + ' is locked. ' + i.reason;
    const unit = CUR[c.cur].name.toLowerCase();
    return (c.kind === 'stat' ? 'Upgrade ' : 'Unlock ') + c.name + ' for ' + i.cost + ' ' + (i.cost === 1 ? unit.replace(/s$/, '') : unit);
  }

  function paintCard(r, i, bought) {
    for (const s of STATES) r.el.classList.toggle(s, i.status === s);
    if (r.pips) {
      r.pips.forEach((p, n) => p.classList.toggle('on', n < i.level));
      r.count.textContent = i.level + '/' + i.max;
    }
    if (r.val) {
      if (r.val.textContent !== i.value) {
        r.val.textContent = i.value;
        if (bought) flash(r.val, 'flash', 450);
      }
      r.next.textContent = i.next ? 'next: ' + i.next : '';
    }
    if (r.why) { r.why.textContent = i.reason; r.why.hidden = !i.reason; }
    r.price.textContent = i.status === 'locked' ? 'Locked' : G.fmt(i.cost);
    r.buy.setAttribute('aria-disabled', i.status === 'ready' ? 'false' : 'true');
    r.buy.setAttribute('aria-label', label(i));
    if (bought) flash(r.el, 'pop', 320);
  }

  function paintWallet(m) {
    for (const w of m.wallet) {
      const c = chips[w.cur];
      c.b.textContent = G.fmt(w.have);
      c.el.title = w.name + ': ' + Math.floor(w.have).toLocaleString('en-US') + ' (' + CUR[w.cur].how + ')';
    }
  }

  function paintTabs(m) {
    for (const t of m.tabs) {
      const b = tabEls[t.tab.id];
      b.classList.toggle('sel', t.selected);
      b.classList.toggle('locked', t.locked);
      b.classList.toggle('ready', t.ready);
      b.classList.toggle('maxed', t.maxed);
      b.setAttribute('aria-pressed', t.selected ? 'true' : 'false');
      b.title = t.tab.name + (t.locked ? ' - ' + (t.reason || 'Locked') : '');
    }
  }

  function paintInfo(m) {
    const t = m.tab, i = m.info;
    $('upInfo').style.setProperty('--c', t.color);
    if (iconKey !== t.id) {
      iconKey = t.id;
      const ctx = $('upIcon').getContext('2d');
      ctx.clearRect(0, 0, 112, 112);
      G.icon(ctx, t.icon, 56, 56, 90, t.color);
    }
    $('upTitle').textContent = t.title;
    $('upDesc').textContent = t.desc;
    $('upNote').textContent = m.note;
    $('upBar').style.width = (i.total ? Math.round(100 * i.done / i.total) : 0) + '%';
    $('upCount').textContent = i.done + ' / ' + i.total;
  }

  return M;
})();
