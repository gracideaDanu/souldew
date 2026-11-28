// Heuristic detector for when the Nintendo DS bottom touch screen should float over the top screen in Focused mode.
// Inspects downsampled 16×12 RGB thumbnails of the top and bottom screens so menus, party/bag/PC screens, and the
// on-screen naming keyboard open automatically without relying on game-specific RAM addresses.

export const SAMPLE_W = 16;
export const SAMPLE_H = 12;
export const SAMPLE_LEN = SAMPLE_W * SAMPLE_H * 3;

/**
 * Summarizes luminance statistics of a packed RGB buffer (`SAMPLE_LEN` bytes) and whether it looks blank/dark/solid-fade.
 * @param {Uint8Array} rgb
 * @returns {{ meanLuma: number, brightFrac: number, stdLuma: number, isBlankOrDark: boolean }}
 */
export function analyzeRgb(rgb) {
  if (!rgb || rgb.length < 3) return { meanLuma: 0, brightFrac: 0, stdLuma: 0, isBlankOrDark: true };
  const n = Math.floor(rgb.length / 3);
  let sum = 0;
  let sumSq = 0;
  let bright = 0;
  for (let i = 0; i < n * 3; i += 3) {
    const luma = 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
    sum += luma;
    sumSq += luma * luma;
    if (luma >= 40) bright += 1;
  }
  const meanLuma = sum / n;
  const brightFrac = bright / n;
  const variance = Math.max(0, sumSq / n - meanLuma * meanLuma);
  const stdLuma = Math.sqrt(variance);
  const isBlankOrDark = (meanLuma < 28 && brightFrac < 0.18) || stdLuma < 8;
  return { meanLuma, brightFrac, stdLuma, isBlankOrDark };
}

/**
 * Mean absolute per-channel difference (0..255) between two equal-length RGB thumbnail buffers.
 * @param {Uint8Array | null} a
 * @param {Uint8Array | null} b
 * @returns {number}
 */
export function frameDiff(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 255;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

/**
 * Samples `16×12` RGB thumbnails from both halves of a stacked DS native frame (`top` = 0..h/2, `bot` = h/2..h).
 * Supports BGRA (`fmt === 0`), RGBA (`fmt === 1`), and RGB565 (`fmt === 2`).
 * @param {{ w: number, h: number, fmt: number, px: Uint8Array }} f
 * @returns {{ top: Uint8Array, bot: Uint8Array } | null}
 */
export function sampleNativeFrame(f) {
  if (!f || f.w < SAMPLE_W || f.h < SAMPLE_H * 2 || !f.px) return null;
  const compact = f.w >= 342 * 3 && f.h > 192 && f.h < Math.round((f.w * 384) / 342) - 4;
  const topH = compact ? f.h - 192 : Math.floor(f.h / 2);
  const botH = compact ? 192 : topH;
  const is565 = f.fmt === 2 || f.fmt === 4;
  const bottomUp = f.fmt === 3 || f.fmt === 4;
  const bpp = is565 ? 2 : 4;
  if (f.px.length < f.w * f.h * bpp) return null;

  const wide = compact || (f.w / topH) > 1.5;
  const xStart = compact ? 0 : (wide ? Math.floor((f.w * 43) / 342) : 0);
  const xSpan = compact ? 256 : (wide ? Math.floor((f.w * 256) / 342) : f.w);
  const top = new Uint8Array(SAMPLE_LEN);
  const bot = new Uint8Array(SAMPLE_LEN);
  const sampleHalf = (yOffset, srcH, out, cropCenter) => {
    let di = 0;
    for (let sy = 0; sy < SAMPLE_H; sy += 1) {
      const y0 = yOffset + Math.floor(((sy + 0.5) * srcH) / SAMPLE_H);
      const y = bottomUp ? f.h - 1 - y0 : y0;
      for (let sx = 0; sx < SAMPLE_W; sx += 1) {
        const x = (cropCenter ? xStart : 0) + Math.floor(((sx + 0.5) * (cropCenter ? xSpan : f.w)) / SAMPLE_W);
        const idx = (y * f.w + x) * bpp;
        if (is565) {
          const v = f.px[idx] | (f.px[idx + 1] << 8);
          out[di] = Math.round(((v >> 11) & 31) * 255 / 31);
          out[di + 1] = Math.round(((v >> 5) & 63) * 255 / 63);
          out[di + 2] = Math.round((v & 31) * 255 / 31);
        } else if (f.fmt === 0) {
          out[di] = f.px[idx + 2];
          out[di + 1] = f.px[idx + 1];
          out[di + 2] = f.px[idx];
        } else {
          out[di] = f.px[idx];
          out[di + 1] = f.px[idx + 1];
          out[di + 2] = f.px[idx + 2];
        }
        di += 3;
      }
    }
  };
  sampleHalf(0, topH, top, false);
  sampleHalf(topH, botH, bot, true);
  return { top, bot };
}

/**
 * Stateful controller for auto-showing/hiding the floating DS touch screen in Focused mode.
 */
export class DsTouchWatch {
  constructor({ idleHideMs = 350, baselineHideMs = 150, battleHideMs = 500, promptMs = 45000, walkLearnTicks = 12 } = {}) {
    this.idleHideMs = idleHideMs;
    this.baselineHideMs = baselineHideMs;
    this.battleHideMs = battleHideMs;
    this.promptMs = promptMs;
    this.walkLearnTicks = walkLearnTicks;
    this.reset();
  }

  reset() {
    this.shown = false;
    this.inBattle = false;
    this.battleEndedAt = -Infinity;
    this.promptStartedAt = -Infinity;
    this.promptUntil = -Infinity;
    this.menuPressedAt = -Infinity;
    this.override = null;
    this.overrideFrame = null;
    this.idleBaseline = null;
    this.prevTop = null;
    this.prevBot = null;
    this.activeTicks = 0;
    this.idleSince = 0;
    this.staticWalkTicks = 0;
  }

  setBattle(on, now = Date.now()) {
    const active = !!on;
    if (active && !this.inBattle) {
      this.override = null;
      this.overrideFrame = null;
      this.shown = true;
      this.idleSince = 0;
    } else if (!active && this.inBattle) {
      this.battleEndedAt = now;
      this.override = null;
      this.overrideFrame = null;
    }
    this.inBattle = active;
    return this.shown;
  }

  notePrompt(now = Date.now()) {
    this.override = null;
    this.overrideFrame = null;
    this.promptStartedAt = now;
    this.promptUntil = now + this.promptMs;
    this.shown = true;
    this.idleSince = 0;
    return this.shown;
  }

  noteMenuButton(now = Date.now()) {
    this.menuPressedAt = now;
    if (this.override === false) {
      this.override = null;
      this.overrideFrame = null;
    }
  }

  onManualToggle(next, _now = Date.now()) {
    this.override = !!next;
    this.overrideFrame = this.prevBot ? this.prevBot.slice() : null;
    this.shown = !!next;
    this.activeTicks = 0;
    this.idleSince = 0;
    return this.shown;
  }

  tick(topRgb, botRgb, { now = Date.now(), touching = false } = {}) {
    const botStats = analyzeRgb(botRgb);
    const topDiff = this.prevTop ? frameDiff(topRgb, this.prevTop) : 0;
    const botDiff = this.prevBot ? frameDiff(botRgb, this.prevBot) : 0;
    this.prevTop = topRgb ? topRgb.slice() : null;
    this.prevBot = botRgb ? botRgb.slice() : null;

    if (this.override === false && this.overrideFrame && frameDiff(botRgb, this.overrideFrame) > 22) {
      this.override = null;
      this.overrideFrame = null;
    }
    if (this.override !== null) {
      this.shown = this.override;
      return this.shown;
    }

    if (!this.inBattle && !touching && !botStats.isBlankOrDark && topDiff > 6 && botDiff < 4 && (now - this.menuPressedAt > 1500)) {
      this.staticWalkTicks += 1;
      if (this.staticWalkTicks >= this.walkLearnTicks) {
        this.idleBaseline = botRgb.slice();
        this.shown = false;
        this.activeTicks = 0;
        this.idleSince = 0;
      }
    } else if (botDiff >= 6 || botStats.isBlankOrDark || this.inBattle || touching) {
      this.staticWalkTicks = 0;
    }

    const matchesBaseline = this.idleBaseline && frameDiff(botRgb, this.idleBaseline) <= 18;
    const botActive = !botStats.isBlankOrDark && !matchesBaseline;

    if (this.inBattle) {
      this.activeTicks = 2;
      this.idleSince = 0;
      this.shown = true;
      return true;
    }

    if (touching) this.idleSince = 0;

    if (botActive) {
      this.idleSince = 0;
      this.activeTicks += 1;
      const need = (now - this.menuPressedAt <= 1500) ? 1 : 2;
      if (this.activeTicks >= need) this.shown = true;
      return this.shown;
    }

    this.activeTicks = 0;
    if (!this.idleSince) this.idleSince = now;
    if (now - this.battleEndedAt < this.battleHideMs) return this.shown;
    if (now < this.promptUntil && now - this.promptStartedAt < 3000) return this.shown;

    const hideDelay = matchesBaseline ? this.baselineHideMs : this.idleHideMs;
    if (now - this.idleSince >= hideDelay && !touching) {
      this.shown = false;
      this.promptUntil = -Infinity;
    }
    return this.shown;
  }
}
