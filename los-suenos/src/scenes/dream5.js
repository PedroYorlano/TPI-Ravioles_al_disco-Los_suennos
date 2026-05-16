import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  NoiseEffect,
  BlendFunction
} from 'postprocessing';

let state = {};
let materials = {};
let effects = {};

const DREAM5_AUDIO_SRC = '/assets/Across the Stars (Love Theme from Star Wars_ Attack of the Clones) (mp3cut.net).mp3';
const DREAM5_RISER_SRC = '/assets/Riser - Sound Effect (Free).mp3';

let keys = { w: false, a: false, s: false, d: false, q: false, e: false };

const keydownListener = (ev) => {
  const key = ev.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = true;
};
const keyupListener = (ev) => {
  const key = ev.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = false;
};

export async function init(manager) {
  window.addEventListener('keydown', keydownListener);
  window.addEventListener('keyup', keyupListener);

  state = {
    timeElapsed: 0,
    collapseStarted: false,
    collapseFactor: 0,
    climaxTriggered: false,
    climaxTimer: 0,
    velocity: new THREE.Vector3(),
    planets: [],
    stars1: null,
    stars2: null,
    sky: null,
    musicEl: null,
    riserEl: null,
    audioCtx: null,
    riserSource: null,
    riserGain: null,
    riserTimeout: null,
    noise2D: createNoise2D(),
    manager: manager
  };

  manager.camera.position.set(0, 0, 0);
  manager.camera.rotation.set(0, 0, 0);
  manager.scene.background = new THREE.Color(0x000000);
  manager.scene.fog = null; // Sin niebla en el espacio

  // Extender el plano de recorte para que los planetas lejanos sean visibles
  state.originalFar = manager.camera.far;
  manager.camera.far = 2000;
  manager.camera.updateProjectionMatrix();

  // Grupo global para implosión final
  state.universeGroup = new THREE.Group();
  manager.scene.add(state.universeGroup);

  createSky();
  createStars();
  await createPlanets();

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  state.universeGroup.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffddaa, 2.0);
  sunLight.position.set(200, 100, -200);
  state.universeGroup.add(sunLight);

  // UI Text for controls
  const ui = document.createElement('div');
  ui.id = 'dream5-ui';
  ui.style.position = 'absolute';
  ui.style.bottom = '10%';
  ui.style.width = '100%';
  ui.style.textAlign = 'center';
  ui.style.color = 'rgba(255, 255, 255, 0.7)';
  ui.style.fontFamily = 'sans-serif';
  ui.style.fontSize = '1.2rem';
  ui.style.letterSpacing = '2px';
  ui.style.pointerEvents = 'none';
  ui.style.zIndex = '100';
  ui.style.textShadow = '0 0 10px rgba(0,0,0,0.8)';
  ui.innerHTML = 'VUELO LIBRE: Usa <b>W A S D</b> para navegar y <b>Q E</b> para subir/bajar';
  document.body.appendChild(ui);

  setupPostprocessing(manager);
  setupAudio();
}

function createSky() {
  const skyGeo = new THREE.SphereGeometry(1000, 64, 64);
  materials.sky = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      collapse: { value: 0 },
      color1: { value: new THREE.Color(0x1a0b2e) }, // Violeta muy oscuro
      color2: { value: new THREE.Color(0x2d0b38) }, // Magenta apagado
      color3: { value: new THREE.Color(0x0a0512) }  // Negro azulado
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float collapse;
      uniform vec3 color1;
      uniform vec3 color2;
      uniform vec3 color3;
      varying vec3 vWorldPosition;

      // Pseudo-ruido 3D rápido
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                       mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                       mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float f = 0.0;
        f += 0.5000 * noise(p); p *= 2.02;
        f += 0.2500 * noise(p); p *= 2.03;
        f += 0.1250 * noise(p); p *= 2.01;
        f += 0.0625 * noise(p);
        return f;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float n = fbm(dir * 3.0 + time * 0.02);
        float n2 = fbm(dir * 5.0 - time * 0.01);
        
        vec3 baseColor = mix(color3, color1, smoothstep(0.2, 0.7, n));
        baseColor = mix(baseColor, color2, smoothstep(0.4, 0.9, n2));
        
        // Manchas de negro profundo (cúmulos oscuros)
        float darkMask = smoothstep(0.4, 0.8, fbm(dir * 2.0));
        baseColor = mix(baseColor, vec3(0.0), darkMask);

        // Colapso: Desaturar y oscurecer
        float gray = dot(baseColor, vec3(0.299, 0.587, 0.114));
        vec3 finalColor = mix(baseColor, vec3(gray), collapse);
        finalColor *= (1.0 - collapse);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  state.sky = new THREE.Mesh(skyGeo, materials.sky);
  state.universeGroup.add(state.sky);
}

function createStars() {
  const createLayer = (count, size, color) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 400 + Math.random() * 600;
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    // Textura circular con gradiente suave
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const map = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      color: color,
      size: size,
      map: map,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    return new THREE.Points(geo, mat);
  };

  state.stars1 = createLayer(3000, 15.0, 0xffeedd); // Cercanas, grandes
  state.stars2 = createLayer(6000, 8.0, 0xaaccff);  // Lejanas, pequeñas
  state.universeGroup.add(state.stars1);
  state.universeGroup.add(state.stars2);
}

async function addFloatingPlanetModel(fileName, position, speed, targetDiameter = 80) {
  try {
    const loader = new GLTFLoader();
    const modelUrl = new URL(`../assets/models/${fileName}`, import.meta.url).href;
    const gltf = await loader.loadAsync(modelUrl);
    const model = gltf.scene;

    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });

    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scaleFactor = targetDiameter / maxDim;
    model.scale.multiplyScalar(scaleFactor);

    const centeredBounds = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    centeredBounds.getCenter(center);
    model.position.sub(center);
    model.position.add(position);

    const dummyMat = { uniforms: { time: { value: 0 }, collapse: { value: 0 } } };
    state.planets.push({ mesh: model, mat: dummyMat, speed });
    state.universeGroup.add(model);
  } catch (error) {
    console.warn(`No se pudo cargar ${fileName} en dream5`, error);
  }
}

// Shader común para deforma planetas en el colapso
const planetVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float time;
  uniform float collapse;
  
  // Hash & Noise
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    vec3 pos = position;
    // Deformación del colapso
    float n = noise(position * 2.0 + time * 5.0);
    pos += normal * n * collapse * 5.0; // Se inflan caóticamente
    
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vPosition = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

async function createPlanets() {
  // 1. Planeta Gaseoso (Bandas)
  const gasMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      uniform float time;
      void main() {
        float n = sin(vUv.y * 50.0 + sin(vUv.x * 10.0 + time) * 2.0);
        vec3 color1 = vec3(0.8, 0.4, 0.1);
        vec3 color2 = vec3(0.9, 0.7, 0.3);
        vec3 color = mix(color1, color2, smoothstep(-0.5, 0.5, n));
        
        float intensity = dot(vNormal, vec3(0, 0, 1));
        gl_FragColor = vec4(color * max(0.2, intensity), 1.0);
      }
    `
  });
  const gasPlanet = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 64), gasMat);
  gasPlanet.position.set(300, 100, -625);
  state.planets.push({ mesh: gasPlanet, mat: gasMat, speed: 0.05 });
  state.universeGroup.add(gasPlanet);

  // 2. Planeta Rocoso (Displacement procedural simulado)
  const rockMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      uniform float time;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main() {
        float n = noise(vUv * 30.0) * 0.5 + noise(vUv * 100.0) * 0.25;
        vec3 color = mix(vec3(0.2, 0.2, 0.25), vec3(0.5, 0.45, 0.4), n);
        float intensity = dot(vNormal, vec3(0.5, 0.5, 1.0));
        gl_FragColor = vec4(color * max(0.1, intensity), 1.0);
      }
    `
  });
  const rockPlanet = new THREE.Mesh(new THREE.SphereGeometry(25, 64, 64), rockMat);
  rockPlanet.position.set(-375, -150, 500);
  state.planets.push({ mesh: rockPlanet, mat: rockMat, speed: -0.08 });
  state.universeGroup.add(rockPlanet);

  // 3. Planeta con Anillos
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x2288ff, roughness: 0.6 });
  const ringPlanet = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 64), ringMat);

  const ringGeo = new THREE.RingGeometry(55, 85, 64);
  const ringTexMat = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  });
  const ring = new THREE.Mesh(ringGeo, ringTexMat);
  ring.rotation.x = Math.PI / 2.2;
  ringPlanet.add(ring);
  ringPlanet.position.set(-550, 200, -125);

  // Dummy mat object to sync collapse uniform
  const dummyMat = { uniforms: { time: { value: 0 }, collapse: { value: 0 } } };
  state.planets.push({ mesh: ringPlanet, mat: dummyMat, speed: 0.05 });
  state.universeGroup.add(ringPlanet);

  // 4. Planeta Helado (Nuevo)
  const iceMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      uniform float time;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main() {
        float n = noise(vUv * 40.0 + time * 0.05) * 0.5 + noise(vUv * 80.0) * 0.5;
        vec3 color = mix(vec3(0.4, 0.7, 0.9), vec3(0.9, 0.95, 1.0), n);
        float intensity = dot(vNormal, vec3(0.2, 0.8, 0.5));
        gl_FragColor = vec4(color * max(0.1, intensity + 0.2), 1.0);
      }
    `
  });
  const icePlanet = new THREE.Mesh(new THREE.SphereGeometry(35, 64, 64), iceMat);
  icePlanet.position.set(450, -250, 375);
  state.planets.push({ mesh: icePlanet, mat: iceMat, speed: 0.12 });
  state.universeGroup.add(icePlanet);

  // Planetas GLB: distancias x2.5 para separación dramática
  await Promise.all([
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(1050, 350, 150), 0.045, 120),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(-1300, -300, -650), -0.03, 85),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(550, 650, -1050), 0.06, 150),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(-400, 200, 1300), 0.09, 65),

    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(-900, -225, 650), -0.07, 95),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(1350, 450, -450), 0.05, 130),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(-550, 800, -1300), 0.04, 70),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(300, -600, 1075), -0.08, 160),

    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(800, 175, -700), 0.06, 100),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(-1525, 100, 400), -0.05, 75),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(650, -550, 1250), 0.07, 140),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(-450, 525, -1150), 0.03, 60),

    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(-650, 275, -850), 0.09, 72),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(1450, -375, 550), -0.06, 55),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(-1050, 650, 950), 0.08, 105),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(450, -750, -1400), -0.04, 42)
  ]);
}

function setupPostprocessing(manager) {
  const composer = new EffectComposer(manager.renderer);
  const renderPass = new RenderPass(manager.scene, manager.camera);
  composer.addPass(renderPass);

  effects.bloom = new BloomEffect({
    intensity: 2.0,
    luminanceThreshold: 0.1,
    luminanceSmoothing: 0.8
  });

  effects.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
  effects.noise.blendMode.opacity.value = 0.0;

  const effectPass = new EffectPass(manager.camera, effects.bloom, effects.noise);
  composer.addPass(effectPass);
  manager.composer = composer;
}

function setupAudio() {
  try {
    const firstAudio = new Audio(encodeURI(DREAM5_AUDIO_SRC));
    firstAudio.preload = 'auto';
    firstAudio.loop = false;
    firstAudio.volume = 0.75;
    state.musicEl = firstAudio;

    // Pre-crear AudioContext y cadena de efectos (se activa con interacción del usuario)
    const initAudioChain = () => {
      if (state.audioCtx) return; // Ya inicializado
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        state.audioCtx = ctx;

        // Distorsión creciente (WaveShaper)
        state.distortion = ctx.createWaveShaper();
        state.distortion.curve = makeDistortionCurve(0);
        state.distortion.oversample = '4x';

        // Filtro agudo chirriante
        state.harshFilter = ctx.createBiquadFilter();
        state.harshFilter.type = 'highshelf';
        state.harshFilter.frequency.value = 3000;
        state.harshFilter.gain.value = 0;

        // Gain del riser
        state.riserGain = ctx.createGain();
        state.riserGain.gain.value = 0.9;

        // Ruido blanco (empieza mudo)
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
        state.noiseSource = ctx.createBufferSource();
        state.noiseSource.buffer = noiseBuffer;
        state.noiseSource.loop = true;
        state.noiseGain = ctx.createGain();
        state.noiseGain.gain.value = 0;
        state.noiseSource.connect(state.noiseGain).connect(ctx.destination);
        state.noiseSource.start();

        // Cadena pre-armada: distortion → harshFilter → gain → destination
        state.distortion.connect(state.harshFilter)
          .connect(state.riserGain)
          .connect(ctx.destination);
      } catch (e) {
        console.warn('No se pudo inicializar la cadena WebAudio', e);
      }
    };

    const startRiser = () => {
      if (state.riserEl) return;

      const riser = new Audio(encodeURI(DREAM5_RISER_SRC));
      riser.preload = 'auto';
      riser.loop = false;
      state.riserEl = riser;

      // El colapso comienza con el riser
      state.collapseStarted = true;
      state.collapseFactor = 0;

      // Conectar el riser a la cadena de efectos pre-armada
      if (state.audioCtx && state.distortion) {
        try {
          const ctx = state.audioCtx;
          if (ctx.state === 'suspended') ctx.resume().catch(() => { });
          const source = ctx.createMediaElementSource(riser);
          source.connect(state.distortion); // Entra en la cadena ya conectada
          state.riserSource = source;
        } catch (e) {
          riser.volume = 0.9;
          console.warn('WebAudio falló para el riser, usando volumen nativo', e);
        }
      } else {
        riser.volume = 0.9;
      }

      riser.addEventListener('timeupdate', () => {
        if (riser.duration && isFinite(riser.duration)) {
          state.collapseFactor = THREE.MathUtils.clamp(riser.currentTime / riser.duration, 0, 1);
        }
      });

      riser.addEventListener('ended', () => {
        state.collapseFactor = 1.0;
        if (state.riserTimeout) {
          clearTimeout(state.riserTimeout);
          state.riserTimeout = null;
        }
        if (state.manager && !state.climaxTriggered) {
          triggerClimax(state.manager);
        }
      });

      riser.play().catch((err) => {
        console.warn('No se pudo reproducir el riser', err);
        if (state.manager && !state.climaxTriggered) triggerClimax(state.manager);
      });

      if (riser.duration && isFinite(riser.duration)) {
        state.riserTimeout = setTimeout(() => {
          state.collapseFactor = 1.0;
          if (state.manager && !state.climaxTriggered) triggerClimax(state.manager);
        }, Math.max(0, riser.duration * 1000));
      }
    };

    firstAudio.addEventListener('ended', () => {
      startRiser();
    });

    const tryPlay = () => {
      if (!state.musicEl) return;
      state.musicEl.play().catch(() => { });
    };

    // Intento inicial + desbloqueo por interacción (autoplay policy)
    tryPlay();
    const unlockAudio = () => {
      tryPlay();
      initAudioChain(); // Crear AudioContext con gesto de usuario
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

  } catch (e) {
    console.warn("Audio error", e);
  }
}

function makeDistortionCurve(amount) {
  const k = typeof amount === 'number' ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    if (k === 0) {
      curve[i] = x;
    } else {
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
  }
  return curve;
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  if (state.climaxTriggered) {
    updateClimax(deltaTime, manager);
    return;
  }

  // 1. Movimiento 6DOF con inercia
  const dir = new THREE.Vector3();
  manager.camera.getWorldDirection(dir);
  const up = new THREE.Vector3(0, 1, 0); // Eje Y absoluto
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();

  const accel = new THREE.Vector3();
  if (keys.w) accel.add(dir);
  if (keys.s) accel.sub(dir);
  if (keys.a) accel.sub(right);
  if (keys.d) accel.add(right);
  if (keys.e) accel.add(up);
  if (keys.q) accel.sub(up);

  // El colapso lo maneja exclusivamente el Riser (setupAudio).
  // collapseFactor se actualiza en el timeupdate del riser audio.
  // Cuando el riser termina, su 'ended' event llama a triggerClimax.

  // Inercia normal vs Inercia de colapso (pierde control)
  const friction = THREE.MathUtils.lerp(0.97, 0.995, state.collapseFactor);
  const inputStrength = THREE.MathUtils.lerp(60.0, 2.0, state.collapseFactor);

  if (accel.lengthSq() > 0) {
    accel.normalize().multiplyScalar(inputStrength * deltaTime);
    state.velocity.add(accel);
  }

  manager.camera.position.add(state.velocity.clone().multiplyScalar(deltaTime));
  state.velocity.multiplyScalar(friction);

  // 2. Actualizar Shaders (Tiempo y Colapso)
  if (materials.sky) {
    materials.sky.uniforms.time.value = state.timeElapsed;
    materials.sky.uniforms.collapse.value = state.collapseFactor;
  }
  if (state.stars1) {
    state.stars1.rotation.y += deltaTime * 0.01;
    state.stars1.rotation.x += deltaTime * 0.005;
    state.stars1.material.opacity = 1.0 - state.collapseFactor;

    state.stars2.rotation.y -= deltaTime * 0.02;
    state.stars2.material.opacity = 1.0 - state.collapseFactor;
  }

  state.planets.forEach(p => {
    p.mesh.rotation.y += p.speed * deltaTime;
    if (p.mat.uniforms) {
      p.mat.uniforms.time.value = state.timeElapsed;
      p.mat.uniforms.collapse.value = state.collapseFactor;
    }
  });

  // 3. Blur final / colapso visual y sonoro sincronizado con el riser
  if (state.collapseStarted) {
    effects.noise.blendMode.opacity.value = state.collapseFactor * 0.5;
    if (effects.bloom) {
      effects.bloom.intensity = 2.0 + state.collapseFactor * 2.0;
    }

    // Distorsión de audio creciente
    if (state.distortion) {
      const distAmount = Math.pow(state.collapseFactor, 2) * 200;
      state.distortion.curve = makeDistortionCurve(distAmount);
    }
    // Filtro agudo: los últimos 40% del riser acentúan agudos chirriantes
    if (state.harshFilter) {
      const shelfGain = Math.max(0, (state.collapseFactor - 0.6) / 0.4) * 25;
      state.harshFilter.gain.value = shelfGain;
    }
    // Ruido blanco: sube en el último 50% del riser
    if (state.noiseGain) {
      const noiseVol = Math.max(0, (state.collapseFactor - 0.5) / 0.5) * 0.35;
      state.noiseGain.gain.value = noiseVol;
    }
  }
}

function triggerClimax(manager) {
  state.climaxTriggered = true;
  state.climaxTimer = 0;

  // Silencio total antes del negro
  if (state.riserGain && state.audioCtx) {
    state.riserGain.gain.linearRampToValueAtTime(0, state.audioCtx.currentTime + 0.15);
  }
  if (state.noiseGain && state.audioCtx) {
    state.noiseGain.gain.linearRampToValueAtTime(0, state.audioCtx.currentTime + 0.15);
  }

  // Parálisis
  state.velocity.set(0, 0, 0);
}

function updateClimax(deltaTime, manager) {
  state.climaxTimer += deltaTime;

  // Implosión visual: Todos los objetos escalan a 0 hacia el centro del universo
  const scale = Math.max(0, 1.0 - state.climaxTimer * 1.5);
  state.universeGroup.scale.set(scale, scale, scale);

  // El jugador cae en el vacío
  manager.camera.position.y -= 50 * deltaTime * state.climaxTimer;

  effects.noise.blendMode.opacity.value = Math.random();

  if (state.climaxTimer > 1.5) {
    manager.fadeMaterial.opacity = 1.0;
    manager.transitionTo('hub');
  }
}

export function dispose(manager) {
  window.removeEventListener('keydown', keydownListener);
  window.removeEventListener('keyup', keyupListener);

  const ui = document.getElementById('dream5-ui');
  if (ui) ui.remove();

  // Restaurar el far plane original de la cámara
  if (state.originalFar) {
    manager.camera.far = state.originalFar;
    manager.camera.updateProjectionMatrix();
  }

  if (manager.composer) {
    manager.composer.dispose();
    manager.composer = null;
  }

  if (state.audioCtx && state.audioCtx.state !== 'closed') {
    state.audioCtx.close();
  }

  if (state.riserTimeout) {
    clearTimeout(state.riserTimeout);
    state.riserTimeout = null;
  }

  if (state.musicEl) {
    state.musicEl.pause();
    state.musicEl.currentTime = 0;
    state.musicEl = null;
  }

  if (state.riserEl) {
    state.riserEl.pause();
    state.riserEl.currentTime = 0;
    state.riserEl = null;
  }

  if (state.riserSource) {
    try { state.riserSource.disconnect(); } catch (e) { }
    state.riserSource = null;
  }

  if (state.riserGain) {
    try { state.riserGain.disconnect(); } catch (e) { }
    state.riserGain = null;
  }

  if (state.distortion) {
    try { state.distortion.disconnect(); } catch (e) { }
    state.distortion = null;
  }

  if (state.harshFilter) {
    try { state.harshFilter.disconnect(); } catch (e) { }
    state.harshFilter = null;
  }

  if (state.noiseSource) {
    try { state.noiseSource.stop(); } catch (e) { }
    try { state.noiseSource.disconnect(); } catch (e) { }
    state.noiseSource = null;
  }

  if (state.noiseGain) {
    try { state.noiseGain.disconnect(); } catch (e) { }
    state.noiseGain = null;
  }
}
