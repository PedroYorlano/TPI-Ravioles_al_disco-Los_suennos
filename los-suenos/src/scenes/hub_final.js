import * as THREE from 'three';

export async function init(manager) {
  manager.scene.background = new THREE.Color(0x000000);
  manager.scene.fog = null;
  manager.camera.position.set(0, 0, 5);
  manager.camera.rotation.set(0, 0, 0);
  
  const ui = document.createElement('div');
  ui.id = 'hub-final-ui';
  ui.style.position = 'absolute';
  ui.style.top = '50%';
  ui.style.left = '50%';
  ui.style.transform = 'translate(-50%, -50%)';
  ui.style.color = 'white';
  ui.style.fontFamily = 'Georgia, serif';
  ui.style.fontSize = '2rem';
  ui.style.textAlign = 'center';
  ui.style.opacity = '0';
  ui.style.transition = 'opacity 5s ease';
  ui.style.letterSpacing = '4px';
  ui.innerHTML = 'EL SUEÑO HA TERMINADO<br><span style="font-size: 1rem; opacity: 0.5; letter-spacing: 2px;">Gracias por jugar</span>';
  document.body.appendChild(ui);
  
  // Fundido de entrada al texto
  setTimeout(() => {
    ui.style.opacity = '1';
  }, 1000);
}

export function update(deltaTime, manager) {
  // Escena estática
}

export function dispose(manager) {
  const ui = document.getElementById('hub-final-ui');
  if (ui) ui.remove();
}
