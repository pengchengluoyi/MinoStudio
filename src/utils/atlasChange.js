/** 图谱变更：给需求评审页看「改了什么」，不在用例模块里确认。 */

import { alignAtlasDiff, diffBuckets, flattenAtlas } from '@/utils/appAtlas'
import { jobLabel, roleLabel } from '@/utils/dispatchLog'

const JOB_FALLBACK = {
  propose_atlas: '建议应用图谱',
  analyze_req: '分析需求',
  draft_mindmap: '写脑图',
  draft_cases: '写用例',
  qa_tick: '流程推进',
}

export const patchStatusLabel = (status) => ({
  pending: '待确认',
  accepted: '已确认',
  rejected: '已驳回',
}[status] || status || '待确认')

export const patchStatusType = (status) => ({
  pending: 'warning',
  accepted: 'success',
  rejected: 'info',
}[status] || '')

export const opLabel = (op) => ({ add: '新增', remove: '删除', update: '改名', hang: '挂上需求' }[op] || op)
export const nodeKindLabel = (kind) => (kind === 'feature' ? '功能' : '模块')

export function afterOf(patch, edited) {
  return edited || patch?.after
}

export function patchBuckets(patch, edited) {
  return diffBuckets(alignAtlasDiff(patch?.before, afterOf(patch, edited)))
}

export function patchKind(patch, edited) {
  const beforeEmpty = !flattenAtlas(patch?.before).length
  const { add, remove, update, hang, structural } = patchBuckets(patch, edited)
  if (beforeEmpty && add.length) return 'create'
  if (structural) return 'structure'
  if (hang.length) return 'hang'
  if ((patch?.case_changes || []).length) return 'cases'
  return 'empty'
}

export function changeJobLabel(patch) {
  const role = roleLabel(patch?.role || 'req-analyst')
  const job = jobLabel(patch?.job) || JOB_FALLBACK[patch?.job] || patch?.job || '建议应用图谱'
  return `流程推进 · ${role} · ${job}`
}

export function changeReqTitle(patch, requirements = []) {
  const rid = String(patch?.source?.req_id || '')
  if (!rid) return ''
  const req = requirements.find((r) => r.id === rid)
  return req?.title || req?.name || rid
}

export function changeTitle(patch, edited) {
  const { add, remove, update, hang, structural } = patchBuckets(patch, edited)
  const c = (patch?.case_changes || []).length
  if (patchKind(patch, edited) === 'create') return `建议新建图谱 · ${add.length} 个节点`
  if (structural) {
    const bits = []
    if (add.length) bits.push(`新增 ${add.length}`)
    if (remove.length) bits.push(`删除 ${remove.length}`)
    if (update.length) bits.push(`改名 ${update.length}`)
    return bits.join(' · ')
  }
  if (hang.length) return `把需求挂到 ${hang.length} 个现有节点`
  if (c) return `${c} 条旧用例可能过时`
  return '没有实质改动'
}

export function changeHint(patch, edited) {
  const kind = patchKind(patch, edited)
  if (kind === 'create') return '当前还没有已确认的图谱。确认后会写入这些节点，并重跑脑图和用例。'
  if (kind === 'structure') return '只列出有增删改的节点。确认后写入图谱并重跑脑图 → 用例。'
  if (kind === 'hang') return '模块树没有增删，所以没有前后对照。确认后只是把本需求挂到这些已有节点上。'
  if (kind === 'cases') return '骨架没变，只是提醒这些旧用例可能要人工看一眼。'
  return '这条记录没有模块或用例上的实质变化，可以直接驳回。'
}

export function hungReqTitles(row, requirements = []) {
  const old = new Set(row.left?.reqIds || [])
  const ids = (row.right?.reqIds || []).filter((id) => !old.has(id))
  return ids.map((id) => {
    const req = requirements.find((r) => r.id === id)
    return req?.title || req?.name || id
  }).filter(Boolean)
}

export function changeLines(patch, { edited, requirements = [] } = {}) {
  const { add, remove, update, hang } = patchBuckets(patch, edited)
  return [
    ...add.map((r) => ({ op: 'add', kind: r.kind, path: r.path, extra: '' })),
    ...remove.map((r) => ({ op: 'remove', kind: r.kind, path: r.path, extra: '' })),
    ...update.map((r) => ({ op: 'update', kind: r.kind, path: r.path, extra: `${r.left?.name || ''} → ${r.right?.name || ''}` })),
    ...hang.map((r) => ({ op: 'hang', kind: r.kind, path: r.path, extra: hungReqTitles(r, requirements).join('、') })),
  ]
}

export function flattenPatchAfter(patch, edited) {
  return flattenAtlas(afterOf(patch, edited))
}
