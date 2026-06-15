import * as THREE from 'three';
import { Howl } from 'howler';

window.hubVisitCount = window.hubVisitCount || 0;

const DREAM_SEQUENCE = ['dream1', 'dream2', 'dream3', 'dream4', 'dream5', 'dream6'];

let state = {};
let doorLight, moonlight;
let audioCtx;

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

  window.hubVisitCount++;
  const visit = window.hubVisitCount;

  state = {
    timeElapsed: 0,
    lastStepTime: 0,
    transitioning: false,
    visit: visit,
    nearDoor: false,
    manager,
    rainSound: null,
    lightningLight: null,
    lightningTimer: 2 + Math.random() * 4,
    lightningFlash: false,
    lightningFlashTime: 0,
    lightningPeak: 12,
    rainGeo: null,
    rainMesh: null,
    music: null,
    doorPrompt: null,
    eKeyListener: null,
  };

  // Cámara inicial (ajustada según la visita para evitar colisiones)
  if (visit === 1) {
    // Viene de la cinemática de introducción
    manager.camera.position.set(0, 1.7, -0.3);
  } else {
    // Al volver de los sueños, aparece en el fondo de la habitación (seguro contra colisiones)
    manager.camera.position.set(0, 1.7, 1.5);
  }
  manager.camera.rotation.set(0, 0, 0);
  manager.controls.enabled = true;

  // Limpiar niebla, background y environment global
  manager.scene.background = new THREE.Color(0x000000);
  manager.scene.fog = null;
  manager.scene.environment = null;

  // Cuarto: 5x4x3 (W:5, H:3, D:4). 
  // Construido con planos individuales para permitir un agujero real en la ventana lateral
  const roomMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, side: THREE.DoubleSide });

  // Techo
  const ceilGeo = new THREE.PlaneGeometry(5, 4);
  const ceiling = new THREE.Mesh(ceilGeo, roomMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3;
  manager.scene.add(ceiling);

  // Pared Frontal (Z = -2)
  const frontGeo = new THREE.PlaneGeometry(5, 3);
  const frontWall = new THREE.Mesh(frontGeo, roomMat);
  frontWall.position.set(0, 1.5, -2);
  manager.scene.add(frontWall);

  // Pared Trasera (Z = 2)
  const backWall = new THREE.Mesh(frontGeo, roomMat);
  backWall.position.set(0, 1.5, 2);
  manager.scene.add(backWall);

  // Pared Derecha (X = 2.5)
  const sideWallGeo = new THREE.PlaneGeometry(4, 3);
  const rightWall = new THREE.Mesh(sideWallGeo, roomMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(2.5, 1.5, 0);
  manager.scene.add(rightWall);

  // Pared Izquierda (X = -2.5) ensamblada en 4 partes para dejar un hueco de 1.5x1.5 en el centro
  const lBot = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.75), roomMat);
  lBot.position.set(-2.5, 0.375, 0); lBot.rotation.y = Math.PI / 2;
  const lTop = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.75), roomMat);
  lTop.position.set(-2.5, 2.625, 0); lTop.rotation.y = Math.PI / 2;
  const lFront = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.5), roomMat);
  lFront.position.set(-2.5, 1.5, -1.375); lFront.rotation.y = Math.PI / 2;
  const lBack = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.5), roomMat);
  lBack.position.set(-2.5, 1.5, 1.375); lBack.rotation.y = Math.PI / 2;
  manager.scene.add(lBot, lTop, lFront, lBack);

  // Piso de madera con normal map procedural
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 512;
  floorCanvas.height = 512;
  const ctx = floorCanvas.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    const x = Math.random() * 512;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 10, 512);
    ctx.stroke();
  }
  const woodTexture = new THREE.CanvasTexture(floorCanvas);
  woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
  woodTexture.repeat.set(4, 4);

  const floorGeo = new THREE.PlaneGeometry(5, 4);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x2b1d14, // Madera oscura
    roughness: 0.8,
    bumpMap: woodTexture,
    bumpScale: 0.08
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01; // Ligeramente encima del BoxBackSide
  manager.scene.add(floor);

  // Puerta iluminada al frente (Z = -2)
  const doorGroup = new THREE.Group();
  doorGroup.position.set(0, 0, -1.99);

  const doorFrameMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.9,
    side: THREE.DoubleSide
  });
  const doorFrameThickness = 0.08;
  const doorFrameTop = new THREE.Mesh(new THREE.BoxGeometry(1.38, doorFrameThickness, 0.09), doorFrameMat);
  doorFrameTop.position.set(0, 2.0, 0.025);
  const doorFrameBottom = new THREE.Mesh(new THREE.BoxGeometry(1.38, doorFrameThickness, 0.09), doorFrameMat);
  doorFrameBottom.position.set(0, 0.0, 0.025);
  const doorFrameLeft = new THREE.Mesh(new THREE.BoxGeometry(doorFrameThickness, 2.0, 0.09), doorFrameMat);
  doorFrameLeft.position.set(-0.69, 1.0, 0.025);
  const doorFrameRight = new THREE.Mesh(new THREE.BoxGeometry(doorFrameThickness, 2.0, 0.09), doorFrameMat);
  doorFrameRight.position.set(0.69, 1.0, 0.025);
  doorGroup.add(doorFrameTop, doorFrameBottom, doorFrameLeft, doorFrameRight);

  const innerGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffc47d,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
  });
  const innerGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.9), innerGlowMat);
  innerGlow.position.set(0, 0.95, 0.04);
  doorGroup.add(innerGlow);

  const doorGeo = new THREE.BoxGeometry(0.94, 1.84, 0.08);
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x24150d,
    roughness: 0.78,
    metalness: 0.03
  });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.92, 0.05);
  doorGroup.add(door);

  const doorPanelMat = new THREE.MeshStandardMaterial({
    color: 0x2c1a10,
    roughness: 0.82,
    metalness: 0.02
  });
  const panelGeo = new THREE.BoxGeometry(0.78, 0.38, 0.02);
  const panelTop = new THREE.Mesh(panelGeo, doorPanelMat);
  panelTop.position.set(0, 1.33, 0.075);
  const panelBottom = new THREE.Mesh(panelGeo, doorPanelMat);
  panelBottom.position.set(0, 0.56, 0.075);
  doorGroup.add(panelTop, panelBottom);

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xb88a4d, metalness: 0.65, roughness: 0.3 })
  );
  handle.position.set(0.32, 0.9, 0.085);
  doorGroup.add(handle);

  manager.scene.add(doorGroup);

  // Luz que se filtra por debajo de la puerta
  doorLight = new THREE.PointLight(0xffb055, 0.7, 3.0); // Luz cálida de corto alcance
  doorLight.position.set(0, 0.95, -2.1); // Detrás de la puerta, centrada para iluminar el hueco
  manager.scene.add(doorLight);

  // Luz de ambiente casi nula
  const ambient = new THREE.AmbientLight(0xffffff, 0.02);
  manager.scene.add(ambient);

  // Ventana lateral (X = -2.5)
  const windowGroup = new THREE.Group();
  windowGroup.position.set(-2.49, 1.5, 0);
  windowGroup.rotation.y = Math.PI / 2;
  manager.scene.add(windowGroup);

  // Visita 3: Ventana negra sin luna
  if (visit >= 3) {
    const windowGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const windowMesh = new THREE.Mesh(windowGeo, windowMat);
    windowGroup.add(windowMesh);
  } else {
    // Shaders procedurales para la ventana exterior
    const windowVertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
    `;

    const windowFragmentShader = `
    uniform float uTime;
    varying vec2 vUv;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
        vec2 uv = vUv;

        // 1. Cielo nocturno
        vec3 zenithColor = vec3(5.0/255.0, 10.0/255.0, 20.0/255.0); // #050a14
        vec3 horizonColor = vec3(10.0/255.0, 22.0/255.0, 40.0/255.0); // #0a1628
        vec3 skyColor = mix(horizonColor, zenithColor, uv.y);

        // Estrellas
        // Como es un cilindro panorámico, escalamos X para compensar el ratio (942 ancho vs 300 alto)
        vec2 st = vec2(uv.x * 3.14, uv.y);
        float starNoise = random(st * 5000.0);
        float starThreshold = 0.995;
        if (starNoise > starThreshold) {
            float starIntensity = (starNoise - starThreshold) / (1.0 - starThreshold);
            float twinkle = sin(uTime * (random(uv) * 5.0 + 1.0)) * 0.5 + 0.5;
            skyColor += vec3(starIntensity * twinkle);
        }

        gl_FragColor = vec4(skyColor, 1.0);
    }
    `;

    state.windowUniforms = {
      uTime: { value: 0 }
    };

    // Cilindro gigante que envuelve la habitación (cielo panorámico 360)
    // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded)
    const windowGeo = new THREE.CylinderGeometry(150, 150, 300, 32, 1, true);
    const windowMat = new THREE.ShaderMaterial({
      vertexShader: windowVertexShader,
      fragmentShader: windowFragmentShader,
      uniforms: state.windowUniforms,
      side: THREE.BackSide, // Vemos la parte interior del cilindro
      transparent: false
    });

    const windowMesh = new THREE.Mesh(windowGeo, windowMat);
    // Centrado en la habitación, envolviendo todo el escenario
    windowMesh.position.set(0, 0, 0);
    windowGroup.add(windowMesh);

    // EXTERIOR 3D
    state.exteriorGroup = new THREE.Group();
    windowGroup.add(state.exteriorGroup);

    // LUNA - Textura Procedural de Cráteres
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 1024;
    moonCanvas.height = 1024;
    const ctxMoon = moonCanvas.getContext('2d');

    // Base lunar
    ctxMoon.fillStyle = '#b0b5a8';
    ctxMoon.fillRect(0, 0, 1024, 1024);

    // Ruido suave
    for (let i = 0; i < 4000; i++) {
      ctxMoon.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctxMoon.fillRect(Math.random() * 1024, Math.random() * 1024, 4, 4);
    }

    // Cráteres procedimentales
    for (let i = 0; i < 400; i++) {
      const cx = Math.random() * 1024;
      const cy = Math.random() * 1024;
      // Algunos cráteres enormes (mares), muchos pequeños
      const r = Math.random() > 0.9 ? (20 + Math.random() * 40) : (2 + Math.random() * 15);

      const grad = ctxMoon.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grad.addColorStop(0, 'rgba(80, 85, 75, 0.4)');
      grad.addColorStop(0.7, 'rgba(130, 140, 130, 0.2)');
      grad.addColorStop(0.9, 'rgba(180, 190, 180, 0.4)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctxMoon.fillStyle = grad;
      ctxMoon.beginPath();
      ctxMoon.arc(cx, cy, r, 0, Math.PI * 2);
      ctxMoon.fill();
    }
    const moonTex = new THREE.CanvasTexture(moonCanvas);
    moonTex.anisotropy = 4;

    const moonGeo = new THREE.SphereGeometry(4, 64, 64);
    const moonMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      bumpMap: moonTex,
      bumpScale: 0.15,
      emissive: 0xf0f4e8,
      emissiveMap: moonTex,
      emissiveIntensity: 0.25, // Bajamos la emisividad general para dejar actuar a las sombras
      color: 0xeeeeee,
      roughness: 0.9,
      metalness: 0.1
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.receiveShadow = false;

    // Asignamos la luna a su grupo (sin hacks de capas)
    const moonLocalX = -15;
    const moonLocalY = 25;
    const moonLocalZ = -80;
    moonMesh.position.set(moonLocalX, moonLocalY, moonLocalZ);
    state.exteriorGroup.add(moonMesh);

    // LUZ PARA DARLE FASE/VOLUMEN A LA LUNA (Solo ilumina la luna y muere rápido)
    const moonSun = new THREE.PointLight(0xfff5e6, 3.5, 30);
    // Posicionada muy cerca de la luna (arriba y a la izquierda en coords locales)
    moonSun.position.set(moonLocalX - 8, moonLocalY + 8, moonLocalZ + 8);
    state.exteriorGroup.add(moonSun);

    // LUZ DE LA LUNA HACIA EL INTERIOR
    // Se agrega a la escena global para iluminar bien el interior
    const moonLight = new THREE.PointLight(0xcce0ff, 0.8, 200);
    // La ventana está en global (-2.49, 1.5, 0) rota Math.PI/2 en Y
    // Transformación correcta: X_global = -2.49 + Z_local, Z_global = -X_local
    moonLight.position.set(-2.49 + moonLocalZ, 1.5 + moonLocalY, -moonLocalX);
    manager.scene.add(moonLight);
    state.moonLight = moonLight;

    // SUELO EXTERIOR
    const floorExtGeo = new THREE.PlaneGeometry(100, 100);
    const floorExtMat = new THREE.MeshStandardMaterial({
      color: 0x03060a, // Verde oscuro casi negro
      roughness: 1
    });
    const floorExtMesh = new THREE.Mesh(floorExtGeo, floorExtMat);
    floorExtMesh.rotation.x = -Math.PI / 2;
    // Empujamos el plano en Z a -55 para que su borde más cercano no invada la habitación
    floorExtMesh.position.set(0, -0.75, -50);
    state.exteriorGroup.add(floorExtMesh);

    // LUZ AMBIENTAL EXTERIOR
    const extAmbient = new THREE.AmbientLight(0x0a1020, 0.1);
    state.exteriorGroup.add(extAmbient);

    // ÁRBOLES
    const treeMat = new THREE.MeshStandardMaterial({
      color: 0x050a0f,
      roughness: 0.9,
      metalness: 0
    });

    for (let i = 0; i < 100; i++) {
      const treeGroup = new THREE.Group();
      const height = 3 + Math.random() * 4; // Entre 3 y 7

      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(height * 0.25, height * 0.5, 8), treeMat);
      cone1.position.y = height * 0.25;
      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(height * 0.2, height * 0.45, 8), treeMat);
      cone2.position.y = height * 0.5;
      const cone3 = new THREE.Mesh(new THREE.ConeGeometry(height * 0.15, height * 0.4, 8), treeMat);
      cone3.position.y = height * 0.75;

      treeGroup.add(cone1, cone2, cone3);

      // Z entre -10 y -75
      const zPos = -10 - Math.random() * 65;

      // Distribuir en X de manera uniforme a lo largo del plano
      const fraction = i / 99.0; // De 0 a 1
      const spread = Math.abs(zPos) * 2.5 + 20; // Ancho generoso
      const xPos = -spread / 2 + spread * fraction + (Math.random() - 0.5) * (spread * 0.1);

      treeGroup.position.set(xPos, -0.75, zPos); // Alineado con el borde inferior del marco
      state.exteriorGroup.add(treeGroup);
    }

    // -------------------------------------------------------------
    // VOLUMETRIC MOON LIGHT BEAM & DUST PARTICLES
    // -------------------------------------------------------------
    // Dirección desde la luna (punto medio: alejado de la ventana y más hacia la cama sin invadirla)
    const directionVec = new THREE.Vector3(65, -35, -12).normalize();
    const beamLength = (-1.5 / directionVec.y) / 0.85; // Ajuste automático de longitud según el ángulo para tocar el suelo

    const beamGeo = new THREE.CylinderGeometry(0.7, 1.0, beamLength, 32, 1, true);
    beamGeo.translate(0, -beamLength / 2, 0);

    const beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x88bbff) }, // Color azulado de la luna
        uIntensity: { value: 0.05 } // Reducido (antes 0.15) para hacerlo más discreto y sutil
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          // 1. Desvanecimiento suave en los extremos
          float verticalFade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.8, vUv.y);

          // 2. Efecto Fresnel / Fading en los bordes para hacerlo difuminado
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          float rim = dot(normal, viewDir);
          float edgeFade = pow(rim, 2.0);

          // 3. Modulación de ruido animada
          float noisePattern = sin(vUv.y * 8.0 - uTime * 0.8) * 0.1 + 0.9;

          float alpha = verticalFade * edgeFade * noisePattern * uIntensity;

          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(-2.5, 1.5, 0);

    const alignAxis = new THREE.Vector3(0, -1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(alignAxis, directionVec);
    beamMesh.quaternion.copy(quaternion);

    manager.scene.add(beamMesh);
    state.beamMesh = beamMesh;
    state.beamMatUniforms = beamMat.uniforms;
    state.beamLength = beamLength; // Almacenar la longitud dinámica para la actualización de partículas

    // SISTEMA DE PARTÍCULAS DEL HAZ (Más sutil)
    const particleCount = 65; // Reducido (antes 150) para ser discreto
    const particleGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    const phases = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const y = -Math.random() * beamLength;
      const radiusAtY = 0.7 + (1.0 - 0.7) * (-y / beamLength);
      const r = Math.random() * radiusAtY;
      const theta = Math.random() * Math.PI * 2;

      posArray[i * 3] = r * Math.cos(theta);
      posArray[i * 3 + 1] = y;
      posArray[i * 3 + 2] = r * Math.sin(theta);

      // Velocidad reducida (antes 0.15 + 0.25) para un efecto flotante más sutil y calmo
      speeds[i] = 0.05 + Math.random() * 0.10;
      phases[i] = Math.random() * Math.PI * 2;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const particleMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffeedd) }, // Dorado cálido suave
        uBeamLength: { value: beamLength }
      },
      vertexShader: `
        varying float vAlpha;
        varying float vDepthFade;
        uniform float uTime;
        uniform float uBeamLength;
        void main() {
          float normY = -position.y / uBeamLength;
          vDepthFade = smoothstep(0.0, 0.15, normY) * smoothstep(1.0, 0.8, normY);
          vAlpha = 0.3 + 0.7 * sin(uTime * 2.0 + position.y * 4.0);

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (3.2 * vAlpha) * (15.0 / -mvPosition.z); // Tamaño reducido (de 5.0 a 3.2)
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        varying float vDepthFade;
        void main() {
          float r = distance(gl_PointCoord, vec2(0.5));
          if (r > 0.5) discard;
          float intensity = 1.0 - (r * 2.0);
          gl_FragColor = vec4(uColor, intensity * vAlpha * vDepthFade * 0.35); // Opacidad reducida (de 0.7 a 0.35)
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const beamParticles = new THREE.Points(particleGeo, particleMat);
    beamMesh.add(beamParticles);

    state.beamParticleSpeeds = speeds;
    state.beamParticlePhases = phases;
    state.beamParticlesGeometry = particleGeo;
    state.beamParticleUniforms = particleMat.uniforms;
  }

  // Cristal reflexivo de la ventana (para agregar realismo y ocultar aún más el truco)
  const glassGeo = new THREE.PlaneGeometry(1.5, 1.5);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x050505,
    metalness: 0.9,
    roughness: 0.1,
    transparent: true,
    opacity: 0.35
  });
  const glassPane = new THREE.Mesh(glassGeo, glassMat);
  glassPane.position.set(0, 0, -0.05);
  windowGroup.add(glassPane);

  // Marco de la ventana para realismo y profundidad
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 });
  const frameThick = 0.05;
  const topGeo = new THREE.BoxGeometry(1.5, frameThick, frameThick);
  const sideGeo = new THREE.BoxGeometry(frameThick, 1.5, frameThick);

  const frameTop = new THREE.Mesh(topGeo, frameMat); frameTop.position.set(0, 0.75, 0.02);
  const frameBot = new THREE.Mesh(topGeo, frameMat); frameBot.position.set(0, -0.75, 0.02);
  const frameLeft = new THREE.Mesh(sideGeo, frameMat); frameLeft.position.set(-0.75, 0, 0.02);
  const frameRight = new THREE.Mesh(sideGeo, frameMat); frameRight.position.set(0.75, 0, 0.02);
  const frameCross1 = new THREE.Mesh(topGeo, frameMat); frameCross1.position.set(0, 0, 0.02);
  const frameCross2 = new THREE.Mesh(sideGeo, frameMat); frameCross2.position.set(0, 0, 0.02);

  windowGroup.add(frameTop, frameBot, frameLeft, frameRight, frameCross1, frameCross2);

  // Visita < 3: Luna exterior muy tenue
  if (visit < 3) {
    moonlight = new THREE.DirectionalLight(0x88bbff, 0.15); // Luz azul fría muy débil
    moonlight.position.set(-5, 3, 0);
    moonlight.target = floor;
    manager.scene.add(moonlight);
  }

  // Cama realista (Esquina X=1.5, Z=1)
  const bedGroup = new THREE.Group();
  bedGroup.position.set(1.6, 0, 0.8);
  manager.scene.add(bedGroup);

  // Marco de madera
  const bedFrameMat = new THREE.MeshStandardMaterial({ color: 0x1f110a, roughness: 0.9 });
  const bedFrameGeo = new THREE.BoxGeometry(1.45, 0.3, 2.05);
  const bedFrame = new THREE.Mesh(bedFrameGeo, bedFrameMat);
  bedFrame.position.y = 0.15;
  bedGroup.add(bedFrame);

  // Colchón
  const mattressGeo = new THREE.BoxGeometry(1.4, 0.2, 2);
  const mattressMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.9 });
  const mattress = new THREE.Mesh(mattressGeo, mattressMat);
  mattress.position.y = 0.4;
  bedGroup.add(mattress);

  // Almohadas (Apuntando hacia la pared trasera Z=2)
  const pillowGeo = new THREE.BoxGeometry(0.5, 0.12, 0.35);
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9 });
  const pillow1 = new THREE.Mesh(pillowGeo, pillowMat);
  pillow1.position.set(-0.35, 0.56, 0.7); // Hacia la pared (+Z)
  pillow1.rotation.x = -0.1;
  const pillow2 = new THREE.Mesh(pillowGeo, pillowMat);
  pillow2.position.set(0.35, 0.56, 0.7);
  pillow2.rotation.x = -0.15;
  pillow2.rotation.y = 0.1;
  bedGroup.add(pillow1, pillow2);

  // Frazada oscura (Apuntando hacia el centro del cuarto -Z)
  const blanketGeo = new THREE.BoxGeometry(1.42, 0.05, 1.2);
  const blanketMat = new THREE.MeshStandardMaterial({ color: 0x1f2e4d, roughness: 0.8 }); // Azul marino oscuro
  const blanket = new THREE.Mesh(blanketGeo, blanketMat);
  blanket.position.set(0, 0.525, -0.4);
  bedGroup.add(blanket);

  // Visita 4: Cama deshecha
  if (visit >= 4) {
    pillow1.position.set(-0.4, 0.5, 0.5);
    pillow1.rotation.set(-0.3, 0.5, 0);
    pillow2.position.set(0.2, 0.2, -1.2); // Tirada cerca del suelo

    // Desordenar manta rotándola y moviéndola
    blanket.position.set(0.2, 0.5, -0.6);
    blanket.rotation.y = 0.4;
    blanket.rotation.z = 0.1;

    // Deformación procedural de los vértices
    const bPos = blanket.geometry.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      bPos.setY(i, bPos.getY(i) + (Math.random() - 0.5) * 0.15);
    }
    blanket.geometry.computeVertexNormals();
  }

  // Silla realista armada por partes
  const chairGroup = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.85 });

  // Asiento
  const seatGeo = new THREE.BoxGeometry(0.4, 0.05, 0.4);
  const seat = new THREE.Mesh(seatGeo, woodMat);
  seat.position.y = 0.4;
  chairGroup.add(seat);

  // 4 Patas cilíndricas
  const legGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.4);
  const leg1 = new THREE.Mesh(legGeo, woodMat); leg1.position.set(-0.18, 0.2, -0.18);
  const leg2 = new THREE.Mesh(legGeo, woodMat); leg2.position.set(0.18, 0.2, -0.18);
  const leg3 = new THREE.Mesh(legGeo, woodMat); leg3.position.set(-0.18, 0.2, 0.18);
  const leg4 = new THREE.Mesh(legGeo, woodMat); leg4.position.set(0.18, 0.2, 0.18);
  chairGroup.add(leg1, leg2, leg3, leg4);

  // Respaldo
  const backGeo = new THREE.BoxGeometry(0.4, 0.4, 0.05);
  const back = new THREE.Mesh(backGeo, woodMat);
  back.position.set(0, 0.6, -0.18);
  chairGroup.add(back);

  // Visita 2: silla distinta posición
  if (visit === 1) {
    chairGroup.position.set(-1, 0, 1.2); // Cerca del escritorio
  } else {
    // A partir de la visita 2, la silla se movió sola
    chairGroup.position.set(0.5, 0, -0.5);
    chairGroup.rotation.y = Math.PI / 6;
  }
  manager.scene.add(chairGroup);

  // Escritorio realista frente a la silla (Pegado a la pared trasera Z=2)
  const deskGroup = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x221105, roughness: 0.7 });
  // Tabla superior
  const deskTopGeo = new THREE.BoxGeometry(1.4, 0.05, 0.6);
  const deskTop = new THREE.Mesh(deskTopGeo, deskMat);
  deskTop.position.y = 0.75;
  deskGroup.add(deskTop);
  // Patas del escritorio
  const deskLegGeo = new THREE.BoxGeometry(0.05, 0.75, 0.05);
  const dLeg1 = new THREE.Mesh(deskLegGeo, deskMat); dLeg1.position.set(-0.65, 0.375, -0.25);
  const dLeg2 = new THREE.Mesh(deskLegGeo, deskMat); dLeg2.position.set(0.65, 0.375, -0.25);
  const dLeg3 = new THREE.Mesh(deskLegGeo, deskMat); dLeg3.position.set(-0.65, 0.375, 0.25);
  const dLeg4 = new THREE.Mesh(deskLegGeo, deskMat); dLeg4.position.set(0.65, 0.375, 0.25);
  deskGroup.add(dLeg1, dLeg2, dLeg3, dLeg4);

  // Pegado a la pared trasera (Z=2). La profundidad del escritorio es 0.6, su borde es 1.7 + 0.3 = 2.0
  deskGroup.position.set(-1, 0, 1.7);
  manager.scene.add(deskGroup);

  // Lámpara de escritorio realista con iluminación tenue
  const lampGroup = new THREE.Group();
  lampGroup.position.set(0.34, 0.78, 0.02);

  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.03, 24),
    new THREE.MeshStandardMaterial({ color: 0x2f261d, roughness: 0.45, metalness: 0.22 })
  );
  lampBase.position.y = 0.015;
  lampGroup.add(lampBase);

  const lampFoot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.03, 24),
    new THREE.MeshStandardMaterial({ color: 0x4b3a28, roughness: 0.5, metalness: 0.12 })
  );
  lampFoot.position.set(0.02, 0.045, 0.02);
  lampGroup.add(lampFoot);

  const lampStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.38, 16),
    new THREE.MeshStandardMaterial({ color: 0x6b5438, roughness: 0.4, metalness: 0.18 })
  );
  lampStem.position.set(0.03, 0.24, 0.01);
  lampStem.rotation.z = -0.18;
  lampGroup.add(lampStem);

  const lampArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.02, 0.22, 16),
    new THREE.MeshStandardMaterial({ color: 0x6b5438, roughness: 0.4, metalness: 0.18 })
  );
  lampArm.position.set(0.09, 0.43, 0.01);
  lampArm.rotation.z = -0.72;
  lampGroup.add(lampArm);

  const lampShade = new THREE.Mesh(
    new THREE.ConeGeometry(0.17, 0.24, 20, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x7a5f43,
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide
    })
  );
  lampShade.position.set(0.18, 0.54, 0.01);
  lampShade.rotation.z = Math.PI;
  lampShade.rotation.x = -0.2;
  lampGroup.add(lampShade);

  const lampBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff1d6 })
  );
  lampBulb.position.set(0.17, 0.47, 0.01);
  lampGroup.add(lampBulb);

  const lampLight = new THREE.SpotLight(0xffd09a, 0.82, 4.8, Math.PI / 6, 0.55, 1);
  lampLight.position.set(0.17, 0.56, 0.02);
  lampLight.target.position.set(0.22, 0.12, -0.35);
  lampGroup.add(lampLight);
  lampGroup.add(lampLight.target);

  deskGroup.add(lampGroup);

  // Visita 5: Marcas en la pared
  if (visit >= 5) {
    const markGeo = new THREE.PlaneGeometry(0.8, 0.8);
    const markCanvas = document.createElement('canvas');
    markCanvas.width = 256;
    markCanvas.height = 256;
    const mctx = markCanvas.getContext('2d');
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 4;
    mctx.globalAlpha = 0.3; // Tiza gastada
    // Dibujar palitos contando
    for (let i = 0; i < 5; i++) {
      mctx.beginPath();
      mctx.moveTo(50 + i * 30, 50);
      mctx.lineTo(50 + i * 30 + (Math.random() - 0.5) * 15, 200);
      mctx.stroke();
    }
    // Diagonal
    mctx.beginPath();
    mctx.moveTo(30, 180);
    mctx.lineTo(190, 80);
    mctx.stroke();
    const markTex = new THREE.CanvasTexture(markCanvas);
    const markMat = new THREE.MeshStandardMaterial({ map: markTex, transparent: true, opacity: 0.8 });
    const markMesh = new THREE.Mesh(markGeo, markMat);
    markMesh.position.set(2.49, 1.5, -0.5);
    markMesh.rotation.y = -Math.PI / 2;
    manager.scene.add(markMesh);
  }

  // AUDIO
  audioCtx = null;

  // Música de fondo según visita
  const musicSrc = visit <= 4
    ? '/assets/Musica 1.mp3'
    : '/assets/Musica 2.mp3';
  state.music = new Howl({ src: [musicSrc], loop: true, volume: 0.6 });
  state.music.play();

  // Prompt de puerta
  const doorPrompt = document.createElement('div');
  doorPrompt.style.cssText = [
    'position:fixed',
    'bottom:52px',
    'left:50%',
    'transform:translateX(-50%)',
    'color:rgba(255,255,255,0.75)',
    'font-family:Georgia,serif',
    'font-size:13px',
    'letter-spacing:4px',
    'opacity:0',
    'transition:opacity 0.6s ease',
    'pointer-events:none',
    'z-index:100',
    'text-shadow:0 0 12px rgba(0,0,0,0.9)',
  ].join(';');
  doorPrompt.textContent = 'PRESIONA E PARA CONTINUAR';
  document.body.appendChild(doorPrompt);
  state.doorPrompt = doorPrompt;

  // Listener de tecla E para entrar por la puerta
  const eKeyListener = (e) => {
    if ((e.key === 'e' || e.key === 'E') && state.nearDoor && !state.transitioning) {
      state.transitioning = true;
      const next = DREAM_SEQUENCE[state.visit - 1] || 'hub_final';
      manager.transitionTo(next);
    }
  };
  window.addEventListener('keydown', eKeyListener);
  state.eKeyListener = eKeyListener;

  // Sonido de lluvia en loop (se detiene al interactuar con la puerta)
  state.rainSound = new Howl({
    src: ['/assets/repite_los_primeros_segundos.mp3'],
    loop: true,
    volume: 0.21,
    rate: 0.9,
  });
  state.rainSound.play();

  // Luz de relámpagos — posicionada dentro de la habitación cerca de la ventana
  // para que al flashear ilumine el interior como si el rayo entrara por el vidrio
  const lightningLight = new THREE.PointLight(0xb8d0ff, 0, 22);
  lightningLight.position.set(-2.1, 2.2, 0);
  manager.scene.add(lightningLight);
  state.lightningLight = lightningLight;

  // Partículas de lluvia (líneas cortas cayendo en el exterior de la ventana)
  const rainCount = 400;
  const rainPos = new Float32Array(rainCount * 6);
  for (let i = 0; i < rainCount; i++) {
    const x = -2.5 - Math.random() * 28;
    const y = Math.random() * 14;
    const z = (Math.random() - 0.5) * 22;
    const dropLen = 0.07 + Math.random() * 0.13;
    rainPos[i * 6]     = x; rainPos[i * 6 + 1] = y;           rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x; rainPos[i * 6 + 4] = y - dropLen; rainPos[i * 6 + 5] = z;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0x88aadd, transparent: true, opacity: 0.35 });
  const rainMesh = new THREE.LineSegments(rainGeo, rainMat);
  manager.scene.add(rainMesh);
  state.rainGeo = rainGeo;
  state.rainMesh = rainMesh;
}

function playHubFootstepSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.14);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const decay = Math.pow(1 - t, 2.2);
      data[i] = (Math.random() * 2 - 1) * decay * 0.16;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(180 + Math.random() * 70, now);
    filter.Q.value = 0.85;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.05, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.13);

    const thump = audioCtx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(68 + Math.random() * 10, now);

    const thumpGain = audioCtx.createGain();
    thumpGain.gain.setValueAtTime(0, now);
    thumpGain.gain.linearRampToValueAtTime(0.08, now + 0.005);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    thump.connect(thumpGain);
    thumpGain.connect(audioCtx.destination);

    noise.start(now);
    thump.start(now);
    thump.stop(now + 0.13);
  } catch (error) {
    console.warn('Hub footstep sound error', error);
  }
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  if (state.windowUniforms) {
    state.windowUniforms.uTime.value = state.timeElapsed;
  }

  if (state.beamMatUniforms) {
    state.beamMatUniforms.uTime.value = state.timeElapsed;
  }
  if (state.beamParticleUniforms) {
    state.beamParticleUniforms.uTime.value = state.timeElapsed;
  }

  if (state.beamParticlesGeometry) {
    const pos = state.beamParticlesGeometry.attributes.position.array;
    const count = pos.length / 3;
    const limitY = state.beamLength ? -state.beamLength : -6.0;
    for (let i = 0; i < count; i++) {
      // 1. Desplazamiento hacia abajo a lo largo del eje Y local del haz
      pos[i * 3 + 1] -= state.beamParticleSpeeds[i] * deltaTime;

      // 2. Deriva suave (sinusoidal) horizontal
      pos[i * 3] += Math.sin(state.timeElapsed * 0.5 + state.beamParticlePhases[i]) * 0.05 * deltaTime;
      pos[i * 3 + 2] += Math.cos(state.timeElapsed * 0.5 + state.beamParticlePhases[i]) * 0.05 * deltaTime;

      // 3. Si se sale del haz, reiniciar arriba
      if (pos[i * 3 + 1] < limitY) {
        pos[i * 3 + 1] = 0;
        const radiusAtTop = 0.7;
        const r = Math.random() * radiusAtTop;
        const theta = Math.random() * Math.PI * 2;
        pos[i * 3] = r * Math.cos(theta);
        pos[i * 3 + 2] = r * Math.sin(theta);
      }
    }
    state.beamParticlesGeometry.attributes.position.needsUpdate = true;
  }

  // Visita 6: Tilt de cámara permanente e incorregible (3 grados)
  if (state.visit >= 6) {
    manager.camera.rotation.z = THREE.MathUtils.degToRad(3);
  }

  // Relámpagos aleatorios con intensidad variable por destello
  if (state.lightningLight) {
    state.lightningTimer -= deltaTime;
    if (state.lightningTimer <= 0) {
      state.lightningFlash = true;
      state.lightningFlashTime = 0;
      state.lightningTimer = 3 + Math.random() * 8;
      // Intensidad pico aleatoria: entre 8 y 20
      state.lightningPeak = 8 + Math.random() * 12;
    }
    if (state.lightningFlash) {
      const t = (state.lightningFlashTime += deltaTime);
      const pk = state.lightningPeak;
      if (t < 0.04) {
        state.lightningLight.intensity = (t / 0.04) * pk;
      } else if (t < 0.12) {
        state.lightningLight.intensity = ((0.12 - t) / 0.08) * pk;
      } else if (t < 0.17) {
        state.lightningLight.intensity = ((t - 0.12) / 0.05) * (pk * 0.5);
      } else if (t < 0.28) {
        state.lightningLight.intensity = ((0.28 - t) / 0.11) * (pk * 0.5);
      } else {
        state.lightningLight.intensity = 0;
        state.lightningFlash = false;
      }
    }
  }

  // Lluvia cayendo
  if (state.rainGeo) {
    const pos = state.rainGeo.attributes.position.array;
    const count = pos.length / 6;
    const fallSpeed = 6 * deltaTime;
    for (let i = 0; i < count; i++) {
      pos[i * 6 + 1] -= fallSpeed;
      pos[i * 6 + 4] -= fallSpeed;
      if (pos[i * 6 + 4] < -2) {
        const newY = 10 + Math.random() * 4;
        const dropLen = pos[i * 6 + 1] - pos[i * 6 + 4];
        pos[i * 6 + 1] = newY;
        pos[i * 6 + 4] = newY - dropLen;
      }
    }
    state.rainGeo.attributes.position.needsUpdate = true;
  }

  if (state.transitioning) return;

  const speed = 1.8 * deltaTime; // Movimiento lento en el hub
  const isMoving = keys.w || keys.a || keys.s || keys.d;

  // Guardar posición anterior para resolver colisiones
  const oldX = manager.camera.position.x;
  const oldZ = manager.camera.position.z;

  if (keys.w) manager.controls.moveForward(speed);
  if (keys.s) manager.controls.moveForward(-speed);
  if (keys.a) manager.controls.moveRight(-speed);
  if (keys.d) manager.controls.moveRight(speed);

  // Mantener altura (ajustada a 1.7)
  manager.camera.position.y = 1.7;

  // Colisiones con las paredes (habitación de 5x4)
  if (manager.camera.position.x > 2.3) manager.camera.position.x = 2.3;
  if (manager.camera.position.x < -2.3) manager.camera.position.x = -2.3;
  if (manager.camera.position.z > 1.8) manager.camera.position.z = 1.8;
  if (manager.camera.position.z < -1.8) manager.camera.position.z = -1.8;

  // Colisiones con objetos (AABB con deslizamiento)
  const px = manager.camera.position.x;
  const pz = manager.camera.position.z;
  const pr = 0.25; // Radio de colisión del jugador

  // Definir las "cajas" sólidas de los objetos
  const boxes = [
    { minX: 1.6 - 0.725, maxX: 1.6 + 0.725, minZ: 0.8 - 1.025, maxZ: 0.8 + 1.025 }, // Cama
    { minX: -1.0 - 0.7, maxX: -1.0 + 0.7, minZ: 1.7 - 0.3, maxZ: 1.7 + 0.3 } // Escritorio
  ];

  // Silla (depende de si se movió o no según la visita)
  if (state.visit === 1) {
    boxes.push({ minX: -1.2, maxX: -0.8, minZ: 1.0, maxZ: 1.4 }); // Cerca del escritorio
  } else {
    boxes.push({ minX: 0.2, maxX: 0.8, minZ: -0.8, maxZ: -0.2 }); // Rotada y movida al centro
  }

  // Detectar y resolver
  let colX = false;
  let colZ = false;

  for (const b of boxes) {
    if (px > b.minX - pr && px < b.maxX + pr && pz > b.minZ - pr && pz < b.maxZ + pr) {
      // Determinar en qué eje ocurrió el impacto para permitir deslizarse
      if (oldX <= b.minX - pr || oldX >= b.maxX + pr) colX = true;
      if (oldZ <= b.minZ - pr || oldZ >= b.maxZ + pr) colZ = true;

      // Si entramos exactamente por la esquina o hubo un salto brusco
      if (!colX && !colZ) {
        colX = true;
        colZ = true;
      }
    }
  }

  // Deshacer el movimiento solo en el eje que colisionó
  if (colX) manager.camera.position.x = oldX;
  if (colZ) manager.camera.position.z = oldZ;

  // Sonido de pasos
  if (isMoving && state.timeElapsed - state.lastStepTime > 0.6) {
    playHubFootstepSound();
    state.lastStepTime = state.timeElapsed;
  }

  // Detección de proximidad a la puerta
  const doorPos = new THREE.Vector3(0, 1.6, -2);
  const nearDoor = manager.camera.position.distanceTo(doorPos) < 0.92;
  if (nearDoor !== state.nearDoor) {
    state.nearDoor = nearDoor;
    if (state.doorPrompt) {
      state.doorPrompt.style.opacity = nearDoor && !state.transitioning ? '1' : '0';
    }
  }
}

export function dispose(manager) {
  window.removeEventListener('keydown', keydownListener);
  window.removeEventListener('keyup', keyupListener);
  if (state.eKeyListener) {
    window.removeEventListener('keydown', state.eKeyListener);
    state.eKeyListener = null;
  }
  if (state.doorPrompt) {
    state.doorPrompt.remove();
    state.doorPrompt = null;
  }
  if (state.music) {
    try { state.music.stop(); state.music.unload(); } catch (e) {}
    state.music = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close();
  }
  if (state.rainSound) {
    try { state.rainSound.stop(); state.rainSound.unload(); } catch (e) {}
    state.rainSound = null;
  }
  if (state.lightningLight) {
    state.lightningLight.removeFromParent();
    state.lightningLight = null;
  }
  if (state.rainMesh) {
    state.rainGeo.dispose();
    state.rainMesh.material.dispose();
    state.rainMesh.removeFromParent();
    state.rainMesh = null;
    state.rainGeo = null;
  }

  if (state.exteriorGroup) {
    state.exteriorGroup.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
    });
    state.exteriorGroup.removeFromParent();
  }
  if (state.moonLight) {
    state.moonLight.removeFromParent();
  }

  if (state.beamMesh) {
    state.beamMesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    state.beamMesh.removeFromParent();
    state.beamMesh = null;
  }
}