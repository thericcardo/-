/*
 * PanigaleFX — atmospheric / particle / shader effects for the Ducati Panigale V4 site.
 *
 * Loaded as a classic <script> tag. Assigns exactly one global: window.PanigaleFX.
 * Every factory returns { object3d, update(dt, state), dispose() } so the host can do:
 *
 *     const fx = PanigaleFX.createExhaustSmoke(THREE, { origins: [...] });
 *     scene.add(fx.object3d);
 *     ... fx.update(dt, state) each frame ... fx.dispose() on teardown.
 *
 * World contract: 1 unit = 1 m, +X = forward, +Y = up, ground at y = 0, +Z = bike's left.
 * The bike occupies roughly x [-1.05, 1.05], y [0, 1.15], z [-0.36, 0.36].
 *
 * state = { rpm: 0..1, throttle: 0..1, speed: 0..1, scroll: 0..1, time: seconds }
 *
 * Target: three.js r160 (GLSL1 ShaderMaterial, SRGBColorSpace, no sRGBEncoding).
 */
(function (root) {
	'use strict';

	/* ------------------------------------------------------------------ *
	 * Shared GLSL chunks
	 * ------------------------------------------------------------------ */

	// Cheap 1D/3D hashes — used to re-randomise a particle every time it recycles.
	var GLSL_HASH = [
		'float hash11(float p){',
		'  p = fract(p * 0.1031);',
		'  p *= p + 33.33;',
		'  p *= p + p;',
		'  return fract(p);',
		'}',
		'vec3 hash31(float p){',
		'  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));',
		'  p3 += dot(p3, p3.yzx + 33.33);',
		'  return fract((p3.xxy + p3.yzz) * p3.zyx);',
		'}'
	].join('\n');

	// Compact 2D simplex noise (Ashima / Gustavson lineage) + 5-octave fbm.
	var GLSL_SIMPLEX = [
		'vec3 permute289(vec3 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }',
		'float snoise(vec2 v){',
		'  const vec4 C = vec4(0.211324865405187, 0.366025403784439,',
		'                     -0.577350269189626, 0.024390243902439);',
		'  vec2 i  = floor(v + dot(v, C.yy));',
		'  vec2 x0 = v - i + dot(i, C.xx);',
		'  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
		'  vec4 x12 = x0.xyxy + C.xxzz;',
		'  x12.xy -= i1;',
		'  i = mod(i, 289.0);',
		'  vec3 p = permute289( permute289( i.y + vec3(0.0, i1.y, 1.0))',
		'                     + i.x + vec3(0.0, i1.x, 1.0));',
		'  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);',
		'  m = m * m;',
		'  m = m * m;',
		'  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
		'  vec3 h = abs(x) - 0.5;',
		'  vec3 ox = floor(x + 0.5);',
		'  vec3 a0 = x - ox;',
		'  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);',
		'  vec3 g;',
		'  g.x  = a0.x * x0.x + h.x * x0.y;',
		'  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
		'  return 130.0 * dot(m, g);',
		'}',
		'float fbm(vec2 p){',
		'  float a = 0.5;',
		'  float s = 0.0;',
		'  for (int i = 0; i < 5; i++) {',
		'    s += a * snoise(p);',
		'    p = p * 2.03 + vec2(11.7, -5.3);',
		'    a *= 0.5;',
		'  }',
		'  return s;',
		'}'
	].join('\n');

	// Perspective-correct point sizing shared by every Points system.
	var GLSL_POINT_SIZE = [
		'float pointPixels(float worldSize, float viewZ, float projYY, float viewportH){',
		'  return clamp(worldSize * projYY * 0.5 * viewportH / max(-viewZ, 0.001), 0.0, 900.0);',
		'}'
	].join('\n');

	/* ------------------------------------------------------------------ *
	 * Small utilities (all allocation-free on the hot path)
	 * ------------------------------------------------------------------ */

	var _v2 = null;          // lazily created THREE.Vector2 scratch
	var _q = null;           // scratch quaternion
	var _pq = null;          // scratch parent quaternion

	function num(v, d) {
		return (typeof v === 'number' && isFinite(v)) ? v : d;
	}

	function clamp01(v) {
		return v < 0 ? 0 : (v > 1 ? 1 : v);
	}

	// Frame-rate independent exponential approach.
	function damp(current, target, lambda, dt) {
		var f = 1 - Math.exp(-lambda * dt);
		return current + (target - current) * (f > 1 ? 1 : (f < 0 ? 0 : f));
	}

	// A single reused state record — update() never allocates.
	var S = { rpm: 0, throttle: 0, speed: 0, scroll: 0, time: 0 };

	function readState(state) {
		if (!state) {
			S.rpm = 0; S.throttle = 0; S.speed = 0; S.scroll = 0; S.time = 0;
			return S;
		}
		S.rpm = clamp01(num(state.rpm, 0));
		S.throttle = clamp01(num(state.throttle, 0));
		S.speed = clamp01(num(state.speed, 0));
		S.scroll = clamp01(num(state.scroll, 0));
		S.time = num(state.time, 0);
		return S;
	}

	function isLow(opts) {
		return !!(opts && opts.quality === 'low');
	}

	// Particle budget helper: quarter the count on low quality.
	function budget(opts, high) {
		var n = Math.max(1, Math.floor(num(opts && opts.count, high)));
		return isLow(opts) ? Math.max(8, Math.round(n / 4)) : n;
	}

	function vec3From(THREE, v, x, y, z) {
		if (v && typeof v.x === 'number') return new THREE.Vector3(v.x, v.y, v.z);
		if (v && v.length === 3) return new THREE.Vector3(v[0], v[1], v[2]);
		return new THREE.Vector3(x, y, z);
	}

	/* ------------------------------------------------------------------ *
	 * Procedural textures
	 * ------------------------------------------------------------------ */

	function makeCanvas(size) {
		if (typeof document === 'undefined' || !document.createElement) return null;
		var c = document.createElement('canvas');
		c.width = size;
		c.height = size;
		return c;
	}

	// Fallback if there is no DOM (SSR / worker): a radial falloff DataTexture.
	function fallbackSprite(THREE, size, power) {
		var n = size * size;
		var data = new Uint8Array(n * 4);
		for (var y = 0; y < size; y++) {
			for (var x = 0; x < size; x++) {
				var dx = (x + 0.5) / size - 0.5;
				var dy = (y + 0.5) / size - 0.5;
				var r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
				var a = Math.pow(1 - r, power) * 255;
				var i = (y * size + x) * 4;
				data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
				data[i + 3] = a < 0 ? 0 : (a > 255 ? 255 : a);
			}
		}
		var tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
		tex.needsUpdate = true;
		return tex;
	}

	/**
	 * Soft round sprite via a canvas radial gradient.
	 * `stops` is an array of [offset, 'rgba(...)'].
	 */
	function makeRadialSprite(THREE, size, stops) {
		var canvas = makeCanvas(size);
		if (!canvas) return fallbackSprite(THREE, size, 3);
		var ctx = canvas.getContext('2d');
		var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, size, size);
		var tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.minFilter = THREE.LinearMipmapLinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
		tex.generateMipmaps = true;
		tex.needsUpdate = true;
		return tex;
	}

	function smokeSprite(THREE) {
		return makeRadialSprite(THREE, 128, [
			[0.00, 'rgba(255,255,255,0.90)'],
			[0.25, 'rgba(255,255,255,0.55)'],
			[0.55, 'rgba(255,255,255,0.20)'],
			[0.80, 'rgba(255,255,255,0.05)'],
			[1.00, 'rgba(255,255,255,0.00)']
		]);
	}

	function sparkSprite(THREE) {
		return makeRadialSprite(THREE, 64, [
			[0.00, 'rgba(255,255,255,1.00)'],
			[0.30, 'rgba(255,255,255,0.55)'],
			[0.65, 'rgba(255,255,255,0.12)'],
			[1.00, 'rgba(255,255,255,0.00)']
		]);
	}

	/**
	 * Brushed / streaked greyscale roughness map for the studio floor.
	 * Streaks run along U so, on a floor rotated -PI/2 about X, they run along world +X
	 * and smear reflections the way a polished cyclorama does.
	 */
	function makeFloorRoughness(THREE, size) {
		var canvas = makeCanvas(size);
		if (!canvas) {
			var tex0 = fallbackSprite(THREE, 8, 1);
			return tex0;
		}
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#6a6a6a';
		ctx.fillRect(0, 0, size, size);

		// Long horizontal brush strokes.
		var i, x, y;
		for (i = 0; i < 900; i++) {
			y = Math.random() * size;
			x = Math.random() * size;
			var w = 40 + Math.random() * (size * 0.9);
			var h = 0.6 + Math.random() * 2.4;
			var v = Math.random();
			var lum = Math.round(60 + v * 130);
			ctx.fillStyle = 'rgba(' + lum + ',' + lum + ',' + lum + ',' + (0.05 + Math.random() * 0.18) + ')';
			ctx.fillRect(x, y, w, h);
			if (x + w > size) ctx.fillRect(x - size, y, w, h); // wrap for seamless tiling
		}

		// Broad soft blotches: patches of duller and glossier finish.
		for (i = 0; i < 90; i++) {
			x = Math.random() * size;
			y = Math.random() * size;
			var r = size * (0.04 + Math.random() * 0.22);
			var g = ctx.createRadialGradient(x, y, 0, x, y, r);
			var bright = Math.random() > 0.5;
			var c = bright ? '255,255,255' : '0,0,0';
			g.addColorStop(0, 'rgba(' + c + ',' + (0.05 + Math.random() * 0.14) + ')');
			g.addColorStop(1, 'rgba(' + c + ',0)');
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		}

		// Fine grain so the specular never looks plastic.
		var img = ctx.getImageData(0, 0, size, size);
		var d = img.data;
		for (i = 0; i < d.length; i += 4) {
			var n = (Math.random() - 0.5) * 26;
			d[i] = Math.max(0, Math.min(255, d[i] + n));
			d[i + 1] = d[i];
			d[i + 2] = d[i];
			d[i + 3] = 255;
		}
		ctx.putImageData(img, 0, 0);

		var tex = new THREE.CanvasTexture(canvas);
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
		tex.minFilter = THREE.LinearMipmapLinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.anisotropy = 8;
		tex.needsUpdate = true;
		return tex;
	}

	/** Elliptical soft contact shadow. */
	function makeContactShadow(THREE, size) {
		var canvas = makeCanvas(size);
		if (!canvas) return fallbackSprite(THREE, size, 2);
		var ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, size, size);
		var cx = size / 2, cy = size / 2;

		// Broad ambient occlusion pool.
		var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
		g.addColorStop(0.00, 'rgba(0,0,0,0.62)');
		g.addColorStop(0.35, 'rgba(0,0,0,0.34)');
		g.addColorStop(0.70, 'rgba(0,0,0,0.09)');
		g.addColorStop(1.00, 'rgba(0,0,0,0.00)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, size, size);

		// Two tight, dark contact patches where the tyres meet the floor.
		var patch = function (px, radius, alpha) {
			var pg = ctx.createRadialGradient(px, cy, 0, px, cy, radius);
			pg.addColorStop(0.00, 'rgba(0,0,0,' + alpha + ')');
			pg.addColorStop(0.45, 'rgba(0,0,0,' + (alpha * 0.42) + ')');
			pg.addColorStop(1.00, 'rgba(0,0,0,0)');
			ctx.fillStyle = pg;
			ctx.beginPath();
			ctx.arc(px, cy, radius, 0, Math.PI * 2);
			ctx.fill();
		};
		patch(size * 0.24, size * 0.16, 0.95);
		patch(size * 0.76, size * 0.16, 0.95);

		var tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.minFilter = THREE.LinearMipmapLinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
		tex.needsUpdate = true;
		return tex;
	}

	/* ------------------------------------------------------------------ *
	 * Disposal helpers
	 * ------------------------------------------------------------------ */

	function disposeMaterial(mat) {
		if (!mat) return;
		if (Array.isArray(mat)) {
			for (var i = 0; i < mat.length; i++) disposeMaterial(mat[i]);
			return;
		}
		mat.dispose();
	}

	function disposeTree(obj) {
		if (!obj) return;
		obj.traverse(function (o) {
			if (o.geometry) o.geometry.dispose();
			if (o.material) disposeMaterial(o.material);
		});
		if (obj.parent) obj.parent.remove(obj);
	}

	function disposeTextures(list) {
		for (var i = 0; i < list.length; i++) {
			if (list[i] && list[i].dispose) list[i].dispose();
		}
		list.length = 0;
	}

	/**
	 * Feed a Points/Mesh shader the drawing-buffer height + aspect without the host
	 * having to pass a camera. onBeforeRender runs once per draw, no allocations.
	 */
	function attachViewport(THREE, mesh, uniforms) {
		if (!_v2) _v2 = new THREE.Vector2();
		mesh.onBeforeRender = function (renderer) {
			renderer.getDrawingBufferSize(_v2);
			if (uniforms.uViewportH) uniforms.uViewportH.value = _v2.y;
			if (uniforms.uAspect) uniforms.uAspect.value = _v2.y > 0 ? (_v2.x / _v2.y) : 1;
			if (uniforms.uResolution) uniforms.uResolution.value.set(_v2.x, _v2.y);
		};
	}

	/** Billboard a mesh to the camera at draw time (works under any parent transform). */
	function attachBillboard(THREE, mesh, extraBefore) {
		if (!_q) _q = new THREE.Quaternion();
		if (!_pq) _pq = new THREE.Quaternion();
		mesh.onBeforeRender = function (renderer, scene, camera) {
			if (extraBefore) extraBefore(renderer, scene, camera);
			_q.copy(camera.quaternion);
			if (mesh.parent) {
				mesh.parent.getWorldQuaternion(_pq);
				_pq.invert();
				_q.premultiply(_pq);
			}
			mesh.quaternion.copy(_q);
			mesh.updateMatrix();
			mesh.matrixWorld.multiplyMatrices(mesh.parent ? mesh.parent.matrixWorld : mesh.matrixWorld, mesh.matrix);
		};
	}

	/* ================================================================== *
	 * 9. createEnvironment — procedural studio HDRI via PMREMGenerator
	 * ================================================================== */

	function createEnvironment(THREE, renderer, opts) {
		opts = opts || {};

		var scene = new THREE.Scene();
		var owned = [];   // geometries + materials we must dispose after baking

		/* ---- gradient dome: dark floor -> warm horizon -> cool ceiling ---- */
		var domeGeo = new THREE.SphereGeometry(60, 48, 32);
		var domeMat = new THREE.ShaderMaterial({
			side: THREE.BackSide,
			depthWrite: false,
			depthTest: false,
			uniforms: {
				uFloor: { value: new THREE.Color(0.008, 0.009, 0.011) },
				uHorizon: { value: new THREE.Color(0.170, 0.108, 0.062) },
				uCeil: { value: new THREE.Color(0.048, 0.062, 0.095) },
				uIntensity: { value: num(opts.skyIntensity, 1.0) }
			},
			vertexShader: [
				'varying vec3 vDir;',
				'void main(){',
				'  vDir = normalize(position);',
				'  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
				'}'
			].join('\n'),
			fragmentShader: [
				'uniform vec3 uFloor;',
				'uniform vec3 uHorizon;',
				'uniform vec3 uCeil;',
				'uniform float uIntensity;',
				'varying vec3 vDir;',
				'void main(){',
				'  vec3 d = normalize(vDir);',
				'  float h = d.y;',
				// floor -> horizon -> ceiling
				'  vec3 col = mix(uFloor, uHorizon, smoothstep(-0.60, 0.04, h));',
				'  col = mix(col, uCeil, smoothstep(0.02, 0.78, h));',
				// broad warm glow ahead & above (the key light spill)
				'  float g = max(dot(d, normalize(vec3(0.55, 0.78, 0.0))), 0.0);',
				'  col += vec3(0.34, 0.22, 0.115) * pow(g, 5.0);',
				// broad cool glow behind (rim spill)
				'  float c = max(dot(d, normalize(vec3(-0.85, 0.30, -0.18))), 0.0);',
				'  col += vec3(0.055, 0.095, 0.185) * pow(c, 4.0);',
				// gentle banding so the dome is never a flat wash in a mirror finish
				'  col *= 1.0 + 0.055 * sin(d.y * 8.0 + d.x * 2.6) * (0.5 + 0.5 * d.y);',
				// darken hard toward the nadir so the floor reflection stays black
				'  col *= mix(0.35, 1.0, smoothstep(-0.9, -0.25, h));',
				'  gl_FragColor = vec4(max(col, vec3(0.0)) * uIntensity, 1.0);',
				'}'
			].join('\n')
		});
		var dome = new THREE.Mesh(domeGeo, domeMat);
		dome.renderOrder = -1;
		scene.add(dome);
		owned.push(domeGeo, domeMat);

		/* ---- softboxes: emissive rectangles with HDR (>1) colours ---- */
		var boxGeo = new THREE.PlaneGeometry(1, 1);
		owned.push(boxGeo);

		function softbox(w, h, px, py, pz, rx, ry, rz, r, g, b) {
			var mat = new THREE.MeshBasicMaterial({
				color: new THREE.Color(r, g, b),
				side: THREE.DoubleSide,
				toneMapped: false,
				fog: false
			});
			var m = new THREE.Mesh(boxGeo, mat);
			m.scale.set(w, h, 1);
			m.position.set(px, py, pz);
			m.rotation.set(rx, ry, rz);
			scene.add(m);
			owned.push(mat);
			return m;
		}

		var k = num(opts.lightIntensity, 1.0);
		var HP = Math.PI * 0.5;

		// (1) Big key: overhead & slightly forward, facing straight down.
		softbox(6.4, 4.4, 1.7, 4.9, 0.0, HP, 0, 0, 11.0 * k, 10.3 * k, 9.2 * k);

		// (2) Cool rim behind the bike, facing +X (into the tail).
		softbox(5.0, 3.4, -5.2, 2.5, -0.9, 0, HP, 0, 2.4 * k, 3.3 * k, 5.6 * k);

		// (3) & (4) Long strip lights down each flank — these are what draw the
		//     unbroken highlight line along a fairing and sell a bike render.
		softbox(10.5, 0.55, 0.05, 2.95, 3.05, -0.50, Math.PI, 0, 8.4 * k, 8.2 * k, 8.6 * k);
		softbox(10.5, 0.55, 0.05, 2.95, -3.05, 0.50, 0, 0, 8.4 * k, 8.2 * k, 8.6 * k);

		// (5) A second, higher and narrower strip on the左 side for a double
		//     highlight down the tank — subtle, half brightness.
		softbox(7.0, 0.28, -0.6, 4.1, 1.9, -0.85, Math.PI, 0, 4.2 * k, 4.0 * k, 4.4 * k);

		// (6) Low warm accent in front, kisses the front wheel and radiator.
		softbox(2.2, 1.1, 3.4, 0.85, 1.5, 0, -HP - 0.42, 0, 3.1 * k, 2.05 * k, 1.15 * k);

		// (7) Dim cool floor bounce card, keeps the underside from going pure black.
		softbox(9.0, 6.0, -0.2, 0.02, 0.0, -HP, 0, 0, 0.16 * k, 0.18 * k, 0.22 * k);

		/* ---- bake ---- */
		var pmrem = new THREE.PMREMGenerator(renderer);
		var rt = pmrem.fromScene(scene, num(opts.blur, 0.0), 0.1, 120);
		pmrem.dispose();

		// The baked cube-UV texture is all we keep; tear the source scene down.
		for (var i = 0; i < owned.length; i++) {
			if (owned[i] && owned[i].dispose) owned[i].dispose();
		}
		owned.length = 0;
		scene.clear();

		var disposed = false;
		return {
			texture: rt.texture,
			renderTarget: rt,
			// Not a display object, but keep the shape uniform for the host.
			object3d: null,
			update: function () {},
			dispose: function () {
				if (disposed) return;
				disposed = true;
				rt.dispose();
			}
		};
	}

	/* ================================================================== *
	 * 1. createHeatHaze
	 * ================================================================== */

	function createHeatHaze(THREE, opts) {
		opts = opts || {};
		var group = new THREE.Group();
		group.name = 'PanigaleFX.HeatHaze';

		var origin = vec3From(THREE, opts.origin, -0.62, 0.42, 0.0);
		var dir = vec3From(THREE, opts.direction, -1, 0.28, 0).normalize();
		var size = num(opts.size, 0.55);
		var quads = isLow(opts) ? 2 : 3;

		var uniformsList = [];
		var geo = new THREE.PlaneGeometry(1, 1, 1, 1);

		var vert = [
			'varying vec2 vUv;',
			'void main(){',
			'  vUv = uv;',
			'  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
			'}'
		].join('\n');

		var frag = [
			'uniform float uTime;',
			'uniform float uIntensity;',
			'uniform float uSeed;',
			'uniform vec3  uColor;',
			'uniform float uHasScene;',
			'uniform sampler2D uScene;',
			'uniform vec2  uResolution;',
			'varying vec2 vUv;',
			GLSL_SIMPLEX,
			'void main(){',
			'  vec2 uv = vUv;',
			// rising, stretched noise coordinate: hot air moves up and thins out
			'  vec2 p = vec2(uv.x * 3.2, uv.y * 2.0 - uTime * 0.62) + uSeed;',
			'  float n1 = fbm(p * 1.45);',
			'  float n2 = fbm(p * 3.30 + vec2(n1 * 0.75, -uTime * 0.40));',
			'  float shimmer = n1 * 0.62 + n2 * 0.38;',
			// soft oval envelope, strongest just above the outlet
			'  vec2 c = uv - vec2(0.5, 0.42);',
			'  float oval = 1.0 - smoothstep(0.16, 0.50, length(vec2(c.x * 1.12, c.y * 0.82)));',
			'  float rise = smoothstep(0.0, 0.22, uv.y) * (1.0 - smoothstep(0.42, 1.0, uv.y));',
			'  float env = oval * rise;',
			// turn the noise field into thin refraction-like ridges
			'  float ridge = 1.0 - clamp(abs(shimmer) * 1.45, 0.0, 1.0);',
			'  ridge = pow(ridge, 3.5);',
			'  float a = env * ridge * uIntensity;',
			'  if (a < 0.0025) discard;',
			'  if (uHasScene > 0.5) {',
			// true refraction path: warp the screen-space lookup by the noise gradient
			'    vec2 sUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));',
			'    vec2 warp = vec2(shimmer, n2) * 0.018 * env * uIntensity;',
			'    vec3 refr = texture2D(uScene, clamp(sUv + warp, vec2(0.001), vec2(0.999))).rgb;',
			'    gl_FragColor = vec4(refr + uColor * a * 0.35, clamp(env * uIntensity, 0.0, 1.0));',
			'  } else {',
			'    gl_FragColor = vec4(uColor * a, a);',
			'  }',
			'}'
		].join('\n');

		var i;
		for (i = 0; i < quads; i++) {
			var t = quads > 1 ? i / (quads - 1) : 0;
			var uniforms = {
				uTime: { value: 0 },
				uIntensity: { value: 0 },
				uSeed: { value: Math.random() * 40 },
				uColor: { value: new THREE.Color(opts.color !== undefined ? opts.color : 0xffd9b0) },
				uHasScene: { value: 0 },
				uScene: { value: null },
				uResolution: { value: new THREE.Vector2(1, 1) }
			};
			var mat = new THREE.ShaderMaterial({
				uniforms: uniforms,
				vertexShader: vert,
				fragmentShader: frag,
				transparent: true,
				depthWrite: false,
				depthTest: true,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide
			});
			var mesh = new THREE.Mesh(geo, mat);
			var s = size * (1.0 + t * 0.85);
			mesh.scale.set(s, s * 1.55, 1);
			mesh.position.copy(origin).addScaledVector(dir, size * (0.35 + t * 0.95));
			mesh.position.y += size * 0.42 * (0.4 + t);
			mesh.renderOrder = 12;
			attachBillboard(THREE, mesh, (function (u) {
				return function (renderer) {
					if (!_v2) _v2 = new THREE.Vector2();
					renderer.getDrawingBufferSize(_v2);
					u.uResolution.value.set(_v2.x, _v2.y);
				};
			})(uniforms));
			group.add(mesh);
			uniformsList.push(uniforms);
		}

		var elapsed = 0;
		var smoothRpm = 0;
		var disposed = false;

		return {
			object3d: group,
			/** Optional: give the haze the previous frame's colour buffer for real refraction. */
			setSceneTexture: function (tex) {
				for (var j = 0; j < uniformsList.length; j++) {
					uniformsList[j].uScene.value = tex || null;
					uniformsList[j].uHasScene.value = tex ? 1 : 0;
				}
			},
			update: function (dt, state) {
				dt = num(dt, 0.016);
				var st = readState(state);
				elapsed += dt;
				smoothRpm = damp(smoothRpm, st.rpm, 5.0, dt);
				var idle = 0.10;
				var intensity = idle + smoothRpm * 0.95 + st.throttle * 0.35;
				for (var j = 0; j < uniformsList.length; j++) {
					var u = uniformsList[j];
					u.uTime.value = elapsed * (0.75 + smoothRpm * 1.5);
					// far quads are weaker: the plume has already mixed with cold air
					u.uIntensity.value = intensity * (1.0 - j * 0.22);
				}
			},
			dispose: function () {
				if (disposed) return;
				disposed = true;
				for (var j = 0; j < group.children.length; j++) {
					group.children[j].onBeforeRender = function () {};
					disposeMaterial(group.children[j].material);
				}
				geo.dispose();
				if (group.parent) group.parent.remove(group);
				group.clear();
			}
		};
	}

	/* ================================================================== *
	 * Shared smoke system (used by exhaust smoke and tyre smoke)
	 * ================================================================== */

	function makeSmokeSystem(THREE, cfg) {
		var count = cfg.count;
		var origins = cfg.origins;

		var geo = new THREE.BufferGeometry();
		var pos = new Float32Array(count * 3);        // per-particle spawn origin
		var seed = new Float32Array(count * 3);
		var offset = new Float32Array(count);

		for (var i = 0; i < count; i++) {
			var o = origins[i % origins.length];
			pos[i * 3 + 0] = o.x;
			pos[i * 3 + 1] = o.y;
			pos[i * 3 + 2] = o.z;
			seed[i * 3 + 0] = Math.random();
			seed[i * 3 + 1] = Math.random();
			seed[i * 3 + 2] = Math.random();
			// evenly spread phases so emission is a steady stream, not pulses
			offset[i] = (i + Math.random() * 0.85) / count;
		}
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
		geo.setAttribute('aOffsetTime', new THREE.BufferAttribute(offset, 1));
		geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cfg.boundsCenter[0], cfg.boundsCenter[1], cfg.boundsCenter[2]), cfg.boundsRadius);

		var sprite = smokeSprite(THREE);

		var uniforms = {
			uTime: { value: 0 },
			uEmit: { value: 0.25 },
			uLife: { value: cfg.life },
			uSpeed: { value: cfg.speed },
			uRise: { value: cfg.rise },
			uTurb: { value: cfg.turb },
			uSpread: { value: cfg.spread },
			uSize: { value: cfg.size },
			uGrow: { value: cfg.grow },
			uOpacity: { value: cfg.opacity },
			uDir: { value: new THREE.Vector3(cfg.dir[0], cfg.dir[1], cfg.dir[2]) },
			uColorHot: { value: new THREE.Color(cfg.colorHot) },
			uColorCool: { value: new THREE.Color(cfg.colorCool) },
			uMap: { value: sprite },
			uViewportH: { value: 800 },
			uGround: { value: cfg.ground },
			uWind: { value: 0 }
		};

		var vert = [
			'attribute vec3 aSeed;',
			'attribute float aOffsetTime;',
			'uniform float uTime, uEmit, uLife, uSpeed, uRise, uTurb, uSpread;',
			'uniform float uSize, uGrow, uViewportH, uGround, uWind;',
			'uniform vec3 uDir;',
			'varying float vAlpha;',
			'varying float vLife;',
			'varying float vRot;',
			'varying float vRand;',
			GLSL_HASH,
			GLSL_POINT_SIZE,
			'void main(){',
			'  float phase = uTime / uLife + aOffsetTime;',
			'  float t = fract(phase);',
			'  float cycle = floor(phase);',
			// re-randomise every recycle so the stream never visibly loops
			'  vec3 r = hash31(aSeed.x * 91.7 + aSeed.y * 13.3 + cycle * 7.13);',
			'  float gate = hash11(aSeed.z * 57.1 + cycle * 3.77);',
			'  vRand = r.x;',
			'  vLife = t;',
			'  if (gate > uEmit) {',           // emission-rate gating
			'    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
			'    gl_PointSize = 0.0;',
			'    vAlpha = 0.0;',
			'    return;',
			'  }',
			'  vec3 p = position;',
			// initial jet velocity along uDir, decaying (integral of exp decay)
			'  float ease = 1.0 - exp(-3.1 * t);',
			'  p += uDir * (uSpeed * (0.65 + 0.7 * r.x) * ease);',
			// buoyancy: accelerates upward as the plume expands
			'  p.y += uRise * t * t * (0.7 + 0.6 * r.y);',
			// drift + curl-ish turbulence
			'  float a1 = r.x * 6.2831;',
			'  float a2 = r.y * 6.2831;',
			'  p.x += sin(t * 3.3 + a1) * uTurb * t + uWind * t * t;',
			'  p.z += cos(t * 2.6 + a2) * uTurb * t + (r.z - 0.5) * uSpread;',
			'  p.y += sin(t * 4.7 + a2 * 1.7) * uTurb * 0.45 * t;',
			// never sink through the floor
			'  p.y = max(p.y, uGround);',
			'  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
			'  float sz = uSize * (0.30 + t * uGrow) * (0.65 + 0.75 * r.z);',
			'  gl_PointSize = pointPixels(sz, mv.z, projectionMatrix[1][1], uViewportH);',
			'  vRot = (r.z - 0.5) * 6.2831 + t * (r.x - 0.5) * 2.2;',
			'  float fadeIn  = smoothstep(0.0, 0.09, t);',
			'  float fadeOut = 1.0 - smoothstep(0.28, 1.0, t);',
			'  vAlpha = fadeIn * fadeOut * fadeOut;',
			'  gl_Position = projectionMatrix * mv;',
			'}'
		].join('\n');

		var frag = [
			'uniform sampler2D uMap;',
			'uniform vec3 uColorHot;',
			'uniform vec3 uColorCool;',
			'uniform float uOpacity;',
			'varying float vAlpha;',
			'varying float vLife;',
			'varying float vRot;',
			'varying float vRand;',
			'void main(){',
			'  vec2 c = gl_PointCoord - 0.5;',
			'  float s = sin(vRot), co = cos(vRot);',
			'  vec2 uv = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + 0.5;',
			'  vec4 tex = texture2D(uMap, uv);',
			'  float a = tex.a * vAlpha * uOpacity;',
			'  if (a < 0.004) discard;',
			// hot near the outlet, cooling to grey as it ages and mixes
			'  vec3 col = mix(uColorHot, uColorCool, smoothstep(0.0, 0.42, vLife));',
			'  col *= 0.78 + 0.44 * vRand;',
			'  gl_FragColor = vec4(col, a);',
			'}'
		].join('\n');

		var mat = new THREE.ShaderMaterial({
			uniforms: uniforms,
			vertexShader: vert,
			fragmentShader: frag,
			transparent: true,
			depthWrite: false,
			depthTest: true,
			blending: THREE.NormalBlending
		});

		var points = new THREE.Points(geo, mat);
		points.frustumCulled = false;
		points.renderOrder = 10;
		attachViewport(THREE, points, uniforms);

		return { points: points, geo: geo, mat: mat, uniforms: uniforms, sprite: sprite, count: count };
	}

	/* ================================================================== *
	 * 2. createExhaustSmoke
	 * ================================================================== */

	function createExhaustSmoke(THREE, opts) {
		opts = opts || {};
		var group = new THREE.Group();
		group.name = 'PanigaleFX.ExhaustSmoke';

		var origins = [];
		if (Array.isArray(opts.origins) && opts.origins.length) {
			for (var i = 0; i < opts.origins.length; i++) {
				origins.push(vec3From(THREE, opts.origins[i], -0.62, 0.42, 0));
			}
		} else {
			// Panigale V4: twin under-tail outlets, slightly off centre.
			origins.push(new THREE.Vector3(-0.66, 0.44, 0.11));
			origins.push(new THREE.Vector3(-0.66, 0.44, -0.11));
		}

		var count = budget(opts, 340);

		var sys = makeSmokeSystem(THREE, {
			count: count,
			origins: origins,
			life: 2.35,
			speed: 1.55,
			rise: 0.95,
			turb: 0.26,
			spread: 0.10,
			size: 0.62,
			grow: 1.75,
			opacity: 0.46,
			dir: [-1, 0.14, 0],
			ground: 0.02,
			colorHot: 0xb9b2ad,
			colorCool: 0x59585c,
			boundsCenter: [-2.2, 1.2, 0],
			boundsRadius: 4.5
		});
		group.add(sys.points);

		var elapsed = 0;
		var smoothThrottle = 0;
		var disposed = false;

		return {
			object3d: group,
			update: function (dt, state) {
				dt = num(dt, 0.016);
				var st = readState(state);
				elapsed += dt;
				smoothThrottle = damp(smoothThrottle, st.throttle, 6.5, dt);
				var u = sys.uniforms;
				// clock speeds up under load so the plume actually looks pressurised
				u.uTime.value = elapsed * (0.55 + smoothThrottle * 0.9 + st.rpm * 0.35);
				u.uEmit.value = 0.10 + smoothThrottle * 0.85;
				u.uSpeed.value = 1.05 + smoothThrottle * 2.3;
				u.uOpacity.value = 0.20 + smoothThrottle * 0.42;
				// forward speed drags the plume further behind the bike
				u.uWind.value = -st.speed * 1.4;
			},
			dispose: function () {
				if (disposed) return;
				disposed = true;
				sys.points.onBeforeRender = function () {};
				sys.geo.dispose();
				sys.mat.dispose();
				sys.sprite.dispose();
				if (group.parent) group.parent.remove(group);
				group.clear();
			},
			particleCount: count
		};
	}

	/* ================================================================== *
	 * 4. createTyreSmoke
	 * ================================================================== */

	function createTyreSmoke(THREE, opts) {
		opts = opts || {};
		var group = new THREE.Group();
		group.name = 'PanigaleFX.TyreSmoke';

		var origin = vec3From(THREE, opts.origin, -0.72, 0.03, 0.0);
		var origins = [
			origin,
			new THREE.Vector3(origin.x - 0.06, origin.y, origin.z + 0.07),
			new THREE.Vector3(origin.x - 0.06, origin.y, origin.z - 0.07)
		];

		var count = budget(opts, 300);

		var sys = makeSmokeSystem(THREE, {
			count: count,
			origins: origins,
			life: 3.4,           // slower: rubber smoke hangs
			speed: 1.15,
			rise: 0.62,
			turb: 0.34,
			spread: 0.22,
			size: 0.85,          // denser, fatter puffs
			grow: 2.4,
			opacity: 0.5,
			dir: [-1, 0.06, 0],
			ground: 0.05,
			colorHot: 0x8f8d92,
			colorCool: 0x46464b, // greyer than exhaust smoke
			boundsCenter: [-2.6, 1.0, 0],
			boundsRadius: 5.0
		});
		group.add(sys.points);

		var elapsed = 0;
		var smoothThrottle = 0;
		var disposed = false;

		return {
			object3d: group,
			update: function (dt, state) {
				dt = num(dt, 0.016);
				var st = readState(state);
				elapsed += dt;
				// wheelspin: needs throttle AND grip loss (low speed, high throttle)
				var spin = st.throttle * (0.45 + 0.55 * (1.0 - st.speed * 0.6));
				smoothThrottle = damp(smoothThrottle, spin, 4.0, dt);
				var u = sys.uniforms;
				u.uTime.value = elapsed * (0.42 + smoothThrottle * 0.55);
				u.uEmit.value = Math.max(0, smoothThrottle - 0.06) * 1.05;
				u.uSpeed.value = 0.75 + smoothThrottle * 1.9;
				u.uOpacity.value = 0.16 + smoothThrottle * 0.58;
				u.uWind.value = -st.speed * 2.0;
			},
			dispose: function () {
				if (disposed) return;
				disposed = true;
				sys.points.onBeforeRender = function () {};
				sys.geo.dispose();
				sys.mat.dispose();
				sys.sprite.dispose();
				if (group.parent) group.parent.remove(group);
				group.clear();
			},
			particleCount: count
		};
	}

	/* ================================================================== *
	 * 3. createSparks
	 * ================================================================== */

	function createSparks(THREE, opts) {
		opts = opts || {};
		var group = new THREE.Group();
		group.name = 'PanigaleFX.Sparks';

		var origin = vec3From(THREE, opts.origin, -0.68, 0.40, 0.0);
		var spread = num(opts.spread, 0.16);
		var streamCount = budget(opts, 260);
		var burstCount = isLow(opts) ? 120 : 420;
		var life = num(opts.life, 0.85);

		var sprite = sparkSprite(THREE);
		var textures = [sprite];

		/* ---- shared shader source (stream + burst differ only in timing) ---- */
		var commonVertHead = [
			'attribute vec3 aSeed;',
			'uniform float uTime, uLife, uSpeed, uGravity, uSize, uViewportH, uAspect, uStretch;',
			'varying float vAlpha;',
			'varying float vLife;',
			'varying vec2  vDir;',
			'varying float vStretch;',
			'varying float vFlicker;',
			GLSL_HASH,
			GLSL_POINT_SIZE,
			// ballistic launch direction from a seed: a cone biased backwards & up
			'vec3 launchDir(vec3 r){',
			'  float az = r.x * 6.2831;',
			'  float el = mix(-0.15, 1.15, r.y * r.y);',
			'  vec3 d = vec3(-cos(el), sin(el), 0.0);',
			'  float s = sin(az) * 0.55, c = cos(az);',
			'  return normalize(vec3(d.x * (0.55 + 0.45 * c), d.y, s));',
			'}',
			// shared body: given spawn point, life fraction t and randoms, emit the point
			'void emitSpark(vec3 spawn, float t, vec3 r, float speedScale){',
			'  vec3 dir = launchDir(r);',
			'  float v0 = uSpeed * (0.45 + 1.05 * r.z) * speedScale;',
			'  float tt = t * uLife;',
			'  vec3 p = spawn + dir * (v0 * tt) + vec3(0.0, -0.5 * uGravity * tt * tt, 0.0);',
			// crude bounce off the floor so sparks skitter instead of sinking
			'  if (p.y < 0.012) { p.y = 0.012 + abs(sin(tt * 22.0 + r.x * 9.0)) * 0.02 * (1.0 - t); }',
			'  vec3 vel = dir * v0 + vec3(0.0, -uGravity * tt, 0.0);',
			'  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
			'  vec4 mv2 = modelViewMatrix * vec4(p + vel * 0.02, 1.0);',
			'  vec4 c1 = projectionMatrix * mv;',
			'  vec4 c2 = projectionMatrix * mv2;',
			'  vec2 s1 = c1.xy / max(abs(c1.w), 0.0001);',
			'  vec2 s2 = c2.xy / max(abs(c2.w), 0.0001);',
			'  vec2 d2 = (s2 - s1) * vec2(uAspect, 1.0);',
			'  float dl = length(d2);',
			'  vDir = dl > 0.00001 ? d2 / dl : vec2(1.0, 0.0);',
			'  vStretch = 1.0 + clamp(dl * uStretch, 0.0, 5.0);',
			'  float sz = uSize * (0.5 + 0.9 * r.y) * (1.0 - 0.45 * t);',
			'  gl_PointSize = pointPixels(sz * vStretch, mv.z, projectionMatrix[1][1], uViewportH);',
			'  vLife = t;',
			'  vFlicker = 0.55 + 0.45 * sin(uTime * 47.0 + r.x * 61.0 + r.z * 23.0);',
			'  vAlpha = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.45, 1.0, t));',
			'  gl_Position = c1;',
			'}'
		].join('\n');

		var frag = [
			'uniform sampler2D uMap;',
			'uniform vec3 uHot;',
			'uniform vec3 uCool;',
			'uniform float uBrightness;',
			'varying float vAlpha;',
			'varying float vLife;',
			'varying vec2  vDir;',
			'varying float vStretch;',
			'varying float vFlicker;',
			'void main(){',
			'  if (vAlpha <= 0.0) discard;',
			'  vec2 c = gl_PointCoord - 0.5;',
			// rotate into streak space, then squash along the velocity axis
			'  vec2 d = vDir;',
			'  vec2 q = vec2(dot(c, d), dot(c, vec2(-d.y, d.x)));',
			'  q.x /= max(vStretch, 1.0);',
			'  float r = length(q) * 2.0;',
			'  if (r > 1.0) discard;',
			'  float core = texture2D(uMap, q + 0.5).a;',
			'  float glow = exp(-r * r * 3.4);',
			'  float a = (core * 0.75 + glow * 0.55) * vAlpha * vFlicker;',
			// white-hot -> orange -> deep red as it cools
			'  vec3 col = mix(uHot, uCool, pow(vLife, 0.55));',
			'  col = mix(col, vec3(0.42, 0.05, 0.01), smoothstep(0.6, 1.0, vLife));',
			'  col += vec3(0.55, 0.42, 0.30) * pow(1.0 - r, 6.0) * (1.0 - vLife);',
			'  gl_FragColor = vec4(col * uBrightness * a, a);',
			'}'
		].join('\n');

		function makeUniforms(size, speed) {
			return {
				uTime: { value: 0 },
				uLife: { value: life },
				uSpeed: { value: speed },
				uGravity: { value: num(opts.gravity, 7.4) },
				uSize: { value: size },
				uEmit: { value: 0 },
				uStretch: { value: 26.0 },
				uBrightness: { value: 1.0 },
				uHot: { value: new THREE.Color(1.0, 0.97, 0.86) },
				uCool: { value: new THREE.Color(1.0, 0.34, 0.05) },
				uMap: { value: sprite },
				uViewportH: { value: 800 },
				uAspect: { value: 1.777 }
			};
		}

		/* ---- continuous stream ---- */
		var sGeo = new THREE.BufferGeometry();
		var sPos = new Float32Array(streamCount * 3);
		var sSeed = new Float32Array(streamCount * 3);
		var sOff = new Float32Array(streamCount);
		var i;
		for (i = 0; i < streamCount; i++) {
			sPos[i * 3 + 0] = origin.x + (Math.random() - 0.5) * spread * 0.5;
			sPos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * spread * 0.4;
			sPos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * spread;
			sSeed[i * 3 + 0] = Math.random();
			sSeed[i * 3 + 1] = Math.random();
			sSeed[i * 3 + 2] = Math.random();
			sOff[i] = (i + Math.random()) / streamCount;
		}
		sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
		sGeo.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 3));
		sGeo.setAttribute('aOffsetTime', new THREE.BufferAttribute(sOff, 1));
		sGeo.boundingSphere = new THREE.Sphere(origin.clone(), 6);

		var streamUniforms = makeUniforms(num(opts.size, 0.055), num(opts.speed, 3.2));
		streamUniforms.uEmit.value = 0;

		var streamVert = [
			commonVertHead,
			'attribute float aOffsetTime;',
			'uniform float uEmit;',
			'void main(){',
			'  float phase = uTime / uLife + aOffsetTime;',
			'  float t = fract(phase);',
			'  float cycle = floor(phase);',
			'  vec3 r = hash31(aSeed.x * 71.3 + aSeed.y * 17.9 + cycle * 5.31);',
			'  float gate = hash11(aSeed.z * 43.7 + cycle * 9.11);',
			'  if (gate > uEmit) {',
			'    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
			'    gl_PointSize = 0.0;',
			'    vAlpha = 0.0;',
			'    return;',
			'  }',
			'  emitSpark(position, t, r, 1.0);',
			'}'
		].join('\n');

		var streamMat = new THREE.ShaderMaterial({
			uniforms: streamUniforms,
			vertexShader: streamVert,
			fragmentShader: frag,
			transparent: true,
			depthWrite: false,
			depthTest: true,
			blending: THREE.AdditiveBlending
		});
		var streamPoints = new THREE.Points(sGeo, streamMat);
		streamPoints.frustumCulled = false;
		streamPoints.renderOrder = 14;
		attachViewport(THREE, streamPoints, streamUniforms);
		group.add(streamPoints);

		/* ---- one-shot burst pool ---- */
		var bGeo = new THREE.BufferGeometry();
		var bPos = new Float32Array(burstCount * 3);
		var bSeed = new Float32Array(burstCount * 3);
		var bTime = new Float32Array(burstCount);
		for (i = 0; i < burstCount; i++) {
			bPos[i * 3 + 0] = origin.x;
			bPos[i * 3 + 1] = origin.y;
			bPos[i * 3 + 2] = origin.z;
			bSeed[i * 3 + 0] = Math.random();
			bSeed[i * 3 + 1] = Math.random();
			bSeed[i * 3 + 2] = Math.random();
			bTime[i] = -1000;   // long dead
		}
		var bPosAttr = new THREE.BufferAttribute(bPos, 3);
		var bSeedAttr = new THREE.BufferAttribute(bSeed, 3);
		var bTimeAttr = new THREE.BufferAttribute(bTime, 1);
		bPosAttr.setUsage(THREE.DynamicDrawUsage);
		bSeedAttr.setUsage(THREE.DynamicDrawUsage);
		bTimeAttr.setUsage(THREE.DynamicDrawUsage);
		bGeo.setAttribute('position', bPosAttr);
		bGeo.setAttribute('aSeed', bSeedAttr);
		bGeo.setAttribute('aBirth', bTimeAttr);
		bGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 12);

		var burstUniforms = makeUniforms(num(opts.size, 0.055) * 1.15, num(opts.speed, 3.2) * 1.5);
		burstUniforms.uBrightness.value = 1.35;

		var burstVert = [
			commonVertHead,
			'attribute float aBirth;',
			'void main(){',
			'  float age = uTime - aBirth;',
			'  float t = age / uLife;',
			'  if (t < 0.0 || t >= 1.0) {',
			'    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
			'    gl_PointSize = 0.0;',
			'    vAlpha = 0.0;',
			'    return;',
			'  }',
			'  vec3 r = hash31(aSeed.x * 83.1 + aSeed.y * 29.7 + aSeed.z * 11.3);',
			'  emitSpark(position, t, r, 1.0 + r.z * 0.6);',
			'}'
		].join('\n');

		var burstMat = new THREE.ShaderMaterial({
			uniforms: burstUniforms,
			vertexShader: burstVert,
			fragmentShader: frag,
			transparent: true,
			depthWrite: false,
			depthTest: true,
			blending: THREE.AdditiveBlending
		});
		var burstPoints = new THREE.Points(bGeo, burstMat);
		burstPoints.frustumCulled = false;
		burstPoints.renderOrder = 15;
		attachViewport(THREE, burstPoints, burstUniforms);
		group.add(burstPoints);

		var elapsed = 0;
		var cursor = 0;
		var smoothT = 0;
		var disposed = false;

		return {
			object3d: group,
			/** One-shot shower of `count` sparks at `position` (Vector3 / {x,y,z} / omitted). */
			burst: function (count, position) {
				count = Math.max(1, Math.min(burstCount, Math.floor(num(count, 40))));
				var px = origin.x, py = origin.y, pz = origin.z;
				if (position) {
					px = num(position.x, px);
					py = num(position.y, py);
					pz = num(position.z, pz);
				}
				var now = burstUniforms.uTime.value;
				for (var j = 0; j < count; j++) {
					var idx = cursor % burstCount;
					cursor++;
					bPos[idx * 3 + 0] = px + (Math.random() - 0.5) * spread;
					bPos[idx * 3 + 1] = py + (Math.random() - 0.5) * spread * 0.6;
					bPos[idx * 3 + 2] = pz + (Math.random() - 0.5) * spread;
					bSeed[idx * 3 + 0] = Math.random();
					bSeed[idx * 3 + 1] = Math.random();
					bSeed[idx * 3 + 2] = Math.random();
					// stagger births slightly so the shower isn't a single pop
					bTime[idx] = now - Math.random() * 0.06;
				}
				bPosAttr.needsUpdate = true;
				bSeedAttr.needsUpdate = true;
				bTimeAttr.needsUpdate = true;
			},
			update: function (dt, state) {
				dt = num(dt, 0.016);
				var st = readState(state);
				elapsed += dt;
				smoothT = damp(smoothT, st.throttle * st.throttle, 9.0, dt);
				streamUniforms.uTime.value = elapsed;
				burstUniforms.uTime.value = elapsed;
				streamUniforms.uEmit.value = Math.max(0, smoothT * 0.55 + st.rpm * 0.12 - 0.05);
				streamUniforms.uSpeed.value = 2.4 + st.rpm * 3.4;
				streamUniforms.uBrightness.value = 0.9 + st.rpm * 0.9;
			},
			dispose: function () {
				if (disposed) return;
				disposed = true;
				streamPoints.onBeforeRender = function () {};
				burstPoints.onBeforeRender = function () {};
				sGeo.dispose();
				bGeo.dispose();
				streamMat.dispose();
				burstMat.dispose();
				disposeTextures(textures);
				if (group.parent) group.parent.remove(group);
				group.clear();
			},
			particleCount: streamCount + burstCount
		};
	}

	/* ================================================================== *
	 * 5. createSpeedLines
	 * ================================================================== */

	function createSpeedLines(THREE, opts) {
		opts = opts || {};
		var group = new THREE.Group();
		group.name = 'PanigaleFX.SpeedLines';

		var count = budget(opts, 260);

		var base = new THREE.BoxGeometry(1, 1, 1);
		var geo = new THREE.InstancedBufferGeometry();
		geo.copy(base);
		base.dispose();
		geo.instanceCount = count;

		var seeds = new Float32Array(count * 4);
		var phase = new Float32Array(count);
		for (var i = 0; i < count; i++) {
			seeds[i * 4 + 0] = Math.random();            // azimuth around the tube
			seeds[i * 4 + 1] = Math.pow(Math.random(), 0.65); // radius (biased outward)
			seeds[i * 4 + 2] = Math.random();            // speed / length variance
			seeds[i * 4 + 3] = Math.random();            // density gate
			phase[i] = Math.random();
		}
		geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
		geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
		geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 30);

		var uniforms = {
			uTime: { value: 0 },
			uSpeed: { value: 0 },
			uDensity: { value: 0 },
			uLength: { value: num(opts.length, 3.6) },
			uThick: { value: num(opts.thickness, 0.016) },
			uRadius: { value: num(opts.radius, 5.2) },
			uInner: { value: num(opts.innerRadius, 0.85) },
			uCenterY: { value: num(opts.centerY, 0.95) },
			uStartX: { value: num(opts.startX, 16.0) },
			uEndX: { value: num(opts.endX, -18.0) },
			uColorA: { value: new THREE.Color(opts.colorA !== undefined ? opts.colorA : 0xffffff) },
			uColorB: { value: new THREE.Color(opts.colorB !== undefined ? opts.colorB : 0xff5a1e) },
			uOpacity: { value: 0 }
		};

		var vert = [
			'attribute vec4 aSeed;',
			'attribute float aPhase;',
			'uniform float uTime, uSpeed, uDensity, uLength, uThick;',
			'uniform float uRadius, uInner, uCenterY, uStartX, uEndX;',
			'varying float vFade;',
			'varying float vAlong;',
			'varying float vTint;',
			'void main(){',
			'  if (aSeed.w > uDensity) {',
			'    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
			'    vFade = 0.0; vAlong = 0.0; vTint = 0.0;',
			'    return;',
			'  }',
			'  float sp = 0.55 + aSeed.z * 1.05;',
			'  float t = fract(aPhase + uTime * (0.10 + uSpeed * 1.55) * sp);',
			'  float x = mix(uStartX, uEndX, t);',
			'  float ang = aSeed.x * 6.28318;',
			'  float rad = uInner + aSeed.y * uRadius;',
			'  vec3 center = vec3(x, uCenterY + sin(ang) * rad * 0.62, cos(ang) * rad);',
			// stretch along X: this is the direction of travel, so it reads as motion
			'  float len = uLength * (0.22 + uSpeed * 1.85) * (0.45 + aSeed.z);',
			'  vec3 p = position;',
			'  vAlong = p.x + 0.5;',
			'  p.x *= len;',
			'  p.y *= uThick * (0.6 + aSeed.z);',
			'  p.z *= uThick * (0.6 + aSeed.z);',
			'  vec3 world = center + p;',
			'  vFade = smoothstep(0.0, 0.10, t) * (1.0 - smoothstep(0.78, 1.0, t));',
			'  vTint = aSeed.y;',
			'  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);',
			'}'
		].join('\n');

		var frag = [
			'uniform vec3 uColorA;',
			'uniform vec3 uColorB;',
			'uniform float uOpacity;',
			'varying float vFade;',
			'varying float vAlong;',
			'varying float vTint;',
			'void main(){',
			'  if (vFade <= 0.0) discard;',
			// taper both ends of the streak so it has no hard caps
			'  float taper = sin(clamp(vAlong, 0.0, 1.0) * 3.14159);',
			'  taper = pow(taper, 1.6);',
			// head of the streak is hottest
			'  float head = pow(clamp(vAlong, 0.0, 1.0), 2.5);',
			'  vec3 col = mix(uColorB, uColorA, head * 0.85 + 0.15);',
			'  float a = taper * vFade * uOpacity * (0.35 + 0.65 * (1.0 - vTint));',
			'  if (a < 0.003) discard;',
			'  gl_FragColor = vec4(col * a, a);',
			'}'
		].join('\n');

		var mat = new THREE.ShaderMaterial({
			uniforms: uniforms,
			vertexShader: vert,
			fragmentShader: frag,
			transparent: true,
			depthWrite: false,
			depthTest: true,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide
		});

		var mesh = new THREE.Mesh(geo, mat);
		mesh.frustumCulled = false;
		mesh.renderOrder = 9;
		group.add(mesh);

		var elapsed = 0;
		var smoothSpeed = 0;
		var disposed = false;

		return {
			object3d: group,
			update: function (dt, state) {
				dt = num(dt, 0.016);
				var st = readState(state);
				smoothSpeed = damp(smoothSpeed, st.speed, 3.2, dt);
				elapsed += dt * (0.3 + smoothSpeed * 1.4);
				uniforms.uTime.value = elapsed;
				uniforms.uSpeed.value = smoothSpeed;
				uniforms.uDensity.value = smoothSpeed * 1.05;
				uniforms.uOpacity.value = Math.min(1, smoothSpeed * 1.5) * 0.85;
			},
			dispose: function () {
				if (disposed) return;
				disposed = true;
				geo.dispose();
				mat.dispose();
				if (group.parent) group.parent.remove(group);
				group.clear();
			},
			particleCount: count
		};
	}

	/* ================================================================== *
	 * 6. createGroundPlane
	 * ================================================================== */

	function createGroundPlane(THREE, opts) {
		opts = opts || {};
		var group = new THREE.Group();
		group.name = 'PanigaleFX.Ground';

		var size = num(opts.size, 90);
		var textures = [];
		var low = isLow(opts);

		/* ---- (a) polished studio floor ---- */
		var floorGeo = new THREE.PlaneGeometry(size, size, 1, 1);
		var roughTex = makeFloorRoughness(THREE, low ? 256 : 512);
		roughTex.repeat.set(6, 6);
		textures.push(roughTex);

		var floorMat = new THREE.MeshStandardMaterial({
			color: new THREE.Color(opts.color !== undefined ? opts.color : 0x08090b),
			roughness: num(opts.roughness, 0.42),
			metalness: num(opts.metalness, 0.62),
			roughnessMap: roughTex,
			envMapIntensity: num(opts.envMapIntensity, 1.0)
		});
		var floor = new THREE.Mesh(floorGeo, floorMat);
		floor.rotation.x = -Math.PI / 2;
		floor.receiveShadow = true;
		floor.renderOrder = 0;
		group.add(floor);

		/* ---- (b) fake contact shadow ---- */
		var shadowTex = makeContactShadow(THREE, 256);
		textures.push(shadowTex);
		var shadowGeo = new THREE.PlaneGeometry(1, 1);
		var shadowMat = new THREE.MeshBasicMaterial({
			map: shadowTex,
			transparent: true,
			depthWrite: false,
			opacity: num(opts.shadowOpacity, 0.95),
			color: 0x000000,
			blending: THREE.NormalBlending
		});
		var shadow = new THREE.Mesh(shadowGeo, shadowMat);
		shadow.rotation.x = -Math.PI / 2;
		shadow.position.y = 0.004;
		shadow.scale.set(num(opts.shadowLength, 3.2), num(opts.shadowWidth, 1.5), 1);
		shadow.renderOrder = 1;
		group.add(shadow);

		/* ---- (c) fading procedural grid ---- */
		var gridGeo = new THREE.PlaneGeometry(size, size, 1, 1);
		var gridUniforms = {
			uCell: { value: num(opts.cell, 1.0) },
			uMajor: { value: num(opts.majorEvery, 5.0) },
			uLineW: { value: num(opts.lineWidth, 0.008) },
			uFadeNear: { value: num(opts.fadeNear, 6.0) },
			uFadeFar: { value: num(opts.fadeFar, 26.0) },
			uColor: { value: new THREE.Color(opts.gridColor !== undefined ? opts.gridColor : 0x8fa4bd) },
			uMajorColor: { value: new THREE.Color(opts.gridMajorColor !== undefined ? opts.gridMajorColor : 0xff5a24) },
			uOpacity: { value: num(opts.gridOpacity, 0.30) },
			uGlow: { value: num(opts.gridGlow, 0.35) },
			uViewportH: { value: 800 },
			uTime: { value: 0 },
			uPulse: { value: 0 }
		};

		var gridVert = [
			'varying vec3 vWorld;',
			'void main(){',
			'  vec4 wp = modelMatrix * vec4(position, 1.0);',
			'  vWorld = wp.xyz;',
			'  gl_Position = projectionMatrix * viewMatrix * wp;',
			'}'
		].join('\n');

		// Derivative-free antialiasing: the world-space size of one pixel at this
		// depth is dist * 2 / (P[1][1] * viewportHeight). Widening the line by that
		// keeps far lines from aliasing without needing fwidth().
		var gridFrag = [
			'uniform float uCell, uMajor, uLineW, uFadeNear, uFadeFar;',
			'uniform float uOpacity, uGlow, uViewportH, uTime, uPulse;',
			'uniform vec3 uColor, uMajorColor;',
			'varying vec3 vWorld;',
			'float lineMask(vec2 p, float cell, float halfW, float soft){',
			'  vec2 g = abs(fract(p / cell - 0.5) - 0.5) * cell;',
			'  float d = min(g.x, g.y);',
			'  return 1.0 - smoothstep(halfW, halfW + soft, d);',
			'}',
			'void main(){',
			'  vec2 p = vWorld.xz;',
			'  float dist = length(cameraPosition - vWorld);',
			// projectionMatrix non esiste nel fragment shader: three la inietta
			// solo nel vertex. La larghezza di un pixel in unità mondo si ricava
			// dalle derivate schermo, che è anche il modo corretto di
			// antialiasare una griglia procedurale.
			'  vec2 fw = fwidth(p);',
			'  float wpp = max(max(fw.x, fw.y), 1e-6);',
			'  float soft = max(wpp * 1.6, 0.0006);',
			'  float minor = lineMask(p, uCell, uLineW * 0.5, soft);',
			'  float major = lineMask(p, uCell * uMajor, uLineW * 1.35, soft);',
			'  minor = max(minor - major, 0.0);',
			// radial fade so the grid dissolves into the dark instead of ending
			'  float radial = length(p);',
			'  float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, radial);',
			'  fade *= 1.0 - smoothstep(uFadeNear * 1.6, uFadeFar * 1.5, dist);',
			// a slow scanning pulse travelling outward keeps the floor alive
			'  float wave = 0.5 + 0.5 * sin(radial * 0.55 - uTime * 1.1);',
			'  float pulse = 1.0 + uPulse * wave * 1.4;',
			'  vec3 col = uColor * minor + uMajorColor * major * 1.25;',
			'  float a = (minor * 0.62 + major) * fade * uOpacity * pulse;',
			// soft glow bloom around the major lines
			'  vec2 g2 = abs(fract(p / (uCell * uMajor) - 0.5) - 0.5) * uCell * uMajor;',
			'  float gd = min(g2.x, g2.y);',
			'  float glow = exp(-gd * 5.5) * uGlow * fade;',
			'  col += uMajorColor * glow * 0.55;',
			'  a += glow * 0.30;',
			'  if (a < 0.002) discard;',
			'  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
			'}'
		].join('\n');

		var gridMat = new THREE.ShaderMaterial({
			uniforms: gridUniforms,
			vertexShader: gridVert,
			fragmentShader: gridFrag,
			// fwidth() su WebGL1 richiede GL_OES_standard_derivatives; su WebGL2
			// è nel core e questo flag è innocuo.
			extensions: { derivatives: true },
			transparent: true,
			depthWrite: false,
			depthTest: true,
			blending: THREE.AdditiveBlending
		});
		var grid = new THREE.Mesh(gridGeo, gridMat);
		grid.rotation.x = -Math.PI / 2;
		grid.position.y = 0.002;
		grid.renderOrder = 2;
		attachViewport(THREE, grid, gridUniforms);
		group.add(grid);

		/* ---- (d) optional host-fed screen-space reflection layer ---- */
		var reflGeo = new THREE.PlaneGeometry(size * 0.5, size * 0.5, 1, 1);
		var reflUniforms = {
			uMap: { value: null },
			uResolution: { value: new THREE.Vector2(1, 1) },
			uStrength: { value: num(opts.reflectionStrength, 0.55) },
			uFade: { value: num(opts.reflectionFade, 9.0) },
			uBlur: { value: num(opts.reflectionBlur, 1.4) }
		};
		var reflMat = new THREE.ShaderMaterial({
			uniforms: reflUniforms,
			vertexShader: [
				'varying vec3 vWorld;',
				'void main(){',
				'  vec4 wp = modelMatrix * vec4(position, 1.0);',
				'  vWorld = wp.xyz;',
				'  gl_Position = projectionMatrix * viewMatrix * wp;',
				'}'
			].join('\n'),
			fragmentShader: [
				'uniform sampler2D uMap;',
				'uniform vec2 uResolution;',
				'uniform float uStrength, uFade, uBlur;',
				'varying vec3 vWorld;',
				'void main(){',
				'  vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));',
				'  vec2 px = uBlur / max(uResolution, vec2(1.0));',
				// 5-tap vertical smear: cheap stand-in for a rough-surface blur
				'  vec3 c = texture2D(uMap, uv).rgb * 0.36;',
				'  c += texture2D(uMap, uv + vec2(0.0,  px.y)).rgb * 0.20;',
				'  c += texture2D(uMap, uv - vec2(0.0,  px.y)).rgb * 0.20;',
				'  c += texture2D(uMap, uv + vec2(0.0, px.y * 2.4)).rgb * 0.12;',
				'  c += texture2D(uMap, uv - vec2(0.0, px.y * 2.4)).rgb * 0.12;',
				'  float d = length(vWorld.xz);',
				'  float a = uStrength * (1.0 - smoothstep(0.0, uFade, d));',
				'  if (a < 0.004) discard;',
				'  gl_FragColor = vec4(c * a, a);',
				'}'
			].join('\n'),
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
		var refl = new THREE.Mesh(reflGeo, reflMat);
		refl.rotation.x = -Math.PI / 2;
		refl.position.y = 0.003;
		refl.renderOrder = 1;
		refl.visible = false;
		attachViewport(THREE, refl, reflUniforms);
		group.add(refl);

		var elapsed = 0;
		var disposed = false;

		return {
			object3d: group,
			floor: floor,
			grid: grid,
			/** Host may hand us a render target texture to use as a mirrored layer. */
			setReflectionTarget: function (texture) {
				reflUniforms.uMap.value = texture || null;
				refl.visible = !!texture;
			},
			setShadowTransform: function (x, z, length, width) {
				shadow.position.x = num(x, shadow.position.x);
				shadow.position.z = num(z, shadow.position.z);
				shadow.scale.set(num(length, shadow.scale.x), num(width, shadow.scale.y), 1);
			},
			update: function (dt, state) {
				dt = num(dt, 0.016);
				var st = readState(state);
				elapsed += dt;
				gridUniforms.uTime.value = elapsed;
				// the grid breathes with revs — subtle, but it ties the floor to the bike
				gridUniforms.uPulse.value = 0.15 + st.rpm * 0.55 + st.speed * 0.2;
				gridUniforms.uOpacity.value = num(opts.gridOpacity, 0.30) * (0.75 + st.scroll * 0.5);
				floorMat.roughness = num(opts.roughness, 0.42) - st.speed * 0.10;
				shadowMat.opacity = num(opts.shadowOpacity, 0.95) * (1.0 - st.speed * 0.25);
			},
			dispose: function () {
				if (disposed) return;
				disposed = true;
				grid.onBeforeRender = function () {};
				refl.onBeforeRender = function () {};
				floorGeo.dispose();
				shadowGeo.dispose();
				gridGeo.dispose();
				reflGeo.dispose();
				floorMat.dispose();
				shadowMat.dispose();
				gridMat.dispose();
				reflMat.dispose();
				disposeTextures(textures);
				if (group.parent) group.parent.remove(group);
				group.clear();
			}
		};
	}

	/* ================================================================== *
	 * 7. createLightShafts
	 * ================================================================== */

	function createLightShafts(THREE, opts) {
		opts = opts || {};
		var group = new THREE.Group();
		group.name = 'PanigaleFX.LightShafts';

		// Low quality drops god rays entirely — return an inert stub.
		if (isLow(opts)) {
			return {
				object3d: group,
				update: function () {},
				dispose: function () {
					if (group.parent) group.parent.remove(group);
				},
				enabled: false
			};
		}

		var shaftCount = Math.max(1, Math.floor(num(opts.count, 4)));
		var geo = new THREE.PlaneGeometry(1, 1, 1, 12);
		var uniformsList = [];

		var vert = [
			'varying vec2 vUv;',
			'varying float vFacing;',
			'void main(){',
			'  vUv = uv;',
			'  vec4 wp = modelMatrix * vec4(position, 1.0);',
			'  vec3 n = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));',
			'  vec3 vdir = normalize(cameraPosition - wp.xyz);',
			// fade out as the slab turns edge-on so it never reads as a flat card
			'  vFacing = smoothstep(0.05, 0.55, abs(dot(n, vdir)));',
			'  gl_Position = projectionMatrix * viewMatrix * wp;',
			'}'
		].join('\n');

		var frag = [
			'uniform float uTime;',
			'uniform float uIntensity;',
			'uniform vec3  uColor;',
			'uniform float uSeed;',
			'varying vec2 vUv;',
			'varying float vFacing;',
			GLSL_SIMPLEX,
			'void main(){',
			'  vec2 uv = vUv;',
			// soft-edged cone: narrow at the source (uv.y = 1), wide at the floor
			'  float halfW = mix(0.14, 0.5, uv.y);',
			'  float across = abs(uv.x - 0.5) / halfW;',
			'  float edge = 1.0 - smoothstep(0.35, 1.0, across);',
			'  edge = pow(edge, 1.7);',
			// dies out along its length, brightest just below the source
			'  float along = smoothstep(0.0, 0.22, uv.y) * (1.0 - smoothstep(0.30, 1.0, 1.0 - uv.y));',
			'  along *= 1.0 - smoothstep(0.55, 1.05, 1.0 - uv.y);',
			// slow dust striations drifting down the beam
			'  float n = fbm(vec2(uv.x * 3.4 + uSeed, (1.0 - uv.y) * 2.2 - uTime * 0.07));',
			'  float striate = 0.68 + 0.42 * n;',
			'  float a = edge * along * striate * uIntensity * vFacing;',
			'  if (a < 0.0015) discard;',
			'  vec3 col = uColor * (0.85 + 0.35 * n);',
			'  gl_FragColor = vec4(col * a, a);',
			'}'
		].join('\n');

		// Beams angled from above-front, splaying across the bike. Each shaft is two
		// crossed slabs so it holds up from any camera azimuth.
		var layout = [
			{ x: 2.1, y: 3.4, z: 1.3, rz: -0.30, ry: 0.22, w: 1.9, h: 5.2, c: 0xffd7a8, i: 0.30 },
			{ x: 0.2, y: 3.7, z: -1.6, rz: 0.24, ry: -0.35, w: 2.4, h: 5.6, c: 0xfff0d6, i: 0.24 },
			{ x: -1.9, y: 3.3, z: 0.9, rz: 0.14, ry: 0.55, w: 1.6, h: 5.0, c: 0xbcd2ff, i: 0.20 },
			{ x: -3.2, y: 3.6, z: -0.6, rz: -0.18, ry: -0.15, w: 2.0, h: 5.4, c: 0xffc98f, i: 0.16 }
		];

		for (var i = 0; i < shaftCount; i++) {
			var L = layout[i % layout.length];
			var shaft = new THREE.Group();
			shaft.position.set(L.x, L.y, L.z);
			shaft.rotation.set(0, L.ry, L.rz);
			var uniforms = {
				uTime: { value: 0 },
				uIntensity: { value: L.i },
				uColor: { value: new THREE.Color(L.c) },
				uSeed: { value: Math.random() * 30 }
			};
			var mat = new THREE.ShaderMaterial({
				uniforms: uniforms,
				vertexShader: vert,
				fragmentShader: frag,
				transparent: true,
				depthWrite: false,
				depthTest: true,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide
			});
			for (var j = 0; j < 2; j++) {
				var m = new THREE.Mesh(geo, mat);
				m.scale.set(L.w, L.h, 1);
				m.position.y = -L.h * 0.5;
				m.rotation.y = j * Math.PI * 0.5;
				m.renderOrder = 8;
				shaft.add(m);
			}
			shaft.userData.base = L.i;
			shaft.userData.uniforms = uniforms;
			shaft.userData.drift = 0.13 + Math.random() * 0.2;
			shaft.userData.phase = Math.random() * 6.28;
			shaft.userData.rz = L.rz;
			shaft.userData.ry = L.ry;
			group.add(shaft);
			uniformsList.push(uniforms);
		}

		var elapsed = 0;
		var disposed = false;

		return {
			object3d: group,
			update: function (dt, state) {
				dt = num(dt, 0.016);
				var st = readState(state);
				elapsed += dt;
				for (var i2 = 0; i2 < group.children.length; i2++) {
					var s = group.children[i2];
					var d = s.userData;
					d.uniforms.uTime.value = elapsed;
					// lazy drift: slow sway plus a breathing intensity
					var w = Math.sin(elapsed * d.drift + d.phase);
					var w2 = Math.sin(elapsed * d.drift * 0.63 + d.phase * 1.7);
					s.rotation.z = d.rz + w * 0.055;
					s.rotation.y = d.ry + w2 * 0.10;
					d.uniforms.uIntensity.value = d.base * (0.72 + 0.28 * w2) *
						(0.75 + st.rpm * 0.35 + st.scroll * 0.25);
				}
			},
			dispose: function () {
				if (disposed) return;
				disposed = true;
				for (var i2 = 0; i2 < group.children.length; i2++) {
					var s = group.children[i2];
					if (s.children[0]) disposeMaterial(s.children[0].material);
				}
				geo.dispose();
				if (group.parent) group.parent.remove(group);
				group.clear();
			},
			enabled: true
		};
	}

	/* ================================================================== *
	 * 8. createDustMotes
	 * ================================================================== */

	function createDustMotes(THREE, opts) {
		opts = opts || {};
		var group = new THREE.Group();
		group.name = 'PanigaleFX.DustMotes';

		var count = budget(opts, 1100);
		var box = {
			x: num(opts.width, 18),
			y: num(opts.height, 6.0),
			z: num(opts.depth, 14)
		};
		var yBase = num(opts.baseY, 0.05);

		var geo = new THREE.BufferGeometry();
		var pos = new Float32Array(count * 3);
		var seed = new Float32Array(count * 3);
		for (var i = 0; i < count; i++) {
			pos[i * 3 + 0] = (Math.random() - 0.5) * box.x;
			// bias the population low, where the light actually is
			pos[i * 3 + 1] = yBase + Math.pow(Math.random(), 1.6) * box.y;
			pos[i * 3 + 2] = (Math.random() - 0.5) * box.z;
			seed[i * 3 + 0] = Math.random();
			seed[i * 3 + 1] = Math.random();
			seed[i * 3 + 2] = Math.random();
		}
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
		geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, box.y * 0.5, 0), Math.max(box.x, box.z));

		var sprite = sparkSprite(THREE);
		var textures = [sprite];

		var uniforms = {
			uTime: { value: 0 },
			uSize: { value: num(opts.size, 0.020) },
			uDrift: { value: num(opts.drift, 0.16) },
			uRise: { value: num(opts.rise, 0.035) },
			uHeight: { value: box.y },
			uBaseY: { value: yBase },
			uOpacity: { value: num(opts.opacity, 0.85) },
			uColorA: { value: new THREE.Color(opts.colorA !== undefined ? opts.colorA : 0xfff2dc) },
			uColorB: { value: new THREE.Color(opts.colorB !== undefined ? opts.colorB : 0x9fc4ff) },
			uMap: { value: sprite },
			uViewportH: { value: 800 },
			uWind: { value: 0 }
		};

		var vert = [
			'attribute vec3 aSeed;',
			'uniform float uTime, uSize, uDrift, uRise, uHeight, uBaseY, uViewportH, uWind;',
			'varying float vTwinkle;',
			'varying float vTint;',
			'varying float vDepthFade;',
			GLSL_POINT_SIZE,
			'void main(){',
			'  vec3 p = position;',
			'  float a1 = aSeed.x * 6.2831;',
			'  float a2 = aSeed.y * 6.2831;',
			'  float sp = 0.4 + aSeed.z;',
			// lazy 3D brownian-ish wander, all from uTime — CPU does nothing
			'  p.x += sin(uTime * 0.19 * sp + a1) * uDrift * (0.6 + aSeed.y);',
			'  p.z += cos(uTime * 0.23 * sp + a2) * uDrift * (0.6 + aSeed.x);',
			'  p.y += sin(uTime * 0.13 * sp + a1 * 1.7) * uDrift * 0.45;',
			// slow convection upward, wrapping back to the floor
			'  float rise = fract((uTime * uRise * sp + aSeed.x) );',
			'  p.y = uBaseY + mod(p.y - uBaseY + rise * uHeight, uHeight);',
			'  p.x += uWind;',
			'  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
			'  float sz = uSize * (0.45 + 1.25 * aSeed.z);',
			'  gl_PointSize = max(pointPixels(sz, mv.z, projectionMatrix[1][1], uViewportH), 0.9);',
			// specks scintillate as they tumble through the light
			'  vTwinkle = 0.30 + 0.70 * pow(0.5 + 0.5 * sin(uTime * (1.1 + aSeed.z * 2.6) + a2 * 3.1), 2.0);',
			'  vTint = aSeed.y;',
			// fade the far ones so the volume has depth
			'  vDepthFade = 1.0 - smoothstep(6.0, 26.0, -mv.z);',
			'  gl_Position = projectionMatrix * mv;',
			'}'
		].join('\n');

		var frag = [
			'uniform sampler2D uMap;',
			'uniform vec3 uColorA;',
			'uniform vec3 uColorB;',
			'uniform float uOpacity;',
			'varying float vTwinkle;',
			'varying float vTint;',
			'varying float vDepthFade;',
			'void main(){',
			'  float d = length(gl_PointCoord - 0.5) * 2.0;',
			'  if (d > 1.0) discard;',
			'  float core = texture2D(uMap, gl_PointCoord).a;',
			'  float a = core * vTwinkle * uOpacity * vDepthFade;',
			'  if (a < 0.004) discard;',
			'  vec3 col = mix(uColorA, uColorB, smoothstep(0.35, 0.9, vTint));',
			'  gl_FragColor = vec4(col * a, a);',
			'}'
		].join('\n');

		var mat = new THREE.ShaderMaterial({
			uniforms: uniforms,
			vertexShader: vert,
			fragmentShader: frag,
			transparent: true,
			depthWrite: false,
			depthTest: true,
			blending: THREE.AdditiveBlending
		});

		var points = new THREE.Points(geo, mat);
		points.frustumCulled = false;
		points.renderOrder = 7;
		attachViewport(THREE, points, uniforms);
		group.add(points);

		var elapsed = 0;
		var wind = 0;
		var disposed = false;

		return {
			object3d: group,
			update: function (dt, state) {
				dt = num(dt, 0.016);
				var st = readState(state);
				elapsed += dt;
				uniforms.uTime.value = elapsed;
				// air being dragged past the bike as it picks up speed
				wind -= dt * st.speed * 1.8;
				if (wind < -box.x) wind += box.x;
				uniforms.uWind.value = wind;
				uniforms.uOpacity.value = num(opts.opacity, 0.85) * (0.55 + st.rpm * 0.45);
			},
			dispose: function () {
				if (disposed) return;
				disposed = true;
				points.onBeforeRender = function () {};
				geo.dispose();
				mat.dispose();
				disposeTextures(textures);
				if (group.parent) group.parent.remove(group);
				group.clear();
			},
			particleCount: count
		};
	}

	/* ------------------------------------------------------------------ *
	 * Export
	 * ------------------------------------------------------------------ */

	root.PanigaleFX = {
		version: '1.0.0',
		createHeatHaze: createHeatHaze,
		createExhaustSmoke: createExhaustSmoke,
		createSparks: createSparks,
		createTyreSmoke: createTyreSmoke,
		createSpeedLines: createSpeedLines,
		createGroundPlane: createGroundPlane,
		createLightShafts: createLightShafts,
		createDustMotes: createDustMotes,
		createEnvironment: createEnvironment
	};

})(typeof window !== 'undefined' ? window : this);
