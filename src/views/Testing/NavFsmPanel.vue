<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  clearNavCaptures,
  getNavMetrics,
  getNavScreenAtlas,
} from '@/api/navFsm'
import { listIntelLinks } from '@/api/appIntel'
import { buildIntelOverlay } from '@/utils/appIntelOverlay'
import { cancelTestingTask, getTestingTask, runAppExplore } from '@/api/caseRunner'
import { useNavFsm } from '@/composables/useNavFsm'
import NavRelationGraph from '@/views/Testing/NavRelationGraph.vue'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  appId: { type: String, required: true },
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  appName: { type: String, default: '' },
  /** arch | config */
  section: { type: String, default: 'arch' },
})

const appIdRef = computed(() => props.appId)
const {
  loading,
  saving,
  doc,
  runtimeReady,
  runtimeReason,
  runtimeReasonHuman,
  hasConfig,
  load,
  ensureBootstrap,
  save,
} = useNavFsm(appIdRef)

const bootstrapping = ref(false)
const liveLoading = ref(false)
const liveGraphMeta = ref(null)
const trajectory = ref(null)
const archViewTab = ref('nav')
const setupReady = ref(false)
const captureReport = ref(null)
const metrics = ref(null)
const metricsLoading = ref(false)
const graphDoc = ref(null)
const graphReloadKey = ref(0)
const atlasTabPrefsHintShown = ref(false)
const intelOverlay = ref(null)
const intelLinks = ref([])

const runtimeTag = computed(() => {
  if (captureTurns.value > 0 && liveGraphMeta.value?.synced) return { type: 'success', text: '已同步' }
  if (captureTurns.value > 0) return { type: 'warning', text: '采集中' }
  if (hasConfig.value) return { type: 'success', text: '已就绪' }
  return { type: 'info', text: '无采集' }
})

const statusMessage = computed(() => {
  if (runtimeReady.value && publishedSummary.value) {
    const mode = publishedDoc.value?.meta?.synthesis_mode || ''
    const extra = mode === 'tab_bar' || mode === 'tab_bar_layered' ? '（Tab + 子页面）' : ''
    return `导航已发布${extra}：${publishedSummary.value.stateCount} 个页面、${publishedSummary.value.edgeCount} 条跳转。`
  }
  if (captureReport.value?.runtime_reason_human) return captureReport.value.runtime_reason_human
  if (runtimeReasonHuman.value) return runtimeReasonHuman.value
  if (!hasConfig.value) return '跑一条用例后，回来点「一键发布」即可启用导航。'
  return ''
})

const publishedDoc = computed(() => {
  if (!doc.value || !runtimeReady.value) return null
  const { runtime_ready, runtime_reason, runtime_reason_human, ...body } = doc.value
  return body
})

const frameworkKindLabel = (kind) => String(kind || '').trim().replace(/_/g, '·')

const landmarkFromState = (st) => {
  if (st?.entry) {
    const tab = (st.identify?.required || []).find((b) => b?.signal === 'tab_bar')?.match?.selected
    if (tab) return `入口 · ${tab}`
  }
  const identify = st.identify || {}
  const blocks = Array.isArray(identify.required) ? identify.required : []
  const tab = blocks.find((b) => b?.signal === 'tab_bar')?.match?.selected
  const fw = blocks.find((b) => b?.signal === 'layout_framework')?.match
  const kind = String(fw?.kind || '')
  const pageName = frameworkKindLabel(kind)
  if (tab && pageName) return `${tab} · ${pageName}`
  if (tab) return tab
  return String(st.id || '?')
}

const atlasMode = computed(() => Boolean(graphDoc.value?.meta?.screen_atlas))

const liveSummary = computed(() => {
  const d = graphDoc.value
  if (!d) return null
  const states = d.states || []
  const navEdges = (d.edges || []).filter((e) => (e.kind || 'nav') === 'nav')
  const entries = states.filter((st) => st.entry)
  const subPages = states.filter((st) => !st.entry && st.kind !== 'dialog')
  const meta = d.meta || {}
  return {
    stateCount: states.length,
    entryCount: atlasMode.value ? 0 : entries.length,
    subPageCount: atlasMode.value ? 0 : subPages.length,
    edgeCount: navEdges.length,
    captureTurns: Number(captureTurns.value || meta.capture_turns || 0),
    updatedAt: Number(liveGraphMeta.value?.updated_at || d.updated_at || 0),
    trajSteps: Number(trajectory.value?.step_count || 0),
    localizeStates: Number(trajectory.value?.unique_states || 0),
    atlasMode: atlasMode.value,
  }
})

const formatTime = (ts) => {
  if (!ts) return '—'
  try {
    return new Date(ts * 1000).toLocaleString()
  } catch (_) {
    return '—'
  }
}

const atlasPayloadStamp = (payload) => {
  if (!payload?.doc) return ''
  const u = Number(payload.updated_at || payload.doc?.updated_at || 0)
  const sc = Number(payload.screen_count || 0)
  const st = (payload.doc.states || []).length
  const ed = (payload.doc.edges || []).length
  return `${u}|${sc}|${st}|${ed}`
}

const applyAtlas = async (payload, { forceRemount = false } = {}) => {
  if (!payload?.doc) return
  const stamp = atlasPayloadStamp(payload)
  const prevStamp = liveGraphMeta.value?.stamp || ''
  const payloadStateCount = (payload.doc.states || []).length
  const graphStateCount = (graphDoc.value?.states || []).length
  const atlasEmpty = Boolean(payload.doc?.meta?.screen_atlas) && payloadStateCount === 0
  const docUnchanged =
    stamp &&
    stamp === prevStamp &&
    graphDoc.value &&
    graphStateCount === payloadStateCount &&
    !atlasEmpty

  if (!docUnchanged) {
    graphDoc.value = { ...payload.doc }
    trajectory.value = null
  }

  liveGraphMeta.value = {
    synced: false,
    source: payload.source || 'screen_atlas',
    updated_at: payload.updated_at || 0,
    publish_error: '',
    screen_count: Number(payload.screen_count || 0),
    stamp,
  }
  const cap = payload.capture || {}
  if (cap.turns || cap.turns_app) {
    captureReport.value = {
      ...(captureReport.value || {}),
      turns_captured: Number(cap.turns_app || cap.turns || 0),
      turns_system_skipped: Number(cap.turns_system_skipped || 0),
      sessions: Number(cap.sessions || 0),
      explore_turns: Number(cap.explore_turns || 0),
    }
  }
  if (!docUnchanged || forceRemount) {
    graphReloadKey.value += 1
    await loadIntelOverlay()
  }
}

const loadScreenAtlas = async (quiet = false) => {
  if (!quiet) liveLoading.value = true
  try {
    const res = await getNavScreenAtlas(props.appId, {
      project_id: props.projectId || undefined,
    })
    const payload = res?.data || null
    await applyAtlas(payload, { forceRemount: !quiet })
    const suggested = payload?.doc?.meta?.suggested_tab_bar_prefs
    if (!quiet && suggested?.labels?.length && !atlasTabPrefsHintShown.value) {
      atlasTabPrefsHintShown.value = true
      ElMessage.warning({
        message: `底栏 Tab 未写全，请在 NavFSM meta 保存 tab_bar_prefs.labels：${suggested.labels.join(' / ')}`,
        duration: 8000,
      })
    }
  } catch (e) {
    graphDoc.value =
      props.section === 'arch'
        ? {
            ...emptyGraphDoc(),
            meta: { screen_atlas: true, atlas_layout: 'empty', capture_turns: 0 },
          }
        : emptyGraphDoc()
    graphReloadKey.value += 1
    if (!quiet) {
      ElMessage.error(e?.response?.data?.detail || e?.message || '加载屏面图谱失败')
    }
  } finally {
    liveLoading.value = false
  }
}

const exploring = ref(false)
const stoppingExplore = ref(false)
const exploreRunId = ref('')
const exploreLive = ref(false)
let explorePollTimer = null

const syncExploreStatus = async () => {
  if (!exploreRunId.value) {
    exploreLive.value = false
    return
  }
  try {
    const res = await getTestingTask(exploreRunId.value)
    const task = res?.data || {}
    const st = String(task.status || '').toLowerCase()
    const wasLive = exploreLive.value
    exploreLive.value = st === 'running' || st === 'queued'
    if (exploreLive.value && props.section === 'arch') {
      await loadScreenAtlas(true)
    } else if (wasLive && !exploreLive.value && props.section === 'arch') {
      await loadScreenAtlas(true)
    }
    if (!exploreLive.value) exploreRunId.value = ''
  } catch {
    exploreLive.value = false
  }
}

const startExplorePoll = () => {
  if (explorePollTimer) return
  explorePollTimer = window.setInterval(() => { syncExploreStatus() }, 4000)
}

const stopExplorePoll = () => {
  if (!explorePollTimer) return
  window.clearInterval(explorePollTimer)
  explorePollTimer = null
}

const onStartExplore = async () => {
  exploring.value = true
  try {
    const res = await runAppExplore({
      app_id: props.appId,
      max_steps: 80,
      max_idle_steps: 15,
      async_exec: true,
    })
    const task = res?.data || {}
    exploreRunId.value = String(task.run_id || task.task_id || '')
    exploreLive.value = String(task.status || '').toLowerCase() === 'running'
    startExplorePoll()
    ElMessage.success('应用探索已启动，采集将自动更新图谱')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '发起探索失败')
  } finally {
    exploring.value = false
  }
}

const onStopExplore = async () => {
  if (!exploreRunId.value) return
  stoppingExplore.value = true
  try {
    await cancelTestingTask(exploreRunId.value)
    exploreLive.value = false
    exploreRunId.value = ''
    ElMessage.success('探索已停止')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '停止探索失败')
  } finally {
    stoppingExplore.value = false
  }
}

const clearingCaptures = ref(false)

const onClearCaptures = async () => {
  try {
    await ElMessageBox.confirm(
      '将删除全部被动采集与已发布导航配置，不可恢复。清空后需重新跑用例。',
      '清空采集',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  clearingCaptures.value = true
  try {
    const res = await clearNavCaptures(props.appId, { also_config: true })
    const n = Number(res?.data?.deleted_turns || 0)
    graphDoc.value = null
    trajectory.value = null
    liveGraphMeta.value = null
    captureReport.value = null
    graphReloadKey.value += 1
    await load()
    if (props.section === 'arch') {
      await loadScreenAtlas(true)
    }
    ElMessage.success(n ? `已清空 ${n} 步采集` : '已清空')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '清空失败')
  } finally {
    clearingCaptures.value = false
  }
}

const captureTurns = computed(() => captureReport.value?.turns_captured ?? 0)
const captureSessionsCount = computed(() => captureReport.value?.sessions ?? 0)

const emptyGraphDoc = () => ({
  app_id: props.appId,
  project_id: props.projectId,
  version: 'v1',
  meta: {},
  test_data: {},
  states: [],
  edges: [],
})

const loadIntelOverlay = async () => {
  if (!props.appId) {
    intelOverlay.value = null
    return
  }
  try {
    const res = await listIntelLinks(props.appId)
    intelLinks.value = res?.data?.items || []
  } catch {
    intelLinks.value = []
  }
  intelOverlay.value = buildIntelOverlay(graphDoc.value || doc.value, intelLinks.value)
}

const syncGraphFromDoc = async () => {
  if (!doc.value) {
    graphDoc.value = emptyGraphDoc()
    graphReloadKey.value += 1
    await loadIntelOverlay()
    return
  }
  const { runtime_ready, runtime_reason, runtime_reason_human, ...body } = doc.value
  graphDoc.value = { ...body }
  graphReloadKey.value += 1
  await loadIntelOverlay()
}

const onGraphDocUpdate = (nextDoc) => {
  graphDoc.value = nextDoc
  intelOverlay.value = buildIntelOverlay(nextDoc, intelLinks.value)
}

const syncManualEdgesMeta = (body) => {
  const manual = (body.edges || []).filter((e) => e?.meta?.manual)
  if (!manual.length) return body
  return {
    ...body,
    meta: { ...(body.meta || {}), atlas_manual_edges: manual },
  }
}

const onSaveGraphDoc = async () => {
  if (!graphDoc.value) return
  let body = { ...graphDoc.value }
  if (props.projectId && !body.project_id) body.project_id = props.projectId
  body = syncManualEdgesMeta(body)
  try {
    await save(body)
    ElMessage.success('导航图已保存')
    await loadScreenAtlas(true)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  }
}

const onSaveArchDoc = async (nextDoc) => {
  if (!nextDoc) return
  let body = syncManualEdgesMeta({ ...nextDoc })
  if (props.projectId && !body.project_id) body.project_id = props.projectId
  graphDoc.value = body
  try {
    await save(body)
    ElMessage.success('架构已保存')
    await loadScreenAtlas(true)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  }
}

const tryAutoSetup = async (quiet = false) => {
  bootstrapping.value = true
  try {
    await load()
    if (hasConfig.value) {
      if (props.section !== 'arch') {
        await syncGraphFromDoc()
      }
      setupReady.value = true
      return
    }

    // 架构页只展示 screen-atlas；勿把 NavFSM 四页模板草稿画到画布上
    const boot = await ensureBootstrap(props.projectId)
    if (props.section !== 'arch' && boot.doc) {
      graphDoc.value = { ...boot.doc }
      graphReloadKey.value += 1
      await loadIntelOverlay()
    }

    setupReady.value = true
    if (!quiet && boot.status === 'created') {
      ElMessage.success('已为当前应用生成导航草稿')
    }
  } catch (e) {
    setupReady.value = false
    if (!quiet) {
      ElMessage.error(e?.response?.data?.detail || e?.message || '初始化失败，请确认 Nexus 已启动且含 NavFSM')
    }
  } finally {
    bootstrapping.value = false
  }
}

const loadMetrics = async () => {
  metricsLoading.value = true
  try {
    const mRes = await getNavMetrics(props.appId)
    metrics.value = mRes?.data || null
  } catch (e) {
    metrics.value = null
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载指标失败')
  } finally {
    metricsLoading.value = false
  }
}

watch(
  () => props.section,
  () => {
    loadScreenAtlas(true)
  },
  { immediate: true },
)

onMounted(async () => {
  if (props.section === 'arch') {
    void tryAutoSetup(true)
    return
  }
  await tryAutoSetup(true)
  await loadScreenAtlas(true)
})

onUnmounted(() => {
  stopExplorePoll()
})
</script>

<template>
  <div class="nav-fsm-panel settings-page is-fill">
    <section v-if="!hasConfig && !setupReady" class="onboard-banner">
      <div class="onboard-main">
        <strong>首次使用</strong>
        <p>点右侧初始化后，去跑一条手动用例即可开始。</p>
      </div>
      <el-button type="primary" size="small" :loading="bootstrapping" @click="tryAutoSetup(false)">
        初始化
      </el-button>
    </section>

    <div v-if="section === 'arch'" class="settings-fill-body arch-layout">
      <section class="settings-card published-card arch-main">
        <div class="published-toolbar">
          <div class="published-meta">
            <el-tag :type="runtimeTag.type" size="small" effect="plain">{{ runtimeTag.text }}</el-tag>
            <span v-if="liveSummary" class="published-stats muted">
              <template v-if="liveSummary.atlasMode">
                {{ liveSummary.stateCount }} 屏 · {{ liveSummary.edgeCount }} 转移
                · {{ captureTurns }} 步采集 · {{ formatTime(liveSummary.updatedAt) }}
              </template>
              <template v-else>
                {{ liveSummary.stateCount }} 页 · {{ liveSummary.entryCount }} Tab · {{ liveSummary.subPageCount }} 子页
                · {{ liveSummary.edgeCount }} 边 · {{ captureTurns }} 步采集 · {{ formatTime(liveSummary.updatedAt) }}
              </template>
            </span>
          </div>
          <div class="published-actions">
            <el-button
              v-if="exploreLive"
              size="small"
              type="warning"
              :loading="stoppingExplore"
              @click="onStopExplore"
            >
              停止探索
            </el-button>
            <el-button
              v-else
              size="small"
              type="primary"
              :loading="exploring"
              @click="onStartExplore"
            >
              发起探索
            </el-button>
            <el-button size="small" type="danger" plain :loading="clearingCaptures" @click="onClearCaptures">
              清空采集
            </el-button>
            <el-button size="small" :loading="liveLoading" @click="loadScreenAtlas()">刷新</el-button>
          </div>
        </div>
        <div class="graph-view-tabs">
          <button type="button" class="gv-tab" :class="{ active: archViewTab === 'structure' }" @click="archViewTab = 'structure'">结构图</button>
          <button type="button" class="gv-tab" :class="{ active: archViewTab === 'nav' }" @click="archViewTab = 'nav'">跳转图</button>
          <span class="intel-legend muted">
            <span class="il wiki">知</span> wiki 挂接
            <span class="il doc">文</span> 文档溯源
            <span class="il gap">缺 wiki</span> 待补
          </span>
        </div>
        <div class="settings-preview-panel published-graph-wrap">
          <p v-if="graphDoc && !(graphDoc.states || []).length" class="muted empty-hint">
            暂无屏面采集。跑一条用例或点「发起探索」后，这里会按采集生成架构图。
          </p>
          <NavRelationGraph
            v-else-if="graphDoc"
            :key="`live-${graphReloadKey}-${archViewTab}`"
            :doc="graphDoc"
            :app-id="appId"
            :app-name="appName"
            :project-id="projectId"
            :arch-view="archViewTab"
            :intel-overlay="intelOverlay"
            variant="arch"
            class="published-graph"
            @update:doc="onGraphDocUpdate"
            @save-doc="onSaveArchDoc"
          />
          <p v-else class="muted empty-hint">暂无</p>
        </div>
      </section>
    </div>

  </div>
</template>

<style scoped>
.nav-fsm-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
  padding: 0 4px 8px;
}

.nav-fsm-panel .settings-fill-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.nav-sub-tabs {
  flex-shrink: 0;
}

.arch-layout,
.audit-layout {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.arch-main,
.audit-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.arch-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--mo-muted, #64748b);
}

.logic-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  margin-bottom: 8px;
}

.logic-legend .lg {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 4px;
  vertical-align: -1px;
}

.logic-legend .lg-tab { background: #7c3aed; }
.logic-legend .lg-enter { background: #059669; }
.logic-legend .lg-back { background: #ea580c; }
.logic-legend .lg-nav { background: #64748b; }

.audit-table {
  flex: 1;
  min-height: 240px;
}

.review-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 10px;
  min-height: 0;
}

.review-main {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.review-side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  max-height: 100%;
}

.side-table {
  flex: 1;
  min-height: 120px;
  max-height: 280px;
}

.graph-view-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.intel-legend {
  margin-left: auto;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.intel-legend .il {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  margin-right: 2px;
}

.intel-legend .il.wiki {
  background: #fef3c7;
  color: #b45309;
}

.intel-legend .il.doc {
  background: #dbeafe;
  color: #1d4ed8;
}

.intel-legend .il.gap {
  background: #fee2e2;
  color: #b91c1c;
}

.gv-tab {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}

.gv-tab.active {
  border-color: #6366f1;
  color: #4338ca;
  background: #eef2ff;
}

.trajectory-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  background: #fafafa;
}

.compact-calib .calib-list {
  max-height: 120px;
}

.review-card {
  gap: 8px;
}

.published-card {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
}

.published-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.published-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.published-stats {
  font-size: 12px;
}

.published-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.compact-warn {
  margin: 0;
  flex-shrink: 0;
}

.published-graph-wrap {
  flex: 1;
  min-height: 0;
  max-height: none !important;
}

.published-graph-wrap :deep(.nav-graph-editor.is-preview) {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.published-graph-wrap :deep(.nav-graph-editor.is-preview .graph-canvas-wrap) {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.metrics-inline {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-grid div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--settings-border);
  border-radius: 8px;
}

.landmark-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.landmark-chip {
  padding: 2px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  font-size: 12px;
}

.mesh-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.tab-hint {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 400;
  color: var(--settings-muted);
}

.settings-tab.active .tab-hint {
  color: #475569;
}

.preview-link-hint {
  margin: 8px 0 0;
}

.advanced-body {
  min-height: 0;
}

.advanced-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.advanced-head p {
  margin: 4px 0 0;
  font-size: 12px;
}

.advanced-toolbar {
  margin-bottom: 0;
}

.template-warn {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
}

.mono-sm {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.empty-hint {
  padding: 24px 8px;
  text-align: center;
}

.graph-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 10px 12px;
  gap: 8px;
}

.advanced-body .graph-card :deep(.nav-graph-editor) {
  flex: 1;
  min-height: 0;
}

.graph-card :deep(.nav-graph-editor) {
  flex: 1;
  min-height: 200px;
}

.metrics-grid.compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 8px;
}

.onboard-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
}

.onboard-main {
  flex: 1;
  min-width: 240px;
}

.onboard-main p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: #334155;
}

.onboard-ok {
  color: #166534 !important;
}

.head-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.status-banner {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #fde68a;
  background: #fffbeb;
}

.status-banner.is-ok {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.status-banner p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #334155;
}

.steps-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.step {
  padding: 10px 12px;
  border: 1px solid var(--settings-border);
  border-radius: 10px;
  background: #fff;
}

.step.done {
  border-color: #86efac;
  background: #f0fdf4;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
}

.step.done .step-num {
  background: #22c55e;
  color: #fff;
}

.step p {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--settings-muted);
}

.review-toolbar {
  margin-bottom: 6px;
}

.review-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
}

.sub-tabbar {
  margin-top: -4px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.json-editor :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.hint, .muted {
  font-size: 13px;
  color: var(--settings-muted);
  line-height: 1.5;
}

.warn {
  color: #b45309;
  font-size: 13px;
}

.err {
  color: #b91c1c;
  font-size: 13px;
}

.pending-list {
  margin: 0 0 8px;
  padding-left: 18px;
  font-size: 12px;
  color: var(--settings-muted);
}

.calib-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.calib-field {
  width: 200px;
}

.calib-field.wide {
  flex: 1;
  min-width: 160px;
}

.calib-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 12px;
  min-height: 280px;
}

.calib-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  border: 1px solid var(--settings-border);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
  background: #fff;
  cursor: pointer;
  font: inherit;
}

.calib-item.active {
  border-color: var(--el-color-primary);
  background: #f0f9ff;
}

.calib-item span {
  font-size: 12px;
  color: var(--settings-muted);
}

.mono, .step-preview {
  font-size: 11px;
  background: #f8fafc;
  border: 1px solid var(--settings-border);
  border-radius: 8px;
  padding: 10px;
  overflow: auto;
  max-height: 200px;
}

.step-preview {
  margin-top: 8px;
  max-height: 240px;
  white-space: pre-wrap;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.metrics-grid div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--settings-border);
  border-radius: 8px;
}

.playbook-form {
  max-width: 640px;
  margin-bottom: 12px;
}

.ghost-pill {
  margin: 0 6px 6px 0;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--settings-border);
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}

@media (max-width: 900px) {
  .calib-layout {
    grid-template-columns: 1fr;
  }

  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
