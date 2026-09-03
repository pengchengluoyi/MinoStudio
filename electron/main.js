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

let mainWindow = null
let tray = null
let isQuitting = false

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
  const contextMenu = Menu.buildFromTemplate([
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
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (mainWindow) mainWindow.show()
    else createWindow()
  })
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

ipcMain.handle('get-runtime-status', async () => {
  const online = await checkUrl(`${NEXUS_URL}/sys/server_info`)
  return {
    electron: {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
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

const scoutAppInstalled = () => {
  const home = scoutConfigDir()
  const localBins = [
    ...scoutBinCandidates(),
    path.join(home, 'app', 'pyproject.toml'),
  ]
  if (localBins.some((p) => fs.existsSync(p))) return true
  if (process.platform === 'darwin') {
    return [
      '/Applications/MinoScout.app',
      '/Applications/Mino Scout.app',
      path.join(app.getPath('home'), 'Library', 'LaunchAgents', 'com.mino.scout.plist'),
    ].some((p) => fs.existsSync(p))
  }
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean)
    return roots.some((root) => (
      fs.existsSync(path.join(root, 'MinoScout', 'MinoScout.exe'))
      || fs.existsSync(path.join(root, 'Programs', 'MinoScout', 'MinoScout.exe'))
    ))
  }
  return ['/usr/local/bin/minoscout', '/usr/bin/minoscout'].some((p) => fs.existsSync(p))
}

const scoutUnixBin = () => scoutBin()

const scoutWinBin = () => scoutBin()

const spawnScoutDetached = (bin) => {
  const child = spawn(bin, [], {
    cwd: scoutConfigDir(),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return { ok: true, method: 'detached', pid: child.pid }
}

const scoutLaunchdPlist = () =>
  path.join(app.getPath('home'), 'Library', 'LaunchAgents', 'com.mino.scout.plist')

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

const startScoutService = async () => {
  if (process.platform === 'darwin') {
    const uid = typeof process.getuid === 'function' ? process.getuid() : ''
    const target = uid !== '' ? `gui/${uid}/com.mino.scout` : 'com.mino.scout'
    const plist = scoutLaunchdPlist()
    try {
      await execFileAsync('launchctl', ['kickstart', '-k', target], { timeout: 8000 })
      return { ok: true, method: 'launchctl' }
    } catch {
      if (fs.existsSync(plist)) {
        try {
          await execFileAsync('launchctl', ['bootstrap', `gui/${uid}`, plist], { timeout: 8000 })
        } catch { /* already bootstrapped */ }
        try {
          await execFileAsync('launchctl', ['kickstart', '-k', target], { timeout: 8000 })
          return { ok: true, method: 'launchctl-bootstrap' }
        } catch {
          try {
            await execFileAsync('launchctl', ['load', '-w', plist], { timeout: 8000 })
            return { ok: true, method: 'launchctl-load' }
          } catch { /* fall through */ }
        }
      }
    }
    const bin = scoutUnixBin()
    if (bin) return spawnScoutDetached(bin)
    return { ok: false, error: '本机还没有执行器。请先下载安装。' }
  }
  if (process.platform === 'win32') {
    try {
      await execFileAsync('schtasks', ['/Run', '/TN', 'Mino Scout'], { timeout: 8000, windowsHide: true })
      return { ok: true, method: 'schtasks' }
    } catch {
      const bin = scoutWinBin()
      if (bin) return spawnScoutDetached(bin)
      return { ok: false, error: '本机还没有执行器。请先下载安装。' }
    }
  }
  try {
    await execFileAsync('systemctl', ['--user', 'start', 'mino-scout.service'], { timeout: 8000 })
    return { ok: true, method: 'systemd' }
  } catch {
    const bin = scoutUnixBin()
    if (bin) return spawnScoutDetached(bin)
    return { ok: false, error: '本机还没有执行器。请先下载安装。' }
  }
}

const fetchJsonUrl = (url) => new Promise((resolve, reject) => {
  const go = (u, hops = 0) => {
    if (hops > 8) {
      reject(new Error('too many redirects'))
      return
    }
    const lib = u.startsWith('https:') ? https : http
    const req = lib.get(u, { headers: { Accept: 'application/json', 'User-Agent': 'MinoStudio' } }, (res) => {
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
        if (total) onProgress({ received, total, percent: Math.round((received / total) * 100) })
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
  const appInstalled = scoutAppInstalled()
  const live = await scoutIsRunning()
  return {
    installed: appInstalled || !!config,
    appInstalled,
    running: !!live.running,
    pid: live.pid || null,
    configPath: scoutConfigPath(),
    version: config?.version || null,
    nexusUrl: config?.nexus_url || null,
    scoutId: config?.scout_id || null,
    studioId: loadStudioId(),
    hasToken: Boolean(config?.token),
    tokenMasked: maskSecret(config?.token),
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
    const live = await scoutIsRunning()
    if (live.running) return { ok: true, already: true, pid: live.pid || null }
    return await startScoutService()
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

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

ipcMain.handle('scout-write-config', async (_event, payload = {}) => {
  try {
    fs.mkdirSync(scoutConfigDir(), { recursive: true })
    const prev = readScoutConfig() || {}
    const next = {
      ...prev,
      nexus_url: String(payload.nexus_url || NEXUS_URL).replace(/\/$/, ''),
      token: payload.token || prev.token || '',
      version: payload.version || prev.version || '',
      studio_id: loadStudioId(),
      updated_at: new Date().toISOString(),
    }
    fs.writeFileSync(scoutConfigPath(), `${JSON.stringify(next, null, 2)}\n`)
    return { ok: true, path: scoutConfigPath() }
  } catch (e) {
    return { ok: false, error: e.message }
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
