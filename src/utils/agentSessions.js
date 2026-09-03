import { listAgentSessions, saveAgentSessions } from '@/api/auth'

const STORAGE_KEY = 'mino_agent_sessions'
let pushTimer = null

export const readAgentSessions = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.warn('read agent sessions failed', e)
    return []
  }
}

const mergeSessions = (localRows = [], remoteRows = []) => {
  const map = new Map()
  for (const row of [...remoteRows, ...localRows]) {
    if (!row?.id) continue
    const prev = map.get(row.id)
    if (!prev || new Date(row.updatedAt || 0) >= new Date(prev.updatedAt || 0)) {
      map.set(row.id, row)
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
}

export const writeAgentSessions = (sessions) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    saveAgentSessions(sessions).catch(() => { /* 未登录或离线时只留本机 */ })
  }, 400)
}

const pickRemoteSessions = (res) => {
  if (Array.isArray(res?.data?.sessions)) return res.data.sessions
  if (Array.isArray(res?.sessions)) return res.sessions
  if (Array.isArray(res?.data)) return res.data
  return []
}

export const pullAgentSessions = async () => {
  try {
    const remote = pickRemoteSessions(await listAgentSessions())
    if (!remote.length) {
      const local = readAgentSessions()
      if (local.length) await saveAgentSessions(local).catch(() => {})
      return local
    }
    const merged = mergeSessions(readAgentSessions(), remote)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    } catch (e) {
      console.warn('cache agent sessions failed', e)
    }
    return merged
  } catch (e) {
    console.warn('pull agent sessions failed', e)
    return readAgentSessions()
  }
}

export const createAgentSession = () => {
  const now = new Date().toISOString()
  return {
    id: `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: 'New Agent',
    createdAt: now,
    updatedAt: now,
    lastUserMessageAt: '',
    messages: [],
    deviceSn: '',
    planningEngine: 'local',
  }
}

export const upsertAgentSession = (session, options = {}) => {
  const sessions = readAgentSessions()
  const existing = sessions.find((item) => item.id === session.id)
  const shouldTouchUserTime = options.touchUserTime === true
  const fallbackUserTime = (() => {
    const lastUser = [...(session.messages || [])].reverse().find((item) => item.role === 'user')
    return lastUser ? (session.updatedAt || existing?.updatedAt || new Date().toISOString()) : ''
  })()
  const nextSession = {
    ...session,
    lastUserMessageAt: shouldTouchUserTime
      ? new Date().toISOString()
      : (session.lastUserMessageAt || existing?.lastUserMessageAt || fallbackUserTime),
    updatedAt: new Date().toISOString(),
  }
  const index = sessions.findIndex((item) => item.id === nextSession.id)
  if (index >= 0) {
    sessions.splice(index, 1, nextSession)
  } else {
    sessions.unshift(nextSession)
  }
  writeAgentSessions(sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)))
  return nextSession
}

export const deleteAgentSession = (id) => {
  writeAgentSessions(readAgentSessions().filter((item) => item.id !== id))
}

export const titleFromMessages = (messages) => {
  const firstUserMessage = messages.find((item) => item.role === 'user')?.content || ''
  const clean = firstUserMessage.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New Agent'
  return clean.length > 28 ? `${clean.slice(0, 28)}...` : clean
}
