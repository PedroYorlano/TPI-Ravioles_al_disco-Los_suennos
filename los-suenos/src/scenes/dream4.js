import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  GodRaysEffect,
  SelectiveBloomEffect,
  DepthOfFieldEffect,
  ChromaticAberrationEffect,
  NoiseEffect,
  BlendFunction
} from 'postprocessing';

let state = {};
let materials = {};
let figure = {};
let effects = {};
let noise2D;

let keys = { w: false, a: false, s: false, d: false };

const keydownListener = (e) => {
  const key = e.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = true;
};
const keyupListener = (e) => {
  const key = e.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = false;
};

export async function init(manager) {
  window.addEventListener('keydown', keydownListener);
  window.addEventListener('keyup', keyupListener);

  state = {
    timeElapsed: 0,
    climaxTriggered: false,
    climaxTimer: 0,
    figureDistance: 50,
    audioCtx: null,
    padGain: null,
    noiseGain: null,
    oscillators: [],
    grassMesh: null
  };

  noise2D = createNoise2D();

  manager.camera.position.set(0, 1.8, 0);
  manager.camera.rotation.set(0, 0, 0);
  manager.scene.background = new THREE.Color(0x050110);

  // Niebla atmosférica volumétrica (cálida)
  manager.scene.fog = new THREE.FogExp2(0xff7733, 0.008);

  // 1. Cielo Procedural con Nubes Estilizadas
  createSky(manager);

  // 2. Sol Físico Deslumbrante para God Rays
  const sunGeo = new THREE.SphereGeometry(18, 64, 64);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffeebb });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.position.set(0, 8, -180); // En el horizonte
  manager.scene.add(sunMesh);

  // 3. Terreno Hiperrealista y Pasto Instanciado con Viento
  createTerrainAndGrass(manager);

  // 4. Figura Majestuosa y Halo
  createFigure(manager);

  // 5. Partículas (Motas de polvo dorado)
  createParticles(manager);

  // 6. Iluminación Escénica
  const hemiLight = new THREE.HemisphereLight(0xff66bb, 0x111122, 1.0);
  manager.scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0xffaa55, 3.0);
  dirLight.position.set(0, 8, -180);
  manager.scene.add(dirLight);

  // 7. Postprocesado (Composer)
  setupPostprocessing(manager, sunMesh);

  // 8. Audio (Web Audio API nativa para pad cálido y viento)
  setupAudio();
}

function createSky(manager) {
  const skyGeo = new THREE.SphereGeometry(300, 64, 64);

  // Generar textura de nubes suaves
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const imgData = ctx.createImageData(1024, 1024);
  for (let x = 0; x < 1024; x++) {
    for (let y = 0; y < 1024; y++) {
      let n = noise2D(x * 0.005, y * 0.005) * 1.0 + noise2D(x * 0.015, y * 0.015) * 0.5;
      n = (n + 1.5) / 3.0; // 0 a 1
      n = Math.pow(n, 2.5); // Contrastar nubes
      const idx = (y * 1024 + x) * 4;
      imgData.data[idx] = 255;
      imgData.data[idx + 1] = 200;
      imgData.data[idx + 2] = 150;
      imgData.data[idx + 3] = n * 180;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const cloudTex = new THREE.CanvasTexture(canvas);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      colorBottom: { value: new THREE.Color(0xff4400) }, // Naranja fuego
      colorMid1: { value: new THREE.Color(0xff2266) },   // Rosa brillante
      colorMid2: { value: new THREE.Color(0x440099) },   // Violeta oscuro
      colorTop: { value: new THREE.Color(0x05021a) },    // Noche
      cloudMap: { value: cloudTex }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 colorBottom;
      uniform vec3 colorMid1;
      uniform vec3 colorMid2;
      uniform vec3 colorTop;
      uniform sampler2D cloudMap;
      
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      
      void main() {
        float h = normalize(vWorldPosition).y;
        h = clamp((h + 0.1) / 0.8, 0.0, 1.0);
        
        vec3 color = mix(colorBottom, colorMid1, smoothstep(0.0, 0.2, h));
        color = mix(color, colorMid2, smoothstep(0.2, 0.5, h));
        color = mix(color, colorTop, smoothstep(0.5, 1.0, h));
        
        vec4 clouds = texture2D(cloudMap, vUv * vec2(4.0, 2.0));
        color = mix(color, clouds.rgb, clouds.a * smoothstep(0.0, 0.4, h));
        
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  manager.scene.add(sky);
}

function createTerrainAndGrass(manager) {
  const size = 200;
  const segments = 200; // Alta resolución
  const planeGeo = new THREE.PlaneGeometry(size, size, segments, segments);
  const pos = planeGeo.attributes.position;

  // Generar colinas suaves pero detalladas
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = noise2D(x * 0.02, y * 0.02) * 2.5 + noise2D(x * 0.08, y * 0.08) * 0.5;
    pos.setZ(i, z);
  }
  planeGeo.computeVertexNormals();

  materials.terrain = new THREE.MeshStandardMaterial({
    color: 0x221105, // Tierra oscura
    roughness: 1.0,
    metalness: 0.0
  });

  const terrain = new THREE.Mesh(planeGeo, materials.terrain);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -1.0;
  manager.scene.add(terrain);

  // Pasto Instanciado (InstancedMesh) - 60,000 briznas
  const grassCount = 60000;
  const grassGeo = new THREE.PlaneGeometry(0.08, 1.0, 1, 4);
  grassGeo.translate(0, 0.5, 0); // Origen en la base

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffaa33, // Pasto iluminado por el atardecer
    roughness: 0.8,
    side: THREE.DoubleSide
  });

  // Inyectar shader custom para animación de viento en InstancedMesh
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    materials.grassUniforms = shader.uniforms;
    shader.vertexShader = `
      uniform float time;
      ${shader.vertexShader}
    `.replace(
      `#include <begin_vertex>`,
      `
      #include <begin_vertex>
      // Viento basado en posición de instancia y tiempo
      float wind = sin(time * 2.0 + instanceMatrix[3][0] * 0.2 + instanceMatrix[3][2] * 0.2) * 0.3;
      transformed.x += wind * uv.y * uv.y;
      transformed.z += wind * uv.y * uv.y;
      `
    );
  };

  state.grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  const dummy = new THREE.Object3D();
  let gIdx = 0;

  for (let i = 0; i < grassCount; i++) {
    const rx = (Math.random() - 0.5) * 80;
    const rz = (Math.random() - 0.5) * 180 - 40; // Mayormente adelante

    // Calcular altura del terreno
    const h = noise2D(rx * 0.02, -rz * 0.02) * 2.5 + noise2D(rx * 0.08, -rz * 0.08) * 0.5;

    dummy.position.set(rx, h - 1.0, rz);
    dummy.rotation.y = Math.random() * Math.PI;
    const scale = 0.5 + Math.random() * 0.8;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();

    state.grassMesh.setMatrixAt(gIdx++, dummy.matrix);
  }
  state.grassMesh.instanceMatrix.needsUpdate = true;
  manager.scene.add(state.grassMesh);
}

function createFigure(manager) {
  figure.group = new THREE.Group();
  figure.group.position.set(0, 0, -state.figureDistance);

  // Silueta Majestuosa (Más esbelta y surrealista)
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0 });

  const bodyGeo = new THREE.CylinderGeometry(0.15, 0.4, 2.5, 32);
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.y = 1.25;

  const headGeo = new THREE.SphereGeometry(0.22, 32, 32);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = 2.7;

  // Túnica flotante
  const cloakGeo = new THREE.ConeGeometry(0.6, 2.0, 32, 1, true);
  const cloak = new THREE.Mesh(cloakGeo, mat);
  cloak.position.y = 1.0;

  figure.armPivot = new THREE.Group();
  figure.armPivot.position.set(0.3, 2.2, 0); // Hombro
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 1.2, 16), mat);
  arm.position.set(0, -0.6, 0);
  figure.armPivot.add(arm);

  figure.group.add(body, head, cloak, figure.armPivot);

  // Aura volumétrica (Múltiples Sprites)
  figure.halos = [];
  const colors = [
    { c: '255, 120, 50', s: 6, o: 1.0 },
    { c: '255, 60, 200', s: 8, o: 0.6 },
    { c: '100, 50, 255', s: 12, o: 0.3 }
  ];

  colors.forEach(cfg => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, `rgba(${cfg.c}, ${cfg.o})`);
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    }));
    sprite.scale.set(cfg.s, cfg.s, 1);
    sprite.position.set(0, 1.5, -0.5);
    figure.halos.push(sprite);
    figure.group.add(sprite);
  });

  // Partículas blancas de estallido (Climax)
  const burstGeo = new THREE.BufferGeometry();
  const burstPos = new Float32Array(500 * 3);
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
  const burstMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, opacity: 0 });
  figure.burst = new THREE.Points(burstGeo, burstMat);
  figure.group.add(figure.burst);

  // Asegurar que la figura esté plantada en el terreno procedural
  const figureY = noise2D(figure.group.position.x * 0.02, -figure.group.position.z * 0.02) * 2.5 - 1.0;
  figure.group.position.y = figureY;

  manager.scene.add(figure.group);
}

function createParticles(manager) {
  const pCount = 800;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  const pPhase = new Float32Array(pCount);

  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 60;
    pPos[i * 3 + 1] = Math.random() * 8;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    pPhase[i] = Math.random() * Math.PI * 2;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('phase', new THREE.BufferAttribute(pPhase, 1));

  materials.particles = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(0xffeebb) }
    },
    vertexShader: `
      attribute float phase;
      varying float vAlpha;
      uniform float time;
      void main() {
        vAlpha = 0.5 + 0.5 * sin(time * 3.0 + phase);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (15.0 * vAlpha) * (10.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        float r = distance(gl_PointCoord, vec2(0.5));
        if(r > 0.5) discard;
        float intensity = pow(1.0 - (r * 2.0), 1.5);
        gl_FragColor = vec4(color, intensity * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  state.dust = new THREE.Points(pGeo, materials.particles);
  manager.scene.add(state.dust);
}

function setupPostprocessing(manager, sunMesh) {
  const composer = new EffectComposer(manager.renderer);
  const renderPass = new RenderPass(manager.scene, manager.camera);
  composer.addPass(renderPass);

  // Bloom selectivo para los halos de la figura
  effects.bloom = new SelectiveBloomEffect(manager.scene, manager.camera, {
    intensity: 6.0,
    luminanceThreshold: 0.0,
    luminanceSmoothing: 0.1
  });
  figure.halos.forEach(h => effects.bloom.selection.add(h));

  // God Rays desde el sol (Hiper Realistas)
  effects.godRays = new GodRaysEffect(manager.camera, sunMesh, {
    decay: 0.96,
    weight: 0.6,
    samples: 100,
    density: 0.98,
    exposure: 0.8
  });

  // DOF Cálido y Suave
  effects.dof = new DepthOfFieldEffect(manager.camera, {
    focusDistance: 0.05,
    focalLength: 0.12,
    bokehScale: 5.0
  });

  // Glitch Extremo para el climax
  effects.aberration = new ChromaticAberrationEffect();
  effects.aberration.offset = new THREE.Vector2(0, 0);

  effects.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
  effects.noise.blendMode.opacity.value = 0;

  const effectPass = new EffectPass(
    manager.camera,
    effects.bloom,
    effects.godRays,
    effects.dof,
    effects.aberration,
    effects.noise
  );
  composer.addPass(effectPass);
  manager.composer = composer;
}

function setupAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    state.audioCtx = ctx;

    // Pad Cálido (Acorde Majestuoso)
    state.padGain = ctx.createGain();
    state.padGain.gain.value = 0.4;
    state.padGain.connect(ctx.destination);

    const freqs = [196.00, 246.94, 293.66, 392.00]; // G Major 7th
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05 + i * 0.02;

      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.25;

      lfo.connect(oscGain.gain);
      osc.connect(oscGain);
      oscGain.connect(state.padGain);

      osc.start();
      lfo.start();
      state.oscillators.push(osc, lfo);
    });

    // Viento suave
    const bufferSize = ctx.sampleRate * 4.0;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;
    noiseSrc.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;

    state.noiseGain = ctx.createGain();
    state.noiseGain.gain.value = 0.2;

    noiseSrc.connect(filter);
    filter.connect(state.noiseGain);
    state.noiseGain.connect(ctx.destination);
    noiseSrc.start();
    state.oscillators.push(noiseSrc);

  } catch (e) {
    console.warn("Audio error", e);
  }
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  if (state.climaxTriggered) {
    updateClimax(deltaTime, manager);
    return;
  }

  // Animación del Shader del Pasto
  if (materials.grassUniforms) materials.grassUniforms.time.value = state.timeElapsed;

  // Partículas animadas
  if (materials.particles) materials.particles.uniforms.time.value = state.timeElapsed;
  const pPos = state.dust.geometry.attributes.position.array;
  for (let i = 0; i < 800; i++) {
    pPos[i * 3] += Math.sin(state.timeElapsed + i) * 0.5 * deltaTime;
    pPos[i * 3 + 2] -= 0.8 * deltaTime; // Derivan más rápido
    if (pPos[i * 3 + 2] < -30) pPos[i * 3 + 2] += 60;
  }
  state.dust.geometry.attributes.position.needsUpdate = true;

  // Movimiento Jugador
  const speed = 2.5 * deltaTime;
  const isMoving = keys.w || keys.a || keys.s || keys.d;

  if (keys.w) manager.controls.moveForward(speed);
  if (keys.s) manager.controls.moveForward(-speed);
  if (keys.a) manager.controls.moveRight(-speed);
  if (keys.d) manager.controls.moveRight(speed);

  // Mantener al jugador en el terreno
  // La geometría del terreno mapea su eje Y al -Z global.
  const playerY = noise2D(manager.camera.position.x * 0.02, -manager.camera.position.z * 0.02) * 2.5 + noise2D(manager.camera.position.x * 0.08, -manager.camera.position.z * 0.08) * 0.5 - 1.0;
  manager.camera.position.y = THREE.MathUtils.lerp(manager.camera.position.y, playerY + 1.8, deltaTime * 5);

  // Lógica de Figura (usando distancia 2D en XZ para evitar problemas de altura Y)
  const dx = manager.camera.position.x - figure.group.position.x;
  const dz = manager.camera.position.z - figure.group.position.z;
  const dist2D = Math.sqrt(dx * dx + dz * dz);

  if (!isMoving && dist2D > 3) {
    // Se acerca si no te mueves
    figure.group.position.z += 1.5 * deltaTime;
    // Mantenerla pegada al suelo mientras se mueve
    figure.group.position.y = noise2D(figure.group.position.x * 0.02, -figure.group.position.z * 0.02) * 2.5 - 1.0;
  }

  if (dist2D < 6) {
    // Extiende la mano dramáticamente
    figure.armPivot.rotation.x = THREE.MathUtils.lerp(figure.armPivot.rotation.x, -Math.PI / 1.5, deltaTime * 4);
  }

  // Colisión / Tocar a la figura
  if (dist2D < 1.5) {
    triggerClimax(manager);
  }
}

function triggerClimax(manager) {
  state.climaxTriggered = true;
  state.climaxTimer = 0;

  // Glitch de postprocesado brutal
  effects.aberration.offset = new THREE.Vector2(0.08, 0.08);
  effects.noise.blendMode.opacity.value = 1.0;

  // Figura desaparece y burst de partículas masivo
  figure.group.children.forEach(c => { if (c !== figure.burst) c.visible = false; });

  figure.burst.material.opacity = 1.0;
  const bPos = figure.burst.geometry.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    bPos.setXYZ(i, (Math.random() - 0.5) * 1.0, (Math.random() - 0.5) * 1.0 + 1.5, (Math.random() - 0.5) * 1.0);
  }
  bPos.needsUpdate = true;

  // Glitch de audio (Web Audio)
  if (state.audioCtx && state.padGain) {
    const now = state.audioCtx.currentTime;
    // Pitch shift distorsionado (Glitch masivo)
    state.oscillators.forEach(osc => {
      if (osc.frequency) {
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
      }
    });
    // Silencio rápido
    state.padGain.gain.linearRampToValueAtTime(0, now + 0.4);
    state.noiseGain.gain.linearRampToValueAtTime(0, now + 0.4);
  }
}

function updateClimax(deltaTime, manager) {
  state.climaxTimer += deltaTime;

  // Expansión del burst
  const bPos = figure.burst.geometry.attributes.position.array;
  for (let i = 0; i < 500; i++) {
    bPos[i * 3] *= 1 + 8 * deltaTime;
    bPos[i * 3 + 1] *= 1 + 8 * deltaTime;
    bPos[i * 3 + 2] *= 1 + 8 * deltaTime;
  }
  figure.burst.geometry.attributes.position.needsUpdate = true;
  figure.burst.material.opacity = Math.max(0, 1.0 - state.climaxTimer * 2.0);

  // Parpadeo de glitch
  effects.aberration.offset.x = (Math.random() - 0.5) * 0.2;
  effects.aberration.offset.y = (Math.random() - 0.5) * 0.2;

  if (state.climaxTimer > 0.5) {
    // Fade a negro instantáneo y transición
    manager.fadeMaterial.opacity = 1.0;
    manager.transitionTo('hub');
  }
}

export function dispose(manager) {
  window.removeEventListener('keydown', keydownListener);
  window.removeEventListener('keyup', keyupListener);

  if (manager.composer) {
    manager.composer.dispose();
    manager.composer = null;
  }

  if (state.audioCtx && state.audioCtx.state !== 'closed') {
    state.audioCtx.close();
  }
}
