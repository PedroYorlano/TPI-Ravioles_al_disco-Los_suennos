import * as THREE from 'three';

window.hubVisitCount = window.hubVisitCount || 0;

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
    visit: visit
  };

  // Cámara inicial
  manager.camera.position.set(0, 1.6, 1.5); // Empezamos cerca del fondo de la habitación
  manager.camera.rotation.set(0, 0, 0);

  // Limpiar niebla y background global
  manager.scene.background = new THREE.Color(0x000000);
  manager.scene.fog = null;

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
  lBot.position.set(-2.5, 0.375, 0); lBot.rotation.y = Math.PI/2;
  const lTop = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.75), roomMat);
  lTop.position.set(-2.5, 2.625, 0); lTop.rotation.y = Math.PI/2;
  const lFront = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.5), roomMat);
  lFront.position.set(-2.5, 1.5, -1.375); lFront.rotation.y = Math.PI/2;
  const lBack = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.5), roomMat);
  lBack.position.set(-2.5, 1.5, 1.375); lBack.rotation.y = Math.PI/2;
  manager.scene.add(lBot, lTop, lFront, lBack);

  // Piso de madera con normal map procedural
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 512;
  floorCanvas.height = 512;
  const ctx = floorCanvas.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 512, 512);
  for(let i=0; i<80; i++) {
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    const x = Math.random() * 512;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random()-0.5)*10, 512);
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
    // Imagen fotorrealista de paisaje con luna llena
    const textureLoader = new THREE.TextureLoader();
    const windowTex = textureLoader.load('/textures/night_window_view.png');
    // PARALAJE: Escalamos y empujamos la imagen gigante hacia afuera (z=-15) para crear profundidad real
    const viewGeo = new THREE.PlaneGeometry(30, 30);
    const viewMat = new THREE.MeshBasicMaterial({ map: windowTex });
    const viewMesh = new THREE.Mesh(viewGeo, viewMat);
    viewMesh.position.set(0, 5, -15);
    windowGroup.add(viewMesh);

    // CAMUFLAJE DEL TRUCO: Caja negra gigante alrededor de la vista para que no se vea el "vacío" desde ángulos extremos
    const voidGeo = new THREE.BoxGeometry(30, 30, 16);
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
    const voidBox = new THREE.Mesh(voidGeo, voidMat);
    voidBox.position.set(0, 5, -8);
    windowGroup.add(voidBox);
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
    for(let i=0; i<bPos.count; i++) {
      bPos.setY(i, bPos.getY(i) + (Math.random()-0.5)*0.15);
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

  const lampLight = new THREE.SpotLight(0xffd09a, 0.42, 4.8, Math.PI / 6, 0.55, 1);
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
    for(let i=0; i<5; i++) {
      mctx.beginPath();
      mctx.moveTo(50 + i*30, 50);
      mctx.lineTo(50 + i*30 + (Math.random()-0.5)*15, 200);
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

  // Visita 6: Tilt de cámara permanente e incorregible (3 grados)
  if (state.visit >= 6) {
    manager.camera.rotation.z = THREE.MathUtils.degToRad(3);
  }

  if (state.transitioning) return;

  const speed = 1.8 * deltaTime; // Movimiento lento en el hub
  const isMoving = keys.w || keys.a || keys.s || keys.d;

  if (keys.w) manager.controls.moveForward(speed);
  if (keys.s) manager.controls.moveForward(-speed);
  if (keys.a) manager.controls.moveRight(-speed);
  if (keys.d) manager.controls.moveRight(speed);

  // Mantener altura
  manager.camera.position.y = 1.6;

  // Colisiones con las paredes (habitación de 5x4)
  if (manager.camera.position.x > 2.3) manager.camera.position.x = 2.3;
  if (manager.camera.position.x < -2.3) manager.camera.position.x = -2.3;
  if (manager.camera.position.z > 1.8) manager.camera.position.z = 1.8;
  if (manager.camera.position.z < -1.8) manager.camera.position.z = -1.8;

  // Sonido de pasos
  if (isMoving && state.timeElapsed - state.lastStepTime > 0.6) {
    playHubFootstepSound();
    state.lastStepTime = state.timeElapsed;
  }

  // Mecánica: Caminar hacia la puerta para transicionar
  const doorPos = new THREE.Vector3(0, 1.6, -2);
  if (manager.camera.position.distanceTo(doorPos) < 0.8) {
    state.transitioning = true;

    // Mapeo del próximo sueño según la visita
    let nextDream = 'dream1';
    if (state.visit === 1) nextDream = 'dream1';
    else if (state.visit === 2) nextDream = 'dream2';
    else if (state.visit === 3) nextDream = 'dream3';
    else if (state.visit === 4) nextDream = 'dream4';
    else if (state.visit === 5) nextDream = 'dream5';
    
    manager.transitionTo(nextDream);
  }
}

export function dispose(manager) {
  window.removeEventListener('keydown', keydownListener);
  window.removeEventListener('keyup', keyupListener);
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close();
  }
}