/*!
 * engine-audio.js — Ducati Panigale V4 / 1103 cc 90° V4 "Desmosedici Stradale"
 * A fully synthesised, zero-sample Web Audio engine-sound model.
 *
 * Physical model, not a sample player:
 *
 *   • Firing-impulse synthesis. A crank-angle phase accumulator runs the real
 *     720° four-stroke cycle and fires four cylinders at the Twin Pulse angles
 *     0° / 90° / 290° / 380°. Each firing emits a biphasic, exponentially
 *     decaying pressure pulse. The lumpy, V-twin-like bark of this engine is an
 *     emergent property of that uneven spacing — it is not EQ'd in afterwards.
 *   • Exhaust body. The pulse train is driven through a bank of biquad
 *     resonators standing in for pipe/megaphone formants (~180, 420, 1100,
 *     2600 Hz) with rpm- and throttle-dependent gains.
 *   • Intake roar. Noise through a resonant bandpass tracking rpm, plus an
 *     airbox honk that only appears on hard throttle.
 *   • Mechanical layer. Desmo valvetrain clatter, crank-phase gated, sat well
 *     back in the mix.
 *   • Overrun. Closed throttle at rpm drops pulse energy, brightens the pipe
 *     and lights up the crackle/pop generator.
 *   • Master chain. Soft saturation → compression → procedural convolution
 *     ambience → master gain.
 *
 * Rendering path: AudioWorklet (module built from a Blob URL, since we ship one
 * file) with a graceful fallback to pre-rendered one-cycle AudioBuffer loops
 * that are playbackRate-shifted and crossfaded. No ScriptProcessorNode anywhere.
 *
 * Public API — classic script tag, one global:
 *
 *   PanigaleAudio.isSupported() -> boolean          (constructs nothing)
 *   PanigaleAudio.create(opts)  -> engine
 *     opts.masterVolume : 0..1   (default 0.7)
 *     opts.context      : optional AudioContext / OfflineAudioContext to use
 *                         instead of creating one. Used by the offline test
 *                         harness; an injected context is never closed by us.
 *     opts.forceFallback: optional, skip the AudioWorklet path (testing)
 *
 *   engine.start()            -> Promise (resumes the context; gesture-safe)
 *   engine.stop()
 *   engine.setRPM(norm[, when])       norm 0..1 -> 1250..14500 rpm
 *   engine.setThrottle(t[, when])     0..1, changes timbre, not just level
 *   engine.setVolume(v)
 *   engine.blip()
 *   engine.shift()
 *   engine.isRunning() -> boolean
 *   engine.dispose()
 *
 * The optional second argument on setRPM/setThrottle is an absolute context
 * time; it lets an OfflineAudioContext schedule a whole sweep up front. Omit it
 * and everything happens "now", which is what interactive callers want.
 *
 * Zero external assets. MIT-ish: do what you like.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Engine constants
   * ------------------------------------------------------------------ */

  /* Twin Pulse firing order of the Desmosedici Stradale, in crank degrees
     within one 720° four-stroke cycle. Two closely spaced pairs — that 90°
     gap followed by a 200° gap is the whole character of the engine. */
  var FIRE_DEG = [0, 90, 290, 380];

  var RPM_IDLE = 1250;
  var RPM_MAX = 14500;

  /* Per-cylinder trims. Real engines are never four identical events: pipe
     lengths, ring seal and charge differ slightly. This is the difference
     between "engine" and "buzzer". */
  var CYL_AMP = [1.0, 0.93, 1.05, 0.96];
  var CYL_DEC = [1.0, 1.07, 0.95, 1.03];

  /* Exhaust resonances (Hz) — the pipe formants. */
  var RES_HZ = [180, 420, 1100, 2600];

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ------------------------------------------------------------------ *
   * AudioWorklet processor source.
   *
   * NOTE: the pulse maths below is mirrored by renderCycle() further down,
   * which is used by the no-worklet fallback. If you change the pulse shape
   * in one place, change it in the other.
   * ------------------------------------------------------------------ */

  var WORKLET_SRC = [
    "'use strict';",
    "var FIRE = __FIRE__;",
    "var CYL_AMP = __CYLA__;",
    "var CYL_DEC = __CYLD__;",
    "var MAXV = 14, MAXM = 12, MAXC = 8;",
    "",
    "function mkv(){ return { on:0, e1:0, e2:0, r1:0, r2:0, att:0, ai:0, amp:0, n:0 }; }",
    "",
    "class PanigaleV4Processor extends AudioWorkletProcessor {",
    "  static get parameterDescriptors(){",
    "    return [",
    "      { name:'rpm',      defaultValue:1250, minValue:400, maxValue:17000, automationRate:'k-rate' },",
    "      { name:'throttle', defaultValue:0,    minValue:0,   maxValue:1,     automationRate:'k-rate' },",
    "      { name:'drive',    defaultValue:1,    minValue:0,   maxValue:2,     automationRate:'k-rate' }",
    "    ];",
    "  }",
    "  constructor(){",
    "    super();",
    "    this.dt = 1 / sampleRate;",
    "    this.ph = 0;               // 0..1 across the full 720 deg cycle",
    "    this.rpmPrev = 1250;",
    "    this.thrPrev = 0;",
    "    this.lp = 0;               // one-pole lowpass state (exhaust)",
    "    this.hp = 0; this.hpx = 0; // one-pole DC blocker",
    "    this.seed = 987654321;",
    "    this.cyc = 0;              // completed cycles, for per-cycle jitter",
    "    this.cutUntil = -1;        // extra crackle window after an ignition cut",
    "    this.dead = false;",
    "    this.v = []; for (var i=0;i<MAXV;i++) this.v.push(mkv()); this.vi = 0;",
    "    this.m = []; for (var j=0;j<MAXM;j++) this.m.push(mkv()); this.mi = 0;",
    "    this.c = []; for (var k=0;k<MAXC;k++) this.c.push(mkv()); this.ci = 0;",
    "    var self = this;",
    "    this.port.onmessage = function(e){",
    "      var d = e.data || {};",
    "      if (d.type === 'cut') { self.cutUntil = currentTime + (d.dur || 0.14); }",
    "      else if (d.type === 'stop') { self.dead = true; }",
    "    };",
    "  }",
    "  rnd(){",
    "    var x = this.seed;",
    "    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;",
    "    this.seed = x | 0;",
    "    return (this.seed / 2147483648);   // -1 .. 1",
    "  }",
    "  // Fire one cylinder. tOff = seconds already elapsed since the exact",
    "  // (sub-sample accurate) crossing of the firing angle.",
    "  fire(cyl, tOff, rpm, thr){",
    "    var dt = this.dt;",
    "    var jitter = 1 + 0.018 * this.rnd();",
    "    // Pulse decay: scales with rpm so the 90 deg twin-pulse gap stays",
    "    // audible at redline; open throttle widens (slows) the pulse.",
    "    var d = 620 * Math.pow(rpm / 6000, 0.72) * (1 - 0.30 * thr) * CYL_DEC[cyl];",
    "    if (d < 40) d = 40;",
    "    var v = this.v[this.vi]; this.vi = (this.vi + 1) % MAXV;",
    "    v.on = 1;",
    "    v.r1 = Math.exp(-d * dt);",
    "    v.r2 = Math.exp(-d * 0.28 * dt);",
    "    v.e1 = Math.exp(-d * tOff);",
    "    v.e2 = Math.exp(-d * 0.28 * tOff);",
    "    var at = 0.00030 * (1 - 0.42 * thr);",
    "    v.ai = dt / at;",
    "    v.att = tOff / at; if (v.att > 1) v.att = 1;",
    "    var amp = (0.34 + 0.66 * thr) * CYL_AMP[cyl] * jitter;",
    "    amp *= Math.pow(6000 / rpm, 0.12);         // loudness compensation",
    "    v.amp = amp;",
    "    v.n = 0.18 + 0.50 * thr;",
    "    // Overrun crackle: unburnt charge lighting off in the header.",
    "    var hot = (currentTime < this.cutUntil) ? 1 : 0;",
    "    if ((thr < 0.15 && rpm > 3200) || hot) {",
    "      var p = hot ? 0.55 : (0.06 + 0.30 * (rpm - 3200) / 11000);",
    "      if (Math.abs(this.rnd()) < p) {",
    "        var cv = this.c[this.ci]; this.ci = (this.ci + 1) % MAXC;",
    "        var cd = 900 + 2600 * Math.abs(this.rnd());",
    "        cv.on = 1;",
    "        cv.r1 = Math.exp(-cd * dt);",
    "        cv.r2 = Math.exp(-cd * 0.30 * dt);",
    "        cv.e1 = 1; cv.e2 = 1;",
    "        cv.ai = dt / 0.0004; cv.att = 0;",
    "        cv.amp = (0.10 + 0.34 * Math.abs(this.rnd())) * (hot ? 1.5 : 1);",
    "        cv.n = 1;",
    "      }",
    "    }",
    "  }",
    "  // Desmo valvetrain / clutch clatter, gated to the crank so it locks to",
    "  // the engine instead of sounding like a separate noise bed.",
    "  clack(tOff, rpm){",
    "    var dt = this.dt;",
    "    var mv = this.m[this.mi]; this.mi = (this.mi + 1) % MAXM;",
    "    var d = 1600 + 900 * Math.abs(this.rnd());",
    "    mv.on = 1;",
    "    mv.r1 = Math.exp(-d * dt);",
    "    mv.r2 = Math.exp(-d * 0.45 * dt);",
    "    mv.e1 = Math.exp(-d * tOff);",
    "    mv.e2 = Math.exp(-d * 0.45 * tOff);",
    "    mv.ai = dt / 0.00012; mv.att = tOff / 0.00012; if (mv.att > 1) mv.att = 1;",
    "    mv.amp = (0.5 + 0.5 * Math.abs(this.rnd())) * (0.45 + 0.55 * rpm / 14500);",
    "    mv.n = 1;",
    "  }",
    "  process(inputs, outputs, parameters){",
    "    if (this.dead) return false;",
    "    var out = outputs[0];",
    "    if (!out || !out.length) return true;",
    "    var ex = out[0];",
    "    var mech = out.length > 1 ? out[1] : null;",
    "    var N = ex.length;",
    "    var dt = this.dt;",
    "",
    "    var pr = parameters.rpm, pt = parameters.throttle, pd = parameters.drive;",
    "    var rpmT = pr.length > 1 ? pr[N - 1] : pr[0];",
    "    var thrT = pt.length > 1 ? pt[N - 1] : pt[0];",
    "    var drive = pd.length > 1 ? pd[0] : pd[0];",
    "    if (rpmT < 400) rpmT = 400;",
    "    var rpm0 = this.rpmPrev, thr0 = this.thrPrev;",
    "    this.rpmPrev = rpmT; this.thrPrev = thrT;",
    "",
    "    // Interpolate rpm/throttle across the block so k-rate stepping never",
    "    // becomes an audible staircase during a sweep.",
    "    var rpmStep = (rpmT - rpm0) / N;",
    "    var thrStep = (thrT - thr0) / N;",
    "",
    "    // One-pole lowpass: throttle brightness plus a little alias control.",
    "    var fc = 1900 + 8200 * thrT + rpmT * 0.42;",
    "    if (thrT < 0.12) fc = 3200 + rpmT * 0.55;      // overrun brightens up",
    "    var nyq = sampleRate * 0.45;",
    "    if (fc > nyq) fc = nyq;",
    "    var lpA = 1 - Math.exp(-2 * Math.PI * fc * dt);",
    "    var hpA = Math.exp(-2 * Math.PI * 32 * dt);",
    "",
    "    var v = this.v, m = this.m, c = this.c;",
    "    var ph = this.ph;",
    "",
    "    for (var i = 0; i < N; i++) {",
    "      var rpm = rpm0 + rpmStep * i;",
    "      var thr = thr0 + thrStep * i;",
    "      // Four-stroke: one 720 deg cycle every two crank revolutions,",
    "      // so cycles/sec = rpm / 120 and firings/sec = rpm / 30.",
    "      var inc = (rpm / 120) * dt;",
    "      var prev = ph;",
    "      ph += inc;",
    "      var wrapped = 0;",
    "      if (ph >= 1) { ph -= 1; wrapped = 1; this.cyc++; }",
    "",
    "      for (var f = 0; f < 4; f++) {",
    "        var fa = FIRE[f] / 720;",
    "        var hit = -1;",
    "        if (!wrapped) { if (prev < fa && fa <= ph) hit = (fa - prev) / inc; }",
    "        else {",
    "          if (fa > prev) hit = (fa - prev) / inc;",
    "          else if (fa <= ph) hit = (fa + 1 - prev) / inc;",
    "        }",
    "        if (hit >= 0) {",
    "          var tOff = (1 - hit) * dt; if (tOff < 0) tOff = 0;",
    "          this.fire(f, tOff, rpm, thr);",
    "          this.clack(tOff, rpm);",
    "        }",
    "        // Second valve event per cylinder, offset in the cycle.",
    "        var va = (FIRE[f] + 250) % 720 / 720;",
    "        var hit2 = -1;",
    "        if (!wrapped) { if (prev < va && va <= ph) hit2 = (va - prev) / inc; }",
    "        else {",
    "          if (va > prev) hit2 = (va - prev) / inc;",
    "          else if (va <= ph) hit2 = (va + 1 - prev) / inc;",
    "        }",
    "        if (hit2 >= 0) this.clack((1 - hit2) * dt, rpm);",
    "      }",
    "",
    "      // --- exhaust pulse train ---------------------------------------",
    "      var s = 0, k, o, a, p;",
    "      for (k = 0; k < MAXV; k++) {",
    "        o = v[k]; if (!o.on) continue;",
    "        a = o.att;",
    "        if (a < 1) { o.att = a + o.ai; a = a * a * (3 - 2 * a); } else { a = 1; }",
    "        // Biphasic, near zero-mean pressure pulse: fast compression front",
    "        // then a slow rarefaction tail. 0.28 makes the areas cancel.",
    "        p = a * (o.e1 - 0.28 * o.e2);",
    "        s += o.amp * (p + o.n * a * o.e1 * this.rnd() * 0.6);",
    "        o.e1 *= o.r1; o.e2 *= o.r2;",
    "        if (o.e2 < 2.5e-4) o.on = 0;",
    "      }",
    "      // --- overrun crackle -------------------------------------------",
    "      for (k = 0; k < MAXC; k++) {",
    "        o = c[k]; if (!o.on) continue;",
    "        a = o.att; if (a < 1) { o.att = a + o.ai; a = a * a * (3 - 2 * a); } else { a = 1; }",
    "        s += o.amp * a * (o.e1 * this.rnd() + 0.5 * (o.e1 - 0.30 * o.e2));",
    "        o.e1 *= o.r1; o.e2 *= o.r2;",
    "        if (o.e2 < 2.5e-4) o.on = 0;",
    "      }",
    "",
    "      s *= drive;",
    "      this.lp += lpA * (s - this.lp);",
    "      var y = this.lp;",
    "      this.hp = hpA * (this.hp + y - this.hpx); this.hpx = y;",
    "      ex[i] = this.hp;",
    "",
    "      // --- mechanical layer ------------------------------------------",
    "      if (mech) {",
    "        var ms = 0;",
    "        for (k = 0; k < MAXM; k++) {",
    "          o = m[k]; if (!o.on) continue;",
    "          a = o.att; if (a < 1) { o.att = a + o.ai; a = a * a * (3 - 2 * a); } else { a = 1; }",
    "          ms += o.amp * a * (o.e1 * this.rnd() * 0.8 + 0.35 * (o.e1 - o.e2));",
    "          o.e1 *= o.r1; o.e2 *= o.r2;",
    "          if (o.e2 < 3e-4) o.on = 0;",
    "        }",
    "        mech[i] = ms * 0.55;",
    "      }",
    "    }",
    "    this.ph = ph;",
    "    return true;",
    "  }",
    "}",
    "registerProcessor('panigale-v4', PanigaleV4Processor);"
  ].join('\n');

  function workletSource() {
    return WORKLET_SRC
      .replace('__FIRE__', JSON.stringify(FIRE_DEG))
      .replace('__CYLA__', JSON.stringify(CYL_AMP))
      .replace('__CYLD__', JSON.stringify(CYL_DEC));
  }

  var _blobURL = null;
  function moduleURL() {
    if (_blobURL) return _blobURL;
    var Blob_ = global.Blob;
    var URL_ = global.URL || global.webkitURL;
    if (!Blob_ || !URL_ || !URL_.createObjectURL) return null;
    try {
      _blobURL = URL_.createObjectURL(
        new Blob_([workletSource()], { type: 'application/javascript' })
      );
    } catch (e) { _blobURL = null; }
    return _blobURL;
  }

  /* Contexts that already have 'panigale-v4' registered. Re-registering the
     same processor name on one context throws, and a test harness will happily
     reuse a context across create() calls. */
  var _registered = (typeof WeakSet === 'function') ? new WeakSet() : null;

  /* ------------------------------------------------------------------ *
   * Procedural buffers: noise, impulse response, saturation curve
   * ------------------------------------------------------------------ */

  function prng(seed) {
    var s = seed | 0 || 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s = s | 0;
      return s / 2147483648;
    };
  }

  function makeNoiseBuffer(ctx, seconds) {
    var sr = ctx.sampleRate;
    var n = Math.max(1, Math.floor(sr * seconds));
    var buf = ctx.createBuffer(1, n, sr);
    var d = buf.getChannelData(0);
    var r = prng(0x5eed1);
    // Slight pink tilt: pure white sounds like a hiss generator, air doesn't.
    var b0 = 0, b1 = 0, b2 = 0;
    for (var i = 0; i < n; i++) {
      var w = r();
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = clamp((b0 + b1 + b2 + w * 0.1848) * 0.22 + w * 0.55, -1, 1);
    }
    // Taper the seam so the loop point is inaudible.
    var fade = Math.min(512, n >> 2);
    for (var j = 0; j < fade; j++) {
      var g = j / fade;
      d[j] = d[j] * g + d[n - fade + j] * (1 - g);
    }
    return buf;
  }

  function makeIR(ctx, seconds) {
    var sr = ctx.sampleRate;
    var n = Math.max(1, Math.floor(sr * seconds));
    var buf = ctx.createBuffer(2, n, sr);
    var r = prng(0xbeef7);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < n; i++) {
        var t = i / n;
        d[i] = r() * Math.pow(1 - t, 2.7) * 0.55;
      }
      // A couple of early reflections — a garage/tunnel, not a cathedral.
      var refl = ch === 0 ? [0.0071, 0.0134, 0.0219] : [0.0083, 0.0151, 0.0242];
      for (var k = 0; k < refl.length; k++) {
        var idx = Math.floor(refl[k] * sr);
        if (idx < n) d[idx] += (k % 2 ? -1 : 1) * 0.45 / (k + 1);
      }
      d[0] += 0.25;
    }
    return buf;
  }

  function makeShaperCurve(k) {
    var n = 2048;
    var curve = new Float32Array(n);
    var norm = Math.tanh(k);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / norm;
    }
    return curve;
  }

  /* ------------------------------------------------------------------ *
   * Fallback renderer: one full 720° cycle as a seamless loop.
   * Mirrors the worklet pulse maths (see note above WORKLET_SRC).
   * ------------------------------------------------------------------ */

  function renderCycle(ctx, rpm, thr) {
    var sr = ctx.sampleRate;
    var cycleSec = 120 / rpm;                       // 720° at this rpm
    var n = Math.max(64, Math.round(cycleSec * sr));
    var buf = ctx.createBuffer(2, n, sr);
    var ex = buf.getChannelData(0);
    var me = buf.getChannelData(1);
    var r = prng(0x1337 + Math.round(rpm));
    var dt = 1 / sr;

    function stamp(dst, start, decay, slow, attSec, amp, noise, gain) {
      var r1 = Math.exp(-decay * dt);
      var r2 = Math.exp(-decay * slow * dt);
      var e1 = 1, e2 = 1;
      var ai = dt / attSec, att = 0;
      for (var i = 0; i < n; i++) {          // wraps for a seamless loop
        var a = att;
        if (a < 1) { att = a + ai; a = a * a * (3 - 2 * a); } else { a = 1; }
        var p = a * (e1 - 0.28 * e2);
        dst[(start + i) % n] += gain * amp * (p + noise * a * e1 * r() * 0.6);
        e1 *= r1; e2 *= r2;
        if (e2 < 2.5e-4) break;
      }
    }

    var d0 = 620 * Math.pow(rpm / 6000, 0.72) * (1 - 0.30 * thr);
    var at = 0.00030 * (1 - 0.42 * thr);
    var comp = Math.pow(6000 / rpm, 0.12);

    for (var f = 0; f < 4; f++) {
      var start = Math.round(FIRE_DEG[f] / 720 * n);
      var amp = (0.34 + 0.66 * thr) * CYL_AMP[f] * comp * (1 + 0.018 * r());
      stamp(ex, start, Math.max(40, d0 * CYL_DEC[f]), 0.28, at, amp, 0.18 + 0.5 * thr, 1);
      // valve clatter, twice per cylinder per cycle
      var mAmp = (0.5 + 0.4 * Math.abs(r())) * (0.45 + 0.55 * rpm / 14500) * 0.55;
      stamp(me, start, 1900, 0.45, 0.00012, mAmp, 1, 1);
      var v2 = Math.round(((FIRE_DEG[f] + 250) % 720) / 720 * n);
      stamp(me, v2, 1900, 0.45, 0.00012, mAmp * 0.8, 1, 1);
    }

    // DC-block each channel so looping never pumps the downstream chain.
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var mean = 0, i2;
      for (i2 = 0; i2 < n; i2++) mean += d[i2];
      mean /= n;
      for (i2 = 0; i2 < n; i2++) d[i2] -= mean;
    }
    return buf;
  }

  /* Reference rpm points for the fallback ladder. */
  var FB_RPM = [1250, 2200, 3600, 5400, 7600, 10200, 12600, 14500];

  /* ------------------------------------------------------------------ *
   * Engine
   * ------------------------------------------------------------------ */

  function createEngine(opts) {
    opts = opts || {};

    var state = {
      ctx: null,
      ownsCtx: false,
      offline: false,
      running: false,
      disposed: false,
      starting: null,
      mode: 'none',            // 'worklet' | 'buffer'
      vol: clamp(opts.masterVolume == null ? 0.7 : opts.masterVolume, 0, 1),
      rpmNorm: 0,
      thr: 0,
      nodes: [],
      sources: [],
      timers: [],
      fb: null                 // fallback rig
    };

    function keep(n) { state.nodes.push(n); return n; }

    function now(when) {
      var t = (when == null) ? (state.ctx ? state.ctx.currentTime : 0) : when;
      return t;
    }

    /* -- smooth parameter helpers: never a bare .value = x on a live graph -- */
    function tgt(param, value, t, tc) {
      if (!param) return;
      try { param.setTargetAtTime(value, t, tc || 0.05); } catch (e) { /* ignore */ }
    }
    function ramp(param, value, t) {
      if (!param) return;
      try {
        param.setValueAtTime(param.value, t);
        param.linearRampToValueAtTime(value, t + 0.02);
      } catch (e) { /* ignore */ }
    }

    /* ---------------------------------------------------------------- *
     * Graph construction
     * ---------------------------------------------------------------- */

    var g = {};   // node handles

    function buildGraph(ctx) {
      var sr = ctx.sampleRate;

      // ---- master chain (built first, everything hangs off busIn) ----
      g.master = keep(ctx.createGain());
      g.master.gain.value = 0;               // faded up in start()

      g.comp = keep(ctx.createDynamicsCompressor());
      try {
        g.comp.threshold.value = -15;
        g.comp.knee.value = 14;
        g.comp.ratio.value = 4;
        g.comp.attack.value = 0.005;
        g.comp.release.value = 0.18;
      } catch (e) { /* older impls */ }

      g.shaper = keep(ctx.createWaveShaper());
      g.shaper.curve = makeShaperCurve(2.1);
      if ('oversample' in g.shaper) g.shaper.oversample = '2x';

      g.dry = keep(ctx.createGain()); g.dry.gain.value = 0.94;
      g.wet = keep(ctx.createGain()); g.wet.gain.value = 0.16;

      var conv = null;
      if (ctx.createConvolver) {
        try {
          conv = keep(ctx.createConvolver());
          conv.normalize = true;
          conv.buffer = makeIR(ctx, 0.35);
        } catch (e) { conv = null; }
      }
      g.conv = conv;

      g.cut = keep(ctx.createGain()); g.cut.gain.value = 1;   // quickshifter duck
      g.bus = keep(ctx.createGain()); g.bus.gain.value = 1;

      g.bus.connect(g.cut);
      g.cut.connect(g.shaper);
      g.shaper.connect(g.comp);
      g.comp.connect(g.dry);
      g.dry.connect(g.master);
      if (conv) { g.comp.connect(conv); conv.connect(g.wet); g.wet.connect(g.master); }
      g.master.connect(ctx.destination);

      // ---- exhaust chain --------------------------------------------
      g.exIn = keep(ctx.createGain()); g.exIn.gain.value = 1;

      g.exHP = keep(ctx.createBiquadFilter());
      g.exHP.type = 'highpass'; g.exHP.frequency.value = 46; g.exHP.Q.value = 0.6;

      g.res = [];
      var prevNode = g.exHP;
      for (var i = 0; i < RES_HZ.length; i++) {
        var b = keep(ctx.createBiquadFilter());
        b.type = 'peaking';
        b.frequency.value = RES_HZ[i];
        b.Q.value = [1.6, 2.2, 3.0, 3.6][i];
        b.gain.value = 0;
        prevNode.connect(b);
        prevNode = b;
        g.res.push(b);
      }

      g.exLP = keep(ctx.createBiquadFilter());
      g.exLP.type = 'lowpass'; g.exLP.frequency.value = 6000; g.exLP.Q.value = 0.7;
      prevNode.connect(g.exLP);

      g.exGain = keep(ctx.createGain()); g.exGain.gain.value = 0.9;
      g.exLP.connect(g.exGain);

      g.exPan = makePan(ctx, -0.12);
      g.exGain.connect(g.exPan.node);
      g.exPan.out.connect(g.bus);

      // Parallel megaphone resonance — the top-end shriek.
      g.meg = keep(ctx.createBiquadFilter());
      g.meg.type = 'bandpass'; g.meg.frequency.value = 2600; g.meg.Q.value = 5.5;
      g.megGain = keep(ctx.createGain()); g.megGain.gain.value = 0;
      g.exHP.connect(g.meg); g.meg.connect(g.megGain); g.megGain.connect(g.bus);

      g.exIn.connect(g.exHP);

      // ---- mechanical chain -----------------------------------------
      g.mechIn = keep(ctx.createGain()); g.mechIn.gain.value = 1;
      g.mechHP = keep(ctx.createBiquadFilter());
      g.mechHP.type = 'highpass'; g.mechHP.frequency.value = 1300; g.mechHP.Q.value = 0.7;
      g.mechPk = keep(ctx.createBiquadFilter());
      g.mechPk.type = 'peaking'; g.mechPk.frequency.value = 4200;
      g.mechPk.Q.value = 2.0; g.mechPk.gain.value = 5;
      g.mechGain = keep(ctx.createGain()); g.mechGain.gain.value = 0.05;
      g.mechPan = makePan(ctx, 0.3);
      g.mechIn.connect(g.mechHP); g.mechHP.connect(g.mechPk);
      g.mechPk.connect(g.mechGain); g.mechGain.connect(g.mechPan.node);
      g.mechPan.out.connect(g.bus);

      // ---- intake -----------------------------------------------------
      g.noiseBuf = makeNoiseBuffer(ctx, 2.0);

      g.intakeSrc = ctx.createBufferSource();
      g.intakeSrc.buffer = g.noiseBuf; g.intakeSrc.loop = true;
      keep(g.intakeSrc); state.sources.push(g.intakeSrc);

      g.intBP = keep(ctx.createBiquadFilter());
      g.intBP.type = 'bandpass'; g.intBP.frequency.value = 340; g.intBP.Q.value = 1.1;
      g.intGain = keep(ctx.createGain()); g.intGain.gain.value = 0;
      g.intPan = makePan(ctx, 0.16);

      g.honkBP = keep(ctx.createBiquadFilter());
      g.honkBP.type = 'bandpass'; g.honkBP.frequency.value = 230; g.honkBP.Q.value = 8;
      g.honkGain = keep(ctx.createGain()); g.honkGain.gain.value = 0;

      g.intakeSrc.connect(g.intBP); g.intBP.connect(g.intGain);
      g.intGain.connect(g.intPan.node); g.intPan.out.connect(g.bus);
      g.intakeSrc.connect(g.honkBP); g.honkBP.connect(g.honkGain);
      g.honkGain.connect(g.intPan.node);

      // Idle wobble: combustion is never perfectly even at idle.
      try {
        g.lfo = ctx.createOscillator();
        g.lfo.type = 'sine'; g.lfo.frequency.value = 0.9;
        g.lfoGain = keep(ctx.createGain()); g.lfoGain.gain.value = 26;
        g.lfo.connect(g.lfoGain);
        keep(g.lfo); state.sources.push(g.lfo);
      } catch (e) { g.lfo = null; }

      // Frequency shelf that opens up with sample rate headroom.
      g.exLP.frequency.value = Math.min(9000, sr * 0.4);
    }

    function makePan(ctx, p) {
      // StereoPannerNode where available; a plain gain elsewhere.
      if (ctx.createStereoPanner) {
        try {
          var n = ctx.createStereoPanner();
          n.pan.value = p;
          keep(n);
          return { node: n, out: n, pan: n.pan };
        } catch (e) { /* fall through */ }
      }
      var gn = keep(ctx.createGain());
      return { node: gn, out: gn, pan: null };
    }

    /* ---------------------------------------------------------------- *
     * Source stage A: AudioWorklet
     * ---------------------------------------------------------------- */

    function buildWorkletSource(ctx) {
      var node = new global.AudioWorkletNode(ctx, 'panigale-v4', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit'
      });
      keep(node);
      g.worklet = node;

      var split = keep(ctx.createChannelSplitter(2));
      node.connect(split);
      split.connect(g.exIn, 0);
      split.connect(g.mechIn, 1);

      g.pRpm = node.parameters.get('rpm');
      g.pThr = node.parameters.get('throttle');
      g.pDrive = node.parameters.get('drive');
      if (g.lfo && g.pRpm) { try { g.lfoGain.connect(g.pRpm); } catch (e) {} }
      state.mode = 'worklet';
    }

    /* ---------------------------------------------------------------- *
     * Source stage B: pre-rendered one-cycle loops
     * ---------------------------------------------------------------- */

    function buildBufferSource(ctx) {
      var layers = [];
      var thrVals = [0.12, 0.95];
      for (var L = 0; L < thrVals.length; L++) {
        var lg = keep(ctx.createGain());
        lg.gain.value = L === 0 ? 1 : 0;
        var split = keep(ctx.createChannelSplitter(2));
        lg.connect(split);
        split.connect(g.exIn, 0);
        split.connect(g.mechIn, 1);
        var zones = [];
        for (var z = 0; z < FB_RPM.length; z++) {
          var src = ctx.createBufferSource();
          src.buffer = renderCycle(ctx, FB_RPM[z], thrVals[L]);
          src.loop = true;
          src.loopStart = 0;
          src.loopEnd = src.buffer.duration;
          var zg = ctx.createGain();
          zg.gain.value = 0;
          src.connect(zg); zg.connect(lg);
          keep(src); keep(zg); state.sources.push(src);
          // Exact cycle rate the buffer actually loops at (integer length).
          zones.push({ src: src, gain: zg, rpm: FB_RPM[z], hz: 1 / src.buffer.duration });
        }
        layers.push({ gain: lg, zones: zones, thr: thrVals[L] });
      }
      g.fbLayers = layers;
      state.mode = 'buffer';
    }

    /* ---------------------------------------------------------------- *
     * rpm / throttle -> every parameter in the graph
     * ---------------------------------------------------------------- */

    function apply(t) {
      if (!state.ctx) return;
      var n = state.rpmNorm, thr = state.thr;
      var rpm = lerp(RPM_IDLE, RPM_MAX, n);
      var decel = clamp((0.22 - thr) / 0.22, 0, 1) * clamp((rpm - 2600) / 5000, 0, 1);
      var load = thr;

      // --- source stage ---
      if (state.mode === 'worklet') {
        tgt(g.pRpm, rpm, t, 0.035);
        tgt(g.pThr, thr, t, 0.030);
        tgt(g.pDrive, 1 - 0.45 * decel, t, 0.05);
        if (g.lfoGain) tgt(g.lfoGain.gain, 30 * (1 - n) * (1 - thr), t, 0.15);
      } else if (state.mode === 'buffer' && g.fbLayers) {
        applyFallback(rpm, thr, decel, t);
      }

      // --- exhaust EQ: rpm/throttle dependent pipe formants ---
      if (g.res.length === 4) {
        tgt(g.res[0].gain, lerp(9.5, 1.5, n) - 4 * decel, t, 0.08);      // 180 Hz body
        tgt(g.res[1].gain, lerp(4.0, 2.0, n) + 2.5 * load, t, 0.08);     // 420 Hz honk
        tgt(g.res[2].gain, lerp(0.5, 6.5, n) + 3.0 * load + 2 * decel, t, 0.08);
        tgt(g.res[3].gain, lerp(-2.0, 8.0, n) + 3.5 * load + 4 * decel, t, 0.08);
      }
      tgt(g.exLP.frequency,
        clamp(2200 + 9500 * load + rpm * 0.55 + 4200 * decel, 400,
              state.ctx.sampleRate * 0.45), t, 0.06);
      tgt(g.exGain.gain, (0.55 + 0.45 * load) * (1 - 0.35 * decel), t, 0.05);
      tgt(g.megGain.gain, (0.05 + 0.30 * n * n) * (0.35 + 0.65 * load) + 0.10 * decel, t, 0.08);
      tgt(g.meg.frequency, 2300 + 900 * n, t, 0.1);

      // --- intake ---
      tgt(g.intBP.frequency, 260 + rpm * 0.080, t, 0.05);
      tgt(g.intBP.Q, 0.9 + 5.0 * load, t, 0.06);
      tgt(g.intGain.gain, (0.030 + 0.42 * load * load) * (0.30 + 0.70 * n), t, 0.05);
      tgt(g.honkBP.frequency, 190 + 150 * n, t, 0.08);
      tgt(g.honkGain.gain, 0.30 * load * load * (1 - 0.55 * n), t, 0.06);

      // --- mechanical ---
      tgt(g.mechGain.gain, 0.035 + 0.055 * n + 0.03 * decel, t, 0.08);
      tgt(g.mechHP.frequency, 1200 + 900 * n, t, 0.1);
    }

    function applyFallback(rpm, thr, decel, t) {
      var layers = g.fbLayers;
      // throttle crossfade between the closed and open pulse-shape layers
      var lt = clamp((thr - 0.12) / (0.95 - 0.12), 0, 1);
      tgt(layers[0].gain.gain, Math.cos(lt * Math.PI / 2) * (1 - 0.35 * decel), t, 0.05);
      tgt(layers[1].gain.gain, Math.sin(lt * Math.PI / 2), t, 0.05);

      // pick the two nearest rpm references and crossfade
      var idx = 0;
      for (var i = 0; i < FB_RPM.length - 1; i++) {
        if (rpm >= FB_RPM[i]) idx = i;
      }
      var lo = idx, hi = Math.min(idx + 1, FB_RPM.length - 1);
      var f = (hi === lo) ? 0 : clamp((rpm - FB_RPM[lo]) / (FB_RPM[hi] - FB_RPM[lo]), 0, 1);
      var targetHz = rpm / 120;                     // cycles/sec at this rpm

      for (var L = 0; L < layers.length; L++) {
        var zs = layers[L].zones;
        for (var z = 0; z < zs.length; z++) {
          var want = 0;
          if (z === lo) want = Math.cos(f * Math.PI / 2);
          if (z === hi) want = (hi === lo) ? want : Math.sin(f * Math.PI / 2);
          tgt(zs[z].gain.gain, want, t, 0.04);
          if (want > 0.0005) {
            // Retune the loop to the exact firing rate for this rpm.
            tgt(zs[z].src.playbackRate, clamp(targetHz / zs[z].hz, 0.06, 16), t, 0.035);
          }
        }
      }
    }

    /* ---------------------------------------------------------------- *
     * start / stop / dispose
     * ---------------------------------------------------------------- */

    function makeContext() {
      if (opts.context) {
        state.ctx = opts.context;
        state.ownsCtx = false;
      } else {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return false;
        state.ctx = new AC({ latencyHint: 'interactive' });
        state.ownsCtx = true;
      }
      state.offline = !!(state.ctx && (
        (global.OfflineAudioContext && state.ctx instanceof global.OfflineAudioContext) ||
        (global.webkitOfflineAudioContext && state.ctx instanceof global.webkitOfflineAudioContext) ||
        typeof state.ctx.startRendering === 'function' && typeof state.ctx.close !== 'function'
      ));
      if (state.ctx && typeof state.ctx.startRendering === 'function' &&
          typeof state.ctx.baseLatency === 'undefined') {
        state.offline = true;
      }
      return true;
    }

    function loadWorklet(ctx) {
      if (opts.forceFallback) return Promise.reject(new Error('forced fallback'));
      if (!global.AudioWorkletNode || !ctx.audioWorklet ||
          typeof ctx.audioWorklet.addModule !== 'function') {
        return Promise.reject(new Error('no AudioWorklet'));
      }
      if (_registered && _registered.has(ctx)) return Promise.resolve();
      var url = moduleURL();
      if (!url) return Promise.reject(new Error('no Blob URL'));
      return ctx.audioWorklet.addModule(url).then(function () {
        if (_registered) _registered.add(ctx);
      }, function (err) {
        // Already registered on this context from an earlier create() — fine.
        if (err && /already/i.test(String(err.message || err))) {
          if (_registered) _registered.add(ctx);
          return;
        }
        throw err;
      });
    }

    function finishStart() {
      var ctx = state.ctx;
      var t = ctx.currentTime;
      for (var i = 0; i < state.sources.length; i++) {
        try { state.sources[i].start(0); } catch (e) { /* already started */ }
      }
      apply(t);
      // Fade in rather than snapping — a hard gain step is a click.
      try {
        g.master.gain.cancelScheduledValues(t);
        g.master.gain.setValueAtTime(0.0001, t);
        g.master.gain.linearRampToValueAtTime(state.vol, t + 0.18);
      } catch (e) { g.master.gain.value = state.vol; }
      state.running = true;
    }

    function start() {
      if (state.disposed) return Promise.resolve(false);
      if (state.running) return Promise.resolve(true);
      if (state.starting) return state.starting;

      state.starting = new Promise(function (resolve) {
        var ok;
        try { ok = makeContext(); } catch (e) { ok = false; }
        if (!ok || !state.ctx) { state.starting = null; resolve(false); return; }
        var ctx = state.ctx;

        // Resume must happen inside the user gesture turn.
        var resumed;
        try {
          resumed = (!state.offline && ctx.state === 'suspended' && ctx.resume)
            ? ctx.resume() : Promise.resolve();
        } catch (e) { resumed = Promise.resolve(); }
        if (!resumed || typeof resumed.then !== 'function') resumed = Promise.resolve();

        resumed.catch(function () {}).then(function () {
          try { buildGraph(ctx); } catch (e) { state.starting = null; resolve(false); return null; }
          return loadWorklet(ctx).then(function () {
            buildWorkletSource(ctx);
          }, function () {
            buildBufferSource(ctx);
          });
        }).then(function (r) {
          if (r === null) return;
          try { finishStart(); } catch (e) { state.running = false; }
          state.starting = null;
          resolve(state.running);
        }).catch(function () {
          state.starting = null;
          resolve(false);
        });
      });
      return state.starting;
    }

    function stop() {
      if (!state.running || !state.ctx) return;
      var t = state.ctx.currentTime;
      try {
        g.master.gain.cancelScheduledValues(t);
        g.master.gain.setValueAtTime(g.master.gain.value, t);
        g.master.gain.linearRampToValueAtTime(0.0001, t + 0.12);
      } catch (e) { /* ignore */ }
      state.running = false;
      if (!state.offline && state.ctx.suspend) {
        var timer = global.setTimeout(function () {
          try { if (!state.disposed && !state.running) state.ctx.suspend(); } catch (e) {}
        }, 220);
        state.timers.push(timer);
      }
    }

    function teardown() {
      for (var i = 0; i < state.sources.length; i++) {
        try { state.sources[i].stop(0); } catch (e) { /* ignore */ }
        try { state.sources[i].disconnect(); } catch (e) { /* ignore */ }
      }
      if (g.worklet) {
        try { g.worklet.port.postMessage({ type: 'stop' }); } catch (e) {}
        try { g.worklet.port.onmessage = null; } catch (e) {}
      }
      for (var j = 0; j < state.nodes.length; j++) {
        try { state.nodes[j].disconnect(); } catch (e) { /* ignore */ }
      }
      state.nodes.length = 0;
      state.sources.length = 0;
      g = {};
      if (state.ownsCtx && state.ctx && typeof state.ctx.close === 'function') {
        try { state.ctx.close(); } catch (e) { /* ignore */ }
      }
      state.ctx = null;
    }

    function dispose() {
      if (state.disposed) return;
      state.disposed = true;
      state.running = false;
      for (var i = 0; i < state.timers.length; i++) global.clearTimeout(state.timers[i]);
      state.timers.length = 0;
      if (!state.ctx) return;
      if (state.offline) { teardown(); return; }
      // Duck first so teardown can't click, then release everything.
      try {
        var t = state.ctx.currentTime;
        g.master.gain.cancelScheduledValues(t);
        g.master.gain.setValueAtTime(g.master.gain.value, t);
        g.master.gain.linearRampToValueAtTime(0.0001, t + 0.05);
      } catch (e) { /* ignore */ }
      global.setTimeout(teardown, 90);
    }

    /* ---------------------------------------------------------------- *
     * Gestures
     * ---------------------------------------------------------------- */

    function holdAt(param, t) {
      if (!param) return;
      try {
        if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
        else {
          var v = param.value;
          param.cancelScheduledValues(t);
          param.setValueAtTime(v, t);
        }
      } catch (e) { /* ignore */ }
    }

    function blip() {
      if (!state.running || !state.ctx) return;
      var t = state.ctx.currentTime;
      var baseN = state.rpmNorm, baseT = state.thr;
      var peakN = clamp(baseN + 0.30, 0, 0.92);

      if (state.mode === 'worklet') {
        var rpmA = lerp(RPM_IDLE, RPM_MAX, baseN);
        var rpmB = lerp(RPM_IDLE, RPM_MAX, peakN);
        holdAt(g.pRpm, t); holdAt(g.pThr, t);
        try {
          g.pThr.linearRampToValueAtTime(0.95, t + 0.045);
          g.pThr.linearRampToValueAtTime(baseT, t + 0.34);
          g.pRpm.linearRampToValueAtTime(rpmB, t + 0.16);
          g.pRpm.linearRampToValueAtTime(rpmA, t + 0.44);
        } catch (e) { /* ignore */ }
      }
      // Filters/intake follow the blip too, so the timbre opens up, not just level.
      var save = { n: state.rpmNorm, th: state.thr };
      state.rpmNorm = peakN; state.thr = 0.95;
      apply(t + 0.01);
      state.rpmNorm = save.n; state.thr = save.th;
      var timer = global.setTimeout(function () {
        if (!state.disposed && state.running) apply(state.ctx.currentTime);
      }, 340);
      state.timers.push(timer);
    }

    function shift() {
      if (!state.running || !state.ctx) return;
      var t = state.ctx.currentTime;
      var gp = g.cut && g.cut.gain;
      if (gp) {
        try {
          gp.cancelScheduledValues(t);
          gp.setValueAtTime(gp.value, t);
          gp.linearRampToValueAtTime(0.10, t + 0.012);   // ~60 ms ignition cut
          gp.setValueAtTime(0.10, t + 0.055);
          gp.linearRampToValueAtTime(1.25, t + 0.078);   // re-attack bark
          gp.linearRampToValueAtTime(1.0, t + 0.16);
        } catch (e) { /* ignore */ }
      }
      // Unburnt charge in the header on the way back in.
      if (g.worklet) {
        try { g.worklet.port.postMessage({ type: 'cut', dur: 0.16 }); } catch (e) {}
      }
      // Brief revs-drop as the next gear engages.
      if (state.mode === 'worklet' && g.pRpm) {
        var rpmA = lerp(RPM_IDLE, RPM_MAX, state.rpmNorm);
        holdAt(g.pRpm, t);
        try {
          g.pRpm.linearRampToValueAtTime(Math.max(RPM_IDLE, rpmA * 0.84), t + 0.07);
          g.pRpm.linearRampToValueAtTime(rpmA * 0.88, t + 0.22);
        } catch (e) { /* ignore */ }
      }
      var timer = global.setTimeout(function () {
        if (!state.disposed && state.running) apply(state.ctx.currentTime);
      }, 240);
      state.timers.push(timer);
    }

    /* ---------------------------------------------------------------- *
     * Public surface
     * ---------------------------------------------------------------- */

    return {
      start: start,
      stop: stop,
      setRPM: function (norm, when) {
        norm = clamp(Number(norm) || 0, 0, 1);
        state.rpmNorm = norm;
        if (state.running) apply(now(when));
      },
      setThrottle: function (t, when) {
        t = clamp(Number(t) || 0, 0, 1);
        state.thr = t;
        if (state.running) apply(now(when));
      },
      setVolume: function (v, when) {
        state.vol = clamp(Number(v) || 0, 0, 1);
        if (state.running && g.master) tgt(g.master.gain, state.vol, now(when), 0.04);
      },
      blip: blip,
      shift: shift,
      isRunning: function () { return !!state.running; },
      dispose: dispose,

      /* Introspection — handy for demos and for the test harness. */
      getMode: function () { return state.mode; },
      getRPM: function () { return lerp(RPM_IDLE, RPM_MAX, state.rpmNorm); },
      getContext: function () { return state.ctx; }
    };
  }

  global.PanigaleAudio = {
    create: function (opts) { return createEngine(opts); },
    isSupported: function () {
      return !!(global.AudioContext || global.webkitAudioContext);
    },
    /* Exposed for docs/tests; changing these does nothing at runtime. */
    FIRING_ORDER_DEG: FIRE_DEG.slice(),
    RPM_RANGE: [RPM_IDLE, RPM_MAX],
    version: '1.0.0'
  };

})(typeof window !== 'undefined' ? window : this);
