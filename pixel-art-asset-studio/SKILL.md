---
name: pixel-art-asset-studio
description: Art-direct, generate, refine, organize, and quality-check cohesive 2D pixel-art assets for Codex projects using Codex's built-in image generation. Use for pixel-art sprites, props, icons, tiles, backgrounds, scene elements, asset families, and sprite sheets; also use to diagnose blurry, inconsistent, noisy, or amateur-looking pixel art.
---

# Pixel Art Asset Studio

You are the art director and asset-production lead. This skill defines the visual system, production sequence, file organization, and quality bar for cohesive 2D pixel-art assets.

## Tool policy

- For AI-assisted raster generation in Gemini/Antigravity, use Google Imagen 3 (via the Gemini API / `google-genai` SDK with `imagen-3.0-generate-002`) when an API key is available.
- For local, deterministic, zero-cost asset creation, use Python and Pillow (`PIL`, `numpy`) to author, quantize, and enforce strict pixel grids, exact palette mapping, and clean binary alpha channels.
- Do not install or purchase asset packs, paid libraries, paid plugins, or paid desktop software.
- Use free local tooling such as Python and Pillow for inspection, contact sheets, resizing, palette reports, and file organization (`pixel_art_qc.py`). LibreSprite and Pixelorama are optional free editors.

## Decide what should be an image

Use raster image generation for illustrated objects, characters, props, textures, backgrounds, and sprite art.

Do not use generated raster art for everything:
- Use HTML/CSS/canvas/SVG for crisp interface controls, labels, charts, diagrams, simple geometry, and elements that must adapt to data.
- Use the existing project's icon system when one exists.
- Use pixel art for illustrative scene elements, not for text or live data visualization.

## Phase 1 — Inspect the project

Before generating:
1. Inspect the project structure, framework, existing asset directories, naming conventions, and current visual style.
2. Find where assets are referenced and determine required formats and dimensions.
3. Identify the actual display size and background on which each asset will appear.
4. Avoid overwriting existing assets. Create versioned siblings or ask before replacement.
5. If the user supplied references, label each as style reference, composition reference, subject reference, or edit target.

If the request is underspecified, make reasonable assumptions and state them. Ask only when a missing detail would materially change the result.

## Phase 2 — Lock the art direction

Create `art-direction.md` in the project's asset directory before producing a large set.

Specify:
- Concept and mood.
- Camera: top-down, three-quarter, side-on, isometric, or orthographic. Never mix conventions within a family.
- Logical pixel scale and intended display scale.
- Palette: usually 8–16 shared colors, with HEX values and semantic roles.
- Outline policy: full, selective, or none.
- Light direction and shadow treatment.
- Detail density and cluster language.
- Material cues for metal, wood, stone, foliage, glass, fabric, etc.
- Background / transparency rules.
- Explicit avoid list.

Create a small palette swatch and 2–3 representative assets first. Review them together at intended display size. Use accepted assets as references for later assets.

## Phase 3 — Asset manifest

Create `asset-manifest.json` (or CSV) with one entry per asset:
- Stable ID and filename.
- Subject and purpose.
- Canvas dimensions.
- Approximate occupied bounds.
- Camera and facing direction.
- Palette subset.
- Anchor / pivot (bottom-center for grounded props unless otherwise specified).
- Transparency requirement.
- Animation states / frame count, if any.
- Tiling or adjacency constraints.

Keep common canvas sizes and anchors when assets need to align. Animation frames must share a canvas and pivot; do not independently crop frames.

## Phase 4 — Generate with built-in image generation

For each distinct asset:
1. Invoke `$imagegen` / Codex built-in image generation. Use one call per distinct asset or distinct prompt. Do not use multiple outputs from one prompt as a substitute for separately specified objects.
2. Include the art-direction constraints in every prompt. Do not assume the model remembers previous prompts.
3. Attach accepted style-reference images when supported. State clearly which image is a style reference and which is an edit target.
4. Request a transparent background for isolated sprites. Preserve the generated alpha channel.
5. Request no text, labels, watermark, mockup, border, or unrelated objects unless explicitly required.
6. Generate a small number of variations for a difficult asset, choose one, then use it as a reference for related assets.
7. Inspect each result and iterate with one targeted change at a time.

### Prompt template

Create one [SUBJECT] as crisp 2D pixel art for [PROJECT / VISUALIZATION]. This is an isolated production asset, not a mockup or screenshot.

Camera: [CAMERA]. Logical pixel scale: [SCALE]. Visual direction: [STYLE]. Palette: [PALETTE / HEX VALUES]. Light: [DIRECTION]. Outline policy: [POLICY]. Detail density: [LOW / MEDIUM / HIGH]. Use deliberate connected pixel clusters, a readable silhouette, clear value grouping, and consistent stair-step edges. Subject occupies [BOUNDS] of the canvas, with [PADDING] padding and [ANCHOR] pivot. Background: transparent with clean alpha. Match the supplied style reference. No anti-aliasing, blur, gradients, photorealistic texture, random noise, text, watermark, extra objects, or presentation mockup.

Adjust the prompt to the actual subject; do not blindly include contradictory constraints. If the image model cannot guarantee exact dimensions, treat its output as a draft and post-process / inspect it.

## Phase 5 — File placement and project integration

Codex's built-in image generation saves generated files under `$CODEX_HOME/generated_images/` by default. For assets used by the project:
1. Select the accepted output.
2. Copy or move it into the project's asset directory, such as `public/assets/pixel/` or the existing project convention.
3. Never leave a project-referenced asset only in `$CODEX_HOME/generated_images/`.
4. Do not overwrite existing files without explicit permission; use versioned filenames.
5. Update code references only when the user asked for integration or it is clearly part of the task.
6. Report the final workspace path for every delivered asset.

For preview-only exploration, the generated image may remain in the default generated-images directory.

## Phase 6 — Pixel-art cleanup

Use free local tooling:
- Python + Pillow for dimensions, alpha, palette counts, nearest-neighbor scaling, and contact sheets.
- ImageMagick for batch image operations.
- LibreSprite or Pixelorama for manual pixel-level repair and animation.

Important:
- Downscaling a painted image does not automatically make good pixel art.
- Quantization is only a starting point; inspect and repair clusters and silhouettes.
- Use nearest-neighbor only when scaling already pixel-aligned art, preferably by integer multiples.
- Do not destroy genuine alpha. Check for semi-transparent halos or matte contamination.
- Preserve planned canvas, padding, and pivot.

## Phase 7 — Quality assurance

Run `scripts/pixel_art_qc.py` on PNG assets when Pillow is available. It reports dimensions, visible bounds, color count, transparency, and partial alpha. It is diagnostic, not an artistic judge.

Inspect each asset:
- At native logical resolution.
- At actual intended display size.
- At 4x nearest-neighbor zoom.

Check:
- Readable silhouette at actual size.
- Consistent camera, light direction, outlines, palette, and pixel density.
- Controlled palette and value separation.
- Deliberate clusters and edge cadence.
- No accidental blur, anti-aliasing, noise, or fringe.
- Correct transparency, canvas, anchor, and padding.
- Similar scale and detail density across related assets.
- Contrast against the real visualization background.

Create a contact sheet for a family and judge all assets together. An attractive isolated sprite can still be rejected if it clashes with the set.

## Phase 8 — Deliverables

For a substantial asset batch, deliver:
- `art-direction.md`
- `asset-manifest.json` or CSV
- Final PNGs in the project asset directory
- Contact sheet / preview
- Brief README describing dimensions, palette, anchors, and display scale
- Prompts or generation notes needed for future revisions

Report what was generated, which outputs were selected, where they were saved, what QA checks ran, and what still needs manual pixel cleanup. Never claim a check was performed if it was not.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Looks like a blurry painting | Illustration was merely resized | Rebuild clusters at native resolution; repair edges |
| Noisy / muddy | Too many colors or excessive texture | Reduce palette and detail |
| Assets don't match | Art direction was not repeated / referenced | Lock camera, palette, lighting, outline and scale |
| Weak readability | Silhouette or value contrast is poor | Simplify silhouette and separate values |
| Accidental jaggies | Inconsistent stair-step rhythm | Use deliberate clusters and edge cadence |
| Objects float / jump | Inconsistent pivot or canvas | Standardize anchors and frame dimensions |
| Fringe around alpha | Matte contamination | Preserve alpha, inspect edges, clean or regenerate |
| Looks good zoomed in, bad at size | Too much detail | Judge at native display size and simplify |
