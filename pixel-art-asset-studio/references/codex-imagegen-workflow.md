# Codex built-in image-generation workflow

This skill complements Codex's built-in `imagegen` skill; it does not replace it.

## Invoke

- For raster assets, explicitly invoke `$imagegen` in the task or follow the Codex image-generation skill's normal routing.
- Use the built-in image-generation tool by default. It does not require `OPENAI_API_KEY`.
- Do not use the image-generation CLI or API fallback unless the user explicitly asks for it.
- For transparent sprites, request a transparent background and preserve the alpha channel.

## Multiple assets

- Different subjects require separate prompts / built-in image-generation calls.
- `n`-style variants are appropriate for alternatives of one prompt, not for distinct asset subjects.
- Generate a few style anchors first. Select a master style reference, then provide it to subsequent generations.
- Do not ask for a giant sheet of unrelated objects if each object needs independent transparency, sizing, or placement.

## Editing

- If an image is visible in the conversation, use it as the edit target or reference as appropriate.
- For local files, follow the Codex imagegen skill's supported workflow to make the image visible before requesting an edit. Do not assume a filesystem path alone can be passed as an edit target.
- Preserve invariants aggressively and save edits non-destructively.

## Output paths

- Built-in generation defaults to `$CODEX_HOME/generated_images/`.
- If the asset is intended for the current project, copy or move the selected final into the project workspace and update references as appropriate.
- Never leave an asset referenced by the project only in the generated-images directory.
- Do not overwrite an existing asset without explicit permission. Prefer versioned siblings.

## Usage and cost

- No paid asset packs, third-party libraries, or API key are needed for the built-in path.
- Image generation uses the user's available Codex usage limits. Do not describe it as unlimited or universally free.
