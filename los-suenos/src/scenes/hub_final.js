import * as THREE from 'three';
import { Howl } from 'howler';

let rainSound = null;
let music = null;
let restartTimeout = null;

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

  music = new Howl({
    src: ['/assets/Exploration (Coraline) (Instrumental).mp3'],
    loop: false,
    volume: 0.0,
  });

  // Al segundo 1 aparece el texto y arranca la música con fade in
  setTimeout(() => {
    ui.style.opacity = '1';
    music.play();
    music.fade(0.0, 0.7, 3000);
  }, 1000);

  rainSound = new Howl({
    src: ['/assets/repite_los_primeros_segundos.mp3'],
    loop: true,
    volume: 0.21,
    rate: 0.9,
  });
  rainSound.play();

  // Mantener la outro 30s y volver automaticamente al menu inicial.
  restartTimeout = setTimeout(() => {
    manager.transitionTo('landing');
  }, 30000);
}

export function update(deltaTime, manager) {
  // Escena estática
}

export function dispose(manager) {
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  const ui = document.getElementById('hub-final-ui');
  if (ui) ui.remove();
  if (rainSound) {
    try { rainSound.stop(); rainSound.unload(); } catch (e) {}
    rainSound = null;
  }
  if (music) {
    try { music.stop(); music.unload(); } catch (e) {}
    music = null;
  }
}
