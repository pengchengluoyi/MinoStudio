import { getAuthStatus } from '@/api/auth'
import { disconnectWebSocket, initWebSocket } from '@/api/mWebSocket'
import { resetKnowledgeJobSettings } from '@/utils/knowledgeJobs'

export const persistRealtimeTokens = (data = {}) => {
  if (data.token) localStorage.setItem('token', data.token)
  if (data.ws_token) localStorage.setItem('ws_token', data.ws_token)
}

export const clearRealtimeTokens = () => {
  try {
    localStorage.removeItem('token')
    localStorage.removeItem('ws_token')
  } catch (_) { /* ignore */ }
  resetKnowledgeJobSettings()
  disconnectWebSocket()
}

export const bootstrapRealtime = async () => {
  let wsToken = localStorage.getItem('ws_token') || localStorage.getItem('token') || ''
  try {
    const auth = await getAuthStatus()
    persistRealtimeTokens(auth?.data || {})
    wsToken = auth?.data?.ws_token || wsToken
  } catch (_) { /* 先按本地票据连 */ }
  initWebSocket(wsToken)
  return wsToken
}
