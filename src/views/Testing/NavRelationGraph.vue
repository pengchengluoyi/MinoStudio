<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RGProvider, RelationGraph } from '@relation-graph/vue'
import '@relation-graph/vue/style.css'
import NavRelationGraphNode from '@/views/Testing/NavRelationGraphNode.vue'
import NavGraphNodeHover from '@/views/Testing/NavGraphNodeHover.vue'
import NavGraphInspectDialog from '@/views/Testing/NavGraphInspectDialog.vue'
import {
  archLineHiddenByFilters,
  docToRelationGraph,
  enrichArchLineArrows,
  loadArchLineFilters,
  navEdgeFromLineJson,
  relationGraphOptions,
  RG_DEFAULT_LINE_MARKER,
  RG_LINE_SHAPE_CURVE,
  saveArchLineFilters,
  stateId,
} from '@/utils/navRelationGraph'
import {
  CALIBRATE_MARK,
  newNavEdgeSkeleton,
  newStateSkeleton,
  removeStateFromDoc,
  renameStateInDoc,
} from '@/utils/navFsmGraph'
import {
  clearArchGraphHoverHandlers,
  setArchGraphHoverHandlers,
} from '@/utils/navGraphArchBridge'

const props = defineProps({
  doc: { type: Object, default: null },
  appId: { type: String, default: '' },
  appName: { type: String, default: '' },
  projectId: { type: String, default: '' },
  mode: { type: String, default: 'preview' },
  variant: { type: String, default: 'config' },
  archView: { type: String, default: 'structure' },
  intelOverlay: { type: Object, default: null },
})

const emit = defineEmits(['update:doc', 'save-doc', 'patch-state', 'merge-states', 'split-capture', 'pin-capture'])

const allStateOptions = computed(() =>
  (baseDoc.value.states || []).map((s) => ({
    id: stateId(s),
    label: String(s?.meta?.display_name || s?.id || '').trim(),
  })),
)

const atlasTurnRefs = computed(() => {
  const rows = baseDoc.value?.meta?.atlas_turn_refs
  return Array.isArray(rows) ? rows : []
})

const isArch = computed(() => props.variant === 'arch')
const isPreview = computed(() => !isArch.value && props.mode === 'preview')
const graphInstance = ref(null)
const archLineFilters = ref(loadArchLineFilters())

const archFilterRows = [
  { key: 'blueSolid', label: '展示蓝-实线' },
  { key: 'blueDash', label: '展示蓝-虚线' },
  { key: 'orangeSolid', label: '展示橙-实线' },
  { key: 'orangeDash', label: '展示橙-虚线' },
  { key: 'back', label: '返回' },
  { key: 'forward', label: '前进' },
]

const syncArchLineVisibility = () => {
  if (!isArch.value) return
  const gi = graphInstance.value
  const inst = typeof gi?.getInstance === 'function' ? gi.getInstance() : gi
  if (!inst) return
  const filters = archLineFilters.value
  const data = typeof inst.getGraphJsonData === 'function' ? inst.getGraphJsonData() : null
  if (!data) return
  for (const line of data.lines || []) {
    if (!line?.data?.archFilter) continue
    inst.updateLine(line.id, { hidden: archLineHiddenByFilters(line, filters) })
  }
  for (const line of data.fakeLines || []) {
    if (!line?.data?.archFilter) continue
    inst.updateFakeLine(line.id, { hidden: archLineHiddenByFilters(line, filters) })
  }
  if (typeof inst.refresh === 'function') inst.refresh()
}

const onArchFilterChange = () => {
  saveArchLineFilters(archLineFilters.value)
  syncArchLineVisibility()
}
const selectedKind = ref('state')
const selectedStateId = ref('')
const selectedEdgeId = ref('')
const inspectorJson = ref('')

const hoverVisible = ref(false)
const hoverX = ref(0)
const hoverY = ref(0)
const hoverTitle = ref('')
const hoverSubtitle = ref('')
const hoverNodeRef = ref(null)
const hoverWireframe = ref(null)
let hoverHideTimer = null

const dialogVisible = ref(false)
const dialogMode = ref('preview')
const dialogTitle = ref('')
const dialogState = ref(null)
const dialogWireframe = ref(null)

const baseDoc = computed(() => {
  if (props.doc && typeof props.doc === 'object') {
    return props.doc
  }
  return {
    app_id: props.appId,
    project_id: props.projectId,
    version: 'v1',
    meta: {},
    test_data: {},
    states: [],
    edges: [],
  }
})

const graphOptions = computed(() => {
  const flowLayout = Boolean(baseDoc.value?.meta?.atlas_layout === 'flow_blocks')
  const base = relationGraphOptions(isArch.value || !isPreview.value, {
    curved: isArch.value,
    archStyle: false,
  })
  if (!isArch.value) return base
  return {
    ...base,
    defaultLineColor: '#1d4ed8',
    defaultLineWidth: 2.5,
    defaultShowLineLabel: true,
    defaultLineTextOffset_y: -6,
    defaultLineMarker: RG_DEFAULT_LINE_MARKER,
    defaultShowEndArrow: true,
    defaultShowStartArrow: false,
    defaultLineShape: RG_LINE_SHAPE_CURVE,
    defaultJunctionPoint: 'border',
    defaultLineUseTextPath: false,
  }
})

const loadGraph = async () => {
  const gi = graphInstance.value
  if (!gi) return
  const payload = docToRelationGraph(baseDoc.value, {
    archView: props.archView,
    appId: props.appId,
    appName: props.appName,
    intelOverlay: props.intelOverlay,
    showWireframe: true,
    editableHotspots: isArch.value || !isPreview.value,
    variant: props.variant,
  })
  try {
    const nodes = (payload.nodes || []).map((n) => {
      if (!isArch.value) return n
      return { ...n, data: { ...(n.data || {}), archInteract: true } }
    })
    const fakeLinesDeferred = payload.fakeLines || []
    await gi.setJsonData({
      rootId: payload.rootId,
      nodes,
      lines: payload.lines,
      fakeLines: isArch.value && fakeLinesDeferred.length ? [] : fakeLinesDeferred,
      layoutName: payload.layoutName,
      ...(payload.layoutConfig ? { layout: payload.layoutConfig } : {}),
    })
    await nextTick()
    await nextTick()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const inst = typeof gi.getInstance === 'function' ? gi.getInstance() : gi
    const rgInstanceId = String(inst?.getOptions?.()?.instanceId || inst?.options?.instanceId || '')
    if (inst && typeof inst.setOptions === 'function') {
      inst.setOptions({
        defaultLineShape: RG_LINE_SHAPE_CURVE,
        allowSwitchLineShape: false,
        defaultShowEndArrow: true,
        defaultShowStartArrow: false,
        defaultLineMarker: RG_DEFAULT_LINE_MARKER,
      })
    }
    if (inst && typeof inst.updateConnectTargetsByNodeId === 'function') {
      for (const n of nodes) {
        const id = String(n.id || '')
        if (!id || id.startsWith('__block__')) continue
        inst.updateConnectTargetsByNodeId(id)
      }
    }
    await nextTick()
    await new Promise((r) => requestAnimationFrame(r))
    if (isArch.value && fakeLinesDeferred.length && inst) {
      if (typeof inst.clearFakeLines === 'function') inst.clearFakeLines()
      const fakeWithArrows = enrichArchLineArrows(fakeLinesDeferred, rgInstanceId)
      if (typeof inst.addFakeLines === 'function') inst.addFakeLines(fakeWithArrows)
    }
    if (inst && typeof inst.refresh === 'function') {
      inst.refresh()
    }
    await nextTick()
    syncArchLineVisibility()
    gi.moveToCenter()
    if (payload.useFlowBlockLayout) {
      if (typeof gi.zoomToFit === 'function') gi.zoomToFit()
      if (typeof gi.setZoom === 'function') {
        const z = typeof gi.getZoom === 'function' ? gi.getZoom() : 100
        if (z < 55) gi.setZoom(62)
        if (z > 95) gi.setZoom(88)
      }
    } else {
      gi.zoomToFit()
    }
  } catch (e) {
    console.error('[NavRelationGraph] setJsonData', e)
  }
}

const onReady = (gi) => {
  graphInstance.value = gi
  loadGraph()
}

watch(
  () => [props.doc, props.archView, props.intelOverlay, props.variant],
  () => {
    loadGraph()
  },
  { deep: true },
)

const pickStateJson = (node) => {
  const sid = String(node?.id || '')
  const st = (baseDoc.value.states || []).find((s) => stateId(s) === sid)
  return JSON.stringify(st || node?.data?.state || { id: sid }, null, 2)
}

const onNodeHover = (node, e) => {
  if (!isArch.value || !node?.id || node.id === '__nav_app_root__') return
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer)
    hoverHideTimer = null
  }
  hoverNodeRef.value = node
  hoverTitle.value = String(node.text || node.data?.stateId || node.id)
  hoverWireframe.value = node.data?.wireframe || null
  const wf = node.data?.wireframe || {}
  const src = wf.sources || {}
  const bits = []
  if (node.data?.subhead) bits.push(node.data.subhead)
  if (src.hierarchy) bits.push('线框 hierarchy')
  if (src.vision) bits.push('VLM')
  hoverSubtitle.value = bits.length ? bits.join(' · ') : '右键或点预览查看大图'
  hoverX.value = (e?.clientX || 0) + 12
  hoverY.value = (e?.clientY || 0) + 12
  hoverVisible.value = true
  selectedKind.value = 'state'
  selectedStateId.value = String(node.id)
  inspectorJson.value = pickStateJson(node)
}

const onNodeLeave = () => {
  if (hoverHideTimer) clearTimeout(hoverHideTimer)
  hoverHideTimer = setTimeout(() => {
    hoverVisible.value = false
  }, 520)
}

const cancelHoverHide = () => {
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer)
    hoverHideTimer = null
  }
}

watch(
  isArch,
  (arch) => {
    if (arch) {
      setArchGraphHoverHandlers({
        onHover: onNodeHover,
        onLeave: onNodeLeave,
        onContext: (node, e) => {
          onNodeHover(node, e)
          openDialog('preview')
        },
      })
    } else {
      clearArchGraphHoverHandlers()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  clearArchGraphHoverHandlers()
})

const openDialog = (mode) => {
  const node = hoverNodeRef.value
  if (!node) return
  dialogMode.value = mode
  dialogTitle.value = hoverTitle.value
  const sid = String(node?.id || '')
  const st = (baseDoc.value.states || []).find((s) => stateId(s) === sid)
  dialogState.value = st ? JSON.parse(JSON.stringify(st)) : { id: sid, kind: 'page', meta: {} }
  dialogWireframe.value = node.data?.wireframe || null
  dialogVisible.value = true
  hoverVisible.value = false
}

const onDialogSave = (parsed) => {
  if (!applyStateObject(parsed, { persist: true, fromDialog: true })) return
  dialogVisible.value = false
}

const onDialogMerge = (payload) => {
  emit('merge-states', payload)
  dialogVisible.value = false
}

const onDialogSplitCapture = (payload) => {
  emit('split-capture', payload)
}

const onDialogPinCapture = (payload) => {
  emit('pin-capture', payload)
}

const applyStateObject = (parsed, { persist = true, fromDialog = false } = {}) => {
  try {
    const next = JSON.parse(JSON.stringify(baseDoc.value))
    if (selectedKind.value !== 'state') return false
    const oldId = selectedStateId.value
    const newId = String(parsed.id || oldId).trim()
    const idx = (next.states || []).findIndex((s) => stateId(s) === oldId)
    if (idx < 0) throw new Error('状态不存在')
    next.states[idx] = { ...parsed, id: newId }
    next.edges = (next.edges || []).map((e) => {
      const patch = { ...e }
      if (String(e.from) === oldId) patch.from = newId
      if (String(e.to) === oldId) patch.to = newId
      return patch
    })
    let out = next
    if (newId !== oldId) out = renameStateInDoc(out, oldId, newId)
    const manual = (out.edges || []).filter((e) => e?.meta?.manual)
    out.meta = { ...(out.meta || {}), atlas_manual_edges: manual }
    emit('update:doc', out)
    if (persist) {
      emit('save-doc', out)
      if (fromDialog && isArch.value) {
        emit('patch-state', out.states[idx])
      }
    }
    selectedStateId.value = newId
    inspectorJson.value = JSON.stringify(out.states[idx], null, 2)
    if (!(fromDialog && isArch.value)) {
      ElMessage.success('已保存')
    }
    loadGraph()
    return true
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
    return false
  }
}

const applyParsedJson = (raw, { persist } = { persist: false }) => {
  try {
    const parsed = JSON.parse(raw || '{}')
    return applyStateObject(parsed, { persist })
  } catch (e) {
    ElMessage.error(e?.message || 'JSON 无效')
    return false
  }
}

const onNodeClick = (node, e) => {
  if (isArch.value) {
    if (node?.id && node.id !== '__nav_app_root__') {
      const ev = e?.event || e?.originalEvent || e
      onNodeHover(node, {
        clientX: Number(ev?.clientX || 0),
        clientY: Number(ev?.clientY || 0),
      })
    }
    return true
  }
  if (!node?.id || node.id === '__nav_app_root__') return true
  selectedKind.value = 'state'
  selectedStateId.value = String(node.id)
  selectedEdgeId.value = ''
  inspectorJson.value = pickStateJson(node)
  return true
}

const onLineClick = (line) => {
  if (isPreview.value) return true
  selectedKind.value = 'edge'
  selectedEdgeId.value = `${line.from}_${line.to}`
  selectedStateId.value = ''
  const ed = (baseDoc.value.edges || []).find(
    (e) => String(e.from) === String(line.from) && String(e.to) === String(line.to),
  )
  inspectorJson.value = JSON.stringify(
    ed || { id: `edge.${line.from}_to_${line.to}`, kind: 'nav', from: line.from, to: line.to },
    null,
    2,
  )
  return true
}

const emitDoc = (next) => {
  emit('update:doc', next)
}

const addState = async (kind) => {
  try {
    const { value } = await ElMessageBox.prompt(`新状态 id`, kind === 'dialog' ? '添加弹窗' : '添加页面', {
      inputPattern: /^[a-z][a-z0-9_.-]+$/i,
      inputValue: kind === 'dialog' ? 'dialog.new' : 'page.new',
    })
    const sid = String(value || '').trim()
    const next = JSON.parse(JSON.stringify(baseDoc.value))
    if ((next.states || []).some((s) => stateId(s) === sid)) {
      ElMessage.error('state_id 已存在')
      return
    }
    next.states = [...(next.states || []), newStateSkeleton(sid, kind)]
    emitDoc(next)
    await loadGraph()
  } catch {
    /* cancel */
  }
}

const removeSelected = async () => {
  if (selectedKind.value === 'state' && selectedStateId.value) {
    try {
      await ElMessageBox.confirm(`删除状态 ${selectedStateId.value}？`, '删除', { type: 'warning' })
      const next = removeStateFromDoc(baseDoc.value, selectedStateId.value)
      emitDoc(next)
      selectedStateId.value = ''
      inspectorJson.value = ''
      await loadGraph()
    } catch {
      /* cancel */
    }
    return
  }
  if (selectedKind.value === 'edge' && inspectorJson.value) {
    try {
      const parsed = JSON.parse(inspectorJson.value)
      const next = JSON.parse(JSON.stringify(baseDoc.value))
      next.edges = (next.edges || []).filter((e) => e.id !== parsed.id)
      emitDoc(next)
      selectedEdgeId.value = ''
      inspectorJson.value = ''
      await loadGraph()
    } catch {
      ElMessage.error('无法解析边')
    }
  }
}

const applyInspector = () => {
  applyParsedJson(inspectorJson.value, { persist: false })
}

const addEdge = async () => {
  try {
    const { value: from } = await ElMessageBox.prompt('from state id', '添加导航边', { inputValue: selectedStateId.value })
    const { value: to } = await ElMessageBox.prompt('to state id', '添加导航边')
    const f = String(from || '').trim()
    const t = String(to || '').trim()
    const sk = newNavEdgeSkeleton(f, t)
    const next = JSON.parse(JSON.stringify(baseDoc.value))
    next.edges = [...(next.edges || []), sk]
    emitDoc(next)
    await loadGraph()
  } catch {
    /* cancel */
  }
}

const fitView = () => {
  graphInstance.value?.moveToCenter()
  graphInstance.value?.zoomToFit()
}

const onLineBeCreated = async (lineInfo) => {
  if (isArch.value || isPreview.value) return
  const lineJson = lineInfo?.line || lineInfo
  const edge = navEdgeFromLineJson(lineJson, baseDoc.value)
  const next = JSON.parse(JSON.stringify(baseDoc.value))
  const exists = (next.edges || []).some((e) => e.id === edge.id)
  if (!exists) {
    next.edges = [...(next.edges || []), edge]
  }
  const manual = (next.edges || []).filter((e) => e?.meta?.manual)
  next.meta = { ...(next.meta || {}), atlas_manual_edges: manual }
  emit('update:doc', next)
  if (isArch.value) {
    emit('save-doc', next)
  }
  await loadGraph()
  ElMessage.success(isArch.value ? '跳转已记录并保存' : '已添加跳转')
}
</script>

<template>
  <div class="nav-relation-graph" :class="{ 'is-preview': isPreview, 'is-arch': isArch }">
    <div v-if="!isArch" class="graph-toolbar">
      <template v-if="!isPreview">
        <el-button size="small" @click="addState('page')">+ 页面</el-button>
        <el-button size="small" @click="addState('dialog')">+ 弹窗</el-button>
        <el-button size="small" @click="addEdge">+ 边</el-button>
        <el-button
          size="small"
          type="danger"
          plain
          :disabled="!selectedStateId && !selectedEdgeId"
          @click="removeSelected"
        >
          删除选中
        </el-button>
      </template>
      <el-button size="small" @click="fitView">适配视图</el-button>
    </div>
    <div v-else class="graph-toolbar arch-toolbar">
      <span class="arch-hint muted">悬停节点可预览详情；跳转关系由探索采集生成</span>
      <el-button size="small" @click="fitView">适配视图</el-button>
    </div>

    <div class="graph-layout">
      <div class="graph-canvas-wrap">
        <div v-if="isArch" class="arch-line-filter-panel" aria-label="架构图连线显示">
          <div v-for="row in archFilterRows" :key="row.key" class="arch-filter-row">
            <el-switch
              v-model="archLineFilters[row.key]"
              size="small"
              @change="onArchFilterChange"
            />
            <span class="arch-filter-label">{{ row.label }}</span>
          </div>
        </div>
        <RGProvider>
          <div class="rg-host">
            <RelationGraph
              :options="graphOptions"
              @on-ready="onReady"
              @on-node-click="onNodeClick"
              @on-line-click="onLineClick"
              @on-line-be-created="onLineBeCreated"
            >
              <template #node="slotProps">
                <NavRelationGraphNode :node="slotProps.node" />
              </template>
            </RelationGraph>
          </div>
        </RGProvider>
      </div>

      <aside v-if="!isPreview && !isArch" class="graph-inspector">
        <div class="inspector-head">JSON 编辑</div>
        <el-input
          v-model="inspectorJson"
          type="textarea"
          :rows="18"
          placeholder="选中节点或边后编辑"
          spellcheck="false"
        />
        <el-button type="primary" size="small" class="apply-btn" :disabled="!inspectorJson" @click="applyInspector">
          应用
        </el-button>
        <p class="inspector-hint muted">
          校准占位符 {{ CALIBRATE_MARK }} 仍可通过 JSON 编辑；图形布局由 relation-graph 自动计算。
        </p>
      </aside>
    </div>

    <NavGraphNodeHover
      v-if="isArch && hoverVisible"
      :title="hoverTitle"
      :subtitle="hoverSubtitle"
      :wireframe="hoverWireframe"
      :app-id="appId"
      :state-id="hoverNodeRef?.id || ''"
      :x="hoverX"
      :y="hoverY"
      @mouseenter="cancelHoverHide"
      @preview="openDialog('preview')"
      @edit="openDialog('edit')"
      @close="onNodeLeave"
    />

    <NavGraphInspectDialog
      v-model:visible="dialogVisible"
      :mode="dialogMode"
      :title="dialogTitle"
      :state="dialogState"
      :wireframe="dialogWireframe"
      :app-id="appId"
      :all-state-options="allStateOptions"
      :atlas-turn-refs="atlasTurnRefs"
      @save="onDialogSave"
      @merge-states="onDialogMerge"
      @split-capture="onDialogSplitCapture"
      @pin-capture="onDialogPinCapture"
    />
  </div>
</template>

<style scoped>
.nav-relation-graph {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 320px;
}

.nav-relation-graph.is-preview .graph-layout,
.nav-relation-graph.is-arch .graph-layout {
  grid-template-columns: 1fr;
}

.graph-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 0 8px;
  flex-shrink: 0;
}

.arch-toolbar {
  justify-content: space-between;
  align-items: center;
}

.arch-hint {
  font-size: 12px;
}

.graph-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 12px;
}

.graph-canvas-wrap {
  position: relative;
  min-height: 0;
  height: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background-color: #f1f5f9;
  background-image: radial-gradient(circle, #cbd5e1 1px, transparent 1px);
  background-size: 20px 20px;
}

.graph-canvas-wrap :deep(.rel-node-peel) {
  overflow: visible !important;
  pointer-events: auto !important;
}

.graph-canvas-wrap :deep(.rel-node) {
  pointer-events: auto !important;
}

.graph-canvas-wrap :deep(.c-node-text) {
  display: none;
}

.nav-relation-graph.is-arch .graph-canvas-wrap :deep(.c-rg-line-text) {
  font-size: 11px;
  font-weight: 600;
  fill: #1e3a8a;
  paint-order: stroke fill;
  stroke: #f8fafc;
  stroke-width: 4px;
  pointer-events: none;
}

.nav-relation-graph.is-arch .graph-canvas-wrap :deep(.rg-lines-container-el-lines) {
  z-index: 85 !important;
}

.nav-relation-graph.is-arch .graph-canvas-wrap :deep(.rg-line-peel .rg-line) {
  marker-end: var(--rg-line-marker-end);
  marker-start: var(--rg-line-marker-start);
}

.nav-relation-graph.is-arch .graph-canvas-wrap :deep(.rg-line-peel path.rg-line) {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-relation-graph.is-arch .graph-canvas-wrap :deep(.rel-node-peel) {
  z-index: 3;
}

.nav-relation-graph.is-arch .graph-canvas-wrap :deep(.rel-node-peel:has(.rg-flow-block-shell)) {
  z-index: 0 !important;
}

.rg-host {
  width: 100%;
  height: 100%;
  min-height: 360px;
}

.arch-line-filter-panel {
  position: absolute;
  left: 12px;
  top: 12px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
  pointer-events: auto;
  max-width: 168px;
}

.arch-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #334155;
  line-height: 1.2;
}

.arch-filter-label {
  flex: 1;
  user-select: none;
}

.graph-inspector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.inspector-head {
  font-size: 13px;
  font-weight: 600;
}

.apply-btn {
  align-self: flex-start;
}

.inspector-hint {
  font-size: 11px;
  margin: 0;
}

.muted {
  color: #64748b;
}
</style>
