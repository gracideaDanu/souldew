// A native host's sound out – see ffaudio.h. The fast-forward part is the 3DS host's (../ctr-host/ffsound.h), which
// takes the frame's samples from audio_buf / audio_n and sends with send_msg / send_event.
#include "ffaudio.h"
#include "hostio.h"
#include "protocol.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

static const int16_t *audio_buf; // the frame being fast-forwarded (ffsound.h reads it)
static size_t audio_n;           // int16 values (2 per stereo frame)
#define send_msg(type, p, n) host_send((type), (p), (n))
#define send_event host_event
// (0.2 s of the queue at most, as the fast player's host had it in 2.8.2: a native core holds its speed – it keeps
// FF_TMIN, 0.12 s; test/ctrffsound.test.mjs measures the code)
#define FF_TARGET 0.2
#include "../ctr-host/ffsound.h"

#define WS_WIN 1024
#define WS_HOP 512
#define WS_SEARCH 192
static struct {
  int16_t *buf;
  size_t n, cap;
  int16_t prev[WS_HOP * 2];
  int16_t out[WS_HOP * 2];
  float hann[WS_HOP];
  int hann_ready;
  int primed;
  double due;
} ws;

static void ws_reset(void) {
  ws.n = 0;
  ws.primed = 0;
  ws.due = 0;
  memset(ws.prev, 0, sizeof ws.prev);
  if (!ws.hann_ready) {
    for (int i = 0; i < WS_HOP; i++)
      ws.hann[i] = 0.5f * (1.0f - cosf(3.14159265358979323846f * (float)i / (float)WS_HOP));
    ws.hann_ready = 1;
  }
}

static void ws_push(const int16_t *s, size_t frames) {
  if (!frames) return;
  if (ws.n + frames > ws.cap) {
    size_t cap = (ws.n + frames) * 2;
    if (cap < 8192) cap = 8192;
    int16_t *b = realloc(ws.buf, cap * 4);
    if (!b) return;
    ws.buf = b;
    ws.cap = cap;
  }
  memcpy(ws.buf + ws.n * 2, s, frames * 4);
  ws.n += frames;
}

static void ws_frame(struct ff_audio *fa, const int16_t *s, size_t frames, double dt, double asked) {
  ws_push(s, frames);
  const size_t max_q = (size_t)(fa->rate * 0.25) + WS_WIN + WS_SEARCH;
  if (ws.n > max_q) {
    const size_t keep = WS_WIN * 2 + WS_SEARCH;
    if (ws.n > keep) {
      memmove(ws.buf, ws.buf + (ws.n - keep) * 2, keep * 4);
      ws.n = keep;
    }
  }
  if (dt <= 0 || dt > 0.2) dt = (double)frames / (fa->rate * (asked > 1 ? asked : 2));
  ws.due += dt * fa->rate;
  if (ws.due > WS_HOP * 4) ws.due = WS_HOP * 4;
  if (!ws.primed) {
    if (ws.n < WS_WIN + WS_SEARCH) return;
    memcpy(ws.prev, ws.buf, WS_HOP * 4);
    memmove(ws.buf, ws.buf + WS_HOP * 2, (ws.n - WS_HOP) * 4);
    ws.n -= WS_HOP;
    ws.primed = 1;
  }
  while (ws.due >= WS_HOP && ws.n >= WS_WIN + WS_SEARCH) {
    int base = (int)(((double)(ws.n - (WS_WIN + WS_SEARCH))) * 0.65);
    int max_off = (int)ws.n - WS_WIN;
    int lo = base - WS_SEARCH;
    int hi = base + WS_SEARCH;
    if (lo < 0) lo = 0;
    if (hi > max_off) hi = max_off;
    int best = lo;
    double best_c = -1e30;
    for (int off = lo; off <= hi; off += 2) {
      double c = 0;
      const int16_t *p = ws.buf + off * 2;
      for (int j = 0; j < 256; j += 2) {
        double a = (double)ws.prev[j * 2] + (double)ws.prev[j * 2 + 1];
        double b = (double)p[j * 2] + (double)p[j * 2 + 1];
        c += a * b;
      }
      if (c > best_c) { best_c = c; best = off; }
    }
    const int16_t *cur = ws.buf + best * 2;
    for (int i = 0; i < WS_HOP; i++) {
      float w = ws.hann[i];
      float iw = 1.0f - w;
      for (int c = 0; c < 2; c++) {
        float v = (float)ws.prev[i * 2 + c] * iw + (float)cur[i * 2 + c] * w;
        if (v > 32767.0f) v = 32767.0f;
        else if (v < -32768.0f) v = -32768.0f;
        ws.out[i * 2 + c] = (int16_t)v;
      }
    }
    host_send(MSG_AUDIO, ws.out, WS_HOP * 4);
    memcpy(ws.prev, cur + WS_HOP * 2, WS_HOP * 4);
    size_t consume = (size_t)best + WS_HOP;
    if (consume < ws.n) memmove(ws.buf, ws.buf + consume * 2, (ws.n - consume) * 4);
    ws.n -= consume;
    ws.due -= WS_HOP;
  }
}

void ffa_init(struct ff_audio *fa, double sample_rate) {
  bool keep = fa->pitch_keep;
  *fa = (struct ff_audio){.rate = sample_rate > 0 ? sample_rate : 32768, .k = 1, .pitch_keep = keep};
  ff_reset(1);
  ws_reset();
}

void ffa_set_pitch(struct ff_audio *fa, bool on) {
  if (fa->pitch_keep == on) return;
  fa->pitch_keep = on;
  ws_reset();
}

void ffa_rate(struct ff_audio *fa, double rate) {
  if (rate <= 0 || (rate > fa->rate - 0.5 && rate < fa->rate + 0.5)) return;
  bool keep = fa->pitch_keep;
  *fa = (struct ff_audio){.rate = rate, .k = 1, .last = fa->last, .pitch_keep = keep};
  ff_reset(1); // (a turbo still on starts afresh with the next frame)
  ws_reset();
  host_event("{\"event\":\"audioRate\",\"sampleRate\":%.1f}", rate);
}

void ffa_frame(struct ff_audio *fa, const int16_t *s, size_t frames, bool turbo, double asked, double now) {
  if (turbo != fa->turbo) { // a fresh start for the sped-up sound: the asked-for speed until it is measured
    fa->turbo = turbo;
    ff_reset(turbo ? (asked > FF_MAXK ? FF_MAXK : asked < 1 ? 1 : asked) : 1);
    ws_reset();
    if (turbo && !fa->pitch_keep) send_event("{\"event\":\"ffrate\",\"k\":%.4f}", ff.k);
  } else if (turbo && !fa->pitch_keep && ff.kin > asked) {
    ff.kin = asked < 1 ? 1 : asked; // a slower step: the game won't go faster than asked (a faster one: measured as it comes)
  }
  if (!turbo) {
    if (frames) host_send(MSG_AUDIO, s, (uint32_t)(frames * 4));
  } else if (fa->pitch_keep) {
    ws_frame(fa, s, frames, now - fa->last, asked);
  } else {
    audio_buf = s;
    audio_n = frames * 2;
    ff_frame(now - fa->last, fa->rate);
    audio_buf = NULL;
    audio_n = 0;
  }
  fa->k = turbo ? (fa->pitch_keep ? 1 : ff.k) : 1;
  fa->holes = ff.holes;
  fa->last = now;
}

void ffa_idle(struct ff_audio *fa, double now) { fa->last = now; }

void ffa_measured(struct ff_audio *fa, double real) {
  (void)fa, (void)real;
}
