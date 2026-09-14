/** 从 NavFSM state 收集 wiki_ref，生成导航图徽标 overlay。 */

function collectWikiRefs(state) {
  const refs = []
  const top = String(state?.wiki_ref || '').trim()
  if (top) refs.push(top)

  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      obj.forEach(walk)
      return
    }
    const wr = String(obj.wiki_ref || '').trim()
    if (wr) refs.push(wr)
    Object.values(obj).forEach(walk)
  }
  walk(state?.guards || {})

  const seen = new Set()
  return refs.filter((r) => {
    if (seen.has(r)) return false
    seen.add(r)
    return true
  })
}

/** @returns {Record<string, { wikiCount: number, missingWiki: boolean, docCount: number }>} */
export function buildIntelOverlay(doc, links = []) {
  const states = Array.isArray(doc?.states) ? doc.states : []
  const overlay = {}

  for (const st of states) {
    const sid = String(st?.id || st?.state_id || '').trim()
    if (!sid) continue
    const refs = collectWikiRefs(st)
    overlay[sid] = {
      wikiCount: refs.length,
      missingWiki: refs.length === 0,
      docCount: 0,
    }
  }

  for (const lk of links || []) {
    const from = String(lk?.from_ref || '')
    const to = String(lk?.to_ref || '')
    if (!from.startsWith('nav:') || !to.startsWith('doc:')) continue
    const sid = from.slice(4)
    if (!overlay[sid]) {
      overlay[sid] = { wikiCount: 0, missingWiki: true, docCount: 0 }
    }
    overlay[sid].docCount += 1
  }

  return overlay
}

export function applyIntelToNodes(nodes, overlay) {
  if (!overlay || !nodes?.length) return nodes
  return nodes.map((n) => {
    if (n.type !== 'navState') return n
    const sid = n.data?.stateId || n.id
    const intel = overlay[sid]
    if (!intel) return n
    return {
      ...n,
      data: {
        ...n.data,
        intelWikiCount: intel.wikiCount,
        intelMissingWiki: intel.missingWiki,
        intelDocCount: intel.docCount,
      },
    }
  })
}
