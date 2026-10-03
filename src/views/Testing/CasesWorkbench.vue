<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { cancelQaProcessJob, runQaProcessTick } from '@/api/appAutomation'
import { deleteProjectCase, deleteProjectCases, getProjectCases, updateProjectCase } from '@/api/projectCases'
import { useQaProcess } from '@/composables/useQaProcess'
import {
  assignCasesToAtlas,
  atlasCascaderOptions,
  flattenAtlas,
  moduleLabel,
  pathParts,
  platformLabel,
} from '@/utils/appAtlas'
import { casesFromProjectRows, generatedCasesFromProcess, sortReleases } from '@/utils/qaProcess'
import { slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import CaseMultilineCell from '@/components/CaseMultilineCell.vue'
import CaseAlignedFieldCell from '@/components/CaseAlignedFieldCell.vue'
import CasePairedEditor from '@/components/CasePairedEditor.vue'
import CaseResourceKeyPanel from '@/components/CaseResourceKeyPanel.vue'
import CaseImportDialog from '@/views/Testing/CaseImportDialog.vue'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '应用' },
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
})

const emit = defineEmits(['open-req', 'cases-changed'])


const route = useRoute()
const router = useRouter()
const appIdRef = computed(() => props.appId)
const {
  requirements,
  releases,
  appAtlas,
  loading,
  load,
  apply,
} = useQaProcess(appIdRef)

const ticking = ref(false)
const lastTick = ref('')
const tickProgress = ref(null)
let tickAbort = null
const view = ref('library')
const selectedReqId = ref('')
const projectCases = ref([])
const casesLoading = ref(false)

const loadProjectCases = async () => {
  if (!props.projectId) {
    projectCases.value = []
    return
  }
  casesLoading.value = true
  try {
    const res = await getProjectCases(props.projectId)
    projectCases.value = casesFromProjectRows(res?.data?.cases || [])
  } catch (_) {
    projectCases.value = []
  } finally {
    casesLoading.value = false
  }
}

const dropDraftCases = (ids) => {
  const drop = new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))
  if (!drop.size) return
  requirements.value = requirements.value.map((req) => ({
    ...req,
    draft_cases: (req.draft_cases || []).filter((c) => !drop.has(String(c?.case_id || ''))),
  }))
}

const cases = computed(() => {
  if (props.projectId) return projectCases.value
  return generatedCasesFromProcess(requirements.value)
})
const caseQuery = ref('')
const filterPath = ref([])
const casePage = ref(1)
const casePageSize = ref(20)
const libraryTableRef = ref(null)
const selectedLibraryCases = ref([])
const batchDeleting = ref(false)
const atlasVersionId = ref('')
const caseImportOpen = ref(false)
const openCaseImport = () => {
  if (!props.projectId) {
    ElMessage.warning('缺少项目信息，无法导入用例')
    return
  }
  caseImportOpen.value = true
}
const onCaseImported = async () => {
  await load()
  await loadProjectCases()
  emit('cases-changed')
}
const selectedReq = computed(() => {
  if (selectedReqId.value) return requirements.value.find((r) => r.id === selectedReqId.value) || null
  return requirements.value[0] || null
})
const pageTitle = computed(() => (props.hideNav ? '用例库' : '用例'))
const versionOptions = computed(() => sortReleases(releases.value))
const latestRelease = computed(() => versionOptions.value[versionOptions.value.length - 1] || null)
const activeRelease = computed(() => versionOptions.value.find((r) => r.id === atlasVersionId.value) || latestRelease.value || null)
const versionAtlas = computed(() => {
  const rel = activeRelease.value
  if (rel?.atlas && Array.isArray(rel.atlas.modules) && rel.atlas.modules.length) return rel.atlas
  return appAtlas.value
})
const caseAssign = computed(() => assignCasesToAtlas(
  versionAtlas.value,
  cases.value,
  props.projectId ? [] : requirements.value,
))

const reqTitle = (id) => requirements.value.find((r) => r.id === id)?.title || id || ''

const libraryRows = computed(() => {
  const { byNode, orphan } = caseAssign.value
  const featPath = Object.fromEntries(flattenAtlas(versionAtlas.value).filter((r) => r.kind === 'feature').map((r) => [r.id, r.path]))
  const rows = []
  for (const [nid, list] of byNode.entries()) {
    const parts = pathParts(featPath[nid] || '')
    for (const c of list) {
      const atlas_path = featPath[nid] || ''
      rows.push({
        ...c,
        ...parts,
        atlas_path,
        module_label: moduleLabel(atlas_path || c.module),
        requirement_title: c.requirement_title || reqTitle(c.requirement_id),
        _rowKey: `${c.case_id || ''}::${nid}::${rows.length}`,
      })
    }
  }
  for (const c of orphan) {
    const fromModule = pathParts(c.module || '')
    rows.push({
      ...c,
      ...fromModule,
      atlas_path: c.module || '',
      module_label: moduleLabel(c.module || ''),
      requirement_title: c.requirement_title || reqTitle(c.requirement_id),
      _rowKey: `${c.case_id || ''}::orphan::${rows.length}`,
    })
  }
  return rows
})

const cascadeOptions = computed(() => atlasCascaderOptions(versionAtlas.value))
const cascadeProps = { checkStrictly: true, expandTrigger: 'hover' }

const visibleCases = computed(() => {
  const q = caseQuery.value.trim().toLowerCase()
  const prefix = (filterPath.value || []).filter(Boolean).join(' / ')
  return libraryRows.value.filter((c) => {
    if (prefix) {
      const path = c.atlas_path || [c.module, c.submodule, c.feature].filter(Boolean).join(' / ')
      if (path !== prefix && !path.startsWith(`${prefix} / `)) return false
    }
    if (!q) return true
    const blob = `${c.case_id || ''} ${c.name || ''} ${c.platform || ''} ${c.module || ''} ${c.submodule || ''} ${c.feature || ''} ${c.requirement_id || ''}`
    return blob.toLowerCase().includes(q)
  })
})
const pagedCases = computed(() => slicePage(visibleCases.value, casePage.value, casePageSize.value))

const selectedCaseIds = computed(() => {
  const ids = new Set()
  for (const row of selectedLibraryCases.value) {
    const cid = String(row?.case_id || '').trim()
    if (cid) ids.add(cid)
  }
  return [...ids]
})

const onLibrarySelectionChange = (rows) => {
  selectedLibraryCases.value = rows || []
}

watch([casePage, casePageSize, caseQuery, filterPath], () => {
  libraryTableRef.value?.clearSelection?.()
})

const mergeSavedCase = (cid, patch) => {
  projectCases.value = projectCases.value.map((c) => (
    String(c.case_id) === cid ? { ...c, ...patch } : c
  ))
}

const onLibraryCaseChange = async (row, fields) => {
  const cid = String(row?.case_id || '').trim()
  if (!cid || !props.projectId) return
  try {
    const res = await updateProjectCase(props.projectId, cid, fields)
    const saved = res?.data?.case || { ...row, ...fields }
    mergeSavedCase(cid, saved)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  }
}

const onLibraryResourceKeySaved = (row, saved) => {
  const cid = String(row?.case_id || '').trim()
  if (!cid) return
  mergeSavedCase(cid, saved)
}

const sourceLabel = (row) => {
  const s = String(row?.source || row?.origin || '').toLowerCase()
  if (s === 'import') return '导入'
  if (s === 'generated' || s === 'draft') return '生成'
  return s || '—'
}

const deleteLibraryCase = async (row) => {
  const cid = String(row?.case_id || '').trim()
  if (!cid || !props.projectId) return
  try {
    await ElMessageBox.confirm(
      `确定删除用例「${row.name || cid}」（${cid}）？删除后不可恢复。`,
      '删除用例',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteProjectCase(props.projectId, cid)
    ElMessage.success('已删除')
    libraryTableRef.value?.clearSelection?.()
    dropDraftCases([cid])
    await loadProjectCases()
    emit('cases-changed')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '删除失败')
  }
}

const deleteSelectedLibraryCases = async () => {
  const ids = selectedCaseIds.value
  if (!ids.length || !props.projectId) return
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${ids.length} 条用例？删除后不可恢复。`,
      '批量删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  batchDeleting.value = true
  try {
    const res = await deleteProjectCases(props.projectId, ids)
    const n = res?.data?.deleted ?? ids.length
    ElMessage.success(`已删除 ${n} 条`)
    libraryTableRef.value?.clearSelection?.()
    dropDraftCases(ids)
    await loadProjectCases()
    emit('cases-changed')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '批量删除失败')
  } finally {
    batchDeleting.value = false
  }
}

const LEGACY_CASE_VIEWS = new Set(['atlas', 'mindmap', 'features', 'reqs', 'changes', 'sync', 'feishu'])

const syncViewFromRoute = () => {
  const raw = String(route.query.view || '')
  if (raw === 'nav-fsm') {
    router.replace({
      name: 'TestingApp',
      params: { appId: props.appId },
      query: { ...route.query, tab: 'navigation', nview: 'arch', view: undefined },
    })
    return
  }
  view.value = 'library'
  if (LEGACY_CASE_VIEWS.has(raw)) {
    router.replace({
      name: 'TestingApp',
      params: { appId: props.appId },
      query: { ...route.query, tab: 'cases', view: 'library' },
    })
  }
  if (route.query.rid) selectedReqId.value = String(route.query.rid)
}

const tick = async (requirementId = '') => {
  if (!props.appId || ticking.value) return
  ticking.value = true
  tickProgress.value = null
  tickAbort = new AbortController()
  try {
    const data = await runQaProcessTick(
      props.appId,
      { requirement_id: requirementId },
      {
        signal: tickAbort.signal,
        onProgress: (snap) => {
          const job = snap?.job || {}
          tickProgress.value = job
          if (snap?.qa_process) apply(snap.qa_process)
          if (job.total) {
            lastTick.value = `${job.label || '推进中'} · ${job.done || 0}/${job.total}`
          } else if (job.label) {
            lastTick.value = job.label
          }
        },
      },
    )
    if (data?.qa_process) apply(data.qa_process)
    if (data?.job?.status === 'cancelled') {
      lastTick.value = '已取消'
      return
    }
    if (data?.job?.status === 'error') {
      lastTick.value = data.job.error || '推进失败'
      ElMessage.error(lastTick.value)
      return
    }
    const did = (data.actions || []).filter((a) => a.action && a.action !== 'skip' && a.action !== 'blocked')
    const usage = data.usage || {}
    const proposed = did.filter((a) => a.action === 'propose_atlas')
    const pending = (data.qa_process?.atlas_patches || []).some((p) => p.status === 'pending')
    if (proposed.length) {
      lastTick.value = did.length > proposed.length ? `已推进 ${did.length} 步，影响范围待确认` : '影响范围待确认'
    } else if (did.length) {
      const tokens = Number(usage.total_tokens || 0)
      lastTick.value = tokens ? `已推进 ${did.length} 步 · ${tokens} tokens` : `已推进 ${did.length} 步`
    } else if (pending) {
      lastTick.value = '影响范围待确认'
    } else {
      lastTick.value = '这一轮没有新步骤'
    }
  } catch (e) {
    if (e?.name === 'AbortError') return
    const detail = e?.response?.data?.detail
    if (e?.response?.status === 409 && detail?.job) {
      lastTick.value = detail.message || '已有推进任务在跑'
      ElMessage.warning(lastTick.value)
      return
    }
    ElMessage.error(typeof detail === 'string' ? detail : (e?.message || '角色推进失败'))
  } finally {
    ticking.value = false
    tickProgress.value = null
    tickAbort = null
  }
}

const cancelTick = async () => {
  const jobId = tickProgress.value?.job_id
  if (jobId) {
    try { await cancelQaProcessJob(jobId) } catch (_) { /* ignore */ }
  }
  tickAbort?.abort()
}

const openNewRun = (caseId = '') => {
  const query = {
    appName: props.appName || route.query.appName,
    projectName: props.projectName || route.query.projectName,
    projectId: props.projectId || route.query.projectId,
    tab: 'tasks',
    openRun: '1',
  }
  if (caseId) query.caseIds = caseId
  router.push({ name: 'TestingApp', params: { appId: props.appId }, query })
}

watch(() => [route.query.view, route.query.refsrc], syncViewFromRoute)
watch([caseQuery, filterPath], () => { casePage.value = 1 })
watch(versionOptions, (rows) => {
  if (atlasVersionId.value && rows.some((r) => r.id === atlasVersionId.value)) return
  atlasVersionId.value = rows[rows.length - 1]?.id || ''
}, { immediate: true })
watch(() => props.appId, async () => {
  lastTick.value = ''
  await load()
  await loadProjectCases()
})

watch(() => props.projectId, () => { loadProjectCases() })

onMounted(async () => {
  syncViewFromRoute()
  await load()
  await loadProjectCases()
  if (!selectedReqId.value && requirements.value[0]) selectedReqId.value = requirements.value[0].id
})
</script>

<template>
  <div class="settings-panel cases-workbench wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ pageTitle }}</h2>
      </div>
      <div class="header-actions">
        <el-select
          v-if="versionOptions.length"
          v-model="atlasVersionId"
          size="small"
          class="version-select"
          placeholder="选择版本"
        >
          <el-option
            v-for="rel in versionOptions"
            :key="rel.id"
            :label="rel.id === latestRelease?.id ? `${rel.title}（最新）` : rel.title"
            :value="rel.id"
          />
        </el-select>
        <div v-if="ticking" class="settings-summary-pill tick-pill">
          {{ lastTick || '角色推进中' }}
          <button type="button" class="tick-cancel" @click="cancelTick">取消</button>
        </div>
        <div v-else-if="lastTick" class="settings-summary-pill">{{ lastTick }}</div>
        <button type="button" class="settings-action-pill" :disabled="ticking" @click="tick(selectedReq?.id || '')">
          继续分析
          <span class="settings-action-arrow">→</span>
        </button>
        <button type="button" class="settings-action-pill" @click="openNewRun()">
          去执行批次
          <span class="settings-action-arrow">→</span>
        </button>
      </div>
    </header>

    <section class="library-wrap is-table">
      <section v-if="!libraryRows.length" class="settings-card">
        <p class="settings-page-desc">暂无数据</p>
        <el-button size="small" @click="openCaseImport">导入用例</el-button>
      </section>
      <section v-else class="settings-table-card is-fill">
        <div class="settings-toolbar">
          <div class="header-actions">
            <el-cascader
              v-model="filterPath"
              :options="cascadeOptions"
              :props="cascadeProps"
              clearable
              filterable
              placeholder="按图谱路径筛选"
              class="cascade-filter"
            />
            <el-input v-model="caseQuery" size="small" clearable placeholder="搜索编号、名称、端" class="lib-search" />
            <el-button size="small" @click="openCaseImport">导入用例</el-button>
            <el-button
              v-if="selectedCaseIds.length"
              size="small"
              type="danger"
              plain
              :loading="batchDeleting"
              @click="deleteSelectedLibraryCases"
            >删除选中 · {{ selectedCaseIds.length }}</el-button>
          </div>
        </div>
        <div class="table-fill">
          <el-table
            ref="libraryTableRef"
            :data="pagedCases"
            size="small"
            border
            stripe
            height="100%"
            row-key="_rowKey"
            empty-text="没有符合筛选的用例"
            @selection-change="onLibrarySelectionChange"
          >
            <el-table-column type="selection" width="42" fixed="left" />
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="lib-case-expand">
                  <CasePairedEditor :row="row" @change="(fields) => onLibraryCaseChange(row, fields)" />
                  <CaseResourceKeyPanel
                    :row="row"
                    :project-id="projectId"
                    @saved="(saved) => onLibraryResourceKeySaved(row, saved)"
                  />
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="case_id" label="编号" width="108" show-overflow-tooltip />
            <el-table-column prop="module_label" label="模块" min-width="200" show-overflow-tooltip />
            <el-table-column label="需求" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.requirement_title || row.requirement_id || '—' }}</template>
            </el-table-column>
            <el-table-column label="端" width="72" show-overflow-tooltip>
              <template #default="{ row }">{{ platformLabel(row.platform) || row.platform || '—' }}</template>
            </el-table-column>
            <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
            <el-table-column label="前置条件" min-width="140">
              <template #default="{ row }">
                <CaseMultilineCell :row="row" raw-key="precondition" />
              </template>
            </el-table-column>
            <el-table-column label="密钥" width="88" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.resource_key" class="rk-pill">
                  {{ row.case_scene?.required_session || 'claim' }}
                </span>
                <span v-else class="muted">未编译</span>
              </template>
            </el-table-column>
            <el-table-column label="测试步骤" min-width="180">
              <template #default="{ row }">
                <CaseAlignedFieldCell :row="row" field="step" />
              </template>
            </el-table-column>
            <el-table-column label="预期效果" min-width="160">
              <template #default="{ row }">
                <CaseAlignedFieldCell :row="row" field="expected" />
              </template>
            </el-table-column>
            <el-table-column label="来源" width="64" align="center">
              <template #default="{ row }">
                <span class="source-tag" :class="`is-${row.source || 'generated'}`">{{ sourceLabel(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="72" fixed="right" align="center">
              <template #default="{ row }">
                <el-button link type="danger" size="small" @click="deleteLibraryCase(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-pagination
          class="settings-table-pager"
          background
          layout="total, sizes, prev, pager, next"
          :total="visibleCases.length"
          :page-sizes="TABLE_PAGE_SIZES"
          v-model:page-size="casePageSize"
          v-model:current-page="casePage"
        />
      </section>
    </section>

    <CaseImportDialog
      v-model="caseImportOpen"
      :project-id="projectId"
      :requirement-id="selectedReqId || selectedReq?.id || ''"
      :requirements="requirements"
      @imported="onCaseImported"
    />
  </div>
</template>

<style scoped>
.cases-workbench {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cases-workbench > .settings-page-header,
.cases-workbench > .settings-tabbar {
  flex-shrink: 0;
}

.cases-workbench > .nav-fsm-panel {
  flex: 1;
  min-height: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.atlas-review {
  flex-shrink: 0;
  max-height: min(46vh, 480px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.atlas-review-hint {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
}
.mode-row {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin: -8px 0 12px;
}

.ghost-pill.on {
  border-color: color-mix(in srgb, var(--settings-primary) 45%, white);
  background: var(--settings-primary-soft);
  color: var(--settings-primary);
}

.filter-item { width: 140px; }
.lib-search { width: 220px; }
.cascade-filter { width: 280px; }
.version-select { width: 168px; }
.req-select { width: 180px; }

.hang-tag {
  margin-left: 6px;
  color: #b45309;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}

.atlas-diff-line.hang {
  background: #fffbeb;
}

.atlas-diff-line.is-edit {
  gap: 6px;
}

.atlas-edit-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  border: 0;
  background: transparent;
  font-size: 12px;
}

.tiny {
  flex-shrink: 0;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--settings-border);
  border-radius: 999px;
  background: #fff;
  color: var(--settings-muted);
  font-size: 11px;
  cursor: pointer;
}

.mind-page,
.change-stack,
.library-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.library-wrap.is-table {
  overflow: hidden;
}

.lib-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.lib-toolbar .settings-info-card {
  flex: 1;
  min-width: 0;
}

.change-page .settings-table-card.is-fill {
  min-height: 140px;
  flex: 1.4 1 0;
}

.change-detail {
  flex: 0 1 auto;
  max-height: 48%;
  overflow: auto;
}

.change-reason {
  margin: 8px 0 0;
  color: var(--settings-text);
  font-size: 13px;
}

.change-log,
.atlas-edit-list {
  margin-top: 10px;
  border: 1px solid var(--settings-border);
  border-radius: 10px;
  overflow: hidden;
}

.change-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--settings-border);
  font-size: 13px;
}

.change-line:last-child {
  border-bottom: 0;
}

.change-line em {
  flex-shrink: 0;
  font-style: normal;
  font-weight: 700;
  font-size: 11px;
}

.change-line.add em { color: #047857; }
.change-line.remove em { color: #b91c1c; }
.change-line.update em { color: #4338ca; }
.change-line.hang em { color: #b45309; }

.change-extra {
  color: var(--settings-muted);
}

.change-page :deep(.el-table .el-table__row) {
  cursor: pointer;
}

.change-page :deep(.el-table .is-current) {
  background: #eef2ff !important;
}

.library-wrap.is-table .settings-toolbar {
  flex-shrink: 0;
  margin-bottom: 8px;
  justify-content: flex-start;
}

.table-fill {
  flex: 1;
  min-height: 0;
}
.lib-case-expand {
  padding: 8px 12px 12px;
}

.rk-pill {
  display: inline-block;
  padding: 0 6px;
  font-size: 11px;
  line-height: 18px;
  border-radius: 4px;
  background: #ede9fe;
  color: #5b21b6;
}

.library-wrap :deep(.el-table td.el-table__cell) {
  vertical-align: top;
  height: auto;
  overflow: hidden;
}

.source-tag {
  font-size: 11px;
  color: #64748b;
}
.source-tag.is-import {
  color: #2563eb;
}
.source-tag.is-generated {
  color: #9333ea;
}

.library-wrap :deep(.el-table .cell) {
  overflow: hidden;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}

.mind-card {
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #f8fafc;
}

.mind-table {
  min-width: 720px;
}

.mind-row {
  display: grid;
  grid-template-columns: minmax(240px, 1.5fr) 72px minmax(0, 1.4fr) 148px;
  gap: 8px;
  align-items: center;
  padding: 8px 18px;
  border-bottom: 1px solid var(--settings-border);
  font-size: 13px;
}

.mind-row.is-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fbfdff;
  color: var(--settings-muted);
  font-size: 11px;
  font-weight: 700;
}

.mind-row.is-module {
  background: #f8fafc;
}

.mind-row.is-feature strong {
  font-weight: 650;
}

.mind-row.is-req,
.mind-row.is-point,
.mind-row.is-case,
.mind-row.is-orphan {
  color: var(--settings-text);
}

.mind-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mind-name strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.mind-toggle {
  width: 18px;
  border: 0;
  background: transparent;
  color: var(--settings-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.mind-toggle.is-leaf {
  visibility: hidden;
}

.mind-kind {
  color: var(--settings-muted);
  font-size: 12px;
}

.mind-note {
  color: var(--settings-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mind-act {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.change-card h3 {
  margin: 4px 0 6px;
  font-size: 16px;
}

.atlas-diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin-top: 14px;
  border: 1px solid var(--settings-border);
  border-radius: 12px;
  overflow: hidden;
  background: #f8fafc;
}

.atlas-diff-col + .atlas-diff-col {
  border-left: 1px solid var(--settings-border);
}

.atlas-diff-head {
  padding: 8px 12px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
  font-weight: 800;
}

.atlas-diff-line {
  min-height: 28px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-bottom: 1px solid #eef2f7;
  font-size: 12px;
}

.atlas-diff-name {
  display: block;
  overflow-wrap: anywhere;
}

.atlas-diff-gap {
  display: block;
  width: 100%;
  height: 16px;
}

.atlas-diff-line.add .atlas-diff-name {
  background: #ecfdf5;
  color: #047857;
}

.atlas-diff-col:first-child .atlas-diff-line.add {
  background: repeating-linear-gradient(-45deg, #f8fafc, #f8fafc 6px, #eef2f7 6px, #eef2f7 12px);
}

.atlas-diff-col:last-child .atlas-diff-line.add {
  background: #ecfdf5;
}

.atlas-diff-col:first-child .atlas-diff-line.remove {
  background: #fef2f2;
}

.atlas-diff-col:last-child .atlas-diff-line.remove {
  background: repeating-linear-gradient(-45deg, #f8fafc, #f8fafc 6px, #eef2f7 6px, #eef2f7 12px);
}

.atlas-diff-line.remove .atlas-diff-name {
  color: #b91c1c;
}

.atlas-diff-line.update {
  background: #eef2ff;
}

.ghost-pill {
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid var(--settings-border);
  border-radius: 999px;
  background: #fff;
  color: var(--settings-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.role-meta-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.role-meta-head h3 {
  margin: 4px 0 6px;
  font-size: 18px;
}

.role-meta-head p {
  margin: 0;
  color: var(--settings-muted);
}

.empty-hint {
  color: var(--settings-muted);
  font-size: 13px;
}

h4 {
  margin: 14px 0 8px;
  font-size: 13px;
}

.log-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  flex-shrink: 0;
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--settings-border);
  color: var(--settings-muted);
  font-size: 12px;
}

.log-kicker {
  font-weight: 700;
  color: #6b7280;
}

.tick-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tick-cancel {
  border: 0;
  background: transparent;
  color: #b91c1c;
  cursor: pointer;
  font: inherit;
  padding: 0;
}

.tick-cancel:hover {
  text-decoration: underline;
}

.alias-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.alias-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alias-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: 1px solid var(--settings-border);
  border-radius: 10px;
}

.alias-main {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
  font-size: 13px;
}

.alias-acts {
  display: flex;
  gap: 6px;
}

.alias-acts .tiny {
  border: 0;
  background: transparent;
  color: #4f46e5;
  cursor: pointer;
  font: inherit;
  padding: 0;
}

.alias-acts .tiny.danger {
  color: #b91c1c;
}

@media (max-width: 900px) {
  .atlas-diff {
    grid-template-columns: 1fr;
  }

  .atlas-diff-col + .atlas-diff-col {
    border-left: 0;
    border-top: 1px solid var(--settings-border);
  }

  .mind-row {
    grid-template-columns: minmax(0, 1fr) 64px;
  }

  .mind-note,
  .mind-act {
    grid-column: 1 / -1;
    padding-left: 26px;
    justify-content: flex-start;
  }
}

.hint {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--settings-muted);
}

.wiki-link {
  font-size: 12px;
  color: var(--el-color-primary);
  white-space: nowrap;
  align-self: center;
}
</style>
