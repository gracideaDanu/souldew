import test from 'node:test';
import assert from 'node:assert/strict';
import { validDsScale, validGfxLook, hostArgs } from '../server/lib/native.mjs';
import { dsWideAddr, applyDsWideRam, RATIO_4_3, RATIO_16_9 } from '../web/lib/dswide.mjs';

test('validDsScale accepts 1..4, 6 and defaults invalid values to 1', () => {
  for (const n of [1, 2, 3, 4, 6]) assert.equal(validDsScale(n), n);
  assert.equal(validDsScale('6'), 6);
  for (const bad of [0, -1, 5, 7, 8, 'abc', null, undefined, NaN]) assert.equal(validDsScale(bad), 1);
});

test('dsWideAddr and applyDsWideRam patch 4:3 -> 16:9 and restore 16:9 -> 4:3', () => {
  assert.equal(dsWideAddr('IREO'), 0x0226FE50);
  assert.equal(dsWideAddr('ZZZZ'), null);

  let mem = RATIO_4_3;
  const emu = {
    read: (addr) => {
      assert.equal(addr, 0x0226FE50);
      const b = new Uint8Array(4);
      new DataView(b.buffer).setUint32(0, mem, true);
      return b;
    },
    write: (addr, bytes) => {
      assert.equal(addr, 0x0226FE50);
      mem = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
      return true;
    },
  };
  assert.equal(applyDsWideRam(emu, 'IREO', true), true);
  assert.equal(mem, RATIO_16_9);
  assert.equal(applyDsWideRam(emu, 'IREO', false), true);
  assert.equal(mem, RATIO_4_3);

  mem = 0x12345678;
  assert.equal(applyDsWideRam(emu, 'IREO', true), false);
  assert.equal(mem, 0x12345678);
});

test('validGfxLook accepts known shader modes and defaults invalid values to crisp', () => {
  for (const m of ['crisp', 'smooth', 'xbr', 'scanlines', 'lcd']) assert.equal(validGfxLook(m), m);
  for (const bad of ['', 'crt', null, undefined, 123]) assert.equal(validGfxLook(bad), 'crisp');
});

test('hostArgs emits software mode at 1x and OpenGL HD options at 2x..4x for nds', () => {
  const base = { system: 'nds', core: 'melondsds_libretro.dll', rom: 'game.nds', saveDir: '/save', systemDir: '/sys' };
  const a1 = hostArgs({ ...base, dsScale: 1 });
  assert.ok(a1.includes('melonds_render_mode=software'));
  assert.ok(!a1.some((x) => x.startsWith('melonds_opengl_resolution=')));

  const a6 = hostArgs({ ...base, dsScale: 6 });
  assert.ok(a6.includes('melonds_render_mode=opengl'));
  assert.ok(a6.includes('melonds_opengl_resolution=6'));
  assert.ok(a6.includes('melonds_opengl_better_polygons=enabled'));
  assert.ok(a6.includes('melonds_opengl_filtering=nearest'));
});

test('hostArgs ignores dsScale for non-DS systems', () => {
  const gba = hostArgs({ system: 'gba', core: 'mgba_libretro.dll', rom: 'game.gba', saveDir: '/save', systemDir: '/sys', dsScale: 4 });
  assert.ok(!gba.some((x) => x.includes('melonds_')));
});
