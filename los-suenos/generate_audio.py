import wave
import math
import random
import os

os.makedirs('public/assets', exist_ok=True)
SAMPLE_RATE = 44100

def write_wav(filename, samples):
    with wave.open(filename, 'w') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in samples:
            val = int(max(-1.0, min(1.0, s)) * 32767)
            frames.extend(val.to_bytes(2, byteorder='little', signed=True))
        f.writeframes(frames)

# 1. footstep_wood.wav (0.3s)
samples = []
for i in range(int(SAMPLE_RATE * 0.3)):
    t = i / SAMPLE_RATE
    env = math.exp(-25 * t)
    s = (math.sin(2 * math.pi * 90 * t) * 0.6 + random.uniform(-1, 1) * 0.4) * env
    samples.append(s)
write_wav('public/assets/footstep_wood.wav', samples)

# 2. footstep_carpet.wav (0.3s)
samples = []
for i in range(int(SAMPLE_RATE * 0.3)):
    t = i / SAMPLE_RATE
    env = math.exp(-20 * t)
    s = random.uniform(-1, 1) * env * 0.4
    samples.append(s)
# Soften carpet step
for j in range(2):
    for i in range(1, len(samples)):
        samples[i] = (samples[i] + samples[i-1]) * 0.5
write_wav('public/assets/footstep_carpet.wav', samples)

# 3. breath.wav (4.0s)
samples = []
for i in range(int(SAMPLE_RATE * 4.0)):
    t = i / SAMPLE_RATE
    env = math.sin(t * math.pi / 2.0) ** 2
    s = random.uniform(-1, 1) * env * 0.15
    samples.append(s)
for j in range(2):
    for i in range(1, len(samples)):
        samples[i] = (samples[i] + samples[i-1]) * 0.5
write_wav('public/assets/breath.wav', samples)

# 4. breath_heavy.wav (2.0s)
samples = []
for i in range(int(SAMPLE_RATE * 2.0)):
    t = i / SAMPLE_RATE
    env = math.sin(t * math.pi) ** 2
    s = random.uniform(-1, 1) * env * 0.25
    samples.append(s)
for j in range(2):
    for i in range(1, len(samples)):
        samples[i] = (samples[i] + samples[i-1]) * 0.5
write_wav('public/assets/breath_heavy.wav', samples)

# 5. distant_drone.wav (4.0s)
samples = []
for i in range(int(SAMPLE_RATE * 4.0)):
    t = i / SAMPLE_RATE
    s = math.sin(2 * math.pi * 50 * t) * 0.4 + math.sin(2 * math.pi * 52 * t) * 0.2
    samples.append(s)
write_wav('public/assets/distant_drone.wav', samples)

# 6. fluorescent_hum.wav (2.0s)
samples = []
for i in range(int(SAMPLE_RATE * 2.0)):
    t = i / SAMPLE_RATE
    s = math.sin(2 * math.pi * 60 * t) * 0.2 + math.sin(2 * math.pi * 120 * t) * 0.1 + random.uniform(-1, 1)*0.015
    samples.append(s)
write_wav('public/assets/fluorescent_hum.wav', samples)

# 7. wind.wav (4.0s)
samples = []
for i in range(int(SAMPLE_RATE * 4.0)):
    t = i / SAMPLE_RATE
    env = 0.6 + 0.4 * math.sin(2 * math.pi * 0.25 * t)
    s = random.uniform(-1, 1) * env * 0.3
    samples.append(s)
for j in range(3):
    for i in range(1, len(samples)):
        samples[i] = (samples[i] + samples[i-1]) * 0.5
write_wav('public/assets/wind.wav', samples)

# 8. heartbeat.wav (1.0s)
samples = []
for i in range(int(SAMPLE_RATE * 1.0)):
    t = i / SAMPLE_RATE
    env1 = math.exp(-30 * max(0, t - 0.1)) if t > 0.1 else 0
    env2 = math.exp(-30 * max(0, t - 0.4)) if t > 0.4 else 0
    s = math.sin(2 * math.pi * 40 * t) * (env1 + env2 * 0.7)
    samples.append(s)
write_wav('public/assets/heartbeat.wav', samples)

print("Audio files generated.")
