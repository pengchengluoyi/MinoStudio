<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  clearNavCaptures,
  getNavFsmLiveGraph,
  getNavMetrics,
} from '@/api/navFsm'
import { useNavFsm } from '@/composables/useNavFsm'
import NavFsmGraphEditor from '@/views/Testing/NavFsmGraphEditor.vue'
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
const archViewTab = ref('structure')
let livePollTimer = null
const setupReady = ref(false)
const captureReport = ref(null)
const metrics = ref(null)
const metricsLoading = ref(false)
const graphDoc = ref(null)
const graphReloadKey = ref(0)

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

const TEMPLATE_SCREEN_IDS = new Set(['page.home', 'page.list', 'page.detail', 'dialog.confirm'])

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
    entryCount: entries.length,
    subPageCount: subPages.length,
    edgeCount: navEdges.length,
    captureTurns: Number(captureTurns.value || meta.capture_turns || 0),
    updatedAt: Number(liveGraphMeta.value?.updated_at || d.updated_at || 0),
    trajSteps: Number(trajectory.value?.step_count || 0),
    localizeStates: Number(trajectory.value?.unique_states || 0),
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

const applyLiveGraph = (payload) => {
  if (!payload?.doc) return
  graphDoc.value = { ...payload.doc }
  trajectory.value = payload.trajectory || null
  liveGraphMeta.value = {
    synced: Boolean(payload.synced),
    source: payload.source || '',
    updated_at: payload.updated_at || 0,
    publish_error: payload.publish_error || '',
  }
  const cap = payload.capture || {}
  if (cap.turns) {
    captureReport.value = {
      ...(captureReport.value || {}),
      turns_captured: Number(cap.turns_app || cap.turns || 0),
      turns_system_skipped: Number(cap.turns_system_skipped || 0),
      sessions: Number(cap.sessions || 0),
    }
  }
  graphReloadKey.value += 1
}

const loadLiveGraph = async (quiet = false) => {
  liveLoading.value = true
  try {
    const res = await getNavFsmLiveGraph(props.appId, {
      sync: true,
      project_id: props.projectId || undefined,
    })
    applyLiveGraph(res?.data || null)
    await load()
  } catch (e) {
    if (!quiet) {
      ElMessage.error(e?.response?.data?.detail || e?.message || '加载导航图失败')
    }
  } finally {
    liveLoading.value = false
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

const syncGraphFromDoc = () => {
  if (!doc.value) {
    graphDoc.value = emptyGraphDoc()
    graphReloadKey.value += 1
    return
  }
  const { runtime_ready, runtime_reason, runtime_reason_human, ...body } = doc.value
  graphDoc.value = { ...body }
  graphReloadKey.value += 1
}

const onGraphDocUpdate = (doc) => {
  graphDoc.value = doc
}

const onSaveGraphDoc = async () => {
  if (!graphDoc.value) return
  const body = { ...graphDoc.value }
  if (props.projectId && !body.project_id) body.project_id = props.projectId
  try {
    await save(body)
    ElMessage.success('导航图已保存')
    await loadLiveGraph(true)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  }
}

const tryAutoSetup = async (quiet = false) => {
  bootstrapping.value = true
  try {
    await load()
    if (hasConfig.value) {
      syncGraphFromDoc()
      setupReady.value = true
      return
    }

    const boot = await ensureBootstrap(props.projectId)
    if (boot.doc) {
      graphDoc.value = { ...boot.doc }
      graphReloadKey.value += 1
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

watch(() => props.section, (section) => {
  if (section === 'config') {
    loadMetrics()
    syncGraphFromDoc()
  }
  if (section === 'arch') loadLiveGraph(true)
}, { immediate: true })

watch(doc, () => {
  if (props.section === 'config') syncGraphFromDoc()
})

onMounted(async () => {
  await tryAutoSetup(true)
  if (props.section === 'arch') await loadLiveGraph(true)
  else if (props.section === 'config') {
    await load()
    syncGraphFromDoc()
    await loadMetrics()
  }
  livePollTimer = window.setInterval(() => {
    if (props.section === 'arch') loadLiveGraph(true)
  }, 15000)
})

onUnmounted(() => {
  if (livePollTimer) window.clearInterval(livePollTimer)
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
              {{ liveSummary.stateCount }} 页 · {{ liveSummary.entryCount }} Tab · {{ liveSummary.subPageCount }} 子页
              · {{ liveSummary.edgeCount }} 边 · {{ captureTurns }} 步采集 · {{ formatTime(liveSummary.updatedAt) }}
            </span>
          </div>
          <div class="published-actions">
            <el-button size="small" type="danger" plain :loading="clearingCaptures" @click="onClearCaptures">
              清空采集
            </el-button>
            <el-button size="small" :loading="liveLoading" @click="loadLiveGraph()">刷新</el-button>
          </div>
        </div>
        <div class="graph-view-tabs">
          <button type="button" class="gv-tab" :class="{ active: archViewTab === 'structure' }" @click="archViewTab = 'structure'">结构图</button>
          <button type="button" class="gv-tab" :class="{ active: archViewTab === 'nav' }" @click="archViewTab = 'nav'">跳转图</button>
        </div>
        <div class="settings-preview-panel published-graph-wrap">
          <NavFsmGraphEditor
            v-if="graphDoc"
            :key="`live-${graphReloadKey}-${archViewTab}`"
            :doc="graphDoc"
            :app-id="appId"
            :project-id="projectId"
            :arch-view="archViewTab"
            mode="preview"
            class="published-graph"
          />
          <p v-else class="muted empty-hint">暂无</p>
        </div>
      </section>
    </div>

    <div v-else-if="section === 'config'" class="settings-fill-body advanced-body">
      <section class="settings-card graph-card settings-fill-body">
        <div class="published-toolbar">
          <div v-if="metrics" class="published-meta metrics-inline muted">
            <span>guard_fp {{ metrics.guard_fp ?? '—' }}</span>
            <span>localize {{ metrics.localize_hit_rate ?? '—' }}</span>
          </div>
          <div class="published-actions">
            <el-button size="small" :loading="metricsLoading" @click="loadMetrics">刷新指标</el-button>
            <el-button size="small" type="primary" :loading="saving" @click="onSaveGraphDoc">保存图形</el-button>
          </div>
        </div>
        <NavFsmGraphEditor
          :key="`graph-${graphReloadKey}`"
          :doc="graphDoc"
          :app-id="appId"
          :project-id="projectId"
          mode="edit"
          @update:doc="onGraphDocUpdate"
        />
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
  gap: 6px;
  margin-bottom: 8px;
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
