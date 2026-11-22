# Pixel-art style guide

## Pixel-art construction
- Silhouette: readable outer contour; avoid tiny protrusions that vanish at display size.
- Clusters: intentional groups that describe shape, material, or light. Avoid random isolated noise.
- Values: establish light, midtone, and shadow before adding hue variation.
- Edge rhythm: deliberate stair-step cadence; avoid accidental bumps and double pixels.
- Palette: reuse colors across assets. A small shared palette creates cohesion.
- Material cues: use different cluster shapes and contrast patterns, not random texture.
- Dithering: sparing and purposeful.
- Outlines: choose full, selective, or no outlines and apply consistently.
- Scale: use one logical pixel density per family; display at integer multiples where possible.

## Starting presets

| Use | Logical canvas | Palette |
|---|---:|---:|
| Tiny UI icon | 16×16 or 24×24 | 4–8 colors |
| Small prop | 24×24 or 32×32 | 6–12 colors |
| Main object | 48×48 or 64×64 | 8–16 colors |
| Scene object | 64×64 to 128×128 | 12–24 colors |
| Background tile | 16×16 or 32×32 | Shared scene palette |

## Cohesion checklist
- Same camera and horizon assumptions.
- Same light direction.
- Same outline thickness and color logic.
- Similar contrast and detail density.
- Shared palette with controlled accents.
- Consistent anchors and canvas conventions.
- No asset uses a different pixel scale without a deliberate reason.
