/* ═══════════════════════════════════════════════════════════════════════════
   bike-model.js — Ducati Panigale V4 S, geometria procedurale
   ---------------------------------------------------------------------------
   Nessun file .glb, nessun modello scaricato: ogni superficie è generata qui.

   CONTRATTO DEL MONDO (condiviso con scene.js ed effects.js)
     1 unità = 1 metro
     +X avanti · +Y alto · +Z lato SINISTRO della moto
     piano terra a y = 0 · origine a metà interasse, a terra

   MISURE REALI usate come vincolo (Panigale V4 S, 2022–2024)
     interasse            1469 mm  → assi a x = ±0.7345
     pneumatico ant.      120/70 ZR17 → Ø 600 mm → r 0.300, sezione 0.120
     pneumatico post.     200/55 ZR17 → Ø 652 mm → r 0.326, sezione 0.200
     cerchi               17"        → r cerchio 0.2159
     inclinazione cannotto 24,5°     avancorsa 100 mm
     altezza sella        835 mm     altezza totale ≈ 1130 mm
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ─────────────────────────── Costanti dimensionali ─────────────────────────── */
  var WHEELBASE_HALF = 0.7345;
  var R_FRONT = 0.300, W_FRONT = 0.120;
  var R_REAR = 0.326, W_REAR = 0.200;
  var R_RIM = 0.2159;
  var RAKE = 24.5 * Math.PI / 180;
  var TRAIL = 0.100;
  /* Il cannotto di sterzo interseca il suolo davanti all'impronta: è la
     definizione stessa di avancorsa. */
  var STEER_GROUND_X = WHEELBASE_HALF + TRAIL;

  /* ─────────────────────────── Utility geometriche ─────────────────────────── */

  var THREE = null;   // iniettato in build()
  var MAT = null;     // window.PanigaleMaterials
  var registry = [];  // tutto ciò che va liberato in dispose()

  function track(x) { registry.push(x); return x; }

  function mesh(geo, mat, name) {
    track(geo);
    var m = new THREE.Mesh(geo, mat);
    m.name = name || '';
    return m;
  }

  /* Sposta ogni vertice con una funzione. È la leva che trasforma primitive
     banali in pannelli con carattere: si parte da un box e lo si scolpisce. */
  function sculpt(geo, fn) {
    var pos = geo.attributes.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      fn(v, i);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /* Barra rastremata fra due punti del piano XY, spessa `depth` lungo Z.
     Serve per razze, forcellone, staffe: qualsiasi elemento strutturale. */
  function bar(p0, p1, w0, w1, depth, mat, name) {
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) len = 1e-6;   // due punti coincidenti produrrebbero NaN
    var g = new THREE.BoxGeometry(len, 1, depth, 4, 1, 1);
    sculpt(g, function (v) {
      var t = v.x / len + 0.5;
      v.y *= (w0 + (w1 - w0) * t);
      /* smusso agli estremi: niente spigoli vivi su un pezzo fuso */
      var edge = Math.min(t, 1 - t) * 6;
      if (edge < 1) v.z *= 0.6 + 0.4 * edge;
    });
    var m = mesh(g, mat, name);
    m.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0);
    m.rotation.z = Math.atan2(dy, dx);
    return m;
  }

  /* Profilo a superellisse. `n` governa il carattere della sezione:
     n = 2 → ellisse morbida, n = 1.4 → sezione a diamante, tagliente.
     È il parametro che fa la differenza fra una carena Ducati e un tubo. */
  function superProfile(cy, halfH, halfW, n, segs, yFloor) {
    var pts = [];
    var e = 2 / n;
    for (var i = 0; i < segs; i++) {
      var t = (i / segs) * Math.PI * 2;
      var ct = Math.cos(t), st = Math.sin(t);
      var z = halfW * (ct < 0 ? -1 : 1) * Math.pow(Math.abs(ct), e);
      var y = cy + halfH * (st < 0 ? -1 : 1) * Math.pow(Math.abs(st), e);
      if (yFloor !== undefined && y < yFloor) y = yFloor;
      pts.push([y, z]);
    }
    return pts;
  }

  /* Profilo a guscio: la superellisse percorsa non per intero ma da un bordo
     inferiore, sopra la cima, fino al bordo opposto. È la differenza fra una
     carenatura (aperta sotto, il motore si vede) e un bozzolo chiuso.
     `open` = frazione di giro percorsa, 1 = ellisse intera. */
  function shellProfile(cy, halfH, halfW, n, segs, open) {
    var pts = [];
    var e = 2 / n;
    var tm = Math.PI * open;
    for (var i = 0; i <= segs; i++) {
      var t = -tm + (2 * tm) * (i / segs);
      var st = Math.sin(t), ct = Math.cos(t);
      var z = halfW * (st < 0 ? -1 : 1) * Math.pow(Math.abs(st), e);
      var y = cy + halfH * (ct < 0 ? -1 : 1) * Math.pow(Math.abs(ct), e);
      pts.push([y, z]);
    }
    return pts;
  }

  /* Loft: cuce una sequenza di sezioni trasversali in una superficie.
     `closedRing` false lascia il guscio aperto lungo la circonferenza — è
     quello che serve per carena, cupolino, puntale. */
  function loft(sections, capFront, capBack, closedRing) {
    if (closedRing === undefined) closedRing = true;
    var nS = sections.length;
    var nP = sections[0].pts.length;
    var verts = [], uvs = [], idx = [];
    var last = closedRing ? nP : nP - 1;

    for (var s = 0; s < nS; s++) {
      var sec = sections[s];
      for (var p = 0; p < nP; p++) {
        verts.push(sec.x, sec.pts[p][0], sec.pts[p][1]);
        uvs.push(p / nP, s / (nS - 1));
      }
    }
    for (var s2 = 0; s2 < nS - 1; s2++) {
      for (var p2 = 0; p2 < last; p2++) {
        var a = s2 * nP + p2;
        var b = s2 * nP + (p2 + 1) % nP;
        var c = (s2 + 1) * nP + p2;
        var d = (s2 + 1) * nP + (p2 + 1) % nP;
        idx.push(a, c, b, b, c, d);
      }
    }
    /* Tappi: un ventaglio verso il baricentro della sezione. */
    function cap(sIdx, flip) {
      var base = verts.length / 3;
      var cy = 0, cz = 0;
      for (var p = 0; p < nP; p++) { cy += sections[sIdx].pts[p][0]; cz += sections[sIdx].pts[p][1]; }
      verts.push(sections[sIdx].x, cy / nP, cz / nP);
      uvs.push(0.5, 0.5);
      for (var q = 0; q < nP; q++) {
        var i0 = sIdx * nP + q;
        var i1 = sIdx * nP + (q + 1) % nP;
        if (flip) idx.push(base, i1, i0); else idx.push(base, i0, i1);
      }
    }
    if (capFront) cap(nS - 1, false);
    if (capBack) cap(0, true);

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return track(g);
  }

  function tubeFrom(points, radius, tubular, radial, closed) {
    var v = [];
    for (var i = 0; i < points.length; i++) {
      v.push(new THREE.Vector3(points[i][0], points[i][1], points[i][2] || 0));
    }
    var curve = new THREE.CatmullRomCurve3(v, !!closed, 'catmullrom', 0.4);
    return track(new THREE.TubeGeometry(curve, tubular, radius, radial, !!closed));
  }

  function cyl(rTop, rBot, h, seg, open) {
    return track(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!open));
  }

  /* Cilindro con asse lungo Z (l'asse delle ruote e di ogni perno). */
  function cylZ(rTop, rBot, h, seg, open) {
    var g = cyl(rTop, rBot, h, seg, open);
    g.rotateX(Math.PI / 2);
    return g;
  }

  function box(w, h, d, sx, sy, sz) {
    return track(new THREE.BoxGeometry(w, h, d, sx || 1, sy || 1, sz || 1));
  }

  /* ═══════════════════════════ RUOTE ═══════════════════════════ */

  /* Sezione di uno pneumatico sportivo: corona molto arrotondata (serve a
     piegare), fianco che sporge oltre il battistrada, tallone sul cerchio. */
  function tyreGeometry(R, width, seg) {
    var hw = width / 2;
    var pts = [];
    var steps = 18;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;                 // 0 → lato -Z, 1 → lato +Z
      var y = -hw + width * t;
      var k = (y / hw);                  // -1 .. 1
      var ak = Math.abs(k);
      var r;
      if (ak < 0.72) {
        /* corona: caduta quadratica, ~10% di raggio al bordo della corona */
        r = R - (R * 0.115) * Math.pow(ak / 0.72, 2);
      } else {
        /* fianco: rientra verso il cerchio con una pancia */
        var s = (ak - 0.72) / 0.28;
        r = R * 0.885 - (R * 0.885 - R_RIM * 1.03) * Math.pow(s, 1.35);
        y = (k < 0 ? -1 : 1) * hw * (0.72 + 0.28 * Math.pow(s, 0.55));
      }
      pts.push(new THREE.Vector2(r, y));
    }
    var g = track(new THREE.LatheGeometry(pts, seg));
    g.rotateX(Math.PI / 2);   // asse Y → asse Z
    return g;
  }

  function rimGeometry(seg) {
    var pts = [];
    /* canale del cerchio: tallone, gola, tallone. Sono i due labbri a dare
       la lettura di "cerchio" anche quando è quasi tutto coperto. */
    var prof = [
      [R_RIM * 0.62, -0.055], [R_RIM * 0.98, -0.055], [R_RIM, -0.048],
      [R_RIM * 0.955, -0.036], [R_RIM * 0.94, 0], [R_RIM * 0.955, 0.036],
      [R_RIM, 0.048], [R_RIM * 0.98, 0.055], [R_RIM * 0.62, 0.055]
    ];
    for (var i = 0; i < prof.length; i++) pts.push(new THREE.Vector2(prof[i][0], prof[i][1]));
    var g = track(new THREE.LatheGeometry(pts, seg));
    g.rotateX(Math.PI / 2);
    return g;
  }

  /* Cerchio forgiato a tre razze a Y: la firma visiva della V4 S. */
  function buildWheel(R, width, mats, isRear, quality) {
    var seg = quality === 'low' ? 28 : 56;
    var g = new THREE.Group();
    g.name = isRear ? 'wheel_rear' : 'wheel_front';

    g.add(mesh(tyreGeometry(R, width, seg), mats.rubber, 'tyre'));

    var rim = mesh(rimGeometry(seg), mats.forged, 'rim');
    rim.scale.z = width / 0.120;   // il canale segue la larghezza del cerchio
    g.add(rim);

    var hubR = 0.052;
    var spokeDepth = Math.min(0.042, width * 0.32);
    for (var i = 0; i < 3; i++) {
      var a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      var stemEnd = 0.135;
      var p0 = [Math.cos(a) * hubR * 0.8, Math.sin(a) * hubR * 0.8];
      var p1 = [Math.cos(a) * stemEnd, Math.sin(a) * stemEnd];
      g.add(bar(p0, p1, 0.072, 0.040, spokeDepth, mats.forged, 'spoke'));
      /* i due bracci della Y */
      for (var s = -1; s <= 1; s += 2) {
        var a2 = a + s * 0.42;
        var p2 = [Math.cos(a2) * (R_RIM * 0.96), Math.sin(a2) * (R_RIM * 0.96)];
        g.add(bar(p1, p2, 0.036, 0.026, spokeDepth * 0.86, mats.forged, 'spoke_arm'));
      }
    }

    var hub = mesh(cylZ(hubR, hubR, width * 0.55, 24), mats.forged, 'hub');
    g.add(hub);
    var bearing = mesh(cylZ(0.026, 0.026, width * 0.72, 18), mats.chrome, 'bearing');
    g.add(bearing);

    return g;
  }

  /* Disco freno: corona forata (alphaMap) + fascia esterna, più la campana
     interna a razze. */
  function buildDisc(outerR, innerR, z, mats, name) {
    var g = new THREE.Group();
    g.name = name;

    var ring = track(new THREE.RingGeometry(innerR, outerR, 72, 2));
    ring.rotateY(0);   // già nel piano XY, normale lungo Z: corretto
    var face = mesh(ring, mats.disc, 'disc_face');
    g.add(face);

    /* bordo: dà spessore alla corona vista di taglio */
    var edge = mesh(cylZ(outerR, outerR, 0.0055, 64, true), mats.disc, 'disc_edge');
    g.add(edge);

    /* campana: sei bottoni flottanti + mozzo */
    var bell = mesh(cylZ(innerR * 0.55, innerR * 0.55, 0.008, 28), mats.forgedDark, 'disc_bell');
    g.add(bell);
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2;
      var arm = bar(
        [Math.cos(a) * innerR * 0.5, Math.sin(a) * innerR * 0.5],
        [Math.cos(a) * innerR * 1.02, Math.sin(a) * innerR * 1.02],
        0.030, 0.020, 0.007, mats.forgedDark, 'disc_arm');
      g.add(arm);
    }
    g.position.z = z;
    return g;
  }

  /* Pinza monoblocco a quattro pistoncini. */
  function buildCaliper(radius, angle, z, mats, scale) {
    scale = scale || 1;
    var g = new THREE.Group();
    g.name = 'caliper';
    var body = box(0.115 * scale, 0.088 * scale, 0.040 * scale, 3, 3, 2);
    sculpt(body, function (v) {
      /* incavo per il disco e arrotondamento delle estremità */
      var t = Math.abs(v.x) / (0.0575 * scale);
      v.y *= 1 - t * t * 0.32;
      v.z *= 1 - t * t * 0.18;
    });
    g.add(mesh(body, mats.caliper, 'caliper_body'));
    for (var i = -1; i <= 1; i += 2) {
      var boltG = cylZ(0.010 * scale, 0.010 * scale, 0.052 * scale, 12);
      var bolt = mesh(boltG, mats.chrome, 'caliper_bolt');
      bolt.position.set(i * 0.040 * scale, -0.030 * scale, 0);
      g.add(bolt);
    }
    g.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
    g.rotation.z = angle - Math.PI / 2;
    return g;
  }

  /* ═══════════════════════════ AVANTRENO ═══════════════════════════ */

  function buildFrontEnd(mats, parts, quality) {
    /* Gruppo sterzo: posizionato dove l'asse di sterzo tocca terra, così una
       rotazione su Y è esattamente uno sterzata. */
    var steering = new THREE.Group();
    steering.name = 'steering';
    steering.position.set(STEER_GROUND_X, 0, 0);

    /* Sottogruppo inclinato: al suo interno +Y è l'asse di sterzo. */
    var rake = new THREE.Group();
    rake.name = 'rake';
    rake.rotation.z = RAKE;
    steering.add(rake);

    /* Posizione dell'asse ruota nel frame inclinato (offset piastre 33 mm). */
    var cosR = Math.cos(RAKE), sinR = Math.sin(RAKE);
    var relX = WHEELBASE_HALF - STEER_GROUND_X;   // −0.100
    var axleLX = relX * cosR + R_FRONT * sinR;
    var axleLY = -relX * sinR + R_FRONT * cosR;

    var TUBE_Z = 0.105;          // interasse steli 210 mm
    var R_TUBE = 0.0215;         // steli Öhlins NIX30 da 43 mm

    /* Steli superiori dorati: su una forcella rovesciata il tubo grosso sta
       SOPRA e i foderi scorrono sotto. Invertirli è l'errore classico. */
    var upper = new THREE.Group();
    upper.name = 'fork_upper';
    for (var s = -1; s <= 1; s += 2) {
      var t = mesh(cyl(R_TUBE, R_TUBE, 0.46, 20), mats.gold, 'fork_tube');
      t.position.set(axleLX, 0.72, s * TUBE_Z);
      upper.add(t);
      var capNut = mesh(cyl(R_TUBE * 1.12, R_TUBE * 1.12, 0.024, 20), mats.gold, 'fork_cap');
      capNut.position.set(axleLX, 0.955, s * TUBE_Z);
      upper.add(capNut);
      var adj = mesh(cyl(0.007, 0.007, 0.010, 10), mats.chrome, 'fork_adjuster');
      adj.position.set(axleLX, 0.968, s * TUBE_Z);
      upper.add(adj);
    }
    rake.add(upper);

    /* Piastre di sterzo + cannotto. */
    var yokeLow = box(0.088, 0.030, 0.30, 2, 1, 4);
    sculpt(yokeLow, function (v) {
      var t = Math.abs(v.z) / 0.15;
      v.x *= 1 - t * t * 0.25;
      v.y *= 1 - t * t * 0.30;
    });
    var yl = mesh(yokeLow, mats.forgedDark, 'yoke_lower');
    yl.position.set(axleLX * 0.55, 0.615, 0);
    rake.add(yl);

    var yokeTop = box(0.078, 0.024, 0.27, 2, 1, 4);
    sculpt(yokeTop, function (v) {
      var t = Math.abs(v.z) / 0.135;
      v.x *= 1 - t * t * 0.22;
    });
    var yt = mesh(yokeTop, mats.forgedDark, 'yoke_upper');
    yt.position.set(axleLX * 0.55, 0.845, 0);
    rake.add(yt);

    var stem = mesh(cyl(0.019, 0.019, 0.26, 16), mats.chrome, 'steering_stem');
    stem.position.set(0, 0.73, 0);
    rake.add(stem);

    /* Semimanubri: sotto la piastra superiore, inclinati verso il basso —
       è ciò che rende la posizione di guida riconoscibile. */
    for (var h = -1; h <= 1; h += 2) {
      var clip = new THREE.Group();
      clip.name = 'clip_on';
      var tube = mesh(cyl(0.0115, 0.0115, 0.17, 12), mats.forgedDark, 'bar');
      tube.rotation.x = Math.PI / 2;
      tube.rotation.z = 0.16;
      clip.add(tube);
      var grip = mesh(cyl(0.0165, 0.0155, 0.115, 14), mats.grip, 'grip');
      grip.rotation.x = Math.PI / 2;
      grip.rotation.z = 0.16;
      grip.position.set(0.004, -0.006, 0.052);
      clip.add(grip);
      /* leva */
      var lever = box(0.10, 0.010, 0.014, 3, 1, 1);
      sculpt(lever, function (v) { v.y += Math.sin((v.x / 0.05) * 0.9) * 0.012; });
      var lv = mesh(lever, mats.chrome, 'lever');
      lv.position.set(0.055, -0.012, 0.055);
      lv.rotation.y = -0.22;
      clip.add(lv);
      /* pompa */
      var mc = mesh(box(0.045, 0.045, 0.035), mats.forgedDark, 'master_cyl');
      mc.position.set(0.01, 0.012, 0.045);
      clip.add(mc);

      clip.position.set(axleLX + 0.035, 0.815, h * (TUBE_Z + 0.055));
      clip.rotation.y = h > 0 ? 0 : Math.PI;
      clip.scale.z = 1;
      rake.add(clip);
    }

    /* Foderi + ruota: questo gruppo scorre lungo l'asse per l'affondamento. */
    var slider = new THREE.Group();
    slider.name = 'fork_slider';
    rake.add(slider);

    for (var s2 = -1; s2 <= 1; s2 += 2) {
      var legG = cyl(R_TUBE * 1.24, R_TUBE * 1.30, 0.36, 20);
      var leg = mesh(legG, mats.forkLeg, 'fork_leg');
      leg.position.set(axleLX, 0.40, s2 * TUBE_Z);
      slider.add(leg);
      /* piedino porta-asse */
      var foot = box(0.062, 0.10, 0.052, 2, 2, 2);
      sculpt(foot, function (v) { v.x *= 1 - Math.abs(v.y) / 0.05 * 0.22; });
      var ft = mesh(foot, mats.forkLeg, 'fork_foot');
      ft.position.set(axleLX, axleLY + 0.012, s2 * TUBE_Z);
      slider.add(ft);
    }

    /* La ruota va contro-ruotata: dentro `rake` tutto è inclinato di 24,5°. */
    var wheelHolder = new THREE.Group();
    wheelHolder.name = 'front_wheel_holder';
    wheelHolder.position.set(axleLX, axleLY, 0);
    wheelHolder.rotation.z = -RAKE;
    slider.add(wheelHolder);

    var frontSpin = new THREE.Group();
    frontSpin.name = 'front_wheel_spin';
    wheelHolder.add(frontSpin);
    frontSpin.add(buildWheel(R_FRONT, W_FRONT, mats, false, quality));

    /* Doppio disco da 330 mm + pinze Stylema. */
    var discs = [];
    for (var d = -1; d <= 1; d += 2) {
      var disc = buildDisc(0.165, 0.108, d * 0.082, mats, 'front_disc');
      frontSpin.add(disc);
      discs.push(disc);
      /* la pinza non gira con la ruota */
      wheelHolder.add(buildCaliper(0.150, Math.PI * 0.72, d * 0.098, mats, 1.0));
    }

    var axle = mesh(cylZ(0.0125, 0.0125, 0.235, 16), mats.chrome, 'front_axle');
    wheelHolder.add(axle);

    /* Parafango: solidale ai foderi, quindi si muove con la sospensione. */
    var fenderHolder = new THREE.Group();
    fenderHolder.position.set(axleLX, axleLY, 0);
    fenderHolder.rotation.z = -RAKE;
    slider.add(fenderHolder);

    var fenderSecs = [];
    for (var i = 0; i <= 14; i++) {
      /* dall'alto-davanti all'alto-dietro, scavalcando la ruota */
      var a = 0.28 + (i / 14) * 2.10;
      var rx = Math.cos(a) * 0.332, ry = Math.sin(a) * 0.332;
      var wdt = 0.082 * (1 - Math.pow(Math.abs(i / 14 - 0.5) * 1.8, 2) * 0.40);
      fenderSecs.push({ x: rx, pts: superProfile(ry, 0.011, wdt, 2.4, 12) });
    }
    /* il loft lavora lungo X: qui le sezioni seguono un arco, quindi si
       costruisce a mano invece di usare loft() */
    var fenderGeo = arcShell(fenderSecs);
    var fender = mesh(fenderGeo, mats.carbon, 'front_fender');
    fenderHolder.add(fender);

    parts.steering = steering;
    parts.forkSlider = slider;
    parts.frontWheelSpin = frontSpin;
    parts.discs = parts.discs.concat(discs);
    return steering;
  }

  /* Variante di loft dove le sezioni non sono allineate lungo X ma seguono
     una curva arbitraria nel piano XY (parafanghi, huggers, condotti). */
  function arcShell(sections) {
    var nS = sections.length, nP = sections[0].pts.length;
    var verts = [], uvs = [], idx = [];
    for (var s = 0; s < nS; s++) {
      for (var p = 0; p < nP; p++) {
        verts.push(sections[s].x, sections[s].pts[p][0], sections[s].pts[p][1]);
        uvs.push(p / nP, s / (nS - 1));
      }
    }
    for (var s2 = 0; s2 < nS - 1; s2++) {
      for (var p2 = 0; p2 < nP; p2++) {
        var a = s2 * nP + p2, b = s2 * nP + (p2 + 1) % nP;
        var c = (s2 + 1) * nP + p2, d = (s2 + 1) * nP + (p2 + 1) % nP;
        idx.push(a, c, b, b, c, d);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return track(g);
  }

  /* ═══════════════════════════ MOTORE ═══════════════════════════ */

  function buildEngine(mats) {
    var g = new THREE.Group();
    g.name = 'engine';

    var CRANK = [-0.055, 0.415];

    /* Carter: il pezzo più massiccio, largo e schiacciato. */
    var caseG = box(0.34, 0.28, 0.40, 4, 4, 4);
    sculpt(caseG, function (v) {
      var tx = Math.abs(v.x) / 0.17, ty = Math.abs(v.y) / 0.14;
      v.z *= 1 - tx * tx * 0.30 - ty * ty * 0.22;
      v.y -= tx * tx * 0.02;
    });
    var crankcase = mesh(caseG, mats.engine, 'engine_case');
    crankcase.position.set(CRANK[0], CRANK[1], 0);
    g.add(crankcase);

    /* Coperchio frizione a destra (−Z), coperchio alternatore a sinistra. */
    var clutch = mesh(cyl(0.078, 0.072, 0.042, 28), mats.engine, 'clutch_cover');
    clutch.rotation.x = Math.PI / 2;
    clutch.position.set(CRANK[0] - 0.010, CRANK[1] - 0.025, -0.158);
    g.add(clutch);
    var alt = mesh(cyl(0.070, 0.065, 0.038, 28), mats.engine, 'alternator_cover');
    alt.rotation.x = Math.PI / 2;
    alt.position.set(CRANK[0] - 0.015, CRANK[1] - 0.015, 0.156);
    g.add(alt);

    /* Le due bancate a 90°. Il motore è ruotato all'indietro: la bancata
       anteriore resta quasi orizzontale, la posteriore quasi verticale. */
    var banks = [
      { ang: 18 * Math.PI / 180, len: 0.20, name: 'front' },
      { ang: 108 * Math.PI / 180, len: 0.19, name: 'rear' }
    ];

    for (var b = 0; b < banks.length; b++) {
      var bk = banks[b];
      var dir = [Math.cos(bk.ang), Math.sin(bk.ang)];
      var base = [CRANK[0] + dir[0] * 0.10, CRANK[1] + dir[1] * 0.10];
      var top = [base[0] + dir[0] * bk.len, base[1] + dir[1] * bk.len];

      /* blocco cilindri */
      var blockG = box(bk.len, 0.20, 0.30, 3, 2, 3);
      sculpt(blockG, function (v) {
        var t = Math.abs(v.z) / 0.15;
        v.y *= 1 - t * t * 0.18;
      });
      var block = mesh(blockG, mats.engine, 'cyl_block_' + bk.name);
      block.position.set((base[0] + top[0]) / 2, (base[1] + top[1]) / 2, 0);
      block.rotation.z = bk.ang;
      g.add(block);

      /* testata + coperchio distribuzione: più largo del blocco, è la parte
         che si vede fra i condotti della carena */
      var headG = box(0.085, 0.235, 0.335, 2, 2, 3);
      sculpt(headG, function (v) {
        var t = Math.abs(v.z) / 0.1675;
        v.y *= 1 - t * t * 0.14;
        v.x *= 1 - t * t * 0.20;
      });
      var head = mesh(headG, mats.engineDark, 'head_' + bk.name);
      head.position.set(top[0] + dir[0] * 0.045, top[1] + dir[1] * 0.045, 0);
      head.rotation.z = bk.ang;
      g.add(head);

      /* due coperchi camme per bancata */
      for (var c = -1; c <= 1; c += 2) {
        var camG = cyl(0.052, 0.052, 0.075, 18);
        var cam = mesh(camG, mats.engine, 'cam_cover');
        cam.rotation.x = Math.PI / 2;
        cam.position.set(top[0] + dir[0] * 0.075, top[1] + dir[1] * 0.075, c * 0.098);
        g.add(cam);
      }
    }

    /* Corpi farfallati e airbox fra le bancate. */
    var airbox = box(0.16, 0.13, 0.30, 2, 2, 2);
    sculpt(airbox, function (v) { v.z *= 1 - Math.abs(v.y) / 0.065 * 0.15; });
    var ab = mesh(airbox, mats.plastic, 'airbox');
    ab.position.set(0.02, 0.66, 0);
    g.add(ab);

    /* Pignone e catena, lato sinistro (+Z), come su tutte le Ducati. */
    var sprocket = mesh(cylZ(0.055, 0.055, 0.020, 26), mats.forgedDark, 'front_sprocket');
    sprocket.position.set(-0.185, 0.395, 0.150);
    g.add(sprocket);

    return g;
  }

  /* ═══════════════════════════ TELAIO E FORCELLONE ═══════════════════════════ */

  function buildFrame(mats) {
    var g = new THREE.Group();
    g.name = 'frame';

    /* Front Frame: un guscio compatto che dal cannotto arriva alle teste.
       Non abbraccia il motore — il motore È il telaio. */
    var shellG = box(0.30, 0.165, 0.235, 5, 4, 4);
    sculpt(shellG, function (v) {
      var t = (v.x / 0.15 + 1) / 2;               // 0 dietro → 1 davanti
      v.z *= 0.55 + 0.45 * Math.sin(t * Math.PI); // strizzato agli estremi
      v.y *= 1 - Math.pow(Math.abs(v.z) / 0.118, 2) * 0.25;
      v.y += (1 - t) * 0.02;
    });
    var shell = mesh(shellG, mats.frame, 'front_frame');
    shell.position.set(0.290, 0.800, 0);
    shell.rotation.z = -0.07;
    g.add(shell);

    /* Cannotto di sterzo. */
    var head = mesh(cyl(0.036, 0.036, 0.155, 20), mats.frame, 'steering_head');
    head.position.set(0.415, 0.845, 0);
    head.rotation.z = RAKE;
    g.add(head);

    /* Telaietto posteriore: sta dentro il codone, quindi resta minimo. */
    for (var s = -1; s <= 1; s += 2) {
      var rail = bar([-0.24, 0.780], [-0.58, 0.845], 0.032, 0.022, 0.020, mats.frame, 'subframe');
      rail.position.z = s * 0.058;
      g.add(rail);
    }

    /* Perno forcellone e piastre. */
    var pivot = mesh(cylZ(0.030, 0.030, 0.30, 18), mats.forgedDark, 'swingarm_pivot');
    pivot.position.set(-0.300, 0.360, 0);
    g.add(pivot);

    return g;
  }

  /* Forcellone monobraccio: il braccio è a SINISTRA (+Z), quindi il fianco
     destro della ruota resta completamente scoperto. */
  function buildSwingarm(mats, parts) {
    var g = new THREE.Group();
    g.name = 'swingarm';
    g.position.set(-0.300, 0.360, 0);   // perno: origine locale = perno

    var reach = -WHEELBASE_HALF + 0.300;   // −0.4345 fino all'asse posteriore
    var drop = R_REAR - 0.360;             // −0.034

    /* Trave principale, sezione scatolata rastremata. */
    var armG = box(Math.abs(reach), 0.115, 0.075, 6, 3, 2);
    sculpt(armG, function (v) {
      var t = v.x / Math.abs(reach) + 0.5;    // 0 al perno, 1 all'asse
      v.y *= 1.25 - t * 0.55;
      v.z *= 1.15 - t * 0.35;
      /* nervatura superiore */
      if (v.y > 0) v.y += Math.sin(t * Math.PI) * 0.018;
    });
    var arm = mesh(armG, mats.swingarm, 'swingarm_arm');
    arm.position.set(reach / 2, drop / 2, 0.135);
    arm.rotation.z = Math.atan2(drop, reach) + Math.PI;
    g.add(arm);

    /* Attacco al perno, che attraversa da parte a parte. */
    var yoke = mesh(cylZ(0.058, 0.058, 0.26, 20), mats.swingarm, 'swingarm_yoke');
    yoke.position.set(0, 0, 0.06);
    g.add(yoke);

    /* Mozzo eccentrico lato sinistro + dado ruota lato destro. */
    var hub = mesh(cylZ(0.082, 0.082, 0.095, 26), mats.swingarm, 'rear_hub');
    hub.position.set(reach, drop, 0.115);
    g.add(hub);
    var nut = mesh(cylZ(0.046, 0.046, 0.030, 6), mats.forgedDark, 'axle_nut');
    nut.position.set(reach, drop, -0.075);
    g.add(nut);

    /* Catena: due tratti rettilinei fra pignone e corona. */
    var sprocketR = 0.105;
    for (var side = -1; side <= 1; side += 2) {
      var chain = bar(
        [0.115, 0.035 + side * 0.052],
        [reach, drop + side * sprocketR * 0.92],
        0.016, 0.016, 0.010, mats.chain, 'chain_run');
      chain.position.z = 0.150;
      g.add(chain);
    }
    var crown = mesh(cylZ(sprocketR, sprocketR, 0.012, 34), mats.forgedDark, 'rear_sprocket');
    crown.position.set(reach, drop, 0.150);
    g.add(crown);

    /* Pinza e disco posteriori. */
    var rearDisc = buildDisc(0.1225, 0.070, 0.135, mats, 'rear_disc');
    rearDisc.position.x = reach;
    rearDisc.position.y = drop;
    g.add(rearDisc);
    parts.discs.push(rearDisc);

    var rc = buildCaliper(0.115, Math.PI * 1.15, 0.155, mats, 0.72);
    rc.position.x += reach;
    rc.position.y += drop;
    g.add(rc);

    parts.swingarm = g;
    return g;
  }

  /* Mono Öhlins TTX36: molla elicoidale vera, generata come tubo su una
     curva a elica. Una molla finta si riconosce immediatamente. */
  function buildShock(mats) {
    var g = new THREE.Group();
    g.name = 'shock';

    var bottom = [-0.245, 0.415], top = [-0.145, 0.700];
    var dx = top[0] - bottom[0], dy = top[1] - bottom[1];
    var len = Math.sqrt(dx * dx + dy * dy);
    var ang = Math.atan2(dy, dx) - Math.PI / 2;

    var body = mesh(cyl(0.021, 0.021, len * 0.72, 16), mats.gold, 'shock_body');
    body.position.set((bottom[0] + top[0]) / 2, (bottom[1] + top[1]) / 2, 0.02);
    body.rotation.z = ang;
    g.add(body);

    var coils = 7, ptsH = [];
    for (var i = 0; i <= coils * 12; i++) {
      var t = i / (coils * 12);
      var a = t * coils * Math.PI * 2;
      ptsH.push([Math.cos(a) * 0.036, t * len * 0.78 - len * 0.39, Math.sin(a) * 0.036]);
    }
    var spring = mesh(tubeFrom(ptsH, 0.0075, coils * 14, 8), mats.springRed, 'shock_spring');
    spring.position.set((bottom[0] + top[0]) / 2, (bottom[1] + top[1]) / 2, 0.02);
    spring.rotation.z = ang;
    g.add(spring);

    var res = mesh(cyl(0.026, 0.026, 0.085, 16), mats.gold, 'shock_reservoir');
    res.position.set(-0.235, 0.545, 0.085);
    res.rotation.z = 0.5;
    g.add(res);

    return g;
  }

  /* ═══════════════════════════ SCARICO ═══════════════════════════ */

  function buildExhaust(mats, parts) {
    var g = new THREE.Group();
    g.name = 'exhaust';

    /* Quattro collettori dalle teste verso il collettore sotto il motore. */
    var starts = [
      [0.145, 0.545, 0.085], [0.145, 0.545, -0.085],
      [-0.055, 0.640, 0.075], [-0.055, 0.640, -0.075]
    ];
    for (var i = 0; i < starts.length; i++) {
      var s = starts[i];
      var pts = [
        s,
        [s[0] + 0.05, s[1] - 0.10, s[2] * 1.15],
        [s[0] - 0.02, s[1] - 0.20, s[2] * 0.9],
        [-0.10, 0.300, s[2] * 0.55],
        [-0.16, 0.255, s[2] * 0.25]
      ];
      g.add(mesh(tubeFrom(pts, 0.0185, 26, 10), mats.titanium, 'header_' + i));
    }

    /* Silenziatore sottomotore: sta dentro il puntale, se ne vede solo il
       fondo. Schiacciato, non un barile. */
    var bellyG = cyl(0.062, 0.058, 0.28, 22);
    var belly = mesh(bellyG, mats.titaniumDark, 'belly_silencer');
    belly.rotation.z = Math.PI / 2 - 0.06;
    belly.scale.z = 0.62;
    belly.position.set(-0.26, 0.278, 0);
    g.add(belly);

    /* Doppio terminale a destra (−Z), basso, sotto il codone. */
    parts.exhaustTips = [];
    for (var t = 0; t < 2; t++) {
      /* I terminali passano FUORI dal pneumatico posteriore, largo 200 mm
         (±0.10): sotto quella soglia il tubo entrerebbe dentro la gomma. */
      var zOff = -0.138 - t * 0.050;
      var pipe = [
        [-0.34, 0.286, zOff * 0.35],
        [-0.44, 0.352, zOff * 0.70],
        [-0.53, 0.436, zOff],
        [-0.60, 0.492, zOff]
      ];
      g.add(mesh(tubeFrom(pipe, 0.0245, 20, 12), mats.titanium, 'tailpipe_' + t));

      /* Il terminale punta indietro: cilindro con asse Y ruotato di 90° su Z
         perché l'asse cada lungo X, non lungo Z. */
      var tip = mesh(cyl(0.031, 0.029, 0.062, 18, true), mats.titaniumDark, 'exhaust_tip_' + t);
      tip.rotation.z = Math.PI / 2;
      tip.position.set(-0.632, 0.502, zOff);
      g.add(tip);

      var marker = new THREE.Object3D();
      marker.name = 'exhaust_outlet_' + t;
      marker.position.set(-0.664, 0.502, zOff);
      g.add(marker);
      parts.exhaustTips.push(marker);
    }

    return g;
  }

  /* ═══════════════════════════ CARROZZERIA ═══════════════════════════ */

  function buildBodywork(mats, parts, quality) {
    var g = new THREE.Group();
    g.name = 'bodywork';
    var seg = quality === 'low' ? 16 : 26;

    /* ── Carena principale ──
       Un guscio aperto sotto, non un bozzolo: sotto ci passano motore,
       collettori e ruota, esattamente come sulla moto vera.
       Ogni stazione dichiara il bordo superiore e quello inferiore; `n` cala
       verso il muso e la sezione diventa a diamante, tagliente.
       Il tetto scende dopo x ≈ 0,5 per lasciare emergere il serbatoio. */
    var OPEN = 0.82;
    var fairingSecs = [
      /*  x,     yTop,  yBot,  halfW,  n  */
      /* La silhouette è un CUNEO, non una lente: il tetto crolla subito dopo
         il cupolino perché da lì in poi comanda il serbatoio, e la carena
         resta solo come fiancata bassa che corre verso il puntale.
         `n` sale da 1,7 (muso a lama) a 3,2 (fianchi quasi piatti): è questo
         a distinguere una carena da una fusoliera. */
      [1.022, 0.812, 0.652, 0.026, 1.70],
      [0.998, 0.856, 0.596, 0.056, 1.95],
      [0.968, 0.892, 0.540, 0.094, 2.25],
      [0.918, 0.914, 0.494, 0.146, 2.60],
      [0.850, 0.918, 0.458, 0.204, 2.95],
      [0.772, 0.888, 0.434, 0.252, 3.15],
      [0.690, 0.868, 0.424, 0.268, 3.20],
      [0.600, 0.828, 0.414, 0.262, 3.15],
      [0.505, 0.792, 0.410, 0.240, 3.05],
      [0.405, 0.762, 0.410, 0.208, 2.95],
      [0.300, 0.740, 0.414, 0.172, 2.85],
      [0.195, 0.726, 0.424, 0.136, 2.75]
    ];
    function shellFrom(rows, open, segs) {
      return rows.map(function (r) {
        var cy = (r[1] + r[2]) / 2, h = (r[1] - r[2]) / 2;
        return { x: r[0], pts: shellProfile(cy, h, r[3], r[4], segs, open) };
      });
    }
    /* capFront chiude il muso: senza, si guarda dentro il guscio e il puntale
       diventa una serie di facce scure. */
    g.add(mesh(loft(shellFrom(fairingSecs, OPEN, seg), true, false, false),
      mats.paint, 'fairing_main'));

    /* ── Puntale ──
       Chiude il ventre sotto il motore. Nero opaco: sulla moto vera è il
       pannello che raccoglie l'olio in caso di rottura, per regolamento. */
    var bellySecs = [
      [0.560, 0.436, 0.322, 0.106, 2.4],
      [0.430, 0.424, 0.282, 0.140, 2.2],
      [0.290, 0.414, 0.256, 0.158, 2.1],
      [0.130, 0.410, 0.244, 0.162, 2.1],
      [-0.030, 0.414, 0.250, 0.150, 2.2],
      [-0.160, 0.426, 0.276, 0.118, 2.4]
    ];
    g.add(mesh(loft(shellFrom(bellySecs, 0.90, Math.round(seg * 0.7)), false, false, false),
      mats.accent, 'belly_pan'));

    /* ── Alette biplano ──
       Due profili per lato, il superiore più corto. Sono la firma
       aerodinamica della V4 e devono leggersi anche in silhouette. */
    for (var side = -1; side <= 1; side += 2) {
      for (var tier = 0; tier < 2; tier++) {
        var span = tier === 0 ? 0.115 : 0.092;
        var chord = tier === 0 ? 0.135 : 0.110;
        var wingG = box(chord, 0.011, span, 6, 1, 4);
        sculpt(wingG, function (v) {
          /* il clamp non è cosmetico: sul bordo esatto v.x/chord + 0.5 può
             valere −1e−18, e Math.pow(negativo, 0.7) restituisce NaN */
          var t = Math.max(0, Math.min(1, v.x / chord + 0.5));   // 0 bordo d'uscita
          /* profilo alare: spessore massimo al 30% della corda */
          var thick = Math.sin(Math.pow(t, 0.7) * Math.PI);
          v.y *= 0.35 + thick * 1.5;
          /* curvatura: il bordo d'uscita scende, genera carico */
          v.y -= Math.pow(1 - t, 2) * 0.022;
          /* freccia e rastremazione verso l'estremità */
          var k = Math.abs(v.z) / (span / 2);
          v.x -= k * 0.030;
          v.y *= 1 - k * 0.35;
        });
        var wing = mesh(wingG, mats.carbon, 'winglet');
        /* Sporgono davvero oltre il fianco: se non si leggono in silhouette
           non stanno facendo il loro mestiere, né aerodinamico né visivo. */
        wing.position.set(0.858 - tier * 0.014, 0.660 + tier * 0.092, side * (0.250 + tier * 0.006));
        wing.rotation.x = side * (tier === 0 ? 0.10 : 0.07);
        wing.rotation.y = side * 0.26;
        wing.rotation.z = -0.06;
        g.add(wing);
      }

      /* Paratia verticale che chiude le due alette all'estremità. */
      var endG = box(0.145, 0.190, 0.014, 3, 4, 1);
      sculpt(endG, function (v) {
        v.y *= 1 - Math.pow(Math.abs(v.x) / 0.0725, 2) * 0.35;
        v.x -= Math.max(0, v.y) * 0.22;
      });
      var end = mesh(endG, mats.paint, 'winglet_endplate');
      end.position.set(0.850, 0.706, side * 0.318);
      end.rotation.y = side * 0.26;
      g.add(end);

      /* Estrattore d'aria calda sul fianco: un incavo scuro, il dettaglio
         che rompe la monotonia della fiancata rossa. */
      var ventG = box(0.215, 0.115, 0.014, 4, 3, 1);
      sculpt(ventG, function (v) {
        var t = v.x / 0.1075;
        v.y *= 1 - t * t * 0.45;
        v.y -= t * 0.038;
      });
      var vent = mesh(ventG, mats.vent, 'side_vent');
      vent.position.set(0.520, 0.610, side * 0.286);
      vent.rotation.y = side * 0.06;
      vent.rotation.z = -0.22;
      g.add(vent);
    }

    /* ── Cupolino ──
       Sale all'indietro fino a ~1,10 m: è il punto più alto della moto e
       quello che fissa l'altezza totale dichiarata di 1130 mm. */
    var screenSecs = [];
    for (var i2 = 0; i2 <= 10; i2++) {
      var t2 = i2 / 10;
      screenSecs.push({
        x: 0.938 - t2 * 0.262,
        pts: shellProfile(0.930 + t2 * 0.088, 0.030 + t2 * 0.082, 0.048 + t2 * 0.140,
                          2.1, 16, 0.55)
      });
    }
    g.add(mesh(loft(screenSecs, false, false, false), mats.screen, 'windscreen'));

    /* ── Gruppo ottico anteriore: due elementi sovrapposti con la firma a V ── */
    var headlight = new THREE.Group();
    headlight.name = 'headlight';
    for (var s3 = -1; s3 <= 1; s3 += 2) {
      /* La firma a V: due barre luminose che scendono verso il centro.
         Viste di muso disegnano una V — è l'elemento per cui la moto si
         riconosce di notte da lontano. */
      var drlG = box(0.150, 0.016, 0.011, 4, 1, 1);
      sculpt(drlG, function (v) { v.y += Math.abs(v.x) * 0.10; });
      var drl = mesh(drlG, mats.led, 'drl');
      drl.position.set(0.958, 0.800, s3 * 0.070);
      drl.rotation.y = Math.PI / 2 - s3 * 0.30;
      drl.rotation.z = s3 * 0.40;
      headlight.add(drl);

      /* proiettore sotto la barra */
      var proj = mesh(cyl(0.028, 0.028, 0.020, 18), mats.lens, 'projector');
      proj.rotation.z = Math.PI / 2;
      proj.position.set(0.952, 0.742, s3 * 0.052);
      headlight.add(proj);

      var bulb = mesh(cyl(0.019, 0.019, 0.006, 14), mats.ledWarm, 'projector_led');
      bulb.rotation.z = Math.PI / 2;
      bulb.position.set(0.960, 0.742, s3 * 0.052);
      headlight.add(bulb);

      /* presa d'aria dinamica accanto al faro: alimenta l'airbox */
      var duct = mesh(box(0.040, 0.062, 0.048), mats.vent, 'ram_air');
      duct.position.set(0.946, 0.858, s3 * 0.086);
      headlight.add(duct);
    }
    g.add(headlight);
    parts.headlight = headlight;

    /* ── Serbatoio: svasature per le ginocchia, alto davanti, basso dietro ── */
    /* Il serbatoio è un guscio profondo, non una pagnotta appoggiata sopra:
       i fianchi scendono fino a sovrapporsi al bordo alto della carena.
       È questa sovrapposizione a far leggere la moto come un pezzo solo. */
    var tankSecs = [
      /*  x,     yTop,  yBot,  halfW,  n  */
      [0.520, 0.876, 0.740, 0.070, 2.6],
      [0.430, 0.938, 0.732, 0.120, 2.4],
      [0.330, 0.974, 0.726, 0.162, 2.2],
      [0.210, 0.990, 0.722, 0.194, 2.1],
      [0.080, 0.986, 0.730, 0.198, 2.0],
      [-0.050, 0.966, 0.746, 0.182, 2.0],
      [-0.155, 0.928, 0.774, 0.144, 2.1],
      [-0.245, 0.892, 0.812, 0.098, 2.3]
    ];
    var tankGeo = loft(shellFrom(tankSecs, 0.88, seg), true, true, false);
    /* Svasature per le ginocchia: si scava il fianco basso del serbatoio,
       nella zona dove il pilota si aggrappa in staccata. */
    sculpt(tankGeo, function (v) {
      var knee = Math.exp(-Math.pow((v.x + 0.01) / 0.15, 2));
      var low = Math.max(0, 1 - Math.abs(v.y - 0.830) / 0.078);
      v.z *= 1 - knee * low * 0.30;
    });
    g.add(mesh(tankGeo, mats.paint, 'tank'));

    var cap = mesh(cyl(0.031, 0.031, 0.010, 20), mats.chrome, 'fuel_cap');
    cap.position.set(0.170, 0.990, 0);
    g.add(cap);

    /* ── Sella e codone ── */
    var seatGeo = box(0.30, 0.055, 0.19, 4, 2, 3);
    sculpt(seatGeo, function (v) {
      var t = v.x / 0.15;
      v.z *= 0.62 + 0.38 * (1 - t * t);
      v.y -= Math.pow(Math.abs(v.z) / 0.095, 2) * 0.014;
    });
    var seat = mesh(seatGeo, mats.seat, 'seat');
    /* Altezza sella 835 mm: il piano d'appoggio, non il colmo dell'imbottitura. */
    seat.position.set(-0.335, 0.808, 0);
    seat.rotation.z = 0.05;
    g.add(seat);

    var tailSecs = [
      { x: -0.215, cy: 0.826, h: 0.044, w: 0.100, n: 2.2 },
      { x: -0.330, cy: 0.846, h: 0.058, w: 0.096, n: 2.0 },
      { x: -0.450, cy: 0.864, h: 0.064, w: 0.082, n: 1.9 },
      { x: -0.565, cy: 0.872, h: 0.058, w: 0.060, n: 1.8 },
      { x: -0.672, cy: 0.866, h: 0.045, w: 0.037, n: 1.9 },
      { x: -0.758, cy: 0.856, h: 0.024, w: 0.017, n: 2.2 }
    ];
    var tlSecs = tailSecs.map(function (s) {
      return { x: s.x, pts: superProfile(s.cy, s.h, s.w, s.n, seg) };
    });
    g.add(mesh(loft(tlSecs, true, true), mats.paint, 'tail_unit'));

    var taillight = new THREE.Group();
    taillight.name = 'taillight';
    var tlG = box(0.014, 0.028, 0.070, 1, 1, 2);
    var tl = mesh(tlG, mats.ledRed, 'tail_led');
    tl.position.set(-0.755, 0.850, 0);
    taillight.add(tl);
    g.add(taillight);
    parts.taillight = taillight;

    /* ── Parafango posteriore: segue la ruota a distanza costante ── */
    var hugSecs = [];
    for (var i3 = 0; i3 <= 12; i3++) {
      var a3 = 0.55 + (i3 / 12) * 1.55;
      hugSecs.push({
        x: -WHEELBASE_HALF + Math.cos(a3) * 0.352,
        pts: superProfile(R_REAR + Math.sin(a3) * 0.352, 0.009, 0.108, 2.4, 12)
      });
    }
    g.add(mesh(arcShell(hugSecs), mats.carbon, 'rear_hugger'));

    /* ── Cruscotto TFT, inclinato verso il pilota ── */
    var dash = mesh(box(0.140, 0.005, 0.100, 1, 1, 1), mats.dash, 'dash_screen');
    dash.position.set(0.545, 0.928, 0);
    dash.rotation.z = -0.62;
    g.add(dash);
    var bezel = mesh(box(0.158, 0.016, 0.116), mats.plastic, 'dash_bezel');
    bezel.position.set(0.541, 0.920, 0);
    bezel.rotation.z = -0.62;
    g.add(bezel);

    /* ── Pedane ── */
    for (var s4 = -1; s4 <= 1; s4 += 2) {
      var peg = mesh(cylZ(0.010, 0.010, 0.062, 12), mats.forgedDark, 'footpeg');
      peg.position.set(-0.258, 0.478, s4 * 0.178);
      g.add(peg);
      var hanger = mesh(box(0.058, 0.070, 0.010), mats.forgedDark, 'peg_hanger');
      hanger.position.set(-0.240, 0.508, s4 * 0.146);
      g.add(hanger);
    }

    /* ── Fascia scura sulla fiancata bassa ──
       Spezza la massa rossa esattamente dove lo fa la moto vera, all'attacco
       fra fiancata e puntale. Senza, il fianco legge come un unico blocco. */
    for (var s5 = -1; s5 <= 1; s5 += 2) {
      var stripeSecs = [];
      var rows = [
        [0.790, 0.690, 0.446, 0.238],
        [0.690, 0.672, 0.430, 0.264],
        [0.580, 0.640, 0.418, 0.262],
        [0.470, 0.604, 0.412, 0.240],
        [0.360, 0.572, 0.412, 0.204],
        [0.250, 0.548, 0.418, 0.168]
      ];
      for (var r5 = 0; r5 < rows.length; r5++) {
        var rw = rows[r5];
        var cy5 = (rw[1] + rw[2]) / 2, h5 = (rw[1] - rw[2]) / 2;
        stripeSecs.push({ x: rw[0], pts: shellProfile(cy5, h5, rw[3] * 1.014, 3.1, 16, 0.46) });
      }
      var stripe = mesh(loft(stripeSecs, false, false, false), mats.accent, 'flank_stripe');
      stripe.rotation.x = s5 > 0 ? 0 : Math.PI;
      g.add(stripe);
    }

    return g;
  }

  /* ═══════════════════════════ MATERIALI ═══════════════════════════ */

  function buildMaterials(quality, bodyMaterials, emissiveMaterials) {
    var M = MAT && MAT.make;
    var o = { quality: quality };

    function fallback(color, rough, metal) {
      return track(new THREE.MeshStandardMaterial({
        color: color, roughness: rough, metalness: metal
      }));
    }

    var paint = M ? M.paint(THREE, { color: 0xda291c, quality: quality })
                  : fallback(0xda291c, 0.25, 0.5);
    var accent = M ? M.matte(THREE, { color: 0x121417 }) : fallback(0x121417, 0.6, 0.3);
    /* Carena e puntale sono gusci aperti sotto: senza DoubleSide il bordo
       inferiore diventa un buco quando la camera scende sotto il livello
       della sella. */
    paint.side = THREE.DoubleSide;
    accent.side = THREE.DoubleSide;
    bodyMaterials.push(paint);

    var mats = {
      paint: paint,
      accent: accent,
      carbon: M ? M.carbon(THREE, o) : fallback(0x1a1c1f, 0.35, 0.3),
      rubber: M ? M.rubber(THREE, o) : fallback(0x0b0c0d, 0.92, 0.0),
      forged: M ? M.alloyForged(THREE, { quality: quality, color: 0x2a2e33 }) : fallback(0x2a2e33, 0.35, 0.95),
      forgedDark: M ? M.alloyForged(THREE, { quality: quality, color: 0x17191c }) : fallback(0x17191c, 0.4, 0.9),
      /* I carter di un motore montato sono grigio scuro opaco, non alluminio
         lucido appena fuso: envMapIntensity basso e colore smorzato. */
      engine: M ? M.alloyCast(THREE, { quality: quality, color: 0x3a3e43, envMapIntensity: 0.75 }) : fallback(0x3a3e43, 0.6, 0.9),
      engineDark: M ? M.alloyCast(THREE, { quality: quality, color: 0x25282c, envMapIntensity: 0.7 }) : fallback(0x25282c, 0.65, 0.85),
      frame: M ? M.alloyCast(THREE, { quality: quality, color: 0x585e64, envMapIntensity: 1.0 }) : fallback(0x585e64, 0.45, 0.92),
      swingarm: M ? M.alloyCast(THREE, { quality: quality, color: 0x4e545a, envMapIntensity: 0.95 }) : fallback(0x4e545a, 0.45, 0.92),
      chrome: M ? M.chrome(THREE, {}) : fallback(0xdfe4e8, 0.08, 1.0),
      titanium: M ? M.titanium(THREE, o) : fallback(0x8d9298, 0.3, 0.95),
      titaniumDark: M ? M.chrome(THREE, { color: 0x3a4048, roughness: 0.28 }) : fallback(0x3a4048, 0.3, 0.95),
      gold: M ? M.goldAnodised(THREE, o) : fallback(0xc9922a, 0.3, 0.95),
      forkLeg: M ? M.alloyForged(THREE, { quality: quality, color: 0x191c1f }) : fallback(0x191c1f, 0.35, 0.9),
      caliper: M ? M.alloyForged(THREE, { quality: quality, color: 0x24272b }) : fallback(0x24272b, 0.35, 0.9),
      disc: M ? M.brakeDisc(THREE, o) : fallback(0x9aa1a8, 0.3, 1.0),
      chain: M ? M.chrome(THREE, { color: 0x6e7276, roughness: 0.42 }) : fallback(0x6e7276, 0.42, 0.9),
      plastic: M ? M.plasticSatin(THREE, {}) : fallback(0x121417, 0.55, 0.0),
      vent: M ? M.plasticSatin(THREE, { color: 0x0a0b0d, roughness: 0.7 }) : fallback(0x0a0b0d, 0.7, 0.0),
      grip: M ? M.plasticSatin(THREE, { color: 0x0d0e10, roughness: 0.85 }) : fallback(0x0d0e10, 0.85, 0.0),
      seat: M ? M.seat(THREE) : fallback(0x0c0d0f, 0.8, 0.0),
      screen: M ? M.glassTint(THREE, {}) : track(new THREE.MeshPhysicalMaterial({ color: 0x0e1114, transparent: true, opacity: 0.5, roughness: 0.1 })),
      lens: M ? M.lensClear(THREE) : track(new THREE.MeshPhysicalMaterial({ color: 0xd8e2ec, transparent: true, opacity: 0.6, roughness: 0.05 })),
      led: M ? M.emissiveLED(THREE, { color: 0xe8f0ff, intensity: 2.2 }) : fallback(0xe8f0ff, 0.3, 0.0),
      ledWarm: M ? M.emissiveLED(THREE, { color: 0xfff0d8, intensity: 2.6 }) : fallback(0xfff0d8, 0.3, 0.0),
      ledRed: M ? M.emissiveLED(THREE, { color: 0xff2a12, intensity: 2.4 }) : fallback(0xff2a12, 0.3, 0.0),
      dash: M ? M.dash(THREE) : fallback(0x101418, 0.2, 0.0),
      springRed: M ? M.matte(THREE, { color: 0xb4231a }) : fallback(0xb4231a, 0.4, 0.3)
    };

    emissiveMaterials.push(mats.led, mats.ledWarm, mats.ledRed, mats.dash);
    return mats;
  }

  /* ═══════════════════════════ BUILD ═══════════════════════════ */

  function build(threeRef, options) {
    THREE = threeRef;
    MAT = global.PanigaleMaterials || null;
    options = options || {};
    var quality = options.quality || 'high';

    var group = new THREE.Group();
    group.name = 'panigale_v4';

    var parts = {
      steering: null, frontWheelSpin: null, rearWheelSpin: null,
      swingarm: null, forkSlider: null,
      headlight: null, taillight: null,
      exhaustTips: [], bodyMaterials: [], emissiveMaterials: [], discs: []
    };

    var mats = buildMaterials(quality, parts.bodyMaterials, parts.emissiveMaterials);

    /* I figli di primo livello sono le unità della vista esplosa: ogni voce
       qui sotto si stacca come un pezzo a sé. */
    group.add(buildFrontEnd(mats, parts, quality));
    group.add(buildFrame(mats));
    group.add(buildEngine(mats));
    group.add(buildSwingarm(mats, parts));
    group.add(buildShock(mats));
    group.add(buildExhaust(mats, parts));
    group.add(buildBodywork(mats, parts, quality));

    /* Ruota posteriore: gruppo di primo livello, così nella vista esplosa si
       separa dal forcellone invece di viaggiarci insieme. */
    var rearWheel = new THREE.Group();
    rearWheel.name = 'rear_wheel';
    rearWheel.position.set(-WHEELBASE_HALF, R_REAR, 0);
    var rearSpin = new THREE.Group();
    rearSpin.name = 'rear_wheel_spin';
    rearSpin.add(buildWheel(R_REAR, W_REAR, mats, true, quality));
    rearWheel.add(rearSpin);
    group.add(rearWheel);
    parts.rearWheelSpin = rearSpin;

    function dispose() {
      for (var i = 0; i < registry.length; i++) {
        var r = registry[i];
        if (r && typeof r.dispose === 'function') r.dispose();
      }
      registry.length = 0;
    }

    return { group: group, parts: parts, dispose: dispose };
  }

  global.PanigaleModel = { build: build };

})(typeof window !== 'undefined' ? window : this);
