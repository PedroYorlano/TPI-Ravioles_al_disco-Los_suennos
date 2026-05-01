import * as THREE from 'three';
import { Howl } from 'howler';
import { EffectComposer, RenderPass, EffectPass, DepthOfFieldEffect, VignetteEffect } from 'postprocessing';

const CHUNK_SIZE = 4;
const VISIBLE_FORWARD = 20;
const VISIBLE_BACKWARD = 5;

let state = {};
let chunks = {};
let materials = {};
let sounds = {};

let keys = { w: false, a: false, s: false, d: false };

const keydownListener = (e) => {
  if (e.key === 'w' || e.key === 'W') keys.w = true;
  if (e.key === 'a' || e.key === 'A') keys.a = true;
  if (e.key === 's' || e.key === 'S') keys.s = true;
  if (e.key === 'd' || e.key === 'D') keys.d = true;
};

const keyupListener = (e) => {
  if (e.key === 'w' || e.key === 'W') keys.w = false;
  if (e.key === 'a' || e.key === 'A') keys.a = false;
  if (e.key === 's' || e.key === 'S') keys.s = false;
  if (e.key === 'd' || e.key === 'D') keys.d = false;
};

export async function init(manager) {
  window.addEventListener('keydown', keydownListener);
  window.addEventListener('keyup', keyupListener);

  state = {
    timeElapsed: 0,
    lastStepTime: 0,
    lastStalkerStepTime: 0,
    climaxTriggered: false,
    doorAnimEvent: 15,
    activeDoor: null,
    doorAnimPhase: 0, // 0 = closed, 1 = opening, 2 = holding, 3 = closing
    climaxPhase: 0,
    climaxLight: null,
    climaxTimer: 0
  };

  chunks = {};

  manager.camera.position.set(0, 1.5, 0);
  manager.camera.rotation.set(0, 0, 0);
  manager.scene.background = new THREE.Color(0x050505);
  manager.scene.fog = new THREE.FogExp2(0x050505, 0.05);

  // Postprocessing: Profundidad de campo y viñeta
  const composer = new EffectComposer(manager.renderer);
  const renderPass = new RenderPass(manager.scene, manager.camera);
  composer.addPass(renderPass);

  const dof = new DepthOfFieldEffect(manager.camera, {
    focusDistance: 0.03, // ~3 metros adelante
    focalLength: 0.1,
    bokehScale: 4.0
  });
  const vignette = new VignetteEffect({ darkness: 0.5 });
  const effectPass = new EffectPass(manager.camera, dof, vignette);
  composer.addPass(effectPass);
  manager.composer = composer;

  // Texturas procedurales (Canvas API)
  createMaterials();

  // Audio
  sounds.hum = new Howl({ src: ['/assets/fluorescent_hum.wav'], loop: true, volume: 0.2 });
  sounds.step = new Howl({ src: ['/assets/footstep_carpet.wav'], volume: 0.5 });
  sounds.stalkerStep = new Howl({ src: ['/assets/footstep_carpet.wav'], volume: 0.0 });
  sounds.breath = new Howl({ src: ['/assets/breath_heavy.wav'], loop: true, volume: 0.0 });
  
  sounds.hum.play();
  sounds.breath.play();
}

function createMaterials() {
  // Piso (Moquette)
  const fCanvas = document.createElement('canvas');
  fCanvas.width = 128; fCanvas.height = 128;
  const fCtx = fCanvas.getContext('2d');
  fCtx.fillStyle = '#4e5a58'; fCtx.fillRect(0,0,128,128);
  fCtx.strokeStyle = '#2e3a38'; fCtx.lineWidth = 3;
  fCtx.beginPath(); fCtx.moveTo(0,0); fCtx.lineTo(128,128); fCtx.stroke();
  fCtx.beginPath(); fCtx.moveTo(128,0); fCtx.lineTo(0,128); fCtx.stroke();
  const floorTex = new THREE.CanvasTexture(fCanvas);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;

  // Pared (Wallpaper amarillo viejo)
  const wCanvas = document.createElement('canvas');
  wCanvas.width = 256; wCanvas.height = 256;
  const wCtx = wCanvas.getContext('2d');
  wCtx.fillStyle = '#b7a76b'; wCtx.fillRect(0,0,256,256);
  for(let i=0; i<300; i++) {
    wCtx.fillStyle = `rgba(0,0,0,${Math.random()*0.06})`;
    wCtx.fillRect(Math.random()*256, Math.random()*256, 1, 15);
  }
  const wallTex = new THREE.CanvasTexture(wCanvas);

  // Techo
  const cCanvas = document.createElement('canvas');
  cCanvas.width = 128; cCanvas.height = 128;
  const cCtx = cCanvas.getContext('2d');
  cCtx.fillStyle = '#dddddd'; cCtx.fillRect(0,0,128,128);
  cCtx.strokeStyle = '#999999'; cCtx.lineWidth = 2;
  cCtx.strokeRect(0,0,128,128);
  const ceilTex = new THREE.CanvasTexture(cCanvas);

  materials.floor = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1.0 });
  materials.wall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  materials.ceil = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1.0 });
  materials.door = new THREE.MeshStandardMaterial({ color: 0x4a3219, roughness: 0.8 });
  materials.frame = new THREE.MeshStandardMaterial({ color: 0x222222 });
}

function updateChunks(manager) {
  const currentZ = manager.camera.position.z;
  const currentIndex = Math.floor(currentZ / CHUNK_SIZE);

  const startIdx = currentIndex - VISIBLE_BACKWARD;
  const endIdx = currentIndex + VISIBLE_FORWARD;

  // Destruir chunks viejos
  for (let key in chunks) {
    const idx = parseInt(key);
    if (idx < startIdx || idx > endIdx) {
      const c = chunks[key];
      manager.scene.remove(c.group);
      delete chunks[key];
    }
  }

  // Crear chunks nuevos
  for (let i = startIdx; i <= endIdx; i++) {
    if (!chunks[i]) {
      chunks[i] = generateChunk(manager, i);
    }
  }
}

function generateChunk(manager, index) {
  const group = new THREE.Group();
  const zPos = index * CHUNK_SIZE;
  group.position.set(0, 0, zPos);

  const w = 3; // Ancho del pasillo
  const h = 2.5; // Alto
  const d = CHUNK_SIZE; // Profundidad

  // Piso y techo
  const floorGeo = new THREE.PlaneGeometry(w, d);
  const floor = new THREE.Mesh(floorGeo, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  
  const ceil = new THREE.Mesh(floorGeo, materials.ceil);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;

  group.add(floor, ceil);

  // Paredes (Izquierda y Derecha) con huecos para puertas
  const wallGeo = new THREE.PlaneGeometry(d, h);
  
  // Left wall Group
  const leftGroup = new THREE.Group();
  leftGroup.position.set(-w/2, h/2, 0);
  leftGroup.rotation.y = Math.PI / 2;
  const leftWall = new THREE.Mesh(wallGeo, materials.wall);
  leftGroup.add(leftWall);
  
  // Puerta Izquierda
  const doorGeo = new THREE.PlaneGeometry(1.2, 2.0);
  const leftDoor = new THREE.Mesh(doorGeo, materials.door);
  leftDoor.position.set(0, -0.25, 0.01);
  // Un wrapper para rotar la puerta desde el borde
  const lDoorPivot = new THREE.Group();
  lDoorPivot.position.set(-0.6, 0, 0);
  leftDoor.position.set(0.6, -0.25, 0.01);
  lDoorPivot.add(leftDoor);
  leftGroup.add(lDoorPivot);

  // Right wall Group
  const rightGroup = new THREE.Group();
  rightGroup.position.set(w/2, h/2, 0);
  rightGroup.rotation.y = -Math.PI / 2;
  const rightWall = new THREE.Mesh(wallGeo, materials.wall);
  rightGroup.add(rightWall);

  const rightDoor = new THREE.Mesh(doorGeo, materials.door);
  rightDoor.position.set(0, -0.25, 0.01);
  rightGroup.add(rightDoor); // Esta no se abre por ahora

  group.add(leftGroup, rightGroup);

  // Luces (Una cada 2 chunks)
  let light = null;
  if (index % 2 === 0) {
    light = new THREE.PointLight(0xccffee, 1.0, 15);
    light.position.set(0, h - 0.2, 0);
    group.add(light);
    
    // Luminaria fluorescente
    const bulbGeo = new THREE.BoxGeometry(0.2, 0.05, 1.2);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, h - 0.03, 0);
    group.add(bulb);
  }

  manager.scene.add(group);
  return { group, index, light, lDoorPivot, leftDoor };
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  if (state.climaxTriggered) {
    updateClimax(deltaTime, manager);
    return;
  }

  const speed = 2.5 * deltaTime;
  const isMoving = keys.w || keys.a || keys.s || keys.d;

  if (keys.w) manager.controls.moveForward(speed);
  if (keys.s) manager.controls.moveForward(-speed);
  // Movimiento lateral bloqueado o restringido para no atravesar paredes
  
  // Forzar mantener al jugador en el centro del pasillo en X y a la altura correcta
  manager.camera.position.x = THREE.MathUtils.lerp(manager.camera.position.x, 0, deltaTime * 5);
  manager.camera.position.y = 1.5;

  updateChunks(manager);

  // Chequeo de mirada hacia atrás
  const dir = new THREE.Vector3();
  manager.camera.getWorldDirection(dir);
  const lookingBack = dir.z > 0; // Cámara inicial mira a -Z. Si dir.z > 0, mira hacia +Z (atrás)

  // Efecto de Curvatura Progresiva (A partir de los 30s)
  if (state.timeElapsed > 30) {
    const factor = Math.min((state.timeElapsed - 30) / 15, 1.0); // Sube gradualmente en 15s
    const amplitude = 4.0 * factor;
    const freq = 0.06;
    
    for (let key in chunks) {
      const c = chunks[key];
      const relZ = c.group.position.z - manager.camera.position.z;
      
      // Curva matemática: piso bajo el jugador = 0, se curva exponencialmente en la distancia
      const targetY = amplitude * (1 - Math.cos(relZ * freq));
      const targetRotX = -amplitude * freq * Math.sin(relZ * freq);
      
      c.group.position.y = targetY;
      c.group.rotation.x = targetRotX;
    }
  }

  // Parpadeo de luces
  const flickerChance = state.timeElapsed > 30 ? 0.05 : 0.01;
  for (let key in chunks) {
    const c = chunks[key];
    if (c.light) {
      if (Math.random() < flickerChance) {
        c.light.intensity = Math.random() * 0.5;
      } else {
        c.light.intensity = THREE.MathUtils.lerp(c.light.intensity, 1.0, deltaTime * 10);
      }
    }
  }

  // Evento de puerta que se abre (Cada 15s)
  if (state.timeElapsed > state.doorAnimEvent) {
    state.doorAnimEvent += 15;
    // Buscar un chunk adelante
    const currentZ = manager.camera.position.z;
    const targetIdx = Math.floor(currentZ / CHUNK_SIZE) - 6; // 6 chunks adelante
    if (chunks[targetIdx] && chunks[targetIdx].lDoorPivot) {
      state.activeDoor = chunks[targetIdx].lDoorPivot;
      state.doorAnimPhase = 1;
    }
  }

  if (state.activeDoor) {
    if (state.doorAnimPhase === 1) { // Abriendo
      state.activeDoor.rotation.y = THREE.MathUtils.lerp(state.activeDoor.rotation.y, Math.PI / 6, deltaTime * 2);
      if (state.activeDoor.rotation.y > 0.5) state.doorAnimPhase = 2; // Mantener
    } else if (state.doorAnimPhase === 2) { // Cerrando rápido
      state.activeDoor.rotation.y = THREE.MathUtils.lerp(state.activeDoor.rotation.y, 0, deltaTime * 10);
      if (state.activeDoor.rotation.y < 0.01) {
        state.activeDoor.rotation.y = 0;
        state.activeDoor = null;
        state.doorAnimPhase = 0;
      }
    }
  }

  // Audio: Pasos del jugador
  if (isMoving && state.timeElapsed - state.lastStepTime > 0.5) {
    sounds.step.play();
    state.lastStepTime = state.timeElapsed;
  }

  // Audio: Pasos del stalker (atrás)
  if (!lookingBack && isMoving && state.timeElapsed - state.lastStalkerStepTime > 0.55) {
    sounds.stalkerStep.play();
    state.lastStalkerStepTime = state.timeElapsed;
  }
  
  // Volumen de respiración y stalker sube con el tiempo
  const stalkerVol = Math.min(state.timeElapsed / 45, 1.0) * (lookingBack ? 0 : 1);
  sounds.stalkerStep.volume(stalkerVol);
  
  const breathVol = Math.max(0, (state.timeElapsed - 25) / 20) * (lookingBack ? 0 : 0.8);
  sounds.breath.volume(breathVol);

  // Disparar Clímax a los 45s
  if (state.timeElapsed > 45 && !state.climaxTriggered) {
    triggerClimax(manager);
  }
}

function triggerClimax(manager) {
  state.climaxTriggered = true;
  state.climaxPhase = 1;
  state.climaxTimer = 0;

  // Apagar absolutamente todas las luces
  for (let key in chunks) {
    if (chunks[key].light) {
      chunks[key].light.intensity = 0;
      chunks[key].light.color.setHex(0xff0000); // Cambio sutil imperceptible si no se enciende
    }
  }

  manager.scene.fog = null;

  // Luz de clímax frente al jugador
  state.climaxLight = new THREE.PointLight(0xffffff, 2.0, 5);
  // Ponerla 3 unidades adelante de la cámara
  const dir = new THREE.Vector3();
  manager.camera.getWorldDirection(dir);
  state.climaxLight.position.copy(manager.camera.position).add(dir.multiplyScalar(3));
  manager.scene.add(state.climaxLight);

  sounds.hum.stop();
  sounds.breath.volume(1.0);
}

function updateClimax(deltaTime, manager) {
  state.climaxTimer += deltaTime;

  // Parpadeo agresivo
  if (state.climaxLight) {
    state.climaxLight.intensity = Math.random() > 0.5 ? 2.0 : 0.0;
  }

  if (state.climaxTimer > 3.0) {
    // Apagar todo y transición
    if (state.climaxLight) state.climaxLight.intensity = 0;
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
  
  // Limpiar chunks
  for (let key in chunks) {
    manager.scene.remove(chunks[key].group);
  }
  chunks = {};

  if (state.climaxLight) manager.scene.remove(state.climaxLight);

  for (let key in sounds) {
    if (sounds[key]) sounds[key].unload();
  }
}
