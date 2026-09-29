import {
  normalizeEnvDoc,
  pipelineKeys,
  resolveChannelValue,
} from '@/constants/envProfiles'

const ARCH_SURFACE_STORAGE_PREFIX = 'mo_arch_env_surface_'

export function archSurfaceStorageKey(projectId) {
  const pid = String(projectId || '').trim()
  return pid ? `${ARCH_SURFACE_STORAGE_PREFIX}${pid}` : ''
}

export function getStoredArchEnvSurface(projectId) {
  const key = archSurfaceStorageKey(projectId)
  if (!key) return ''
  return String(localStorage.getItem(key) || '').trim()
}

export function setStoredArchEnvSurface(projectId, surfaceId) {
  const key = archSurfaceStorageKey(projectId)
  if (!key) return
  const id = String(surfaceId || '').trim()
  if (id) localStorage.setItem(key, id)
  else localStorage.removeItem(key)
}

function normPlatform(platform) {
  const p = String(platform || '').toLowerCase()
  if (p === 'web' || p === 'browser' || p === 'playwright') return 'web'
  if (p === 'ios' || p === 'iphone' || p === 'ipad') return 'ios'
  return p || 'android'
}

/** 与跑批 env 解析对齐：URL 去尾斜杠、小写；包名原样 trim。 */
export function normalizeAtlasTarget(value, platform) {
  let v = String(value || '').trim()
  if (!v) return ''
  const plat = normPlatform(platform)
  if (plat === 'web' || v.startsWith('http://') || v.startsWith('https://')) {
    try {
      const u = new URL(v.includes('://') ? v : `https://${v}`)
      const path = (u.pathname || '/').replace(/\/+$/, '') || ''
      return `${u.hostname}${path}`.toLowerCase()
    } catch {
      return v.replace(/\/+$/, '').toLowerCase()
    }
  }
  return v
}

export function channelTargetForEnv(envDoc, envKey, ch) {
  if (!ch?.id) return ''
  const normalized = normalizeEnvDoc(envDoc)
  const order = pipelineKeys(normalized)
  const key = String(envKey || normalized.default_profile || 'test').trim()
  const field = ch.field || 'value'
  const resolved = resolveChannelValue(normalized.profiles, order, key, ch.id, field)
  return String(resolved?.value || '').trim()
}

export function turnMatchesChannel(ref, channel, envDoc, envKey) {
  if (!channel?.id) return true
  const want = String(channel.id || '').trim()
  const surf = String(ref?.env_surface || '').trim()
  if (surf) return surf === want
  const plat = normPlatform(ref?.platform)
  const chPlat = normPlatform(channel.platform || channel.kind)
  const configured = channelTargetForEnv(envDoc, envKey, channel)
  const tgt = normalizeAtlasTarget(ref?.target_package, plat)
  if (configured) {
    const cfg = normalizeAtlasTarget(configured, chPlat)
    if (tgt && cfg && (tgt === cfg || tgt.endsWith(cfg) || cfg.endsWith(tgt))) return true
    return false
  }
  if (chPlat && plat) return plat === chPlat
  return true
}

function edgeEndpoints(edge) {
  const from = String(edge?.from || edge?.from_state || '').trim()
  const to = String(edge?.to || edge?.to_state || '').trim()
  return { from, to }
}

/**
 * 按项目 env channel（env_surface）裁剪屏面图谱；未选 channel 时返回原文档。
 */
export function filterAtlasDocByChannel(doc, channelId, envDoc, envKey) {
  if (!doc || typeof doc !== 'object') return doc
  const surface = String(channelId || '').trim()
  if (!surface) return doc

  const normalized = normalizeEnvDoc(envDoc)
  const channel = (normalized.channels || []).find((c) => String(c?.id || '') === surface)
  if (!channel) return doc

  const refs = Array.isArray(doc.meta?.atlas_turn_refs) ? doc.meta.atlas_turn_refs : []
  const hasSurfaceMeta = refs.some((r) => String(r?.env_surface || '').trim())
  const hasTargetMeta = refs.some((r) => String(r?.target_package || '').trim())
  if (!hasSurfaceMeta && !hasTargetMeta) {
    return doc
  }

  const matchingRefs = refs.filter((r) => turnMatchesChannel(r, channel, normalized, envKey))
  const stateIds = new Set(
    matchingRefs.map((r) => String(r?.state_id || '').trim()).filter(Boolean),
  )
  if (!stateIds.size) {
    return {
      ...doc,
      states: [],
      edges: [],
      meta: {
        ...(doc.meta || {}),
        atlas_turn_refs: [],
        arch_channel_filter: surface,
      },
    }
  }

  const states = (doc.states || []).filter((s) => stateIds.has(String(s?.id || '').trim()))
  const edges = (doc.edges || []).filter((e) => {
    const { from, to } = edgeEndpoints(e)
    return stateIds.has(from) && stateIds.has(to)
  })

  return {
    ...doc,
    states,
    edges,
    meta: {
      ...(doc.meta || {}),
      atlas_turn_refs: matchingRefs,
      arch_channel_filter: surface,
    },
  }
}

/** 架构图编辑后把可见子集合并回完整图谱（保留其它 channel 的屏面与边）。 */
export function mergeArchGraphSubset(fullDoc, subsetDoc) {
  if (!fullDoc || !subsetDoc) return subsetDoc || fullDoc
  const filterId = String(subsetDoc?.meta?.arch_channel_filter || '').trim()
  if (!filterId) return subsetDoc

  const visible = new Set((subsetDoc.states || []).map((s) => String(s?.id || '').trim()).filter(Boolean))
  const stateById = new Map((fullDoc.states || []).map((s) => [String(s.id), s]))
  for (const st of subsetDoc.states || []) {
    const id = String(st?.id || '').trim()
    if (id) stateById.set(id, st)
  }
  const states = [...stateById.values()]

  const edgeKey = (e) => {
    const { from, to } = edgeEndpoints(e)
    return `${from}→${to}::${String(e?.id || e?.kind || '')}`
  }
  const keptEdges = (fullDoc.edges || []).filter((e) => {
    const { from, to } = edgeEndpoints(e)
    const touchesVisible = visible.has(from) || visible.has(to)
    if (!touchesVisible) return true
    if (visible.has(from) && visible.has(to)) return false
    return true
  })
  const edgeMap = new Map(keptEdges.map((e) => [edgeKey(e), e]))
  for (const e of subsetDoc.edges || []) {
    edgeMap.set(edgeKey(e), e)
  }
  const edges = [...edgeMap.values()]

  return {
    ...fullDoc,
    states,
    edges,
    meta: {
      ...(fullDoc.meta || {}),
      ...(subsetDoc.meta || {}),
      arch_channel_filter: '',
    },
  }
}
