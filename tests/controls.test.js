'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
require('../js/util');
require('../js/vr');

test('a controller ray maps onto the board from its own position, but never behind the player', () => {
  const m = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  assert.deepEqual(G.vr.intersect(m), {x:960, y:640});
  m[12] = 0.625;
  assert.deepEqual(G.vr.intersect(m), {x:1440, y:640});
  m[8] = 0.25;
  assert.ok(G.vr.intersect(m).x < 1100);
  m[10] = -1;
  assert.equal(G.vr.intersect(m), null);
  m[10] = 1; m[13] = 2;
  assert.equal(G.vr.intersect(m), null);
});

test('secondary touches cannot steal a drag and a canceled touch never fires on release', () => {
  const handlers = {}, events = [];
  global.addEventListener = () => {};
  G.bindBoard({ addEventListener: (k,fn) => { handlers[k] = fn; }, setPointerCapture() {} },
    { down:p => events.push(p), up:() => events.push('up'), move() {}, cancel:() => events.push('cancel') });
  G.view = {ox:10, oy:50, s:0.25};
  const first = {pointerId:1, pointerType:'touch', button:0, isPrimary:true, clientX:35, clientY:60};
  handlers.pointerdown(first);
  handlers.pointerup({...first,pointerId:2,isPrimary:false});
  handlers.pointercancel(first);
  handlers.pointerup(first);
  assert.deepEqual(events,[{x:100,y:40},'cancel']);
  handlers.pointerdown(first); handlers.pointerup(first);
  assert.equal(events.at(-1),'up');
});
