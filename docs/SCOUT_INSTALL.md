# Scout install (Studio)

Scout is an independent executor. Studio downloads the installer from the **Scout GitHub Release** (public `manifest.json`), writes config, and runs the OS helper. It does **not** spawn Scout as a child process. Nexus never hosts the binaries.

## Sequence

1. User opens Studio (already logged in) → **Scout 节点** (`#/settings/scout`) 或 运行状态
2. Fetch GitHub `…/MinoScout/releases/latest/download/manifest.json` (baked `VITE_SCOUT_MANIFEST_URL`). **Never** `GET /releases/scout/latest` on Nexus.
3. `POST /runtime/nodes/install-token` (credential only — Nexus does not host the zip)
4. Electron writes `{ nexus_url, token }` then downloads `url` and checks `sha256`
5. Zip → unzip and run `install.sh` / `install.ps1` (launchd / Scheduled Task)
6. Scout dials Nexus `/node`
7. Studio polls `GET /runtime/nodes`

Already installed but offline: **启动本机执行器** → `launchctl kickstart` / `schtasks /Run` / `systemctl --user start`. Studio does not `spawn` Scout on window open, and does not kill it on quit.

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

`scout-installed-version` · `scout-start` · `scout-stop` · `scout-restart` · `scout-download` · `scout-write-config` · `scout-install` · `scout-fetch-json`

本机启停走 IPC。远程已连接节点走 Nexus `POST /runtime/nodes/{id}/command` → 协议 `NODE_COMMAND`（stop / restart）。离线专机无法远程启动。远程更新未实现，只在本机走 GitHub manifest。

`GET /runtime/nodes?studio_id=` 按当前登录用户与本工作台 `studio_id` 过滤。未归属节点仅管理员可见。离线节点仍列出。

Frozen install lives at `MinoScout/bin/mino-scout`. Source/dev install still uses `venv/`. Stop prefers `mino-scout stop` (sends `NODE_EVENT shutting_down`) over unloading the service.

## Do not

- Bundle Scout as the only distribution inside Studio.app `extraResources`
- Start Scout on every Electron launch
- Kill Scout on Studio quit
- Treat “download again” as an update-by-pkill
- Put installer blobs in the Nexus data directory
