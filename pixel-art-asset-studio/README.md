# Pixel Art Asset Studio — Codex edition

A Codex-focused skill for consistent 2D pixel-art assets using Codex's built-in image-generation workflow.

## Recommended installation (user-wide)

1. Unzip this archive.
2. Copy the `pixel-art-asset-studio` folder into `~/.agents/skills/`.
3. The final path should be `~/.agents/skills/pixel-art-asset-studio/SKILL.md`.
4. Restart Codex if the skill does not appear.

On macOS/Linux, from the directory containing the extracted folder:

```bash
mkdir -p ~/.agents/skills
cp -R pixel-art-asset-studio ~/.agents/skills/
```

To install only for one repository, put the folder at:

```text
<repo-root>/.agents/skills/pixel-art-asset-studio/
```

Codex discovers user skills in `$HOME/.agents/skills` and repository skills in `.agents/skills` locations from the working directory up to the repository root.

## Use it

In Codex, ask:

```text
$pixel-art-asset-studio

Inspect this project and create a cohesive pixel-art asset family for the visualization.
Use the built-in image generation workflow. First establish art direction and generate
2–3 representative assets; inspect them at actual display size before producing the rest.
Save final assets inside the project and integrate them where appropriate.
```

You can also explicitly mention `$imagegen` when you want to emphasize raster generation. Codex's built-in `imagegen` skill is normally bundled with current Codex installations; do not install a duplicate unless it is missing.

## Dependencies and costs

- No paid asset packs or paid third-party libraries.
- No API key required for Codex built-in image generation.
- Image generation consumes available Codex usage limits.
- Optional PNG diagnostics: `python -m pip install Pillow`.
- Optional editors: LibreSprite or Pixelorama.

The QA script is diagnostic, not an artistic judge. The agent must still inspect contact sheets and actual display-size output.
