// Conditional 16:9 3D projection RAM patch for DS Pokémon games (0x1555 = 4:3 → 0x1C72 = 16:9).
// Only writes when the expected aspect-ratio constant is currently present in RAM, and restores 4:3 when turned off.

export const DS_WIDE_ADDRS = {
  IREO: 0x0226FE50, // Pokémon Black 2 (USA/Europe)
  IRDO: 0x0226FE90, // Pokémon White 2 (USA/Europe)
  IRBO: 0x02282308, // Pokémon Black (USA/Europe)
  IRAO: 0x02282328, // Pokémon White (USA/Europe)
  IPKE: 0x02022F80, // Pokémon HeartGold (USA)
  IPGE: 0x02022F80, // Pokémon SoulSilver (USA)
  CPUE: 0x0202022C, // Pokémon Platinum (USA)
};

export const RATIO_4_3 = 0x00001555;
export const RATIO_16_9 = 0x00001C72;

export function dsWideAddr(code) {
  const key = String(code || '').toUpperCase().slice(0, 4);
  return Object.hasOwn(DS_WIDE_ADDRS, key) ? DS_WIDE_ADDRS[key] : null;
}

export function applyDsWideRam(emu, code, on) {
  const addr = dsWideAddr(code);
  if (!addr || !emu?.read || !emu?.write) return false;
  const b = emu.read(addr, 4);
  if (!b || b.length < 4) return false;
  const val = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  if (on && val === RATIO_4_3) return emu.write(addr, new Uint8Array([0x72, 0x1c, 0x00, 0x00]));
  if (!on && val === RATIO_16_9) return emu.write(addr, new Uint8Array([0x55, 0x15, 0x00, 0x00]));
  return false;
}
