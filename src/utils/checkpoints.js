/**
 * 把内部检查点 id（cp1）解析成用户能读的描述。
 */

export function parseCheckpointCatalog(raw) {
  const out = []
  const seen = new Set()
  const push = (id, description = '', kind = '') => {
    const cid = String(id || '').trim()
    if (!cid || seen.has(cid)) return
    seen.add(cid)
    out.push({
      id: cid,
      description: String(description || '').trim(),
      kind: String(kind || '').trim(),
    })
  }
  if (Array.isArray(raw)) {
    raw.forEach((c) => {
      if (typeof c === 'string') push(c)
      else if (c && typeof c === 'object') push(c.id, c.description, c.kind)
    })
  }
  return out
}

/** 从模型输入 checkpoints_block 兜底解析，兼容旧 trace。 */
export function parseCheckpointsFromLlmInput(text) {
  const s = typeof text === 'string' ? text : (text?.checkpoints_block || '')
  const out = []
  const re = /\[.\]\s*(cp\d+)\s*(?:\(([^)]*)\))?\s*[:：]\s*(.+)/gi
  let m
  while ((m = re.exec(String(s || '')))) {
    out.push({
      id: m[1],
      kind: String(m[2] || '').trim(),
      description: String(m[3] || '').trim(),
    })
  }
  return out
}

export function mergeCheckpointCatalog(...lists) {
  const map = new Map()
  lists.flat().forEach((c) => {
    if (!c?.id) return
    const prev = map.get(c.id) || { id: c.id, description: '', kind: '' }
    map.set(c.id, {
      id: c.id,
      description: c.description || prev.description,
      kind: c.kind || prev.kind,
    })
  })
  return [...map.values()]
}

export function resolveCheckpointHits(ids, catalog = []) {
  const map = new Map((catalog || []).map((c) => [c.id, c]))
  return (ids || []).map((raw) => {
    if (raw && typeof raw === 'object') {
      const id = String(raw.id || '').trim()
      const hit = map.get(id)
      return {
        id: id || String(raw.description || ''),
        description: String(raw.description || hit?.description || '').trim(),
        kind: String(raw.kind || hit?.kind || '').trim(),
      }
    }
    const id = String(raw || '').trim()
    const hit = map.get(id)
    return {
      id,
      description: String(hit?.description || '').trim(),
      kind: String(hit?.kind || '').trim(),
    }
  }).filter((c) => c.id)
}

export function checkpointLabel(cp) {
  if (!cp) return ''
  if (typeof cp === 'string') return cp
  return String(cp.description || '').trim() || String(cp.id || '')
}

export function replaceCheckpointIds(text, catalog = []) {
  const s = String(text || '')
  if (!s) return s
  const map = new Map()
  for (const c of catalog || []) {
    if (c?.id && c.description) map.set(c.id, c.description)
  }
  if (!map.size) return s
  return s.replace(/\b(cp\d+)\b/gi, (id) => map.get(id) || map.get(id.toLowerCase()) || id)
}
