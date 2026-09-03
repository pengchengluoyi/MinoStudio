import { ElMessage } from 'element-plus'
import { getWsUrl } from '@/utils/config'

// 🔥 辅助函数：探测 URL 可用性
const checkUrl = async (url) => {
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 3000)
    let httpUrl = url.replace('ws://', 'http://').replace('wss://', 'https://')
    httpUrl = httpUrl.includes('/ws') ? httpUrl.replace('/ws', '/docs') : (httpUrl.endsWith('/') ? `${httpUrl}docs` : `${httpUrl}/docs`)
    await fetch(httpUrl, { method: 'GET', mode: 'no-cors', signal: controller.signal })
    clearTimeout(id)
    return true
  } catch {
    return false
  }
}

class ManagementWebSocket {
  constructor() {
    this.ws = null
    this.listeners = new Map() // 事件名 -> 回调函数集合
    this.isConnected = false
    this.reconnectAttempts = 0
    this.reconnectInterval = 5000 // 5秒重连
    this.messageQueue = []
    this.manualUrl = null // 🔥 手动设置的 URL
    this.useRemoteHost = false // 🔥 缓存是否需要使用 miniorange.local
    this.reconnectTimer = null // 🔥 重连定时器引用
  }

  // 🔥 允许外部设置 URL (例如 App.vue 探测完成后)
  setUrl(url) {
    this.manualUrl = url
  }

  async connect() {
    // 🔥 如果有正在等待的重连定时器，立即清除，允许本次强制连接
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    let url = this.manualUrl || getWsUrl()

    // 🔥 自动附加 Token (如果存在且 URL 中尚未包含)
    const token = localStorage.getItem('ws_token')
    if (token && !url.includes('token=')) {
      const separator = url.includes('?') ? '&' : '?'
      url = `${url}${separator}token=${token}`
    }

    console.log('[Mgmt-WS] Connecting to:', url)
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('[Mgmt-WS] Connected to server.')
      this.isConnected = true
      this.reconnectAttempts = 0
      // 连接成功后，发送队列中的消息并请求初始数据
      this.messageQueue.forEach(msg => this.ws.send(JSON.stringify(msg)))
      this.messageQueue = []
      this.sendMessage('get_device_list')
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        // 🔥 适配服务端返回格式：action 作为事件类型
        const eventType = message.action
        if (this.listeners.has(eventType)) {
          this.listeners.get(eventType).forEach(callback => callback(message.data || message, message.msg))
        }
      } catch (e) {
        console.error('[Mgmt-WS] Error parsing message:', e)
      }
    }

    this.ws.onclose = () => {
      this.isConnected = false
      this.ws = null
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++
        this.connect()
      }, this.reconnectInterval)
    }

    this.ws.onerror = (error) => {
      console.error('[Mgmt-WS] WebSocket error:', error)
    }
  }

  sendMessage(action, data = {}) {
    const payload = { action, data }
    if (!this.isConnected || !this.ws) {
      this.messageQueue.push(payload)
      return
    }
    this.ws.send(JSON.stringify(payload))
  }

  addListener(eventType, callback) {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, new Set())
    this.listeners.get(eventType).add(callback)
  }

  removeListener(eventType, callback) {
    if (this.listeners.has(eventType)) this.listeners.get(eventType).delete(callback)
  }
}

const managementWsService = new ManagementWebSocket()
export default managementWsService