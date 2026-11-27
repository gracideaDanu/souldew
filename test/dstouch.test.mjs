import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_W, SAMPLE_H, SAMPLE_LEN, analyzeRgb, frameDiff, sampleNativeFrame, DsTouchWatch } from '../web/lib/dstouch.mjs';

function makeSolid(r, g, b) {
  const buf = new Uint8Array(SAMPLE_LEN);
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  }
  return buf;
}

function makePattern(seed = 1, base = 80, step = 110) {
  const buf = new Uint8Array(SAMPLE_LEN);
  for (let i = 0; i < buf.length; i += 3) {
    const k = (i / 3 + seed) % 5;
    buf[i] = Math.min(255, base + (k === 0 ? step : k * 15));
    buf[i + 1] = Math.min(255, base + (k === 1 ? step : k * 20));
    buf[i + 2] = Math.min(255, base + (k === 2 ? step : k * 25));
  }
  return buf;
}

test('analyzeRgb detects dark, solid fade, and active menu/keyboard patterns', () => {
  const dark = analyzeRgb(makeSolid(6, 6, 8));
  assert.equal(dark.isBlankOrDark, true);

  const whiteFade = analyzeRgb(makeSolid(250, 250, 250));
  assert.equal(whiteFade.isBlankOrDark, true);

  const menu = analyzeRgb(makePattern(1, 50, 140));
  assert.equal(menu.isBlankOrDark, false);

  const keyboard = analyzeRgb(makePattern(3, 100, 130));
  assert.equal(keyboard.isBlankOrDark, false);
});

test('DsTouchWatch stays hidden on dark overworld and opens on menu/keyboard', () => {
  const w = new DsTouchWatch();
  const top = makePattern(1, 70, 90);
  const dark = makeSolid(5, 5, 5);
  const menu = makePattern(2, 60, 150);

  assert.equal(w.tick(top, dark, { now: 1000 }), false);
  assert.equal(w.tick(top, dark, { now: 1250 }), false);

  // Two consecutive active frames open without X button
  assert.equal(w.tick(top, menu, { now: 1500 }), false);
  assert.equal(w.tick(top, menu, { now: 1750 }), true);

  // Brief 500 ms black fade between menus does not hide
  assert.equal(w.tick(top, dark, { now: 2000 }), true);
  assert.equal(w.tick(top, dark, { now: 2400 }), true);

  // Returning to menu keeps it open
  assert.equal(w.tick(top, menu, { now: 2600 }), true);

  // Closing menu (dark for >= 1000 ms) hides it
  assert.equal(w.tick(top, dark, { now: 3000 }), true);
  assert.equal(w.tick(top, dark, { now: 3999 }), true);
  assert.equal(w.tick(top, dark, { now: 4000 }), false);
});

test('DsTouchWatch opens on first active frame after X menu button is pressed', () => {
  const w = new DsTouchWatch();
  const top = makePattern(1, 70, 90);
  const dark = makeSolid(5, 5, 5);
  const menu = makePattern(2, 60, 150);

  assert.equal(w.tick(top, dark, { now: 1000 }), false);
  w.noteMenuButton(1100);
  assert.equal(w.tick(top, menu, { now: 1250 }), true);
});

test('DsTouchWatch learns non-dark idle baseline (C-Gear ON / Poketch) while walking', () => {
  const w = new DsTouchWatch({ walkLearnTicks: 6 });
  const cgear = makePattern(4, 40, 120);
  const menu = makePattern(9, 120, 130);
  let t = 1000;

  // Walking in overworld: top screen changes each tick, bottom C-Gear stays static
  for (let i = 0; i < 6; i += 1) {
    t += 250;
    w.tick(makePattern(i * 7, 50, 140), cgear, { now: t });
  }
  assert.equal(w.idleBaseline, null);

  // 7th tick (6th top-screen transition) learns C-Gear as idle baseline and hides
  t += 250;
  assert.equal(w.tick(makePattern(49, 50, 140), cgear, { now: t }), false);
  assert.ok(w.idleBaseline);

  // Opening menu/keyboard differs from baseline -> opens
  t += 250;
  w.tick(makePattern(42, 50, 140), menu, { now: t });
  t += 250;
  assert.equal(w.tick(makePattern(42, 50, 140), menu, { now: t }), true);

  // Returning to C-Gear baseline -> hides after idleHideMs
  t += 250;
  assert.equal(w.tick(makePattern(43, 50, 140), cgear, { now: t }), true);
  t += 1000;
  assert.equal(w.tick(makePattern(44, 50, 140), cgear, { now: t }), false);
});

test('DsTouchWatch respects battle grace period, touching state, and manual override', () => {
  const w = new DsTouchWatch();
  const top = makePattern(1, 70, 90);
  const dark = makeSolid(5, 5, 5);
  const menu = makePattern(2, 60, 150);

  assert.equal(w.setBattle(true, 1000), true);
  assert.equal(w.tick(top, dark, { now: 1250 }), true);
  assert.equal(w.setBattle(false, 2000), true);
  assert.equal(w.tick(top, dark, { now: 3000 }), true);
  assert.equal(w.tick(top, dark, { now: 4500 }), true);
  assert.equal(w.tick(top, dark, { now: 5500 }), false);

  // Never auto-hide while touching
  w.tick(top, menu, { now: 6000 });
  assert.equal(w.tick(top, menu, { now: 6250 }), true);
  assert.equal(w.tick(top, dark, { now: 6500, touching: true }), true);
  assert.equal(w.tick(top, dark, { now: 8000, touching: true }), true);
  assert.equal(w.tick(top, dark, { now: 8500, touching: false }), true);
  assert.equal(w.tick(top, dark, { now: 9500, touching: false }), false);

  // Manual hide stays hidden on same screen, clears when screen changes significantly
  w.tick(top, menu, { now: 10000 });
  assert.equal(w.tick(top, menu, { now: 10250 }), true);
  assert.equal(w.onManualToggle(false, 10500), false);
  assert.equal(w.tick(top, menu, { now: 10750 }), false);

  const keyboard = makePattern(8, 130, 120);
  assert.ok(frameDiff(menu, keyboard) > 22);
  assert.equal(w.tick(top, keyboard, { now: 11000 }), false);
  assert.equal(w.tick(top, keyboard, { now: 11250 }), true);
});

test('sampleNativeFrame samples BGRA, RGBA, and RGB565 stacked DS frames', () => {
  const w = 32;
  const h = 48; // top = 24, bot = 24

  // BGRA: top red (200, 10, 20), bot blue (10, 20, 210)
  const bgra = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (y < h / 2) { bgra[i] = 20; bgra[i + 1] = 10; bgra[i + 2] = 200; bgra[i + 3] = 255; }
      else { bgra[i] = 210; bgra[i + 1] = 20; bgra[i + 2] = 10; bgra[i + 3] = 255; }
    }
  }
  const s0 = sampleNativeFrame({ w, h, fmt: 0, px: bgra });
  assert.equal(s0.top.length, SAMPLE_W * SAMPLE_H * 3);
  assert.equal(s0.top[0], 200);
  assert.equal(s0.top[1], 10);
  assert.equal(s0.top[2], 20);
  assert.equal(s0.bot[0], 10);
  assert.equal(s0.bot[1], 20);
  assert.equal(s0.bot[2], 210);

  // RGBA: top green (10, 220, 30), bot white (240, 240, 240)
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (y < h / 2) { rgba[i] = 10; rgba[i + 1] = 220; rgba[i + 2] = 30; rgba[i + 3] = 255; }
      else { rgba[i] = 240; rgba[i + 1] = 240; rgba[i + 2] = 240; rgba[i + 3] = 255; }
    }
  }
  const s1 = sampleNativeFrame({ w, h, fmt: 1, px: rgba });
  assert.equal(s1.top[0], 10);
  assert.equal(s1.top[1], 220);
  assert.equal(s1.top[2], 30);
  assert.equal(s1.bot[0], 240);

  // RGB565: top pure red (0xF800), bot pure green (0x07E0)
  const rgb565 = new Uint8Array(w * h * 2);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 2;
      const val = y < h / 2 ? 0xf800 : 0x07e0;
      rgb565[i] = val & 0xff;
      rgb565[i + 1] = val >> 8;
    }
  }
  const s2 = sampleNativeFrame({ w, h, fmt: 2, px: rgb565 });
  assert.equal(s2.top[0], 255);
  assert.equal(s2.top[1], 0);
  assert.equal(s2.bot[0], 0);
  assert.equal(s2.bot[1], 255);
});
