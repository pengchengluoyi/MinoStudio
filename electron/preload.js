const { contextBridge, ipcRenderer } = require('electron')
const path = require('node:path')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close'),

  openExternal: (url) => invoke('open-external', url),
  invoke,
  getRuntimeStatus: () => invoke('get-runtime-status'),
  selectFile: () => invoke('select-file'),

  scoutInstalledVersion: () => invoke('scout-installed-version'),
  scoutStart: () => invoke('scout-start'),
  scoutStop: () => invoke('scout-stop'),
  scoutRestart: () => invoke('scout-restart'),
  scoutDownload: (payload) => invoke('scout-download', payload),
  scoutInstall: (payload) => invoke('scout-install', payload),
  scoutWriteConfig: (payload) => invoke('scout-write-config', payload),
  scoutFetchJson: (url) => invoke('scout-fetch-json', url),
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
