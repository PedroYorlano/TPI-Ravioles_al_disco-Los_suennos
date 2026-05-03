import * as THREE from 'three';

export function createFallController(camera, options = {}) {
  const {
    startY = 560,
    startZ = 100,
    startDelay = 0.3,
    impactY = 20,
    maxSpeed = 120,
    fallDuration = 10
  } = options;

  const state = {
    elapsed: 0,
    falling: false,
    speed: 0,
    impacted: false,
    swayTime: 0
  };

  camera.position.set(0, startY, startZ);
  // Mirar directamente hacia el suelo (rotación -90 grados en X)
  camera.rotation.set(-Math.PI / 2, 0, 0);

  return {
    update(deltaTime) {
      state.elapsed += deltaTime;

      if (!state.falling && state.elapsed >= startDelay) {
        state.falling = true;
      }

      let justImpacted = false;

      if (state.falling && !state.impacted) {
        const fallTime = state.elapsed - startDelay;
        // Aceleración constante calibrada para alcanzar impacto en ~10 segundos
        const acceleration = 10.8;
        state.speed = Math.min(maxSpeed, acceleration * fallTime);

        const speedNorm = THREE.MathUtils.clamp(state.speed / maxSpeed, 0, 1);
        camera.position.y -= state.speed * deltaTime;
        camera.position.z -= state.speed * deltaTime * 0.3;

        // Movimiento horizontal muy limitado (casi sin sway, solo vibración mínima)
        state.swayTime += deltaTime;
        const swayAmount = 0.005 + speedNorm * 0.003;
        camera.position.x = (Math.random() - 0.5) * swayAmount * 0.5;
        
        // Rotación limitada: mantener vista principalmente hacia abajo con sutil oscilación
        camera.rotation.z = Math.sin(state.swayTime * 3.0) * swayAmount * 0.08;
        camera.rotation.x = -Math.PI / 2 + Math.sin(state.swayTime * 2.2) * swayAmount * 0.05;

        if (camera.position.y <= impactY) {
          state.impacted = true;
          justImpacted = true;
        }

        return {
          falling: state.falling,
          speed: state.speed,
          speedNorm,
          justImpacted
        };
      }

      return {
        falling: state.falling,
        speed: state.speed,
        speedNorm: THREE.MathUtils.clamp(state.speed / maxSpeed, 0, 1),
        justImpacted
      };
    }
  };
}
