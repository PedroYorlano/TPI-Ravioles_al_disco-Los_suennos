import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, Effect, VignetteEffect } from 'postprocessing';
import { createCityEnvironment } from './dream2/cityEnvironment.js';
import { createFallController } from './dream2/fallLogic.js';
import { createDream2Audio } from './dream2/audioController.js';

// Un MotionBlurPass vertical personalizado
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
  climaxTriggered: false,
  city: null,
  fallController: null,
  audio: null,
  transitionTimer: null
};

let motionBlurEffect;
let keys = { w: false, a: false, s: false, d: false };
let keydownListener, keyupListener;

export async function init(manager) {
  state = {
    timeElapsed: 0,
    climaxTriggered: false,
    city: null,
    fallController: null,
    audio: null,
    transitionTimer: null
  };

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

  manager.camera.position.set(0, 540, 120);
  manager.camera.rotation.set(0, 0, 0);

  // 1. Postprocessing con MotionBlurPass vertical
  const composer = new EffectComposer(manager.renderer);
  const renderPass = new RenderPass(manager.scene, manager.camera);
  composer.addPass(renderPass);

  motionBlurEffect = new VerticalMotionBlurEffect();
  const vignette = new VignetteEffect({ darkness: 0.5 });
  const effectPass = new EffectPass(manager.camera, motionBlurEffect, vignette);
  composer.addPass(effectPass);

  manager.composer = composer;

  // Entorno urbano modular con GLTFLoader y fallback procedural.
  state.city = await createCityEnvironment(manager);

  // Audio inmersivo con THREE.Audio + AudioListener acoplado a la cámara.
  state.audio = await createDream2Audio(manager.camera);
  await state.audio.start();

  // Lógica de caída desacoplada para facilitar ajuste de física y cámara.
  // Duración total: ~10 segundos
  state.fallController = createFallController(manager.camera, {
    startX: 300,
    startY: 650,
    startZ: 200,
    startDelay: 0.3,
    climaxY: 50,
    impactY: 20,
    maxSpeed: 120,
    fallDuration: 10
  });
}

export function update(deltaTime, manager) {
  state.timeElapsed += deltaTime;

  if (!state.fallController || state.climaxTriggered) {
    return;
  }

  const fall = state.fallController.update(deltaTime);

  if (state.city) {
    state.city.update(deltaTime, fall.speedNorm, state.timeElapsed);
  }

  if (state.audio) {
    state.audio.update(fall.speedNorm, deltaTime);
  }

  // Movimiento horizontal (leve ajuste de dirección con el cuerpo al caer)
  const steerSpeed = 4 * deltaTime; // Velocidad reducida drásticamente (antes 45)
  if (keys.w) manager.controls.moveForward(steerSpeed);
  if (keys.s) manager.controls.moveForward(-steerSpeed);
  if (keys.a) manager.controls.moveRight(-steerSpeed);
  if (keys.d) manager.controls.moveRight(steerSpeed);

  // Mantener imagen nitida durante casi toda la caida y activar blur solo cerca del impacto.
  const proximity = THREE.MathUtils.clamp(1 - manager.camera.position.y / 120, 0, 1);
  const lateImpactFactor = THREE.MathUtils.clamp((proximity - 0.72) / 0.28, 0, 1);
  const blur = Math.min(lateImpactFactor * (0.018 + fall.speedNorm * 0.05), 0.085);
  motionBlurEffect.uniforms.get('strength').value = blur;

  if (fall.justReachedClimax) {
    triggerClimax(manager);
  }
}

function triggerClimax(manager) {
  if (state.climaxTriggered) {
    return;
  }

  state.climaxTriggered = true;

  if (state.audio) {
    state.audio.fadeOut(); // Fade out del viento en lugar de sonido de impacto
  }

  // Comienza el fade a negro y transiciona al hub inmediatamente (el fade toma 1 segundo)
  // Mientras tanto, la cámara seguirá cayendo, por lo que el usuario verá oscurecerse todo mientras se acerca al suelo
  manager.transitionTo('hub');
}

export function dispose(manager) {
  if (manager.composer) {
    manager.composer.dispose();
    manager.composer = null;
  }

  if (state.transitionTimer) {
    clearTimeout(state.transitionTimer);
    state.transitionTimer = null;
  }

  if (state.audio) {
    state.audio.dispose();
    state.audio = null;
  }

  if (state.city) {
    state.city.dispose();
    state.city = null;
  }

  window.removeEventListener('keydown', keydownListener);
  window.removeEventListener('keyup', keyupListener);
}
