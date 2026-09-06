/** Strip Vue reactive proxies before Electron IPC (structured clone rejects Proxy). */
export const ipcPayload = (value) => {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value))
}
