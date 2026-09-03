import axios from 'axios'
import { getBaseUrl } from '@/utils/config'
import { disconnectWebSocket } from '@/api/mWebSocket'
import { resetKnowledgeJobSettings } from '@/utils/knowledgeJobs'

const CLIENT = import.meta.env.VITE_MINO_CLIENT || 'studio'

const service = axios.create({
  baseURL: getBaseUrl(),
  timeout: 60000,
})

let sessionCheck = null

const sessionStillGone = async () => {
  if (!localStorage.getItem('token')) return true
  if (sessionCheck) return sessionCheck
  sessionCheck = (async () => {
    try {
      const res = await service.get('/auth/status')
      return !res?.data?.logged_in
    } catch {
      return false
    } finally {
      sessionCheck = null
    }
  })()
  return sessionCheck
}

const kickToLogin = () => {
  try {
    localStorage.removeItem('token')
    localStorage.removeItem('ws_token')
  } catch (_) { /* ignore */ }
  resetKnowledgeJobSettings()
  import('@/utils/studioNav').then((m) => m.resetStudioNav()).catch(() => {})
  disconnectWebSocket()
  if (typeof window !== 'undefined' && !String(window.location.hash || '').includes('/login')) {
    window.location.hash = '#/login'
  }
}

service.interceptors.request.use(
  (config) => {
    config.baseURL = getBaseUrl()
    config.headers = config.headers || {}
    config.headers['X-Mino-Client'] = CLIENT
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error),
)

service.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const status = error?.response?.status
    const url = String(error?.config?.url || '')
    const skipAuth = /\/auth\/(login|register|send-code|status)/.test(url)
    if (status === 401 && !skipAuth && await sessionStillGone()) {
      kickToLogin()
    }
    return Promise.reject(error)
  },
)

export const setGlobalBaseUrl = () => {}

export default service
