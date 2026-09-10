# Scout install (Studio)

Scout is an independent executor. Studio downloads the installer from the **Scout GitHub Release** (public `manifest.json`), writes config, and runs the OS helper. It does **not** spawn Scout as a child process. Nexus never hosts the binaries.

## Sequence

1. User opens Studio (already logged in) → **Scout 节点** (`#/settings/scout`) 或 运行状态
2. Fetch GitHub `…/MinoScout/releases/latest/download/manifest.json` (baked `VITE_SCOUT_MANIFEST_URL`). **Never** `GET /releases/scout/latest` on Nexus.
3. `POST /runtime/nodes/install-token` (credential only — Nexus does not host the zip)
4. Electron plans which layers to fetch (see **Layered updates**), downloads each (sha256), unzips, then writes `{ nexus_url, token, version }`
5. Before replacing on-disk layers, Studio **stops** the running Scout (`mino-scout stop` → launchctl/systemd fallback). Zip helper `install.sh` / `install.ps1` runs the same stop path, then installs once per fetched layer.
6. Studio **restarts** Scout and verifies the process PID changed so app-layer code is reloaded (`sys.path` is fixed at process start).
7. Scout dials Nexus `/node`
8. Studio polls `GET /runtime/nodes`

Already installed but offline: **启动本机执行器** → `launchctl kickstart` / `schtasks /Run` / `systemctl --user start`. Studio does not `spawn` Scout on window open, and does not kill it on quit.

## Layered updates

Scout's package is split into three layers. Measured on 0.1.8 darwin-arm64:

| Layer | Installed at | Zip | Changes when |
|---|---|---|---|
| `runtime` | `bin/mino-scout` + `bin/_internal/` | 82 MB | Scout's declared deps / Python / freeze recipe |
| `app` | `bin/app/mino_scout/` | **90 KB** | every release |
| `browser` | `bin/ms-playwright/` | 357 MB | Playwright rolls a browser revision |

The combined zip is 439 MB, so a code-only update is ~4900× smaller than it used to be.

`electron/scoutLayers.cjs` holds the decision (pure functions; `npm run test:scout-layers`).
It compares each manifest layer `key` against `bin/layers.txt` — the fingerprints Scout's
installer records — and returns one of:

- `layers` — fetch only the layers whose key differs, **in `runtime` → `app` → `browser` order**.
  The order is correctness, not cosmetics: the `app` layer carries `requires_runtime`, and
  Scout's installer refuses it (non-zero exit, before touching any file) when the installed
  runtime fingerprint does not match.
- `combined` — fall back to the full zip when there is no `bin/layers.txt` (never installed
  a layered build), when the manifest has no `layers` (a release from before layering), or
  when the layers to fetch would total more than the combined zip.
- `up-to-date` — nothing to download; still rewrites config and ensures Scout is running.

The main process re-plans at install time and does not trust a plan from the renderer.
`scoutPlanUpdate` / `scoutInstalledLayers` are exposed over IPC so the UI can tell the user
the download size before they commit to it.

Each layer unzips into its own subdirectory under `<config>/package/` — `unzipScoutArchive`
clears its target first, so a shared directory would let each layer wipe the previous one.

Both entry points — `ScoutNodesPage.vue` (**更新本机**) and `ScoutInstallPanel.vue`
(**下载并安装**) — go through `scoutSetup`, so both are incremental. The older two-step
`scoutDownload` + `scoutInstall` IPC pair is still exposed on the preload bridge but no
longer used by either panel; it only ever fetched the combined zip.

## Manifest

Stable URL baked at Studio build time:

```
https://github.com/<owner>/MinoScout/releases/latest/download/manifest.json
```

`<owner>` is taken from `github.repository` in CI, or from `git remote get-url origin` locally. Override with `VITE_SCOUT_MANIFEST_URL`.

Supports a multi-arch file `{ version, items: [{ os, arch, url, sha256, installer, filename }] }` and a single-entry `{ version, url, … }`. The panel always consumes the single-row shape after picking.

## Config file

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/MinoScout/config.json` |
| Windows | `%APPDATA%\MinoScout\config.json` |
| Linux | `~/.config/minoscout/config.json` |

```json
{
  "nexus_url": "https://nexus.example.com",
  "token": "<install-token>",
  "version": "0.0.1",
  "studio_id": "a1b2c3d4e5f67890",
  "scout_id": "3f8a1c0e9b2d4f71",
  "updated_at": "2026-09-02T00:00:00.000Z"
}
```

`studio_id` is the workbench that wrote this file (same `[a-z0-9]{16}` shape). Studio is not an execution node and does not REGISTER. `scout_id` is written by Scout on first run and is `Register.node_id`.

`nexus_url` is `http://mino.local:10104` (same as Studio `VITE_NEXUS_URL`). Nexus registers that name on start. Scout does not browse mDNS for a brain.

## IPC

`scout-installed-version` · `scout-setup` · `scout-setup-status` · `scout-uninstall` · `scout-start` · `scout-stop` · `scout-restart` · `scout-download` · `scout-write-config` · `scout-install` · `scout-fetch-json`

`scout-installed-version.installed` is true only when the Scout binary exists. A leftover `config.json` or LaunchAgent plist does not count as installed. Setup progress (download / unzip / config / start) lives in the main process and is restored when returning to the page.

本机启停走 IPC。远程已连接节点走 Nexus `POST /runtime/nodes/{id}/command` → 协议 `EXECUTE node.stop` / `node.restart`。离线专机无法远程启动。远程更新未实现，只在本机走 GitHub manifest。

`GET /runtime/nodes?studio_id=` 按当前登录用户与本工作台 `studio_id` 过滤。未归属节点仅管理员可见。离线节点仍列出。

Frozen install lives at `MinoScout/bin/mino-scout`. Source/dev install still uses `venv/`. Stop prefers `mino-scout stop` (sends `EXECUTE node.shutting_down`) over unloading the service.

## Do not

- Bundle Scout as the only distribution inside Studio.app `extraResources`
- Start Scout on every Electron launch
- Kill Scout on Studio quit
- Treat “download again” as an update-by-pkill
- Put installer blobs in the Nexus data directory
