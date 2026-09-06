const { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const crypto = require('crypto')
const os = require('os')
const { execFile, spawn } = require('child_process')
const { promisify } = require('util')
const { autoUpdater } = require('electron-updater')

const execFileAsync = promisify(execFile)

const NEXUS_URL = String(process.env.VITE_NEXUS_URL || 'http://mino.local:10104').replace(/\/$/, '')

/** Same three zips Scout CI publishes. Darwin is always arm64. */
const packedArchForOs = (os) => (os === 'darwin' ? 'arm64' : 'x64')
const hostPlatform = () => ({ os: process.platform, arch: packedArchForOs(process.platform) })

if (process.platform === 'darwin') {
  app.commandLine.appendSwitch(
    'disable-features',
    'MacWebContentsOcclusion,CalculateNativeWinOcclusion,AutofillEnableAccountWalletStorage',
  )
}

let mainWindow = null
let tray = null
let trayMenu = null
let isQuitting = false

const SETUP_STAGES = {
  download: { from: 0, to: 55, label: '下载安装包' },
  unzip: { from: 55, to: 75, label: '解压' },
  config: { from: 75, to: 88, label: '写入配置' },
  start: { from: 88, to: 100, label: '启动 Scout' },
}

let scoutSetupJob = {
  active: false,
  stage: '',
  label: '',
  percent: 0,
  error: '',
}

const snapshotSetupJob = () => ({ ...scoutSetupJob })

const emitSetupProgress = (patch = {}) => {
  Object.assign(scoutSetupJob, patch)
  const payload = snapshotSetupJob()
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('scout-setup-progress', payload) } catch { /* gone */ }
  }
}

const START_STAGES = {
  register: '写入启动项',
  launch: '通知系统拉起',
  wait: '等待进程就绪',
}

let scoutStartJob = {
  active: false,
  stage: '',
  label: '',
  error: '',
  pid: null,
}

const snapshotStartJob = () => ({ ...scoutStartJob })

const emitStartProgress = (patch = {}) => {
  Object.assign(scoutStartJob, patch)
  const payload = snapshotStartJob()
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('scout-start-progress', payload) } catch { /* gone */ }
  }
}

const mapStagePercent = (stage, local = 0) => {
  const spec = SETUP_STAGES[stage] || SETUP_STAGES.download
  const clamped = Math.max(0, Math.min(100, Number(local) || 0))
  return Math.round(spec.from + (spec.to - spec.from) * (clamped / 100))
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

const checkUrl = (url, timeoutMs = 3000) => new Promise((resolve) => {
  const lib = url.startsWith('https:') ? https : http
  const req = lib.get(url, (res) => {
    resolve(res.statusCode >= 200 && res.statusCode < 500)
    res.resume()
  })
  req.on('error', () => resolve(false))
  req.setTimeout(timeoutMs, () => {
    req.destroy()
    resolve(false)
  })
})

const openExternalUrl = async (url) => {
  const s = String(url || '').trim()
  if (!/^https?:\/\//i.test(s)) return false
  await shell.openExternal(s)
  return true
}

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })
})

function createWindow() {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, '../public/icon.ico'),
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
    },
  })

  win.on('closed', () => { mainWindow = null })
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  mainWindow = win

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  if (process.platform === 'darwin') {
    app.dock.show()
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '../public/icon.png')
    if (fs.existsSync(iconPath)) {
      try { app.dock.setIcon(iconPath) } catch (_) { /* ignore */ }
    }
  }
}

function createTray() {
  if (tray) return
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
    : path.join(__dirname, process.platform === 'win32' ? '../public/icon.ico' : '../public/icon_dock.png')

  let icon = nativeImage.createFromPath(iconPath)
  if (process.platform === 'darwin') {
    icon = icon.resize({ width: 22, height: 22 })
    icon.setTemplateImage(true)
  }

  tray = new Tray(icon)
  trayMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) mainWindow.show()
        else createWindow()
      },
    },
    {
      label: '运行状态',
      click: () => {
        const go = () => mainWindow.webContents.executeJavaScript('window.location.hash = "#/settings/runtime?view=overview"')
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          go()
        } else {
          createWindow()
          mainWindow.webContents.once('did-finish-load', go)
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setToolTip('Mino Studio')
  const showMain = () => {
    if (mainWindow) mainWindow.show()
    else createWindow()
  }
  if (process.platform === 'darwin') {
    tray.on('click', showMain)
    tray.on('right-click', () => tray.popUpContextMenu(trayMenu))
  } else {
    tray.setContextMenu(trayMenu)
    tray.on('click', showMain)
  }
}

function initAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info)
  })
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-progress', progressObj)
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info)
  })
  autoUpdater.on('error', (err) => {
    const msg = err.message || ''
    if (
      msg.includes('ERR_CONNECTION_RESET') ||
      msg.includes('ERR_CONNECTION_TIMED_OUT') ||
      msg.includes('ERR_INTERNET_DISCONNECTED') ||
      msg.includes('HttpError: 404') ||
      msg.includes('Cannot find latest.yml')
    ) return
    console.error('[AutoUpdater]', msg)
  })
  if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {})
}

ipcMain.handle('open-external', (_event, url) => openExternalUrl(url))

ipcMain.handle('select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] })
  if (canceled) return null
  return filePaths[0]
})

ipcMain.on('host-platform', (event) => {
  event.returnValue = hostPlatform()
})

ipcMain.handle('get-runtime-status', async () => {
  const online = await checkUrl(`${NEXUS_URL}/sys/server_info`)
  const host = hostPlatform()
  return {
    electron: {
      version: app.getVersion(),
      platform: host.os,
      arch: host.arch,
      online: true,
    },
    endpoints: [{ name: 'nexus', url: NEXUS_URL, online }],
  }
})

const scoutConfigDir = () => {
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Application Support', 'MinoScout')
  }
  if (process.platform === 'win32') {
    return path.join(app.getPath('appData'), 'MinoScout')
  }
  return path.join(app.getPath('home'), '.config', 'minoscout')
}

const scoutConfigPath = () => path.join(scoutConfigDir(), 'config.json')

const STUDIO_ID_LEN = 16

const sanitizeAlnumId = (raw) => String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const maskSecret = (value) => {
  const text = String(value || '')
  if (!text) return ''
  if (text.length <= 4) return '••••'
  return `••••${text.slice(-4)}`
}

const studioIdentityPath = () => path.join(app.getPath('userData'), 'studio-identity.json')

const generateStudioId = () => {
  const material = `${os.hostname()}|${app.getPath('userData')}`
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, STUDIO_ID_LEN)
}

const loadStudioId = () => {
  // Studio is a UI client, not an execution node: studio_id is not registered
  // on /node and is not a device. Same [a-z0-9]{16} shape as Scout's scout_id;
  // copied into Scout config.json so we know which workbench installed that
  // node. X-Mino-Client stays console|studio — not a unique identity header.
  try {
    const data = JSON.parse(fs.readFileSync(studioIdentityPath(), 'utf8'))
    const id = sanitizeAlnumId(data.studio_id)
    if (id) return id
  } catch { /* first run */ }
  const id = generateStudioId()
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(studioIdentityPath(), `${JSON.stringify({ studio_id: id }, null, 2)}\n`)
  } catch { /* still return id */ }
  return id
}

const readScoutConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(scoutConfigPath(), 'utf8'))
  } catch {
    return null
  }
}

/* Scout 的安装包是分层的 —— 决策逻辑在 ./scoutLayers.cjs（纯函数，好单测），
   这里只做 fs 与 electron 的胶水。
   刻意用 import 而不是 require：vite 打包主进程时不会跟进 require() 里的相对路径，
   写成 require 的话这个模块不会进 bundle，打出来的 app 一启动就 MODULE_NOT_FOUND。 */
import { parseLayersTxt, planScoutUpdate } from './scoutLayers.cjs'

/** 读 <bin>/layers.txt。没装过返回 null。 */
const readInstalledScoutLayers = () => {
  try {
    return parseLayersTxt(fs.readFileSync(path.join(scoutConfigDir(), 'bin', 'layers.txt'), 'utf8'))
  } catch {
    return null
  }
}

const planScoutUpdateHere = (item = {}) => planScoutUpdate(item, readInstalledScoutLayers())

const scoutBinCandidates = () => {
  const home = scoutConfigDir()
  return [
    path.join(home, 'bin', 'mino-scout'),
    path.join(home, 'bin', 'mino-scout.exe'),
    path.join(home, 'venv', 'bin', 'mino-scout'),
    path.join(home, 'venv', 'Scripts', 'mino-scout.exe'),
    path.join(home, 'venv', 'Scripts', 'mino-scout'),
  ]
}

const scoutBin = () => scoutBinCandidates().find((p) => fs.existsSync(p)) || ''

const scoutBinaryInstalled = () => Boolean(scoutBin())

const scoutAppInstalled = () => scoutBinaryInstalled()

const scoutUnixBin = () => scoutBin()

const scoutWinBin = () => scoutBin()

const spawnScoutDetached = (bin) => {
  const env = { ...process.env }
  const extraPath = '/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin'
  env.PATH = env.PATH ? `${extraPath}:${env.PATH}` : extraPath
  const browsers = path.join(scoutConfigDir(), 'bin', 'ms-playwright')
  if (chromiumLooksInstalled(browsers)) env.PLAYWRIGHT_BROWSERS_PATH = browsers
  const child = spawn(bin, [], {
    cwd: scoutConfigDir(),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  })
  child.unref()
  return { ok: true, method: 'detached', pid: child.pid }
}

const scoutLaunchdPlist = () =>
  path.join(app.getPath('home'), 'Library', 'LaunchAgents', 'com.mino.scout.plist')

const scoutLaunchdPath = () =>
  '/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin'

const writeScoutLaunchdPlist = () => {
  const bin = scoutUnixBin()
  if (!bin) return ''
  const plist = scoutLaunchdPlist()
  const home = scoutConfigDir()
  const logDir = path.join(app.getPath('home'), 'Library', 'Logs', 'MinoScout')
  fs.mkdirSync(path.dirname(plist), { recursive: true })
  fs.mkdirSync(logDir, { recursive: true })
  const browsers = path.join(home, 'bin', 'ms-playwright')
  const browserEnv = chromiumLooksInstalled(browsers)
    ? `
    <key>PLAYWRIGHT_BROWSERS_PATH</key>
    <string>${browsers}</string>`
    : ''
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mino.scout</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bin}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${home}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${scoutLaunchdPath()}</string>
    <key>HOME</key>
    <string>${app.getPath('home')}</string>${browserEnv}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>Crashed</key>
    <true/>
  </dict>
  <key>StandardOutPath</key>
  <string>${path.join(logDir, 'scout.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(logDir, 'scout.err.log')}</string>
</dict>
</plist>
`
  fs.writeFileSync(plist, xml)
  return plist
}

const scoutIsRunning = async () => {
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('launchctl', ['list', 'com.mino.scout'], { timeout: 4000 })
      const pid = Number((stdout.match(/"PID"\s*=\s*(\d+)/) || [])[1] || 0)
      if (pid > 0) return { running: true, pid, method: 'launchctl' }
    } catch { /* not loaded */ }
    try {
      const { stdout } = await execFileAsync('pgrep', ['-f', 'mino-scout'], { timeout: 4000 })
      const pid = Number((stdout.match(/\d+/) || [])[0] || 0)
      if (pid > 0) return { running: true, pid, method: 'pgrep' }
    } catch { /* none */ }
    return { running: false }
  }
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('schtasks', ['/Query', '/TN', 'Mino Scout', '/FO', 'LIST', '/V'], {
        timeout: 6000,
        windowsHide: true,
      })
      if (/Status:\s*Running/i.test(stdout)) return { running: true, method: 'schtasks' }
    } catch { /* no task */ }
    return { running: false }
  }
  try {
    const { stdout } = await execFileAsync('systemctl', ['--user', 'is-active', 'mino-scout.service'], { timeout: 4000 })
    if (String(stdout).trim() === 'active') return { running: true, method: 'systemd' }
  } catch { /* inactive */ }
  return { running: false }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitUntilScoutRunning = async ({ timeoutMs = 15000, intervalMs = 400 } = {}) => {
  const started = Date.now()
  let last = { running: false }
  while (Date.now() - started < timeoutMs) {
    last = await scoutIsRunning()
    if (last.running) return last
    await sleep(intervalMs)
  }
  return last
}

const chmodTreeExecutable = (root) => {
  if (!root || !fs.existsSync(root)) return
  const walk = (dir) => {
    let names = []
    try { names = fs.readdirSync(dir) } catch { return }
    for (const name of names) {
      const p = path.join(dir, name)
      let st
      try { st = fs.lstatSync(p) } catch { continue }
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) walk(p)
      else if (st.isFile()) {
        try { fs.chmodSync(p, (st.mode | 0o111) & 0o777) } catch { /* ignore */ }
      }
    }
  }
  walk(root)
}

const prepareScoutPayload = async (root) => {
  if (!root || !fs.existsSync(root)) return
  chmodTreeExecutable(root)
  if (process.platform === 'darwin') {
    try { await execFileAsync('xattr', ['-cr', root], { timeout: 20000 }) } catch { /* ignore */ }
  }
}

const startFailureHint = () => {
  if (process.platform === 'darwin') {
    return 'macOS 可能拦截了后台启动。系统设置 → 通用 → 登录项与扩展 里允许 mino-scout 后，再点启动。'
  }
  return '本机执行器没有真正跑起来。'
}

const chromiumLooksInstalled = (dir) => {
  if (!dir || !fs.existsSync(dir)) return false
  const walk = (current, depth) => {
    if (depth > 6) return false
    let names = []
    try { names = fs.readdirSync(current) } catch { return false }
    for (const name of names) {
      const p = path.join(current, name)
      const low = name.toLowerCase()
      if (low === 'chrome' || low === 'chrome.exe' || low === 'chromium' || name.endsWith('.app')) {
        return true
      }
      try {
        if (fs.statSync(p).isDirectory() && walk(p, depth + 1)) return true
      } catch { /* ignore */ }
    }
    return false
  }
  return walk(dir, 0)
}

const startScoutService = async ({ onStage } = {}) => {
  const bin = scoutBin()
  if (!bin) return { ok: false, error: '本机还没有执行器。请先下载安装。' }
  try { fs.chmodSync(bin, 0o755) } catch { /* ignore */ }
  const note = (stage) => {
    onStage?.(stage)
  }
  if (process.platform === 'darwin') {
    note('register')
    const uid = typeof process.getuid === 'function' ? process.getuid() : ''
    const target = uid !== '' ? `gui/${uid}/com.mino.scout` : 'com.mino.scout'
    const plist = writeScoutLaunchdPlist() || scoutLaunchdPlist()
    let method = 'launchctl'
    note('launch')
    try { await execFileAsync('launchctl', ['bootout', target], { timeout: 8000 }) } catch { /* not loaded */ }
    try { await execFileAsync('launchctl', ['load', '-w', plist], { timeout: 8000 }) } catch { /* already loaded */ }
    try {
      await execFileAsync('launchctl', ['bootstrap', `gui/${uid}`, plist], { timeout: 8000 })
      method = 'launchctl-bootstrap'
    } catch { /* macOS often returns I/O error if already registered */ }
    try {
      await execFileAsync('launchctl', ['kickstart', '-k', target], { timeout: 8000 })
      method = 'launchctl'
    } catch { /* RunAtLoad may already have started it */ }
    note('wait')
    let live = await waitUntilScoutRunning({ timeoutMs: 12000 })
    if (!live.running) {
      spawnScoutDetached(bin)
      method = 'detached'
      live = await waitUntilScoutRunning({ timeoutMs: 8000 })
    }
    if (live.running) return { ok: true, method, pid: live.pid || null }
    return { ok: false, error: startFailureHint() }
  }
  note('launch')
  if (process.platform === 'win32') {
    try {
      await execFileAsync('schtasks', ['/Run', '/TN', 'Mino Scout'], { timeout: 8000, windowsHide: true })
    } catch {
      spawnScoutDetached(bin)
    }
    note('wait')
    const live = await waitUntilScoutRunning({ timeoutMs: 12000 })
    if (live.running) return { ok: true, method: 'schtasks', pid: live.pid || null }
    return { ok: false, error: startFailureHint() }
  }
  try {
    await execFileAsync('systemctl', ['--user', 'start', 'mino-scout.service'], { timeout: 8000 })
  } catch {
    spawnScoutDetached(bin)
  }
  note('wait')
  const live = await waitUntilScoutRunning({ timeoutMs: 12000 })
  if (live.running) return { ok: true, method: 'systemd', pid: live.pid || null }
  return { ok: false, error: startFailureHint() }
}

const runStartJob = async () => {
  emitStartProgress({
    active: true,
    stage: 'register',
    label: START_STAGES.register,
    error: '',
    pid: null,
  })
  try {
    const result = await startScoutService({
      onStage: (stage) => emitStartProgress({
        active: true,
        stage,
        label: START_STAGES[stage] || stage,
        error: '',
      }),
    })
    if (!result?.ok) throw new Error(result?.error || '启动失败')
    emitStartProgress({
      active: false,
      stage: 'done',
      label: '已启动',
      error: '',
      pid: result.pid || null,
    })
    return result
  } catch (e) {
    const error = e.message || String(e)
    emitStartProgress({
      active: false,
      stage: 'error',
      label: '',
      error,
      pid: null,
    })
    return { ok: false, error }
  }
}

const fetchJsonUrl = (url) => new Promise((resolve, reject) => {
  const go = (u, hops = 0) => {
    if (hops > 8) {
      reject(new Error('too many redirects'))
      return
    }
    const lib = u.startsWith('https:') ? https : http
    const req = lib.get(u, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MinoStudio',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        go(new URL(res.headers.location, u).href, hops + 1)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(20000, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
  }
  go(url)
})

const findInstallRoot = (dest) => {
  const names = fs.readdirSync(dest).filter((n) => n !== '__MACOSX')
  if (names.includes('install.sh') || names.includes('install.ps1') || names.includes('pyproject.toml')) {
    return dest
  }
  if (names.length === 1) {
    const inner = path.join(dest, names[0])
    if (fs.existsSync(inner) && fs.statSync(inner).isDirectory()) return inner
  }
  return dest
}

const unzipScoutArchive = async (zipPath, dest) => {
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  if (process.platform === 'darwin') {
    await execFileAsync('ditto', ['-x', '-k', zipPath, dest])
    return
  }
  if (process.platform === 'win32') {
    const q = (s) => String(s).replace(/'/g, "''")
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${q(zipPath)}' -DestinationPath '${q(dest)}' -Force`,
    ])
    return
  }
  await execFileAsync('unzip', ['-o', zipPath, '-d', dest])
}

const runScoutInstallHelper = async (root) => {
  if (process.platform === 'win32') {
    const ps1 = path.join(root, 'install.ps1')
    if (!fs.existsSync(ps1)) return { ran: false }
    await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
      cwd: root,
      timeout: 15 * 60 * 1000,
      windowsHide: true,
    })
    return { ran: true }
  }
  const sh = path.join(root, 'install.sh')
  if (!fs.existsSync(sh)) return { ran: false }
  await execFileAsync('/bin/bash', [sh], { cwd: root, timeout: 15 * 60 * 1000 })
  return { ran: true }
}

const downloadToFile = (url, dest, onProgress) => new Promise((resolve, reject) => {
  const go = (u, hops = 0) => {
    if (hops > 8) {
      reject(new Error('too many redirects'))
      return
    }
    const lib = u.startsWith('https:') ? https : http
    const req = lib.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        go(new URL(res.headers.location, u).href, hops + 1)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const total = Number(res.headers['content-length'] || 0)
      let received = 0
      const hash = crypto.createHash('sha256')
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      const out = fs.createWriteStream(dest)
      res.on('data', (chunk) => {
        received += chunk.length
        hash.update(chunk)
        if (typeof onProgress !== 'function') return
        if (total) {
          onProgress({ received, total, percent: Math.round((received / total) * 100) })
          return
        }
        onProgress({
          received,
          total: 0,
          percent: Math.min(95, 8 + Math.round(received / (2 * 1024 * 1024))),
        })
      })
      res.pipe(out)
      out.on('finish', () => {
        out.close(() => resolve({ sha256: hash.digest('hex'), bytes: received }))
      })
      out.on('error', reject)
    })
    req.on('error', reject)
  }
  go(url)
})

ipcMain.handle('scout-installed-version', async () => {
  const config = readScoutConfig()
  const appInstalled = scoutBinaryInstalled()
  const live = await scoutIsRunning()
  return {
    installed: appInstalled,
    appInstalled,
    running: !!live.running,
    pid: live.pid || null,
    configPath: scoutConfigPath(),
    version: appInstalled ? (config?.version || null) : null,
    nexusUrl: config?.nexus_url || null,
    scoutId: appInstalled ? (config?.scout_id || null) : null,
    studioId: loadStudioId(),
    hasToken: Boolean(config?.token),
    tokenMasked: maskSecret(config?.token),
    setup: snapshotSetupJob(),
  }
})

ipcMain.handle('scout-restart', async () => {
  try {
    const live = await scoutIsRunning()
    if (live.running) {
      const stopped = await stopScoutService()
      if (!stopped?.ok && !stopped?.already) return stopped
    }
    return await startScoutService()
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

ipcMain.handle('scout-start', async () => {
  try {
    if (scoutSetupJob.active) {
      return { ok: false, error: '正在安装 Scout，请稍后再启动' }
    }
    if (scoutStartJob.active) {
      return { ok: true, accepted: true, start: snapshotStartJob() }
    }
    const live = await scoutIsRunning()
    if (live.running) return { ok: true, already: true, pid: live.pid || null }
    emitStartProgress({
      active: true,
      stage: 'register',
      label: START_STAGES.register,
      error: '',
      pid: null,
    })
    runStartJob().catch((e) => {
      emitStartProgress({
        active: false,
        stage: 'error',
        label: '',
        error: e.message || String(e),
        pid: null,
      })
    })
    return { ok: true, accepted: true, start: snapshotStartJob() }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

ipcMain.handle('scout-start-status', async () => snapshotStartJob())

const killScoutByPgrep = async () => {
  if (process.platform === 'win32') return { ok: false }
  try {
    const { stdout } = await execFileAsync('pgrep', ['-f', 'mino-scout'], { timeout: 4000 })
    const pids = String(stdout || '').split(/\s+/).map((x) => Number(x)).filter((n) => n > 0)
    if (!pids.length) return { ok: false }
    for (const pid of pids) {
      try { process.kill(pid, 'SIGTERM') } catch { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 600))
    let alive = false
    for (const pid of pids) {
      try {
        process.kill(pid, 0)
        process.kill(pid, 'SIGKILL')
        alive = true
      } catch { /* gone */ }
    }
    return { ok: !alive, method: 'pgrep-kill', pids }
  } catch {
    return { ok: false }
  }
}

const stopScoutService = async () => {
  const bin = scoutBin()
  if (bin) {
    try {
      await execFileAsync(bin, ['stop'], { timeout: 20000, windowsHide: true })
      return { ok: true, method: 'cli-stop' }
    } catch { /* fall through */ }
  }
  // Dev / PATH installs (venv `mino-scout`) — not only frozen Application Support bin.
  try {
    await execFileAsync('mino-scout', ['stop'], { timeout: 20000, windowsHide: true, shell: process.platform === 'win32' })
    return { ok: true, method: 'path-cli-stop' }
  } catch { /* fall through */ }
  if (process.platform === 'darwin') {
    const uid = typeof process.getuid === 'function' ? process.getuid() : ''
    const target = uid !== '' ? `gui/${uid}/com.mino.scout` : 'com.mino.scout'
    try {
      await execFileAsync('launchctl', ['kill', 'SIGTERM', target], { timeout: 8000 })
      return { ok: true, method: 'launchctl-kill' }
    } catch { /* try pgrep below */ }
  } else if (process.platform === 'win32') {
    try {
      await execFileAsync('schtasks', ['/End', '/TN', 'Mino Scout'], { timeout: 8000, windowsHide: true })
      return { ok: true, method: 'schtasks' }
    } catch { /* fall through */ }
  } else {
    try {
      await execFileAsync('systemctl', ['--user', 'stop', 'mino-scout.service'], { timeout: 8000 })
      return { ok: true, method: 'systemd' }
    } catch { /* fall through */ }
  }
  const killed = await killScoutByPgrep()
  if (killed.ok) return killed
  return { ok: false, error: '本机没有在跑的执行器。' }
}

ipcMain.handle('scout-stop', async () => {
  try {
    const live = await scoutIsRunning()
    if (!live.running) return { ok: true, already: true }
    return await stopScoutService()
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

const persistScoutConfig = (payload = {}) => {
  fs.mkdirSync(scoutConfigDir(), { recursive: true })
  const prev = readScoutConfig() || {}
  const next = {
    ...prev,
    nexus_url: String(payload.nexus_url || prev.nexus_url || NEXUS_URL).replace(/\/$/, ''),
    token: payload.token || prev.token || '',
    version: payload.version || prev.version || '',
    studio_id: loadStudioId(),
    updated_at: new Date().toISOString(),
  }
  fs.writeFileSync(scoutConfigPath(), `${JSON.stringify(next, null, 2)}\n`)
  return { ok: true, path: scoutConfigPath() }
}

const rmIfExists = (target) => {
  try { fs.rmSync(target, { recursive: true, force: true }) } catch { /* ignore */ }
}

const unloadScoutService = async () => {
  try { await stopScoutService() } catch { /* not running */ }
  if (process.platform === 'darwin') {
    const uid = typeof process.getuid === 'function' ? process.getuid() : ''
    const target = uid !== '' ? `gui/${uid}/com.mino.scout` : 'com.mino.scout'
    try { await execFileAsync('launchctl', ['bootout', target], { timeout: 8000 }) } catch { /* unloaded */ }
    rmIfExists(scoutLaunchdPlist())
    return
  }
  if (process.platform === 'win32') {
    try {
      await execFileAsync('schtasks', ['/Delete', '/TN', 'Mino Scout', '/F'], { timeout: 8000, windowsHide: true })
    } catch { /* no task */ }
    return
  }
  try {
    await execFileAsync('systemctl', ['--user', 'disable', '--now', 'mino-scout.service'], { timeout: 8000 })
  } catch { /* no unit */ }
}

const runScoutSetup = async (payload = {}) => {
  if (scoutSetupJob.active) {
    return { ok: false, error: '安装正在进行', setup: snapshotSetupJob() }
  }
  if (scoutStartJob.active) {
    return { ok: false, error: '正在启动 Scout，请稍后再安装' }
  }
  const plan = planScoutUpdateHere(payload)
  if (plan.mode !== 'up-to-date') {
    for (const step of plan.steps) {
      if (!/^https?:\/\//i.test(step.url)) {
        return { ok: false, error: '没有可用的安装包' }
      }
    }
  }

  emitSetupProgress({
    active: true,
    stage: 'download',
    label: SETUP_STAGES.download.label,
    percent: 0,
    error: '',
  })

  try {
    const downloadDir = path.join(app.getPath('userData'), 'scout-downloads')
    const unpackRoot = path.join(scoutConfigDir(), 'package')
    const multi = plan.steps.length > 1
    const totalBytes = plan.steps.reduce((n, s) => n + (s.bytes || 0), 0)
    const staged = []
    let doneBytes = 0
    let lastDest = ''
    let lastRoot = ''

    for (const step of plan.steps) {
      const tag = step.layer ? `${SETUP_STAGES.download.label}（${step.layer} 层）` : SETUP_STAGES.download.label
      const filename = String(step.filename || 'scout-installer').replace(/[^A-Za-z0-9._-]/g, '_')
      const dest = path.join(downloadDir, filename)
      const downloaded = await downloadToFile(step.url, dest, (p) => {
        // 多层时按字节加权，进度条才不会每层从 0 重来。
        const percent = totalBytes
          ? Math.round(((doneBytes + (p.received || 0)) / totalBytes) * 100)
          : p.percent
        emitSetupProgress({
          stage: 'download',
          label: tag,
          percent: mapStagePercent('download', Math.min(100, percent)),
        })
      })
      const expected = String(step.sha256 || '').trim().toLowerCase()
      if (expected && downloaded.sha256 !== expected) {
        rmIfExists(dest)
        throw new Error(`sha256 mismatch: got ${downloaded.sha256}`)
      }
      doneBytes += downloaded.bytes || step.bytes || 0

      emitSetupProgress({
        stage: 'unzip',
        label: SETUP_STAGES.unzip.label,
        percent: mapStagePercent('unzip', 8),
      })
      // unzipScoutArchive 会先清空目标目录，所以多层必须各自解到子目录里，
      // 否则后一层会把前一层刚解出来的东西抹掉。
      const unpackDest = multi ? path.join(unpackRoot, step.layer || 'combined') : unpackRoot
      await unzipScoutArchive(dest, unpackDest)
      const root = findInstallRoot(unpackDest)
      await prepareScoutPayload(root)
      staged.push({ step, root })
      lastDest = dest
      lastRoot = root
    }

    emitSetupProgress({
      stage: 'unzip',
      label: SETUP_STAGES.unzip.label,
      percent: mapStagePercent('unzip', 55),
    })

    emitSetupProgress({
      stage: 'config',
      label: SETUP_STAGES.config.label,
      percent: mapStagePercent('config', 20),
    })
    persistScoutConfig({
      nexus_url: payload.nexus_url || NEXUS_URL,
      token: payload.token || '',
      version: payload.version || '',
    })
    emitSetupProgress({
      stage: 'config',
      label: SETUP_STAGES.config.label,
      percent: mapStagePercent('config', 100),
    })

    emitSetupProgress({
      stage: 'unzip',
      label: SETUP_STAGES.unzip.label,
      percent: mapStagePercent('unzip', 70),
    })
    // 顺序就是 planScoutUpdate 给的 runtime → app → browser。app 层的 requires_runtime
    // 闸门要求 runtime 先落地，颠倒过来安装脚本会拒绝并退出非 0。
    for (const { root } of staged) {
      await runScoutInstallHelper(root)
    }
    await prepareScoutPayload(path.join(scoutConfigDir(), 'bin'))
    emitSetupProgress({
      stage: 'unzip',
      label: SETUP_STAGES.unzip.label,
      percent: mapStagePercent('unzip', 100),
    })

    emitSetupProgress({
      stage: 'start',
      label: SETUP_STAGES.start.label,
      percent: mapStagePercent('start', 25),
    })
    const started = await startScoutService()
    if (!started?.ok) {
      throw new Error(started?.error || '启动失败')
    }
    emitSetupProgress({
      stage: 'start',
      label: SETUP_STAGES.start.label,
      percent: mapStagePercent('start', 100),
    })
    emitSetupProgress({
      active: false,
      stage: 'done',
      label: '已启动',
      percent: 100,
      error: '',
    })
    return {
      ok: true,
      launched: true,
      path: lastDest,
      unpacked: lastRoot,
      pid: started.pid || null,
      mode: plan.mode,
      layers: plan.steps.map((s) => s.layer).filter(Boolean),
      bytes: plan.bytes,
    }
  } catch (e) {
    emitSetupProgress({
      active: false,
      error: e.message || String(e),
    })
    return { ok: false, error: e.message || String(e), setup: snapshotSetupJob() }
  }
}

ipcMain.handle('scout-write-config', async (_event, payload = {}) => {
  try {
    return persistScoutConfig(payload)
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('scout-setup-status', async () => snapshotSetupJob())

ipcMain.handle('scout-setup', async (_event, payload = {}) => runScoutSetup(payload))

/* 让界面在用户点之前就能说清"这次要下多少" —— 90 KB 还是 439 MB 是完全不同的决定。
   主进程在真装的时候会重新算一遍 planScoutUpdate，不信渲染层传来的结论。 */
ipcMain.handle('scout-installed-layers', async () => readInstalledScoutLayers())

ipcMain.handle('scout-plan-update', async (_event, payload = {}) => planScoutUpdateHere(payload))

ipcMain.handle('scout-uninstall', async () => {
  if (scoutSetupJob.active) {
    return { ok: false, error: '安装正在进行，请稍后再卸载' }
  }
  if (scoutStartJob.active) {
    return { ok: false, error: '正在启动 Scout，请稍后再卸载' }
  }
  try {
    const live = await scoutIsRunning()
    if (live.running) {
      return { ok: false, error: '请先停止 Scout，再卸载' }
    }
    await unloadScoutService()
    const home = scoutConfigDir()
    rmIfExists(path.join(home, 'package'))
    rmIfExists(path.join(home, 'bin'))
    rmIfExists(path.join(home, 'venv'))
    rmIfExists(scoutConfigPath())
    rmIfExists(path.join(app.getPath('userData'), 'scout-downloads'))
    emitSetupProgress({
      active: false,
      stage: '',
      label: '',
      percent: 0,
      error: '',
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

ipcMain.handle('scout-download', async (event, payload = {}) => {
  const url = String(payload.url || '').trim()
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'invalid_url' }
  const filename = String(payload.filename || 'scout-installer').replace(/[^A-Za-z0-9._-]/g, '_')
  const dest = path.join(app.getPath('userData'), 'scout-downloads', filename)
  try {
    const result = await downloadToFile(url, dest, (p) => {
      event.sender.send('scout-download-progress', p)
    })
    const expected = String(payload.sha256 || '').trim().toLowerCase()
    if (expected && result.sha256 !== expected) {
      try { fs.unlinkSync(dest) } catch (_) { /* ignore */ }
      return { ok: false, error: `sha256 mismatch: got ${result.sha256}` }
    }
    return { ok: true, path: dest, sha256: result.sha256, bytes: result.bytes }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('scout-fetch-json', async (_event, url) => {
  const target = String(url || '').trim()
  if (!/^https?:\/\//i.test(target)) return { ok: false, error: 'invalid_url' }
  try {
    const data = await fetchJsonUrl(target)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('scout-install', async (_event, payload = {}) => {
  const filePath = String(payload.filePath || '').trim()
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'installer_missing' }
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.zip') {
    const dest = path.join(scoutConfigDir(), 'package')
    try {
      await unzipScoutArchive(filePath, dest)
      const root = findInstallRoot(dest)
      try {
        const helper = await runScoutInstallHelper(root)
        if (helper.ran) return { ok: true, method: 'zip', unpacked: root, launched: true }
      } catch (e) {
        shell.showItemInFolder(root)
        return { ok: false, method: 'zip', unpacked: root, error: e.message || String(e) }
      }
      shell.showItemInFolder(root)
      return { ok: true, method: 'zip', unpacked: root, launched: false }
    } catch (e) {
      return { ok: false, method: 'zip', error: e.message || String(e) }
    }
  }
  const err = await shell.openPath(filePath)
  return { ok: !err, method: 'open', error: err || null }
})

ipcMain.on('start-download', () => { autoUpdater.downloadUpdate() })
ipcMain.on('quit-and-install', () => { autoUpdater.quitAndInstall() })
ipcMain.on('renderer-ws-connected', () => {})
ipcMain.on('window-min', () => mainWindow?.minimize())
ipcMain.on('window-max', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window-close', () => {
  if (tray && !isQuitting) mainWindow?.hide()
  else mainWindow?.close()
})

app.whenReady().then(() => {
  createWindow()
  createTray()
  initAutoUpdater()
  app.on('activate', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
})
