# Pixel Art Style Anchors

This folder holds the project's art direction and three representative transparent PNG sprites. Read [art-direction.md](art-direction.md) before creating more art; the manifest records each sprite's canvas, anchor, and role.

The shared palette is shown in [palette.svg](palette.svg). Sprite canvases are 64×64 logical pixels with a bottom-center ground anchor at `(32, 60)`. The current game scene renders its canvas at 2× CSS size with smoothing disabled, so a 64px sprite displays at roughly 128 CSS pixels before layout-specific scaling. These samples establish character, equipment, and furnishing style; they are not yet wired into the renderer.

## Approved first style anchors

The chef, range, and table have been reviewed together at native 64px and 4× nearest-neighbor preview. They share the same camera, upper-left light, stepped outline, earth/green palette, pixel scale, and transparent-background treatment. Final PNGs have binary alpha and use no more than the 12 shared colors. See [contact-sheet.png](contact-sheet.png) and [generation-notes.md](generation-notes.md) for the review preview and prompt notes.
