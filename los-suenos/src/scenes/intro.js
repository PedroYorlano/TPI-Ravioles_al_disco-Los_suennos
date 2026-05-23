import * as THREE from 'three';
import { gsap } from 'gsap';

let state = {
  timeElapsed: 0,
  cameraTarget: { x: 0, y: 0.2625, z: 0, rotX: -0.1, rotY: 0, rotZ: 0 },
  overlay: null,
  timeline: null,
  meshes: [],
  doorGroup: null
};

export async function init(manager) {
  // Desactivar PointerLockControls
  manager.controls.enabled = false;
  manager.controls.unlock();

  // Reiniciar estado
  state.timeElapsed = 0;
  state.cameraTarget = { x: 0, y: 0.2625, z: 0, rotX: -0.1, rotY: 0, rotZ: 0 };
  state.meshes = [];
  state.doorGroup = null;

  // Posicionar cámara inicial (un 5% más arriba: 0.25 * 1.05 = 0.2625)
  manager.camera.position.set(0, 0.2625, 0);
  manager.camera.rotation.set(-0.1, 0, 0);

  // Limpiar niebla, background y environment
  manager.scene.background = new THREE.Color(0x000000);
  manager.scene.fog = null;
  manager.scene.environment = null;

  // Material de la habitación (muy oscuro)
  const roomMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9, side: THREE.DoubleSide });

  // Techo
  const ceilGeo = new THREE.PlaneGeometry(5, 4);
  const ceiling = new THREE.Mesh(ceilGeo, roomMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3;
  manager.scene.add(ceiling);
  state.meshes.push(ceiling);

  // Pared Frontal (Z = -2)
  const frontGeo = new THREE.PlaneGeometry(5, 3);
  const frontWall = new THREE.Mesh(frontGeo, roomMat);
  frontWall.position.set(0, 1.5, -2);
  manager.scene.add(frontWall);
  state.meshes.push(frontWall);

  // Pared Trasera (Z = 2)
  const backWall = new THREE.Mesh(frontGeo, roomMat);
  backWall.position.set(0, 1.5, 2);
  manager.scene.add(backWall);
  state.meshes.push(backWall);

  // Pared Derecha (X = 2.5)
  const sideWallGeo = new THREE.PlaneGeometry(4, 3);
  const rightWall = new THREE.Mesh(sideWallGeo, roomMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(2.5, 1.5, 0);
  manager.scene.add(rightWall);
  state.meshes.push(rightWall);

  // Pared Izquierda (X = -2.5)
  const leftWall = new THREE.Mesh(sideWallGeo, roomMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-2.5, 1.5, 0);
  manager.scene.add(leftWall);
  state.meshes.push(leftWall);

  // Piso de madera (Procedural igual al hub)
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 128;
  floorCanvas.height = 128;
  const ctx = floorCanvas.getContext('2d');
  ctx.fillStyle = '#0f0f0f';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#222';
  for (let i = 0; i < 20; i++) {
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const x = Math.random() * 128;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 5, 128);
    ctx.stroke();
  }
  const woodTexture = new THREE.CanvasTexture(floorCanvas);
  woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
  woodTexture.repeat.set(4, 4);

  const floorGeo = new THREE.PlaneGeometry(5, 4);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1f150f, // Madera oscura
    roughness: 0.8,
    bumpMap: woodTexture,
    bumpScale: 0.08
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  manager.scene.add(floor);
  state.meshes.push(floor);

  // Puerta de alta fidelidad iluminada al frente (Z = -2, idéntica al hubScene)
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
  const doorMesh = new THREE.Mesh(doorGeo, doorMat);
  doorMesh.position.set(0, 0.92, 0.05);
  doorGroup.add(doorMesh);

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
  state.doorGroup = doorGroup;

  // CAMA (Ubicada en el centro-izquierda de la escena, Pillow 2 en X=0)
  const bedGroup = new THREE.Group();
  bedGroup.position.set(-0.35, -0.3, -0.7);
  manager.scene.add(bedGroup);
  state.bedGroup = bedGroup;

  // Cama - Marco
  const bedFrameMat = new THREE.MeshStandardMaterial({ color: 0x140b06, roughness: 0.9 });
  const bedFrameGeo = new THREE.BoxGeometry(1.45, 0.3, 2.05);
  const bedFrame = new THREE.Mesh(bedFrameGeo, bedFrameMat);
  bedFrame.position.y = 0.15;
  bedGroup.add(bedFrame);

  // Cama - Colchón
  const mattressGeo = new THREE.BoxGeometry(1.4, 0.2, 2);
  const mattressMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
  const mattress = new THREE.Mesh(mattressGeo, mattressMat);
  mattress.position.y = 0.4;
  bedGroup.add(mattress);

  // Cama - Almohadas
  const pillowGeo = new THREE.BoxGeometry(0.5, 0.12, 0.35);
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.9 });
  const pillow1 = new THREE.Mesh(pillowGeo, pillowMat);
  pillow1.position.set(-0.35, 0.56, 0.7);
  pillow1.rotation.x = -0.1;
  const pillow2 = new THREE.Mesh(pillowGeo, pillowMat);
  pillow2.position.set(0.35, 0.56, 0.7);
  pillow2.rotation.x = -0.15;
  pillow2.rotation.y = 0.1;
  bedGroup.add(pillow1, pillow2);

  // Cama - Frazada
  const blanketGeo = new THREE.BoxGeometry(1.42, 0.05, 1.2);
  const blanketMat = new THREE.MeshStandardMaterial({ color: 0x141f33, roughness: 0.8 });
  const blanket = new THREE.Mesh(blanketGeo, blanketMat);
  blanket.position.set(0, 0.525, -0.4);
  bedGroup.add(blanket);

  // LUCES
  // Luz ambiental
  const ambient = new THREE.AmbientLight(0xffffff, 0.02);
  manager.scene.add(ambient);
  state.ambientLight = ambient;

  // Luz de la luna (Entra por el lateral izquierdo)
  const moonLight = new THREE.DirectionalLight(0x5588ff, 0.4);
  moonLight.position.set(-5, 3, 0);
  manager.scene.add(moonLight);
  state.moonLight = moonLight;

  // Luz de la puerta (idéntica en color e intensidad a la de hubScene para filtrar la luz)
  const doorLight = new THREE.PointLight(0xffb055, 0.7, 3.0);
  doorLight.position.set(0, 0.95, -2.1);
  manager.scene.add(doorLight);
  state.doorLight = doorLight;

  // OVERLAY HTML DE PÁRPADOS
  const overlay = document.createElement('div');
  overlay.id = 'intro-overlay';
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'black';
  overlay.style.zIndex = '9999';
  overlay.style.pointerEvents = 'none';
  overlay.style.opacity = '0'; // Se inicia en 0 porque el canvas clipPath controla la oscuridad inicial
  document.body.appendChild(overlay);
  state.overlay = overlay;

  // SECUENCIA GSAP
  // Aplicar clipPath inicial al canvas para que empiece cerrado (negro)
  manager.renderer.domElement.style.clipPath = 'ellipse(0% 0% at 50% 50%)';

  const tl = gsap.timeline();

  // PASO 1 — Apertura de párpados (0 a 2 segundos)
  tl.to(manager.renderer.domElement, {
    clipPath: 'ellipse(150% 100% at 50% 50%)',
    duration: 2,
    ease: 'power2.inOut'
  });

  // PASO 2 — Vista acostado (2 a 3.5 segundos)
  tl.to(state.cameraTarget, {
    duration: 1.5
  });

  // PASO 3 — Sentarse (3.5 a 5.5 segundos)
  tl.to(state.cameraTarget, {
    y: 0.7,
    rotX: 0.05,
    duration: 2.0,
    ease: 'power2.inOut'
  });

  // PASO 4 — Levantarse (5.5 a 7.5 segundos)
  tl.to(state.cameraTarget, {
    y: 1.7,
    z: -0.3,
    rotX: 0.0,
    duration: 2.0,
    ease: 'power1.inOut'
  });

  // PASO 5 — Estabilización y traspaso (7.5 a 9 segundos)
  tl.to(state.overlay, {
    opacity: 1,
    duration: 1.5,
    ease: 'power1.inOut',
    onComplete: () => {
      manager.transitionTo('hub');
    }
  });

  state.timeline = tl;
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;
  const time = state.timeElapsed;

  let offsetX = 0;
  let offsetY = 0;
  let offsetZ = 0;

  // PASO 2 — Vista acostado (micro shake de respiración)
  if (time >= 2.0 && time < 3.5) {
    offsetX = Math.sin(time * 2.0) * 0.003;
    offsetY = Math.sin(time * 2.0) * 0.003;
  }
  // PASO 3 — Sentarse (leve shake que sube al iniciar y estabiliza al final)
  else if (time >= 3.5 && time < 5.5) {
    const progress = (time - 3.5) / 2.0; // 0 a 1
    const shakeIntensity = Math.sin(progress * Math.PI) * 0.015;
    offsetX = (Math.sin(time * 30.0) + Math.cos(time * 17.0)) * 0.5 * shakeIntensity;
    offsetY = (Math.cos(time * 25.0) + Math.sin(time * 12.0)) * 0.5 * shakeIntensity;
    offsetZ = Math.sin(time * 20.0) * 0.5 * shakeIntensity;
  }
  // PASO 4 — Levantarse (caminata / bobbing)
  else if (time >= 5.5 && time < 7.5) {
    const walkTime = time - 5.5;
    offsetY = Math.abs(Math.sin(walkTime * 8.0)) * 0.035; // Bob en Y
    offsetX = Math.sin(walkTime * 4.0) * 0.015; // Balanceo lateral
  }

  // Aplicar posición de GSAP + offsets físicos
  manager.camera.position.set(
    state.cameraTarget.x + offsetX,
    state.cameraTarget.y + offsetY,
    state.cameraTarget.z + offsetZ
  );

  // Aplicar rotación de GSAP
  manager.camera.rotation.set(
    state.cameraTarget.rotX,
    state.cameraTarget.rotY,
    state.cameraTarget.rotZ
  );
}

export function dispose(manager) {
  // Matar todas las animaciones GSAP activas
  if (state.timeline) {
    state.timeline.kill();
    state.timeline = null;
  }
  gsap.killTweensOf(manager.camera);
  gsap.killTweensOf(manager.camera.position);
  gsap.killTweensOf(manager.camera.rotation);
  if (state.cameraTarget) {
    gsap.killTweensOf(state.cameraTarget);
  }
  if (state.overlay) {
    gsap.killTweensOf(state.overlay);
  }

  // Quitar clipPath del canvas de Three.js
  if (manager.renderer && manager.renderer.domElement) {
    manager.renderer.domElement.style.clipPath = '';
  }

  // Quitar overlay HTML del DOM
  if (state.overlay) {
    state.overlay.remove();
    state.overlay = null;
  }

  // Limpiar meshes creados
  state.meshes.forEach(mesh => {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    mesh.removeFromParent();
  });
  state.meshes = [];

  // Limpiar cama
  if (state.bedGroup) {
    state.bedGroup.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
    state.bedGroup.removeFromParent();
    state.bedGroup = null;
  }

  // Limpiar puerta de alta fidelidad
  if (state.doorGroup) {
    state.doorGroup.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
    state.doorGroup.removeFromParent();
    state.doorGroup = null;
  }

  // Limpiar luces
  if (state.ambientLight) state.ambientLight.removeFromParent();
  if (state.moonLight) state.moonLight.removeFromParent();
  if (state.doorLight) state.doorLight.removeFromParent();
}
