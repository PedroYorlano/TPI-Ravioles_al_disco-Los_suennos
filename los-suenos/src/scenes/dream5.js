import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  NoiseEffect,
  BlendFunction
} from 'postprocessing';

let state = {};
let materials = {};
let effects = {};

const DREAM5_AUDIO_SRC = '/assets/Across the Stars (Love Theme from Star Wars_ Attack of the Clones) (mp3cut.net).mp3';
const DREAM5_RISER_SRC = '/assets/Riser - Sound Effect (Free).mp3';

let keys = { w: false, a: false, s: false, d: false, q: false, e: false };

const keydownListener = (ev) => {
  const key = ev.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = true;
};
const keyupListener = (ev) => {
  const key = ev.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = false;
};

export async function init(manager) {
  window.addEventListener('keydown', keydownListener);
  window.addEventListener('keyup', keyupListener);

  state = {
    timeElapsed: 0,
    collapseStarted: false,
    collapseFactor: 0,
    climaxTriggered: false,
    climaxTimer: 0,
    velocity: new THREE.Vector3(),
    planets: [],
    planetColliders: [],
    stars1: null,
    stars2: null,
    sky: null,
    musicEl: null,
    riserEl: null,
    audioCtx: null,
    riserSource: null,
    riserGain: null,
    riserTimeout: null,
    noise2D: createNoise2D(),
    manager: manager
  };

  manager.camera.position.set(0, 0, 0);
  manager.camera.rotation.set(0, 0, 0);
  manager.scene.background = new THREE.Color(0x000000);
  manager.scene.fog = null; // Sin niebla en el espacio

  // Extender el plano de recorte para que los planetas lejanos sean visibles
  state.originalFar = manager.camera.far;
  manager.camera.far = 2000;
  manager.camera.updateProjectionMatrix();

  // Grupo global para implosión final
  state.universeGroup = new THREE.Group();
  manager.scene.add(state.universeGroup);

  createSky();
  createStars();
  await createPlanets();
  createShootingStars();

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  state.universeGroup.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffddaa, 2.0);
  sunLight.position.set(200, 100, -200);
  state.universeGroup.add(sunLight);

  // UI Text for controls
  const ui = document.createElement('div');
  ui.id = 'dream5-ui';
  ui.style.position = 'absolute';
  ui.style.bottom = '10%';
  ui.style.width = '100%';
  ui.style.textAlign = 'center';
  ui.style.color = 'rgba(255, 255, 255, 0.7)';
  ui.style.fontFamily = 'sans-serif';
  ui.style.fontSize = '1.2rem';
  ui.style.letterSpacing = '2px';
  ui.style.pointerEvents = 'none';
  ui.style.zIndex = '100';
  ui.style.textShadow = '0 0 10px rgba(0,0,0,0.8)';
  ui.innerHTML = 'VUELO LIBRE: Usa <b>W A S D</b> para navegar y <b>Q E</b> para subir/bajar';
  document.body.appendChild(ui);

  setupPostprocessing(manager);
  setupAudio();
}

function createSky() {
  const skyGeo = new THREE.SphereGeometry(1500, 64, 64);
  materials.sky = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      collapse: { value: 0 },
      color1: { value: new THREE.Color(0x1a0b2e) }, // Violeta muy oscuro
      color2: { value: new THREE.Color(0x2d0b38) }, // Magenta apagado
      color3: { value: new THREE.Color(0x0a0512) }  // Negro azulado
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float collapse;
      uniform vec3 color1;
      uniform vec3 color2;
      uniform vec3 color3;
      varying vec3 vWorldPosition;

      // Pseudo-ruido 3D rápido
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                       mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                       mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float f = 0.0;
        f += 0.5000 * noise(p); p *= 2.02;
        f += 0.2500 * noise(p); p *= 2.03;
        f += 0.1250 * noise(p); p *= 2.01;
        f += 0.0625 * noise(p);
        return f;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float n = fbm(dir * 3.0 + time * 0.02);
        float n2 = fbm(dir * 5.0 - time * 0.01);
        
        vec3 baseColor = mix(color3, color1, smoothstep(0.2, 0.7, n));
        baseColor = mix(baseColor, color2, smoothstep(0.4, 0.72, n2));
        
        // Manchas de negro profundo (cúmulos oscuros)
        float darkMask = smoothstep(0.4, 0.8, fbm(dir * 2.0));
        baseColor = mix(baseColor, vec3(0.0), darkMask);

        // Colapso: Desaturar y oscurecer
        float gray = dot(baseColor, vec3(0.299, 0.587, 0.114));
        vec3 finalColor = mix(baseColor, vec3(gray), collapse);
        finalColor *= (1.0 - collapse);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  state.sky = new THREE.Mesh(skyGeo, materials.sky);
  state.universeGroup.add(state.sky);
}

function createStars() {
  const createLayer = (count, size, color) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 400 + Math.random() * 600;
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    // Textura circular con gradiente suave
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const map = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      color: color,
      size: size,
      map: map,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    return new THREE.Points(geo, mat);
  };

  state.stars1 = createLayer(3000, 15.0, 0xffeedd); // Cercanas, grandes
  state.stars2 = createLayer(6000, 8.0, 0xaaccff);  // Lejanas, pequeñas
  state.universeGroup.add(state.stars1);
  state.universeGroup.add(state.stars2);
}

async function addFloatingPlanetModel(fileName, position, speed, targetDiameter = 80) {
  try {
    const modelUrl = new URL(`../assets/models/${fileName}`, import.meta.url).href;
    const gltf = await state.manager.getModel(modelUrl);
    // Clonamos la escena para posicionarla y escalarla de forma independiente
    const model = gltf.scene.clone();

    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });

    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scaleFactor = targetDiameter / maxDim;
    model.scale.multiplyScalar(scaleFactor);

    const centeredBounds = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    centeredBounds.getCenter(center);
    model.position.sub(center);
    model.position.add(position);

    const dummyMat = { uniforms: { time: { value: 0 }, collapse: { value: 0 } } };
    state.planets.push({ mesh: model, mat: dummyMat, speed });
    state.universeGroup.add(model);
    state.planetColliders.push({ center: position.clone(), radius: targetDiameter / 2 });
  } catch (error) {
    console.warn(`No se pudo cargar ${fileName} en dream5`, error);
  }
}

// Shader común para deforma planetas en el colapso
const planetVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float time;
  uniform float collapse;
  
  // Hash & Noise
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    vec3 pos = position;
    // Deformación del colapso
    float n = noise(position * 2.0 + time * 5.0);
    pos += normal * n * collapse * 5.0; // Se inflan caóticamente
    
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vPosition = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

async function createPlanets() {
  // ═══ PLANETAS PROCEDURALES (12 = 3× los 4 originales) ═══

  // ── Gaseosos (3) ──
  const gasMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vNormal; uniform float time;
      void main() {
        float n = sin(vUv.y * 50.0 + sin(vUv.x * 10.0 + time) * 2.0);
        vec3 color = mix(vec3(0.8, 0.4, 0.1), vec3(0.72, 0.7, 0.3), smoothstep(-0.5, 0.5, n));
        gl_FragColor = vec4(color * max(0.2, dot(vNormal, vec3(0,0,1))), 1.0);
      }
    `
  });
  const gasPlanet = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 64), gasMat);
  gasPlanet.position.set(300, 100, -625);
  state.planets.push({ mesh: gasPlanet, mat: gasMat, speed: 0.05 });
  state.universeGroup.add(gasPlanet);

  const gasMat2 = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vNormal; uniform float time;
      void main() {
        float n = sin(vUv.y * 40.0 + sin(vUv.x * 8.0 + time) * 2.0);
        vec3 color = mix(vec3(0.5, 0.1, 0.7), vec3(0.8, 0.3, 0.72), smoothstep(-0.5, 0.5, n));
        gl_FragColor = vec4(color * max(0.2, dot(vNormal, vec3(0,0,1))), 1.0);
      }
    `
  });
  const gasPlanet2 = new THREE.Mesh(new THREE.SphereGeometry(45, 32, 32), gasMat2);
  gasPlanet2.position.set(-200, 350, -800);
  state.planets.push({ mesh: gasPlanet2, mat: gasMat2, speed: 0.03 });
  state.universeGroup.add(gasPlanet2);

  const gasMat3 = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vNormal; uniform float time;
      void main() {
        float n = sin(vUv.y * 60.0 + sin(vUv.x * 12.0 + time) * 1.5);
        vec3 color = mix(vec3(0.6, 0.05, 0.05), vec3(0.72, 0.25, 0.1), smoothstep(-0.5, 0.5, n));
        gl_FragColor = vec4(color * max(0.2, dot(vNormal, vec3(0,0,1))), 1.0);
      }
    `
  });
  const gasPlanet3 = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 32), gasMat3);
  gasPlanet3.position.set(550, -200, 750);
  state.planets.push({ mesh: gasPlanet3, mat: gasMat3, speed: -0.07 });
  state.universeGroup.add(gasPlanet3);

  // ── Rocosos (3) ──
  const rockFrag = `
    varying vec2 vUv; varying vec3 vNormal; uniform float time;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    float noise(vec2 p) {
      vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }`;

  const rockMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: rockFrag + `
      void main() {
        float n = noise(vUv*30.0)*0.5 + noise(vUv*100.0)*0.25;
        vec3 color = mix(vec3(0.2,0.2,0.25), vec3(0.5,0.45,0.4), n);
        gl_FragColor = vec4(color * max(0.1, dot(vNormal, vec3(0.5,0.5,1.0))), 1.0);
      }
    `
  });
  const rockPlanet = new THREE.Mesh(new THREE.SphereGeometry(25, 64, 64), rockMat);
  rockPlanet.position.set(-375, -150, 500);
  state.planets.push({ mesh: rockPlanet, mat: rockMat, speed: -0.08 });
  state.universeGroup.add(rockPlanet);

  const rockMat2 = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: rockFrag + `
      void main() {
        float n = noise(vUv*30.0)*0.5 + noise(vUv*100.0)*0.25;
        vec3 color = mix(vec3(0.45,0.2,0.1), vec3(0.7,0.4,0.2), n);
        gl_FragColor = vec4(color * max(0.1, dot(vNormal, vec3(0.5,0.5,1.0))), 1.0);
      }
    `
  });
  const rockPlanet2 = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 32), rockMat2);
  rockPlanet2.position.set(-600, 100, -300);
  state.planets.push({ mesh: rockPlanet2, mat: rockMat2, speed: 0.1 });
  state.universeGroup.add(rockPlanet2);

  const rockMat3 = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: rockFrag + `
      void main() {
        float n = noise(vUv*20.0)*0.5 + noise(vUv*60.0)*0.5;
        float lava = step(0.82, noise(vUv*55.0 + time*0.05));
        vec3 color = mix(vec3(0.05,0.04,0.04), vec3(0.25,0.1,0.12), n);
        color += vec3(0.72,0.25,0.0) * lava;
        gl_FragColor = vec4(color * max(0.15, dot(vNormal, vec3(0.5,0.5,1.0))), 1.0);
      }
    `
  });
  const rockPlanet3 = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 32), rockMat3);
  rockPlanet3.position.set(250, -400, -550);
  state.planets.push({ mesh: rockPlanet3, mat: rockMat3, speed: -0.04 });
  state.universeGroup.add(rockPlanet3);

  // ── Con Anillos (3) ──
  const mkRingPlanet = (color, ringColor, sphereR, rInner, rOuter, tiltDiv, pos, speed) => {
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(sphereR, 32, 32),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
    );
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(rInner, rOuter, 64),
      new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.68 })
    );
    ringMesh.rotation.x = Math.PI / tiltDiv;
    planet.add(ringMesh);
    planet.position.copy(pos);
    const dummy = { uniforms: { time: { value: 0 }, collapse: { value: 0 } } };
    state.planets.push({ mesh: planet, mat: dummy, speed });
    state.universeGroup.add(planet);
  };
  mkRingPlanet(0x2288ff, 0x66ccff, 40, 55, 85, 2.2, new THREE.Vector3(-550, 200, -125), 0.05);
  mkRingPlanet(0xff6622, 0xffcc44, 35, 50, 80, 2.5, new THREE.Vector3(600, 300, 200), -0.07);
  mkRingPlanet(0x22ccaa, 0xeeeeff, 50, 65, 95, 2.8, new THREE.Vector3(-200, -300, 600), 0.08);

  // ── Helados (3) ──
  const iceFrag = `
    varying vec2 vUv; varying vec3 vNormal; uniform float time;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    float noise(vec2 p) {
      vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }`;

  const iceMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: iceFrag + `
      void main() {
        float n = noise(vUv*40.0+time*0.05)*0.5 + noise(vUv*80.0)*0.5;
        vec3 color = mix(vec3(0.4,0.7,0.72), vec3(0.72,0.725,1.0), n);
        gl_FragColor = vec4(color * max(0.1, dot(vNormal,vec3(0.2,0.8,0.5))+0.2), 1.0);
      }
    `
  });
  const icePlanet = new THREE.Mesh(new THREE.SphereGeometry(35, 64, 64), iceMat);
  icePlanet.position.set(450, -250, 375);
  state.planets.push({ mesh: icePlanet, mat: iceMat, speed: 0.12 });
  state.universeGroup.add(icePlanet);

  const iceMat2 = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: iceFrag + `
      void main() {
        float n = noise(vUv*40.0+time*0.03)*0.5 + noise(vUv*90.0)*0.5;
        vec3 color = mix(vec3(0.05,0.1,0.45), vec3(0.2,0.4,0.85), n);
        gl_FragColor = vec4(color * max(0.1, dot(vNormal,vec3(0.2,0.8,0.5))+0.2), 1.0);
      }
    `
  });
  const icePlanet2 = new THREE.Mesh(new THREE.SphereGeometry(25, 32, 32), iceMat2);
  icePlanet2.position.set(700, 150, -400);
  state.planets.push({ mesh: icePlanet2, mat: iceMat2, speed: -0.05 });
  state.universeGroup.add(icePlanet2);

  const iceMat3 = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, collapse: { value: 0 } },
    vertexShader: planetVertexShader,
    fragmentShader: iceFrag + `
      void main() {
        float n = noise(vUv*35.0+time*0.04)*0.5 + noise(vUv*70.0)*0.5;
        vec3 color = mix(vec3(0.1,0.3,0.2), vec3(0.3,0.8,0.5), n);
        gl_FragColor = vec4(color * max(0.1, dot(vNormal,vec3(0.2,0.8,0.5))+0.15), 1.0);
      }
    `
  });
  const icePlanet3 = new THREE.Mesh(new THREE.SphereGeometry(55, 32, 32), iceMat3);
  icePlanet3.position.set(-500, -100, -500);
  state.planets.push({ mesh: icePlanet3, mat: iceMat3, speed: 0.09 });
  state.universeGroup.add(icePlanet3);

  // ═══ PLANETAS GLB (48 = 3× los 16 originales) ═══
  await Promise.all([
    // Saturn ×12
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(1050, 350, 150), 0.045, 120),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(-1300, -300, -650), -0.03, 85),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(550, 650, -1050), 0.06, 150),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(-400, 200, 1300), 0.09, 65),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(-750, 200, -400), 0.05, 90),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(900, -450, 650), -0.04, 110),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(-250, -650, 450), 0.07, 75),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(1150, 100, 750), 0.03, 140),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(-1050, 500, -200), -0.05, 60),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(300, 750, -1150), 0.06, 100),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(-850, -550, 900), 0.08, 130),
    addFloatingPlanetModel('saturn_planet.glb', new THREE.Vector3(650, -250, -1450), -0.03, 80),

    // Purple ×12
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(-900, -225, 650), -0.07, 95),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(1350, 450, -450), 0.05, 130),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(-550, 800, -1300), 0.04, 70),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(300, -600, 1075), -0.08, 160),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(600, -300, -950), 0.06, 85),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(-1000, 200, 300), -0.05, 115),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(400, 700, 800), 0.04, 65),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(-300, -800, -750), -0.09, 145),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(1100, -200, -1050), 0.03, 55),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(-700, 600, 900), 0.07, 125),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(800, 400, -600), -0.06, 90),
    addFloatingPlanetModel('purple_planet.glb', new THREE.Vector3(-1400, -100, 650), 0.04, 100),

    // Earth ×12
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(800, 175, -700), 0.06, 100),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(-1525, 100, 400), -0.05, 75),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(650, -550, 1250), 0.07, 140),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(-450, 525, -1150), 0.03, 60),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(-900, 300, -500), -0.06, 80),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(500, -600, 950), 0.08, 110),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(-300, 700, 600), -0.04, 70),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(1100, -100, -800), 0.05, 130),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(-600, -400, 1100), 0.09, 95),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(700, 500, 300), -0.05, 145),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(-1300, 200, -400), 0.04, 60),
    addFloatingPlanetModel('planet_earth.glb', new THREE.Vector3(400, -300, -1350), -0.07, 55),

    // Mercury ×12
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(-650, 275, -850), 0.09, 72),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(1450, -375, 550), -0.06, 55),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(-1050, 650, 950), 0.08, 105),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(450, -750, -1400), -0.04, 42),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(900, -500, -300), 0.07, 65),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(-400, 600, -700), -0.08, 85),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(600, 200, 1150), 0.05, 48),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(-800, -300, 500), 0.10, 100),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(1300, 400, -350), -0.06, 55),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(-200, -700, 800), 0.09, 115),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(500, 600, -1100), -0.05, 75),
    addFloatingPlanetModel('mercury_planet.glb', new THREE.Vector3(-1150, 100, 300), 0.07, 40),
  ]);

  // Colisionadores de planetas procedurales (posición y radio de la esfera)
  [
    { p: [300, 100, -625], r: 60 }, // gas 1
    { p: [-200, 350, -800], r: 45 }, // gas 2
    { p: [550, -200, 750], r: 30 }, // gas 3
    { p: [-375, -150, 500], r: 25 }, // roca 1
    { p: [-600, 100, -300], r: 20 }, // roca 2
    { p: [250, -400, -550], r: 50 }, // roca 3
    { p: [-550, 200, -125], r: 40 }, // anillos 1
    { p: [600, 300, 200], r: 35 }, // anillos 2
    { p: [-200, -300, 600], r: 50 }, // anillos 3
    { p: [450, -250, 375], r: 35 }, // hielo 1
    { p: [700, 150, -400], r: 25 }, // hielo 2
    { p: [-500, -100, -500], r: 55 }, // hielo 3
  ].forEach(({ p, r }) =>
    state.planetColliders.push({ center: new THREE.Vector3(...p), radius: r })
  );
}

function setupPostprocessing(manager) {
  const composer = new EffectComposer(manager.renderer);
  const renderPass = new RenderPass(manager.scene, manager.camera);
  composer.addPass(renderPass);

  effects.bloom = new BloomEffect({
    intensity: 2.0,
    luminanceThreshold: 0.1,
    luminanceSmoothing: 0.8
  });

  effects.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
  effects.noise.blendMode.opacity.value = 0.0;

  const effectPass = new EffectPass(manager.camera, effects.bloom, effects.noise);
  composer.addPass(effectPass);
  manager.composer = composer;
}

function setupAudio() {
  try {
    const firstAudio = new Audio(encodeURI(DREAM5_AUDIO_SRC));
    firstAudio.preload = 'auto';
    firstAudio.loop = false;
    firstAudio.volume = 0.75;
    state.musicEl = firstAudio;

    // Pre-crear AudioContext y cadena de efectos (se activa con interacción del usuario)
    const initAudioChain = () => {
      if (state.audioCtx) return; // Ya inicializado
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        state.audioCtx = ctx;

        // Distorsión creciente (WaveShaper)
        state.distortion = ctx.createWaveShaper();
        state.distortion.curve = makeDistortionCurve(0);
        state.distortion.oversample = '4x';

        // Filtro agudo chirriante
        state.harshFilter = ctx.createBiquadFilter();
        state.harshFilter.type = 'highshelf';
        state.harshFilter.frequency.value = 3000;
        state.harshFilter.gain.value = 0;

        // Gain del riser
        state.riserGain = ctx.createGain();
        state.riserGain.gain.value = 0.72;

        // Cadena pre-armada: distortion → harshFilter → gain → destination
        state.distortion.connect(state.harshFilter)
          .connect(state.riserGain)
          .connect(ctx.destination);
      } catch (e) {
        console.warn('No se pudo inicializar la cadena WebAudio', e);
      }
    };

    const startRiser = () => {
      if (state.riserEl) return;

      const riser = new Audio(encodeURI(DREAM5_RISER_SRC));
      riser.preload = 'auto';
      riser.loop = false;
      state.riserEl = riser;

      // El colapso comienza con el riser
      state.collapseStarted = true;
      state.collapseFactor = 0;

      // Conectar el riser a la cadena de efectos pre-armada
      if (state.audioCtx && state.distortion) {
        try {
          const ctx = state.audioCtx;
          if (ctx.state === 'suspended') ctx.resume().catch(() => { });
          const source = ctx.createMediaElementSource(riser);
          source.connect(state.distortion); // Entra en la cadena ya conectada
          state.riserSource = source;
        } catch (e) {
          riser.volume = 0.72;
          console.warn('WebAudio falló para el riser, usando volumen nativo', e);
        }
      } else {
        riser.volume = 0.72;
      }

      riser.addEventListener('timeupdate', () => {
        if (riser.duration && isFinite(riser.duration)) {
          state.collapseFactor = THREE.MathUtils.clamp(riser.currentTime / riser.duration, 0, 1);
        }
      });

      riser.addEventListener('ended', () => {
        state.collapseFactor = 1.0;
        if (state.riserTimeout) {
          clearTimeout(state.riserTimeout);
          state.riserTimeout = null;
        }
        if (state.manager && !state.climaxTriggered) {
          triggerClimax(state.manager);
        }
      });

      riser.play().catch((err) => {
        console.warn('No se pudo reproducir el riser', err);
        if (state.manager && !state.climaxTriggered) triggerClimax(state.manager);
      });

      if (riser.duration && isFinite(riser.duration)) {
        state.riserTimeout = setTimeout(() => {
          state.collapseFactor = 1.0;
          if (state.manager && !state.climaxTriggered) triggerClimax(state.manager);
        }, Math.max(0, riser.duration * 1000));
      }
    };

    firstAudio.addEventListener('ended', () => {
      startRiser();
    });

    const tryPlay = () => {
      if (!state.musicEl) return;
      state.musicEl.play().catch(() => { });
    };

    // Intento inicial + desbloqueo por interacción (autoplay policy)
    tryPlay();
    const unlockAudio = () => {
      tryPlay();
      initAudioChain(); // Crear AudioContext con gesto de usuario
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

  } catch (e) {
    console.warn("Audio error", e);
  }
}

function createShootingStars() {
  const COUNT = 100;
  const DREAM_DURATION = 180; // segundos estimados de duración del sueño

  const positions = new Float32Array(COUNT * 6);
  const colors = new Float32Array(COUNT * 6);
  const data = [];

  for (let i = 0; i < COUNT; i++) {
    // Dirección aleatoria normalizada
    let dx = Math.random() - 0.5;
    let dy = Math.random() - 0.5;
    let dz = Math.random() - 0.5;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;

    // Posición de origen distribuida por el volumen
    const ox = (Math.random() - 0.5) * 1600;
    const oy = (Math.random() - 0.5) * 1600;
    const oz = (Math.random() - 0.5) * 1600;

    const speed = 100 + Math.random() * 250;  // 100–350 u/s
    const tail = 20 + Math.random() * 80;   // 20–100 u
    const duration = 2 + Math.random() * 5;    // activa 2–7 s

    // Distribuidas uniformemente a lo largo del sueño con leve ruido
    const spawnTime = (i / COUNT) * DREAM_DURATION + (Math.random() - 0.5) * (DREAM_DURATION / COUNT);

    // Tinte sutil de cabeza: blanco frío o cálido
    const r = 0.85 + Math.random() * 0.15;
    const g = 0.85 + Math.random() * 0.15;
    const b = 0.720 + Math.random() * 0.10;

    data.push({ ox, oy, oz, dx, dy, dz, speed, tail, duration, spawnTime, r, g, b });

    // Comienzan invisibles
    for (let j = 0; j < 6; j++) { positions[i * 6 + j] = 0; colors[i * 6 + j] = 0; }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const lines = new THREE.LineSegments(geo, mat);
  state.universeGroup.add(lines);
  state.shootingStars = { lines, data };
}

function makeDistortionCurve(amount) {
  const k = typeof amount === 'number' ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    if (k === 0) {
      curve[i] = x;
    } else {
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
  }
  return curve;
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  if (state.climaxTriggered) {
    updateClimax(deltaTime, manager);
    return;
  }

  // 1. Movimiento 6DOF con inercia
  const dir = new THREE.Vector3();
  manager.camera.getWorldDirection(dir);
  const up = new THREE.Vector3(0, 1, 0); // Eje Y absoluto
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();

  const accel = new THREE.Vector3();
  if (keys.w) accel.add(dir);
  if (keys.s) accel.sub(dir);
  if (keys.a) accel.sub(right);
  if (keys.d) accel.add(right);
  if (keys.e) accel.add(up);
  if (keys.q) accel.sub(up);

  // El colapso lo maneja exclusivamente el Riser (setupAudio).
  // collapseFactor se actualiza en el timeupdate del riser audio.
  // Cuando el riser termina, su 'ended' event llama a triggerClimax.

  // Inercia normal vs Inercia de colapso (pierde control)
  const friction = THREE.MathUtils.lerp(0.97, 0.995, state.collapseFactor);
  const inputStrength = THREE.MathUtils.lerp(175.0, 2.0, state.collapseFactor);

  if (accel.lengthSq() > 0) {
    accel.normalize().multiplyScalar(inputStrength * deltaTime);
    state.velocity.add(accel);
  }

  manager.camera.position.add(state.velocity.clone().multiplyScalar(deltaTime));
  state.velocity.multiplyScalar(friction);

  // Colisión con planetas: empujar al jugador fuera de la esfera
  for (const col of state.planetColliders) {
    const dx = manager.camera.position.x - col.center.x;
    const dy = manager.camera.position.y - col.center.y;
    const dz = manager.camera.position.z - col.center.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const minDist = col.radius + 2;
    if (dist > 0 && dist < minDist) {
      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      manager.camera.position.set(
        col.center.x + nx * minDist,
        col.center.y + ny * minDist,
        col.center.z + nz * minDist
      );
      // Cancelar componente de velocidad que entra al planeta
      const vDotN = state.velocity.x * nx + state.velocity.y * ny + state.velocity.z * nz;
      if (vDotN < 0) {
        state.velocity.x -= vDotN * nx;
        state.velocity.y -= vDotN * ny;
        state.velocity.z -= vDotN * nz;
      }
    }
  }

  // 2. Actualizar Shaders (Tiempo y Colapso)
  if (materials.sky) {
    materials.sky.uniforms.time.value = state.timeElapsed;
    materials.sky.uniforms.collapse.value = state.collapseFactor;
  }
  if (state.stars1) {
    state.stars1.rotation.y += deltaTime * 0.01;
    state.stars1.rotation.x += deltaTime * 0.005;
    state.stars1.material.opacity = 1.0 - state.collapseFactor;

    state.stars2.rotation.y -= deltaTime * 0.02;
    state.stars2.material.opacity = 1.0 - state.collapseFactor;
  }

  state.planets.forEach(p => {
    p.mesh.rotation.y += p.speed * deltaTime;
    if (p.mat.uniforms) {
      p.mat.uniforms.time.value = state.timeElapsed;
      p.mat.uniforms.collapse.value = state.collapseFactor;
    }
  });

  // Estrellas fugaces: cada una activa solo durante su ventana de tiempo
  if (state.shootingStars) {
    const { lines, data } = state.shootingStars;
    const pos = lines.geometry.attributes.position.array;
    const col = lines.geometry.attributes.color.array;

    for (let i = 0; i < data.length; i++) {
      const s = data[i];
      const t = state.timeElapsed - s.spawnTime; // tiempo desde que nació

      if (t < 0 || t > s.duration) {
        // Fuera de ventana: invisible (negro = transparente en AdditiveBlending)
        col[i * 6] = 0; col[i * 6 + 1] = 0; col[i * 6 + 2] = 0;
        col[i * 6 + 3] = 0; col[i * 6 + 4] = 0; col[i * 6 + 5] = 0;
      } else {
        // Dentro de ventana: mover y aplicar fade suave
        const px = s.ox + s.dx * s.speed * t;
        const py = s.oy + s.dy * s.speed * t;
        const pz = s.oz + s.dz * s.speed * t;

        const fade = Math.sin((t / s.duration) * Math.PI); // 0→1→0
        col[i * 6] = s.r * fade; col[i * 6 + 1] = s.g * fade; col[i * 6 + 2] = s.b * fade;
        col[i * 6 + 3] = 0; col[i * 6 + 4] = 0; col[i * 6 + 5] = 0;

        pos[i * 6] = px; pos[i * 6 + 1] = py; pos[i * 6 + 2] = pz;
        pos[i * 6 + 3] = px - s.dx * s.tail; pos[i * 6 + 4] = py - s.dy * s.tail; pos[i * 6 + 5] = pz - s.dz * s.tail;
      }
    }

    lines.geometry.attributes.position.needsUpdate = true;
    lines.geometry.attributes.color.needsUpdate = true;
  }

  // 3. Blur final / colapso visual y sonoro sincronizado con el riser
  if (state.collapseStarted) {
    effects.noise.blendMode.opacity.value = state.collapseFactor * 0.5;
    if (effects.bloom) {
      effects.bloom.intensity = 2.0 + state.collapseFactor * 2.0;
    }

    // Distorsión de audio creciente
    if (state.distortion) {
      const distAmount = Math.pow(state.collapseFactor, 2) * 200;
      state.distortion.curve = makeDistortionCurve(distAmount);
    }
    // Filtro agudo: los últimos 40% del riser acentúan agudos chirriantes
    if (state.harshFilter) {
      const shelfGain = Math.max(0, (state.collapseFactor - 0.6) / 0.4) * 25;
      state.harshFilter.gain.value = shelfGain;
    }
  }
}

function triggerClimax(manager) {
  state.climaxTriggered = true;
  state.climaxTimer = 0;

  // Silencio total antes del negro
  if (state.riserGain && state.audioCtx) {
    state.riserGain.gain.linearRampToValueAtTime(0, state.audioCtx.currentTime + 0.15);
  }

  // Parálisis
  state.velocity.set(0, 0, 0);
}

function updateClimax(deltaTime, manager) {
  state.climaxTimer += deltaTime;

  // Implosión visual: Todos los objetos escalan a 0 hacia el centro del universo
  const scale = Math.max(0, 1.0 - state.climaxTimer * 1.5);
  state.universeGroup.scale.set(scale, scale, scale);

  // El jugador cae en el vacío
  manager.camera.position.y -= 50 * deltaTime * state.climaxTimer;

  effects.noise.blendMode.opacity.value = Math.random();

  if (state.climaxTimer > 1.5) {
    manager.fadeMaterial.opacity = 1.0;
    manager.transitionTo('hub');
  }
}

export function dispose(manager) {
  window.removeEventListener('keydown', keydownListener);
  window.removeEventListener('keyup', keyupListener);

  const ui = document.getElementById('dream5-ui');
  if (ui) ui.remove();

  if (state.shootingStars) {
    state.shootingStars.lines.geometry.dispose();
    state.shootingStars.lines.material.dispose();
    state.shootingStars = null;
  }

  // Restaurar el far plane original de la cámara
  if (state.originalFar) {
    manager.camera.far = state.originalFar;
    manager.camera.updateProjectionMatrix();
  }

  if (manager.composer) {
    manager.composer.dispose();
    manager.composer = null;
  }

  if (state.audioCtx && state.audioCtx.state !== 'closed') {
    state.audioCtx.close();
  }

  if (state.riserTimeout) {
    clearTimeout(state.riserTimeout);
    state.riserTimeout = null;
  }

  if (state.musicEl) {
    state.musicEl.pause();
    state.musicEl.currentTime = 0;
    state.musicEl = null;
  }

  if (state.riserEl) {
    state.riserEl.pause();
    state.riserEl.currentTime = 0;
    state.riserEl = null;
  }

  if (state.riserSource) {
    try { state.riserSource.disconnect(); } catch (e) { }
    state.riserSource = null;
  }

  if (state.riserGain) {
    try { state.riserGain.disconnect(); } catch (e) { }
    state.riserGain = null;
  }

  if (state.distortion) {
    try { state.distortion.disconnect(); } catch (e) { }
    state.distortion = null;
  }

  if (state.harshFilter) {
    try { state.harshFilter.disconnect(); } catch (e) { }
    state.harshFilter = null;
  }

}
