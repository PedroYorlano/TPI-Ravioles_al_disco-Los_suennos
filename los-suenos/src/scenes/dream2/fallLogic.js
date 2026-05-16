import * as THREE from 'three';

export function createFallController(camera, options = {}) {
  const {
    startX = 0,
    startY = 560,
    startZ = 100,
    startDelay = 0.3,
    climaxY = 50,
    impactY = 20,
    maxSpeed = 120,
    fallDuration = 10
  } = options;

  const state = {
    elapsed: 0,
    falling: false,
    speed: 0,
    climaxReached: false,
    impacted: false,
    swayTime: 0
  };

  camera.position.set(startX, startY, startZ);
  // Mirar directamente hacia el suelo (rotación -90 grados en X)
  camera.rotation.set(-Math.PI / 2, 0, 0);

  return {
    update(deltaTime) {
      state.elapsed += deltaTime;

      if (!state.falling && state.elapsed >= startDelay) {
        state.falling = true;
      }

      let justReachedClimax = false;

      if (state.falling && !state.impacted) {
        const fallTime = state.elapsed - startDelay;
        // Aceleración constante calibrada para alcanzar impacto en ~10 segundos
        const acceleration = 10.8;
        state.speed = Math.min(maxSpeed, acceleration * fallTime);

        const speedNorm = THREE.MathUtils.clamp(state.speed / maxSpeed, 0, 1);
        camera.position.y -= state.speed * deltaTime;
        camera.position.z -= state.speed * deltaTime * 0.3;

        // Movimiento horizontal muy limitado (casi sin sway constante, lo reemplazaremos con WASD)
        state.swayTime += deltaTime;
        const swayAmount = 0.005 + speedNorm * 0.003;

        // Efecto de vibración en la caída
        camera.position.x += (Math.random() - 0.5) * swayAmount;
        camera.position.z += (Math.random() - 0.5) * swayAmount;

        if (camera.position.y <= climaxY && !state.climaxReached) {
          state.climaxReached = true;
          justReachedClimax = true;
        }

        if (camera.position.y <= impactY) {
          state.impacted = true;
        }

        return {
          falling: state.falling,
          speed: state.speed,
          speedNorm,
          justReachedClimax
        };
      }

      return {
        falling: state.falling,
        speed: state.speed,
        speedNorm: THREE.MathUtils.clamp(state.speed / maxSpeed, 0, 1),
        justReachedClimax
      };
    }
  };
}
