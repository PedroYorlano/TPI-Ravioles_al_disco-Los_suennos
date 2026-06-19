let state = {
  container: null,
  video: null,
};

export async function init(manager) {
  // Iniciar la precarga en segundo plano
  manager.preloadAllBackground();

  manager.controls.enabled = false;
  manager.controls.unlock();

  manager.renderer.domElement.style.display = 'none';

  const container = document.createElement('div');
  container.id = 'landing-screen';
  container.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:100vw',
    'height:100vh',
    'background:#000',
    'z-index:9999',
    'overflow:hidden',
    'opacity:1',
  ].join(';');

  // Video de fondo en loop con audio
  const video = document.createElement('video');
  video.src = '/assets/Video_Intro.mp4';
  video.playsInline = true;
  // Loop manual: cuando termina, vuelve al segundo 1 (saltea la intro del video)
  video.addEventListener('ended', () => {
    video.currentTime = 0.9;
    video.play().catch(() => {});
  });
  // El autoplay con sonido requiere interacción previa; intentamos sin mute,
  // y en caso de bloqueo del navegador, volvemos a intentar muteado.
  video.muted = false;
  video.style.cssText = [
    'position:absolute',
    'top:0',
    'left:0',
    'width:100%',
    'height:100%',
    'object-fit:cover',
    'pointer-events:none',
  ].join(';');
  container.appendChild(video);
  state.video = video;

  // Bloque con blur que contiene título y botón (abajo a la derecha)
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:absolute',
    'bottom:48px',
    'right:48px',
    'padding:28px 40px 24px 40px',
    'background:rgba(0,0,0,0.38)',
    'backdrop-filter:blur(14px)',
    '-webkit-backdrop-filter:blur(14px)',
    'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:4px',
    'display:flex',
    'flex-direction:column',
    'align-items:flex-end',
    'gap:18px',
    'z-index:2',
  ].join(';');

  // Título "Los Sueños"
  const title = document.createElement('div');
  title.textContent = 'Los Sueños';
  title.style.cssText = [
    'color:white',
    'font-family:Georgia,serif',
    'font-size:48px',
    'font-weight:300',
    'letter-spacing:6px',
    'text-shadow:0 0 20px rgba(255,255,255,0.3)',
    'user-select:none',
    'line-height:1',
  ].join(';');
  panel.appendChild(title);

  // Botón "Comenzar"
  const btn = document.createElement('button');
  btn.textContent = 'Comenzar';
  btn.style.cssText = [
    'background:transparent',
    'border:1px solid rgba(255,255,255,0.55)',
    'color:white',
    'font-family:Georgia,serif',
    'font-size:15px',
    'letter-spacing:4px',
    'padding:11px 38px',
    'cursor:pointer',
    'outline:none',
    'transition:background 0.3s,border-color 0.3s',
    'align-self:flex-end',
  ].join(';');

  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(255,255,255,0.12)';
    btn.style.borderColor = 'rgba(255,255,255,0.9)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
    btn.style.borderColor = 'rgba(255,255,255,0.55)';
  });

  btn.addEventListener('click', () => {
    btn.disabled = true;
    container.style.transition = 'opacity 1s ease';
    container.style.opacity = '0';
    setTimeout(() => {
      manager.renderer.domElement.style.display = '';
      manager.transitionTo('intro');
    }, 1000);
  });

  panel.appendChild(btn);
  container.appendChild(panel);
  document.body.appendChild(container);
  state.container = container;

  // Arrancar desde el segundo 2 y al 50% de volumen
  video.currentTime = 2;
  video.volume = 0.5;

  // Intentar play con audio; si el navegador lo bloquea, reproducir muteado
  video.play().catch(() => {
    video.muted = true;
    video.play().catch(() => {});
  });

  // Desmutear en la primera interacción del usuario si comenzó muteado
  const unmute = () => {
    if (video.muted) {
      video.muted = false;
      video.play().catch(() => { video.muted = true; });
    }
    container.removeEventListener('pointerdown', unmute);
    container.removeEventListener('pointermove', unmute);
  };
  container.addEventListener('pointerdown', unmute);
  container.addEventListener('pointermove', unmute);
}

export function update(_deltaTime, _manager) {}

export function dispose(manager) {
  if (state.video) {
    state.video.pause();
    state.video.src = '';
    state.video = null;
  }
  if (state.container) {
    state.container.remove();
    state.container = null;
  }
  manager.renderer.domElement.style.display = '';
}
