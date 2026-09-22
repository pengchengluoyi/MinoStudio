const { contextBridge, ipcRenderer } = require('electron')
const path = require('node:path')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

/** IPC 走 structured clone；Vue reactive Proxy 不能克隆，会报 "An object could not be cloned"。 */
const ipcPayload = (value) => {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value))
}

const fallbackHost = {
  os: process.platform,
  arch: process.platform === 'darwin' ? 'arm64' : 'x64',
}
let hostPlatform = fallbackHost
try {
  const sync = ipcRenderer.sendSync('host-platform')
  if (sync?.os) {
    hostPlatform = {
      os: sync.os,
      arch: sync.os === 'darwin' ? 'arm64' : 'x64',
    }
  }
} catch { /* main not ready; UA/process.arch fallback */ }

contextBridge.exposeInMainWorld('electronAPI', {
  hostPlatform,
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),

  openExternal: (url) => invoke('open-external', url),
  invoke,
  getRuntimeStatus: () => invoke('get-runtime-status'),
  selectFile: () => invoke('select-file'),

  scoutInstalledVersion: () => invoke('scout-installed-version'),
  scoutStart: () => invoke('scout-start'),
  scoutStartStatus: () => invoke('scout-start-status'),
  scoutStop: () => invoke('scout-stop'),
  scoutRestart: () => invoke('scout-restart'),
  scoutDownload: (payload) => invoke('scout-download', ipcPayload(payload)),
  scoutInstall: (payload) => invoke('scout-install', ipcPayload(payload)),
  scoutSetup: (payload) => invoke('scout-setup', ipcPayload(payload)),
  scoutSetupStatus: () => invoke('scout-setup-status'),
  scoutInstalledLayers: () => invoke('scout-installed-layers'),
  scoutPlanUpdate: (payload) => invoke('scout-plan-update', ipcPayload(payload)),
  scoutUninstall: () => invoke('scout-uninstall'),
  scoutWriteConfig: (payload) => invoke('scout-write-config', ipcPayload(payload)),
  scoutFetchJson: (url) => invoke('scout-fetch-json', url),
  scoutOpenLogsFolder: () => invoke('scout-open-logs-folder'),
  scoutReadLogTail: (payload) => invoke('scout-read-log-tail', ipcPayload(payload)),
  onScoutSetupProgress: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('scout-setup-progress', listener)
    return () => ipcRenderer.removeListener('scout-setup-progress', listener)
  },
  onScoutStartProgress: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('scout-start-progress', listener)
    return () => ipcRenderer.removeListener('scout-start-progress', listener)
  },
  onScoutDownloadProgress: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('scout-download-progress', listener)
    return () => ipcRenderer.removeListener('scout-download-progress', listener)
  },
  removeListener: (channel, func) => ipcRenderer.removeListener(channel, func),

  getRecorderPath: () => {
    if (process.env.NODE_ENV === 'development') {
      return path.resolve(process.cwd(), 'public', 'recorder-preload.js')
    }
    return path.join(process.resourcesPath, 'recorder-preload.js')
  },

  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, value) => callback(value)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_event, value) => callback(value)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, value) => callback(value)),
  startDownload: () => ipcRenderer.send('start-download'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),

  onShowAlert: (callback) => ipcRenderer.on('show-alert', (_event, value) => callback(value)),
  on: (channel, func) => {
    ipcRenderer.on(channel, (_event, ...args) => func(...args))
  },
  send: (channel, data) => ipcRenderer.send(channel, data),
})
