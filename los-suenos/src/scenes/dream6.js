import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, ChromaticAberrationEffect } from 'postprocessing';
import { Howl } from 'howler';

let state = {
    timeElapsed: 0,
    climaxTriggered: false,
    climaxTimer: 0,
    mirrorCam: null,
    mirrorTarget: null,
    mirrorScene: null,
    mirrorMat: null,
    floorMat: null,
    wallsMat: null,
    audioCtx: null,
    sineOsc: null,
    sineGain: null,
    glitchValue: 0,
    playerZ: 15, // Distancia inicial
    figureLight: null,
    audioElement: null,
    text1: null,
    text2: null
};

let keys = { w: false };
let keydownListener, keyupListener;

export async function init(manager) {
    state = {
        timeElapsed: 0,
        climaxTriggered: false,
        climaxTimer: 0,
        mirrorCam: null,
        mirrorTarget: null,
        mirrorScene: null,
        mirrorMat: null,
        floorMat: null,
        wallsMat: null,
        audioCtx: null,
        sineOsc: null,
        sineGain: null,
        glitchValue: 0,
        playerZ: 12,
        figureLight: null,
        audioElement: null,
        text1: null,
        text2: null
    };

    keys = { w: false };
    keydownListener = (e) => { if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.w = true; };
    keyupListener = (e) => { if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.w = false; };
    window.addEventListener('keydown', keydownListener);
    window.addEventListener('keyup', keyupListener);

    manager.camera.position.set(0, 1.6, state.playerZ);
    manager.camera.rotation.set(0, 0, 0);
    manager.scene.background = new THREE.Color(0x000000);
    manager.scene.fog = null;

    // --- Render Target y Escena Secundaria (El Cuarto del Reflejo) ---
    state.mirrorTarget = new THREE.WebGLRenderTarget(1024, 1024, {
        format: THREE.RGBAFormat,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter
    });
    // La cámara del espejo debe coincidir con el FOV de la cámara principal
    state.mirrorCam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

    state.mirrorScene = new THREE.Scene();
    state.mirrorScene.background = new THREE.Color(0x030308);
    state.mirrorScene.fog = new THREE.Fog(0x030308, 5, 20);

    // --- Mundo Reflejado (Hub Room) ---
    const roomGroup = new THREE.Group();
    roomGroup.position.z = 2; // Desplazamos el cuarto para que la pared frontal quede en Z=0 (el espejo)
    
    const roomMat = new THREE.MeshStandardMaterial({
      color: 0x1f1f1f,
      roughness: 0.9,
      side: THREE.DoubleSide
    });

    // Pared Trasera (Z = 2)
    const frontGeo = new THREE.PlaneGeometry(5, 3);
    const backWall = new THREE.Mesh(frontGeo, roomMat);
    backWall.position.set(0, 1.5, 2);
    roomGroup.add(backWall);

    // Pared Derecha (X = 2.5)
    const sideWallGeo = new THREE.PlaneGeometry(4, 3);
    const rightWall = new THREE.Mesh(sideWallGeo, roomMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(2.5, 1.5, 0);
    roomGroup.add(rightWall);

    // Pared Izquierda (X = -2.5)
    const leftWall = new THREE.Mesh(sideWallGeo, roomMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-2.5, 1.5, 0);
    roomGroup.add(leftWall);

    // Piso de madera
    const floorGeo = new THREE.PlaneGeometry(5, 4);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.8 });
    const roomFloor = new THREE.Mesh(floorGeo, floorMat);
    roomFloor.rotation.x = -Math.PI / 2;
    roomFloor.position.y = 0.01;
    roomGroup.add(roomFloor);

    // Techo
    const ceilWall = new THREE.Mesh(floorGeo, roomMat);
    ceilWall.rotation.x = Math.PI / 2;
    ceilWall.position.y = 3;
    roomGroup.add(ceilWall);

    // Cama (Esquina X=1.5, Z=1)
    const bedGroup = new THREE.Group();
    bedGroup.position.set(1.6, 0, 0.8);
    roomGroup.add(bedGroup);

    const bedFrameMat = new THREE.MeshStandardMaterial({ color: 0x1f110a, roughness: 0.9 });
    const bedFrameGeo = new THREE.BoxGeometry(1.45, 0.3, 2.05);
    const bedFrame = new THREE.Mesh(bedFrameGeo, bedFrameMat);
    bedFrame.position.y = 0.15;
    bedGroup.add(bedFrame);

    const mattressGeo = new THREE.BoxGeometry(1.4, 0.2, 2);
    const mattressMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.9 });
    const mattress = new THREE.Mesh(mattressGeo, mattressMat);
    mattress.position.y = 0.4;
    bedGroup.add(mattress);

    const pillowGeo = new THREE.BoxGeometry(0.5, 0.12, 0.35);
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9 });
    const pillow1 = new THREE.Mesh(pillowGeo, pillowMat);
    pillow1.position.set(-0.35, 0.56, 0.7);
    pillow1.rotation.x = -0.1;
    const pillow2 = new THREE.Mesh(pillowGeo, pillowMat);
    pillow2.position.set(0.35, 0.56, 0.7);
    pillow2.rotation.x = -0.15;
    pillow2.rotation.y = 0.1;
    bedGroup.add(pillow1, pillow2);

    const blanketGeo = new THREE.BoxGeometry(1.42, 0.05, 1.2);
    const blanketMat = new THREE.MeshStandardMaterial({ color: 0x1f2e4d, roughness: 0.8 });
    const blanket = new THREE.Mesh(blanketGeo, blanketMat);
    blanket.position.set(0, 0.525, -0.4);
    bedGroup.add(blanket);

    // Silla
    const chairGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.85 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), woodMat); seat.position.y = 0.4; chairGroup.add(seat);
    const legGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.4);
    const l1 = new THREE.Mesh(legGeo, woodMat); l1.position.set(-0.18, 0.2, -0.18);
    const l2 = new THREE.Mesh(legGeo, woodMat); l2.position.set(0.18, 0.2, -0.18);
    const l3 = new THREE.Mesh(legGeo, woodMat); l3.position.set(-0.18, 0.2, 0.18);
    const l4 = new THREE.Mesh(legGeo, woodMat); l4.position.set(0.18, 0.2, 0.18);
    const backRestGeo = new THREE.BoxGeometry(0.4, 0.4, 0.05);
    const backRest = new THREE.Mesh(backRestGeo, woodMat); backRest.position.set(0, 0.625, -0.175);
    chairGroup.add(l1, l2, l3, l4, backRest);
    chairGroup.position.set(-1.0, 0, 0.5);
    chairGroup.rotation.y = Math.PI / 4;
    roomGroup.add(chairGroup);

    // Mesita de luz
    const tableGroup = new THREE.Group();
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.4), woodMat); tableTop.position.y = 0.5;
    const tl1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.5), woodMat); tl1.position.set(-0.2, 0.25, -0.15);
    const tl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.5), woodMat); tl2.position.set(0.2, 0.25, -0.15);
    const tl3 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.5), woodMat); tl3.position.set(-0.2, 0.25, 0.15);
    const tl4 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.5), woodMat); tl4.position.set(0.2, 0.25, 0.15);
    tableGroup.add(tableTop, tl1, tl2, tl3, tl4);
    tableGroup.position.set(2.1, 0, -0.6);
    roomGroup.add(tableGroup);

    // Figura durmiendo (silueta humana con primitivas)
    const figureMat = new THREE.MeshStandardMaterial({ color: 0x778899 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.8 });

    // Cabeza sobre la almohada
    const headGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.scale.set(1, 0.9, 1);
    head.position.set(0.05, 0.62, 0.65);
    bedGroup.add(head);

    // Pelo
    const hairGeo = new THREE.SphereGeometry(0.13, 12, 12);
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1a1008 });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.scale.set(1, 0.8, 1);
    hair.position.set(0.05, 0.65, 0.68);
    bedGroup.add(hair);

    // Torso (de costado, tapado parcialmente por la sábana)
    const torsoGeo = new THREE.CapsuleGeometry(0.15, 0.4, 4, 8);
    const torso = new THREE.Mesh(torsoGeo, figureMat);
    torso.rotation.x = Math.PI / 2;
    torso.rotation.z = 0.15; // Leve inclinación lateral
    torso.position.set(0.05, 0.6, 0.25);
    bedGroup.add(torso);

    // Brazo visible (sobre la sábana)
    const armGeo = new THREE.CapsuleGeometry(0.04, 0.3, 4, 8);
    const arm = new THREE.Mesh(armGeo, skinMat);
    arm.rotation.x = Math.PI / 2;
    arm.rotation.z = -0.3;
    arm.position.set(-0.15, 0.58, 0.15);
    bedGroup.add(arm);

    // Piernas (bajo la sábana, se notan como bulto)
    const legBulge1 = new THREE.CapsuleGeometry(0.1, 0.5, 4, 8);
    const leg1 = new THREE.Mesh(legBulge1, figureMat);
    leg1.rotation.x = Math.PI / 2;
    leg1.position.set(0.1, 0.55, -0.35);
    bedGroup.add(leg1);

    const leg2 = new THREE.Mesh(legBulge1, figureMat);
    leg2.rotation.x = Math.PI / 2;
    leg2.position.set(-0.05, 0.52, -0.4);
    bedGroup.add(leg2);

    // Sábana/Manta cubriendo el cuerpo (caja suave con leve elevación)
    const blanketCoverGeo = new THREE.BoxGeometry(1.3, 0.08, 1.4);
    const blanketCoverMat = new THREE.MeshStandardMaterial({ color: 0x1f2e4d, roughness: 0.85 });
    const blanketCover = new THREE.Mesh(blanketCoverGeo, blanketCoverMat);
    blanketCover.position.set(0, 0.57, 0);
    blanketCover.rotation.z = 0.02; // Leve inclinación natural
    bedGroup.add(blanketCover);

    state.mirrorFigure = head; // Para aplicar glitch

    state.figureLight = new THREE.PointLight(0xffaa66, 1.5, 10);
    state.figureLight.position.set(1.6, 1.5, 0.8);
    roomGroup.add(state.figureLight);

    // Luz tenue del techo (simula lámpara apagada con algo de brillo residual)
    const ceilingLight = new THREE.PointLight(0x334466, 0.4, 8);
    ceilingLight.position.set(0, 2.8, 1);
    roomGroup.add(ceilingLight);

    // Brillo tenue de ventana (luz exterior nocturna entrando)
    const windowLight = new THREE.RectAreaLight(0x223355, 0.6, 1.2, 1.5);
    windowLight.position.set(-2.49, 1.8, 1.0);
    windowLight.rotation.y = Math.PI / 2;
    roomGroup.add(windowLight);

    // Marca de ventana en la pared izquierda (rectángulo emisivo)
    const windowGeo = new THREE.PlaneGeometry(1.0, 1.3);
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x112244,
      emissive: 0x112244,
      emissiveIntensity: 0.8,
      roughness: 0.3
    });
    const windowMesh = new THREE.Mesh(windowGeo, windowMat);
    windowMesh.rotation.y = Math.PI / 2;
    windowMesh.position.set(-2.48, 1.8, 1.0);
    roomGroup.add(windowMesh);
    
    state.mirrorScene.add(roomGroup);
    state.mirrorScene.add(new THREE.AmbientLight(0x1a1a2e, 0.6));

    // --- Mundo Real (El Espacio Vacío) ---

    // Marco del espejo
    const frameGeo = new THREE.BoxGeometry(2.2, 3.2, 0.1);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x110a05, roughness: 0.9 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 1.6, 0);
    manager.scene.add(frame);

    // Superficie del espejo
    const mirrorGeo = new THREE.PlaneGeometry(2, 3);
    state.mirrorMat = new THREE.MeshStandardMaterial({
        map: state.mirrorTarget.texture,
        emissiveMap: state.mirrorTarget.texture,
        emissive: 0xaaaaaa, // Previene que se vuelva negro por el metalness
        roughness: 0.05,
        metalness: 0.3,
        color: 0xdddddd
    });
    const mirrorMesh = new THREE.Mesh(mirrorGeo, state.mirrorMat);
    mirrorMesh.position.set(0, 1.6, 0.06);
    manager.scene.add(mirrorMesh);

    // Luz real frente al espejo
    const portalLight = new THREE.PointLight(0xffddaa, 2.5, 20);
    portalLight.position.set(0, 1.6, 1.0);
    manager.scene.add(portalLight);

    // --- Audio ---
    // Crear elemento de audio
    state.audioElement = document.createElement('audio');
    state.audioElement.src = '/assets/Así vive una persona con Esquizofrenia (8D Experiencia) audio real (mp3cut.net).mp3';
    state.audioElement.loop = true;
    state.audioElement.volume = 0.5;
    state.audioElement.crossOrigin = 'anonymous';
    state.audioElement.autoplay = true;
    document.body.appendChild(state.audioElement);
    
    // Intentar reproducir inmediatamente
    const playPromise = state.audioElement.play();
    if (playPromise !== undefined) {
        playPromise.catch(e => {
            console.warn('Autoplay blocked, waiting for user interaction:', e);
            // Reanudar audio con primer click o tecla
            const resumeAudio = () => {
                state.audioElement.play().catch(err => console.warn('Play failed:', err));
                document.removeEventListener('click', resumeAudio);
                document.removeEventListener('keydown', resumeAudio);
            };
            document.addEventListener('click', resumeAudio, { once: true });
            document.addEventListener('keydown', resumeAudio, { once: true });
        });
    }

    // Crear overlay de texto
    state.textOverlay = document.createElement('div');
    
    // Agregar Google Fonts para fuente horrorosa
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Creepster&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
    
    // Mensaje 1
    const text1 = document.createElement('div');
    text1.id = 'dream6-msg1';
    text1.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Creepster', cursive;
        font-size: 72px;
        color: #ff3333;
        text-align: center;
        pointer-events: none;
        z-index: 100;
        line-height: 1.5;
        text-shadow: 0 0 20px rgba(255, 0, 0, 0.8), 0 0 40px rgba(0, 0, 0, 1);
        opacity: 1;
        letter-spacing: 2px;
    `;
    text1.innerHTML = '¿Se terminó?';
    document.body.appendChild(text1);
    state.text1 = text1;
    
    // Mensaje 2
    const text2 = document.createElement('div');
    text2.id = 'dream6-msg2';
    text2.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Creepster', cursive;
        font-size: 72px;
        color: #ff3333;
        text-align: center;
        pointer-events: none;
        z-index: 100;
        line-height: 1.5;
        text-shadow: 0 0 20px rgba(255, 0, 0, 0.8), 0 0 40px rgba(0, 0, 0, 1);
        opacity: 0;
        letter-spacing: 2px;
    `;
    text2.innerHTML = 'Y... ¿Si nunca comenzó?';
    document.body.appendChild(text2);
    state.text2 = text2;

    // Suelo Procedural (Grietas)
    state.floorMat = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            crackIntensity: { value: 0 }
        },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      uniform float crackIntensity;
      
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
      }
      
      void main() {
        float n = noise(vUv * 20.0);
        float n2 = noise(vUv * 50.0 + time * 0.5);
        float cracks = smoothstep(0.48, 0.5, n) * smoothstep(0.52, 0.5, n);
        cracks += smoothstep(0.49, 0.5, n2) * smoothstep(0.51, 0.5, n2) * 0.5;
        
        vec3 color = vec3(0.0); // Completamente negro
        vec3 crackColor = vec3(1.0, 1.0, 1.0) * crackIntensity;
        
        gl_FragColor = vec4(color + cracks * crackColor * crackIntensity, 1.0);
      }
    `,
    transparent: true
  });
  const worldFloorGeo = new THREE.PlaneGeometry(20, 20);
  const worldFloor = new THREE.Mesh(worldFloorGeo, state.floorMat);
  worldFloor.rotation.x = -Math.PI / 2;
  manager.scene.add(worldFloor);

  // Paredes invisibles estáticas
  state.wallsMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, staticIntensity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      uniform float staticIntensity;
      float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }
      void main() {
        float n = rand(vUv * 100.0 + time);
        gl_FragColor = vec4(vec3(n), staticIntensity * (n * 0.5 + 0.5));
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false
  });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(10, 10, state.playerZ + 5), state.wallsMat);
  walls.position.set(0, 5, state.playerZ / 2);
  manager.scene.add(walls);

  // Postprocessing
  const composer = new EffectComposer(manager.renderer);
  composer.addPass(new RenderPass(manager.scene, manager.camera));
  
  state.caEffect = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0) });
  composer.addPass(new EffectPass(manager.camera, state.caEffect));
  manager.composer = composer;

  setupAudio();

  // Reproducir audio principal del sueño 6 al iniciar
  try {
    state.bgMusic = new Howl({ src: ['/assets/Así vive una persona con Esquizofrenia (8D Experiencia) audio real (mp3cut.net).mp3'], loop: false, volume: 0.9 });
    state.bgMusic.play();
  } catch (e) { console.warn('dream6 bgMusic err', e); }
}

function setupAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    state.audioCtx = ctx;

    state.sineOsc = ctx.createOscillator();
    state.sineOsc.type = 'sine';
    state.sineOsc.frequency.value = 40; 

    state.sineGain = ctx.createGain();
    state.sineGain.gain.value = 0.0;

    state.sineOsc.connect(state.sineGain);
    state.sineGain.connect(ctx.destination);
    state.sineOsc.start();

    const resumeAudio = () => {
      if (ctx.state === 'suspended') ctx.resume();
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('keydown', resumeAudio);
  } catch (e) { console.warn("Audio err", e); }
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  state.floorMat.uniforms.time.value = state.timeElapsed;
  state.wallsMat.uniforms.time.value = state.timeElapsed;

  // --- Control de textos según posición del jugador ---
  const pz = manager.camera.position.z;
  
  // Texto 1: visible al inicio, fade out cuando el jugador baja de Z=10
  if (pz >= 10) {
    state.text1.style.opacity = '1';
    state.text2.style.opacity = '0';
  } else if (pz >= 7) {
    // Fade out texto 1, fade in texto 2 (entre Z=10 y Z=7)
    const t = (10 - pz) / 3; // 0 en Z=10, 1 en Z=7
    state.text1.style.opacity = String(1 - t);
    state.text2.style.opacity = String(t);
  } else if (pz >= 4) {
    // Texto 2 visible, fade out al seguir avanzando
    const t = (7 - pz) / 3; // 0 en Z=7, 1 en Z=4
    state.text1.style.opacity = '0';
    state.text2.style.opacity = String(1 - t);
  } else {
    // Ambos textos ocultos — el espejo queda visible
    state.text1.style.opacity = '0';
    state.text2.style.opacity = '0';
  }

  if (state.climaxTriggered) {
    state.climaxTimer += deltaTime;
    
    // Fade a negro y aberración máxima (3 segundos)
    const progress = Math.min(state.climaxTimer / 3.0, 1.0);
    
    state.caEffect.offset.set(progress * 0.05, progress * 0.05);
    manager.fadeMaterial.opacity = progress;

    if (state.sineOsc) {
      state.sineOsc.frequency.value = 40 + progress * 60; // Sube hasta 100Hz
      state.sineGain.gain.value = progress * 0.5;
    }

    if (progress >= 1.0) {
      manager.transitionTo('hub_final');
    }
    return;
  }

  // Caminar solo hacia adelante
  if (keys.w && manager.camera.position.z > 0.5) {
    manager.camera.position.z -= 1.5 * deltaTime;
  }
  
  const distance = manager.camera.position.z;

  // Reflejo más nítido al acercarse
  const blur = Math.max(0.05, distance * 0.05);
  state.mirrorMat.roughness = blur;

  // La cámara del espejo se mueve de forma espejada respecto al plano Z=0
  state.mirrorCam.position.set(manager.camera.position.x, manager.camera.position.y, -distance);
  const lookAtZ = -distance + 5; 
  state.mirrorCam.lookAt(0, manager.camera.position.y, lookAtZ);

  // Distorsión Final (< 1.5 unidades)
  if (distance < 1.5) {
    state.glitchValue = (1.5 - distance) / 1.0; 
    
    state.floorMat.uniforms.crackIntensity.value = state.glitchValue;
    state.wallsMat.uniforms.staticIntensity.value = state.glitchValue * 0.5;
    
    const caOffset = state.glitchValue * 0.01;
    state.caEffect.offset.set(caOffset, caOffset);

    // Glitch en el reflejo
    if (Math.random() < state.glitchValue * 0.4) {
      state.figureLight.intensity = Math.random() * 3.0;
      state.mirrorCam.position.x += (Math.random() - 0.5) * 0.2;
      state.mirrorCam.position.y += (Math.random() - 0.5) * 0.2;
      
      if (state.mirrorFigure) {
        state.mirrorFigure.position.x = (Math.random() - 0.5) * 0.2;
        state.mirrorFigure.position.z = (Math.random() - 0.5) * 0.2;
      }
    } else {
      state.figureLight.intensity = 1.0;
      if (state.mirrorFigure) {
        state.mirrorFigure.position.x = 0;
        state.mirrorFigure.position.z = 0;
      }
    }

    if (distance < 0.6) {
      state.climaxTriggered = true;
    }

    // Fade out del audio externo durante la distorsión
    if (state.bgMusic && !state.audioFadingOut) {
      state.audioFadingOut = true;
      state.bgMusic.fade(state.bgMusic.volume(), 0, 1500); // Fade 1.5s
    }
    if (state.audioElement && !state.audioElementFading) {
      state.audioElementFading = true;
      const fadeInterval = setInterval(() => {
        if (state.audioElement && state.audioElement.volume > 0.02) {
          state.audioElement.volume = Math.max(0, state.audioElement.volume - 0.03);
        } else {
          if (state.audioElement) state.audioElement.volume = 0;
          clearInterval(fadeInterval);
        }
      }, 50);
    }
  }

  // Renderizar la escena paralela en la textura del espejo
  manager.renderer.setRenderTarget(state.mirrorTarget);
  manager.renderer.render(state.mirrorScene, state.mirrorCam);
  manager.renderer.setRenderTarget(null);
}

export function dispose(manager) {
  window.removeEventListener('keydown', keydownListener);
  window.removeEventListener('keyup', keyupListener);
  
  // Limpiar audio
  if (state.audioElement) {
    state.audioElement.pause();
    state.audioElement.src = '';
    document.body.removeChild(state.audioElement);
  }
  
  // Limpiar textos
  if (state.text1 && document.body.contains(state.text1)) {
    document.body.removeChild(state.text1);
  }
  if (state.text2 && document.body.contains(state.text2)) {
    document.body.removeChild(state.text2);
  }
  
  if (manager.composer) {
    manager.composer.dispose();
    manager.composer = null;
  }
  if (state.mirrorTarget) {
    state.mirrorTarget.dispose();
  }
  if (state.bgMusic) {
    try { state.bgMusic.stop(); state.bgMusic.unload(); } catch (e) {}
    state.bgMusic = null;
  }
  if (state.audioCtx && state.audioCtx.state !== 'closed') {
    state.audioCtx.close();
  }
}
