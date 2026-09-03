<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useQaProcess } from '@/composables/useQaProcess'
import QaScheduleBoard from '@/views/Testing/QaScheduleBoard.vue'
import QaFlowPipeline from '@/views/Testing/QaFlowPipeline.vue'
import { assistQaProcess, cancelQaProcessJob, publishQaMindmap, reviewAtlasPatch, runQaProcessTick } from '@/api/appAutomation'
import { openExternalUrl } from '@/utils/openExternal'
import AtlasChangeReview from '@/views/Testing/AtlasChangeReview.vue'
import CoverImportDialog from '@/views/Testing/CoverImportDialog.vue'
import CaseMultilineCell from '@/components/CaseMultilineCell.vue'
import CaseAlignedFieldCell from '@/components/CaseAlignedFieldCell.vue'
import CasePairedEditor from '@/components/CasePairedEditor.vue'
import WikiHistoryDialog from '@/views/Testing/WikiHistoryDialog.vue'
import { suiteCaseIds } from '@/utils/caseLibrary'
import { slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import {
  RUN_KINDS,
  applyCoverage,
  assistInputHash,
  bmWatchStatus,
  canAdvanceRel,
  canAdvanceReq,
  caseRequirementId,
  casesForRequirement,
  coverageStats,
  coverHistory,
  coverReady,
  createRelease,
  createRequirement,
  createSlot,
  extractUnderstanding,
  emptyUnderstanding,
  flattenMindmap,
  formatShortTime,
  fromDateEnd,
  fromDateStart,
  formatShortDate,
  generatedCasesFromProcess,
  slotKindMeta,
  sortReleases,
  gateHint,
  goNoGoReport,
  latestArtifact,
  linkedCaseIds,
  matchCaseIds,
  nowIso,
  reqOptionLabel,
  reqSigned,
  reqVersionImpact,
  runAssistJob,
  signOffReport,
  upsertArtifact,
  visibleArtifact,
} from '@/utils/qaProcess'
import {
  dispatchSteps,
  ensurePipelineDispatch,
  envLabel,
  findStep,
  hasReached,
  jobMeta,
  kindAssistJob,
  kindTab,
  nextStep,
  previousStepOfKind,
  resolveWorkflow,
  stageJobTabs,
  trackSteps,
  understood,
} from '@/utils/qaWorkflow'
import { envSummaries, filledEnvKeys, pipelineKeys } from '@/constants/envProfiles'
import { getProjectEnv } from '@/api/workReport'
import { shortTaskId, statusLabel, statusTagType, taskCountLabel, displayTaskStatus } from '@/utils/testingTasks'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '' },
  projectId: { type: String, default: '' },
  cases: { type: Array, default: () => [] },
  tasks: { type: Array, default: () => [] },
  suites: { type: Array, default: () => [] },
  devices: { type: Array, default: () => [] },
  board: { type: String, default: 'rel' },
  selectedId: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
})

const emit = defineEmits(['dispatch-run', 'open-task', 'go-tab', 'update:board', 'update:selectedId'])

const appIdRef = computed(() => props.appId)
const {
  requirements,
  releases,
  appAtlas,
  schedule,
  workflow,
  loading,
  saving,
  load,
  apply,
  persist,
  persistSoon,
  upsertReq,
  removeReq,
  upsertRel,
  removeRel,
  upsertSlot,
  removeSlot,
  attachRun,
  atlasPatches,
} = useQaProcess(appIdRef)

const envSnap = ref({ summaries: [], filledKeys: [], pipeline: [] })
const loadEnvSnap = async () => {
  if (!props.projectId) {
    envSnap.value = { summaries: [], filledKeys: [], pipeline: [] }
    return
  }
  try {
    const res = await getProjectEnv(props.projectId)
    const data = res?.data || res || {}
    const env = data.env || data
    envSnap.value = {
      summaries: envSummaries(env),
      filledKeys: filledEnvKeys(env),
      pipeline: pipelineKeys(env),
    }
  } catch {
    envSnap.value = { summaries: [], filledKeys: [], pipeline: [] }
  }
}
const envTitle = (key) => envSnap.value.summaries.find((s) => s.key === key)?.label || envLabel(key)
const envFilled = (key) => {
  const hit = envSnap.value.summaries.find((s) => s.key === key)
  if (!hit) return !envSnap.value.filledKeys.length
  return hit.filled
}
const ensureEnvReady = (env) => {
  if (!envSnap.value.filledKeys.length) return true
  if (envFilled(env)) return true
  ElMessage.warning(`${envTitle(env)}环境还没填应用启动标识，先去「配置 → 环境配置」填好再下发`)
  return false
}

const board = computed({
  get: () => (props.board === 'req' || props.board === 'sch' ? props.board : 'rel'),
  set: (v) => emit('update:board', v),
})
const selectedId = computed({
  get: () => props.selectedId,
  set: (v) => emit('update:selectedId', v || ''),
})

const gateFilter = ref('all')
const page = ref(1)
const pageSize = ref(20)
const detailTab = ref(props.board === 'req' ? 'understand' : 'scope')
const assisting = ref(false)
const assistJob = ref('')
const ticking = ref(false)
const tickLabel = ref('')
const tickProgress = ref(null) // { done, total, phase, label, job_id }
let tickAbort = null
let assistChain = Promise.resolve()
const createOpen = ref(false)
const creatingRel = ref(false)
const creatingSubmit = ref(false)
const draft = reactive({
  title: '',
  external_id: '',
  source_url: '',
  source_text: '',
  requirement_ids: [],
  release_id: '',
  case_ids: [],
  test_start: '',
  test_end: '',
  review_at: '',
  online_at: '',
})
const scheduleBoard = ref(null)
const inspectGateId = ref('')

const inspectReqStep = computed(() => {
  const id = inspectGateId.value || selectedReq.value?.gate
  return findStep(wf.value, 'req', id) || reqStep.value
})
const inspectRelStep = computed(() => {
  const id = inspectGateId.value || selectedRel.value?.gate
  return findStep(wf.value, 'rel', id) || relStep.value
})
const inspectJobTabs = computed(() => stageJobTabs(inspectReqStep.value, wf.value, 'req'))
const showJobTabs = computed(() => inspectJobTabs.value.length > 1)
const stageJobId = ref('')
const activeJobId = computed(() => {
  const ids = inspectJobTabs.value.map((j) => j.id)
  if (ids.includes(stageJobId.value)) return stageJobId.value
  return ids[0] || ''
})
const showJobPanel = (id) => !showJobTabs.value || activeJobId.value === id
const listPageTitle = computed(() => {
  if (board.value === 'req') return '需求测试'
  if (board.value === 'sch') return '本项目排期'
  return '版本测试'
})
const viewingReqCurrent = computed(() => {
  const cur = selectedReq.value?.gate
  return Boolean(cur) && (inspectGateId.value || cur) === cur
})
const viewingRelCurrent = computed(() => {
  const cur = selectedRel.value?.gate
  return Boolean(cur) && (inspectGateId.value || cur) === cur
})
const reqDispatchFocus = computed(() => (inspectReqStep.value?.kind === 'dispatch' ? inspectReqStep.value : null))
const relDispatchFocus = computed(() => (inspectRelStep.value?.kind === 'dispatch' ? inspectRelStep.value : null))
const inspectReqRuns = computed(() => {
  const runs = selectedReq.value?.runs || []
  const step = reqDispatchFocus.value
  if (!step) return runs
  return runs.filter((r) => r.kind === step.run)
})
const inspectRelRuns = computed(() => {
  const runs = selectedRel.value?.runs || []
  const step = relDispatchFocus.value
  if (!step) return runs
  return runs.filter((r) => r.kind === step.run)
})
const reqSlots = computed(() => (schedule.value || []).filter((s) => s.requirement_id === selectedReq.value?.id))
const TERMINAL_OK = new Set(['done', 'failed', 'partial_fail'])
const reqStepRunDone = computed(() => {
  if (!viewingReqCurrent.value || reqStep.value?.kind !== 'dispatch') return false
  const latest = [...(selectedReq.value?.runs || [])].reverse().find((r) => r.kind === reqStep.value.run)
  const task = latest && taskOf(latest.task_id)
  return Boolean(task && TERMINAL_OK.has(displayTaskStatus(task)))
})
const relStepRunDone = computed(() => {
  if (!viewingRelCurrent.value || relStep.value?.kind !== 'dispatch') return false
  const latest = [...(selectedRel.value?.runs || [])].reverse().find((r) => r.kind === relStep.value.run)
  const task = latest && taskOf(latest.task_id)
  return Boolean(task && TERMINAL_OK.has(displayTaskStatus(task)))
})

const wf = computed(() => ensurePipelineDispatch(resolveWorkflow(workflow.value), envSnap.value.pipeline, envSnap.value.summaries))
const reqSteps = computed(() => trackSteps(wf.value, 'req'))
const relSteps = computed(() => trackSteps(wf.value, 'rel'))
const reqDispatchSteps = computed(() => dispatchSteps(wf.value, 'req'))
const relDispatchSteps = computed(() => dispatchSteps(wf.value, 'rel'))
const reqStep = computed(() => findStep(wf.value, 'req', selectedReq.value?.gate))
const relStep = computed(() => findStep(wf.value, 'rel', selectedRel.value?.gate))
const reqKindIs = (...kinds) => kinds.includes(reqStep.value?.kind)
const relKindIs = (...kinds) => kinds.includes(relStep.value?.kind)
const reqCanEditCover = computed(() => reqKindIs('understand', 'cover'))
const relCanEditScope = computed(() => relKindIs('scope'))
const detailEditing = ref(false)
const reqEditing = computed(() => detailEditing.value && reqCanEditCover.value)
const relEditing = computed(() => detailEditing.value && relCanEditScope.value)
const canEditTicket = computed(() => (board.value === 'req' ? reqCanEditCover.value : relCanEditScope.value))
const reqCanSign = computed(() => viewingReqCurrent.value && reqKindIs('human_verdict'))
const relCanVerdict = computed(() => viewingRelCurrent.value && relKindIs('human_verdict'))
const reqNext = computed(() => nextStep(wf.value, 'req', selectedReq.value?.gate))
const relNext = computed(() => nextStep(wf.value, 'rel', selectedRel.value?.gate))

const syncDetailTab = (track, gate) => {
  const step = findStep(wf.value, track, gate)
  detailTab.value = kindTab(step?.kind) || (track === 'rel' ? 'scope' : 'understand')
}

const dispatchLabel = (step) => `下发${RUN_KINDS[step.run]?.label || step.label}（${envTitle(step.env)}）`
const canDispatchReqStep = (step) => {
  const req = selectedReq.value
  if (!req || step?.kind !== 'dispatch' || reqKindIs('archive')) return false
  if (!understood(req, wf.value)) return false
  return hasReached(wf.value, 'req', req.gate, step.id)
}
const canDispatchRelStep = (step) => {
  const rel = selectedRel.value
  if (!rel || step?.kind !== 'dispatch' || relKindIs('archive')) return false
  return hasReached(wf.value, 'rel', rel.gate, step.id)
}

const watchStatus = computed(() => bmWatchStatus({
  requirements: requirements.value,
  releases: releases.value,
  tasks: props.tasks,
  workflow: wf.value,
}))

const selectedReq = computed(() => requirements.value.find((r) => r.id === selectedId.value) || null)
const selectedRel = computed(() => releases.value.find((r) => r.id === selectedId.value) || null)
const reqCoverStep = computed(() => reqSteps.value.find((s) => s.kind === 'cover') || null)
const reachedCover = computed(() => {
  const req = selectedReq.value
  const cover = reqCoverStep.value
  if (!req || !cover) return false
  return hasReached(wf.value, 'req', req.gate, cover.id)
})
const mindRows = computed(() => flattenMindmap(selectedReq.value?.mindmap))
const mindPointCount = computed(() => mindRows.value.filter((r) => r.isPoint).length)
const draftCaseRows = computed(() => selectedReq.value?.draft_cases || [])
const mindmapBackfill = computed(() => selectedReq.value?.mindmap_backfill || [])
const coverStats = computed(() => coverageStats(selectedReq.value))
const coveredPointCount = computed(() => coverStats.value.covered)
// 生成过程中的失败：截断、解析失败、模型报错、撞安全阀。以前这些是静默的。
const caseFailures = computed(() => coverStats.value.failures || [])
const caseAspectGaps = computed(() => coverStats.value.aspectGaps || [])
const mindmapFailures = computed(() => coverStats.value.mindmapFailures || [])
const CASE_ORIGIN_LABEL = {
  llm: '模型',
  stub: '模板兜底',
  human: '人工',
  import: '导入',
}
const caseOriginLabel = (row) => CASE_ORIGIN_LABEL[String(row?.origin || 'llm')] || '模型'
const isStubCase = (row) => String(row?.origin || 'llm') === 'stub'
const FAILURE_REASON_LABEL = {
  truncated: '输出被截断',
  parse_failed: '返回的不是合法 JSON',
  llm_error: '模型调用失败',
  deadline: '撞到生成安全阀',
  incomplete: '模型没覆盖这些点',
  backfilled_point: '反推补的新测试点',
  llm_failed: '模型没写成',
}
const failureLabel = (row) => FAILURE_REASON_LABEL[String(row?.reason || '')] || String(row?.reason || '未知')
const mindHistory = computed(() => coverHistory(selectedReq.value, 'draft_mindmap'))
const caseHistory = computed(() => coverHistory(selectedReq.value, 'draft_cases'))
const coverImportOpen = ref(false)
const coverImportKind = ref('mindmap')
const coverHistKind = (row) => {
  if (row?.kind === 'import') return '导入'
  if (row?.kind === 'retry') return '重试'
  return '生成'
}
const openCoverImport = (kind) => {
  if (!selectedReq.value) {
    ElMessage.warning('请先选一条需求')
    return
  }
  coverImportKind.value = kind
  coverImportOpen.value = true
}
const onCoverImported = (data) => {
  if (data?.qa_process) apply(data.qa_process)
  // 导入产生了待确认的图谱变更就直接切过去 —— 不切的话人停在脑图面板上，
  // 看到的还是旧骨架，而且 tick 在 patch 处理完之前不会再提新建议。
  if (data?.atlas === 'patch' || data?.atlas === 'pending') stageJobId.value = 'propose_atlas'
}
const wikiPublishing = ref(false)
const wikiHistoryOpen = ref(false)
const wikiHistoryReq = ref(null)
const wikiWriteCount = (req) => {
  const rows = req?.mindmap_wiki_history
  if (Array.isArray(rows) && rows.length) return rows.length
  return req?.mindmap_wiki?.url ? 1 : 0
}
const wikiHistoryCount = computed(() => wikiWriteCount(selectedReq.value))
const openWikiHistory = (row) => {
  wikiHistoryReq.value = row || selectedReq.value
  wikiHistoryOpen.value = true
}
const onWikiHistoryUpdated = (qa) => {
  if (qa) apply(qa)
  const rid = wikiHistoryReq.value?.id || selectedReq.value?.id
  wikiHistoryReq.value = requirements.value.find((r) => r.id === rid) || selectedReq.value
}
const publishMindmapToWiki = async () => {
  const req = selectedReq.value
  if (!req) {
    ElMessage.warning('请先选一条需求')
    return
  }
  if (!mindRows.value.length) {
    ElMessage.warning('这条需求还没有脑图')
    return
  }
  if (wikiPublishing.value || workflowBusy.value) return
  wikiPublishing.value = true
  try {
    const res = await publishQaMindmap(props.appId, {
      requirement_id: req.id,
      release_id: req.release_id || '',
    })
    const data = res?.data || res || {}
    if (data.qa_process) apply(data.qa_process)
    const url = data.url || data.wiki?.url || ''
    const count = data.nodes || data.wiki?.nodes || 0
    ElMessage.success(`${data.created ? '已写入' : '已更新'}飞书脑图${count ? ` · ${count} 个节点` : ''}`)
    if (url) await openExternalUrl(url)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '写入飞书 Wiki 失败')
  } finally {
    wikiPublishing.value = false
  }
}
const workflowBusy = computed(() => ticking.value || assisting.value)
const coverCheck = computed(() => coverReady(selectedReq.value))
const canLeaveCover = computed(() => !workflowBusy.value && coverCheck.value.ok)
const journeyLine = (row) => {
  const parts = [row?.entry, ...(row?.via || []), row?.page].map((x) => String(x || '').trim()).filter(Boolean)
  const like = String(row?.page_like || '').trim()
  return `${parts.join(' → ') || '未写入口'}${like ? `（${like}）` : ''}`
}
const featureLine = (row) => {
  const name = String(row?.name || '').trim()
  const how = String(row?.how || '').trim()
  return how ? `${name}：${how}` : name
}
const surfaceLine = (row) => {
  const feats = (row?.features || []).filter(Boolean).join('、')
  return `${row?.name || row?.kind || '端'}${feats ? ` · ${feats}` : ''}`
}
const reqReading = computed(() => {
  const und = selectedReq.value?.understanding || {}
  return {
    journeys: und.journeys || [],
    newFeatures: und.new_features || [],
    keepFeatures: und.keep_features || [],
    exceptions: und.exceptions || [],
    surfaces: und.surfaces || [],
  }
})
const hasReqReading = computed(() => (
  reqReading.value.journeys.length
  || reqReading.value.newFeatures.length
  || reqReading.value.keepFeatures.length
  || reqReading.value.exceptions.length
  || reqReading.value.surfaces.length
))
const liveReqTasks = computed(() => {
  const ids = new Set((selectedReq.value?.runs || []).map((r) => r.task_id).filter(Boolean))
  return (props.tasks || []).filter((t) => ids.has(t.taskId) && ['queued', 'running'].includes(displayTaskStatus(t)))
})
const workBanner = computed(() => {
  if (reviewingPatch.value) return { title: '正在确认图谱', detail: '骨架写入中，确认图谱不等于评审通过。' }
  if (ticking.value) {
    const p = tickProgress.value
    const frac = p?.total ? `${p.done || 0}/${p.total}` : ''
    return {
      title: tickLabel.value || p?.label || '正在跑流程工作流',
      detail: frac
        ? `${frac} · ${p?.label || '脑图和用例写完后会出现在「用例准备」。'}`
        : (p?.label || '脑图和用例写完后会出现在「用例准备」。'),
      progress: p?.total ? Math.min(100, Math.round(((p.done || 0) / p.total) * 100)) : null,
      cancellable: true,
    }
  }
  if (assisting.value) return { title: `正在跑「${jobMeta(assistJob.value).label}」`, detail: '跑完后这一步的内容会更新。' }
  if (liveReqTasks.value.length) {
    const t = liveReqTasks.value[0]
    return {
      title: `${liveReqTasks.value.length} 个任务执行中`,
      detail: `${statusLabel(t.status, t)} · ${shortTaskId(t.taskId)} · ${taskCountLabel(t)}`,
    }
  }
  return null
})
const showTicketEdit = computed(() => {
  if (board.value === 'req') return viewingReqCurrent.value && reqKindIs('understand', 'cover')
  return viewingRelCurrent.value && relKindIs('scope')
})
const ticketEditLabel = computed(() => {
  if (board.value === 'rel') return '改纳入范围'
  if (reqKindIs('cover')) return '改测试点'
  return '改验收标准'
})
const showScheduleBtn = computed(() => (
  (board.value === 'req' && viewingReqCurrent.value && reqKindIs('dispatch'))
  || (board.value === 'rel' && viewingRelCurrent.value && relKindIs('dispatch'))
))
const showTicket = computed(() => {
  if (board.value === 'sch') return false
  if (board.value === 'req') return Boolean(selectedReq.value)
  if (board.value === 'rel') return Boolean(selectedRel.value)
  return false
})
const reqPendingPatches = computed(() => {
  const req = selectedReq.value
  if (!req) return []
  return (atlasPatches.value || []).filter((p) => (
    p.status === 'pending' && String(p.source?.req_id || '') === req.id
  ))
})
const reqImpact = computed(() => (
  selectedReq.value ? reqVersionImpact(selectedReq.value, releases.value, appAtlas.value) : null
))
const reviewingPatch = ref(false)
const rejectOpen = ref(false)
const rejectNote = ref('')
const rejectTarget = ref(null)

const reqRows = computed(() => {
  let list = requirements.value
  if (gateFilter.value !== 'all') list = list.filter((r) => r.gate === gateFilter.value)
  return list
})
const relRows = computed(() => {
  let list = releases.value
  if (gateFilter.value !== 'all') list = list.filter((r) => r.gate === gateFilter.value)
  return list
})
const tableRows = computed(() => (board.value === 'rel' ? relRows.value : reqRows.value))
const pagedRows = computed(() => slicePage(tableRows.value, page.value, pageSize.value))

const reqStats = computed(() => (selectedReq.value ? coverageStats(selectedReq.value) : null))
const reqReport = computed(() => (selectedReq.value ? signOffReport(selectedReq.value, props.tasks) : null))
const relReport = computed(() => (selectedRel.value ? goNoGoReport(selectedRel.value, requirements.value, props.tasks, wf.value) : null))
const joinableReqs = computed(() => requirements.value)
const caseOptions = computed(() => (props.cases || []).map((c) => ({
  id: c.case_id,
  label: `${c.case_id} · ${c.name || c.title || ''}${c.requirement_id ? ` · ${c.requirement_id}` : ''}`,
})))
const exactCaseIds = computed(() => (
  selectedReq.value ? casesForRequirement(props.cases, selectedReq.value) : []
))

const compactCases = () => (props.cases || []).map((c) => ({
  case_id: c.case_id,
  name: c.name || c.title,
  module: c.module,
  requirement_id: caseRequirementId(c),
}))

const compactTasks = (entity) => {
  const ids = new Set((entity?.runs || []).map((r) => r.task_id).filter(Boolean))
  return (props.tasks || []).filter((t) => ids.has(t.taskId)).map((t) => ({
    taskId: t.taskId,
    status: t.status,
    failed: t.failed,
    blocked: t.blocked,
    passed: t.passed,
    cases: (t.cases || []).map((c) => ({
      case_id: c.case_id,
      name: c.name,
      status: c.status,
      error: c.error || c.summary || '',
      message: c.message || c.summary || '',
    })),
  }))
}

const compactReqs = () => requirements.value.map((r) => ({
  id: r.id,
  title: r.title,
  gate: r.gate,
  signoff: r.signoff,
  case_ids: r.case_ids || [],
  understanding: {
    points: (r.understanding?.points || []).map((p) => ({
      id: p.id,
      text: p.text,
      case_ids: p.case_ids || [],
      waived: p.waived,
    })),
  },
}))

const reqAssistJob = computed(() => kindAssistJob(inspectReqStep.value?.kind, 'req'))
const relAssistJob = computed(() => kindAssistJob(inspectRelStep.value?.kind, 'rel'))

const reqMapHash = computed(() => (
  selectedReq.value
    ? assistInputHash({ job: 'map_cases', req: selectedReq.value, cases: props.cases, tasks: props.tasks })
    : ''
))
const reqSignHash = computed(() => (
  selectedReq.value
    ? assistInputHash({ job: 'draft_sign', req: selectedReq.value, cases: props.cases, tasks: props.tasks })
    : ''
))
const relPickHash = computed(() => (
  selectedRel.value
    ? assistInputHash({ job: 'pick_regression', rel: selectedRel.value, cases: props.cases, tasks: props.tasks, requirements: requirements.value })
    : ''
))
const relGateHash = computed(() => (
  selectedRel.value
    ? assistInputHash({ job: 'draft_gate', rel: selectedRel.value, cases: props.cases, tasks: props.tasks, requirements: requirements.value })
    : ''
))

const reqMapArt = computed(() => visibleArtifact(selectedReq.value, 'map_cases', reqMapHash.value))
const reqSignArt = computed(() => visibleArtifact(selectedReq.value, 'draft_sign', reqSignHash.value))
const relPickArt = computed(() => visibleArtifact(selectedRel.value, 'pick_regression', relPickHash.value))
const relGateArt = computed(() => visibleArtifact(selectedRel.value, 'draft_gate', relGateHash.value))
const reqAssistArt = computed(() => (reqAssistJob.value === 'map_cases' ? reqMapArt.value : reqSignArt.value))
const relAssistArt = computed(() => (relAssistJob.value === 'pick_regression' ? relPickArt.value : relGateArt.value))

const mapForPoint = (pointId) => (reqMapArt.value?.payload?.mappings || []).find((m) => m.point_id === pointId)
const gapForPoint = (pointId) => (reqMapArt.value?.payload?.gaps || []).find((g) => g.point_id === pointId)
const reqFailItems = computed(() => reqSignArt.value?.payload?.fails?.items || [])
const reqRerunIds = computed(() => reqSignArt.value?.payload?.fails?.rerun_ids || [])
const relFailItems = computed(() => relGateArt.value?.payload?.fails?.items || [])
const relRerunIds = computed(() => relGateArt.value?.payload?.fails?.rerun_ids || [])

const inventory = computed(() => {
  const reqs = requirements.value
  const cases = props.cases || []
  const withReqCol = cases.filter((c) => caseRequirementId(c)).length
  const linked = reqs.reduce((n, r) => n + linkedCaseIds(r).length, 0)
  return { reqs: reqs.length, cases: cases.length, withReqCol, linked }
})
const unsignedOnRel = (rel) => (rel?.requirement_ids || []).filter((id) => {
  const req = requirements.value.find((r) => r.id === id)
  return req && !reqSigned(req, wf.value)
}).length

const emptyText = computed(() => '暂无数据')

const pillStyle = computed(() => {
  if (watchStatus.value.id === 'blocked') return { background: '#fffbeb', color: '#b45309' }
  if (watchStatus.value.id === 'dispatching') return { background: '#eef2ff', color: '#4338ca' }
  return undefined
})

const taskOf = (taskId) => props.tasks.find((t) => t.taskId === taskId) || null

const caseName = (id) => {
  const hit = (props.cases || []).find((c) => c.case_id === id)
  return hit ? `${id} · ${hit.name || hit.title || ''}` : id
}

const setBoard = (next) => {
  selectedId.value = ''
  inspectGateId.value = ''
  detailEditing.value = false
  board.value = next
  gateFilter.value = 'all'
  page.value = 1
}

const closeTicket = () => {
  selectedId.value = ''
  inspectGateId.value = ''
  detailEditing.value = false
}

const scheduleCurrent = async (kind) => {
  const seed = {
    kind,
    requirement_id: selectedReq.value?.id || '',
    release_id: selectedRel.value?.id || '',
  }
  board.value = 'sch'
  await nextTick()
  scheduleBoard.value?.openCreate(seed)
}

const selectRow = (row) => {
  if (!row?.id) return
  detailEditing.value = false
  selectedId.value = row.id
  inspectGateId.value = row.gate || ''
  syncDetailTab(board.value === 'rel' ? 'rel' : 'req', row.gate)
}

const reviewPatch = async (patch, action, extra = {}) => {
  if (!props.appId || !patch?.id || reviewingPatch.value) return
  reviewingPatch.value = true
  const prev = atlasPatches.value
  if (action === 'accept' || action === 'reject') {
    atlasPatches.value = (atlasPatches.value || []).map((p) => (
      p.id === patch.id ? { ...p, status: action === 'accept' ? 'accepted' : 'rejected' } : p
    ))
  }
  try {
    const res = await reviewAtlasPatch(props.appId, {
      patch_id: patch.id,
      action,
      after: extra.after || undefined,
      run_pipeline: false,
      note: extra.note || '',
      rerun: extra.rerun !== false && action === 'reject',
    })
    if (res?.data?.qa_process) apply(res.data.qa_process)
    if (action === 'reject') {
      ElMessage.success(extra.rerun !== false ? '已驳回，正在按你的说明重跑分析' : '已驳回这次变更')
    } else {
      ElMessage.success('图谱已确认。点「评审通过」才会进入用例准备、写脑图和用例。')
    }
  } catch (e) {
    atlasPatches.value = prev
    ElMessage.error(e?.response?.data?.detail || e?.message || '审核失败')
  } finally {
    reviewingPatch.value = false
  }
}

const onAcceptPatch = ({ patch, after }) => reviewPatch(patch, 'accept', { after })
const openReject = (patch) => {
  rejectTarget.value = patch
  rejectNote.value = ''
  rejectOpen.value = true
}
const submitReject = async () => {
  const note = String(rejectNote.value || '').trim()
  if (!note) {
    ElMessage.warning('请写明为什么驳回，以及你认为该怎么理解这条需求')
    return
  }
  const patch = rejectTarget.value
  rejectOpen.value = false
  await reviewPatch(patch, 'reject', { note, rerun: true })
}

const titlesOf = (ids) => (ids || []).map((id) => {
  const req = requirements.value.find((r) => r.id === id)
  return req?.title || id
}).join('、') || '—'
const caseLabelsOf = (ids) => (ids || []).map((id) => caseName(id)).join('、') || '—'

const rowClass = ({ row }) => (row.id === selectedId.value ? 'is-current' : '')

const resetDraft = () => {
  draft.title = ''
  draft.external_id = ''
  draft.source_url = ''
  draft.source_text = ''
  draft.requirement_ids = []
  draft.release_id = ''
  draft.case_ids = []
  draft.test_start = ''
  draft.test_end = ''
  draft.review_at = ''
  draft.online_at = ''
}

const openCreate = () => {
  creatingRel.value = board.value === 'rel'
  resetDraft()
  createOpen.value = true
}

const submitCreate = async () => {
  if (creatingSubmit.value) return
  if (creatingRel.value) {
    if (!draft.title.trim()) { ElMessage.warning('请填写版本名称'); return }
    creatingSubmit.value = true
    try {
      const rel = createRelease({
        title: draft.title,
        requirement_ids: [...draft.requirement_ids],
        workflow: wf.value,
      })
      rel.plan = {
        test_start: fromDateStart(draft.test_start),
        test_end: fromDateEnd(draft.test_end || draft.test_start),
        online_at: fromDateStart(draft.online_at),
      }
      const caseSet = new Set()
      for (const id of rel.requirement_ids) {
        const req = requirements.value.find((r) => r.id === id)
        linkedCaseIds(req).forEach((cid) => caseSet.add(cid))
      }
      const smoke = (props.suites || []).find((s) => /冒烟|smoke/i.test(s.name || ''))
      if (smoke) suiteCaseIds(smoke, props.cases).forEach((cid) => caseSet.add(cid))
      const prev = sortReleases(releases.value).slice(-1)[0]
      const seed = prev?.atlas || appAtlas.value
      rel.atlas = seed && typeof seed === 'object' ? JSON.parse(JSON.stringify(seed)) : { modules: [] }
      rel.atlas_at = seed ? (prev?.atlas_at || '') : ''
      rel.case_ids = [...caseSet]
      await upsertRel(rel)
      await addPlanSlots({ releaseId: rel.id })
      selectedId.value = rel.id
      createOpen.value = false
      ElMessage.success('版本已创建。需求可以后补。没验收的不能当成发版通过的依据。')
    } catch (e) {
      ElMessage.error(e?.response?.data?.detail || e?.message || '创建版本失败')
    } finally {
      creatingSubmit.value = false
    }
    return
  }
  if (!draft.title.trim()) { ElMessage.warning('请填写需求名称'); return }
  creatingSubmit.value = true
  const hungReleaseId = draft.release_id
  const hasSource = Boolean(draft.source_text.trim())
  try {
    const req = createRequirement({
      title: draft.title,
      external_id: draft.external_id,
      source_url: draft.source_url,
      source_text: draft.source_text,
      workflow: wf.value,
    })
    req.plan = {
      test_start: '',
      test_end: '',
      review_at: '',
      online_at: '',
    }
    const exact = casesForRequirement(props.cases, req)
    const matched = matchCaseIds(req.understanding, props.cases, req)
    req.case_ids = [...new Set([...(draft.case_ids || []), ...exact, ...matched])]
    await upsertReq(req)
    createOpen.value = false
    board.value = 'req'
    selectedId.value = req.id
    if (hungReleaseId) {
      const rel = releases.value.find((r) => r.id === hungReleaseId)
      if (rel) {
        await upsertRel({
          ...rel,
          requirement_ids: [...new Set([...(rel.requirement_ids || []), req.id])],
        })
      }
    }
    const hung = Boolean(hungReleaseId && releases.value.some((r) => r.id === hungReleaseId))
    ElMessage.success(
      hasSource
        ? (hung ? '需求已创建并挂到版本，正在后台分析' : '需求已创建，正在后台分析')
        : (hung ? '需求已挂到版本。评审通过前不能开功能测试。' : '需求已建好。可再挂到版本；评审通过前不能开功能测试。'),
    )
    runTick(req.id, '正在分析需求、建议应用图谱')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '创建需求失败')
  } finally {
    creatingSubmit.value = false
  }
}

const addPlanSlots = async ({ requirementId = '', releaseId = '' }) => {
  const jobs = []
  if (draft.test_start) {
    jobs.push(upsertSlot(createSlot({
      kind: releaseId ? 'rel_test' : 'req_test',
      requirement_id: requirementId,
      release_id: releaseId,
      sns: [],
      start_at: fromDateStart(draft.test_start),
      end_at: fromDateEnd(draft.test_end || draft.test_start),
      title: draft.title,
    })))
  }
  if (draft.review_at && requirementId) {
    jobs.push(upsertSlot(createSlot({
      kind: 'req_review',
      requirement_id: requirementId,
      start_at: fromDateStart(draft.review_at),
      end_at: fromDateEnd(draft.review_at),
      title: draft.title,
    })))
  }
  if (draft.online_at) {
    jobs.push(upsertSlot(createSlot({
      kind: releaseId ? 'rel_online' : 'req_online',
      requirement_id: requirementId,
      release_id: releaseId,
      start_at: fromDateStart(draft.online_at),
      end_at: fromDateEnd(draft.online_at),
      title: draft.title,
    })))
  }
  if (jobs.length) await Promise.all(jobs)
}

const onSaveSlot = (slot) => upsertSlot(slot)
const onRemoveSlot = (id) => removeSlot(typeof id === 'string' ? id : id?.id)
const onOpenReq = (id) => {
  board.value = 'req'
  selectedId.value = id
  const req = requirements.value.find((r) => r.id === id)
  inspectGateId.value = req?.gate || ''
  syncDetailTab('req', req?.gate)
}
const onOpenRel = (id) => {
  board.value = 'rel'
  selectedId.value = id
  const rel = releases.value.find((r) => r.id === id)
  syncDetailTab('rel', rel?.gate)
}

const patchReq = async (patch) => {
  if (!selectedReq.value) return
  await upsertReq({ ...selectedReq.value, ...patch })
}

const patchRel = async (patch) => {
  if (!selectedRel.value) return
  await upsertRel({ ...selectedRel.value, ...patch })
}

const runAssist = (job, kind, opts = {}) => {
  const next = assistChain.then(() => runAssistNow(job, kind, opts))
  assistChain = next.catch(() => {})
  return next
}

const runAssistNow = async (job, kind, { force = false } = {}) => {
  if (!job || (kind !== 'req' && kind !== 'rel')) return null
  const req = kind === 'req' ? selectedReq.value : null
  const rel = kind === 'rel' ? selectedRel.value : null
  const entity = req || rel
  if (!entity || !props.appId) return null
  const hash = assistInputHash({ job, req, rel, cases: props.cases, tasks: props.tasks, requirements: requirements.value })
  const cur = latestArtifact(entity, job)
  if (!force && cur?.input_hash === hash && ['draft', 'accepted'].includes(cur.status)) return cur
  assisting.value = true
  assistJob.value = job
  let art = null
  try {
    try {
      await persist()
      const res = await assistQaProcess(props.appId, {
        entity: kind,
        id: entity.id,
        job,
        requirement: req,
        release: rel,
        requirements: kind === 'rel' ? compactReqs() : undefined,
        cases: compactCases(),
        tasks: compactTasks(entity),
        suites: (props.suites || []).map((s) => ({ name: s.name, case_ids: s.case_ids || [] })),
      })
      art = res?.data?.artifact || null
    } catch (_) {
      art = null
    }
    if (!art) {
      art = runAssistJob(job, {
        req,
        rel,
        cases: props.cases,
        tasks: props.tasks,
        requirements: requirements.value,
        suites: props.suites,
        workflow: wf.value,
      })
    }
    art.input_hash = hash
    const list = upsertArtifact(entity.ai_artifacts, art)
    if (req) await patchReq({ ai_artifacts: list })
    else await patchRel({ ai_artifacts: list })
    return art
  } finally {
    assisting.value = false
    assistJob.value = ''
  }
}

const runTick = async (reqId, label = '正在跑流程工作流', extra = {}) => {
  if (!props.appId || !reqId) return
  if (ticking.value) {
    ElMessage.info('已有推进任务在跑')
    return
  }
  ticking.value = true
  tickLabel.value = label
  tickProgress.value = null
  tickAbort = new AbortController()
  try {
    const data = await runQaProcessTick(
      props.appId,
      { requirement_id: reqId, ...extra },
      {
        signal: tickAbort.signal,
        onProgress: (snap) => {
          const job = snap?.job || {}
          tickProgress.value = {
            job_id: job.job_id,
            done: job.done || 0,
            total: job.total || 0,
            phase: job.phase || '',
            label: job.label || label,
          }
          if (job.label) tickLabel.value = job.label
          if (snap?.qa_process) apply(snap.qa_process)
        },
      },
    )
    if (data?.qa_process) apply(data.qa_process)
    if (data?.job?.status === 'cancelled') ElMessage.info('已取消')
    else if (data?.job?.status === 'error') ElMessage.error(data.job.error || '推进失败')
  } catch (e) {
    if (e?.name === 'AbortError') return
    const detail = e?.response?.data?.detail
    if (e?.response?.status === 409 && detail?.job) {
      tickProgress.value = detail.job
      ElMessage.warning(detail.message || '已有推进任务在跑')
      return
    }
    ElMessage.error(typeof detail === 'string' ? detail : (e?.message || '推进失败'))
  } finally {
    ticking.value = false
    tickLabel.value = ''
    tickProgress.value = null
    tickAbort = null
  }
}

const cancelTick = async () => {
  const jobId = tickProgress.value?.job_id
  if (!jobId) {
    tickAbort?.abort()
    return
  }
  try {
    await cancelQaProcessJob(jobId)
    tickAbort?.abort()
  } catch (_) { /* 轮询会看到 cancelled */ }
}

const acceptMap = async (pointId) => {
  const req = selectedReq.value
  const mapping = mapForPoint(pointId)
  if (!req || !mapping) return
  const point = (req.understanding?.points || []).find((p) => p.id === pointId)
  const ids = [...new Set([...(point?.case_ids || []), ...mapping.suggest.map((s) => s.case_id)])]
  await setPointCases(pointId, ids)
  await runAssist('map_cases', 'req', { force: true })
}

const acceptPassPack = async () => {
  const rel = selectedRel.value
  const ids = relPickArt.value?.payload?.pass_ids || []
  if (!rel || !ids.length) {
    ElMessage.warning('建议回归的用例是空的')
    return
  }
  await patchRel({ case_ids: [...new Set([...(rel.case_ids || []), ...ids])] })
    ElMessage.success(`已并入建议回归 ${ids.length} 条，未验收需求的用例没有自动带上`)
  await runAssist('pick_regression', 'rel', { force: true })
}

const dispatchWander = (kind) => {
  const ids = kind === 'req' ? reqRerunIds.value : relRerunIds.value
  if (!ids.length) {
    ElMessage.info('没有像走神的失败条')
    return
  }
  if (kind === 'req') {
    const req = selectedReq.value
    if (!req) return
    const step = reqDispatchSteps.value.find((s) => s.run === 'req_test')
    emit('dispatch-run', {
      caseIds: ids,
      kind: 'req_test',
      coverage: 'once',
      requirementId: req.id,
      envProfile: step?.env || 'test',
      generatedCases: generatedCasesOf(req),
    })
    return
  }
  const rel = selectedRel.value
  if (!rel) return
  const step = relDispatchSteps.value.find((s) => s.run === 'release_regression')
  emit('dispatch-run', {
    caseIds: ids,
    kind: 'release_regression',
    coverage: 'once',
    generatedCases: generatedCasesOf(null, rel),
    releaseId: rel.id,
    envProfile: step?.env || 'pre',
  })
}

const attachDraft = (entity, kind, job) => {
  const ctx = kind === 'req'
    ? { req: entity, cases: props.cases, tasks: props.tasks, workflow: wf.value }
    : { rel: entity, cases: props.cases, tasks: props.tasks, requirements: requirements.value, suites: props.suites, workflow: wf.value }
  const art = runAssistJob(job, ctx)
  art.input_hash = assistInputHash({ job, ...ctx })
  return upsertArtifact(entity.ai_artifacts, art)
}

const reextract = async () => {
  const req = selectedReq.value
  if (!req) return
  const text = req.understanding?.source_excerpt || draft.source_text
  if (!String(text || '').trim()) {
    ElMessage.warning('没有需求正文。请在新建时粘贴，或先把验收标准手填完整')
    return
  }
  try {
    await ElMessageBox.confirm('将按当前正文重抽验收标准，已确认的评审会作废。', '需求有改动', { type: 'warning' })
  } catch { return }
  const understanding = extractUnderstanding(text, { title: req.title })
  const matched = matchCaseIds(understanding, props.cases, req)
  await patchReq({
    gate: findStep(wf.value, 'req', req.gate)?.kind === 'understand'
      ? req.gate
      : (trackSteps(wf.value, 'req').find((s) => s.kind === 'understand')?.id || req.gate),
    understanding: applyCoverage(understanding, matched.length ? matched : linkedCaseIds(req)),
    signoff: null,
  })
  ElMessage.success('验收标准已重抽，请再评审一次')
}

const confirmUnderstanding = async () => {
  const req = selectedReq.value
  if (!req) return
  if (workflowBusy.value) {
    ElMessage.warning('工作流还在跑，请等写完再进入下一步')
    return
  }
  const next = reqNext.value
  if (!next) return
  const check = canAdvanceReq(req, next.id, wf.value)
  if (!check.ok) { ElMessage.warning(check.reason); return }
  try {
    await ElMessageBox.confirm('确认验收标准没理解错？通过后才能去准备用例。', '结束评审', { type: 'warning' })
  } catch { return }
  const ac = (req.understanding?.ac || []).map((s) => String(s || '').trim()).filter(Boolean)
  let understanding = {
    ...req.understanding,
    confirmed: true,
    confirmed_at: nowIso(),
    ac,
  }
  if (!(understanding.points || []).length) {
    understanding = {
      ...understanding,
      points: ac.map((text, i) => ({
        id: `tp${i + 1}`,
        kind: i === 0 ? '正向' : '正向',
        text,
        case_ids: [],
        waived: false,
      })),
    }
  }
  await patchReq({
    gate: next.id,
    understanding,
  })
  syncDetailTab('req', next.id)
  inspectGateId.value = next.id
  ElMessage.success('评审通过，正在写测试脑图和用例')
  await runTick(req.id, '正在写测试脑图和用例')
}

const refreshCoverage = async () => {
  const req = selectedReq.value
  if (!req) return
  const exact = casesForRequirement(props.cases, req)
  const matched = matchCaseIds(req.understanding, props.cases, req)
  const extra = linkedCaseIds(req)
  const ids = [...new Set([...exact, ...matched, ...extra])]
  await patchReq({
    understanding: applyCoverage(req.understanding, ids),
    case_ids: ids,
  })
  ElMessage.success(
    exact.length
      ? `需求编号命中 ${exact.length} 条用例；测试点不会自动算覆盖，请分到点上`
      : (ids.length ? `已对照用例库，挂上 ${ids.length} 条（请分到测试点）` : '没有自动匹配到用例，请手选'),
  )
  await runAssist('map_cases', 'req', { force: true })
}

const setPointCases = async (pointId, ids) => {
  const req = selectedReq.value
  if (!req) return
  const points = (req.understanding?.points || []).map((p) => (
    p.id === pointId ? { ...p, case_ids: ids, waived: false } : p
  ))
  const all = [...new Set(points.flatMap((p) => p.case_ids || []))]
  await patchReq({
    understanding: { ...req.understanding, points },
    case_ids: all,
  })
}

const waivePoint = async (point) => {
  try {
    const { value } = await ElMessageBox.prompt('本版本不测的原因', '标记缺口', {
      inputPattern: /\S/,
      inputErrorMessage: '请填写原因',
    })
    const req = selectedReq.value
    const points = (req.understanding?.points || []).map((p) => (
      p.id === point.id ? { ...p, waived: true, waive_reason: String(value || '').trim() } : p
    ))
    await patchReq({ understanding: { ...req.understanding, points } })
  } catch { /* cancel */ }
}

const retryCover = async (job, extra = {}) => {
  const req = selectedReq.value
  if (!req || workflowBusy.value) return
  const isMind = job === 'draft_mindmap'
  const skipPrompt = Boolean(extra.skipPrompt)
  try {
    let note = String(extra.user_note || '').trim()
    if (!skipPrompt) {
      const { value } = await ElMessageBox.prompt(
        isMind
          ? '指出漏掉的能力、入口、端或异常兜底。评论会写入测试知识库（直接通过），并交给脑图角色在上一版上修订；不会重做需求理解，也不会整表重写用例。'
          : '指出漏掉的场景、路径和断言。已有真用例和锁定用例会留下，只补模板兜底和缺口。',
        extra.title || (isMind ? '重试测试脑图' : '补写用例'),
        {
          confirmButtonText: extra.confirmText || '开始',
          cancelButtonText: '取消',
          inputType: 'textarea',
          inputPlaceholder: isMind
            ? '例如：入口在「我的」而不是首页；漏了后台配置；缺上传失败兜底'
            : '例如：失败兜底没写清楚、列表空态没覆盖',
          inputValidator: () => true,
        },
      )
      note = String(value || '').trim()
    }
    const pointIds = extra.point_ids || []
    const busy = pointIds.length
      ? `正在重写 ${pointIds.length} 个测试点的用例`
      : (isMind ? (note ? '正在按评论修订脑图' : '正在按上一版修订脑图') : (note ? '正在按评论补写用例' : '正在补写用例'))
    await runTick(req.id, busy, {
      jobs: [job],
      user_note: note,
      force: true,
      point_ids: pointIds,
      rewrite_stubs: extra.rewrite_stubs ?? (!isMind && !pointIds.length),
      replace_cases: Boolean(extra.replace_cases),
    })
    ElMessage.success(isMind
      ? (note ? '评论已入库，脑图已按上一版修订。用例没动；对不上再点补写用例。' : '脑图已按上一版修订。用例没动。')
      : (pointIds.length ? '已定点重写这些测试点的用例。' : '已补写缺口，已有真用例未改。'))
  } catch { /* cancel */ }
}

const rewriteStubCases = () => retryCover('draft_cases', {
  skipPrompt: true,
  rewrite_stubs: true,
  title: '补写模板兜底',
})

const rewritePointCases = (pointId) => {
  const pid = String(pointId || '').trim()
  if (!pid) return
  retryCover('draft_cases', {
    skipPrompt: true,
    point_ids: [pid],
    rewrite_stubs: false,
  })
}

const onDraftCaseChange = (row, fields) => {
  const req = selectedReq.value
  if (!req || row?.locked) return
  const cases = (req.draft_cases || []).map((c) => (
    String(c.case_id) === String(row.case_id) ? { ...c, ...fields } : c
  ))
  const next = { ...req, draft_cases: cases }
  const i = requirements.value.findIndex((r) => r.id === next.id)
  if (i >= 0) requirements.value.splice(i, 1, next)
  persistSoon()
}

const historyRows = (row) => {
  if (row?.job === 'draft_cases') return row.payload?.cases || []
  return flattenMindmap(row?.payload)
}

const enterNextReq = async () => {
  const req = selectedReq.value
  const next = reqNext.value
  if (!req || !next) return
  if (workflowBusy.value) {
    ElMessage.warning('工作流还在跑，请等写完再进入下一步')
    return
  }
  const check = canAdvanceReq(req, next.id, wf.value)
  if (!check.ok) { ElMessage.warning(check.reason); return }
  await patchReq({ gate: next.id })
  syncDetailTab('req', next.id)
  const job = kindAssistJob(next.kind, 'req')
  if (job) await runAssist(job, 'req', { force: next.kind === 'human_verdict' })
}

const enterNextRel = async () => {
  const rel = selectedRel.value
  const next = relNext.value
  if (!rel || !next) return
  if (workflowBusy.value) {
    ElMessage.warning('工作流还在跑，请等写完再进入下一步')
    return
  }
  const check = canAdvanceRel(rel, next.id, wf.value)
  if (!check.ok) { ElMessage.warning(check.reason); return }
  await patchRel({ gate: next.id })
  syncDetailTab('rel', next.id)
  const job = kindAssistJob(next.kind, 'rel')
  if (job) await runAssist(job, 'rel', { force: next.kind === 'human_verdict' })
}

const signOff = async (verdict) => {
  const req = selectedReq.value
  if (!req) return
  const titles = { pass: '验收通过', risk: '带风险验收', reject: '退回重测' }
  try {
    await ElMessageBox.confirm(
      verdict === 'reject' ? '退回后回到功能测试，不能进版本回归。' : '验收后本需求可以进版本回归。必须测试同学点这一下。',
      titles[verdict],
      { type: 'warning' },
    )
  } catch { return }
  if (verdict === 'reject') {
    const back = previousStepOfKind(wf.value, 'req', req.gate, 'dispatch', 'req_test')
      || previousStepOfKind(wf.value, 'req', req.gate, 'dispatch')
      || reqStep.value
    await patchReq({ gate: back?.id || req.gate, signoff: null })
    syncDetailTab('req', back?.id || req.gate)
    return
  }
  const dest = reqKindIs('human_verdict') ? reqNext.value : (reqNext.value?.kind === 'human_verdict' ? nextStep(wf.value, 'req', reqNext.value.id) : reqNext.value)
  const archive = dest?.kind === 'archive' ? dest : trackSteps(wf.value, 'req').find((s) => s.kind === 'archive')
  await patchReq({
    gate: archive?.id || dest?.id || req.gate,
    signoff: { verdict, at: nowIso(), report: reqReport.value },
  })
  if (archive?.id) syncDetailTab('req', archive.id)
  ElMessage.success('已验收。挂进版本后，可以作为发版依据。')
}

const deleteReq = async (row) => {
  try {
    await ElMessageBox.confirm(`删除需求「${row.title}」？会一并去掉本需求下的用例草稿。`, '删除', { type: 'warning' })
  } catch { return }
  await removeReq(row.id)
  if (selectedId.value === row.id) selectedId.value = ''
}

const smokeIds = (req) => linkedCaseIds(req)

const generatedCasesOf = (req, rel = null) => {
  if (req) return generatedCasesFromProcess([req])
  if (rel) {
    const ids = new Set(rel.requirement_ids || [])
    return generatedCasesFromProcess((requirements.value || []).filter((r) => ids.has(r.id)))
  }
  return []
}

const dispatchReqStep = (step) => {
  const req = selectedReq.value
  if (!req || !step) return
  if (!understood(req, wf.value)) {
    ElMessage.warning('需求还没评审完，不能开功能测试')
    return
  }
  const kind = step.run || 'req_test'
  const caseIds = kind === 'req_admit' ? smokeIds(req) : linkedCaseIds(req)
  if (!caseIds.length) {
    ElMessage.warning('没有可跑的用例。先在用例准备里等本需求生成用例，或按模块勾选后再下发。')
    return
  }
  if (!ensureEnvReady(step.env || RUN_KINDS[kind]?.env || 'test')) return
  emit('dispatch-run', {
    caseIds,
    kind,
    coverage: RUN_KINDS[kind]?.coverage || 'once',
    requirementId: req.id,
    envProfile: step.env || RUN_KINDS[kind]?.env || 'test',
    generatedCases: generatedCasesOf(req),
  })
}

const lockScope = async () => {
  if (!selectedRel.value) return
  const n = (selectedRel.value.requirement_ids || []).length
  if (!n) {
    try {
      await ElMessageBox.confirm('还没有挂需求。可以先定开测日期，需求后补。没在各环境测完的需求不能当成发版通过的依据。', '完成纳入需求')
    } catch { return }
  }
  await enterNextRel()
}

const confirmScope = async () => {
  if (!selectedRel.value) return
  if (!(selectedRel.value.case_ids || []).length) {
    ElMessage.warning('回归范围是空的')
    return
  }
  try {
    await ElMessageBox.confirm('锁定这批用例作为预发回归范围？之后下发不再默认改圈选。', '确认回归范围')
  } catch { return }
  await enterNextRel()
}

const completeCheckpoint = async (track) => {
  if (track === 'req') {
    await enterNextReq()
    ElMessage.success('检查点已完成')
    return
  }
  await enterNextRel()
  ElMessage.success('检查点已完成')
}

const verdictRel = async (verdict) => {
  const titles = { pass: '发版通过', risk: '带风险发版', block: '不发版' }
  try {
    await ElMessageBox.confirm(
      verdict === 'block' ? '判定不发版后停在发版评审，不下发生产冒烟。' : '发版必须测试同学判定。通过后可下发生产环境冒烟。',
      titles[verdict],
      { type: 'warning' },
    )
  } catch { return }
  if (verdict === 'block') {
    await patchRel({ verdict: { verdict, at: nowIso(), report: relReport.value } })
    return
  }
  let dest = relNext.value
  if (relKindIs('human_verdict')) dest = relNext.value
  else if (relNext.value?.kind === 'human_verdict') dest = nextStep(wf.value, 'rel', relNext.value.id)
  await patchRel({
    gate: dest?.id || selectedRel.value.gate,
    verdict: { verdict, at: nowIso(), report: relReport.value },
  })
  if (dest?.id) syncDetailTab('rel', dest.id)
  ElMessage.success(verdict === 'pass' ? '发版通过，可下发生产冒烟' : '带风险发版，仍可下发生产冒烟')
}

const closeRel = async () => {
  const rel = selectedRel.value
  const next = relNext.value
  if (!rel || !next) return
  const check = canAdvanceRel(rel, next.id, wf.value)
  if (!check.ok) { ElMessage.warning(check.reason); return }
  await patchRel({ gate: next.id })
  syncDetailTab('rel', next.id)
  ElMessage.success('版本单已关闭')
}

const onReqGateClick = (g) => {
  if (!selectedReq.value || !g?.id) return
  inspectGateId.value = g.id
  const tab = kindTab(g.kind)
  if (tab) detailTab.value = tab
}

const onRelGateClick = (g) => {
  if (!selectedRel.value || !g?.id) return
  inspectGateId.value = g.id
  const tab = kindTab(g.kind)
  if (tab) detailTab.value = tab
}

const deleteRel = async (row) => {
  try {
    await ElMessageBox.confirm(`删除版本「${row.title}」？`, '删除', { type: 'warning' })
  } catch { return }
  await removeRel(row.id)
  if (selectedId.value === row.id) selectedId.value = ''
}

const dispatchRelStep = (step) => {
  const rel = selectedRel.value
  if (!rel || !step) return
  const kind = step.run || 'release_regression'
  const smoke = (props.suites || []).find((s) => /冒烟|smoke/i.test(s.name || ''))
  const ids = kind === 'release_smoke'
    ? (smoke ? suiteCaseIds(smoke, props.cases) : (rel.case_ids || []).slice(0, 5))
    : (rel.case_ids || [])
  if (!ids.length) {
    ElMessage.warning('回归范围是空的')
    return
  }
  if (!ensureEnvReady(step.env || RUN_KINDS[kind]?.env || 'pre')) return
  emit('dispatch-run', {
    caseIds: ids,
    kind,
    coverage: 'once',
    releaseId: rel.id,
    envProfile: step.env || RUN_KINDS[kind]?.env || 'pre',
    generatedCases: generatedCasesOf(null, rel),
  })
}

defineExpose({ attachRun, openCreate })

const addAc = () => {
  const req = selectedReq.value
  if (!req) return
  if (!req.understanding) req.understanding = emptyUnderstanding()
  req.understanding.ac = [...(req.understanding.ac || []), '']
  persistSoon()
}

const setAc = (idx, value) => {
  const req = selectedReq.value
  if (!req) return
  if (!req.understanding) req.understanding = emptyUnderstanding()
  const ac = [...(req.understanding.ac || [])]
  ac[idx] = value
  req.understanding.ac = ac
  persistSoon()
}

const addPoint = () => {
  const req = selectedReq.value
  if (!req) return
  const points = [...(req.understanding?.points || [])]
  points.push({
    id: `tp${points.length + 1}-${Date.now().toString(36)}`,
    kind: '正向',
    text: '',
    case_ids: [],
    waived: false,
  })
  patchReq({ understanding: { ...req.understanding, points } })
}

const setPointText = (pointId, text) => {
  const req = selectedReq.value
  if (!req) return
  const points = (req.understanding?.points || []).map((p) => (p.id === pointId ? { ...p, text } : p))
  req.understanding.points = points
  persistSoon()
}

watch([gateFilter, board, () => tableRows.value.length], () => { page.value = 1 })

watch(board, () => {
  if (board.value === 'flow' || board.value === 'sch') return
  if (board.value === 'rel' && selectedRel.value) return
  if (board.value === 'req' && selectedReq.value) return
  selectedId.value = ''
})

watch(() => draft.external_id, (id) => {
  if (!createOpen.value || creatingRel.value) return
  const ext = String(id || '').trim()
  if (!ext) return
  const ids = casesForRequirement(props.cases, { external_id: ext })
  if (ids.length && !(draft.case_ids || []).length) draft.case_ids = ids
})

watch(selectedId, () => {
  detailEditing.value = false
})

watch(() => inspectReqStep.value?.id, (id) => {
  if (!id || board.value !== 'req') return
  const tab = kindTab(inspectReqStep.value?.kind)
  if (tab) detailTab.value = tab
  stageJobId.value = inspectJobTabs.value[0]?.id || ''
})

onMounted(async () => {
  await Promise.all([load(), loadEnvSnap()])
})
watch(() => props.appId, load)
watch(() => props.projectId, loadEnvSnap)
</script>

<template>
  <div class="settings-panel qa-process-panel" v-loading="loading">
    <template v-if="!showTicket">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ hideNav ? listPageTitle : '测试单据' }}</h2>
        <p v-if="board !== 'sch'" class="settings-page-desc">
          {{ inventory.reqs }} 条需求 · 用例 {{ inventory.cases }} 条
        </p>
      </div>
      <div class="settings-summary-pill" :style="pillStyle">{{ watchStatus.label }}</div>
    </header>

    <div v-if="!hideNav" class="settings-tabbar">
      <button type="button" class="settings-tab" :class="{ active: board === 'rel' }" @click="setBoard('rel')">
        <strong>{{ wf.tracks.rel.label }}</strong>
        <span>定开测日期 · 预发回归 · 发版评审</span>
      </button>
      <button type="button" class="settings-tab" :class="{ active: board === 'req' }" @click="setBoard('req')">
        <strong>{{ wf.tracks.req.label }}</strong>
        <span>评审需求 · 准备用例 · 提测 · 验收</span>
      </button>
      <button type="button" class="settings-tab" :class="{ active: board === 'sch' }" @click="setBoard('sch')">
        <strong>测试排期</strong>
        <span>只预约日期，下发去执行批次</span>
      </button>
    </div>

    <QaScheduleBoard
      v-if="board === 'sch'"
      ref="scheduleBoard"
      :slots="schedule"
      :requirements="requirements"
      :releases="releases"
      :devices="devices"
      :cases="cases"
      :workflow="wf"
      @save="onSaveSlot"
      @remove="onRemoveSlot"
      @open-req="onOpenReq"
      @open-rel="onOpenRel"
    />

    <section v-else class="settings-table-card is-fill qa-list">
        <div class="col-head">
          <h3>{{ board === 'rel' ? '版本单' : '需求单' }}</h3>
          <div class="col-actions">
            <el-button size="small" :loading="loading" @click="load">刷新</el-button>
            <el-button size="small" type="primary" @click="openCreate">
              {{ board === 'rel' ? '新建版本' : '新建需求' }}
            </el-button>
          </div>
        </div>
        <div class="qa-seg gate-filters" role="tablist">
          <button type="button" :class="{ active: gateFilter === 'all' }" @click="gateFilter = 'all'">全部阶段</button>
          <button
            v-for="g in (board === 'rel' ? relSteps : reqSteps)"
            :key="g.id"
            type="button"
            :class="{ active: gateFilter === g.id }"
            @click="gateFilter = g.id"
          >{{ g.label }}</button>
        </div>
        <div class="table-wrap">
          <el-table
            :data="pagedRows"
            border
            stripe
            size="small"
            height="100%"
            highlight-current-row
            :row-class-name="rowClass"
            :empty-text="emptyText"
            @row-click="selectRow"
          >
            <el-table-column label="阶段" min-width="168">
              <template #default="{ row }">
                <QaFlowPipeline
                  mode="mini"
                  :track="board"
                  :steps="board === 'rel' ? relSteps : reqSteps"
                  :current-id="row.gate"
                />
              </template>
            </el-table-column>
            <el-table-column :label="board === 'rel' ? '版本' : '需求'" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="task-name">{{ row.title }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="board === 'req'" label="编号" width="100" show-overflow-tooltip>
              <template #default="{ row }">{{ row.external_id || '—' }}</template>
            </el-table-column>
            <el-table-column v-if="board === 'req'" label="覆盖" width="88">
              <template #default="{ row }">
                {{ coverageStats(row).covered }}/{{ coverageStats(row).total || 0 }}
              </template>
            </el-table-column>
            <el-table-column v-else label="需求" width="88">
              <template #default="{ row }">
                {{ (row.requirement_ids || []).length }}
                <span v-if="unsignedOnRel(row)" class="muted"> · {{ unsignedOnRel(row) }}未验收</span>
              </template>
            </el-table-column>
            <el-table-column label="计划测试" width="108">
              <template #default="{ row }">{{ formatShortDate(row.plan?.test_start) }}</template>
            </el-table-column>
            <el-table-column label="更新" width="108">
              <template #default="{ row }">{{ formatShortTime(row.updated_at) }}</template>
            </el-table-column>
            <el-table-column v-if="board === 'req'" label="测试用例地址" width="150">
              <template #default="{ row }">
                <a
                  v-if="wikiWriteCount(row)"
                  href="#"
                  class="wiki-cell"
                  :title="row.mindmap_wiki?.title || ''"
                  @click.stop.prevent="openWikiHistory(row)"
                >{{ row.mindmap_wiki?.title || '飞书脑图' }} · {{ wikiWriteCount(row) }} 次</a>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="72" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click.stop="selectRow(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-pagination
          class="settings-table-pager"
          background
          size="small"
          layout="total, sizes, prev, pager, next"
          :total="tableRows.length"
          :page-sizes="TABLE_PAGE_SIZES"
          v-model:page-size="pageSize"
          v-model:current-page="page"
        />
      </section>
    </template>

      <section v-else-if="selectedReq && board === 'req'" class="settings-card qa-detail is-page">
        <div class="ticket-chrome">
        <div class="ticket-back">
          <el-button link type="primary" @click="closeTicket">← 返回需求单</el-button>
        </div>
        <div class="detail-head">
          <div>
            <h3>{{ selectedReq.title }}</h3>
            <p class="muted">
              {{ selectedReq.external_id || '无外部编号' }}
              <template v-if="selectedReq.source_url"> · <a :href="selectedReq.source_url" target="_blank" rel="noreferrer">打开原文</a></template>
              <template v-if="saving"> · 保存中</template>
            </p>
          </div>
          <div class="head-actions">
            <el-button v-if="showTicketEdit && !detailEditing" size="small" @click="detailEditing = true">{{ ticketEditLabel }}</el-button>
            <el-button v-else-if="detailEditing" size="small" type="primary" @click="detailEditing = false">完成修改</el-button>
            <el-button v-if="showScheduleBtn" size="small" @click="scheduleCurrent('req_test')">排测试</el-button>
            <el-button size="small" text type="danger" @click="deleteReq(selectedReq)">删除</el-button>
          </div>
        </div>

        <QaFlowPipeline
          mode="ticket"
          track="req"
          :steps="reqSteps"
          :current-id="selectedReq.gate"
          :selected-id="inspectGateId || selectedReq.gate"
          :env-summaries="envSnap.summaries"
          @select="onReqGateClick"
        />
        <p class="stage-line">
          <strong>{{ inspectReqStep?.label }}</strong>
          <span>{{ inspectReqStep?.hint || gateHint('req', inspectReqStep?.id || selectedReq.gate, wf) }}</span>
          <span v-if="!viewingReqCurrent" class="muted">查看中 · 当前停在「{{ reqStep?.label }}」</span>
        </p>
        <div v-if="workBanner" class="work-banner">
          <div class="work-banner-main">
            <strong>{{ workBanner.title }}</strong>
            <span>{{ workBanner.detail }}</span>
          </div>
          <div v-if="workBanner.progress != null" class="work-banner-bar">
            <div class="work-banner-fill" :style="{ width: `${workBanner.progress}%` }" />
          </div>
          <el-button
            v-if="workBanner.cancellable"
            size="small"
            text
            type="danger"
            @click="cancelTick"
          >取消</el-button>
        </div>
        <p v-else-if="reqAssistArt?.suggest" class="assist-inline">{{ reqAssistArt.suggest }}</p>
        <p v-if="detailEditing" class="edit-banner">正在改这一步的内容，改完点右上角「完成修改」。</p>
        </div>

        <div class="ticket-main">
        <div v-if="viewingReqCurrent && reqKindIs('understand')" class="gate-bar">
          <div>
            <strong>需求评审</strong>
            <span>上面的「确认图谱」只改骨架。评审通过才会进入用例准备，开始写脑图和用例。</span>
          </div>
          <div class="gate-actions">
            <el-button :disabled="workflowBusy" @click="reextract">需求有改动</el-button>
            <el-button type="primary" :disabled="workflowBusy" :loading="workflowBusy" @click="confirmUnderstanding">评审通过，进入用例准备</el-button>
          </div>
        </div>
        <div v-if="detailTab === 'understand'" class="detail-body">
          <div v-if="showJobTabs" class="stage-tabs">
            <button
              v-for="j in inspectJobTabs"
              :key="j.id"
              type="button"
              class="stage-tab"
              :class="{ on: activeJobId === j.id }"
              @click="stageJobId = j.id"
            >
              {{ j.label }}
            </button>
          </div>
          <template v-if="showJobPanel('propose_atlas')">
            <AtlasChangeReview
              v-for="patch in reqPendingPatches"
              :key="patch.id"
              :patch="patch"
              :requirements="requirements"
              :impact-label="reqImpact?.label || ''"
              :reviewing="reviewingPatch"
              @accept="onAcceptPatch"
              @reject="openReject"
            />
            <p v-if="showJobTabs && !reqPendingPatches.length" class="muted">没有待确认的图谱变更。骨架没动时这里是空的。</p>
          </template>
          <template v-if="showJobPanel('analyze_req')">
          <p v-if="showJobTabs && reqPendingPatches.length && activeJobId === 'analyze_req'" class="cover-note">
            还有 {{ reqPendingPatches.length }} 条图谱变更待确认，切到「图谱变更」处理。
          </p>
          <div class="field">
            <label>验收标准</label>
            <ul v-if="!reqEditing && (selectedReq.understanding?.ac || []).length" class="ac-list">
              <li v-for="(line, idx) in (selectedReq.understanding?.ac || [])" :key="idx">{{ line || '—' }}</li>
            </ul>
            <p v-if="!reqEditing && !(selectedReq.understanding?.ac || []).length" class="muted">还没有验收标准</p>
            <template v-else-if="reqEditing">
              <div v-for="(line, idx) in (selectedReq.understanding?.ac || [])" :key="idx" class="ac-row">
                <el-input
                  :model-value="line"
                  size="small"
                  placeholder="可判定的通过条件"
                  @update:model-value="(v) => setAc(idx, v)"
                />
              </div>
              <el-button v-if="reqKindIs('understand')" size="small" text @click="addAc">加一条</el-button>
            </template>
          </div>
          <div class="field">
            <label>影响面</label>
            <p class="muted">
              {{ (selectedReq.understanding?.impact?.platforms || []).join(' / ') || '未识别端' }}
              <template v-if="selectedReq.understanding?.impact?.notes"> · {{ selectedReq.understanding.impact.notes }}</template>
            </p>
          </div>
          <div v-if="hasReqReading" class="field read-recap">
            <label>文档理解</label>
            <p v-for="(row, idx) in reqReading.journeys" :key="`j-${idx}`">入口 {{ journeyLine(row) }}</p>
            <p v-if="reqReading.newFeatures.length">新增 {{ reqReading.newFeatures.map(featureLine).join('；') }}</p>
            <p v-if="reqReading.keepFeatures.length">维持 {{ reqReading.keepFeatures.map(featureLine).join('；') }}</p>
            <p v-if="reqReading.surfaces.length">端 {{ reqReading.surfaces.map(surfaceLine).join('；') }}</p>
            <p v-if="reqReading.exceptions.length">兜底 {{ reqReading.exceptions.map((x) => x.scene || x.need || '').filter(Boolean).join('；') }}</p>
          </div>
          </template>
        </div>

        <div v-else-if="detailTab === 'cases'" class="detail-body cover-body">
          <div v-if="!reachedCover" class="locked-step">
            <strong>还没到用例准备</strong>
            <p>当前停在「{{ reqStep?.label }}」。评审通过后才会写测试脑图和本需求用例。</p>
          </div>
          <template v-else>
            <div v-if="viewingReqCurrent && reqKindIs('cover')" class="gate-bar">
              <div>
                <strong>用例准备</strong>
                <span v-if="workflowBusy">脑图和用例还在写，写完才能进入下一步。</span>
                <span v-else-if="!coverCheck.ok">{{ coverCheck.reason }}</span>
                <span v-else>一个测试点要按正向、异常、边界等情况展开成多条用例；写用例时会反推脑图缺不缺点。条数不必等于测试点数。</span>
              </div>
              <el-button
                type="primary"
                :disabled="!canLeaveCover"
                :loading="workflowBusy"
                @click="enterNextReq"
              >{{ workflowBusy ? '正在写，请等待' : '用例备齐，进入下一步' }}</el-button>
            </div>
            <div v-if="showJobTabs" class="stage-tabs">
              <button
                v-for="j in inspectJobTabs"
                :key="j.id"
                type="button"
                class="stage-tab"
                :class="{ on: activeJobId === j.id }"
                @click="stageJobId = j.id"
              >
                {{ j.label }}
              </button>
            </div>
            <section v-if="hasReqReading && showJobPanel('draft_mindmap')" class="cover-block read-recap">
              <h4>文档理解</h4>
              <p v-for="(row, idx) in reqReading.journeys" :key="`cj-${idx}`">入口 {{ journeyLine(row) }}</p>
              <p v-if="reqReading.newFeatures.length">新增 {{ reqReading.newFeatures.map(featureLine).join('；') }}</p>
              <p v-if="reqReading.keepFeatures.length">维持 {{ reqReading.keepFeatures.map(featureLine).join('；') }}</p>
              <p v-if="reqReading.surfaces.length">端 {{ reqReading.surfaces.map(surfaceLine).join('；') }}</p>
              <p v-if="reqReading.exceptions.length">兜底 {{ reqReading.exceptions.map((x) => x.scene || x.need || '').filter(Boolean).join('；') }}</p>
            </section>
            <section v-if="showJobPanel('draft_mindmap')" class="cover-block">
              <div class="cover-head">
                <h4>测试脑图 · {{ mindPointCount }} 个测试点</h4>
                <div class="cover-head-actions">
                  <el-button size="small" :disabled="!selectedReq || workflowBusy || wikiPublishing" @click="openCoverImport('mindmap')">导入脑图</el-button>
                  <el-button size="small" :disabled="workflowBusy || wikiPublishing" @click="retryCover('draft_mindmap')">重试脑图</el-button>
                  <el-button
                    size="small"
                    type="primary"
                    :loading="wikiPublishing"
                    :disabled="!selectedReq || !mindRows.length || workflowBusy"
                    @click="publishMindmapToWiki"
                  >{{ selectedReq?.mindmap_wiki?.url ? '更新飞书 Wiki' : '写入飞书 Wiki' }}</el-button>
                  <el-button
                    v-if="wikiHistoryCount"
                    size="small"
                    :disabled="wikiPublishing"
                    @click="openWikiHistory()"
                  >写入历史 · {{ wikiHistoryCount }}</el-button>
                </div>
              </div>
              <p v-if="ticking && !mindRows.length" class="muted">正在写脑图…</p>
              <p v-else-if="!mindRows.length" class="muted">还没有脑图。可导入外部文件，或点右上角重试。</p>
              <p v-if="selectedReq?.mindmap_wiki?.url" class="muted">
                已写入飞书：
                <a href="#" @click.prevent="openExternalUrl(selectedReq.mindmap_wiki.url)">{{ selectedReq.mindmap_wiki.title || '打开飞书脑图' }}</a>
              </p>
              <ul v-if="mindRows.length" class="mind-list">
                <li
                  v-for="(row, idx) in mindRows"
                  :key="idx"
                  :class="{ 'is-orphan': row.orphan }"
                  :style="{ paddingLeft: `${row.depth * 16}px` }"
                >
                  <em v-if="row.isPoint">测试点</em>
                  <em v-else-if="row.orphan" class="orphan-tag">已失联</em>
                  {{ row.name }}
                  <span v-if="row.detail" class="muted"> · {{ row.detail }}</span>
                </li>
              </ul>
              <p v-for="(f, i) in mindmapFailures" :key="`mf-${i}`" class="cover-alert">
                ⚠ {{ failureLabel(f) }}：{{ f.detail }}
                <span v-if="f.fallback === 'rule_tree'">（当前显示的是规则兜底树，不是模型写的脑图）</span>
              </p>
              <details v-if="mindHistory.length" class="cover-log">
                <summary>生成记录 · {{ mindHistory.length }}</summary>
                <ol>
                  <li v-for="row in mindHistory" :key="row.id">
                    <strong>{{ coverHistKind(row) }}</strong>
                    {{ formatShortTime(row.at) }}
                    · {{ row.summary || '—' }}
                    <span v-if="row.engine" class="muted"> · {{ row.engine }}</span>
                    <p v-if="row.note && row.kind !== 'import'" class="cover-note">评论：{{ row.note }}</p>
                    <details v-if="historyRows(row).length" class="cover-log-inner">
                      <summary>查看这一版</summary>
                      <ul class="mind-list">
                        <li v-for="(item, idx) in historyRows(row)" :key="idx" :style="{ paddingLeft: `${(item.depth || 0) * 16}px` }">
                          <em v-if="item.isLeaf">测试点</em>
                          {{ item.name }}
                        </li>
                      </ul>
                    </details>
                  </li>
                </ol>
              </details>
            </section>
            <section v-if="showJobPanel('draft_cases')" class="cover-block">
              <div class="cover-head">
                <h4>本需求生成的用例 · {{ draftCaseRows.length }}</h4>
                <el-button size="small" :disabled="!selectedReq || workflowBusy" @click="openCoverImport('cases')">导入用例</el-button>
                <el-button
                  v-if="coverStats.stubbed"
                  size="small"
                  type="primary"
                  :disabled="workflowBusy"
                  @click="rewriteStubCases"
                >补写模板兜底</el-button>
                <el-button size="small" :disabled="workflowBusy" @click="retryCover('draft_cases')">补写缺口</el-button>
              </div>
              <p class="muted">
                真实覆盖 {{ coverStats.real }}/{{ coverStats.total || 0 }} 个测试点。一个点可有多条用例。
                <span v-if="coverStats.waived"> · 本版不测 {{ coverStats.waived }}</span>
              </p>
              <p v-if="coverStats.stubbed" class="cover-alert">
                ⚠ {{ coverStats.stubbed }} 个测试点只有<strong>模板兜底</strong>用例（不是模型写的）。
                <el-button size="small" type="primary" link :disabled="workflowBusy" @click="rewriteStubCases">只补写这些</el-button>
              </p>
              <p v-if="caseAspectGaps.length" class="cover-alert">
                ⚠ {{ caseAspectGaps.length }} 个测试点缺情况：
                <span v-for="(g, i) in caseAspectGaps.slice(0, 6)" :key="g.point_id">
                  {{ i ? '；' : '' }}{{ g.text }}（缺 {{ (g.missing_aspects || []).join('/') }}）
                  <el-button size="small" type="primary" link :disabled="workflowBusy" @click="rewritePointCases(g.point_id)">重写</el-button>
                </span>
                <span v-if="caseAspectGaps.length > 6"> … 共 {{ caseAspectGaps.length }} 个</span>
              </p>
              <ul v-if="caseFailures.length" class="cover-fail-list">
                <li v-for="(f, i) in caseFailures" :key="i">
                  <strong>{{ failureLabel(f) }}</strong>
                  · {{ (f.point_ids || []).length }} 个测试点
                  <span class="muted">{{ f.detail }}</span>
                </li>
              </ul>
              <p v-if="mindmapBackfill.length" class="cover-note">写用例时反推补了 {{ mindmapBackfill.length }} 个脑图测试点。</p>
              <p v-if="ticking && !draftCaseRows.length" class="muted">正在写用例…</p>
              <el-table
                v-else
                class="draft-case-table"
                :data="draftCaseRows"
                border
                stripe
                size="small"
                :row-class-name="({ row }) => (isStubCase(row) ? 'stub-case-row' : '')"
                empty-text="暂无用例"
              >
                <el-table-column type="expand">
                  <template #default="{ row }">
                    <div class="draft-case-expand">
                      <CasePairedEditor
                        :row="row"
                        :editable="!row.locked"
                        @change="(fields) => onDraftCaseChange(row, fields)"
                      />
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="编号" width="120" prop="case_id" />
                <el-table-column label="来源" width="88">
                  <template #default="{ row }">
                    <span :class="{ 'stub-tag': isStubCase(row) }">{{ caseOriginLabel(row) }}</span>
                    <span v-if="row.locked" title="人工锁定，重试不会被覆盖"> 🔒</span>
                  </template>
                </el-table-column>
                <el-table-column label="情况" width="72">
                  <template #default="{ row }">{{ row.aspect || '正向' }}</template>
                </el-table-column>
                <el-table-column label="名称" min-width="160" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.name || row.title || '—' }}</template>
                </el-table-column>
                <el-table-column label="模块" min-width="160" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.module || '—' }}</template>
                </el-table-column>
                <el-table-column label="前置" min-width="180">
                  <template #default="{ row }">
                    <CaseMultilineCell :row="row" raw-key="precondition" :clamp="0" />
                  </template>
                </el-table-column>
                <el-table-column label="步骤" min-width="220">
                  <template #default="{ row }">
                    <CaseAlignedFieldCell :row="row" field="step" :clamp="0" />
                  </template>
                </el-table-column>
                <el-table-column label="预期" min-width="220">
                  <template #default="{ row }">
                    <CaseAlignedFieldCell :row="row" field="expected" :clamp="0" />
                  </template>
                </el-table-column>
                <el-table-column label="" width="72" align="right" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      v-if="!row.locked && (row.point_ids || [])[0]"
                      size="small"
                      type="primary"
                      link
                      :disabled="workflowBusy"
                      @click="rewritePointCases((row.point_ids || [])[0])"
                    >重写</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <details v-if="caseHistory.length" class="cover-log">
                <summary>生成记录 · {{ caseHistory.length }}</summary>
                <ol>
                  <li v-for="row in caseHistory" :key="row.id">
                    <strong>{{ coverHistKind(row) }}</strong>
                    {{ formatShortTime(row.at) }}
                    · {{ row.summary || '—' }}
                    <span v-if="row.engine" class="muted"> · {{ row.engine }}</span>
                    <p v-if="row.note && row.kind !== 'import'" class="cover-note">评论：{{ row.note }}</p>
                    <details v-if="historyRows(row).length" class="cover-log-inner">
                      <summary>查看这一版</summary>
                      <ul class="mind-list">
                        <li v-for="(item, idx) in historyRows(row)" :key="idx">
                          {{ item.case_id || '' }} {{ item.name || item.title || '用例' }}
                        </li>
                      </ul>
                    </details>
                  </li>
                </ol>
              </details>
            </section>
          </template>
        </div>

        <div v-else-if="detailTab === 'run'" class="detail-body has-table">
          <p v-if="reqStepRunDone && reqNext" class="stage-line warn">
            本步任务已结束，要进入「{{ reqNext.label }}」请点下面的按钮，不会自动跳。
          </p>
          <div v-if="reqDispatchFocus || (viewingReqCurrent && reqKindIs('dispatch'))" class="gate-bar">
            <div>
              <strong>{{ inspectReqStep?.label }}</strong>
              <span>这一步才下发真机。排期不在这里管。</span>
            </div>
            <div class="gate-actions">
              <el-button
                v-if="reqDispatchFocus"
                type="primary"
                :disabled="!canDispatchReqStep(reqDispatchFocus)"
                @click="dispatchReqStep(reqDispatchFocus)"
              >{{ dispatchLabel(reqDispatchFocus) }}</el-button>
              <el-button
                v-if="viewingReqCurrent && reqKindIs('dispatch') && reqNext && reqNext.kind !== 'archive'"
                :type="reqNext?.kind === 'human_verdict' ? 'primary' : undefined"
                :disabled="workflowBusy"
                @click="enterNextReq"
              >{{ reqNext?.kind === 'human_verdict' ? '提交验收' : `进入${reqNext?.label || '下一步'}` }}</el-button>
            </div>
          </div>
          <div class="table-pane">
          <el-table :data="inspectReqRuns" border stripe size="small" height="100%" empty-text="这一步还没有下发过">
            <el-table-column label="类型" width="100">
              <template #default="{ row }">{{ RUN_KINDS[row.kind]?.label || row.kind }}</template>
            </el-table-column>
            <el-table-column label="任务" width="108">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="emit('open-task', row.task_id)">{{ shortTaskId(row.task_id) }}</el-button>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="88">
              <template #default="{ row }">
                <el-tag v-if="taskOf(row.task_id)" size="small" :type="statusTagType(taskOf(row.task_id).status, taskOf(row.task_id))">
                  {{ statusLabel(taskOf(row.task_id).status, taskOf(row.task_id)) }}
                </el-tag>
                <span v-else class="muted">已下发</span>
              </template>
            </el-table-column>
            <el-table-column label="进度" min-width="120">
              <template #default="{ row }">{{ taskOf(row.task_id) ? taskCountLabel(taskOf(row.task_id)) : '—' }}</template>
            </el-table-column>
            <el-table-column label="时间" width="108">
              <template #default="{ row }">{{ formatShortTime(row.at) }}</template>
            </el-table-column>
          </el-table>
          </div>
        </div>

        <div v-else-if="detailTab === 'checkpoint'" class="detail-body">
          <p v-if="inspectReqStep?.hint" class="hint">{{ inspectReqStep.hint }}</p>
          <div v-if="viewingReqCurrent && reqKindIs('checkpoint')" class="actions">
            <el-button size="small" type="primary" @click="completeCheckpoint('req')">完成，进入下一步</el-button>
          </div>
        </div>

        <div v-else-if="inspectReqStep?.kind === 'archive'" class="detail-body">
          <p>本需求已结束</p>
        </div>

        <div v-else class="detail-body">
          <div class="metrics compact">
            <div class="metric"><div class="k">建议</div><div class="v">{{ reqReport?.suggest || '—' }}</div></div>
            <div class="metric"><div class="k">通过</div><div class="v ok">{{ reqReport?.passed || 0 }}</div></div>
            <div class="metric"><div class="k">失败</div><div class="v bad">{{ reqReport?.failed || 0 }}</div></div>
            <div class="metric"><div class="k">缺口</div><div class="v warn">{{ reqReport?.coverage?.gaps || 0 }}</div></div>
          </div>
          <ul class="ac-list">
            <li v-for="(a, i) in (reqReport?.ac || [])" :key="i">{{ a }}</li>
          </ul>
          <p v-if="reqReport?.latest_task_id" class="hint">
            依据任务
            <el-button link type="primary" size="small" @click="emit('open-task', reqReport.latest_task_id)">{{ shortTaskId(reqReport.latest_task_id) }}</el-button>
          </p>
          <div v-if="reqFailItems.length" class="field">
            <label>失败分类（草稿）</label>
            <el-table :data="reqFailItems" border stripe size="small">
              <el-table-column label="用例" width="120" prop="case_id" />
              <el-table-column label="分类" width="88" prop="kind" />
              <el-table-column label="标题" min-width="140" prop="title" show-overflow-tooltip />
            </el-table>
          </div>
          <div v-if="reqCanSign" class="gate-bar">
            <div>
              <strong>测试验收</strong>
              <span>结论必须人点，不会自动过。</span>
            </div>
            <div class="gate-actions">
              <el-button type="primary" @click="signOff('pass')">验收通过</el-button>
              <el-button @click="signOff('risk')">带风险验收</el-button>
              <el-button @click="signOff('reject')">退回重测</el-button>
            </div>
          </div>
          <p v-else-if="selectedReq.signoff" class="muted">已{{ selectedReq.signoff.verdict === 'risk' ? '带风险验收' : '验收通过' }} · {{ formatShortTime(selectedReq.signoff.at) }}</p>
          <el-button v-if="reqCanSign && reqRerunIds.length" size="small" @click="dispatchWander('req')">重跑走神 {{ reqRerunIds.length }} 条</el-button>
        </div>
        </div>
      </section>

      <section v-else-if="selectedRel && board === 'rel'" class="settings-card qa-detail is-page">
        <div class="ticket-chrome">
        <div class="ticket-back">
          <el-button link type="primary" @click="closeTicket">← 返回版本单</el-button>
        </div>
        <div class="detail-head">
          <div>
            <h3>{{ selectedRel.title }}</h3>
            <p class="muted">{{ (selectedRel.requirement_ids || []).length }} 条需求 · {{ (selectedRel.case_ids || []).length }} 条回归用例</p>
          </div>
          <div class="head-actions">
            <el-button v-if="showTicketEdit && !detailEditing" size="small" @click="detailEditing = true">{{ ticketEditLabel }}</el-button>
            <el-button v-else-if="detailEditing" size="small" type="primary" @click="detailEditing = false">完成修改</el-button>
            <el-button v-if="showScheduleBtn" size="small" @click="scheduleCurrent('rel_test')">排开测</el-button>
            <el-button size="small" text type="danger" @click="deleteRel(selectedRel)">删除</el-button>
          </div>
        </div>
        <QaFlowPipeline
          mode="ticket"
          track="rel"
          :steps="relSteps"
          :current-id="selectedRel.gate"
          :selected-id="inspectGateId || selectedRel.gate"
          :env-summaries="envSnap.summaries"
          @select="onRelGateClick"
        />
        <p class="stage-line">
          <strong>{{ inspectRelStep?.label }}</strong>
          <span>{{ inspectRelStep?.hint || gateHint('rel', inspectRelStep?.id || selectedRel.gate, wf) }}</span>
          <span v-if="!viewingRelCurrent" class="muted">查看中 · 当前停在「{{ relStep?.label }}」</span>
        </p>
        <p v-if="relAssistArt?.suggest" class="assist-inline">{{ relAssistArt.suggest }}</p>
        </div>

        <div class="ticket-main">
        <div v-if="detailTab === 'scope'" class="detail-body">
          <div class="field">
            <label>本版本需求</label>
            <el-select
              v-if="relEditing"
              :model-value="selectedRel.requirement_ids"
              multiple
              filterable
              collapse-tags
              style="width: 100%"
              @change="(ids) => patchRel({ requirement_ids: ids })"
            >
              <el-option
                v-for="r in joinableReqs"
                :key="r.id"
                :label="reqOptionLabel(r, wf)"
                :value="r.id"
              />
            </el-select>
            <p v-else class="muted">{{ titlesOf(selectedRel.requirement_ids) }}</p>
          </div>
          <div class="field">
            <label>回归用例</label>
            <el-select
              v-if="relEditing"
              :model-value="selectedRel.case_ids"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              style="width: 100%"
              @change="(ids) => patchRel({ case_ids: ids })"
            >
              <el-option v-for="c in caseOptions" :key="c.id" :label="c.label" :value="c.id" />
            </el-select>
            <p v-else class="muted">{{ caseLabelsOf(selectedRel.case_ids) }}</p>
          </div>
          <p v-if="relPickArt?.payload" class="hint">
            建议回归 {{ (relPickArt.payload.pass_ids || []).length }} 条
            <template v-if="(relPickArt.payload.unsigned || []).length">
              · 未验收 {{ relPickArt.payload.unsigned.join('、') }} 的 {{ (relPickArt.payload.risk_ids || []).length }} 条不会自动圈入
            </template>
          </p>
          <div class="actions">
            <el-button
              v-if="relCanEditScope"
              size="small"
              :loading="assisting"
              @click="acceptPassPack"
            >采纳建议回归</el-button>
            <el-button v-if="viewingRelCurrent && relKindIs('scope') && relNext?.kind === 'scope'" size="small" type="primary" @click="lockScope">进入回归范围</el-button>
            <el-button v-if="viewingRelCurrent && relKindIs('scope') && relNext?.kind === 'dispatch'" size="small" type="primary" @click="confirmScope">确认回归范围</el-button>
            <el-button
              v-if="viewingRelCurrent && relKindIs('scope') && relNext && relNext.kind !== 'scope' && relNext.kind !== 'dispatch'"
              size="small"
              type="primary"
              :disabled="workflowBusy"
              @click="enterNextRel"
            >进入{{ relNext.label }}</el-button>
          </div>
        </div>

        <div v-else-if="detailTab === 'run'" class="detail-body has-table">
          <p v-if="relStepRunDone && relNext" class="stage-line warn">
            本步任务已结束，要进入「{{ relNext.label }}」请点下面的按钮，不会自动跳。
          </p>
          <div class="actions">
            <el-button
              v-if="relDispatchFocus"
              size="small"
              type="primary"
              :disabled="!canDispatchRelStep(relDispatchFocus)"
              @click="dispatchRelStep(relDispatchFocus)"
            >{{ dispatchLabel(relDispatchFocus) }}</el-button>
            <el-button
              v-if="viewingRelCurrent && relKindIs('dispatch') && relNext && relNext.kind !== 'archive'"
              size="small"
              :disabled="workflowBusy"
              @click="enterNextRel"
            >{{ relNext?.kind === 'human_verdict' ? '回归结束，进入发版评审' : `进入${relNext?.label || '下一步'}` }}</el-button>
            <el-button v-if="viewingRelCurrent && relKindIs('dispatch') && relNext?.kind === 'archive'" size="small" @click="closeRel">关闭版本</el-button>
          </div>
          <div class="table-pane">
          <el-table :data="inspectRelRuns" border stripe size="small" height="100%" empty-text="这一步还没有下发过">
            <el-table-column label="类型" width="110">
              <template #default="{ row }">{{ RUN_KINDS[row.kind]?.label || row.kind }}</template>
            </el-table-column>
            <el-table-column label="任务" width="108">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="emit('open-task', row.task_id)">{{ shortTaskId(row.task_id) }}</el-button>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="88">
              <template #default="{ row }">
                <el-tag v-if="taskOf(row.task_id)" size="small" :type="statusTagType(taskOf(row.task_id).status, taskOf(row.task_id))">
                  {{ statusLabel(taskOf(row.task_id).status, taskOf(row.task_id)) }}
                </el-tag>
                <span v-else class="muted">已下发</span>
              </template>
            </el-table-column>
            <el-table-column label="进度" min-width="120">
              <template #default="{ row }">{{ taskOf(row.task_id) ? taskCountLabel(taskOf(row.task_id)) : '—' }}</template>
            </el-table-column>
          </el-table>
          </div>
        </div>

        <div v-else-if="detailTab === 'checkpoint'" class="detail-body">
          <p v-if="inspectRelStep?.hint" class="hint">{{ inspectRelStep.hint }}</p>
          <div v-if="viewingRelCurrent && relKindIs('checkpoint')" class="actions">
            <el-button size="small" type="primary" @click="completeCheckpoint('rel')">完成，进入下一步</el-button>
          </div>
        </div>

        <div v-else-if="inspectRelStep?.kind === 'archive'" class="detail-body">
          <p>本版本单已结束</p>
        </div>

        <div v-else class="detail-body">
          <div class="metrics compact">
            <div class="metric"><div class="k">建议</div><div class="v">{{ relReport?.suggest || '—' }}</div></div>
            <div class="metric"><div class="k">失败</div><div class="v bad">{{ relReport?.failed || 0 }}</div></div>
            <div class="metric"><div class="k">未验收</div><div class="v warn">{{ relReport?.unsigned?.length || 0 }}</div></div>
            <div class="metric"><div class="k">回归条数</div><div class="v">{{ relReport?.case_count || 0 }}</div></div>
          </div>
          <p class="muted">锁定需求：{{ (relReport?.locked || []).join('、') || '无' }}</p>
          <p v-if="relReport?.unsigned?.length" class="hint warn">已挂版本但未验收，不能当成发版通过的依据：{{ relReport.unsigned.join('、') }}</p>
          <div v-if="relFailItems.length" class="field">
            <label>失败分类（草稿）</label>
            <el-table :data="relFailItems" border stripe size="small">
              <el-table-column label="用例" width="120" prop="case_id" />
              <el-table-column label="分类" width="88" prop="kind" />
              <el-table-column label="标题" min-width="140" prop="title" show-overflow-tooltip />
            </el-table>
          </div>
          <div v-if="relCanVerdict" class="actions">
            <el-button size="small" type="primary" @click="verdictRel('pass')">发版通过</el-button>
            <el-button size="small" @click="verdictRel('risk')">带风险发版</el-button>
            <el-button size="small" @click="verdictRel('block')">不发版</el-button>
            <el-button v-if="relRerunIds.length" size="small" @click="dispatchWander('rel')">重跑走神 {{ relRerunIds.length }} 条</el-button>
          </div>
          <p v-else-if="selectedRel.verdict" class="muted">
            结论 {{ selectedRel.verdict.verdict }} · {{ formatShortTime(selectedRel.verdict.at) }}
          </p>
        </div>
        </div>
      </section>

    <CoverImportDialog
      v-model="coverImportOpen"
      :app-id="appId"
      :kind="coverImportKind"
      :requirement-id="selectedReq?.id || ''"
      :requirements="requirements"
      @imported="onCoverImported"
    />
    <WikiHistoryDialog
      v-model="wikiHistoryOpen"
      :requirement="wikiHistoryReq"
      :app-id="appId"
      @updated="onWikiHistoryUpdated"
    />
    <el-dialog
      v-model="createOpen"
      :title="creatingRel ? '新建版本' : '新建需求'"
      width="560px"
      class="mo-fit-dialog"
      align-center
      append-to-body
      destroy-on-close
      :close-on-click-modal="!creatingSubmit"
      :close-on-press-escape="!creatingSubmit"
    >
      <el-form v-if="!creatingRel" class="qa-create-form" label-position="top">
        <el-form-item label="需求名称" required>
          <el-input v-model="draft.title" placeholder="例如：相册支持实况图" />
        </el-form-item>
        <el-form-item label="挂到版本">
          <el-select
            v-model="draft.release_id"
            clearable
            filterable
            placeholder="选本需求进哪个版本，可空"
          >
            <el-option v-for="r in releases" :key="r.id" :label="r.title" :value="r.id" />
          </el-select>
          <p v-if="!releases.length" class="hint">暂无数据</p>
        </el-form-item>
        <el-form-item label="外部编号">
          <el-input v-model="draft.external_id" placeholder="外部编号，可空" />
        </el-form-item>
        <el-form-item label="原文链接">
          <el-input v-model="draft.source_url" placeholder="https://" />
        </el-form-item>
        <el-form-item label="需求正文">
          <el-input
            v-model="draft.source_text"
            type="textarea"
            :rows="3"
            placeholder="粘贴需求描述。会列出验收标准、影响面、测试点。"
          />
        </el-form-item>
        <el-form-item label="关联用例（可选）">
          <el-select v-model="draft.case_ids" multiple filterable collapse-tags collapse-tags-tooltip placeholder="可空；可按编号勾选用例库">
            <el-option v-for="c in caseOptions" :key="c.id" :label="c.label" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-form v-else class="qa-create-form" label-position="top">
        <el-form-item label="版本名称" required>
          <el-input v-model="draft.title" placeholder="例如：1.4.0 预发" />
        </el-form-item>
        <el-form-item label="挂入需求">
          <el-select v-model="draft.requirement_ids" multiple filterable placeholder="可空，之后再挂">
            <el-option v-for="r in joinableReqs" :key="r.id" :label="reqOptionLabel(r, wf)" :value="r.id" />
          </el-select>
        </el-form-item>
        <div class="time-row">
          <el-form-item label="计划开测">
            <el-date-picker v-model="draft.test_start" type="date" value-format="YYYY-MM-DD" format="MM-DD" placeholder="开始测试" />
          </el-form-item>
          <el-form-item label="结束">
            <el-date-picker v-model="draft.test_end" type="date" value-format="YYYY-MM-DD" format="MM-DD" placeholder="开测结束" />
          </el-form-item>
        </div>
        <el-form-item label="上线">
          <el-date-picker v-model="draft.online_at" type="date" value-format="YYYY-MM-DD" format="MM-DD" placeholder="上线" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="creatingSubmit" @click="createOpen = false">取消</el-button>
        <el-button type="primary" :loading="creatingSubmit" :disabled="creatingSubmit" @click="submitCreate">
          {{ creatingRel ? '创建版本' : '创建需求' }}
        </el-button>
      </template>
    </el-dialog>
    <el-dialog
      v-model="rejectOpen"
      title="驳回并重新分析"
      width="520px"
      class="mo-fit-dialog"
      align-center
      append-to-body
      destroy-on-close
    >
      <el-input
        v-model="rejectNote"
        type="textarea"
        :rows="5"
        placeholder="驳回原因"
      />
      <template #footer>
        <el-button @click="rejectOpen = false">取消</el-button>
        <el-button type="primary" :loading="reviewingPatch" @click="submitReject">驳回并重跑</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.qa-process-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  box-sizing: border-box;
}
.qa-process-panel .settings-page-header,
.qa-process-panel .settings-tabbar,
.qa-process-panel .qa-order-card { flex-shrink: 0; }
.qa-order-card { margin: 0 0 8px; }
.qa-process-panel .settings-page-header { margin-bottom: 8px; }
.qa-process-panel .settings-tabbar { margin-bottom: 12px; flex-wrap: wrap; }
.qa-process-panel .job-tabs { margin-bottom: 0; }
.qa-process-panel :deep(.settings-tab) { min-width: 148px; padding: 10px 14px 12px; }
.qa-process-panel > :deep(.sch-board) {
  flex: 1;
  min-height: 0;
}
.qa-process-panel > :deep(.qa-flow-editor) {
  flex: 1;
  min-height: 0;
}
.qa-process-panel .qa-list {
  flex: 1;
  min-height: 0;
  height: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px 14px 14px;
  box-sizing: border-box;
}
.qa-detail.is-page {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ticket-chrome {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 14px;
  margin: -12px -14px 0;
  background: #f3f4f8;
  border-bottom: 1px solid #e5e7eb;
}
.ticket-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 16px 4px 12px;
}
.work-banner,
.edit-banner,
.gate-bar,
.locked-step {
  border-radius: 12px;
  padding: 12px 14px;
}
.work-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  background: #eef2ff;
  color: #3730a3;
  font-size: 13px;
}
.work-banner-main {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: baseline;
  flex: 1 1 auto;
  min-width: 0;
}
.work-banner-bar {
  flex: 1 1 120px;
  max-width: 220px;
  height: 6px;
  border-radius: 999px;
  background: #c7d2fe;
  overflow: hidden;
}
.work-banner-fill {
  height: 100%;
  background: #4f46e5;
  border-radius: inherit;
  transition: width 0.25s ease;
}
.edit-banner {
  margin: 0;
  background: #fffbeb;
  color: #92400e;
  font-size: 13px;
}
.gate-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 16px;
  background: #111827;
  color: #f9fafb;
}
.gate-bar strong { display: block; font-size: 15px; margin-bottom: 4px; }
.gate-bar span { font-size: 12px; color: #d1d5db; }
.gate-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.locked-step {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  color: #475569;
}
.locked-step strong { display: block; margin-bottom: 6px; color: #111827; }
.cover-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.job-tabs { margin: 0; flex-shrink: 0; }
.stage-tabs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  padding: 2px;
  border-bottom: 1px solid #e5e7eb;
}
.stage-tab {
  border: none;
  background: transparent;
  padding: 8px 16px;
  font-size: 15px;
  font-weight: 650;
  color: #6b7280;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
}
.stage-tab:hover { color: #111827; }
.stage-tab.on {
  color: #4f46e5;
  box-shadow: inset 0 -2px 0 #4f46e5;
}
.cover-block h4 {
  margin: 0;
  font-size: 14px;
}
.cover-block :deep(.draft-case-table td.el-table__cell) {
  vertical-align: top;
  height: auto;
}
.cover-block :deep(.draft-case-table .cell) {
  overflow: visible;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}
.draft-case-expand {
  padding: 8px 12px 12px;
}
.cover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 8px;
}
.cover-head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}
.cover-log {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
}
.cover-log summary {
  cursor: pointer;
  font-weight: 600;
  color: #334155;
}
.cover-log ol {
  margin: 8px 0 0;
  padding-left: 18px;
}
.cover-log li + li {
  margin-top: 8px;
}
.cover-log-inner {
  margin-top: 6px;
}
.cover-note {
  margin: 4px 0 0;
  color: #92400e;
}
/* 生成失败 / 模板兜底：必须显眼。以前这些是静默的，界面覆盖率照样满格。 */
.cover-alert {
  margin: 6px 0 0;
  padding: 6px 8px;
  border-radius: 4px;
  background: #fef2f2;
  border-left: 3px solid #dc2626;
  color: #991b1b;
  font-size: 13px;
  line-height: 1.6;
}
.cover-fail-list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #991b1b;
}
.cover-fail-list .muted {
  color: #9ca3af;
}
.stub-tag {
  color: #dc2626;
  font-weight: 600;
}
:deep(.stub-case-row) {
  background: #fff7ed !important;
}
.read-recap p {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.55;
  color: #334155;
}
.read-recap p:last-child { margin-bottom: 0; }
.mind-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  line-height: 1.7;
}
.mind-list em {
  margin-right: 6px;
  color: #6366f1;
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
}
.mind-list li.is-orphan {
  color: #b45309;
}
.mind-list .orphan-tag {
  color: #b45309;
  background: #fff7ed;
  border-radius: 4px;
  padding: 0 4px;
}
.stage-line {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: baseline;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.45;
}
.stage-line strong { color: #111827; }
.stage-line.warn { color: #92400e; }
.assist-inline {
  margin: 0;
  color: #4338ca;
  font-size: 13px;
  line-height: 1.45;
}
.linked-work {
  flex-shrink: 0;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #e5e7eb;
}
.linked-work h4 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}
.slot-lines {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  color: #4b5563;
  font-size: 13px;
}
.ticket-back { margin-bottom: 0; }
.table-pane {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.detail-body.has-table {
  overflow: hidden;
}
.detail-body.has-table .metrics {
  flex-shrink: 0;
}
.detail-body .actions {
  flex-shrink: 0;
  padding-top: 4px;
  background: #fff;
}
.step-jobs-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.step-jobs-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #374151;
}
.step-jobs-list li strong { color: #111827; }
.qa-list .gate-filters {
  max-width: none;
  width: 100%;
  margin-bottom: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.table-wrap { flex: 1 1 0; min-height: 0; overflow: hidden; }
.qa-list :deep(.el-pagination) {
  margin: 0;
  flex-shrink: 0;
  width: 100%;
}
.qa-detail {
  min-height: 0;
  height: auto;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}
.col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.col-head h3 { margin: 0; font-size: 14px; font-weight: 600; flex: 1; color: #111827; }
.col-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; align-items: center; }
.gate-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.time-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
.time-row :deep(.el-form-item) { margin-bottom: 0; }
.time-row :deep(.el-date-editor),
.qa-create-form :deep(.el-date-editor) {
  width: 100%;
  max-width: 100%;
}
.qa-create-form :deep(.el-form-item) { margin-bottom: 14px; }
.qa-create-form :deep(.el-form-item:last-child) { margin-bottom: 0; }
.qa-create-form :deep(.el-select) { width: 100%; }
.filter-item { width: 132px; }
.qa-list :deep(.el-table .el-table__row) { cursor: pointer; }
.qa-list :deep(.el-table .is-current) { background: #eef2ff !important; }
.task-name { font-weight: 600; color: #111827; }
.wiki-cell {
  display: block;
  font-size: 12px;
  color: var(--el-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.detail-head h3 { margin: 0 0 4px; font-size: 16px; }
.head-actions { display: flex; gap: 8px; flex-shrink: 0; }
.muted { margin: 0; color: #6b7280; font-size: 12px; }
.hint { margin: 0 0 8px; font-size: 12px; color: #6b7280; line-height: 1.5; }
.hint.warn { color: #b45309; }
.gate-row { display: flex; flex-wrap: wrap; gap: 6px; }
.gate-explain { margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5; }
.step-jobs {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.step-jobs ul {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.step-jobs li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #374151;
}
.step-jobs li strong { color: #111827; }
.assist-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 1px solid #e3e8f0;
  background: #f8fafc;
  border-radius: 12px;
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
}
.assist-bar.is-stale { background: #fffbeb; border-color: #fde68a; }
.assist-suggest { flex: 1; min-width: 160px; }
.suggest-ids { font-size: 12px; color: #4338ca; }
.gate-chip {
  border: 1px solid #e3e8f0;
  background: #fff;
  color: #6b7280;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.gate-chip.done { color: #6b7280; background: #f8fafc; }
.gate-chip.next { border-color: #c7d2fe; color: #4338ca; background: #fff; }
.gate-chip.on {
  border-color: #c7d2fe;
  background: #eef2ff;
  color: #4338ca;
}
.qa-seg {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: #eef2ff;
  width: fit-content;
  max-width: 100%;
  flex-shrink: 0;
}
.qa-seg.gate-filters {
  width: 100%;
}
.qa-seg button {
  border: none;
  background: transparent;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}
.qa-seg button.active {
  background: #fff;
  color: #4338ca;
}
.detail-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.ac-row { margin-bottom: 6px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.metrics.compact {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.metric {
  padding: 10px 12px;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
}
.metric .k { font-size: 12px; color: #6b7280; }
.metric .v { margin-top: 2px; font-size: 18px; font-weight: 700; color: #111827; }
.metric .v.ok { color: #059669; }
.metric .v.bad { color: #dc2626; }
.metric .v.warn { color: #d97706; }
.ac-list { margin: 0; padding-left: 18px; color: #374151; font-size: 13px; }
</style>
