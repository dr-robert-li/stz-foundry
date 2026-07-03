---
summary: "FPS measurement in headless Chromium requires GPU hardware acceleration (--use-gl=egl); frame count and delta time tracked in-game, median over 5s window assessed."
---

# FPS Measurement in Headless Chromium

## Hardware Acceleration Requirement

Sources:
- [Headless chrome – testing webgl using playwright](https://www.createit.com/blog/headless-chrome-testing-webgl-using-playwright/)
- [Enable GPU to speed up slow Playwright tests in headless mode](https://michelkraemer.com/enable-gpu-for-slow-playwright-tests-in-headless-mode/)

### Default Behavior (Problematic)

- Headless Chrome uses a **software renderer** by default (no GPU).
- Canvas 2D rendering will be slow (~8–15 fps) without hardware acceleration.
- WebGL even more so.

### Fix: Enable GPU

Pass `--use-gl=egl` (or `--use-gl=desktop` on macOS/Windows) to Chromium:

**Playwright Configuration** (playwright.config.js):
```javascript
export default defineConfig({
  use: {
    launchOptions: {
      args: ['--use-gl=egl'],
    },
  },
});
```

**Or in test**:
```javascript
const browser = await chromium.launch({
  args: ['--use-gl=egl'],
});
```

### Expected Impact

With GPU enabled, Canvas 2D animation typically achieves **30–60 fps** on modern hardware, suitable for Space Invaders.

## In-Game FPS Tracking

### Method: Frame Counter + Delta Time

The game loop itself should track FPS by counting rendered frames and measuring elapsed time:

```javascript
let frameCount = 0;
let fpsSamples = [];
let lastSampleTime = currentTime;

function gameLoop(currentTime) {
  frameCount++;
  
  const elapsed = currentTime - lastSampleTime;
  if (elapsed >= 1000) {  // Every 1 second
    const fps = (frameCount * 1000) / elapsed;
    fpsSamples.push(fps);
    frameCount = 0;
    lastSampleTime = currentTime;
  }
  
  // ... game update and render ...
  requestAnimationFrame(gameLoop);
}

// After 5 seconds, calculate median of fpsSamples
function calculateMedianFps(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

window.gameState.medianFps = calculateMedianFps(fpsSamples);
```

### Exposure to Test

Export the median FPS on `window.gameState` or a similar global:

```javascript
// In game:
window.gameState.medianFps = medianFps;
window.gameState.fpsSamples = fpsSamples;

// In test:
await page.waitForTimeout(5000);  // Let 5 seconds of frames accumulate
const medianFps = await page.evaluate(() => window.gameState.medianFps);
await expect(medianFps).toBeGreaterThanOrEqual(50);
```

## Intent Requirement P5

> "median_fps >= 50 measured over a 5-second headless Chromium capture of active gameplay."

### Test Strategy

1. Launch Chromium with `--use-gl=egl`.
2. Open the bundled HTML game.
3. Simulate player input (e.g., move and fire to keep the game active).
4. Wait 5 seconds.
5. Retrieve `window.gameState.medianFps`.
6. Assert `medianFps >= 50`.

### Practical Considerations

- **Active gameplay**: Ensure the test actively moves the player or triggers aliens; a static screen may be optimized differently by the browser.
- **Variance**: FPS can vary with system load. Running the test multiple times and checking statistical significance (mean > threshold) is better than a single run.
- **Median vs. mean**: Median is more robust to outliers (brief frame drops). A single 15ms stall doesn't skew the median as much as the mean.

## Sources on Performance Testing

Source: [Measuring Page Performance Using Playwright - Best Practices](https://www.checklyhq.com/docs/learn/playwright/performance/)

Best practices:
- Disable browser extensions and unnecessary background processes.
- Run in a consistent environment (same machine, time of day if possible).
- Set consistent viewport and timezone.
- Measure multiple times and use medians or percentiles.

## Relevance to Implementation

The game must:
1. Track FPS samples every 1–2 seconds of runtime.
2. Expose `window.gameState.medianFps` after accumulating samples.
3. Run at Canvas 2D on hardware-accelerated Chromium.
4. Target >50 fps for the 5-second test window (60fps is the stretch goal; 50 is the requirement).
