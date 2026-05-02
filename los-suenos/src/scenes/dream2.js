import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { EffectComposer, RenderPass, EffectPass, Effect, VignetteEffect } from 'postprocessing';

// Un MotionBlurPass vertical personalizado
class VerticalMotionBlurEffect extends Effect {
  constructor() {
    super('VerticalMotionBlurEffect', `
      uniform float strength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec4 color = inputColor;
        for(float i = 1.0; i <= 10.0; i++) {
          color += texture2D(inputBuffer, uv + vec2(0.0, i * strength));
          color += texture2D(inputBuffer, uv - vec2(0.0, i * strength));
        }
        outputColor = color / 21.0;
      }
    `, {
      uniforms: new Map([['strength', new THREE.Uniform(0.0)]])
    });
  }
}

let state = {
  timeElapsed: 0,
  falling: false,
  fallStartTime: 0,
  fallSpeed: 0,
  climaxTriggered: false,
  leftHand: null,
  rightHand: null,
  particles: null,
  audioCtx: null,
  windSource: null,
  initialCameraZ: 0
};

let motionBlurEffect;

export async function init(manager) {
  state = {
    timeElapsed: 0,
    falling: false,
    fallStartTime: 0,
    fallSpeed: 0,
    climaxTriggered: false,
    leftHand: null,
    rightHand: null,
    particles: null,
    audioCtx: null,
    windSource: null,
    initialCameraZ: 100
  };

  manager.camera.position.set(0, 500, 100);
  manager.camera.rotation.set(0, 0, 0);

  // 1. Postprocessing con MotionBlurPass vertical
  const composer = new EffectComposer(manager.renderer);
  const renderPass = new RenderPass(manager.scene, manager.camera);
  composer.addPass(renderPass);

  motionBlurEffect = new VerticalMotionBlurEffect();
  const vignette = new VignetteEffect({ darkness: 0.5 });
  const effectPass = new EffectPass(manager.camera, motionBlurEffect, vignette);
  composer.addPass(effectPass);
  
  manager.composer = composer;

  // 2. Ciudad diurna mejorada: bloques urbanos, calles y alturas variadas
  const cityGroup = new THREE.Group();
  const noise2D = createNoise2D();
  const blockCount = 10;
  const blockSpacing = 42;
  const citySize = blockCount * blockSpacing + 40;
  const buildingMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xb8c2cf, roughness: 0.78, metalness: 0.01 }),
    new THREE.MeshStandardMaterial({ color: 0xc7bdb0, roughness: 0.76, metalness: 0.01 }),
    new THREE.MeshStandardMaterial({ color: 0xa9b8c3, roughness: 0.7, metalness: 0.03 }),
    new THREE.MeshStandardMaterial({ color: 0xd2d6d9, roughness: 0.82, metalness: 0.0 })
  ];
  const roofMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x6d757d, roughness: 0.95, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x8a7f73, roughness: 0.92, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x73857a, roughness: 0.95, metalness: 0.0 })
  ];
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8ecff,
    roughness: 0.28,
    metalness: 0.0,
    transparent: true,
    opacity: 0.62
  });

  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofSlabGeo = new THREE.BoxGeometry(1, 1, 1);
  const windowGeo = new THREE.BoxGeometry(0.18, 0.18, 0.08);
  const antennaGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 6);
  const dummy = new THREE.Object3D();

  function addBuilding(x, z, height, width, depth, colorIndex, styleSeed) {
    const body = new THREE.Mesh(buildingGeo, buildingMaterials[colorIndex % buildingMaterials.length]);
    body.position.set(x, height / 2, z);
    body.scale.set(width, height, depth);
    cityGroup.add(body);

    const roofHeight = Math.max(1.4, height * 0.08);
    const roofInset = 0.88 + (styleSeed % 2) * 0.05;
    const roofSlab = new THREE.Mesh(roofSlabGeo, roofMaterials[styleSeed % roofMaterials.length]);
    roofSlab.position.set(x, height + roofHeight * 0.5, z);
    roofSlab.scale.set(width * roofInset, roofHeight, depth * roofInset);
    cityGroup.add(roofSlab);

    if (height > 75) {
      const crown = new THREE.Mesh(buildingGeo, roofMaterials[(styleSeed + 1) % roofMaterials.length]);
      crown.position.set(x, height + roofHeight + Math.max(2, height * 0.06), z);
      crown.scale.set(width * 0.62, Math.max(6, height * 0.18), depth * 0.62);
      cityGroup.add(crown);
    }

    const windowRows = Math.max(4, Math.floor(height / 16));
    const windowColsX = Math.max(2, Math.floor(width / 2.4));
    const windowColsZ = Math.max(2, Math.floor(depth / 2.4));
    const windowCount = Math.min(28, windowRows * (windowColsX + windowColsZ));
    const maxWindowHeight = Math.max(8, height - 10);
    for (let i = 0; i < windowCount; i++) {
      const useFrontFace = i % 2 === 0;
      const wx = x + (Math.random() - 0.5) * width * 0.72;
      const wy = 6 + Math.random() * maxWindowHeight;
      const wz = z + (Math.random() - 0.5) * depth * 0.72;
      const windowMesh = new THREE.Mesh(windowGeo, glassMaterial);
      windowMesh.position.set(wx, wy, wz);
      windowMesh.rotation.y = useFrontFace ? 0 : Math.PI / 2;
      cityGroup.add(windowMesh);
    }

    if (styleSeed % 4 === 0 && height > 60) {
      const antenna = new THREE.Mesh(antennaGeo, roofMaterials[0]);
      antenna.position.set(x + width * 0.18, height + roofHeight + 5, z - depth * 0.1);
      cityGroup.add(antenna);
    }
  }

  for (let bx = 0; bx < blockCount; bx++) {
    for (let bz = 0; bz < blockCount; bz++) {
      const blockX = (bx - blockCount / 2) * blockSpacing;
      const blockZ = (bz - blockCount / 2) * blockSpacing;
      const blockNoise = (noise2D(bx * 0.2, bz * 0.2) + 1) * 0.5;
      const blockHeightBias = Math.max(0, noise2D(bx * 0.08 + 3, bz * 0.08 - 2));
      const buildingsInBlock = 1 + Math.floor(blockNoise * 4);

      for (let i = 0; i < buildingsInBlock; i++) {
        const offsetX = (Math.random() - 0.5) * blockSpacing * 0.55;
        const offsetZ = (Math.random() - 0.5) * blockSpacing * 0.55;
        const footprintW = 8 + Math.random() * 18;
        const footprintD = 8 + Math.random() * 18;
        const height = 18 + blockNoise * 65 + blockHeightBias * 95 + Math.random() * 28;
        const slenderChance = Math.random();
        const width = slenderChance > 0.72 ? footprintW * 0.72 : footprintW;
        const depth = slenderChance > 0.72 ? footprintD * 0.72 : footprintD;
        const cityX = blockX + offsetX;
        const cityZ = blockZ + offsetZ;

        addBuilding(cityX, cityZ, height, width, depth, (bx + bz + i) % buildingMaterials.length, bx * 17 + bz * 11 + i);
      }

      if ((bx + bz) % 3 === 0) {
        const plaza = new THREE.Mesh(
          new THREE.BoxGeometry(18, 1.5, 18),
          new THREE.MeshStandardMaterial({ color: 0xb7b2a4, roughness: 0.98, metalness: 0.0 })
        );
        plaza.position.set(blockX, 0.75, blockZ);
        cityGroup.add(plaza);

        const treeGeo = new THREE.ConeGeometry(1.8, 5.5, 6);
        const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.8, 6);
        const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f5f37, roughness: 1.0 });
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4c32, roughness: 1.0 });
        for (let t = 0; t < 2; t++) {
          const tree = new THREE.Mesh(treeGeo, treeMat);
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          const treeX = blockX + (t === 0 ? -4.5 : 4.5);
          const treeZ = blockZ + (t === 0 ? 4.5 : -4.5);
          trunk.position.set(treeX, 1.1, treeZ);
          tree.position.set(treeX, 4.4, treeZ);
          cityGroup.add(trunk);
          cityGroup.add(tree);
        }
      }
    }
  }

  cityGroup.position.y = 0;
  manager.scene.add(cityGroup);

  const mapSize = citySize + 80;
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 1024;
  roadCanvas.height = 1024;
  const roadCtx = roadCanvas.getContext('2d');
  roadCtx.fillStyle = '#b8b3a7';
  roadCtx.fillRect(0, 0, 1024, 1024);
  roadCtx.globalAlpha = 1;
  roadCtx.fillStyle = '#9c927d';
  roadCtx.fillRect(0, 0, 1024, 1024);
  roadCtx.globalAlpha = 0.55;
  for (let i = 0; i < 12; i++) {
    const y = (i / 11) * 1024;
    roadCtx.fillStyle = i % 3 === 0 ? '#6d6b67' : '#7b7a76';
    roadCtx.fillRect(0, y - 9, 1024, 18);
    roadCtx.fillRect(y - 9, 0, 18, 1024);
  }
  roadCtx.globalAlpha = 0.35;
  roadCtx.strokeStyle = '#f2efe5';
  roadCtx.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    const y = (i / 11) * 1024;
    roadCtx.beginPath();
    roadCtx.moveTo(0, y);
    roadCtx.lineTo(1024, y);
    roadCtx.stroke();
    roadCtx.beginPath();
    roadCtx.moveTo(y, 0);
    roadCtx.lineTo(y, 1024);
    roadCtx.stroke();
  }
  roadCtx.globalAlpha = 0.85;
  roadCtx.fillStyle = '#7eab73';
  roadCtx.fillRect(690, 120, 200, 150);
  roadCtx.fillRect(140, 780, 260, 160);
  roadCtx.globalAlpha = 0.9;
  roadCtx.fillStyle = '#d6c9af';
  roadCtx.fillRect(470, 300, 90, 60);
  roadCtx.fillStyle = '#c9d0d4';
  roadCtx.fillRect(220, 430, 110, 70);
  roadCtx.globalAlpha = 1;
  const roadTexture = new THREE.CanvasTexture(roadCanvas);
  roadTexture.colorSpace = THREE.SRGBColorSpace;
  const roadPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(mapSize, mapSize),
    new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 1, metalness: 0 })
  );
  roadPlane.rotation.x = -Math.PI / 2;
  roadPlane.position.y = -2;
  manager.scene.add(roadPlane);

  // 3. Azotea y baranda
  const roofGeo = new THREE.BoxGeometry(20, 500, 20);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 250, 0);
  manager.scene.add(roof);

  const railGeo = new THREE.CylinderGeometry(0.1, 0.1, 20);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
  const railFront = new THREE.Mesh(railGeo, railMat);
  railFront.rotation.z = Math.PI / 2;
  railFront.position.set(0, 501, -10);
  manager.scene.add(railFront);

  // 4. Entorno diurno: más claro para distinguir la ciudad
  manager.scene.background = new THREE.Color(0xaad4ff);
  manager.scene.fog = new THREE.FogExp2(0xd7ecff, 0.00032);
  
  const hemiLight = new THREE.HemisphereLight(0xe8f7ff, 0xd8b189, 2.1);
  manager.scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff7ea, 2.8);
  sunLight.position.set(280, 420, 180);
  manager.scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xe9f4ff, 1.0);
  fillLight.position.set(-150, 160, -120);
  manager.scene.add(fillLight);

  const cloudGeo = new THREE.BufferGeometry();
  const cloudPos = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) {
    cloudPos[i * 3] = (Math.random() - 0.5) * 900;
    cloudPos[i * 3 + 1] = 520 + Math.random() * 180;
    cloudPos[i * 3 + 2] = (Math.random() - 0.5) * 900;
  }
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudPos, 3));
  const cloudMat = new THREE.PointsMaterial({ color: 0xffffff, size: 7.5, transparent: true, opacity: 0.18, depthWrite: false });
  manager.scene.add(new THREE.Points(cloudGeo, cloudMat));

  // 5. Partículas de caída
  const particleCount = 500;
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    particlePos[i*3] = (Math.random() - 0.5) * 50;
    particlePos[i*3+1] = (Math.random() - 0.5) * 50;
    particlePos[i*3+2] = (Math.random() - 0.5) * 50;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.35 });
  state.particles = new THREE.Points(particleGeo, particleMat);
  manager.camera.add(state.particles);

  // 6. Manos procedurales
  const handGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
  const handMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
  state.leftHand = new THREE.Mesh(handGeo, handMat);
  state.rightHand = new THREE.Mesh(handGeo, handMat);
  
  state.leftHand.position.set(-0.6, -1.5, -1);
  state.rightHand.position.set(0.6, -1.5, -1);
  
  manager.camera.add(state.leftHand);
  manager.camera.add(state.rightHand);

  // 7. Audio Web Audio API
  playContinuousFallSound();
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  // Animación de partículas
  const pos = state.particles.geometry.attributes.position.array;
  for (let i = 0; i < 500; i++) {
    pos[i*3] += 30 * deltaTime;
    if (pos[i*3] > 25) pos[i*3] -= 50;
    
    // Movimiento en Z para sensación de caída
    pos[i*3+2] += 20 * deltaTime;
    if (pos[i*3+2] > 25) pos[i*3+2] -= 50;
    
    if (state.falling) {
      pos[i*3+1] += state.fallSpeed * deltaTime * 0.5;
      if (pos[i*3+1] > 25) pos[i*3+1] -= 50;
    }
  }
  state.particles.geometry.attributes.position.needsUpdate = true;

  // Inicio de la caída
  if (state.timeElapsed >= 4 && !state.falling) {
    state.falling = true;
    state.fallStartTime = state.timeElapsed;
  }

  if (state.falling && !state.climaxTriggered) {
    const t = state.timeElapsed - state.fallStartTime;
    
    // Tilt de cámara
    manager.camera.rotation.z = THREE.MathUtils.lerp(manager.camera.rotation.z, THREE.MathUtils.degToRad(15), deltaTime * 2);
    
    // Shake de cámara
    const shake = Math.min(t * 0.05, 0.15);
    manager.camera.position.x = (Math.random() - 0.5) * shake;
    
    // Aceleración gravitacional con descenso en Z
    state.fallSpeed += 9.8 * 4 * deltaTime;
    manager.camera.position.y -= state.fallSpeed * deltaTime;
    manager.camera.position.z -= state.fallSpeed * deltaTime * 0.8;

    // Motion Blur: más suave al principio y más rápido al acercarse al impacto
    const impactProximity = THREE.MathUtils.clamp(1 - manager.camera.position.y / 120, 0, 1);
    const blurIntensity = Math.min((state.fallSpeed * 0.00015) + impactProximity * 0.03, 0.06);
    motionBlurEffect.uniforms.get('strength').value = blurIntensity;

    // Manos procedurales
    state.leftHand.rotation.z = Math.min(t * 1.5, Math.PI / 3);
    state.rightHand.rotation.z = -Math.min(t * 1.5, Math.PI / 3);
    state.leftHand.position.y = -1.5 + Math.min(t * 0.8, 1.0);
    state.rightHand.position.y = -1.5 + Math.min(t * 0.8, 1.0);

    // Clímax: cuando se aproxima al suelo
    if (manager.camera.position.y < 50) {
      triggerClimax(manager);
    }
  }
}

function triggerClimax(manager) {
  state.climaxTriggered = true;
  
  // Detener sonido de caída y reproducir impacto
  if (state.windSource) {
    state.windSource.stop();
  }
  
  playImpactBoom();

  // Flash blanco brutal
  const whiteGeo = new THREE.PlaneGeometry(2, 2);
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  const whitePlane = new THREE.Mesh(whiteGeo, whiteMat);
  whitePlane.position.z = -0.11;
  manager.camera.add(whitePlane);

  let flashOpacity = 0;
  const interval = setInterval(() => {
    flashOpacity += 0.16;
    whiteMat.opacity = flashOpacity;
    
    motionBlurEffect.uniforms.get('strength').value = Math.min(motionBlurEffect.uniforms.get('strength').value + 0.03, 0.14);

    if (flashOpacity >= 1.0) {
      clearInterval(interval);
      manager.fadeMaterial.opacity = 1;
      manager.camera.remove(whitePlane);
      
      manager.transitionTo('hub');
    }
  }, 16);
}

function playContinuousFallSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    state.audioCtx = new AudioContext();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
    
    const now = state.audioCtx.currentTime;
    const duration = 20; // Sonido largo de caída
    
    // Generar ruido para sonido de caída por aire (silbido realista)
    const bufferSize = Math.floor(state.audioCtx.sampleRate * duration);
    const buffer = state.audioCtx.createBuffer(1, bufferSize, state.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      // Intensidad creciente de caída
      const intensity = Math.pow(t, 1.3);
      data[i] = (Math.random() * 2 - 1) * intensity * 0.6;
    }
    
    state.windSource = state.audioCtx.createBufferSource();
    state.windSource.buffer = buffer;
    
    // Filtro pasa-banda para sonido de caída realista (silbido de aire)
    const filter = state.audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(1500, now + 15);
    filter.Q.setValueAtTime(1.5, now);
    filter.Q.exponentialRampToValueAtTime(2.5, now + 15);
    
    const gainNode = state.audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.2, now);
    gainNode.gain.exponentialRampToValueAtTime(1.2, now + 15);
    gainNode.gain.exponentialRampToValueAtTime(0.8, now + 20);
    
    state.windSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(state.audioCtx.destination);
    
    state.windSource.start(now);
  } catch (e) {
    console.warn("Fall sound error", e);
  }
}

function playImpactBoom() {
  try {
    if (!state.audioCtx) return;
    const now = state.audioCtx.currentTime;
    
    // Impacto grave profundo
    const bass = state.audioCtx.createOscillator();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(150, now);
    bass.frequency.exponentialRampToValueAtTime(20, now + 1.2);
    
    const bassGain = state.audioCtx.createGain();
    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(2.0, now + 0.1);
    bassGain.gain.exponentialRampToValueAtTime(0.05, now + 1.2);
    
    bass.connect(bassGain);
    bassGain.connect(state.audioCtx.destination);
    bass.start(now);
    bass.stop(now + 1.2);
  } catch (e) {
    console.error("Impact boom error", e);
  }
}

export function dispose(manager) {
  if (manager.composer) {
    manager.composer.dispose();
    manager.composer = null;
  }
  
  if (state.windSource) {
    state.windSource.stop();
  }
  
  if (state.audioCtx && state.audioCtx.state !== 'closed') {
    state.audioCtx.close();
  }
  
  if (state.leftHand) manager.camera.remove(state.leftHand);
  if (state.rightHand) manager.camera.remove(state.rightHand);
  if (state.particles) manager.camera.remove(state.particles);
}
