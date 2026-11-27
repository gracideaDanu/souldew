import test from 'node:test';
import assert from 'node:assert/strict';
import { validDsScale, hostArgs } from '../server/lib/native.mjs';

test('validDsScale accepts 1..4 and defaults invalid values to 1', () => {
  for (const n of [1, 2, 3, 4]) assert.equal(validDsScale(n), n);
  assert.equal(validDsScale('3'), 3);
  for (const bad of [0, -1, 5, 'abc', null, undefined, NaN]) assert.equal(validDsScale(bad), 1);
});

test('hostArgs emits software mode at 1x and OpenGL HD options at 2x..4x for nds', () => {
  const base = { system: 'nds', core: 'melondsds_libretro.dll', rom: 'game.nds', saveDir: '/save', systemDir: '/sys' };
  const a1 = hostArgs({ ...base, dsScale: 1 });
  assert.ok(a1.includes('melonds_render_mode=software'));
  assert.ok(!a1.some((x) => x.startsWith('melonds_opengl_resolution=')));

  const a3 = hostArgs({ ...base, dsScale: 3 });
  assert.ok(a3.includes('melonds_render_mode=opengl'));
  assert.ok(a3.includes('melonds_opengl_resolution=3'));
  assert.ok(a3.includes('melonds_opengl_better_polygons=enabled'));
  assert.ok(a3.includes('melonds_opengl_filtering=nearest'));
});

test('hostArgs ignores dsScale for non-DS systems', () => {
  const gba = hostArgs({ system: 'gba', core: 'mgba_libretro.dll', rom: 'game.gba', saveDir: '/save', systemDir: '/sys', dsScale: 4 });
  assert.ok(!gba.some((x) => x.includes('melonds_')));
});
