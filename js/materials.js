/* ═══════════════════════════════════════════════════════════════════════════
   materials.js — libreria PBR procedurale
   ---------------------------------------------------------------------------
   Il progetto non spedisce nemmeno un file immagine: ogni mappa (colore,
   normale, rugosità, alpha) viene disegnata su un <canvas> a runtime.

   La regola che governa tutto il file: in natura non esiste una superficie
   uniforme. Un `roughness: 0.3` costante legge come plastica, sempre. Ogni
   materiale qui sotto ha variazione di rugosità su almeno due scale.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var cache = {};
  var disposables = [];

  /* ─────────────────────────── Rumore ───────────────────────────
     Hash intero deterministico: stessa texture a ogni caricamento, e
     soprattutto tileable, perché l'indice del reticolo viene preso modulo
     il periodo. Un rumore non tileable si vede subito come una cucitura
     lungo il fianco di un pneumatico. */

  function hash2i(x, y, seed) {
    var h = x * 374761393 + y * 668265263 + seed * 1274126177;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  function smoothstep(t) { return t * t * (3 - 2 * t); }

  /* Value noise bilineare su reticolo di periodo `period`. */
  function valueNoise(x, y, period, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var x0 = ((xi % period) + period) % period;
    var y0 = ((yi % period) + period) % period;
    var x1 = (x0 + 1) % period;
    var y1 = (y0 + 1) % period;
    var u = smoothstep(xf), v = smoothstep(yf);
    var a = hash2i(x0, y0, seed), b = hash2i(x1, y0, seed);
    var c = hash2i(x0, y1, seed), d = hash2i(x1, y1, seed);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  function fbm(x, y, octaves, period, seed) {
    var sum = 0, amp = 0.5, norm = 0, p = period, f = 1;
    for (var i = 0; i < octaves; i++) {
      sum += valueNoise(x * f, y * f, p, seed + i * 17) * amp;
      norm += amp;
      amp *= 0.5; f *= 2; p *= 2;
    }
    return sum / norm;
  }

  /* ─────────────────────────── Canvas ─────────────────────────── */

  function makeCanvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  /* Riempie un canvas pixel per pixel. `fn(x, y, u, v)` restituisce
     [r, g, b, a] in 0..255. */
  function paint(size, fn) {
    var canvas = makeCanvas(size);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(size, size);
    var d = img.data;
    var i = 0;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var px = fn(x, y, x / size, y / size);
        d[i++] = px[0]; d[i++] = px[1]; d[i++] = px[2];
        d[i++] = px.length > 3 ? px[3] : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /* Converte una mappa di altezza (canale rosso) in normal map, per
     differenze centrali. Un solo helper riusato da carbonio, gomma,
     asfalto e fusione: le normali coerenti sono metà del realismo. */
  function heightToNormal(heightCanvas, strength) {
    var size = heightCanvas.width;
    var src = heightCanvas.getContext('2d').getImageData(0, 0, size, size).data;
    function h(x, y) {
      var xi = ((x % size) + size) % size;
      var yi = ((y % size) + size) % size;
      return src[(yi * size + xi) * 4] / 255;
    }
    return paint(size, function (x, y) {
      var dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      var dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      /* normalize(vec3(-dx, -dy, 1)) mappato in 0..1 */
      var nx = -dx, ny = -dy, nz = 1;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      return [
        Math.round((nx / len * 0.5 + 0.5) * 255),
        Math.round((ny / len * 0.5 + 0.5) * 255),
        Math.round((nz / len * 0.5 + 0.5) * 255)
      ];
    });
  }

  function toTexture(THREE, canvas, opts) {
    opts = opts || {};
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    t.anisotropy = opts.aniso || 8;
    t.needsUpdate = true;
    disposables.push(t);
    return t;
  }

  function cached(key, fn) {
    if (!cache[key]) cache[key] = fn();
    return cache[key];
  }

  function res(quality, hero) {
    if (quality === 'low') return hero ? 256 : 128;
    return hero ? 512 : 256;
  }

  /* ═══════════════════════════ TEXTURE ═══════════════════════════ */

  var textures = {

    /* Twill 2×2 vero: il filo passa sopra due e sotto due, sfalsato di uno
       per riga. Non è una scacchiera — la diagonale è ciò che rende il
       carbonio riconoscibile. */
    carbonWeave: function (THREE, opts) {
      var size = res((opts || {}).quality, true);
      return cached('carbon' + size, function () {
        var tow = Math.max(4, size / 32);
        var height = paint(size, function (x, y) {
          var cx = Math.floor(x / tow), cy = Math.floor(y / tow);
          /* twill 2/2: sopra quando ((cx + cy) mod 4) < 2 */
          var over = ((cx + cy) % 4 + 4) % 4 < 2;
          var fx = (x % tow) / tow, fy = (y % tow) / tow;
          /* bombatura del filo lungo la sua direzione */
          var bulge = over ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
          var fibre = valueNoise(x * 0.9, y * 0.9, size, 7) * 0.12;
          var v = (over ? 0.62 : 0.32) + bulge * 0.3 + fibre;
          var g = Math.round(Math.max(0, Math.min(1, v)) * 255);
          return [g, g, g];
        });
        var normal = heightToNormal(height, 2.6);
        var color = paint(size, function (x, y) {
          var cx = Math.floor(x / tow), cy = Math.floor(y / tow);
          var over = ((cx + cy) % 4 + 4) % 4 < 2;
          var fx = (x % tow) / tow, fy = (y % tow) / tow;
          var spec = over ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
          var base = 14 + spec * 26 + valueNoise(x, y, size, 3) * 8;
          return [base | 0, (base * 1.02) | 0, (base * 1.1) | 0];
        });
        var rough = paint(size, function (x, y) {
          var cx = Math.floor(x / tow), cy = Math.floor(y / tow);
          var over = ((cx + cy) % 4 + 4) % 4 < 2;
          var v = (over ? 0.24 : 0.34) + fbm(x * 0.05, y * 0.05, 3, 32, 11) * 0.16;
          var g = Math.round(v * 255);
          return [g, g, g];
        });
        return {
          normal: toTexture(THREE, normal),
          color: toTexture(THREE, color, { srgb: true }),
          roughness: toTexture(THREE, rough)
        };
      });
    },

    /* Satinatura anisotropa: striature lunghissime in una direzione, quasi
       nulla nell'altra. Vale per l'alluminio spazzolato e per l'anodizzato. */
    brushed: function (THREE, opts) {
      opts = opts || {};
      var size = res(opts.quality, false);
      var key = 'brushed' + size + (opts.fine ? 'f' : '');
      return cached(key, function () {
        var stretch = opts.fine ? 90 : 40;
        var height = paint(size, function (x, y) {
          var v = valueNoise(x * 0.6, y * (0.6 / stretch), size, 21) * 0.7
                + valueNoise(x * 2.4, y * (2.4 / stretch), size * 2, 33) * 0.3;
          var g = Math.round(v * 255);
          return [g, g, g];
        });
        var rough = paint(size, function (x, y) {
          var v = 0.18 + valueNoise(x * 0.6, y * (0.6 / stretch), size, 21) * 0.22
                + fbm(x * 0.03, y * 0.03, 3, 16, 5) * 0.1;
          var g = Math.round(Math.min(1, v) * 255);
          return [g, g, g];
        });
        return {
          normal: toTexture(THREE, heightToNormal(height, 0.9)),
          roughness: toTexture(THREE, rough)
        };
      });
    },

    /* Fusione in conchiglia: grana grossa, micro-porosità, nessuna direzione
       privilegiata. È l'opposto del forgiato ed è ciò che distingue un
       carter motore da un cerchio. */
    castAlloy: function (THREE, opts) {
      var size = res((opts || {}).quality, false);
      return cached('cast' + size, function () {
        var height = paint(size, function (x, y) {
          var grain = fbm(x * 0.12, y * 0.12, 4, 16, 41);
          /* porosità: pochi crateri isolati */
          var pore = valueNoise(x * 0.35, y * 0.35, size, 55);
          var crater = pore > 0.88 ? (pore - 0.88) * 6 : 0;
          var g = Math.round(Math.max(0, Math.min(1, grain * 0.8 - crater)) * 255);
          return [g, g, g];
        });
        var rough = paint(size, function (x, y) {
          var v = 0.42 + fbm(x * 0.12, y * 0.12, 4, 16, 41) * 0.3
                + fbm(x * 0.9, y * 0.9, 2, 64, 9) * 0.08;
          var g = Math.round(Math.min(1, v) * 255);
          return [g, g, g];
        });
        return {
          normal: toTexture(THREE, heightToNormal(height, 1.8)),
          roughness: toTexture(THREE, rough)
        };
      });
    },

    /* Battistrada direzionale + granulosità del fianco. Il disegno è a
       normal map, non a geometria: costa zero triangoli e a distanza di
       camera è indistinguibile. */
    tyreTread: function (THREE, opts) {
      var size = res((opts || {}).quality, true);
      return cached('tyre' + size, function () {
        var height = paint(size, function (x, y, u, v) {
          /* scanalature a V, come su un pneumatico sportivo stradale */
          var ang = (u * 2 - 1);
          var groove = Math.abs(((v * 5 + Math.abs(ang) * 1.8) % 1) - 0.5) * 2;
          var deep = smoothstep(Math.min(1, groove * 3.2));
          /* la spalla è liscia: le scanalature muoiono verso i bordi */
          var shoulder = smoothstep(Math.min(1, (1 - Math.abs(ang)) * 2.2));
          var pebble = fbm(x * 0.5, y * 0.5, 3, 24, 61) * 0.22;
          var g = Math.round(Math.min(1, deep * shoulder * 0.78 + 0.12 + pebble) * 255);
          return [g, g, g];
        });
        var rough = paint(size, function (x, y) {
          var v = 0.82 + fbm(x * 0.4, y * 0.4, 3, 24, 61) * 0.16;
          var g = Math.round(Math.min(1, v) * 255);
          return [g, g, g];
        });
        return {
          normal: toTexture(THREE, heightToNormal(height, 3.2)),
          roughness: toTexture(THREE, rough)
        };
      });
    },

    /* Disco freno: tornitura radiale (sin dell'angolo) più la fascia
       lucidata dalle pastiglie a metà raggio. L'anisotropia radiale su un
       disco è inconfondibile. */
    brakeDisc: function (THREE, opts) {
      var size = res((opts || {}).quality, false);
      return cached('disc' + size, function () {
        var rough = paint(size, function (x, y, u, v) {
          var dx = u - 0.5, dy = v - 0.5;
          var r = Math.sqrt(dx * dx + dy * dy) * 2;
          var a = Math.atan2(dy, dx);
          var turning = Math.sin(a * 220 + r * 40) * 0.5 + 0.5;
          /* fascia frenante: più lucida fra 0.55 e 0.98 del raggio */
          var band = smoothstep(Math.min(1, Math.max(0, (r - 0.5) * 4)))
                   * (1 - smoothstep(Math.min(1, Math.max(0, (r - 0.96) * 12))));
          var base = 0.46 - band * 0.22 + turning * 0.09
                   + fbm(x * 0.2, y * 0.2, 3, 16, 71) * 0.08;
          var g = Math.round(Math.max(0, Math.min(1, base)) * 255);
          return [g, g, g];
        });
        /* Foratura: reticolo polare di gruppi di tre fori, come sui dischi
           Brembo. Esce nel canale alpha, così il disco è geometricamente una
           corona piatta ma bucata davvero. */
        var alpha = paint(size, function (x, y, u, v) {
          var dx = u - 0.5, dy = v - 0.5;
          var r = Math.sqrt(dx * dx + dy * dy) * 2;
          var a = Math.atan2(dy, dx);
          var op = 255;
          if (r > 0.56 && r < 0.94) {
            /* tre anelli di fori sfalsati */
            for (var ring = 0; ring < 3; ring++) {
              var rr = 0.63 + ring * 0.12;
              var count = 24;
              var phase = ring * (Math.PI / count);
              var seg = Math.PI * 2 / count;
              var nearest = Math.round((a - phase) / seg) * seg + phase;
              var hx = Math.cos(nearest) * rr * 0.5, hy = Math.sin(nearest) * rr * 0.5;
              var d = Math.sqrt((dx - hx) * (dx - hx) + (dy - hy) * (dy - hy));
              if (d < 0.011) op = 0;
            }
          }
          return [255, 255, 255, op];
        });
        return {
          roughness: toTexture(THREE, rough, { aniso: 16 }),
          alpha: toTexture(THREE, alpha, { aniso: 16 })
        };
      });
    },

    /* Metallizzato: fiocchi d'alluminio nel fondo + un'ondulazione lentissima
       (buccia d'arancia) nel trasparente. Applicata come clearcoatNormalMap
       è la ragione per cui una vernice sembra vernice. */
    paintFlake: function (THREE, opts) {
      var size = res((opts || {}).quality, true);
      return cached('flake' + size, function () {
        var height = paint(size, function (x, y) {
          var flake = hash2i(x, y, 91) > 0.82 ? hash2i(x, y, 92) : 0.5;
          var orangePeel = fbm(x * 0.02, y * 0.02, 2, 8, 13);
          var g = Math.round(Math.min(1, flake * 0.35 + orangePeel * 0.65) * 255);
          return [g, g, g];
        });
        return { normal: toTexture(THREE, heightToNormal(height, 0.55), { repeat: [6, 6] }) };
      });
    },

    /* Titanio dello scarico: il gradiente di rinvenimento va dal grigio al
       paglierino al violetto man mano che ci si avvicina alla testata. */
    titaniumHeat: function (THREE) {
      return cached('ti', function () {
        var c = makeCanvas(256);
        var ctx = c.getContext('2d');
        var g = ctx.createLinearGradient(0, 0, 256, 0);
        g.addColorStop(0.00, '#8d9298');
        g.addColorStop(0.30, '#a89b7e');
        g.addColorStop(0.52, '#c4a05a');
        g.addColorStop(0.68, '#8f6a72');
        g.addColorStop(0.82, '#5b6392');
        g.addColorStop(1.00, '#3f4a63');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        /* venature sottili nel senso del tubo */
        ctx.globalAlpha = 0.14;
        for (var i = 0; i < 220; i++) {
          ctx.strokeStyle = hash2i(i, 3, 5) > 0.5 ? '#ffffff' : '#000000';
          ctx.beginPath();
          var yy = hash2i(i, 7, 9) * 256;
          ctx.moveTo(0, yy); ctx.lineTo(256, yy + (hash2i(i, 11, 13) - 0.5) * 8);
          ctx.stroke();
        }
        return { color: toTexture(THREE, c, { srgb: true }) };
      });
    },

    /* Cruscotto TFT: griglia di subpixel RGB più un contagiri disegnato.
       Da vicino si vedono i subpixel, ed è esattamente ciò che fa uno
       schermo vero. */
    dashScreen: function (THREE) {
      return cached('dash', function () {
        var W = 512, H = 256;
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#05070a';
        ctx.fillRect(0, 0, W, H);

        /* arco contagiri */
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#1b2028';
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.92, H * 0.68, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
        ctx.strokeStyle = '#e8342a';
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.92, H * 0.68, Math.PI * 1.12, Math.PI * 1.62);
        ctx.stroke();

        /* tacche */
        ctx.strokeStyle = '#5a636d';
        ctx.lineWidth = 2;
        for (var i = 0; i <= 16; i++) {
          var a = Math.PI * 1.12 + (Math.PI * 0.76) * (i / 16);
          var cx = W * 0.5, cy = H * 0.92, r0 = H * 0.52, r1 = H * 0.60;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          ctx.stroke();
        }

        ctx.fillStyle = '#f2f5f8';
        ctx.textAlign = 'center';
        ctx.font = 'bold 74px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText('3', W * 0.5, H * 0.86);
        ctx.font = '17px ui-monospace, monospace';
        ctx.fillStyle = '#79838d';
        ctx.fillText('RACE', W * 0.5, H * 0.30);

        /* griglia subpixel */
        var img = ctx.getImageData(0, 0, W, H);
        var d = img.data;
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            var idx = (y * W + x) * 4;
            var sub = x % 3;
            var scan = (y % 3 === 2) ? 0.74 : 1.0;
            d[idx] = d[idx] * (sub === 0 ? 1 : 0.55) * scan;
            d[idx + 1] = d[idx + 1] * (sub === 1 ? 1 : 0.55) * scan;
            d[idx + 2] = d[idx + 2] * (sub === 2 ? 1 : 0.55) * scan;
          }
        }
        ctx.putImageData(img, 0, 0);
        return { color: toTexture(THREE, c, { srgb: true, aniso: 16 }) };
      });
    }
  };

  /* ═══════════════════════════ MATERIALI ═══════════════════════════ */

  function push(mat) { disposables.push(mat); return mat; }

  var make = {

    /* Vernice metallizzata con trasparente. Il fondo è metallico e ruvido,
       il trasparente è quasi speculare: sono due strati distinti e devono
       restare tali, altrimenti si ottiene la plastica lucida dei render
       generici. */
    paint: function (THREE, opts) {
      opts = opts || {};
      var flake = textures.paintFlake(THREE, opts);
      var m = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(opts.color === undefined ? 0xda291c : opts.color),
        metalness: opts.metalness === undefined ? 0.55 : opts.metalness,
        roughness: opts.roughness === undefined ? 0.36 : opts.roughness,
        clearcoat: 1.0,
        clearcoatRoughness: 0.035,
        clearcoatNormalMap: flake.normal,
        clearcoatNormalScale: new THREE.Vector2(0.14, 0.14),
        envMapIntensity: opts.envMapIntensity === undefined ? 1.35 : opts.envMapIntensity
      });
      m.name = 'paint';
      return push(m);
    },

    matte: function (THREE, opts) {
      opts = opts || {};
      var m = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(opts.color === undefined ? 0x15181b : opts.color),
        metalness: 0.35,
        roughness: 0.62,
        clearcoat: 0.35,
        clearcoatRoughness: 0.5,
        envMapIntensity: 0.9
      });
      m.name = 'paint-matte';
      return push(m);
    },

    carbon: function (THREE, opts) {
      var t = textures.carbonWeave(THREE, opts);
      var m = new THREE.MeshPhysicalMaterial({
        map: t.color,
        normalMap: t.normal,
        roughnessMap: t.roughness,
        normalScale: new THREE.Vector2(0.7, 0.7),
        color: 0xffffff,
        metalness: 0.28,
        roughness: 1.0,
        clearcoat: 0.9,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.1
      });
      m.name = 'carbon';
      return push(m);
    },

    /* La gomma è il materiale che più spesso tradisce un render: nera,
       opaca, ma con un velo di riflesso radente. `sheen` esiste apposta. */
    rubber: function (THREE, opts) {
      var t = textures.tyreTread(THREE, opts);
      var m = new THREE.MeshPhysicalMaterial({
        color: 0x0b0c0d,
        normalMap: t.normal,
        roughnessMap: t.roughness,
        normalScale: new THREE.Vector2(1.0, 1.0),
        metalness: 0.0,
        roughness: 1.0,
        sheen: 0.4,
        sheenRoughness: 0.9,
        sheenColor: new THREE.Color(0x4a4642),
        envMapIntensity: 0.42
      });
      m.name = 'rubber';
      return push(m);
    },

    alloyCast: function (THREE, opts) {
      opts = opts || {};
      var t = textures.castAlloy(THREE, opts);
      var m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(opts.color === undefined ? 0x5c6167 : opts.color),
        normalMap: t.normal,
        roughnessMap: t.roughness,
        /* La grana di fusione deve leggersi come grana, non come roccia:
           oltre ~0.3 il carter sembra scolpito nella pietra pomice. */
        normalScale: new THREE.Vector2(0.28, 0.28),
        metalness: 0.92,
        roughness: 1.0,
        envMapIntensity: opts.envMapIntensity === undefined ? 1.0 : opts.envMapIntensity
      });
      m.name = 'alloy-cast';
      return push(m);
    },

    alloyForged: function (THREE, opts) {
      opts = opts || {};
      var t = textures.brushed(THREE, opts);
      var m = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(opts.color === undefined ? 0x24282c : opts.color),
        normalMap: t.normal,
        roughnessMap: t.roughness,
        normalScale: new THREE.Vector2(0.35, 0.35),
        metalness: 0.95,
        roughness: 1.0,
        anisotropy: 0.6,
        envMapIntensity: 1.25
      });
      m.name = 'alloy-forged';
      return push(m);
    },

    chrome: function (THREE, opts) {
      opts = opts || {};
      var m = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(opts.color === undefined ? 0xdfe4e8 : opts.color),
        metalness: 1.0,
        roughness: opts.roughness === undefined ? 0.07 : opts.roughness,
        envMapIntensity: 1.6
      });
      m.name = 'chrome';
      return push(m);
    },

    titanium: function (THREE, opts) {
      var t = textures.titaniumHeat(THREE);
      var b = textures.brushed(THREE, { quality: (opts || {}).quality, fine: true });
      var m = new THREE.MeshPhysicalMaterial({
        map: t.color,
        normalMap: b.normal,
        roughnessMap: b.roughness,
        normalScale: new THREE.Vector2(0.25, 0.25),
        color: 0xffffff,
        metalness: 0.98,
        roughness: 1.0,
        anisotropy: 0.5,
        envMapIntensity: 1.4
      });
      m.name = 'titanium';
      return push(m);
    },

    /* Öhlins: oro anodizzato, satinato fine, mai cromato. */
    goldAnodised: function (THREE, opts) {
      var b = textures.brushed(THREE, { quality: (opts || {}).quality, fine: true });
      var m = new THREE.MeshPhysicalMaterial({
        color: 0xc9922a,
        normalMap: b.normal,
        roughnessMap: b.roughness,
        normalScale: new THREE.Vector2(0.2, 0.2),
        metalness: 0.96,
        roughness: 1.0,
        anisotropy: 0.4,
        envMapIntensity: 1.3
      });
      m.name = 'gold-anodised';
      return push(m);
    },

    brakeDisc: function (THREE, opts) {
      var t = textures.brakeDisc(THREE, opts);
      var m = new THREE.MeshPhysicalMaterial({
        color: 0x9aa1a8,
        roughnessMap: t.roughness,
        alphaMap: t.alpha,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        metalness: 1.0,
        roughness: 1.0,
        anisotropy: 0.85,
        anisotropyRotation: 0,
        envMapIntensity: 1.2
      });
      m.name = 'brake-disc';
      return push(m);
    },

    plasticSatin: function (THREE, opts) {
      opts = opts || {};
      var m = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(opts.color === undefined ? 0x121417 : opts.color),
        metalness: 0.0,
        roughness: opts.roughness === undefined ? 0.55 : opts.roughness,
        clearcoat: 0.4,
        clearcoatRoughness: 0.4,
        envMapIntensity: 0.85
      });
      m.name = 'plastic';
      return push(m);
    },

    /* Cupolino: policarbonato fumé. `transmission` costa, ma su un solo
       pezzo vale la pena — un plexi opaco si nota subito. */
    glassTint: function (THREE, opts) {
      opts = opts || {};
      var m = new THREE.MeshPhysicalMaterial({
        color: 0x0e1114,
        metalness: 0.0,
        roughness: 0.06,
        transmission: 0.72,
        thickness: 0.004,
        ior: 1.52,
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
        envMapIntensity: 1.6
      });
      m.name = 'glass-tint';
      return push(m);
    },

    lensClear: function (THREE) {
      var m = new THREE.MeshPhysicalMaterial({
        color: 0xd8e2ec,
        metalness: 0.0,
        roughness: 0.04,
        transmission: 0.86,
        thickness: 0.01,
        ior: 1.49,
        transparent: true,
        opacity: 0.7,
        envMapIntensity: 1.8
      });
      m.name = 'lens';
      return push(m);
    },

    emissiveLED: function (THREE, opts) {
      opts = opts || {};
      var col = new THREE.Color(opts.color === undefined ? 0xdfe9ff : opts.color);
      var m = new THREE.MeshStandardMaterial({
        color: 0x0a0c0e,
        emissive: col,
        emissiveIntensity: opts.intensity === undefined ? 1.4 : opts.intensity,
        metalness: 0.0,
        roughness: 0.35,
        toneMapped: false
      });
      m.name = 'led';
      return push(m);
    },

    dash: function (THREE) {
      var t = textures.dashScreen(THREE);
      var m = new THREE.MeshStandardMaterial({
        map: t.color,
        emissiveMap: t.color,
        emissive: 0xffffff,
        emissiveIntensity: 1.1,
        color: 0x000000,
        metalness: 0.0,
        roughness: 0.16,
        toneMapped: false
      });
      m.name = 'dash';
      return push(m);
    },

    seat: function (THREE) {
      var m = new THREE.MeshPhysicalMaterial({
        color: 0x0c0d0f,
        metalness: 0.0,
        roughness: 0.78,
        sheen: 0.25,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color(0x2a2724),
        envMapIntensity: 0.6
      });
      m.name = 'seat';
      return push(m);
    }
  };

  function dispose() {
    for (var i = 0; i < disposables.length; i++) {
      var d = disposables[i];
      if (d && typeof d.dispose === 'function') d.dispose();
    }
    disposables.length = 0;
    cache = {};
  }

  global.PanigaleMaterials = {
    textures: textures,
    make: make,
    helpers: { paint: paint, heightToNormal: heightToNormal, fbm: fbm, valueNoise: valueNoise, toTexture: toTexture },
    dispose: dispose
  };

})(typeof window !== 'undefined' ? window : this);
