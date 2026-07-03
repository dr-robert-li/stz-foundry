---
summary: "Playwright can inspect game state via page.evaluate() to access window properties; assertions made against returned game state objects."
---

# Exposing Game State for Playwright Testing

## Core Pattern: page.evaluate()

Source: [Evaluating JavaScript | Playwright](https://playwright.dev/docs/evaluating)

Playwright's `page.evaluate()` method executes JavaScript in the browser context and returns the result to the test process:

```javascript
const gameState = await page.evaluate(() => window.gameState);
await expect(gameState.score).toBe(100);
```

### Key Properties

- **Execution context**: Code runs in the browser (has access to DOM and window).
- **Return value**: Must be serializable (JSON-compatible: objects, arrays, primitives, not functions or DOM nodes).
- **Arguments**: Can pass arguments from test to page via parameters:
  ```javascript
  const result = await page.evaluate((param) => window.gameState[param], 'lives');
  ```

## Assertion Pattern

Source: [Assertions | Playwright](https://playwright.dev/docs/test-assertions)

Playwright's `expect()` matcher supports assertions on all returned types:

```javascript
const state = await page.evaluate(() => window.gameState);
await expect(state).toMatchObject({ lives: 3, score: 0 });
await expect(state.aliens.length).toBe(55);
await expect(state.score).toBeGreaterThan(50);
```

### Non-Retrying Assertions

For in-memory game state objects (not DOM elements), use generic matchers like:
- `toBe()`, `toEqual()`, `toContain()`
- `toBeGreaterThan()`, `toBeLessThan()`
- `toMatchObject()`, `toHaveLength()`

These do **not** retry; they assert immediately. This is correct for game state, which is deterministic after a known sequence of inputs.

## Game State Structure Requirement

For the sealed tests to work, the game must expose a `window.gameState` object with properties like:

```javascript
window.gameState = {
  lives: 3,
  score: 0,
  wave: 1,
  aliens: [ /* array of alien objects with x, y, etc. */ ],
  shields: [ /* array of shield structures */ ],
  playerBullets: [ /* active bullets */ ],
  alienBullets: [ /* active bullets */ ],
  ufo: { active: false, x: 0, y: 0 },
  state: 'playing' // or 'gameover', 'won'
};
```

### Atomic State Updates

Game logic should update `window.gameState` atomically during the update phase, before rendering. This ensures a consistent snapshot for test assertions.

## Alternative: page.exposeFunction()

Source: [Mock browser APIs | Playwright](https://playwright.dev/docs/mock-browser-apis)

If more control is needed, the game can expose a function that the test calls:

```javascript
// In game setup:
await page.exposeFunction('getGameState', () => window.gameState);

// In test:
const state = await page.evaluate(() => window.getGameState());
```

This is unnecessary for simple state queries but allows custom formatting or filtering.

## Practical Considerations

### State Scope

The `window.gameState` object should be:
- **Readable from any frame/context**: Not nested inside closures (keep it global).
- **Persisted across updates**: The game loop writes to it each frame.
- **Serializable**: No circular references, functions, or DOM nodes.

### Test Timing

Assertions should occur after a known game event (e.g., after simulating input and advancing the game by N frames). Use `page.waitForTimeout()` or manually step the game loop if deterministic frame-based testing is needed.

### Performance Impact

Calling `page.evaluate()` for every assertion adds latency (a few milliseconds per call). For performance-sensitive tests, batch multiple assertions into one evaluate call:

```javascript
const [score, lives] = await page.evaluate(() => {
  return [window.gameState.score, window.gameState.lives];
});
```

## Relevance to Intent Sealed Tests (P1–P4)

- **P1** (move-shoot-kill): Assert `gameState.aliens.length` decreased and `gameState.score` increased.
- **P2** (alien-march): Assert `gameState.aliens[0].x` changed and grid reversed at edges.
- **P3** (lives-gameover): Assert `gameState.lives` decremented and `gameState.state === 'gameover'` when appropriate.
- **P4** (waves-shields-ufo): Assert `gameState.wave` incremented, shield blocks consumed, UFO scored.

Exposing game state on `window` is the standard pattern for browser game testing.
