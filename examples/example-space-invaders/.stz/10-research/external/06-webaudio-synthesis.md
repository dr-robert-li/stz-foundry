---
summary: "WebAudio API synthesizes arcade SFX using oscillators, envelopes, and filters; common patterns include coin pickup, shooting, hit, explosion, and power-up."
---

# WebAudio Synthesis for Arcade Sound Effects

## Overview

Sources:
- [Recreating legendary 8-bit games music with Web Audio API](https://codepen.io/gregh/post/recreating-legendary-8-bit-games-music-with-web-audio-api)
- [Developing game audio with the Web Audio API](https://web.dev/articles/webaudio-games)
- [Dynamic Sound with the Web Audio API](https://www.sitepoint.com/dynamic-sound-with-the-web-audio-api/)

### Zero External Dependencies

The **Web Audio API is built into all modern browsers** (Chrome, Firefox, Safari, Edge). No external library or asset file is needed for SFX.

### Core Components

- **AudioContext**: Global audio processing unit; created once per session.
- **OscillatorNode**: Generates periodic waveforms (sine, square, sawtooth, triangle).
- **GainNode**: Controls volume (fade in/out).
- **BiquadFilterNode**: Low-pass, high-pass, band-pass filtering.
- **AudioBuffer**: Raw PCM samples (for noise-based sounds).

## Classic Arcade SFX Patterns

Source: [Recreating legendary 8-bit games music with Web Audio API](https://codepen.io/gregh/post/recreating-legendary-8-bit-games-music-with-web-audio-api)

### Laser/Shot Sound (Player Firing)

- **Waveform**: Sawtooth or square.
- **Pitch sweep**: Drop from ~800Hz to ~200Hz over 50–100ms.
- **Envelope**: Fast attack, short decay.
- **Implementation**:
  ```javascript
  function playShoot(audioCtx) {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0, now + 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.1);
  }
  ```

### Explosion Sound (Alien Hit / Shield Impact)

- **Source**: White noise (random audio buffer or pink noise).
- **Filter**: Low-pass filter sweeping downward from ~8000Hz to ~200Hz.
- **Envelope**: Fast attack, exponential decay over 200–500ms.
- **Implementation sketch**:
  ```javascript
  function playExplosion(audioCtx) {
    const now = audioCtx.currentTime;
    const noise = createWhiteNoiseBuffer(audioCtx, 0.5); // 0.5s buffer
    const source = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    
    source.buffer = noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(8000, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.4);
    
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0, now + 0.4);
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    source.start(now);
    source.stop(now + 0.4);
  }
  
  function createWhiteNoiseBuffer(audioCtx, duration) {
    const rate = audioCtx.sampleRate;
    const length = duration * rate;
    const buffer = audioCtx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
  ```

### Coin Pickup (UFO Kill / Bonus)

- **Pitch sequence**: Two ascending tones (e.g., 660Hz → 880Hz, 50–100ms each).
- **Waveform**: Sine or square.
- **Envelope**: Quick attack and release.
- **Implementation sketch**:
  ```javascript
  async function playCoinPickup(audioCtx) {
    const now = audioCtx.currentTime;
    for (const [freq, delay] of [[660, 0], [880, 0.05]]) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, now + delay);
      gain.gain.exponentialRampToValueAtTime(0, now + delay + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.05);
    }
  }
  ```

### Pew (Alien Firing)

- **Similar to player shot**, but higher pitch (e.g., 400Hz → 100Hz) or different decay.
- Reuses laser pattern with different parameters.

## Critical Implementation Notes

### AudioContext Creation

Modern browsers require user interaction to resume an AudioContext:

```javascript
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// On first user interaction:
document.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
});
```

### Polyphony (Many Sounds Simultaneously)

Web Audio can play dozens of SFX at once without excessive CPU. For Space Invaders:
- 1× player shot per frame (brief).
- 1–3× alien bullets (brief).
- 1× alien hit (brief).
- 1× shield impact per collision (brief).

Total simultaneous: ~5–10 short-lived sounds. Well within budget.

### Volume Balancing

Set gain nodes carefully to avoid distortion:
- Player shot: ~0.2–0.3.
- Alien firing: ~0.1–0.2 (quieter than player).
- Explosions: ~0.3–0.5 (with fast decay).
- UFO bonus: ~0.2–0.3.

## Relevance to Intent

The intent specifies:
> "Audio: synthesized SFX via built-in WebAudio API (still zero deps)."

The above patterns cover the main arcade events: shooting, collisions, bonuses. All are real-time synthesized, no audio files.

## Sources on Implementation

Source: [How to Add Sound to a Browser Game](https://dinogame.gg/blog/how-to-add-sound-to-browser-game/)

A practical guide to WebAudio for games with example code and frequency tables.
