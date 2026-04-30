import * as THREE from 'three';

let sphere;

export function init(manager) {
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  sphere = new THREE.Mesh(geometry, material);
  sphere.position.set(0, 1.6, -5);
  manager.scene.add(sphere);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(-1, 2, 4);
  manager.scene.add(light);
  manager.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  manager.scene.background = new THREE.Color(0x000040);

  console.log("Scene B Init");
  
  const ui = document.createElement('div');
  ui.id = 'scene-ui';
  ui.style.position = 'absolute';
  ui.style.top = '10px';
  ui.style.left = '10px';
  ui.style.color = 'white';
  ui.style.fontFamily = 'sans-serif';
  ui.style.pointerEvents = 'none';
  ui.innerHTML = '<h1>Escena B</h1><p>Click en pantalla para capturar mouse.</p><p>Presiona <b>E</b> para volver a Escena A.</p>';
  document.body.appendChild(ui);

  manager._onKeyDownB = (e) => {
    if ((e.key === 'e' || e.key === 'E') && !manager.isTransitioning) {
      manager.transitionTo('sceneA');
    }
  };
  window.addEventListener('keydown', manager._onKeyDownB);
}

export function update(deltaTime, manager) {
  if (sphere) {
    sphere.position.y = 1.6 + Math.sin(performance.now() * 0.002) * 0.5;
  }
}

export function dispose(manager) {
  console.log("Scene B Dispose");
  window.removeEventListener('keydown', manager._onKeyDownB);
  
  const ui = document.getElementById('scene-ui');
  if (ui) ui.remove();
}
