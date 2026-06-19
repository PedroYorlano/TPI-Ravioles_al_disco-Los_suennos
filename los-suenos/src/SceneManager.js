import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export class SceneManager {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 1.6, 0); // Altura promedio de los ojos (1.6m)

    // Plano negro para el fade frente a la cámara
    this.fadeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x000000, 
      transparent: true, 
      opacity: 0, 
      depthTest: false,
      depthWrite: false
    });
    this.fadePlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fadeMaterial);
    this.fadePlane.position.z = -0.1; // Muy cerca de la cámara
    this.fadePlane.renderOrder = 9999; // Asegurarse de que se renderice al final, sobre todo
    this.camera.add(this.fadePlane);

    this.controls = new PointerLockControls(this.camera, document.body);
    
    // Lock controls on click (estándar para primera persona)
    document.body.addEventListener('click', () => {
      if (!this.isTransitioning && this.controls.enabled) {
        this.controls.lock();
      }
    });

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

    this.currentSceneModule = null;
    this.isTransitioning = false;

    this.clock = new THREE.Clock();
    
    // Diccionario de escenas registradas
    this.scenes = {};

    // Inicializar cargadores compartidos para optimizar memoria y descargas
    this.modelCache = {};
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    window.addEventListener('resize', this.onWindowResize.bind(this));

    this.loop = this.loop.bind(this);
    this.renderer.setAnimationLoop(this.loop);
  }

  registerScene(name, moduleLoader) {
    this.scenes[name] = moduleLoader;
  }

  async getModel(url) {
    if (this.modelCache[url]) {
      return this.modelCache[url];
    }

    const promise = this.gltfLoader.loadAsync(url).catch(err => {
      console.error(`[SceneManager] Error loading model ${url}:`, err);
      delete this.modelCache[url];
      throw err;
    });

    this.modelCache[url] = promise;
    return promise;
  }

  preloadAllBackground() {
    const models = [
      new URL('./assets/models/mercury_planet.glb', import.meta.url).href,
      new URL('./assets/models/planet_earth.glb', import.meta.url).href,
      new URL('./assets/models/Copilot3D-1f9e01da-72de-4614-9f74-cafe446d987d.glb', import.meta.url).href,
      new URL('./assets/models/purple_planet.glb', import.meta.url).href,
      new URL('./assets/models/saturn_planet.glb', import.meta.url).href,
      new URL('./assets/models/2284_donne_erwan_silhouette.glb', import.meta.url).href,
      new URL('./assets/models/city.glb', import.meta.url).href,
      new URL('./assets/models/bed.glb', import.meta.url).href
    ];

    console.log('[SceneManager] Starting background asset preloading...');
    models.forEach(url => {
      this.getModel(url).then(() => {
        console.log(`[SceneManager] Preloaded asset: ${url.split('/').pop()}`);
      }).catch(err => {
        console.warn(`[SceneManager] Failed preloading: ${url}`, err);
      });
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  async transitionTo(sceneName) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // La duración total del fade es 1.5s, dividida en 0.75s para el fade-in a negro y 0.75s para el fade-out
    const halfFade = 1.5 / 2;

    // 1. Fade a negro
    await this.fade(0, 1, halfFade);

    // 2. Descargar escena actual
    if (this.currentSceneModule && typeof this.currentSceneModule.dispose === 'function') {
      this.currentSceneModule.dispose(this);
    }

    // Limpiar el Scene graph de Three.js (excepto la cámara y sus hijos, que incluye el fadePlane)
    const objectsToRemove = [];
    this.scene.children.forEach(child => {
      if (child !== this.camera) {
        objectsToRemove.push(child);
      }
    });
    objectsToRemove.forEach(child => this.scene.remove(child));

    // 3. Cargar la nueva escena
    const loader = this.scenes[sceneName];
    if (loader) {
      // Dynamic import
      this.currentSceneModule = await loader();
      if (typeof this.currentSceneModule.init === 'function') {
        await this.currentSceneModule.init(this);
      }

      // Pre-compilar shaders de la nueva escena antes de quitar la pantalla negra
      try {
        if (typeof this.renderer.compileAsync === 'function') {
          await this.renderer.compileAsync(this.scene, this.camera);
        } else {
          this.renderer.compile(this.scene, this.camera);
        }
      } catch (err) {
        console.warn('[SceneManager] GPU compilation failed or skipped:', err);
      }
    } else {
      console.error(`SceneManager: Scene '${sceneName}' not found.`);
      this.currentSceneModule = null;
    }

    // Resetear el delta time después de cargar para evitar saltos en la animación
    this.clock.getDelta();

    // 4. Fade desde negro a transparente
    await this.fade(1, 0, halfFade);

    this.isTransitioning = false;
  }

  fade(startOpacity, endOpacity, durationSecs) {
    return new Promise(resolve => {
      const startTime = performance.now();
      const durationMs = durationSecs * 1000;
      
      const animateFade = (time) => {
        const elapsed = time - startTime;
        let progress = elapsed / durationMs;
        if (progress > 1) progress = 1;

        // Función de easing sencilla para un fade más suave (opcional)
        // const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
        
        this.fadeMaterial.opacity = startOpacity + (endOpacity - startOpacity) * progress;

        if (progress < 1) {
          requestAnimationFrame(animateFade);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(animateFade);
    });
  }

  loop() {
    const deltaTime = this.clock.getDelta();

    // Call update en el módulo de escena actual
    if (this.currentSceneModule && typeof this.currentSceneModule.update === 'function') {
      this.currentSceneModule.update(deltaTime, this);
    }

    if (this.composer) {
      this.composer.render(deltaTime);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
