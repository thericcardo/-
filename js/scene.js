/* ═══════════════════════════════════════════════════════════════════════════
   scene.js — orchestratore WebGL
   ---------------------------------------------------------------------------
   Mette insieme i tre moduli indipendenti:
     · window.PanigaleModel  → geometria procedurale della moto
     · window.PanigaleFX     → ambiente HDRI, particellari, shader atmosferici
     · questo file           → renderer, rig di camera, bloom, ciclo di render

   Contratto del mondo (condiviso con tutti i moduli):
     1 unità = 1 metro · +X avanti · +Y alto · +Z lato sinistro moto
     piano terra a y = 0, origine a metà interasse
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var THREE = global.THREE;

  /* ─────────────────────────── Utility ─────────────────────────── */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Damping indipendente dal frame rate: `rate` è la frazione di distanza
     residua coperta in un secondo. Senza questo, un 144 Hz insegue il target
     quasi tre volte più in fretta di un 50 Hz e la regia cambia sensazione. */
  function damp(current, target, rate, dt) {
    return lerp(current, target, 1 - Math.pow(1 - rate, dt * 60));
  }

  function supportsWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(global.WebGLRenderingContext &&
        (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  /* ─────────────────────────── Regia della camera ───────────────────────────
     Una posa per capitolo. `drift` è ciò che la camera fa *durante* il
     capitolo, in modo che l'inquadratura non sia mai ferma mentre si legge. */
  /* `bias` sposta lateralmente il soggetto nel fotogramma: positivo = moto a
     sinistra, per lasciare il campo libero al testo che sta a destra. Si
     ottiene traslando il frustum con setViewOffset, non ruotando la camera —
     ruotare cambierebbe la prospettiva, traslare no. */
  var SHOTS = [
    { // 0 · hero — tre quarti anteriore dal lato destro; testo a sinistra
      pos: [3.30, 1.00, -2.95], look: [0.00, 0.62, 0], fov: 32, bias: -0.16,
      drift: { pos: [-0.45, 0.14, 0.38], look: [0, 0.02, 0], fov: -1.5 }
    },
    { // 1 · il cuore — fianco destro sul motore; testo a destra
      pos: [1.35, 0.92, -2.30], look: [-0.10, 0.58, 0], fov: 30, bias: 0.17,
      drift: { pos: [-0.60, -0.10, 0.35], look: [-0.08, -0.03, 0], fov: 1.5 }
    },
    { // 2 · aerodinamica — dal muso, alle alette; testo a sinistra
      pos: [2.95, 0.88, -1.75], look: [0.68, 0.72, 0], fov: 30, bias: -0.15,
      drift: { pos: [-0.50, 0.08, -0.35], look: [-0.16, -0.02, 0], fov: 2.5 }
    },
    { // 3 · anatomia — laterale pieno: la vista esplosa ha bisogno di aria
      pos: [0.15, 1.35, -4.70], look: [0.00, 0.62, 0], fov: 30, bias: 0,
      drift: { pos: [0.20, -0.22, 0.75], look: [0, 0, 0], fov: -1 }
    },
    { // 4 · elettronica — cruscotto e semimanubri; testo a destra
      pos: [1.95, 1.55, -1.95], look: [0.34, 0.90, 0], fov: 32, bias: 0.17,
      drift: { pos: [-0.30, -0.14, 0.45], look: [0.04, -0.05, 0], fov: -2 }
    },
    { // 5 · livrea — tre quarti posteriore, la moto ruota su se stessa
      pos: [-2.90, 1.10, -2.95], look: [0.00, 0.60, 0], fov: 33, bias: 0,
      drift: { pos: [0.35, 0.22, 0.80], look: [0, 0.02, 0], fov: -1.5 }
    },
    { // 6 · outro — allontanamento
      pos: [3.60, 2.05, -4.15], look: [0.00, 0.55, 0], fov: 36, bias: 0,
      drift: { pos: [0.85, 0.70, -1.10], look: [0, -0.04, 0], fov: 3 }
    }
  ];

  /* ═══════════════════════════ Bloom minimale ═══════════════════════════
     three.js UMD non include EffectComposer (vive in examples/), quindi il
     bloom è scritto a mano: bright-pass → due sfocature separabili a risoluzione
     dimezzata → composite additivo. Bastano ~100 righe e vale ogni pixel:
     senza, i fari e le scintille restano piatti.                            */

  var QUAD_VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  var BRIGHT_FRAG = [
    'uniform sampler2D tDiffuse;',
    'uniform float uThreshold;',
    'uniform float uSoft;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  float k = smoothstep(uThreshold, uThreshold + uSoft, l);',
    '  gl_FragColor = vec4(c * k, 1.0);',
    '}'
  ].join('\n');

  /* Sfocatura gaussiana a 9 tap con offset a coppie: 5 fetch per passata
     grazie al filtraggio lineare della GPU. */
  var BLUR_FRAG = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uDir;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;',
    '  vec2 o1 = uDir * 1.3846153846;',
    '  vec2 o2 = uDir * 3.2307692308;',
    '  sum += texture2D(tDiffuse, vUv + o1) * 0.3162162162;',
    '  sum += texture2D(tDiffuse, vUv - o1) * 0.3162162162;',
    '  sum += texture2D(tDiffuse, vUv + o2) * 0.0702702703;',
    '  sum += texture2D(tDiffuse, vUv - o2) * 0.0702702703;',
    '  gl_FragColor = sum;',
    '}'
  ].join('\n');

  /* Il composite fa anche da grado colore finale: vignettatura, aberrazione
     cromatica sui bordi e un filo di rumore per rompere il banding nei neri. */
  var COMPOSITE_FRAG = [
    'uniform sampler2D tScene;',
    'uniform sampler2D tBloom;',
    'uniform float uBloom;',
    'uniform float uAberration;',
    'uniform float uVignette;',
    'uniform float uTime;',
    'varying vec2 vUv;',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
    '}',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec2 fromCenter = uv - 0.5;',
    '  float r2 = dot(fromCenter, fromCenter);',
    '  vec2 off = fromCenter * r2 * uAberration;',
    '  vec3 col;',
    '  col.r = texture2D(tScene, uv - off).r;',
    '  col.g = texture2D(tScene, uv).g;',
    '  col.b = texture2D(tScene, uv + off).b;',
    '  col += texture2D(tBloom, uv).rgb * uBloom;',
    '  float vig = smoothstep(0.95, 0.18, r2 * uVignette);',
    '  col *= mix(0.72, 1.0, vig);',
    '  col += (hash(uv * 1024.0 + fract(uTime)) - 0.5) * 0.012;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function Bloom(renderer, width, height, quality) {
    var scale = quality === 'low' ? 4 : 2;
    var half = { w: Math.max(2, Math.floor(width / scale)), h: Math.max(2, Math.floor(height / scale)) };

    var rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false
    };

    /* La scena viene renderizzata qui: colorSpace sRGB significa che three
       applica tone mapping + encode dentro il target, così le passate
       successive lavorano già in spazio schermo. */
    this.rtScene = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    });
    this.rtScene.texture.colorSpace = THREE.SRGBColorSpace;

    this.rtA = new THREE.WebGLRenderTarget(half.w, half.h, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(half.w, half.h, rtOpts);
    this.rtA.texture.colorSpace = THREE.NoColorSpace;
    this.rtB.texture.colorSpace = THREE.NoColorSpace;

    this.scale = scale;
    this.renderer = renderer;

    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(this.quadGeo, null);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);

    this.matBright = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.62 },
        uSoft: { value: 0.28 }
      },
      vertexShader: QUAD_VERT, fragmentShader: BRIGHT_FRAG,
      depthTest: false, depthWrite: false
    });

    this.matBlur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG,
      depthTest: false, depthWrite: false
    });

    this.matComposite = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.rtScene.texture },
        tBloom: { value: this.rtB.texture },
        uBloom: { value: 0.62 },
        uAberration: { value: 0.55 },
        uVignette: { value: 1.15 },
        uTime: { value: 0 }
      },
      vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG,
      depthTest: false, depthWrite: false
    });

    this.passes = quality === 'low' ? 1 : 2;
  }

  Bloom.prototype.setSize = function (w, h) {
    var hw = Math.max(2, Math.floor(w / this.scale));
    var hh = Math.max(2, Math.floor(h / this.scale));
    this.rtScene.setSize(w, h);
    this.rtA.setSize(hw, hh);
    this.rtB.setSize(hw, hh);
  };

  Bloom.prototype._blit = function (material, target) {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.quadScene, this.quadCam);
  };

  Bloom.prototype.render = function (scene, camera, time) {
    var r = this.renderer;
    var prevToneMapping = r.toneMapping;

    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    /* Le passate post sono ShaderMaterial grezzi: three non inietta né tone
       mapping né conversione di colorSpace, quindi va disattivato tutto per
       non applicarlo due volte. */
    r.toneMapping = THREE.NoToneMapping;

    this.matBright.uniforms.tDiffuse.value = this.rtScene.texture;
    this._blit(this.matBright, this.rtA);

    var w = this.rtA.width, h = this.rtA.height;
    for (var i = 0; i < this.passes; i++) {
      var spread = 1 + i * 1.8;
      this.matBlur.uniforms.tDiffuse.value = this.rtA.texture;
      this.matBlur.uniforms.uDir.value.set(spread / w, 0);
      this._blit(this.matBlur, this.rtB);

      this.matBlur.uniforms.tDiffuse.value = this.rtB.texture;
      this.matBlur.uniforms.uDir.value.set(0, spread / h);
      this._blit(this.matBlur, this.rtA);
    }
    /* L'ultima sfocatura è finita in rtA: il composite legge da lì. */
    this.matComposite.uniforms.tBloom.value = this.rtA.texture;
    this.matComposite.uniforms.uTime.value = time;

    r.setRenderTarget(null);
    this.quadMesh.material = this.matComposite;
    r.render(this.quadScene, this.quadCam);

    r.toneMapping = prevToneMapping;
  };

  Bloom.prototype.dispose = function () {
    this.rtScene.dispose(); this.rtA.dispose(); this.rtB.dispose();
    this.quadGeo.dispose();
    this.matBright.dispose(); this.matBlur.dispose(); this.matComposite.dispose();
  };

  /* ═══════════════════════════ Scena ═══════════════════════════ */

  function createScene(canvas, options) {
    options = options || {};

    var quality = options.quality || 'high';
    var onProgress = options.onProgress || function () {};

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: quality !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false
    });
    renderer.setClearColor(0x08090a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var maxDPR = quality === 'low' ? 1.25 : 1.9;
    var dpr = Math.min(global.devicePixelRatio || 1, maxDPR);
    renderer.setPixelRatio(dpr);

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x08090a, 0.055);

    var camera = new THREE.PerspectiveCamera(34, 1, 0.05, 120);
    camera.position.set(2.75, 0.82, -2.35);

    /* Stato corrente della regia, smorzato verso i target ogni frame. */
    var camPos = camera.position.clone();
    var camLook = new THREE.Vector3(0, 0.62, 0);
    var camFov = 34;
    var camBias = 0;

    var tgtPos = camPos.clone();
    var tgtLook = camLook.clone();
    var tgtFov = camFov;
    var tgtBias = 0;

    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    /* Stato pilotato dal layer UI. */
    var state = {
      chapter: 0, progress: 0,
      rpm: 0.12, throttle: 0, speed: 0,
      exploded: 0, paintColor: null
    };
    var smooth = { rpm: 0.12, throttle: 0, speed: 0, exploded: 0 };

    var bike = null;
    var fx = {};
    var envRes = null;
    var bloom = null;
    var explodeData = [];
    var wheelAngle = 0;
    var bikeYaw = 0;
    var clock = new THREE.Clock();
    var elapsed = 0;
    var running = false;
    var rafId = 0;
    var disposed = false;

    /* Contatore fps per il degrado automatico della qualità. */
    var perf = { frames: 0, accum: 0, degraded: false };
    var appliedBias = 999;   // forza la prima applicazione del frustum

    var tmpVec = new THREE.Vector3();
    var tmpBox = new THREE.Box3();

    /* ─────────────── Luci ─────────────── */

    function buildLights() {
      /* L'HDRI procedurale fa il grosso del lavoro: queste luci servono a
         scolpire i bordi e a proiettare l'ombra di contatto. */
      var key = new THREE.DirectionalLight(0xfff1e0, 2.1);
      key.position.set(2.6, 4.2, -3.2);
      if (renderer.shadowMap.enabled) {
        key.castShadow = true;
        key.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 14;
        key.shadow.camera.left = -2.2;
        key.shadow.camera.right = 2.2;
        key.shadow.camera.top = 2.2;
        key.shadow.camera.bottom = -1.2;
        key.shadow.bias = -0.0012;
        key.shadow.normalBias = 0.02;
        key.shadow.radius = 2.5;
      }
      scene.add(key);

      /* Controluce freddo: è quello che disegna il profilo della carena
         contro il fondo nero. */
      var rim = new THREE.DirectionalLight(0x9fc4ff, 2.6);
      rim.position.set(-3.4, 2.0, 2.6);
      scene.add(rim);

      /* Riempimento caldo dal basso, come il riflesso del pavimento. */
      var bounce = new THREE.HemisphereLight(0x3a4048, 0x100d0c, 0.55);
      scene.add(bounce);

      /* Due strip lunghe lungo i fianchi: sono i riflessi allungati sulla
         vernice, il dettaglio che distingue un render di moto da uno generico. */
      var stripL = new THREE.RectAreaLight ? null : null;
      var accentR = new THREE.PointLight(0xffd7b0, 6, 5, 2);
      accentR.position.set(0.3, 1.9, -1.5);
      scene.add(accentR);
      var accentL = new THREE.PointLight(0xbcd8ff, 4, 5, 2);
      accentL.position.set(-0.6, 1.6, 1.7);
      scene.add(accentL);

      return { key: key, rim: rim, accentR: accentR, accentL: accentL };
    }

    var lights = null;

    /* ─────────────── Vista esplosa ───────────────
       Invece di dipendere dai nomi delle parti (che appartengono a un altro
       modulo), si prende ogni figlio di primo livello del gruppo moto e lo si
       spinge lungo la direzione che va dal baricentro della moto al suo. È
       robusto rispetto a come è organizzato il modello. */
    function prepareExplode(group) {
      var out = [];
      var rootCenter = new THREE.Vector3(0, 0.6, 0);
      for (var i = 0; i < group.children.length; i++) {
        var child = group.children[i];
        tmpBox.setFromObject(child);
        if (tmpBox.isEmpty()) continue;
        tmpBox.getCenter(tmpVec);

        var dir = tmpVec.clone().sub(rootCenter);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
        dir.normalize();
        /* Bias verticale: una esplosione tutta radiale collassa in un disco
           visto di lato, che è proprio la nostra inquadratura del capitolo 3. */
        dir.y += 0.35;
        dir.normalize();

        out.push({
          obj: child,
          base: child.position.clone(),
          offset: dir.multiplyScalar(0.30 + Math.random() * 0.34)
        });
      }
      return out;
    }

    /* ─────────────── Costruzione asincrona ───────────────
       Ogni fase cede il controllo al browser così la barra del preloader si
       muove davvero invece di saltare da 0 a 100 a fine blocco sincrono. */
    function nextFrame() {
      return new Promise(function (res) { requestAnimationFrame(function () { res(); }); });
    }

    function build() {
      onProgress(0.05, 'Inizializzazione renderer');

      return nextFrame()
        .then(function () {
          onProgress(0.18, 'Generazione ambiente HDRI');
          if (global.PanigaleFX && global.PanigaleFX.createEnvironment) {
            envRes = global.PanigaleFX.createEnvironment(THREE, renderer, { quality: quality });
            if (envRes && envRes.texture) {
              scene.environment = envRes.texture;
            }
          }
          lights = buildLights();
          return nextFrame();
        })
        .then(function () {
          onProgress(0.34, 'Fusione del basamento');
          if (!global.PanigaleModel || !global.PanigaleModel.build) {
            throw new Error('PanigaleModel non disponibile');
          }
          bike = global.PanigaleModel.build(THREE, { quality: quality });
          bike.group.traverse(function (o) {
            if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
          });
          scene.add(bike.group);
          explodeData = prepareExplode(bike.group);
          return nextFrame();
        })
        .then(function () {
          onProgress(0.62, 'Accensione atmosfera');
          buildFX();
          return nextFrame();
        })
        .then(function () {
          onProgress(0.82, 'Compilazione shader');
          /* Compilare adesso evita il micro-blocco al primo frame visibile. */
          try { renderer.compile(scene, camera); } catch (e) { /* non fatale */ }
          bloom = null;
          if (quality !== 'low') {
            try {
              bloom = new Bloom(renderer, canvas.clientWidth || 1280, canvas.clientHeight || 720, quality);
            } catch (e) {
              bloom = null;
            }
          }
          resize();
          return nextFrame();
        })
        .then(function () {
          onProgress(1, 'Pronta');
          return true;
        });
    }

    function exhaustOrigins() {
      var pts = [];
      if (bike && bike.parts && bike.parts.exhaustTips && bike.parts.exhaustTips.length) {
        for (var i = 0; i < bike.parts.exhaustTips.length; i++) {
          var p = new THREE.Vector3();
          bike.parts.exhaustTips[i].getWorldPosition(p);
          pts.push(p);
        }
      }
      /* Se il modello non espone gli scarichi, si usa una posizione plausibile
         sotto la coda, lato destro. */
      if (!pts.length) pts.push(new THREE.Vector3(-0.72, 0.42, -0.16));
      return pts;
    }

    function addFX(name, obj) {
      if (!obj) return;
      fx[name] = obj;
      if (obj.object3d) scene.add(obj.object3d);
    }

    function buildFX() {
      var FX = global.PanigaleFX;
      if (!FX) return;
      var tips = exhaustOrigins();
      var opts = { quality: quality };

      function tryMake(fn, name, extra) {
        if (typeof fn !== 'function') return;
        try {
          var o = Object.assign({}, opts, extra || {});
          addFX(name, fn(THREE, o));
        } catch (e) {
          if (global.console) console.warn('[scene] effetto "' + name + '" non disponibile:', e.message);
        }
      }

      tryMake(FX.createGroundPlane, 'ground');
      tryMake(FX.createHeatHaze, 'haze', { origin: tips[0].clone(), direction: new THREE.Vector3(-1, 0.25, 0), size: 0.45 });
      tryMake(FX.createExhaustSmoke, 'smoke', { origins: tips });
      tryMake(FX.createTyreSmoke, 'tyre', { origin: new THREE.Vector3(-0.7345, 0.02, 0) });
      tryMake(FX.createSparks, 'sparks', { origin: new THREE.Vector3(-0.7345, 0.05, 0), spread: 0.3 });
      tryMake(FX.createSpeedLines, 'speed');
      tryMake(FX.createDustMotes, 'dust', { count: quality === 'low' ? 220 : 900 });
      if (quality !== 'low') tryMake(FX.createLightShafts, 'shafts');
    }

    /* ─────────────── Ridimensionamento ─────────────── */
    function resize() {
      var w = canvas.clientWidth || global.innerWidth;
      var h = canvas.clientHeight || global.innerHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      /* setViewOffset memorizza le dimensioni piene: dopo un resize vanno
         riapplicate, altrimenti lo scostamento laterale resta tarato sulla
         finestra precedente. */
      appliedBias = 999;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      if (bloom) bloom.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    }

    /* ─────────────── Aggiornamento regia ─────────────── */
    function updateCamera(dt) {
      var idx = clamp(state.chapter | 0, 0, SHOTS.length - 1);
      var shot = SHOTS[idx];
      var p = clamp(state.progress, 0, 1);
      /* easing morbido sulla progressione interna al capitolo */
      var e = p * p * (3 - 2 * p);

      tgtPos.set(
        shot.pos[0] + shot.drift.pos[0] * e,
        shot.pos[1] + shot.drift.pos[1] * e,
        shot.pos[2] + shot.drift.pos[2] * e
      );
      tgtLook.set(
        shot.look[0] + shot.drift.look[0] * e,
        shot.look[1] + shot.drift.look[1] * e,
        shot.look[2] + shot.drift.look[2] * e
      );
      tgtFov = shot.fov + shot.drift.fov * e;
      tgtBias = shot.bias || 0;

      /* Parallasse del puntatore: piccolissima, serve solo a far sentire la
         scena "viva" quando la pagina è ferma. */
      pointer.x = damp(pointer.x, pointer.tx, 0.06, dt);
      pointer.y = damp(pointer.y, pointer.ty, 0.06, dt);
      tgtPos.x += pointer.x * 0.16;
      tgtPos.y += pointer.y * 0.12;

      /* Vibrazione motore: l'ampiezza cresce con i giri. Deve restare sotto
         la soglia del fastidio, è un accenno non un terremoto. */
      var shake = smooth.rpm * smooth.rpm * 0.0075;
      tgtPos.x += Math.sin(elapsed * 61.0) * shake;
      tgtPos.y += Math.sin(elapsed * 47.3 + 1.1) * shake;

      camPos.x = damp(camPos.x, tgtPos.x, 0.055, dt);
      camPos.y = damp(camPos.y, tgtPos.y, 0.055, dt);
      camPos.z = damp(camPos.z, tgtPos.z, 0.055, dt);
      camLook.x = damp(camLook.x, tgtLook.x, 0.07, dt);
      camLook.y = damp(camLook.y, tgtLook.y, 0.07, dt);
      camLook.z = damp(camLook.z, tgtLook.z, 0.07, dt);
      camFov = damp(camFov, tgtFov, 0.06, dt);
      camBias = damp(camBias, tgtBias, 0.05, dt);

      camera.position.copy(camPos);
      camera.lookAt(camLook);

      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      if (Math.abs(camera.fov - camFov) > 0.005 || Math.abs(camBias - appliedBias) > 0.0005) {
        camera.fov = camFov;
        appliedBias = camBias;
        /* Su schermi stretti il testo sta sopra la moto, non di fianco:
           lì lo scostamento laterale non serve e toglierebbe spazio. */
        var bias = w < 900 ? 0 : camBias;
        camera.setViewOffset(w, h, bias * w, 0, w, h);
        camera.updateProjectionMatrix();
      }
    }

    /* ─────────────── Aggiornamento moto ─────────────── */
    function updateBike(dt) {
      if (!bike) return;
      var parts = bike.parts || {};

      /* Ruote: al minimo restano ferme, poi la velocità di rotazione segue
         `speed`. 1 unità di speed ≈ 320 km/h ≈ 88.9 m/s; con r = 0.326 m
         sono ~272 rad/s, ben oltre il limite di campionamento a 60 fps —
         viene compressa perché a schermo conta la leggibilità, non l'esattezza. */
      var wheelSpeed = smooth.speed * 42 + smooth.rpm * 2.5;
      wheelAngle -= wheelSpeed * dt;
      if (parts.frontWheelSpin) parts.frontWheelSpin.rotation.z = wheelAngle;
      if (parts.rearWheelSpin) parts.rearWheelSpin.rotation.z = wheelAngle * 0.92;

      /* Sterzo: oscillazione lentissima, come una moto su cavalletto mossa
         appena dall'aria. Sul capitolo aerodinamica si allarga un po'. */
      if (parts.steering) {
        var steerAmp = state.chapter === 2 ? 0.075 : 0.03;
        parts.steering.rotation.y = Math.sin(elapsed * 0.42) * steerAmp;
      }

      /* Sospensioni: affondano con il gas e vibrano con i giri. */
      /* Escursione volutamente minima (max ~2 cm): serve a far respirare la
         moto, non a simulare una staccata. Positivo = compressione. */
      var squat = smooth.throttle * 0.020 + Math.sin(elapsed * 38) * smooth.rpm * 0.0015;
      if (parts.forkSlider) parts.forkSlider.position.y = squat * 0.5;
      if (parts.swingarm) parts.swingarm.rotation.z = -squat * 0.5;

      /* Rotazione della moto: continua nel capitolo livrea, altrimenti ferma. */
      var yawTarget = state.chapter === 5 ? bikeYaw + dt * 0.34 : 0;
      bikeYaw = state.chapter === 5 ? yawTarget : damp(bikeYaw, 0, 0.04, dt);
      bike.group.rotation.y = bikeYaw;

      /* Vista esplosa. */
      var ex = smooth.exploded;
      for (var i = 0; i < explodeData.length; i++) {
        var d = explodeData[i];
        d.obj.position.set(
          d.base.x + d.offset.x * ex,
          d.base.y + d.offset.y * ex,
          d.base.z + d.offset.z * ex
        );
      }

      /* Fari: si accendono entrando nell'ombra dei capitoli centrali. */
      var glow = 0.35 + smooth.rpm * 0.9;
      if (parts.emissiveMaterials) {
        for (var m = 0; m < parts.emissiveMaterials.length; m++) {
          var mat = parts.emissiveMaterials[m];
          if (mat && mat.emissiveIntensity !== undefined) mat.emissiveIntensity = glow;
        }
      }
    }

    /* ─────────────── Ciclo ─────────────── */
    function frame() {
      if (disposed) return;
      rafId = requestAnimationFrame(frame);
      if (!running) return;

      var dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;

      smooth.rpm = damp(smooth.rpm, state.rpm, 0.16, dt);
      smooth.throttle = damp(smooth.throttle, state.throttle, 0.22, dt);
      smooth.speed = damp(smooth.speed, state.speed, 0.06, dt);
      smooth.exploded = damp(smooth.exploded, state.exploded, 0.07, dt);

      updateCamera(dt);
      updateBike(dt);

      var fxState = {
        rpm: smooth.rpm, throttle: smooth.throttle, speed: smooth.speed,
        scroll: state.progress, time: elapsed, chapter: state.chapter
      };
      for (var k in fx) {
        if (fx[k] && typeof fx[k].update === 'function') {
          try { fx[k].update(dt, fxState); } catch (e) { fx[k].update = null; }
        }
      }

      if (lights) {
        lights.accentR.intensity = 5 + smooth.rpm * 5;
        lights.accentL.intensity = 3.5 + smooth.throttle * 3;
      }

      if (bloom) {
        bloom.matComposite.uniforms.uBloom.value = 0.55 + smooth.rpm * 0.35;
        bloom.render(scene, camera, elapsed);
      } else {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      }

      /* Degrado automatico: se si resta sotto i ~45 fps per due secondi,
         si spegne il bloom e si abbassa il pixel ratio una volta sola. */
      if (!perf.degraded) {
        perf.frames++; perf.accum += dt;
        if (perf.accum > 2) {
          var fps = perf.frames / perf.accum;
          if (fps < 45) {
            perf.degraded = true;
            if (bloom) { bloom.dispose(); bloom = null; }
            dpr = Math.min(dpr, 1.25);
            renderer.setPixelRatio(dpr);
            resize();
          }
          perf.frames = 0; perf.accum = 0;
        }
      }
    }

    /* ─────────────── API pubblica ─────────────── */

    function setState(next) {
      if (!next) return;
      if (typeof next.chapter === 'number') state.chapter = next.chapter;
      if (typeof next.progress === 'number') state.progress = clamp(next.progress, 0, 1);
      if (typeof next.rpm === 'number') state.rpm = clamp(next.rpm, 0, 1);
      if (typeof next.throttle === 'number') state.throttle = clamp(next.throttle, 0, 1);
      if (typeof next.speed === 'number') state.speed = clamp(next.speed, 0, 1);
      if (typeof next.exploded === 'number') state.exploded = clamp(next.exploded, 0, 1);
      if (next.paintColor) setPaint(next.paintColor);
    }

    function setPaint(hex) {
      if (!bike || !bike.parts || !bike.parts.bodyMaterials) return;
      if (state.paintColor === hex) return;
      state.paintColor = hex;
      var target = new THREE.Color(hex);
      var mats = bike.parts.bodyMaterials;
      for (var i = 0; i < mats.length; i++) {
        var mat = mats[i];
        if (!mat || !mat.color) continue;
        if (global.gsap) {
          global.gsap.to(mat.color, {
            r: target.r, g: target.g, b: target.b,
            duration: 0.9, ease: 'power2.inOut', overwrite: true
          });
        } else {
          mat.color.copy(target);
        }
      }
    }

    function onPointerMove(e) {
      var w = global.innerWidth || 1, h = global.innerHeight || 1;
      pointer.tx = (e.clientX / w) * 2 - 1;
      pointer.ty = -((e.clientY / h) * 2 - 1);
    }

    var resizeTimer = 0;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    }

    function start() {
      if (running) return;
      running = true;
      clock.getDelta();
      if (!rafId) frame();
      global.addEventListener('resize', onResize);
      global.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    function stop() { running = false; }

    function dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(rafId);
      global.removeEventListener('resize', onResize);
      global.removeEventListener('pointermove', onPointerMove);
      for (var k in fx) { if (fx[k] && fx[k].dispose) fx[k].dispose(); }
      if (bike && bike.dispose) bike.dispose();
      if (envRes && envRes.dispose) envRes.dispose();
      if (bloom) bloom.dispose();
      renderer.dispose();
    }

    /* Il ciclo parte subito ma in pausa: così il primo `start()` non paga
       il costo di avviare il rAF. */
    frame();

    return {
      build: build,
      start: start,
      stop: stop,
      setState: setState,
      dispose: dispose,
      resize: resize,
      renderer: renderer,
      scene: scene,
      camera: camera,
      getInfo: function () {
        return {
          triangles: renderer.info.render.triangles,
          calls: renderer.info.render.calls,
          quality: quality,
          bloom: !!bloom
        };
      }
    };
  }

  global.PanigaleScene = {
    isSupported: supportsWebGL,
    create: createScene
  };

})(window);
