import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validDsScale, validGfxLook, validDsTouchMode, hostArgs, findSdatRange } from '../server/lib/native.mjs';
import { dsWideAddr, applyDsWideRam, RATIO_4_3, RATIO_16_9 } from '../web/lib/dswide.mjs';
import { dsWorldTable, dsPointers, dsWatchRanges, dsReadFrame, dsPlayer, dsDrawable } from '../shared/worldds.mjs';
import { linkWith } from '../shared/playtogether.mjs';

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

test('validDsTouchMode accepts known second-screen modes and defaults to fulldex', () => {
  for (const m of ['fulldex', 'dock', 'corner', 'center']) assert.equal(validDsTouchMode(m), m);
  for (const bad of ['', 'split', null, undefined, 42]) assert.equal(validDsTouchMode(bad), 'fulldex');
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

test('findSdatRange locates the SDAT slice from an NDS NitroFS FAT', () => {
  const dir = mkdtempSync(join(tmpdir(), 'souldew-sdat-'));
  try {
    const file = join(dir, 'test.nds');
    const buf = Buffer.alloc(0x400);
    buf.writeUInt32LE(0x200, 0x48); // fatOff
    buf.writeUInt32LE(16, 0x4c); // fatSize (2 entries)
    buf.writeUInt32LE(0x240, 0x200);
    buf.writeUInt32LE(0x2a0, 0x204);
    buf.write('TEST', 0x240, 'ascii');
    buf.writeUInt32LE(0x300, 0x208);
    buf.writeUInt32LE(0x380, 0x20c);
    buf.write('SDAT', 0x300, 'ascii');
    writeFileSync(file, buf);
    assert.deepEqual(findSdatRange(file), { start: 0x300, end: 0x380 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Gen 5 Black 2 Shared World table, RAM reader, and Play together compatibility', () => {
  const pair = linkWith(
    { id: 'pokemon-black-2', root: 'pokemon-black-2', gen: 5, system: 'nds' },
    { id: 'pokemon-black-2', root: 'pokemon-black-2', gen: 5, system: 'nds' },
  );
  assert.equal(pair.world, true);

  const entry = {
    id: 'black2_us',
    gen: 5,
    world: {
      family: 'bw2',
      g3dGlb: '0x02143A0C',
      mainPtr: '0x02000024',
      zoneOffset: '0x41B5C',
      mmdlPtr: '0x0230C644',
      inBattleAddr: '0x021B5138',
      overworldVal: '0x2800',
    },
  };
  const t = dsWorldTable(entry);
  assert.equal(t.gen, 5);
  assert.equal(t.fam, 24);

  const ram = new Uint8Array(0x400000);
  const dv = new DataView(ram.buffer);
  const w32 = (a, v) => dv.setUint32(a - 0x02000000, v >>> 0, true);
  const w16 = (a, v) => dv.setUint16(a - 0x02000000, v & 0xffff, true);
  w32(0x02000024, 0x02204CC4);
  w16(0x02204CC4 + 0x41B5C, 427);
  w16(0x021B5138, 0x2800);
  w32(0x02143A0C + 8 + 0, 2 * 4096);
  w32(0x02143A0C + 8 + 20, 3 * 4096);
  w32(0x02143A0C + 8 + 44, -4096);
  const mmdl = 0x0223E4A4;
  w32(0x0230C644, mmdl);
  w32(mmdl + 0x00, 0x23);
  w32(mmdl + 0x08, 0xff);
  w32(mmdl + 0x0c, 0xe7);
  w16(mmdl + 0x18, 1);
  w16(mmdl + 0x3c, 44);
  w16(mmdl + 0x3e, 1);
  w16(mmdl + 0x40, 765);
  w32(mmdl + 0x44, 712 * 4096);
  w32(mmdl + 0x48, 16 * 4096);
  w32(mmdl + 0x4c, 12248 * 4096);

  const read = (a, n) => ram.subarray(a - 0x02000000, a - 0x02000000 + n);
  const ptr = dsPointers(t, read);
  assert.deepEqual(ptr, { obj: mmdl, zoneAddr: 0x02204CC4 + 0x41B5C });
  assert.equal(dsWatchRanges(t, ptr).length, 5);
  const frame = dsReadFrame(t, read, ptr);
  assert.equal(dsDrawable(frame), true);
  const p = dsPlayer(t, frame);
  assert.equal(p.map, 427);
  assert.equal(p.x, 712);
  assert.equal(p.y, 12248);
  assert.equal(p.gender, 0);
});
