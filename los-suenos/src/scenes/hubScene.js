import * as THREE from 'three';

export function init(manager) {
  manager.scene.background = new THREE.Color(0x050505);
  
  const ui = document.createElement('div');
  ui.id = 'scene-ui';
  ui.style.position = 'absolute';
  ui.style.top = '50%';
  ui.style.left = '50%';
  ui.style.transform = 'translate(-50%, -50%)';
  ui.style.color = 'white';
  ui.style.fontFamily = 'sans-serif';
  ui.style.textAlign = 'center';
  ui.innerHTML = '<h1>HUB Central</h1><p>Has despertado a salvo del sueño.</p>';
  document.body.appendChild(ui);
}

export function update() {
  // No updates needed for empty hub
}

export function dispose() {
  const ui = document.getElementById('scene-ui');
  if (ui) ui.remove();
}
