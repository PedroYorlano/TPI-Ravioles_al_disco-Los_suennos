import * as THREE from 'three';

function createImpactBuffer(audioContext) {
  const sampleRate = audioContext.sampleRate;
  const duration = 1.4;
  const length = Math.floor(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const channel = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 5.0);
    const bass = Math.sin(2 * Math.PI * (65 - t * 22) * t) * 0.55;
    const rumble = Math.sin(2 * Math.PI * 38 * t) * 0.35;
    const noise = (Math.random() * 2 - 1) * 0.45;
    channel[i] = (bass + rumble + noise * Math.max(0.0, 1.0 - t * 1.8)) * envelope;
  }

  return buffer;
}

function createWhooshBuffer(audioContext) {
  const sampleRate = audioContext.sampleRate;
  const duration = 0.38;
  const length = Math.floor(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const channel = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.sin(Math.min(1, t / duration) * Math.PI);
    const freq = 900 + t * 1800;
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.2;
    const air = (Math.random() * 2 - 1) * 0.35;
    channel[i] = (tone + air) * envelope * 0.75;
  }

  return buffer;
}

export async function createDream2Audio(camera) {
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const wind = new THREE.Audio(listener);
  const impact = new THREE.Audio(listener);
  const whoosh = new THREE.Audio(listener);

  const loader = new THREE.AudioLoader();
  const windBuffer = await loader.loadAsync('/assets/wind.wav');

  wind.setBuffer(windBuffer);
  wind.setLoop(true);
  wind.setVolume(0.18);

  const impactBuffer = createImpactBuffer(listener.context);
  impact.setBuffer(impactBuffer);
  impact.setLoop(false);
  impact.setVolume(0.95);

  const whooshBuffer = createWhooshBuffer(listener.context);
  whoosh.setBuffer(whooshBuffer);
  whoosh.setLoop(false);
  whoosh.setVolume(0.35);

  let whooshCooldown = 0;

  return {
    listener,
    async start() {
      if (listener.context.state === 'suspended') {
        await listener.context.resume();
      }
      if (!wind.isPlaying) {
        wind.play();
      }
    },
    update(speedNorm, deltaTime) {
      if (wind.isPlaying) {
        const targetVolume = 0.16 + speedNorm * 0.7;
        wind.setVolume(targetVolume);
        wind.setPlaybackRate(0.8 + speedNorm * 0.5);
      }

      whooshCooldown = Math.max(0, whooshCooldown - deltaTime);
      if (speedNorm > 0.72 && whooshCooldown === 0 && !whoosh.isPlaying) {
        whoosh.play();
        whooshCooldown = 0.24;
      }
    },
    fadeOut() {
      // Detiene los sonidos violentos y permite un fundido silencioso
      if (wind.isPlaying) {
        wind.setVolume(0.01);
      }
      if (whoosh.isPlaying) {
        whoosh.stop();
      }
      if (impact.isPlaying) {
        impact.stop();
      }
    },
    playImpact() {
      if (wind.isPlaying) {
        wind.stop();
      }
      if (whoosh.isPlaying) {
        whoosh.stop();
      }
      if (impact.isPlaying) {
        impact.stop();
      }
      impact.play();
    },
    dispose() {
      if (wind.isPlaying) wind.stop();
      if (impact.isPlaying) impact.stop();
      if (whoosh.isPlaying) whoosh.stop();
      camera.remove(listener);
    }
  };
}
