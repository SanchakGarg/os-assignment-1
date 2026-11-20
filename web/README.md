# Last Call browser viewer

A local pixel-art viewer for version 1 restaurant simulation traces. The C program runs the simulation; this page displays a recording. Synthetic examples are included for use before the C trace writer is connected.

For the bundled example buttons, run `python3 -m http.server 8000` from the repository root and open `http://localhost:8000/web/`. The server only serves files; it does not run C. You can also open `index.html` directly and select a trace file from your computer.

The viewer expects the fields documented in [`../docs/shared-data.md`](../docs/shared-data.md). JSON content may use `.json` or `.txt`. A raw assignment input file has no execution history; run it through the C program's trace writer first. Examples are labeled SYNTHETIC and are not proof of live worker concurrency. Imported recordings are labeled RECORDED REPLAY.

Controls: Space toggles play/pause; arrow keys step between frames; slider seeks; the speed button changes replay speed; All cases switches runs; Save recording downloads the loaded trace. Playback cannot change simulation results.
