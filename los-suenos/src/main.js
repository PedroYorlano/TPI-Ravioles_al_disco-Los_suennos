import './style.css';
import { SceneManager } from './SceneManager.js';

// Inicializar SceneManager
const manager = new SceneManager();

// Eliminar el HTML viejo the vite ("#app", ".ticks", etc) si está en index.html
const appDiv = document.getElementById('app');
if (appDiv) appDiv.remove();

// Registrar las escenas (Lazy Loading / importación dinámica)
manager.registerScene('dream1', () => import('./scenes/dream1.js'));
manager.registerScene('hub', () => import('./scenes/hubScene.js'));
manager.registerScene('dream2', () => import('./scenes/dream2.js'));
manager.registerScene('dream3', () => import('./scenes/dream3.js'));

// Iniciar en el hub para seguir el orden Hub -> dream1 -> hub -> dream2 -> hub -> dream3
manager.transitionTo('hub');
