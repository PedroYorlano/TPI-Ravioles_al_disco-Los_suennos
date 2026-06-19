import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  GodRaysEffect,
  BloomEffect,
  DepthOfFieldEffect,
  ChromaticAberrationEffect,
  NoiseEffect,
  VignetteEffect,
  BlendFunction
} from 'postprocessing';

let state = {};
let materials = {};
let figure = {};
let effects = {};
let noise2D;

let keys = { w: false, a: false, s: false, d: false, shift: false };

const keydownListener = (e) => {
  const key = e.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = true;
};
const keyupListener = (e) => {
  const key = e.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = false;
};

export async function init(manager) {
  try {
    window.addEventListener('keydown', keydownListener);
    window.addEventListener('keyup', keyupListener);

    state = {
      initialized: false,
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

    // Mensaje flotante de instrucción
    const textOverlay = document.createElement('div');
    textOverlay.id = 'dream4-run-msg';
    textOverlay.style.cssText = `
      position: fixed;
      bottom: 20%;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Georgia', serif;
      font-size: 20px;
      color: #ffd7b5;
      text-shadow: 0 0 8px rgba(0,0,0,0.8), 0 0 16px rgba(255, 102, 0, 0.4);
      pointer-events: none;
      z-index: 100;
      opacity: 1;
      transition: opacity 2s ease-out;
    `;
    textOverlay.innerHTML = "Presiona SHIFT para correr";
    document.body.appendChild(textOverlay);
    state.runMsg = textOverlay;

    // Niebla atmosférica volumétrica (cálida, coincide con horizonte Y=0.0)
    manager.scene.fog = new THREE.FogExp2(0xff6633, 0.008);

    // 1. Cielo Procedural con Nubes Estilizadas
    createSky(manager);

    // 2. Sol Físico Deslumbrante para God Rays
    const sunGroup = new THREE.Group();
    sunGroup.position.set(0, -2, -180); // Parcialmente oculto por el horizonte

    const sunGeo = new THREE.SphereGeometry(8, 32, 32);
    const sunMat = new THREE.MeshStandardMaterial({
      color: 0xffcc77,
      emissive: 0xff9944,
      emissiveIntensity: 2.0
    });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunGroup.add(sunMesh);

    // Canvas para los Sprites del halo del sol
    const createHaloTex = (r, g, b, a) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a})`);
      grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(canvas);
    };

    const sunHalo1 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createHaloTex(255, 102, 0, 0.3),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    sunHalo1.scale.set(60, 60, 1);
    sunGroup.add(sunHalo1);

    const sunHalo2 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createHaloTex(255, 51, 0, 0.08),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    sunHalo2.scale.set(120, 120, 1);
    sunGroup.add(sunHalo2);

    manager.scene.add(sunGroup);
    state.sunMesh = sunMesh; // guardamos para GodRays

    // 3. Terreno Hiperrealista y Pasto Instanciado con Viento
    createTerrainAndGrass(manager);

    // 4. Figura Majestuosa y Halo
    await createFigure(manager);

    // 5. Partículas (Motas de polvo dorado)
    createParticles(manager);

    // 6. Iluminación Escénica
    const hemiLight = new THREE.HemisphereLight(0xff66bb, 0x111122, 1.0);
    manager.scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffaa55, 3.0);
    dirLight.position.set(0, 8, -180);
    manager.scene.add(dirLight);

    // 7. Postprocesado (Composer)
    setupPostprocessing(manager, state.sunMesh);

    // 8. Audio (Web Audio API nativa para pad cálido y viento)
    setupAudio();

    state.initialized = true;
  } catch (err) {
    console.error("DREAM4 INIT ERROR:", err);
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:red;color:white;z-index:999999;font-family:monospace;padding:20px;overflow:auto;font-size:16px;';
    errDiv.innerHTML = '<h1>Error during Dream 4 Init:</h1><pre>' + err.stack + '</pre>';
    document.body.appendChild(errDiv);
    throw err;
  }
}

function createSky(manager) {
  const skyGeo = new THREE.SphereGeometry(400, 64, 64);

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }
      float noise(vec2 x) {
          vec2 i = floor(x); vec2 f = fract(x);
          float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      float fbm(vec2 x) {
          float v = 0.0; float a = 0.5;
          vec2 shift = vec2(100.0);
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
          for (int i = 0; i < 5; ++i) {
              v += a * noise(x); x = rot * x * 2.0 + shift; a *= 0.5;
          }
          return v;
      }

      void main() {
        vec3 c0 = vec3(1.0, 0.4, 0.2);     // Naranja
        vec3 c1 = vec3(1.0, 0.2, 0.53);    // Rosa fuerte
        vec3 c2 = vec3(0.8, 0.26, 0.66);   // Magenta
        vec3 c3 = vec3(0.4, 0.2, 0.8);     // Violeta
        vec3 c4 = vec3(0.13, 0.06, 0.26);  // Índigo oscuro
        
        float y = clamp(vUv.y, 0.0, 1.0);
        
        vec3 color;
        if (y < 0.2) color = mix(c0, c1, smoothstep(0.0, 0.2, y));
        else if (y < 0.5) color = mix(c1, c2, smoothstep(0.2, 0.5, y));
        else if (y < 0.8) color = mix(c2, c3, smoothstep(0.5, 0.8, y));
        else color = mix(c3, c4, smoothstep(0.8, 1.0, y));

        float n = fbm(vUv * 10.0 + uTime * 0.02);
        float cloudMask = smoothstep(0.3, 0.7, y) * (1.0 - smoothstep(0.7, 0.9, y));
        vec3 cloudColor = vec3(1.0);
        float cloudAlpha = n * 0.15 * cloudMask;
        
        color = mix(color, cloudColor, cloudAlpha);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  manager.scene.add(sky);
  materials.skyMat = skyMat;
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
    side: THREE.DoubleSide,
    alphaTest: 0.6,
    depthWrite: true,
    depthTest: true
  });

  // Inyectar shader custom para animación de viento en InstancedMesh
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    materials.grassUniforms = shader.uniforms;
    shader.vertexShader = `
      varying vec2 vUvGrass;
      uniform float time;
      ${shader.vertexShader}
    `.replace(
      `#include <begin_vertex>`,
      `
      #include <begin_vertex>
      vUvGrass = uv;
      // Viento basado en posición de instancia y tiempo
      float wind = sin(time * 2.0 + instanceMatrix[3][0] * 0.2 + instanceMatrix[3][2] * 0.2) * 0.3;
      transformed.x += wind * uv.y * uv.y;
      transformed.z += wind * uv.y * uv.y;
      `
    );
    shader.fragmentShader = `
      varying vec2 vUvGrass;
      ${shader.fragmentShader}
    `.replace(
      `#include <opaque_fragment>`,
      `
      #include <opaque_fragment>
      // Descartar fragmentos fuera de la forma orgánica curva de la hoja
      float grassShape = step(abs(vUvGrass.x - 0.5), 0.4 * (1.0 - vUvGrass.y));
      if (grassShape < 0.5) discard;
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

async function createFigure(manager) {
  figure.group = new THREE.Group();
  figure.group.position.set(0, 0, -state.figureDistance);

  let model;
  try {
    const modelUrl = new URL('../assets/models/Copilot3D-1f9e01da-72de-4614-9f74-cafe446d987d.glb', import.meta.url).href;
    const gltf = await manager.getModel(modelUrl);
    model = SkeletonUtils.clone(gltf.scene);

    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Escala inicial: ajustar hasta que la figura mida ~2.52 unidades de alto (1.8 * 1.4)
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const currentHeight = size.y || 1.8;
    const scaleFactor = 2.52 / currentHeight;
    model.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Posición Y: pies tocando el suelo (lowest point at local Y=0)
    model.position.y = -box.min.y * scaleFactor;
    model.position.x = -((box.min.x + box.max.x) / 2) * scaleFactor;
    model.position.z = -((box.min.z + box.max.z) / 2) * scaleFactor;

    // Rotación Y: rotar 180 grados desde la rotación anterior para que mire en el sentido opuesto (hacia el jugador)
    model.rotation.y = 0;

    figure.group.add(model);
    figure.model = model;

    // Animación
    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      const idleClip = gltf.animations.find(clip => clip.name.toLowerCase().includes('idle')) || gltf.animations[0];
      const action = mixer.clipAction(idleClip);
      action.play();
      figure.mixer = mixer;
    } else {
      figure.baseScaleY = scaleFactor;
    }
  } catch (err) {
    console.error("Error al cargar el modelo de la silueta GLB", err);
  }

  // Aura volumétrica (Un solo Sprite de halo) - posicionado centrado a media altura (Y = 1.26)
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(170, 136, 255, 0.15)`); // #aa88ff
  grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);

  const spriteMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    color: new THREE.Color(0xaa88ff)
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(16, 16, 1); // Tamaño base
  sprite.position.set(0, 1.26, 0); // Centrado a media altura (2.52 / 2)
  figure.haloSprite = sprite; // Guardar referencia para animar
  figure.haloBaseColor = new THREE.Color(0xaa88ff); // Color base para intensificar
  figure.group.add(sprite);

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

  // UnrealBloom Pass Global
  effects.bloom = new BloomEffect({
    luminanceThreshold: 0.4,
    intensity: 1.8,
    mipmapBlur: true,
    luminanceSmoothing: 0.2
  });

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

  // Glitch Extremo para el climax + sutil de ambiente
  effects.aberration = new ChromaticAberrationEffect();
  effects.aberration.offset = new THREE.Vector2(0.0008, 0.0008);

  effects.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
  effects.noise.blendMode.opacity.value = 0;

  effects.vignette = new VignetteEffect({ darkness: 0.4 });

  const effectPass = new EffectPass(
    manager.camera,
    effects.bloom,
    effects.godRays,
    effects.dof,
    effects.aberration,
    effects.vignette,
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
    state.padGain.gain.value = 0.05; // Volumen ultra reducido
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

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.15; // Escalar modulación para que no clipee

      lfo.connect(lfoGain);
      lfoGain.connect(oscGain.gain);

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
    state.noiseGain.gain.value = 0.05; // Volumen ultra reducido

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
  if (!state.initialized) return;
  state.timeElapsed += deltaTime;

  if (state.climaxTriggered) {
    updateClimax(deltaTime, manager);
    return;
  }

  // Actualizar animación o respiración de la figura
  if (figure.mixer) {
    figure.mixer.update(deltaTime);
  } else if (figure.model && figure.baseScaleY !== undefined) {
    figure.model.scale.y = figure.baseScaleY * (1.0 + 0.015 * Math.sin(state.timeElapsed * 0.4));
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

  // Desaparecer mensaje instruccional después de 5 segundos
  if (state.timeElapsed > 5 && state.runMsg) {
    state.runMsg.style.opacity = '0';
    setTimeout(() => {
      if (state.runMsg && state.runMsg.parentNode) {
        state.runMsg.parentNode.removeChild(state.runMsg);
      }
      state.runMsg = null;
    }, 2000);
  }

  // Movimiento Jugador
  let speed = 2.5 * deltaTime;
  if (keys.shift && keys.w) {
    speed *= 2.5; // Multiplicador de sprint
  }
  const isMoving = keys.w || keys.a || keys.s || keys.d;

  if (keys.w) manager.controls.moveForward(speed);
  if (keys.s) manager.controls.moveForward(-speed);
  if (keys.a) manager.controls.moveRight(-speed);
  if (keys.d) manager.controls.moveRight(speed);

  // Limitar al jugador dentro del área de pasto
  manager.camera.position.x = THREE.MathUtils.clamp(manager.camera.position.x, -38, 38);
  manager.camera.position.z = THREE.MathUtils.clamp(manager.camera.position.z, -128, 48);

  // Mantener al jugador en el terreno
  // La geometría del terreno mapea su eje Y al -Z global.
  const playerY = noise2D(manager.camera.position.x * 0.02, -manager.camera.position.z * 0.02) * 2.5 + noise2D(manager.camera.position.x * 0.08, -manager.camera.position.z * 0.08) * 0.5 - 1.0;
  manager.camera.position.y = THREE.MathUtils.lerp(manager.camera.position.y, playerY + 1.8, deltaTime * 5);

  // Lógica de Figura (usando distancia 2D en XZ para evitar problemas de altura Y)
  const dx = manager.camera.position.x - figure.group.position.x;
  const dz = manager.camera.position.z - figure.group.position.z;
  const dist2D = Math.sqrt(dx * dx + dz * dz);

  // Aumentar intensidad cegadora del halo al acercarse
  if (figure.haloSprite && figure.haloBaseColor) {
    const progress = THREE.MathUtils.clamp((50 - dist2D) / 45, 0, 1);

    // Curva exponencial fuerte para que el brillo explote al final
    const intensity = 1.0 + Math.pow(progress, 4.0) * 100.0;

    // Multiplicamos el color base para que el BloomEffect sature y ciegue al jugador
    figure.haloSprite.material.color.copy(figure.haloBaseColor).multiplyScalar(intensity);

    // El tamaño también acompaña un poco para envolver la visión
    const targetScale = 16 + Math.pow(progress, 2.0) * 8;
    figure.haloSprite.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), deltaTime * 3);
  }

  if (dist2D > 3) {
    const moveSpeed = 1.5 * deltaTime;
    figure.group.position.x += (dx / dist2D) * moveSpeed;
    figure.group.position.z += (dz / dist2D) * moveSpeed;
    figure.group.position.y = noise2D(figure.group.position.x * 0.02, -figure.group.position.z * 0.02) * 2.5 - 1.0;
  }

  if (dist2D < 6 && figure.armPivot) {
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
  // Protecciones: si la figura o su geometría ya fueron liberadas, salir
  const posAttr = figure && figure.burst && figure.burst.geometry && figure.burst.geometry.attributes && figure.burst.geometry.attributes.position;
  if (!posAttr) return;

  // Expansión del burst (usar el conteo real por seguridad)
  const bPos = posAttr.array;
  for (let i = 0; i < posAttr.count; i++) {
    bPos[i * 3] *= 1 + 8 * deltaTime;
    bPos[i * 3 + 1] *= 1 + 8 * deltaTime;
    bPos[i * 3 + 2] *= 1 + 8 * deltaTime;
  }
  posAttr.needsUpdate = true;
  if (figure.burst.material) figure.burst.material.opacity = Math.max(0, 1.0 - state.climaxTimer * 2.0);

  // Parpadeo de glitch (proteger efectos)
  if (effects && effects.aberration && effects.aberration.offset) {
    effects.aberration.offset.x = (Math.random() - 0.5) * 0.2;
    effects.aberration.offset.y = (Math.random() - 0.5) * 0.2;
  }

  if (state.climaxTimer > 0.5) {
    manager.fadeMaterial.opacity = 1.0;
    manager.transitionTo('hub');
  }
}

export function dispose(manager) {
  window.removeEventListener('keydown', keydownListener);
  window.removeEventListener('keyup', keyupListener);

  if (state.runMsg && state.runMsg.parentNode) {
    state.runMsg.parentNode.removeChild(state.runMsg);
    state.runMsg = null;
  }

  if (manager.composer) {
    manager.composer.dispose();
    manager.composer = null;
  }

  if (state.audioCtx && state.audioCtx.state !== 'closed') {
    state.audioCtx.close();
  }

  // Liberar recursos de la figura
  if (figure.mixer) {
    figure.mixer = null;
  }

  if (figure.model) {
    if (figure.model.parent) {
      figure.model.parent.remove(figure.model);
    }
    manager.scene.remove(figure.model);
    figure.model = null;
  }

  if (figure.haloSprite) {
    figure.haloSprite.geometry.dispose();
    figure.haloSprite.material.dispose();
    figure.haloSprite = null;
  }

  if (figure.burst) {
    figure.burst.geometry.dispose();
    figure.burst.material.dispose();
    figure.burst = null;
  }

  if (figure.group) {
    manager.scene.remove(figure.group);
    figure.group = null;
  }
}
