---
summary: "AABB (Axis-Aligned Bounding Box) collision detection is the standard for rectangular 2D game objects in Canvas; simple, fast, and sufficient for Space Invaders."
---

# Collision Detection for Canvas Games

## AABB (Axis-Aligned Bounding Box) Overview

Sources:
- [Mastering Rectangular Collision Detection in HTML5 Canvas](https://infinitejs.com/posts/mastering-rectangular-collision-html5-canvas/)
- [Kishimoto Studios - AABB 2D Collision Detection](https://kishimotostudios.com/articles/aabb_collision/)

### Why AABB?

- **Simplicity**: Two rectangles collide if they overlap on both X and Y axes.
- **Performance**: Minimal CPU cost—just four comparisons per pair.
- **Adequacy for Space Invaders**: Aliens, bullets, player, shields, and UFO are all rectilinear or approximate rectangles.

### AABB Collision Test

For two axis-aligned rectangles (rect1 and rect2), a collision occurs if:

```
rect1.x < rect2.x + rect2.width  &&
rect1.x + rect1.width > rect2.x  &&
rect1.y < rect2.y + rect2.height  &&
rect1.y + rect1.height > rect2.y
```

This is equivalent to checking: no gap on any axis.

### Data Structure

Each game object should maintain:
- `x`, `y`: top-left corner of bounding box.
- `width`, `height`: dimensions of bounding box.

### Pixel-Perfect vs. AABB Trade-offs

Source: [The Math Behind Bounding Box Collision Detection](https://dev.to/pratyush_mohanty_6b8f2749/the-math-behind-bounding-box-collision-detection-aabb-vs-obbseparate-axis-theorem-1gdn)

- **AABB**: Fast, suitable for grid-based or rectangular sprites (Space Invaders aliens, bullets, shields).
- **Pixel-perfect**: Slower, checks actual sprite pixels; necessary for rotated or curved objects.
- **Space Invaders choice**: AABB is sufficient; hand-drawn pixel sprites are designed with clear bounding boxes.

## Canvas-Specific Collision Patterns

Source: [Canvas Collision Detection — Detect Shape Overlaps with JavaScript](https://konvajs.org/docs/sandbox/Collision_Detection.html)

### Separation of Concerns

1. **Update phase**: Advance all game objects (aliens, bullets, player) to new positions.
2. **Collision phase**: Test all relevant pairs for overlaps (e.g., player bullets vs. aliens, alien bullets vs. player).
3. **Resolve phase**: Execute consequences (remove objects, decrement lives, increase score).

### Collision Pair Optimization

For Space Invaders with O(55 aliens) + O(1–3 player bullets) + O(2–3 alien bullets) + O(32+ shield blocks):

- **Naive O(n²)**: Test every pair. For ~100 objects, this is ~5,000 tests/frame—acceptable at 60fps (~16.67ms per frame).
- **Spatial partitioning**: Optional for larger games; not needed for Space Invaders scale.

## Implementation Notes

### False Positives & Margins

Some games use slightly inset bounding boxes to avoid unwanted edge collisions (e.g., inset by 1–2 pixels). For pixel-art sprites in Space Invaders, the natural sprite boundary usually works without adjustment.

### Collision Persistence

A bullet should collide once with an alien or shield block and be consumed (removed). Ensure the collision handler removes the bullet immediately to prevent multi-collisions in subsequent frames.

## Relevance to Intent P1 & P4

- **P1**: "bullet overlapping an alien removes that alien." → Use AABB to test player bullets vs. each alien.
- **P4**: "bullet hitting a shield cell reduces that cell's integrity." → Use AABB to test bullets vs. shield blocks; decrement health instead of removing.

AABB is the canonical approach and entirely sufficient for this project.
