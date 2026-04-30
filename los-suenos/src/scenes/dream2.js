import * as THREE from 'three';
import { Howl } from 'howler';
import { createNoise2D } from 'simplex-noise';
import { EffectComposer, RenderPass, EffectPass, Effect, VignetteEffect } from 'postprocessing';

// Un MotionBlurPass vertical personalizado, ya que postprocessing no incluye un MotionBlur direccional sin buffer de velocidad por defecto.
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
  particles: null
};

let windSound, heartbeatSound;
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
    particles: null
  };

  manager.camera.position.set(0, 500, 0);
  manager.camera.rotation.set(0, 0, 0);

  // 1. Postprocessing con MotionBlurPass vertical
  const composer = new EffectComposer(manager.renderer);
  const renderPass = new RenderPass(manager.scene, manager.camera);
  composer.addPass(renderPass);

  motionBlurEffect = new VerticalMotionBlurEffect();
  const vignette = new VignetteEffect({ darkness: 0.6 });
  const effectPass = new EffectPass(manager.camera, motionBlurEffect, vignette);
  composer.addPass(effectPass);
  
  manager.composer = composer; // Inyectamos el composer

  // 2. Ciudad nocturna (Grilla procedural)
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x050510,
    roughness: 0.8,
    emissive: 0x223355,
    emissiveIntensity: 0.2
  });
  
  const gridSize = 50;
  const spacing = 15;
  const cityMesh = new THREE.InstancedMesh(geometry, material, gridSize * gridSize);
  
  const dummy = new THREE.Object3D();
  const noise2D = createNoise2D();
  let idx = 0;
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const px = (x - gridSize / 2) * spacing;
      const pz = (z - gridSize / 2) * spacing;
      
      const heightNoise = (noise2D(x * 0.1, z * 0.1) + 1) * 0.5; 
      const height = 50 + heightNoise * 400; 
      
      dummy.position.set(px, height / 2, pz);
      dummy.scale.set(12, height, 12);
      dummy.updateMatrix();
      
      cityMesh.setMatrixAt(idx, dummy.matrix);
      idx++;
    }
  }
  cityMesh.instanceMatrix.needsUpdate = true;
  manager.scene.add(cityMesh);

  // 3. Azotea y baranda
  const roofGeo = new THREE.BoxGeometry(20, 500, 20);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 250, 0); // La parte superior queda en Y=500
  manager.scene.add(roof);

  const railGeo = new THREE.CylinderGeometry(0.1, 0.1, 20);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
  const railFront = new THREE.Mesh(railGeo, railMat);
  railFront.rotation.z = Math.PI / 2;
  railFront.position.set(0, 501, -10);
  manager.scene.add(railFront);

  // 4. Entorno: Estrellas y Niebla
  manager.scene.background = new THREE.Color(0x020205);
  manager.scene.fog = new THREE.FogExp2(0x050510, 0.002);
  
  const hemiLight = new THREE.HemisphereLight(0x222244, 0x000000, 0.5);
  manager.scene.add(hemiLight);

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(2000 * 3);
  for(let i=0; i<2000; i++) {
    starPos[i*3] = (Math.random() - 0.5) * 1000;
    starPos[i*3+1] = 500 + Math.random() * 500;
    starPos[i*3+2] = (Math.random() - 0.5) * 1000;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.0 });
  manager.scene.add(new THREE.Points(starGeo, starMat));

  // 5. Partículas de viento
  const particleCount = 500;
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    particlePos[i*3] = (Math.random() - 0.5) * 50;
    particlePos[i*3+1] = (Math.random() - 0.5) * 50;
    particlePos[i*3+2] = (Math.random() - 0.5) * 50;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.2, transparent: true, opacity: 0.5 });
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

  // 7. Audio (Howler) - Ignoramos errores 404 si los archivos no existen y usamos buffers genéricos
  windSound = new Howl({ src: ['/assets/wind.mp3'], loop: true, volume: 0.3 });
  heartbeatSound = new Howl({ src: ['/assets/heartbeat.mp3'], loop: true, volume: 0 });
  windSound.play();
  heartbeatSound.play();
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  // Animación del viento
  const pos = state.particles.geometry.attributes.position.array;
  for (let i = 0; i < 500; i++) {
    pos[i*3] += 30 * deltaTime; // Pasan de izquierda a derecha
    if (pos[i*3] > 25) pos[i*3] -= 50;
    
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
    
    // Tilt de cámara (rotación lateral)
    manager.camera.rotation.z = THREE.MathUtils.lerp(manager.camera.rotation.z, THREE.MathUtils.degToRad(15), deltaTime * 2);
    
    // Shake de cámara
    const shake = Math.min(t * 0.05, 0.15);
    manager.camera.position.x = (Math.random() - 0.5) * shake;
    manager.camera.position.z = (Math.random() - 0.5) * shake;
    
    // Aceleración gravitacional
    state.fallSpeed += 9.8 * 4 * deltaTime; // Multiplicado para más intensidad visual
    manager.camera.position.y -= state.fallSpeed * deltaTime;

    // Motion Blur (Aumenta con la velocidad)
    const blurIntensity = Math.min(state.fallSpeed * 0.0003, 0.08);
    motionBlurEffect.uniforms.get('strength').value = blurIntensity;

    // Manos procedurales
    state.leftHand.rotation.z = Math.min(t * 1.5, Math.PI / 3);
    state.rightHand.rotation.z = -Math.min(t * 1.5, Math.PI / 3);
    state.leftHand.position.y = -1.5 + Math.min(t * 0.8, 1.0);
    state.rightHand.position.y = -1.5 + Math.min(t * 0.8, 1.0);

    // Audio dinámico
    windSound.rate(1 + t * 0.3);
    windSound.volume(Math.min(0.3 + t * 0.1, 1.0));
    heartbeatSound.volume(Math.min(t * 0.2, 1.0));
    heartbeatSound.rate(1 + t * 0.15);

    // Clímax
    if (manager.camera.position.y < 100) {
      triggerClimax(manager);
    }
  }
}

function triggerClimax(manager) {
  state.climaxTriggered = true;
  
  // Flash blanco brutal
  const whiteGeo = new THREE.PlaneGeometry(2, 2);
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  const whitePlane = new THREE.Mesh(whiteGeo, whiteMat);
  whitePlane.position.z = -0.11; // Delante del fade de transición
  manager.camera.add(whitePlane);

  let flashOpacity = 0;
  const interval = setInterval(() => {
    flashOpacity += 0.08;
    whiteMat.opacity = flashOpacity;
    
    // Desenfoque extremo
    motionBlurEffect.uniforms.get('strength').value += 0.01;

    if (flashOpacity >= 1.0) {
      clearInterval(interval);
      manager.fadeMaterial.opacity = 1; // Corte a negro instantáneo
      manager.camera.remove(whitePlane);
      
      windSound.stop();
      heartbeatSound.stop();
      
      manager.transitionTo('hub');
    }
  }, 16);
}

export function dispose(manager) {
  if (manager.composer) {
    manager.composer.dispose();
    manager.composer = null;
  }
  if (windSound) windSound.unload();
  if (heartbeatSound) heartbeatSound.unload();
}
