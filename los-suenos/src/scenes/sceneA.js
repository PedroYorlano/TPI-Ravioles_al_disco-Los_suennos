import * as THREE from 'three';

let cube;

export function init(manager) {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  cube = new THREE.Mesh(geometry, material);
  cube.position.set(0, 1.6, -5);
  manager.scene.add(cube);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 1, 1);
  manager.scene.add(light);
  manager.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  manager.scene.background = new THREE.Color(0x202020);

  console.log("Scene A Init");
  
  // UI simple para mostrar instrucciones
  const ui = document.createElement('div');
  ui.id = 'scene-ui';
  ui.style.position = 'absolute';
  ui.style.top = '10px';
  ui.style.left = '10px';
  ui.style.color = 'white';
  ui.style.fontFamily = 'sans-serif';
  ui.style.pointerEvents = 'none';
  ui.innerHTML = '<h1>Escena A</h1><p>Click en pantalla para capturar mouse.</p><p>Presiona <b>E</b> para ir a Escena B.</p>';
  document.body.appendChild(ui);

  // Bindear el listener a manager para poder removerlo en dispose
  manager._onKeyDownA = (e) => {
    if ((e.key === 'e' || e.key === 'E') && !manager.isTransitioning) {
      manager.transitionTo('sceneB');
    }
  };
  window.addEventListener('keydown', manager._onKeyDownA);
}

export function update(deltaTime, manager) {
  if (cube) {
    cube.rotation.x += deltaTime * 0.5;
    cube.rotation.y += deltaTime * 0.5;
  }
}

export function dispose(manager) {
  console.log("Scene A Dispose");
  window.removeEventListener('keydown', manager._onKeyDownA);
  
  const ui = document.getElementById('scene-ui');
  if (ui) ui.remove();
}
