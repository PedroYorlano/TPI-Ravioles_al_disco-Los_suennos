import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
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
    audioCtx: null,
    padGain: null,
    distortion: null,
    oscillators: [],
    noise2D: createNoise2D()
  };

  manager.camera.position.set(0, 0, 0);
  manager.camera.rotation.set(0, 0, 0);
  manager.scene.background = new THREE.Color(0x000000);
  manager.scene.fog = null; // Sin niebla en el espacio

  // Grupo global para implosión final
  state.universeGroup = new THREE.Group();
  manager.scene.add(state.universeGroup);

  createSky();
  createStars();
  createPlanets();

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
  const skyGeo = new THREE.SphereGeometry(400, 64, 64);
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

function createPlanets() {
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
  gasPlanet.position.set(120, 40, -250);
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
  rockPlanet.position.set(-150, -60, 200);
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
  ringPlanet.position.set(-220, 80, -50);

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
  icePlanet.position.set(180, -100, 150);
  state.planets.push({ mesh: icePlanet, mat: iceMat, speed: 0.12 });
  state.universeGroup.add(icePlanet);
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
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    state.audioCtx = ctx;

    // Pad Ambiental Espacial
    state.padGain = ctx.createGain();
    state.padGain.gain.value = 0.5;

    // Distorsión para el colapso
    state.distortion = ctx.createWaveShaper();
    state.distortion.curve = makeDistortionCurve(0);
    state.distortion.oversample = '4x';
    // No asignamos curva inicialmente para que el audio pase limpio sin atenuarse

    // Reanudar contexto si el navegador lo bloquea (Autoplay Policy)
    const resumeAudio = () => {
      if (ctx.state === 'suspended') ctx.resume();
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('keydown', resumeAudio);

    state.padGain.connect(state.distortion);
    state.distortion.connect(ctx.destination);

    // Acorde irreal y disonante
    const freqs = [110.0, 164.81, 233.08, 311.13]; // A, E, Bb, Eb
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.02 + i * 0.01;

      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.2;

      lfo.connect(oscGain.gain);
      osc.connect(oscGain);
      oscGain.connect(state.padGain);

      osc.start();
      lfo.start();
      state.oscillators.push(osc, lfo);
    });

  } catch (e) {
    console.warn("Audio error", e);
  }
}

function makeDistortionCurve(amount) {
  const k = typeof amount === 'number' ? amount : 50,
    n_samples = 44100,
    curve = new Float32Array(n_samples),
    deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = i * 2 / n_samples - 1;
    if (k === 0) {
      curve[i] = x;
    } else {
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
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

  // Colapso altera el control
  if (state.timeElapsed > 25 && !state.collapseStarted) {
    state.collapseStarted = true;
  }

  if (state.collapseStarted) {
    state.collapseFactor += deltaTime * 0.1; // Sube de 0 a 1 en 10s
    if (state.collapseFactor > 1.0) {
      state.collapseFactor = 1.0;
      triggerClimax(manager);
    }
  }

  // Inercia normal vs Inercia de colapso (pierde control)
  const friction = THREE.MathUtils.lerp(0.95, 0.995, state.collapseFactor);
  const inputStrength = THREE.MathUtils.lerp(15.0, 2.0, state.collapseFactor);

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

  // 3. Audio Colapso
  if (state.collapseStarted && state.distortion) {
    const distAmount = state.collapseFactor * 100;
    state.distortion.curve = makeDistortionCurve(distAmount);
    effects.noise.blendMode.opacity.value = state.collapseFactor * 0.5;
  }
}

function triggerClimax(manager) {
  state.climaxTriggered = true;
  state.climaxTimer = 0;

  // Silencio total antes del final
  if (state.audioCtx && state.padGain) {
    state.padGain.gain.linearRampToValueAtTime(0, state.audioCtx.currentTime + 0.1);
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

  if (manager.composer) {
    manager.composer.dispose();
    manager.composer = null;
  }

  if (state.audioCtx && state.audioCtx.state !== 'closed') {
    state.audioCtx.close();
  }
}
