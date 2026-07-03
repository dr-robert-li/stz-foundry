---
summary: "HTML5 Canvas game loop pattern using requestAnimationFrame with fixed timestep for deterministic physics and replay capability."
---

# Canvas Game Loop Pattern

## requestAnimationFrame Fundamentals

Source: [Performant Game Loops in JavaScript](https://www.aleksandrhovhannisyan.com/blog/javascript-game-loop/)

- **Baseline**: requestAnimationFrame is the standard for visual updates in modern browsers, automatically synchronized to the display's refresh rate (typically 60Hz).
- **Advantage over setInterval**: requestAnimationFrame is automatically paused when the tab loses focus, reducing CPU and battery usage.
- **Callback timing**: rAF receives a DOMHighResTimeStamp (milliseconds elapsed since page load), enabling precise delta-time calculation.

## Fixed Timestep Pattern

Sources: 
- [A Detailed Explanation of JavaScript Game Loops and Timing](https://isaacsukin.com/news/2015/01/detailed-explanation-javascript-game-loops-and-timing)
- [Javascript Game Foundations - The Game Loop](https://jakesgordon.com/writing/javascript-game-foundations-the-game-loop/)

### Why Fixed Timestep?

- **Determinism**: Game physics/state updates run at a constant time delta (e.g., 16.67ms for 60fps), enabling replays and test reproducibility.
- **Decoupling**: Rendering happens at the monitor's refresh rate; update logic runs at a fixed rate independent of frame drops or system variance.
- **Predictability**: Collision detection, AI, and physics behavior are consistent across playthroughs.

### Implementation Pattern

```
accumulator = 0
FIXED_TIMESTEP = 16.67 // ms (1/60th second for 60fps)

function gameLoop(currentTime) {
  deltaTime = currentTime - lastTime
  lastTime = currentTime
  
  // Cap deltaTime to prevent spiral-of-death
  // (when tab loses focus, deltaTime can spike)
  deltaTime = Math.min(deltaTime, FIXED_TIMESTEP * 3)
  
  accumulator += deltaTime
  
  // Update at fixed rate
  while (accumulator >= FIXED_TIMESTEP) {
    update(FIXED_TIMESTEP)
    accumulator -= FIXED_TIMESTEP
  }
  
  // Render at actual framerate
  render()
  requestAnimationFrame(gameLoop)
}
```

## Space Invaders Arcade Refresh Rate

Source: [Shmups Wiki - Space Invaders](https://www.shmups.wiki/library/Space_Invaders)

- **Original hardware**: 60Hz screen refresh (60 interrupts per second).
- **Implication for emulation**: A fixed 16.67ms timestep (1/60s) closely mirrors arcade timing.

## Practical Considerations

### Delta Time Spike Handling
When a browser tab regains focus after backgrounding, rAF will deliver a very large delta time. A common approach is to cap delta to a multiple of the fixed timestep (e.g., 3× FIXED_TIMESTEP) to prevent "catch-up" stutter.

### Browser Focus Loss
requestAnimationFrame pauses automatically, so no special handling is needed; the next rAF call after regaining focus will have the accumulated time.

## Relevance to Space Invaders Implementation

- Use requestAnimationFrame as the loop driver.
- Maintain a fixed timestep of ~16.67ms (1/60s) for all game state updates.
- Render continuously at the browser's natural framerate.
- This ensures game behavior is frame-rate-independent and testable.
