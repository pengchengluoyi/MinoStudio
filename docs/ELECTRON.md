# Mino Studio Electron

Electron is **only** the Studio window shell. It does not start, stop, embed, or discover Nexus / Console / Scout.

## Does

- Open the Studio Vue app (dev: Vite; prod: `dist/index.html`)
- Tray, frameless window buttons, Studio.app auto-update
- `open-external`, `select-file`
- `get-runtime-status`: Electron version + whether the **baked-in** Nexus origin answers HTTP
- Scout install IPC (see `docs/SCOUT_INSTALL.md`): GitHub manifest, download, sha256, write config, unzip or open the OS installer

## Does not

- Spawn or pkill Python / Nexus / Scout
- IP picker, `discover-gateways`, `pair-gateway`, `localStorage.service_host`
- `run-case` IPC
- Mark this window as a gateway

Nexus origin is `VITE_NEXUS_URL` (default `http://mino.local:10104`). Nexus registers `mino.local` via mDNS on start. Login shows **无法连接服务器** if it is down.

Scout packages come from GitHub Releases only. Studio never calls Nexus for the zip. `VITE_SCOUT_MANIFEST_URL` is the `manifest.json` asset; CI sets it from `github.repository_owner`. Local Vite derives it from `git remote`. Already-installed Scout is started with `scout-start` (launchd / Scheduled Task), not spawned when the window opens.

## 发布

Tag `v*` and push, or run **Release Studio** (`workflow_dispatch`). Workflow is `.github/workflows/release.yml`:

- Node **22**, `npm ci`, `npm run build`
- `VITE_NEXUS_URL` defaults to `http://mino.local:10104`. Override with repo variable/secret or workflow input.
- macOS dmg+zip and Windows NSIS go to the GitHub Release for that tag
- `.npmrc` already sets `electron_mirror` and `allow-scripts` for Electron. Signing stays off (`mac.identity: null`, `CSC_IDENTITY_AUTO_DISCOVERY=false`)

## 开发怎么起

`npm run dev` 会拉起 Vite **并**打开 Electron 窗口。Electron 的 Chromium 是 `npm install` 时另下的，包装器在、本体不在时会报：

```
Electron failed to install correctly, please delete node_modules/electron and try installing again
```

补救：

```bash
cd MinoStudio
rm -rf node_modules/electron
npm install
```

`.npmrc` 已指定 `electron_mirror`（npmmirror），并允许 `electron` 跑 postinstall。`npm install` 末尾会跑 `scripts/ensure-electron.mjs`：若 `extract-zip` 只解出许可证文件、没有 `Electron.app`，会用 macOS 的 `ditto` 再解一次。

本机 Node 请用 **20 或 22 LTS**。Node 26 能跑 Vite，但 Electron 官方未支持，解压也更容易残缺。

只看页面、不需要桌面壳：

```bash
npm run dev:web
# 浏览器打开 http://127.0.0.1:5173/
```

Studio 固定 **5173**。5174 是 Console。两个都占着时不要让 Vite 自动换端口。

在 Cursor 内置终端里跑时，环境里可能带 `ELECTRON_RUN_AS_NODE=1`（Cursor 自己是 Electron）。`npm run dev` 已 `env -u` 清掉它，否则窗口起不来。
