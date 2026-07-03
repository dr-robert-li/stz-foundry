---
summary: "Classic Space Invaders arcade mechanics, grid layout, timing, and alien behavior; velocity acceleration as alien count drops."
---

# Space Invaders Arcade Mechanics

## Grid Layout

Source: [Space Invaders - Shmups Wiki](https://www.shmups.wiki/library/Space_Invaders)

- **Alien grid**: 5 rows × 11 columns (55 aliens total per wave).
- **Rows (top to bottom)**: 
  - Row 0 (Squid): 10 points each
  - Rows 1–2 (Crab): 20 points each
  - Rows 3–4 (Octopus): 30 points each
- **Intent requirement**: Project specifies "classic arcade defaults: 5x11 alien grid, 3 starting lives, alien points 10/20/30 by row."

## Movement: "The Heartbeat"

### Core Behavior

Source: [Shmups Wiki - Space Invaders](https://www.shmups.wiki/library/Space_Invaders)

- The alien grid moves **horizontally** as a single unit, then **reverses direction** and **steps down one row** when any alien reaches a screen edge.
- The grid oscillates: right → left → right, stepping down each reversal.
- Movement is perceived as a "heartbeat" rhythm; the player synchronizes shots to it.

### Speed Scaling (Critical Discovery)

Source: [Shmups Wiki - Space Invaders](https://www.shmups.wiki/library/Space_Invaders)

**Original hardware quirk**: The processor had time to advance the alien position only after rendering each alien's animation frame. With fewer aliens on screen, the loop completed faster, so **aliens moved horizontally faster**.

**Design decision**: Rather than fix this as a bug, the developer kept it as a challenging mechanic—**the grid accelerates as aliens are destroyed**.

### Mathematics

- Speed is inversely proportional to the number of remaining aliens.
- A practical heuristic: `march_interval = baseInterval * (remainingAliens / totalAliens)` or a similar scaling.
- **Intent requirement (P2)**: "the march step interval shrinks as the number of remaining aliens drops."

## Alien Bullets

- Aliens fire **downward** toward the player.
- Only a **fixed number of bullets** can be in flight at once (e.g., 2–3 per wave).
- Fire rate is typically **1 bullet per ~0.5s per living alien** (variable in different arcade revisions).

## UFO (Bonus Ship)

- Appears at the **top of the screen**, traversing horizontally.
- Triggers at random intervals or after a fixed number of shots.
- **Point value**: Random between 50 and 300 (or fixed per implementation).
- **Intent requirement (P4)**: "destroying it adds a bonus (> 0) to the score."

## Shields/Bunkers

Source: [Space Invaders - Wikipedia](https://en.wikipedia.org/wiki/Space_Invaders)

- **Count**: 4 shields on the screen.
- **Composition**: Each shield is a 2D grid of blocks (typically ~8×8 or ~4×4 in pixel art).
- **Mechanic**: Bullets (player and alien) collide with shield blocks and degrade them.
- **Degradation**: A block is typically destroyed after 1–3 hits (depending on implementation).
- **Intent requirement (P4)**: "bullet hitting a shield cell reduces that cell's integrity and is consumed."

## Win/Lose Conditions

- **Lose**: Any alien reaches the **player's row** (bottom ~1/6 of screen).
- **Lose**: **Lives ≤ 0** (player hit 3 times without respawn).
- **Win**: Destroy all aliens → advance to next wave (escalating difficulty).

## Escalation (Waves)

Source: [Shmups Wiki - Space Invaders](https://www.shmups.wiki/library/Space_Invaders), [Britannica - Space Invaders](https://www.britannica.com/topic/Space-Invaders)

- After destroying the last alien in a wave, **a new 5×11 grid spawns** with **faster base movement speed**.
- Shields may reset or persist (varies by arcade revision).
- Each wave increases perceived difficulty: faster grid, more pressure on the player.

## Screen Resolution & Playfield

- **Classic arcade**: 256 × 224 pixels (4:3 aspect ratio).
- **Playfield**: Aliens occupy the top ~2/3; shields occupy middle ~1/6; player occupies bottom ~1/6.
- **Modern recreation**: 800 × 600 or 1024 × 768 common for browser implementations (scales classic proportions).

## Timing Reference

Source: [Shmups Wiki - Space Invaders](https://www.shmups.wiki/library/Space_Invaders)

- **Arcade refresh**: 60Hz (16.67ms per frame).
- **March heartbeat**: Base interval ~500–800ms per horizontal step (varies with alien count).
- **Bullet speed**: Moderately fast horizontal (player) and vertical (aliens).

## Relevance to Implementation

The intent specifies these mechanics as requirements (P1–P4):
- P1: Firing and collision kill aliens, increment score.
- P2: Alien grid marches, reverses, steps down; speed scales with alien count.
- P3: Alien bullets decrement lives; game ends at lives==0 or alien at bottom.
- P4: Waves increase speed; shields reduce integrity on hit; UFO grants bonus points.

All of these are classically defined arcade behaviors, well-documented and stable.
