import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function createRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#8a8e93';
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const alpha = 0.03 + Math.random() * 0.08;
    ctx.fillStyle = `rgba(120, 124, 130, ${alpha})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createWindowTexture(colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 8; y < canvas.height - 8; y += 18) {
    for (let x = 8; x < canvas.width - 8; x += 18) {
      const lit = Math.random() > 0.34;
      if (!lit) {
        continue;
      }
      const flick = 0.75 + Math.random() * 0.25;
      ctx.fillStyle = `rgba(${Math.floor(((colorHex >> 16) & 255) * flick)}, ${Math.floor(((colorHex >> 8) & 255) * flick)}, ${Math.floor((colorHex & 255) * flick)}, 0.95)`;
      ctx.fillRect(x, y, 11, 11);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSimpleCar() {
  const carGroup = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.7, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x9a1f1f, roughness: 0.35, metalness: 0.55 })
  );
  body.position.y = 0.55;
  carGroup.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.55, 1.0),
    new THREE.MeshPhysicalMaterial({ color: 0x394a63, roughness: 0.15, metalness: 0.12, transmission: 0.2 })
  );
  cabin.position.set(0.15, 1.0, 0);
  carGroup.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.32, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.95 });
  const wheelOffsets = [
    [-0.9, 0.28, -0.55],
    [0.9, 0.28, -0.55],
    [-0.9, 0.28, 0.55],
    [0.9, 0.28, 0.55]
  ];

  for (const [x, y, z] of wheelOffsets) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    carGroup.add(wheel);
  }

  return carGroup;
}

function placeStreetLights(group) {
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.11, 7, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x35383d, roughness: 0.75, metalness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xe8d58f, emissive: 0xffdf9e, emissiveIntensity: 1.2 });

  const spacing = 60;
  const limit = 380;
  let lightCounter = 0;

  for (let x = -limit; x <= limit; x += spacing) {
    for (let z = -limit; z <= limit; z += spacing) {
      if ((Math.abs(x) + Math.abs(z)) % 120 !== 0) {
        continue;
      }

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x + 5, 3.5, z + 5);
      group.add(pole);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 10), lampMat);
      bulb.position.set(x + 5, 7.2, z + 5);
      group.add(bulb);

      if (lightCounter % 3 === 0) {
        const light = new THREE.PointLight(0xffe0aa, 0.8, 35, 2.2);
        light.position.set(x + 5, 7.2, z + 5);
        group.add(light);
      }
      lightCounter++;
    }
  }
}

async function tryLoadModel(url) {
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    return gltf.scene;
  } catch {
    return null;
  }
}

export async function createCityEnvironment(manager) {
  const root = new THREE.Group();
  manager.scene.add(root);

  // Look nocturno con niebla para dar escala y profundidad a la ciudad.
  manager.scene.background = new THREE.Color(0xb8d7f2);
  manager.scene.fog = new THREE.FogExp2(0xc7def0, 0.00085);

  const ambient = new THREE.AmbientLight(0xffffff, 1.15);
  root.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff2d8, 1.9);
  sun.position.set(260, 420, 160);
  root.add(sun);

  const fill = new THREE.DirectionalLight(0xcfe3f4, 0.7);
  fill.position.set(-180, 160, -220);
  root.add(fill);

  // Cúpula de cielo simple con textura procedural de estrellas.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 512;
  skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0, '#7fc0f0');
  skyGrad.addColorStop(1, '#d9efff');
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = Math.random() * 1.2;
    skyCtx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.18})`;
    skyCtx.beginPath();
    skyCtx.arc(x, y, r, 0, Math.PI * 2);
    skyCtx.fill();
  }
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 24),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })
  );
  root.add(sky);

  const roadTex = createRoadTexture();
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({
      map: roadTex,
      color: 0xa2a6ab,
      roughness: 0.96,
      metalness: 0.03
    })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = -2;
  root.add(road);

  // Cargar modelo de ciudad completa desde city.glb
  const cityModelUrl = new URL('../../assets/models/city.glb', import.meta.url).href;
  const cityModel = await tryLoadModel(cityModelUrl);
  
  if (cityModel) {
    // Si se cargó city.glb, agregarlo a la escena
    cityModel.position.set(0, 0, 0);
    cityModel.scale.set(110, 110, 110);
    
    // Asegurarse de que todos los meshes usen materiales Standard/Physical para consistencia
    cityModel.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });
    
    root.add(cityModel);
  } else {
    // Fallback procedural si city.glb no existe
    console.warn('city.glb no encontrado, usando generación procedural.');
    
    const buildingTemplates = [
      { color: 0x2d3340, emissive: 0xffdc98 },
      { color: 0x3a404d, emissive: 0xd9ecff },
      { color: 0x2b3640, emissive: 0xfff3c4 }
    ];

    const buildingBoxGeo = new THREE.BoxGeometry(1, 1, 1);

    for (let gx = -7; gx <= 7; gx++) {
      for (let gz = -7; gz <= 7; gz++) {
        if (Math.abs(gx) <= 1 || Math.abs(gz) <= 1) {
          continue;
        }

        const baseX = gx * 42 + (Math.random() - 0.5) * 8;
        const baseZ = gz * 42 + (Math.random() - 0.5) * 8;
        const width = 10 + Math.random() * 18;
        const depth = 10 + Math.random() * 18;
        const height = 30 + Math.random() * 170;

        const template = buildingTemplates[(gx + gz + 300) % buildingTemplates.length];
        const windowTex = createWindowTexture(template.emissive);
        const buildingMat = new THREE.MeshStandardMaterial({
          color: template.color,
          roughness: 0.72,
          metalness: 0.2,
          emissive: template.emissive,
          emissiveMap: windowTex,
          emissiveIntensity: 0.9
        });

        const building = new THREE.Mesh(buildingBoxGeo, buildingMat);
        building.position.set(baseX, height * 0.5 - 2, baseZ);
        building.scale.set(width, height, depth);
        root.add(building);
      }
    }

    const carsGroup = new THREE.Group();
    root.add(carsGroup);

    const carPositions = [];
    for (let i = -8; i <= 8; i++) {
      carPositions.push([i * 24, -1.45, 32, Math.PI * 0.5]);
      carPositions.push([i * 24, -1.45, -32, -Math.PI * 0.5]);
      carPositions.push([32, -1.45, i * 24, 0]);
      carPositions.push([-32, -1.45, i * 24, Math.PI]);
    }

    for (const [x, y, z, rotY] of carPositions) {
      const car = createSimpleCar();
      car.position.set(x + (Math.random() - 0.5) * 2, y, z + (Math.random() - 0.5) * 2);
      car.rotation.y = rotY;
      car.scale.setScalar(1.0);
      carsGroup.add(car);
    }

    placeStreetLights(root);
  }

  // Partículas en cámara para enfatizar velocidad del aire durante la caída.
  const particleCount = 650;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 70;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 65;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0xeaf3ff,
    size: 0.22,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  manager.camera.add(particles);

  const handGeo = new THREE.BoxGeometry(0.22, 0.62, 0.22);
  const handMat = new THREE.MeshStandardMaterial({ color: 0xe4bea5, roughness: 0.7 });
  const leftHand = new THREE.Mesh(handGeo, handMat);
  const rightHand = new THREE.Mesh(handGeo, handMat);
  leftHand.position.set(-0.65, -1.55, -1.1);
  rightHand.position.set(0.65, -1.55, -1.1);
  manager.camera.add(leftHand);
  manager.camera.add(rightHand);

  return {
    update(deltaTime, speedNorm, elapsedTime) {
      const p = particles.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        p[i * 3] += (16 + speedNorm * 40) * deltaTime;
        p[i * 3 + 1] += (18 + speedNorm * 54) * deltaTime;
        p[i * 3 + 2] += (12 + speedNorm * 33) * deltaTime;

        if (p[i * 3] > 35) p[i * 3] -= 70;
        if (p[i * 3 + 1] > 32) p[i * 3 + 1] -= 65;
        if (p[i * 3 + 2] > 35) p[i * 3 + 2] -= 70;
      }
      particles.geometry.attributes.position.needsUpdate = true;

      const handRaise = Math.min(1.0, elapsedTime * 0.35);
      const spread = 0.45 + speedNorm * 0.35;
      leftHand.rotation.z = spread;
      rightHand.rotation.z = -spread;
      leftHand.position.y = -1.55 + handRaise;
      rightHand.position.y = -1.55 + handRaise;
    },
    dispose() {
      manager.camera.remove(particles);
      manager.camera.remove(leftHand);
      manager.camera.remove(rightHand);
      manager.scene.remove(root);
    }
  };
}
