import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

let seaMesh;
let waveMesh;
let state;
let audioCtx;
let waterMaterial;
let keys = { w: false, a: false, s: false, d: false };
let keydownListener, keyupListener;

export function init(manager) {
  state = {
    timeElapsed: 0,
    waveActive: false,
    impacted: false,
    impacted: false,
    shakeIntensity: 0,
    initialCameraY: 0.6, // Agua hasta las rodillas
    lastSplashTime: 0,
  };

  manager.camera.position.set(0, state.initialCameraY, 0);

  // Niebla y entorno (Atmósfera gris/tormentosa)
  manager.scene.background = new THREE.Color(0x8899aa);
  manager.scene.fog = new THREE.FogExp2(0x667788, 0.015); // Niebla un poco menos densa para ver el cielo

  // Cielo hiperrealista (Sky shader)
  const sky = new Sky();
  sky.scale.setScalar(10000);
  manager.scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10; 
  skyUniforms['rayleigh'].value = 3.0; // Alta dispersión para cielos anaranjados/rojizos
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.7;

  // Sol tocando el horizonte (atardecer dramático)
  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(89.2); // Justo sobre el horizonte
  const theta = THREE.MathUtils.degToRad(180);
  sun.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms['sunPosition'].value.copy(sun);

  // Generar EnvMap para los reflejos dorados en el agua
  const pmremGenerator = new THREE.PMREMGenerator(manager.renderer);
  const renderTarget = pmremGenerator.fromScene(sky);
  manager.scene.environment = renderTarget.texture;

  const hemiLight = new THREE.HemisphereLight(0xff9955, 0x002244, 0.8); // Cielo naranja, reflejo marino
  manager.scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0xffaa55, 1.5); // Sol dorado
  // Posición rasante: casi a ras del agua (Y=5) iluminando la ola de frente (+Z)
  dirLight.position.set(0, 5, 50);
  manager.scene.add(dirLight);

  // Textura de Normales para el agua (importada dinámicamente)
  const textureLoader = new THREE.TextureLoader();
  const waterNormals = textureLoader.load('/textures/waternormals.jpg');
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  waterNormals.repeat.set(8, 8); // Olas normales un poco más grandes y notorias

  // Material de agua HIPERREALISTA
  waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x012a3a, // Azul marino profundo para contrastar con el naranja del atardecer
    metalness: 0.9, // Más metálico para reflejar el cielo dorado
    roughness: 0.08, // Superficie un poco más lisa para reflejos nítidos
    normalMap: waterNormals,
    normalScale: new THREE.Vector2(1.5, 1.5), // Relieve del agua más fuerte
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
    clearcoatNormalMap: waterNormals,
    clearcoatNormalScale: new THREE.Vector2(1.0, 1.0),
    transparent: true,
    opacity: 0.90,
    side: THREE.DoubleSide
  });

  // Mar infinito (Plano animado)
  const seaGeo = new THREE.PlaneGeometry(300, 300, 150, 150); // Mayor resolución
  seaGeo.rotateX(-Math.PI / 2);
  seaMesh = new THREE.Mesh(seaGeo, waterMaterial);
  manager.scene.add(seaMesh);

  // Ola gigante (Muro de agua que curvaremos dinámicamente)
  const waveGeo = new THREE.PlaneGeometry(400, 40, 128, 64);
  
  // Clonamos el material para la ola para controlar sus texturas independientemente y que no se estiren
  const waveMaterial = waterMaterial.clone();
  const waveNormals = waterNormals.clone();
  waveNormals.needsUpdate = true;
  waveNormals.repeat.set(20, 2); // Proporción adaptada a la geometría ancha de la ola
  waveMaterial.normalMap = waveNormals;
  waveMaterial.clearcoatNormalMap = waveNormals;

  waveMesh = new THREE.Mesh(waveGeo, waveMaterial);
  waveMesh.position.set(0, 0, -100);
  waveMesh.visible = false;
  manager.scene.add(waveMesh);

  // Input events
  keydownListener = (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
  };
  keyupListener = (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
  };
  window.addEventListener('keydown', keydownListener);
  window.addEventListener('keyup', keyupListener);

  const ui = document.createElement('div');
  ui.id = 'scene-ui';
  ui.style.position = 'absolute';
  ui.style.top = '10px';
  ui.style.left = '10px';
  ui.style.color = 'white';
  ui.style.fontFamily = 'sans-serif';
  ui.style.textShadow = '1px 1px 2px black';
  ui.style.pointerEvents = 'none';
  ui.innerHTML = '<h1>El Sueño del Mar</h1><p>Haz click para mover la cámara.</p><p>Usa WASD para caminar lento por el agua.</p>';
  document.body.appendChild(ui);
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  // Animar texturas del material de agua (micro-oleaje hiperrealista)
  if (waterMaterial && waterMaterial.normalMap) {
    waterMaterial.normalMap.offset.x += 0.015 * deltaTime;
    waterMaterial.normalMap.offset.y += 0.01 * deltaTime;
  }
  // La textura de la ola gigante se desliza hacia abajo imitando agua cayendo por la pared
  if (waveMesh && waveMesh.material.normalMap) {
    waveMesh.material.normalMap.offset.x += 0.015 * deltaTime;
    waveMesh.material.normalMap.offset.y -= 0.06 * deltaTime; 
  }

  // Animar olas del mar (macro-oleaje)
  if (seaMesh) {
    const time = state.timeElapsed;
    const positions = seaMesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i); 
      // Múltiples frecuencias para un oleaje caótico y realista
      const waveHeight = 
        Math.sin(x * 0.2 + time) * 0.1 + 
        Math.cos(z * 0.2 + time * 0.8) * 0.1 +
        Math.sin(x * 0.5 - time * 1.5) * 0.05 +
        Math.cos(z * 0.4 + time * 1.2) * 0.05;
      positions.setY(i, waveHeight); 
    }
    positions.needsUpdate = true;
    seaMesh.geometry.computeVertexNormals(); // Para que la luz reaccione al oleaje
  }

  // Movimiento del jugador
  if (!state.impacted) {
    let speedMult = 1.0;
    if (state.waveActive) {
      const dist = Math.abs(waveMesh.position.z - manager.camera.position.z);
      // Más cerca de la ola = más lento (baja hasta el 10% de velocidad)
      speedMult = Math.max(0.1, dist / 80);
    }

    // Velocidad base lenta (porque está en el agua)
    const speed = 1.5 * speedMult * deltaTime;
    
    if (keys.w) manager.controls.moveForward(speed);
    if (keys.s) manager.controls.moveForward(-speed);
    if (keys.a) manager.controls.moveRight(-speed);
    if (keys.d) manager.controls.moveRight(speed);
    
    // Sonido de pasos en el agua
    const isMoving = keys.w || keys.s || keys.a || keys.d;
    if (isMoving && state.timeElapsed - state.lastSplashTime > 0.6) {
      playSplashSound();
      state.lastSplashTime = state.timeElapsed;
    }

    // Forzar altura de la cámara (para no volar ni hundirse)
    manager.camera.position.y = state.initialCameraY;
  }

  // Lógica de la Ola Gigante
  if (state.timeElapsed >= 8 && !state.waveActive && !state.impacted) {
    state.waveActive = true;
    waveMesh.visible = true;
    // Aparece en el horizonte a 80 unidades de distancia
    waveMesh.position.z = manager.camera.position.z - 80;
    waveMesh.position.x = manager.camera.position.x;
  }

  if (state.waveActive && !state.impacted) {
    waveMesh.position.z += 6 * deltaTime; // Avanza más lento (6 unidades/seg)
    
    const growth = state.timeElapsed - 8;
    // Crece en escala
    const scale = 0.2 + growth * 0.4;
    waveMesh.scale.set(1, scale, scale);
    // Ajustar Y para que la base de la ola (-20 local) quede al nivel del agua
    waveMesh.position.y = 20 * scale - 2; 

    // Prevenir el estiramiento de la textura escalando las repeticiones UV verticalmente
    waveMesh.material.normalMap.repeat.set(20, 2 * scale);

    // Animar turbulencia de la ola gigante
    const wPos = waveMesh.geometry.attributes.position;
    for (let i = 0; i < wPos.count; i++) {
      const x = wPos.getX(i);
      const y = wPos.getY(i);
      // y va de -20 a 20
      const ny = (y + 20) / 40; 
      // Curva principal de la cresta hacia adelante (+Z)
      const baseZ = Math.pow(ny, 3) * 20; 
      // Turbulencia orgánica hiper caótica sumando múltiples ondas de ruido
      const noise = 
        Math.sin(x * 0.2 + state.timeElapsed * 2) * 1.5 + 
        Math.cos(y * 0.4 + x * 0.1 + state.timeElapsed * 4) * 2.5 +
        Math.sin(x * 0.8 - y * 0.3 - state.timeElapsed * 6) * 1.0;
      
      const turbZ = noise * ny; // El ruido es más violento en la cresta
      wPos.setZ(i, baseZ + turbZ);
    }
    wPos.needsUpdate = true;
    waveMesh.geometry.computeVertexNormals();

    // Comprobar Impacto
    if (waveMesh.position.z >= manager.camera.position.z - 2) {
      triggerImpact(manager);
    }
  }

  // Camera Shake (Impacto)
  if (state.shakeIntensity > 0) {
    const rx = (Math.random() - 0.5) * state.shakeIntensity;
    const ry = (Math.random() - 0.5) * state.shakeIntensity;
    const rz = (Math.random() - 0.5) * state.shakeIntensity;
    
    manager.camera.position.x += rx;
    manager.camera.position.y = state.initialCameraY + ry;
    manager.camera.position.z += rz;
    
    state.shakeIntensity *= 0.95; // Disminuye lentamente
  }
}

function triggerImpact(manager) {
  state.impacted = true;
  state.shakeIntensity = 3.0; // Shake fuerte
  
  playMuffledSound();

  // Llamar a la transición al HUB
  manager.transitionTo('hub');
}

function playMuffledSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx = new AudioContext();
    
    // Ruido blanco
    const bufferSize = audioCtx.sampleRate * 3.0; // 3 segundos
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    
    // Filtro pasa bajos para el sonido ahogado bajo el agua
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(100, audioCtx.currentTime); // muy ahogado
    
    // Envolvente de volumen (Fade in y fade out)
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(1.5, audioCtx.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 2.8);
    
    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    noiseSource.start();
  } catch (e) {
    console.error("Audio API error", e);
  }
}

function playSplashSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const now = audioCtx.currentTime;
    const bufferSize = audioCtx.sampleRate * 0.3; // Corto para un paso
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    // Bandpass para simular chapoteo de agua
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300 + Math.random() * 300, now); // Variación aleatoria
    
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.4, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    noise.start(now);
  } catch(e) {
    console.warn("Splash sound error", e);
  }
}

export function dispose(manager) {
  window.removeEventListener('keydown', keydownListener);
  window.removeEventListener('keyup', keyupListener);
  
  manager.scene.fog = null;
  manager.camera.position.y = 1.6; // Restaurar altura promedio al salir
  
  const ui = document.getElementById('scene-ui');
  if (ui) ui.remove();

  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close();
  }
}
