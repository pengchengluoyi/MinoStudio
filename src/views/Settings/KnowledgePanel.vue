<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getTestingKnowledge, upsertKnowledgeItem, deleteKnowledgeItem, reviewKnowledgeItem, autoReviewKnowledge } from '@/api/settings'
import { getProjectAccounts } from '@/api/workReport'
import { loadKnowledgeJobSettings, persistKnowledgeJobSettings } from '@/utils/knowledgeJobs'
import { clipText, slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import './settings-ui.css'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  /** 仅展示/维护该应用专属知识 */
  appId: { type: String, default: '' },
  projectId: { type: String, default: '' },
  appOnly: { type: Boolean, default: false },
  appName: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
  reviewFilter: { type: String, default: '' },
  /** 锁在某一分类（如「应用基础逻辑」），与其它知识分开展示 */
  categoryLock: { type: String, default: '' },
})

const CATEGORY_OPTIONS = ['应用基础逻辑', '业务逻辑', 'UI导航', '登录注册', 'Tab切换', '交互规范', '其他']
const SOURCE_LABEL = {
  manual: '手动添加',
  case_run: '用例执行',
  task_run: '任务汇总',
  requirement: '需求文档',
  release: '发版说明',
  doc: '技术文档',
  trace: '执行轨迹',
  login_learn: '登录学习',
}
const PROPOSAL_LABEL = { align: '对齐', conflict: '冲突', new_fact: '新事实' }
const FACET_OPTIONS = [
  { id: 'chrome', label: '壳层交互' },
  { id: 'server', label: '服务口径' },
  { id: 'hybrid', label: '端到端' },
  { id: 'exception', label: '例外处理' },
]
const NEED_OPTIONS = [
  { id: 'fill', label: '填入' },
  { id: 'judge_selected', label: '判断选中' },
  { id: 'judge', label: '判断' },
  { id: 'howto', label: '路径' },
]
const SLOT_OPTIONS = [
  { id: 'identity.otp', label: '一次性口令' },
  { id: 'identity.phone', label: '登录标识' },
  { id: 'identity.password', label: '密码' },
]
const SURFACE_OPTIONS = [
  { id: 'app', label: 'App' },
  { id: 'web', label: 'Web' },
]
const ENV_OPTIONS = [
  { id: 'test', label: '测试' },
  { id: 'staging', label: '预发' },
  { id: 'prod', label: '生产' },
]
const FACET_LABEL = Object.fromEntries(FACET_OPTIONS.map((x) => [x.id, x.label]))
const NEED_LABEL = Object.fromEntries(NEED_OPTIONS.map((x) => [x.id, x.label]))
const SLOT_LABEL = Object.fromEntries(SLOT_OPTIONS.map((x) => [x.id, x.label]))

function emptySituation() {
  return { surface: '', lane: '', need: '', slot: '', screen_role: '' }
}
function emptyBind() {
  return { slot: '', value: '', env: '', surface: '' }
}
function ensureSituationFields(row) {
  const sit = row?.situation && typeof row.situation === 'object' ? row.situation : {}
  const bind = row?.bind && typeof row.bind === 'object' ? row.bind : {}
  return {
    ...row,
    facet: row?.facet || '',
    situation: { ...emptySituation(), ...sit },
    bind: { ...emptyBind(), ...bind },
  }
}
function situationBrief(row) {
  const bind = row?.bind || {}
  const sit = row?.situation || {}
  const facet = FACET_LABEL[row?.facet] || ''
  const need = NEED_LABEL[sit.need] || ''
  const slot = SLOT_LABEL[bind.slot || sit.slot] || ''
  const val = String(bind.value || '').trim()
  const parts = [facet, need, slot].filter(Boolean)
  if (val) parts.push(val)
  return parts.join(' · ')
}
function versionBrief(row) {
  const from = String(row?.valid_from || '').trim()
  const until = String(row?.invalid_from || '').trim()
  if (row?.superseded_by) return '已作废'
  if (!from && !until) return ''
  if (from && until) return `${from}–${until}`
  if (from) return `≥${from}`
  return `<${until}`
}
function proposalLabel(row) {
  return PROPOSAL_LABEL[row?.proposal_kind] || ''
}
function situationPayload(row) {
  const sit = row?.situation || {}
  const bind = row?.bind || {}
  const situation = {}
  for (const key of ['surface', 'lane', 'need', 'slot', 'screen_role']) {
    if (sit[key]) situation[key] = sit[key]
  }
  const nextBind = {}
  if (bind.slot) nextBind.slot = bind.slot
  if (String(bind.value || '').trim()) nextBind.value = String(bind.value).trim()
  if (bind.env) nextBind.env = bind.env
  if (bind.surface) nextBind.surface = bind.surface
  if (!nextBind.surface && sit.surface && (nextBind.value || nextBind.slot)) {
    nextBind.surface = sit.surface
  }
  return {
    facet: row?.facet || '',
    situation,
    bind: nextBind,
  }
}
const REVIEW_LABEL = { pending: '待审核', approved: '已通过', rejected: '已驳回' }

const loading = ref(false)
const savingItem = ref(false)
const autoReviewing = ref(false)
const savingJobs = ref(false)
const jobSettings = ref({ capture_enabled: true, review_enabled: true })
const accounts = ref([])
const selectedAccountId = ref('')
const allItems = ref([])
const listFilter = ref(props.reviewFilter === 'all' ? 'all' : 'pending')
watch(() => props.reviewFilter, (v) => {
  if (v === 'pending' || v === 'all') listFilter.value = v
})
const query = ref('')
const categoryFilter = ref('')
const sourceFilter = ref('')
const configDialogVisible = ref(false)
const dialogMode = ref('view') // view | edit | review | create
const editingRow = ref(null) // draft
const editingTargetRow = ref(null) // edit 时引用原始行；create 时为 null
const SOURCE_OPTIONS = Object.entries(SOURCE_LABEL).map(([id, label]) => ({ id, label }))

const normalizeRow = (x) => ensureSituationFields({
  ...x,
  category: x.category || '其他',
  tagsText: (x.tags || []).join(', '),
  appIdsText: (x.app_ids || []).join(', '),
  source: x.source || 'manual',
  review_status: x.review_status || 'approved',
  proposal_kind: x.proposal_kind || '',
  valid_from: x.valid_from || '',
  invalid_from: x.invalid_from || '',
})

const globalItems = computed(() =>
  allItems.value.filter((r) => !String(r.appIdsText || '').trim() && !(r.app_ids || []).length),
)

const appItems = computed(() => {
  if (!props.appId) {
    return allItems.value.filter(
      (r) => String(r.appIdsText || '').trim() || (r.app_ids || []).length,
    )
  }
  return allItems.value.filter((r) => {
    const ids = (r.app_ids || []).length
      ? r.app_ids
      : String(r.appIdsText || '')
          .split(/[,，、\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
    return ids.includes(props.appId)
  })
})

const sourcePool = computed(() => {
  const rows = props.appOnly ? appItems.value : props.embedded ? globalItems.value : allItems.value
  if (props.categoryLock) {
    return rows.filter((r) => r.category === props.categoryLock)
  }
  return rows
})
const visibleItems = computed(() => filterPool(sourcePool.value))
const page = ref(1)
const pageSize = ref(20)
const pagedItems = computed(() => slicePage(visibleItems.value, page.value, pageSize.value))
const showAppColumn = computed(() => !props.embedded)
const pageTitle = computed(() => {
  if (props.categoryLock) return props.categoryLock
  if (props.appOnly) return '应用知识库'
  if (props.embedded) return '全局知识库'
  return '知识库'
})
const createLabel = computed(() => (props.categoryLock ? '新建' : (props.embedded ? '新建' : '新建条目')))

function filterPool(list) {
  let rows = list
  if (props.categoryLock) {
    rows = list.filter((r) => r.review_status !== 'rejected')
  } else if (listFilter.value === 'pending') {
    rows = list.filter((r) => r.review_status === 'pending')
  } else {
    rows = list.filter((r) => r.review_status !== 'pending')
  }
  if (!props.categoryLock && categoryFilter.value) {
    rows = rows.filter((r) => r.category === categoryFilter.value)
  }
  if (sourceFilter.value) rows = rows.filter((r) => (r.source || 'manual') === sourceFilter.value)
  const q = query.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter((r) => [r.title, r.content, r.tagsText, r.category].join('\n').toLowerCase().includes(q))
  }
  return rows
}
const pendingCount = computed(() => sourcePool.value.filter((r) => r.review_status === 'pending').length)
const sourceLabel = (row) => SOURCE_LABEL[row?.source] || SOURCE_LABEL.manual
const reviewLabel = (row) => {
  if (row?.superseded_by) return '已作废'
  return REVIEW_LABEL[row?.review_status] || REVIEW_LABEL.approved
}
const reviewMethodLabel = (row) => {
  if (row?.review_method === 'machine') {
    const n = Number(row.review_confidence)
    const bit = Number.isFinite(n) ? ` ${n}` : ''
    if (row.review_status === 'pending') return `机审留人${bit}`
    return `机审${bit}`
  }
  if (row?.review_method === 'human') return '人工'
  return '—'
}
const metaEditable = computed(() => dialogMode.value === 'edit' || dialogMode.value === 'create' || dialogMode.value === 'review')
const contentEditable = computed(() => dialogMode.value !== 'view')
const dialogTitle = computed(() => {
  if (dialogMode.value === 'review') return '审核知识'
  if (dialogMode.value === 'create') return '新建知识'
  if (dialogMode.value === 'edit') return '修改知识'
  return '查看知识'
})
const emptyText = computed(() => {
  if (query.value || categoryFilter.value || sourceFilter.value) return '暂无数据'
  if (props.categoryLock === '应用基础逻辑') return '暂无数据'
  return listFilter.value === 'pending' ? '暂无待审核' : '暂无数据'
})

const contentPreview = (text) => clipText(text, 72)

const onCreate = () => {
  if (props.appOnly) addAppRow()
  else addGlobalRow()
}

const selectedAccount = computed(() => accounts.value.find((a) => a.id === selectedAccountId.value) || null)
const accountLabel = (row) => {
  const ident = String(row?.email || row?.phone || row?.username || row?.name || '').trim()
  const env = String(row?.env || '').trim()
  return env ? `${ident} · ${env}` : ident || row?.id || '未填号码'
}
const jobScope = () => {
  const acc = selectedAccount.value
  return {
    account_id: acc?.id || '',
    account_ident: acc ? (acc.email || acc.phone || acc.username || acc.name || '') : '',
    project_id: props.projectId || '',
    app_id: props.appId || '',
  }
}
const loadAccounts = async () => {
  if (!props.projectId) {
    accounts.value = []
    selectedAccountId.value = ''
    return
  }
  try {
    const res = await getProjectAccounts(props.projectId)
    accounts.value = res?.data?.accounts || []
    if (selectedAccountId.value && !accounts.value.some((a) => a.id === selectedAccountId.value)) {
      selectedAccountId.value = ''
    }
    if (!selectedAccountId.value && accounts.value.length) {
      selectedAccountId.value = accounts.value[0].id
    }
  } catch (_) {
    accounts.value = []
  }
}

const load = async () => {
  loading.value = true
  try {
    await loadAccounts()
    const acc = selectedAccount.value
    const res = await getTestingKnowledge(props.appId, acc?.id || '')
    allItems.value = (res?.data?.items || []).map(normalizeRow)
    try {
      jobSettings.value = await loadKnowledgeJobSettings(jobScope())
    } catch (_) { /* 开关读失败不挡列表 */ }
  } finally {
    loading.value = false
  }
}

const saveJobSettings = async () => {
  if (!selectedAccount.value?.id) {
    ElMessage.warning('请选择应用登录账号')
    await load()
    return
  }
  savingJobs.value = true
  try {
    jobSettings.value = await persistKnowledgeJobSettings({
      capture_enabled: jobSettings.value.capture_enabled,
      review_enabled: jobSettings.value.review_enabled,
    }, jobScope())
    ElMessage.success('已生效')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
    await load()
  } finally {
    savingJobs.value = false
  }
}

const runAutoReview = async () => {
  if (autoReviewing.value || !pendingCount.value) return
  autoReviewing.value = true
  try {
    const res = await autoReviewKnowledge(props.appOnly ? props.appId : '', selectedAccount.value?.id || '')
    const data = res?.data || {}
    const approved = Number(data.approved || 0)
    const rejected = Number(data.rejected || 0)
    const held = Number(data.held || 0)
    const skipped = Number(data.skipped || 0)
    ElMessage.success(`机审完成：通过 ${approved} · 驳回 ${rejected} · 留人 ${held}${skipped ? ` · 未跑 ${skipped}` : ''}`)
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '机审失败')
  } finally {
    autoReviewing.value = false
  }
}

const cloneRow = (row) => ensureSituationFields({
  ...row,
  category: row.category || '其他',
  tagsText: row.tagsText || '',
  appIdsText: row.appIdsText || '',
  enabled: row.enabled !== false,
})

function onBindSlot(slot) {
  if (!editingRow.value) return
  editingRow.value.bind.slot = slot || ''
  if (slot && !editingRow.value.situation.slot) editingRow.value.situation.slot = slot
  if (slot && !editingRow.value.situation.need) editingRow.value.situation.need = 'fill'
  if (slot && !editingRow.value.facet) editingRow.value.facet = 'exception'
}

const openCreateDialog = (rowDraft) => {
  editingTargetRow.value = null
  editingRow.value = cloneRow(rowDraft)
  dialogMode.value = 'create'
  configDialogVisible.value = true
}

const addGlobalRow = () => {
  openCreateDialog({
    id: '',
    title: '',
    content: '',
    category: props.categoryLock || '其他',
    tagsText: '',
    appIdsText: '',
    enabled: true,
    source: 'manual',
    review_status: 'approved',
  })
}

const addAppRow = () => {
  if (!props.appId) return ElMessage.warning('缺少应用 ID')
  openCreateDialog({
    id: '',
    title: '',
    content: '',
    category: props.categoryLock || '其他',
    tagsText: '',
    appIdsText: props.appId,
    app_ids: [props.appId],
    account_id: selectedAccount.value?.id || '',
    account_ident: selectedAccount.value
      ? (selectedAccount.value.email || selectedAccount.value.phone || selectedAccount.value.username || selectedAccount.value.name || '')
      : '',
    enabled: true,
    source: 'manual',
    review_status: 'approved',
  })
}

const removeRow = async (row) => {
  if (row.id) {
    try {
      await deleteKnowledgeItem(row.id)
    } catch (e) {
      ElMessage.error(e?.response?.data?.detail || '删除失败')
      return
    }
  }
  const idx = allItems.value.indexOf(row)
  if (idx >= 0) allItems.value.splice(idx, 1)
}

const openConfig = (row, mode = '') => {
  editingTargetRow.value = row
  editingRow.value = cloneRow(row)
  if (row.review_status === 'pending') dialogMode.value = 'review'
  else dialogMode.value = mode === 'edit' ? 'edit' : 'view'
  configDialogVisible.value = true
}

const openEdit = (row) => openConfig(row, 'edit')

const cancelConfig = () => {
  configDialogVisible.value = false
  dialogMode.value = 'view'
  editingRow.value = null
  editingTargetRow.value = null
}

const saveConfig = async () => {
  if (!editingRow.value) return cancelConfig()
  const title = editingRow.value.title?.trim() || ''
  const content = editingRow.value.content?.trim() || ''
  const category = props.categoryLock || editingRow.value.category || '其他'
  if (!title) {
    ElMessage.warning('标题不能为空')
    return
  }
  if (!content && category !== '应用基础逻辑') {
    ElMessage.warning('「标题」和「知识内容」均不能为空')
    return
  }
  savingItem.value = true
  try {
    const payload = {
      id: editingRow.value.id || '',
      title: title,
      content: content,
      category: category,
      tags: String(editingRow.value.tagsText || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean),
      app_ids: String(editingRow.value.appIdsText || '').split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean),
      enabled: editingRow.value.enabled !== false,
      source: editingRow.value.source || 'manual',
      review_status: editingRow.value.review_status || (editingRow.value.source === 'manual' ? 'approved' : 'pending'),
      proposal_kind: editingRow.value.proposal_kind || '',
      valid_from: String(editingRow.value.valid_from || '').trim(),
      invalid_from: String(editingRow.value.invalid_from || '').trim(),
      ...situationPayload(editingRow.value),
      account_id: editingRow.value.account_id || selectedAccount.value?.id || '',
      account_ident: editingRow.value.account_ident || (selectedAccount.value
        ? (selectedAccount.value.email || selectedAccount.value.phone || selectedAccount.value.username || selectedAccount.value.name || '')
        : ''),
    }
    const res = await upsertKnowledgeItem(payload)
    const saved = normalizeRow(res?.data?.item || payload)
    if (editingTargetRow.value) {
      Object.assign(editingTargetRow.value, saved)
    } else {
      allItems.value.unshift(saved)
    }
    ElMessage.success('已保存')
    cancelConfig()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    savingItem.value = false
  }
}

const persistEnabled = async (row) => {
  if (!row?.id || row.review_status === 'pending') return
  try {
    await upsertKnowledgeItem({
      id: row.id,
      title: row.title,
      content: row.content || '',
      category: row.category,
      tags: String(row.tagsText || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      app_ids: String(row.appIdsText || '').split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean),
      enabled: row.enabled !== false,
      source: row.source || 'manual',
      review_status: row.review_status || 'approved',
    })
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '更新失败')
    row.enabled = !row.enabled
  }
}

const approveRow = async (row, extra = {}) => {
  if (!row?.id) return
  savingItem.value = true
  try {
    const res = await reviewKnowledgeItem(row.id, {
      action: 'approve',
      title: extra.title ?? row.title,
      content: extra.content ?? row.content,
      category: extra.category ?? row.category,
        tags: String(extra.tagsText ?? row.tagsText ?? '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
    })
    Object.assign(row, normalizeRow(res?.data?.item || { ...row, review_status: 'approved' }))
    ElMessage.success('已通过，可被执行匹配')
    if (editingTargetRow.value === row) cancelConfig()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '审核失败')
  } finally {
    savingItem.value = false
  }
}

const rejectRow = async (row) => {
  if (!row?.id) return
  savingItem.value = true
  try {
    await reviewKnowledgeItem(row.id, { action: 'reject' })
    const idx = allItems.value.indexOf(row)
    if (idx >= 0) allItems.value.splice(idx, 1)
    ElMessage.success('已驳回并删除')
    if (editingTargetRow.value === row) cancelConfig()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '驳回失败')
  } finally {
    savingItem.value = false
  }
}

const beforeDialogClose = (done) => {
  editingRow.value = null
  editingTargetRow.value = null
  dialogMode.value = 'view'
  done()
}

onMounted(async () => {
  await load()
})

watch(() => props.appId, () => {
  load()
})

watch(() => props.projectId, () => {
  selectedAccountId.value = ''
  load()
})

watch([listFilter, query, categoryFilter, sourceFilter, () => visibleItems.value.length], () => {
  page.value = 1
})
</script>

<template>
  <div class="settings-panel knowledge-panel" :class="{ embedded }" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ pageTitle }}</h2>
      </div>
      <div class="settings-summary-pill" :style="pendingCount ? { background: '#fffbeb', color: '#b45309' } : undefined">
        {{ pendingCount ? `${pendingCount} 条待审核` : '暂无待审核' }}
      </div>
    </header>
    <section v-if="!categoryLock" class="settings-card settings-job-card">
      <span class="settings-kicker">用例执行后</span>
      <div class="settings-job-row">
        <div class="settings-job-copy">
          <h3>应用登录账号</h3>
        </div>
        <el-select
          v-if="accounts.length"
          v-model="selectedAccountId"
          size="small"
          filterable
          placeholder="选择账号"
          style="width: 240px"
          @change="load"
        >
          <el-option v-for="row in accounts" :key="row.id" :label="accountLabel(row)" :value="row.id" />
        </el-select>
        <span v-else class="settings-job-copy"><p>暂无数据</p></span>
      </div>
      <div class="settings-job-row">
        <div class="settings-job-copy">
          <h3>沉淀知识</h3>
        </div>
        <el-switch
          v-model="jobSettings.capture_enabled"
          :loading="savingJobs"
          @change="saveJobSettings"
        />
      </div>
      <div class="settings-job-row">
        <div class="settings-job-copy">
          <h3>知识机审</h3>
        </div>
        <el-switch
          v-model="jobSettings.review_enabled"
          :loading="savingJobs"
          @change="saveJobSettings"
        />
      </div>
    </section>
    <div v-if="!hideNav && !categoryLock" class="settings-tabbar">
      <button type="button" class="settings-tab" :class="{ active: listFilter === 'pending' }" @click="listFilter = 'pending'">
        <strong>待审核</strong>
      </button>
      <button type="button" class="settings-tab" :class="{ active: listFilter === 'all' }" @click="listFilter = 'all'">
        <strong>已通过</strong>
      </button>
    </div>
    <section class="settings-table-card is-fill">
      <div class="settings-toolbar">
        <el-input v-model="query" size="small" clearable placeholder="搜索标题、内容、标签" class="toolbar-search" />
        <el-select v-if="!categoryLock" v-model="categoryFilter" size="small" clearable placeholder="分类">
          <el-option v-for="c in CATEGORY_OPTIONS" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="sourceFilter" size="small" clearable placeholder="来源">
          <el-option v-for="opt in SOURCE_OPTIONS" :key="opt.id" :label="opt.label" :value="opt.id" />
        </el-select>
        <el-button
          v-if="listFilter === 'pending'"
          class="toolbar-push"
          size="small"
          :loading="autoReviewing"
          :disabled="!pendingCount"
          @click="runAutoReview"
        >机审待审</el-button>
        <el-button
          size="small"
          type="primary"
          :class="{ 'toolbar-push': listFilter !== 'pending' }"
          @click="onCreate"
        >{{ createLabel }}</el-button>
      </div>
      <div class="table-wrap">
        <el-table
          :data="pagedItems"
          border
          stripe
          size="small"
          class="col-table"
          height="100%"
          :empty-text="emptyText"
        >
          <el-table-column v-if="!categoryLock" label="分类" width="100" prop="category" show-overflow-tooltip />
          <el-table-column label="标题" min-width="140" show-overflow-tooltip prop="title" />
          <el-table-column label="标签" width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.tagsText || '—' }}</template>
          </el-table-column>
          <el-table-column label="来源" width="92" show-overflow-tooltip>
            <template #default="{ row }">{{ sourceLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="审核" width="88">
            <template #default="{ row }">
              <el-tag size="small" :type="row.superseded_by ? 'info' : (row.review_status === 'pending' ? 'warning' : 'success')">{{ reviewLabel(row) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="机审" width="108" show-overflow-tooltip>
            <template #default="{ row }">
              <span :title="row.review_reason || ''">{{ reviewMethodLabel(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column v-if="showAppColumn" label="限定应用" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.appIdsText || '全局' }}</template>
          </el-table-column>
          <el-table-column label="情境" width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ situationBrief(row) || '—' }}</template>
          </el-table-column>
          <el-table-column label="提案" width="80" show-overflow-tooltip>
            <template #default="{ row }">{{ proposalLabel(row) || '—' }}</template>
          </el-table-column>
          <el-table-column label="版本窗" width="100" show-overflow-tooltip>
            <template #default="{ row }">{{ versionBrief(row) || '—' }}</template>
          </el-table-column>
          <el-table-column label="知识内容" min-width="180">
            <template #default="{ row }">
              <span class="content-preview" :title="row.content">{{ contentPreview(row.content) || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="启用" width="64">
            <template #default="{ row }">
              <el-switch
                v-model="row.enabled"
                size="small"
                :disabled="row.review_status === 'pending'"
                @change="persistEnabled(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="196" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.review_status === 'pending'" link type="primary" size="small" @click="openConfig(row)">审核</el-button>
              <template v-else>
                <el-button link type="primary" size="small" @click="openConfig(row)">查看</el-button>
                <el-button link type="primary" size="small" @click="openEdit(row)">修改</el-button>
              </template>
              <el-button v-if="row.review_status === 'pending'" link type="danger" size="small" @click="rejectRow(row)">驳回</el-button>
              <el-button v-else link type="danger" size="small" @click="removeRow(row)">删</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <el-pagination
        class="settings-table-pager"
        background
        layout="total, sizes, prev, pager, next"
        :total="visibleItems.length"
        :page-sizes="TABLE_PAGE_SIZES"
        v-model:page-size="pageSize"
        v-model:current-page="page"
      />
    </section>

    <el-dialog
      v-model="configDialogVisible"
      :title="dialogTitle"
      width="560px"
      destroy-on-close
      :before-close="beforeDialogClose"
    >
      <el-form v-if="editingRow" label-width="80px">
        <el-form-item label="来源">
          <span>{{ sourceLabel(editingRow) }}</span>
        </el-form-item>
        <el-form-item v-if="editingRow.question" label="提问">
          <p class="desc compact">{{ editingRow.question }}</p>
        </el-form-item>
        <el-form-item v-if="editingRow.review_reason || editingRow.review_method" label="机审">
          <p class="desc compact">{{ reviewMethodLabel(editingRow) }}<template v-if="editingRow.review_reason"> · {{ editingRow.review_reason }}</template></p>
        </el-form-item>
        <el-form-item v-if="editingRow.expert_note" label="产品专家">
          <p class="desc compact">{{ editingRow.expert_note }}</p>
        </el-form-item>
        <el-form-item label="分类">
          <el-select
            v-if="metaEditable"
            v-model="editingRow.category"
            filterable
            allow-create
            :disabled="Boolean(categoryLock)"
            style="width: 100%"
          >
            <el-option v-for="c in CATEGORY_OPTIONS" :key="c" :label="c" :value="c" />
          </el-select>
          <span v-else>{{ editingRow.category || '其他' }}</span>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-if="metaEditable" v-model="editingRow.title" />
          <span v-else>{{ editingRow.title }}</span>
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-if="metaEditable" v-model="editingRow.tagsText" placeholder="登录, tab, 我的" />
          <span v-else>{{ editingRow.tagsText || '—' }}</span>
        </el-form-item>
        <el-form-item label="知识内容">
          <el-input v-if="contentEditable" v-model="editingRow.content" type="textarea" :rows="6" />
          <p v-else class="desc compact">{{ editingRow.content || '—' }}</p>
        </el-form-item>
        <el-form-item label="分面">
          <el-select
            v-if="metaEditable"
            v-model="editingRow.facet"
            clearable
            placeholder="保存时自动抽出"
            style="width: 100%"
          >
            <el-option v-for="c in FACET_OPTIONS" :key="c.id" :label="c.label" :value="c.id" />
          </el-select>
          <span v-else>{{ FACET_LABEL[editingRow.facet] || '—' }}</span>
        </el-form-item>
        <el-form-item label="用途">
          <el-select
            v-if="metaEditable"
            v-model="editingRow.situation.need"
            clearable
            placeholder="填入 / 判断 / 路径"
            style="width: 100%"
          >
            <el-option v-for="c in NEED_OPTIONS" :key="c.id" :label="c.label" :value="c.id" />
          </el-select>
          <span v-else>{{ NEED_LABEL[editingRow.situation.need] || '—' }}</span>
        </el-form-item>
        <el-form-item label="绑定槽">
          <el-select
            v-if="metaEditable"
            v-model="editingRow.bind.slot"
            clearable
            placeholder="可填入的值才需要"
            style="width: 100%"
            @change="onBindSlot"
          >
            <el-option v-for="c in SLOT_OPTIONS" :key="c.id" :label="c.label" :value="c.id" />
          </el-select>
          <span v-else>{{ SLOT_LABEL[editingRow.bind.slot] || SLOT_LABEL[editingRow.situation.slot] || '—' }}</span>
        </el-form-item>
        <el-form-item v-if="metaEditable || editingRow.bind.value" label="绑定值">
          <el-input v-if="metaEditable" v-model="editingRow.bind.value" placeholder="执行时直接填入，例如测试环境口令" />
          <span v-else>{{ editingRow.bind.value }}</span>
        </el-form-item>
        <el-form-item v-if="metaEditable || editingRow.bind.env || editingRow.bind.surface || editingRow.situation.surface" label="范围">
          <div v-if="metaEditable" class="situation-range">
            <el-select v-model="editingRow.bind.env" clearable placeholder="环境" style="width: 48%">
              <el-option v-for="c in ENV_OPTIONS" :key="c.id" :label="c.label" :value="c.id" />
            </el-select>
            <el-select v-model="editingRow.situation.surface" clearable placeholder="端" style="width: 48%">
              <el-option v-for="c in SURFACE_OPTIONS" :key="c.id" :label="c.label" :value="c.id" />
            </el-select>
          </div>
          <span v-else>{{ [ENV_OPTIONS.find((x) => x.id === editingRow.bind.env)?.label, SURFACE_OPTIONS.find((x) => x.id === (editingRow.bind.surface || editingRow.situation.surface))?.label].filter(Boolean).join(' · ') || '—' }}</span>
        </el-form-item>
        <el-form-item v-if="editingRow.proposal_kind || editingRow.conflicts_with" label="提案">
          <p class="desc compact">{{ proposalLabel(editingRow) || '—' }}<template v-if="editingRow.conflicts_with"> · 冲突 {{ editingRow.conflicts_with }}</template></p>
        </el-form-item>
        <el-form-item v-if="metaEditable || editingRow.valid_from || editingRow.invalid_from || editingRow.superseded_by" label="版本窗">
          <div v-if="metaEditable" class="situation-range">
            <el-input v-model="editingRow.valid_from" placeholder="从该版本起有效" style="width: 48%" />
            <el-input v-model="editingRow.invalid_from" placeholder="从该版本起无效" style="width: 48%" />
          </div>
          <span v-else>{{ versionBrief(editingRow) || '—' }}</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editingRow.enabled" :disabled="!contentEditable || editingRow.review_status === 'pending'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelConfig">{{ dialogMode === 'view' ? '关闭' : '取消' }}</el-button>
        <el-button v-if="dialogMode === 'view' && editingRow?.review_status !== 'pending'" type="primary" @click="dialogMode = 'edit'">修改</el-button>
        <template v-else-if="editingRow?.review_status === 'pending' && editingTargetRow">
          <el-button :loading="savingItem" @click="rejectRow(editingTargetRow)">驳回</el-button>
          <el-button type="primary" :loading="savingItem" @click="approveRow(editingTargetRow, editingRow)">审核通过</el-button>
        </template>
        <el-button v-else-if="dialogMode === 'edit' || dialogMode === 'create'" type="primary" :loading="savingItem" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.knowledge-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.knowledge-panel.embedded { padding: 0; }
.knowledge-panel.embedded .settings-page-header { margin-bottom: 8px; }
.knowledge-panel.embedded .settings-tabbar { margin-bottom: 12px; }
.knowledge-panel .settings-page-header,
.knowledge-panel .settings-tabbar,
.knowledge-panel .settings-job-card { flex-shrink: 0; }
.desc { margin: 0 0 12px; color: #6b7280; font-size: 13px; }
.desc.compact { margin-top: 0; }
.knowledge-panel .settings-toolbar { flex-shrink: 0; }
.table-wrap {
  flex: 1;
  min-height: 280px;
  overflow: hidden;
}
.col-table { width: 100%; }
.content-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.45;
}
.head-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
.situation-range {
  display: flex;
  gap: 8px;
  width: 100%;
}
h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
</style>
