# Four products

- **MinoConsole** — web admin. No Electron.
- **MinoStudio** — desktop testing workbench. Electron loads only this app.
- **MinoNexus** — API / LLM / DB. Clients talk only to Nexus.
- **MinoScout** — device executor. Dials Nexus `/node`. Not spawned by Studio.

Do not start, stop, or pkill another product. Do not add MiniOrange / miniorange strings in new code (`grep -i miniorange` must stay empty outside `node_modules`).

Nexus origin is `VITE_NEXUS_URL` (default `http://mino.local:10104`). Nexus registers that name on start. No IP picker.
