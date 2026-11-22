# Pixel Art Direction — Last Call Kitchen

## Goal and mood

A warm, busy neighborhood restaurant seen during a cheerful evening service. The visual tone should feel welcoming and playful, with readable little stories in each frame: a chef working, a stove glowing, food waiting on a table. The user supplied an Eastward game screenshot as a mood reference for richly clustered, atmospheric pixel art; it is a style reference only, not a request to reproduce its characters, locations, or compositions.

## Camera and scale

- Use a consistent elevated three-quarter view: see the fronts and tops of counters, ovens, and tables. Characters face mostly toward the viewer, with slight turns for action.
- Author sprites on a 64×64 logical canvas with hard-edged 1×1 logical pixels. Keep a common bottom-center ground anchor at `(32, 60)` for grounded subjects.
- Keep transparent padding around isolated objects. Render with nearest-neighbor scaling; the current simulation canvas is drawn at half CSS size (2× display), while the title canvas uses 3× display. Future placement should use integer scale steps where the layout permits.
- Floor and room tiles are scene art, not part of isolated object sprites.

## Palette

Use the 12 shared colors in `palette.svg`; prefer these exact colors and use small, intentional material subsets. Hex values are the production target; generated drafts may need pixel cleanup to meet them.

| Name | Hex | Use |
|---|---|---|
| Night Pine | `#263A34` | Deepest outline, interior shadow |
| Warm Ink | `#3B3731` | Main outline, dark wood/metal |
| Roast Umber | `#684638` | Wood shadow, leather, baked crust |
| Tavern Oak | `#956448` | Wood midtone |
| Honey Light | `#C48A56` | Warm wood and skin shadow |
| Apricot | `#E0B477` | Warm skin, wood light |
| Linen | `#F3E4BD` | Chef whites, plates, window light |
| Sage | `#758B63` | Herbs, muted green cloth |
| Leaf | `#A4B47A` | Herb highlights, vegetables |
| Teal Slate | `#587A78` | Glazed ceramic and cool metal |
| Tomato | `#B95743` | Apron, sauce, small focal accents |
| Hearth Gold | `#F0C768` | Fire, lamp glow, food highlights |

## Rendering rules

- Outlines are selective and usually 1 logical pixel, in Warm Ink or Night Pine. Reserve full dark contours for the silhouette and deep contact points; avoid black outlines.
- Light comes from upper-left. Put warm highlights on top-left planes and compact shadows beneath/right of forms. Cast shadows are small, hard-edged clusters, not blur effects.
- Build with deliberate clusters and stair-step contours. Use medium detail density: strong silhouette first, then a few material cues. Avoid isolated noise, smooth gradients, anti-aliasing, dithering fields, and tiny details that disappear at 2×.
- Materials: wood uses broad stepped bands and a few grain marks; iron uses cool Teal Slate highlights over Warm Ink; ceramic uses Linen with a single cool shadow; food uses bold, simple Tomato, Leaf, and Hearth Gold clusters.
- Animation should preserve the same 64×64 canvas and bottom-center anchor across frames. Prefer readable two- or four-frame motions (idle bob, stirring, blink, steam) over frantic movement.
- Keep generated isolated assets truly transparent. UI, live simulation labels, state colors, and typography remain crisp HTML/CSS/canvas drawing rather than baked into art.

## Avoid

Photorealism, painted or vector-looking edges, isometric diamond grids, strict overhead/flat orthographic views, changing light direction, pure black outlines, excessive palettes, bloom, blur, semi-transparent glow baked into sprites, text, watermarks, borders, mockups, and recognizable borrowed game characters or environments.

## First style anchors

The first three assets are a chef, a wood-fired restaurant range, and a small dining table with a plated meal. These cover character, equipment, and furnishing materials without expanding into a full asset collection. Their shared palette, camera, outline treatment, pixel scale, ground anchor, and transparency are listed in `asset-manifest.json`.
