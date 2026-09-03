<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { cancelQaProcessJob, deleteAtlasAlias, listAtlasAliases, publishQaMindmap, reviewAtlasPatch, runQaProcessTick, updateAtlasAlias } from '@/api/appAutomation'
import { openExternalUrl } from '@/utils/openExternal'
import { useQaProcess } from '@/composables/useQaProcess'
import {
  assignCasesToAtlas,
  atlasBoard,
  atlasCascaderOptions,
  flattenAtlas,
  mindBoard,
  MIND_PLATFORMS,
  moduleLabel,
  pathParts,
  platformLabel,
} from '@/utils/appAtlas'
import { generatedCasesFromProcess, previousRelease, sortReleases } from '@/utils/qaProcess'
import { slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import CaseMultilineCell from '@/components/CaseMultilineCell.vue'
import CaseAlignedFieldCell from '@/components/CaseAlignedFieldCell.vue'
import CasePairedEditor from '@/components/CasePairedEditor.vue'
import AtlasBoardView from '@/views/Testing/AtlasBoardView.vue'
import AtlasChangeReview from '@/views/Testing/AtlasChangeReview.vue'
import CoverImportDialog from '@/views/Testing/CoverImportDialog.vue'
import WikiHistoryDialog from '@/views/Testing/WikiHistoryDialog.vue'
import HintFold from '@/components/HintFold.vue'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '应用' },
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
})

const emit = defineEmits(['open-req'])

const VIEWS = [
  { id: 'atlas', label: '应用图谱', desc: '多层模块骨架' },
  { id: 'mindmap', label: '脑图', desc: '按端拆开的测试点' },
  { id: 'library', label: '用例库', desc: '测试点的延伸' },
]

const route = useRoute()
const router = useRouter()
const appIdRef = computed(() => props.appId)
const {
  requirements,
  releases,
  appAtlas,
  atlasPatches,
  loading,
  load,
  apply,
  persistSoon,
} = useQaProcess(appIdRef)

const ticking = ref(false)
const lastTick = ref('')
const tickProgress = ref(null)
let tickAbort = null
const aliasRows = ref([])
const aliasLoading = ref(false)
const aliasFilter = ref('approved')

const loadAliases = async () => {
  if (!props.appId) return
  aliasLoading.value = true
  try {
    const res = await listAtlasAliases(props.appId, { status: aliasFilter.value || undefined })
    aliasRows.value = res?.data?.items || []
  } catch (_) {
    aliasRows.value = []
  } finally {
    aliasLoading.value = false
  }
}

const setAliasStatus = async (row, status) => {
  try {
    await updateAtlasAlias(props.appId, row.id, { review_status: status })
    await loadAliases()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '更新失败')
  }
}

const removeAlias = async (row) => {
  try {
    await deleteAtlasAlias(props.appId, row.id)
    await loadAliases()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '删除失败')
  }
}
const view = ref('atlas')
const selectedReqId = ref('')
const cases = computed(() => generatedCasesFromProcess(requirements.value))
const layoutMode = ref('outline')
const caseQuery = ref('')
const filterPath = ref([])
const casePage = ref(1)
const casePageSize = ref(20)
const atlasVersionId = ref('')
const selectedPlatform = ref('')
const coverImportOpen = ref(false)
const coverImportKind = ref('mindmap')
const openCoverImport = (kind) => {
  if (!requirements.value.length) {
    ElMessage.warning('请先有一条需求')
    return
  }
  coverImportKind.value = kind
  coverImportOpen.value = true
}
const onCoverImported = (data) => {
  if (data?.qa_process) apply(data.qa_process)
  // 待确认的图谱变更只在「应用图谱」页显示，导入完停在脑图页就看不到它。
  if (data?.atlas === 'patch' || data?.atlas === 'pending') setView('atlas')
}
const wikiPublishing = ref(false)
const wikiHistoryOpen = ref(false)
const wikiHistoryCount = computed(() => {
  const rows = selectedReq.value?.mindmap_wiki_history
  if (Array.isArray(rows) && rows.length) return rows.length
  return selectedReq.value?.mindmap_wiki?.url ? 1 : 0
})
const publishMindmapToWiki = async () => {
  const req = selectedReq.value
  if (!req) {
    ElMessage.warning('请先选一条需求')
    return
  }
  const mind = req.mindmap
  const hasMind = mind && typeof mind === 'object' && (mind.children?.length || mind.text || mind.title)
  if (!hasMind) {
    ElMessage.warning('这条需求还没有脑图')
    return
  }
  if (wikiPublishing.value || ticking.value) return
  wikiPublishing.value = true
  try {
    const res = await publishQaMindmap(props.appId, {
      requirement_id: req.id,
      release_id: req.release_id || atlasVersionId.value || '',
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

const selectedReq = computed(() => {
  if (selectedReqId.value) return requirements.value.find((r) => r.id === selectedReqId.value) || null
  if (view.value === 'mindmap') return null
  return requirements.value[0] || null
})
const pageTitle = computed(() => {
  if (!props.hideNav) return '用例'
  if (view.value === 'library') return '用例库'
  return VIEWS.find((v) => v.id === view.value)?.label || '用例'
})
const pendingPatches = computed(() => (atlasPatches.value || []).filter((p) => p.status === 'pending'))
const versionOptions = computed(() => sortReleases(releases.value))
const latestRelease = computed(() => versionOptions.value[versionOptions.value.length - 1] || null)
const activeRelease = computed(() => versionOptions.value.find((r) => r.id === atlasVersionId.value) || latestRelease.value || null)
const versionAtlas = computed(() => {
  const rel = activeRelease.value
  if (rel?.atlas && Array.isArray(rel.atlas.modules) && rel.atlas.modules.length) return rel.atlas
  return appAtlas.value
})
const caseAssign = computed(() => assignCasesToAtlas(versionAtlas.value, cases.value, requirements.value))

const prevRelease = computed(() => previousRelease(releases.value, activeRelease.value))
const atlasRoot = computed(() => atlasBoard(versionAtlas.value, {
  stripNames: [props.projectName, props.appName],
}))
const mindRoot = computed(() => mindBoard(requirements.value, versionAtlas.value, {
  focusReqId: selectedReqId.value,
  prevAtlas: prevRelease.value?.atlas || null,
  platform: selectedPlatform.value,
  projectName: props.projectName,
  appName: props.appName,
}))
const boardRoot = computed(() => (view.value === 'mindmap' ? mindRoot.value : atlasRoot.value))

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

const onLibraryCaseChange = (row, fields) => {
  const reqId = row?.requirement_id
  if (!reqId) return
  const req = requirements.value.find((r) => r.id === reqId)
  if (!req) return
  const cases = (req.draft_cases || []).map((c) => (
    String(c.case_id) === String(row.case_id) ? { ...c, ...fields } : c
  ))
  const i = requirements.value.findIndex((r) => r.id === req.id)
  if (i >= 0) requirements.value.splice(i, 1, { ...req, draft_cases: cases })
  persistSoon()
}

const syncViewFromRoute = () => {
  const raw = String(route.query.view || '')
  const mapped = raw === 'features' ? 'atlas' : raw === 'reqs' ? 'mindmap' : raw === 'changes' ? 'atlas' : raw
  const fromBookmark = raw === 'sync' || raw === 'feishu'
  view.value = fromBookmark ? 'library' : (VIEWS.some((v) => v.id === mapped) ? mapped : 'atlas')
  if (route.query.rid) selectedReqId.value = String(route.query.rid)
}

const pushView = () => {
  const next = { ...route.query, tab: 'cases', view: view.value }
  if (selectedReqId.value) next.rid = selectedReqId.value
  else delete next.rid
  delete next.refsrc
  delete next.nid
  delete next.nk
  router.replace({ name: 'TestingApp', params: { appId: props.appId }, query: next })
}

const setView = (id) => {
  view.value = id
  pushView()
}

const reviewingPatch = ref(false)
const rejectOpen = ref(false)
const rejectTarget = ref(null)
const rejectNote = ref('')

const openPendingChange = () => {
  const hit = pendingPatches.value.find((p) => p.source?.req_id) || pendingPatches.value[0]
  emit('open-req', hit?.source?.req_id || '')
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
    if (action === 'accept' || action === 'reject') await loadAliases()
    if (action === 'reject') {
      ElMessage.success(extra.rerun !== false ? '已驳回，正在按你的说明重跑分析' : '已驳回这次变更')
    } else {
      ElMessage.success('图谱已确认。单据里点「评审通过」才会进入写脑图和用例。')
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
  await loadAliases()
})

onMounted(async () => {
  syncViewFromRoute()
  await load()
  await loadAliases()
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
        <button v-if="view === 'library'" type="button" class="settings-action-pill" @click="openNewRun()">
          去执行批次
          <span class="settings-action-arrow">→</span>
        </button>
      </div>
    </header>

    <div v-if="!hideNav" class="settings-tabbar is-compact">
      <button
        v-for="item in VIEWS"
        :key="item.id"
        type="button"
        class="settings-tab"
        :class="{ active: view === item.id }"
        @click="setView(item.id)"
      >
        <strong>{{ item.label }}</strong>
        <span>{{ item.desc }}</span>
      </button>
    </div>
    <div v-if="view === 'atlas' || view === 'mindmap'" class="mode-row">
      <button type="button" class="ghost-pill" :class="{ on: layoutMode === 'outline' }" @click="layoutMode = 'outline'">列表</button>
      <button type="button" class="ghost-pill" :class="{ on: layoutMode === 'tree' }" @click="layoutMode = 'tree'">脑图</button>
      <el-select
        v-if="view === 'mindmap' && requirements.length"
        v-model="selectedReqId"
        size="small"
        class="req-select"
        placeholder="选择需求"
      >
        <el-option label="全部需求" value="" />
        <el-option v-for="req in requirements" :key="req.id" :label="req.title || req.id" :value="req.id" />
      </el-select>
      <el-select
        v-if="view === 'mindmap'"
        v-model="selectedPlatform"
        size="small"
        class="req-select"
        placeholder="全部端"
        clearable
      >
        <el-option label="全部端" value="" />
        <el-option v-for="p in MIND_PLATFORMS" :key="p.id" :label="p.label" :value="p.id" />
      </el-select>
      <el-button v-if="view === 'mindmap'" size="small" @click="openCoverImport('mindmap')">导入脑图</el-button>
      <el-button
        v-if="view === 'mindmap'"
        size="small"
        type="primary"
        :loading="wikiPublishing"
        :disabled="wikiPublishing || ticking"
        @click="publishMindmapToWiki"
      >{{ selectedReq?.mindmap_wiki?.url ? '更新飞书 Wiki' : '写入飞书 Wiki' }}</el-button>
      <el-button
        v-if="view === 'mindmap' && wikiHistoryCount"
        size="small"
        :disabled="wikiPublishing"
        @click="wikiHistoryOpen = true"
      >写入历史 · {{ wikiHistoryCount }}</el-button>
      <a
        v-if="view === 'mindmap' && selectedReq?.mindmap_wiki?.url"
        class="wiki-link"
        href="#"
        @click.prevent="openExternalUrl(selectedReq.mindmap_wiki.url)"
      >打开飞书脑图</a>
    </div>

    <section v-if="view === 'library'" class="library-wrap is-table">
      <section v-if="!libraryRows.length" class="settings-card">
        <p class="settings-page-desc">暂无数据</p>
        <el-button size="small" @click="openCoverImport('cases')">导入用例</el-button>
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
            <el-button size="small" @click="openCoverImport('cases')">导入用例</el-button>
          </div>
        </div>
        <div class="table-fill">
          <el-table :data="pagedCases" size="small" border stripe height="100%" row-key="_rowKey" empty-text="没有符合筛选的用例">
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="lib-case-expand">
                  <CasePairedEditor :row="row" @change="(fields) => onLibraryCaseChange(row, fields)" />
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

    <section v-else class="mind-page">
      <HintFold
        v-if="view === 'atlas'"
        title="命名别名"
        :summary="aliasRows.length ? `${aliasRows.length} 条（确认图谱变更后沉淀）` : '还没有学到的别名'"
      >
        <div class="alias-toolbar">
          <button type="button" class="ghost-pill" :class="{ on: aliasFilter === 'approved' }" @click="aliasFilter = 'approved'; loadAliases()">已通过</button>
          <button type="button" class="ghost-pill" :class="{ on: aliasFilter === 'rejected' }" @click="aliasFilter = 'rejected'; loadAliases()">已驳回</button>
          <button type="button" class="ghost-pill" :class="{ on: !aliasFilter }" @click="aliasFilter = ''; loadAliases()">全部</button>
          <el-button size="small" :loading="aliasLoading" @click="loadAliases">刷新</el-button>
        </div>
        <p v-if="!aliasRows.length" class="empty-hint">暂无数据</p>
        <div v-else class="alias-table">
          <div v-for="row in aliasRows" :key="row.id" class="alias-row">
            <div class="alias-main">
              <strong>「{{ row.alias }}」</strong>
              <span>→ {{ (row.target_path || []).join(' / ') || row.target_id }}</span>
              <span class="muted"> · 命中 {{ row.hits || 0 }} · {{ row.review_status }}</span>
            </div>
            <div class="alias-acts">
              <button v-if="row.review_status !== 'approved'" type="button" class="tiny" @click="setAliasStatus(row, 'approved')">启用</button>
              <button v-if="row.review_status !== 'rejected'" type="button" class="tiny" @click="setAliasStatus(row, 'rejected')">停用</button>
              <button type="button" class="tiny danger" @click="removeAlias(row)">删除</button>
            </div>
          </div>
        </div>
      </HintFold>
      <section v-if="pendingPatches.length && view === 'atlas'" class="atlas-review">
        <div class="settings-kicker">待确认图谱 {{ pendingPatches.length }}</div>
        <AtlasChangeReview
          v-for="patch in pendingPatches"
          :key="patch.id"
          :patch="patch"
          :requirements="requirements"
          :reviewing="reviewingPatch"
          @accept="onAcceptPatch"
          @reject="openReject"
        />
        <button type="button" class="ghost-pill" @click="openPendingChange">去对应单据</button>
      </section>
      <p v-if="!(boardRoot.children || []).length" class="settings-page-desc">暂无数据</p>
      <section v-else class="settings-card is-fill mind-card">
        <AtlasBoardView :root="boardRoot" :mode="layoutMode" :focus-req="Boolean(selectedReqId)" />
      </section>
    </section>
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
    <CoverImportDialog
      v-model="coverImportOpen"
      :app-id="appId"
      :kind="coverImportKind"
      :requirement-id="selectedReqId || selectedReq?.id || ''"
      :requirements="requirements"
      @imported="onCoverImported"
    />
    <WikiHistoryDialog
      v-model="wikiHistoryOpen"
      :requirement="selectedReq"
      :app-id="appId"
      @updated="(qa) => qa && apply(qa)"
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

.library-wrap :deep(.el-table td.el-table__cell) {
  vertical-align: top;
  height: auto;
  overflow: hidden;
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
