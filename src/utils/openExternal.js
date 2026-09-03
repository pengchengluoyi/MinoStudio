export const openExternalUrl = async (url) => {
  const s = String(url || '').trim()
  if (!s) return
  try {
    if (window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(s)
      return
    }
    if (window.electronAPI?.invoke) {
      await window.electronAPI.invoke('open-external', s)
      return
    }
  } catch {
    // fall through to browser
  }
  window.open(s, '_blank', 'noopener')
}
