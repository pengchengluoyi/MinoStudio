# Mino Studio

Desktop testing workbench (Electron + Vue). Talks only to **Mino Nexus**. Does not start or embed Nexus, Console, or Scout.

## Run

```bash
cp .env.example .env.development   # already committed with local defaults
npm install
npm run dev
```

`.env.development` sets `VITE_NEXUS_URL=http://mino.local:10104`. Nexus registers that name on start. The login page does not ask for an IP.

| Variable | Role |
|---|---|
| `VITE_NEXUS_URL` | Nexus HTTP origin, baked in. Default `http://mino.local:10104`. |
| `VITE_SCOUT_MANIFEST_URL` | GitHub `MinoScout/releases/latest/download/manifest.json`. Installer never comes from Nexus. |

Default manifest URL in CI: `https://github.com/<same-owner>/MinoScout/releases/latest/download/manifest.json`.

## Scope

Projects, cases, run, HITL, Agent, plugins, model keys, runtime / devices, Scout download/install (packages from GitHub Releases; Nexus only issues `/runtime/nodes/install-token`).

See `docs/ELECTRON.md` and `docs/SCOUT_INSTALL.md`.

Platform admin (accounts, roles, packs, SMTP) lives in **Mino Console**.
