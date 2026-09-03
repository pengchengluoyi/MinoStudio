import { computed, onMounted, ref } from 'vue'

function detectElectron() {
  if (typeof window === 'undefined') return false
  if (window.electronAPI) return true
  // Preload may lag; Electron still paints traffic lights / frameless chrome.
  return /Electron/i.test(navigator.userAgent || '')
}

function detectMac() {
  if (typeof navigator === 'undefined') return false
  const plat = navigator.platform || ''
  const ua = navigator.userAgent || ''
  return /Mac|iPod|iPhone|iPad/.test(plat) || /Mac OS X/i.test(ua)
}

const isElectron = ref(detectElectron())
const isMac = ref(detectMac())

const detect = () => {
  isElectron.value = detectElectron()
  isMac.value = detectMac()
}

if (typeof window !== 'undefined') detect()

export function useAppChrome() {
  onMounted(detect)
  return {
    isElectron,
    isMac,
    showMacTraffic: computed(() => isElectron.value && isMac.value),
    showWinControls: computed(() => isElectron.value && !isMac.value),
    handleMinimize: () => window.electronAPI?.minimize(),
    handleMaximize: () => window.electronAPI?.maximize(),
    handleClose: () => window.electronAPI?.close(),
  }
}
