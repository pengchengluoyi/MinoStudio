<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Hide, View } from '@element-plus/icons-vue'
import {
  getProjectAccounts,
  getProjectAccountPoolSchema,
  getProjectAccountPoolTemplates,
  getProjectDeviceAppSessions,
  getProjectResourceAllocationLogs,
  restoreProjectAccountFromResourceLog,
  createProjectAccount,
  deleteProjectAccount,
  patchProjectAccount,
  previewProjectAccountsImport,
  commitProjectAccountsImport,
  previewProjectAccountsImportFile,
  commitProjectAccountsImportFile,
  downloadProjectAccountsImportTemplate,
} from '@/api/workReport'
import TestAccountLeaseBadge from '@/components/TestAccountLeaseBadge.vue'
import TestAccountStatus from '@/components/TestAccountStatus.vue'
import ProjectAccountPoolDialog from '@/components/ProjectAccountPoolDialog.vue'
import {
  accountHeadline,
  accountSubline,
  ensureFacetKeys,
  emptyFacetForm,
  extensionFieldDefs,
  facetsForSave,
  ACCOUNT_HEALTH_OPTIONS,
  leaseBadge,
  poolSummary,
  projectOnlyFieldDefs,
  statusDisplayRows,
  templateFieldDefsForRow,
  templateFieldsForTemplate,
} from '@/utils/testAccountFacets'
import { slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import '@/views/Settings/settings-ui.css'

defineOptions({ name: 'AssetsPage' })

const route = useRoute()

const props = defineProps({
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  appId: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
  section: { type: String, default: '' },
})

const emit = defineEmits(['open-session-log'])

const openResourceSessionLog = (row) => {
  const sid = String(row?.session_id || row?.detail?.session_id || '').trim()
  if (!sid) {
    ElMessage.info('该条尚无 Session 轨迹（多为 run 级租号或 session 未落盘）')
    return
  }
  emit('open-session-log', sid)
}

const TABS = [
  { id: 'accounts', label: '账号管理', desc: '号池状态与租约' },
  { id: 'logs', label: '资源日志', desc: '租号 / 模板变更 / 可恢复快照' },
  { id: 'device-apps', label: '机态 App', desc: '设备 × 包名登录登记' },
]

const tab = ref(
  props.section === 'logs' || props.section === 'device-apps'
    ? props.section
    : props.section === 'trial'
      ? 'logs'
      : 'accounts',
)
const pageTitle = computed(() => {
  if (!props.hideNav) return '测试资源'
  if (tab.value === 'logs') return '资源日志'
  if (tab.value === 'device-apps') return '机态 App'
  return '账号管理'
})
watch(() => props.section, (s) => {
  if (s === 'trial' || s === 'logs') tab.value = 'logs'
  else if (s === 'accounts' || s === 'device-apps') tab.value = s
})

const loading = ref(false)
const saving = ref(false)
const accounts = ref([])
const environments = ref([])
const poolTemplates = ref([])
const poolFieldDefs = ref([])
const envFilter = ref('')
const leaseFilter = ref('')
const search = ref('')
const deviceSessions = ref([])
const deviceSessionsHint = ref('')
const deviceSnFilter = ref('')
const resourceLogs = ref([])
const logTotal = ref(0)
const logPage = ref(1)
const logPageSize = ref(20)
const logFilters = ref({
  run_id: '',
  case_id: '',
  action: '',
  account_ident: '',
  sn: '',
  env: '',
})
const LOG_ACTIONS = [
  { value: '', label: '全部操作' },
  { value: 'lease_claim', label: '租号成功' },
  { value: 'lease_release', label: '释放租约' },
  { value: 'lease_fail', label: '租号失败' },
  { value: 'facet_update', label: '模板状态变更' },
  { value: 'facet_restore', label: '从日志恢复' },
]
const RESTORABLE_LOG_ACTIONS = new Set(['facet_update', 'facet_restore'])

/** 与 GET /project/env 一致：字段可能在 data 下，也可能被扁平一层 */
const unwrapApiPayload = (res) => {
  if (!res || typeof res !== 'object') return {}
  const inner = res.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner
  return res
}

const unwrapLogListPayload = (res) => {
  const payload = unwrapApiPayload(res)
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    total: Number(payload.total || 0),
  }
}

/** 是否含可恢复快照（facets 或参数字段任一即可） */
const canRestoreResourceLog = (row) => {
  if (!row?.id || !RESTORABLE_LOG_ACTIONS.has(String(row.action || ''))) return false
  const detail = row.detail
  if (!detail || typeof detail !== 'object') return false
  const recover = detail.recover
  if (!recover || typeof recover !== 'object') return false
  if (String(detail.schema || '') === 'account_template_state_v1') return true
  const facets = recover.facets
  if (facets && typeof facets === 'object' && Object.keys(facets).length) return true
  const fields = recover.fields
  if (fields && typeof fields === 'object' && Object.keys(fields).length) return true
  return Boolean(recover.account_id)
}
const dialogOpen = ref(false)
const poolLocalOpen = ref(false)
const importOpen = ref(false)
const importText = ref('')
const importDup = ref('merge')
const importPreview = ref(null)
const importPreviewing = ref(false)
const importCommitting = ref(false)
const importMode = ref('paste')
const importFile = ref(null)
const importDefaultEnv = ref('test')
const envDefaultProfile = ref('test')

const IMPORT_SAMPLE = `手机号,展示名,登录态,环境,备注
13800000001,测试账号A,logged_out,test,
13800000002,测试账号B,guest,pre,批量导入示例`

const importStats = computed(() => importPreview.value?.stats || {})
const importPreviewRows = computed(() => importPreview.value?.preview || [])
const editingId = ref('')
const form = ref(emptyForm())
const pwdOpen = ref(new Set())
const accountTableRef = ref(null)
const selectedAccounts = ref([])
const bulkEditOpen = ref(false)
const bulkFieldKey = ref('')
const bulkFieldValue = ref('')
const bulkFieldBool = ref(false)
const bulkApplying = ref(false)

const onAccountSelectionChange = (rows) => {
  selectedAccounts.value = Array.isArray(rows) ? rows : []
}

const clearAccountSelection = () => {
  selectedAccounts.value = []
  accountTableRef.value?.clearSelection?.()
}

const bulkFieldOptions = computed(() => {
  const opts = [
    { key: 'env', label: '环境', kind: 'env' },
    { key: 'display_name', label: '展示名', kind: 'text' },
    { key: 'phone', label: '手机号', kind: 'text' },
    { key: 'username', label: '用户名', kind: 'text' },
    { key: 'email', label: '邮箱', kind: 'text' },
    { key: 'password', label: '密码（覆盖）', kind: 'text', secret: true },
    { key: 'otp', label: '验证码', kind: 'text' },
    { key: 'health', label: '健康', kind: 'health' },
    { key: 'note', label: '备注', kind: 'text' },
    { key: 'locked', label: '手动占用', kind: 'bool' },
  ]
  const seen = new Set()
  for (const f of formFieldDefs.value) {
    if (seen.has(f.key)) continue
    seen.add(f.key)
    opts.push({ key: `facet:${f.key}`, label: f.label, kind: 'facet', def: f })
  }
  for (const f of projectExtensionDefs.value) {
    if (seen.has(f.key)) continue
    seen.add(f.key)
    opts.push({ key: `facet:${f.key}`, label: `${f.label}（项目扩展）`, kind: 'facet', def: f })
  }
  return opts
})

const bulkFieldMeta = computed(() =>
  bulkFieldOptions.value.find((o) => o.key === bulkFieldKey.value) || null,
)

const openBulkEdit = () => {
  if (!selectedAccounts.value.length) {
    ElMessage.warning('请先勾选要修改的账号')
    return
  }
  bulkFieldKey.value = bulkFieldOptions.value[0]?.key || ''
  bulkFieldValue.value = ''
  bulkFieldBool.value = false
  bulkEditOpen.value = true
}

watch(bulkFieldKey, () => {
  bulkFieldValue.value = ''
  bulkFieldBool.value = false
})

const buildBulkPatchPayload = () => {
  const meta = bulkFieldMeta.value
  const key = bulkFieldKey.value
  if (!meta || !key) return null
  if (meta.kind === 'bool') {
    return { locked: Boolean(bulkFieldBool.value) }
  }
  if (meta.kind === 'health') {
    const v = String(bulkFieldValue.value || '').trim()
    if (!v) return null
    return { facets: { health: v } }
  }
  if (meta.kind === 'facet') {
    const facetKey = key.slice('facet:'.length)
    const v = bulkFieldValue.value
    if (v === '' || v === null || v === undefined) return null
    return { facets: { [facetKey]: v } }
  }
  const v = String(bulkFieldValue.value ?? '').trim()
  if (meta.kind === 'text' && meta.secret && !v) {
    ElMessage.warning('请填写新密码')
    return null
  }
  if (meta.kind !== 'env' && !v && key !== 'note') {
    ElMessage.warning('请填写新值')
    return null
  }
  return { [key]: v }
}

const applyBulkField = async () => {
  const payload = buildBulkPatchPayload()
  if (!payload) return
  const rows = [...selectedAccounts.value]
  if (!rows.length) return
  const label = bulkFieldMeta.value?.label || bulkFieldKey.value
  try {
    await ElMessageBox.confirm(
      `将 ${rows.length} 条账号的「${label}」批量改为所选值，是否继续？`,
      '批量修改',
      { type: 'warning' },
    )
  } catch {
    return
  }
  bulkApplying.value = true
  let ok = 0
  let fail = 0
  for (const row of rows) {
    try {
      await patchProjectAccount(props.projectId, row.id, payload)
      ok += 1
    } catch {
      fail += 1
    }
  }
  bulkApplying.value = false
  bulkEditOpen.value = false
  await load()
  clearAccountSelection()
  if (fail) ElMessage.warning(`完成：成功 ${ok} 条，失败 ${fail} 条`)
  else ElMessage.success(`已更新 ${ok} 条账号`)
}

const LEASE_FILTERS = [
  { value: '', label: '全部占用' },
  { value: 'free', label: '仅可租用' },
  { value: 'leased', label: '跑批占用' },
  { value: 'locked', label: '手动占用' },
]

function emptyForm(env = '') {
  return {
    env: env || (environments.value[0]?.key || 'test'),
    display_name: '',
    phone: '',
    email: '',
    username: '',
    password: '',
    otp: '',
    health: 'available',
    facets: emptyFacetForm(poolFieldDefs.value.length ? poolFieldDefs.value : poolTemplates.value),
    note: '',
    locked: false,
  }
}

const envLabel = (key) => environments.value.find((e) => e.key === key)?.label || key || '未分环境'
const rowPassword = (row) => String(row?.password || '').trim()
const hasPassword = (row) => Boolean(rowPassword(row) || row?.has_password)
const hasOtp = (row) => Boolean(String(row?.otp || '').trim() || row?.has_otp)
const pwdShown = (id) => pwdOpen.value.has(id)
const togglePwd = (id) => {
  const next = new Set(pwdOpen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  pwdOpen.value = next
}
const maskedPwd = (row) => {
  const pwd = rowPassword(row)
  if (pwd) return '•'.repeat(Math.max(6, pwd.length))
  return row?.password_masked || '••••••••'
}

const summary = computed(() => poolSummary(accounts.value))

const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return accounts.value.filter((r) => {
    if (envFilter.value && r.env !== envFilter.value) return false
    if (leaseFilter.value && leaseBadge(r).kind !== leaseFilter.value) return false
    if (!q) return true
    const blob = [accountHeadline(r), accountSubline(r), r.note].join(' ').toLowerCase()
    return blob.includes(q)
  })
})

const accountPage = ref(1)
const accountPageSize = ref(20)
const pagedAccountRows = computed(() =>
  slicePage(visibleRows.value, accountPage.value, accountPageSize.value),
)

const devicePage = ref(1)
const devicePageSize = ref(20)
const pagedDeviceSessions = computed(() =>
  slicePage(deviceSessions.value, devicePage.value, devicePageSize.value),
)

const importPreviewPage = ref(1)
const importPreviewPageSize = ref(10)
const pagedImportPreviewRows = computed(() =>
  slicePage(importPreviewRows.value, importPreviewPage.value, importPreviewPageSize.value),
)

watch([search, envFilter, leaseFilter], () => {
  accountPage.value = 1
  clearAccountSelection()
})
watch(deviceSessions, () => {
  devicePage.value = 1
})
watch(importPreviewRows, () => {
  importPreviewPage.value = 1
})

const formFieldDefs = computed(() => extensionFieldDefs(poolFieldDefs.value))
const projectExtensionDefs = computed(() =>
  projectOnlyFieldDefs(poolFieldDefs.value, poolTemplates.value),
)
const statusRows = (row) => statusDisplayRows(row, templateFieldDefsForRow(row, poolFieldDefs.value))

const formatLogTime = (ts) => (ts ? String(ts).replace('T', ' ').slice(0, 19) : '—')
const actionLabel = (action) => LOG_ACTIONS.find((a) => a.value === action)?.label || action || '—'

const loadTemplates = async () => {
  if (!props.projectId) return
  try {
    const res = await getProjectAccountPoolTemplates(props.projectId)
    poolTemplates.value = res?.data?.templates || []
  } catch {
    poolTemplates.value = []
  }
}

const resolvePoolFieldDefs = (schemaRes, accRes) => {
  const schema = unwrapApiPayload(schemaRes)
  const acc = unwrapApiPayload(accRes)
  const fromSchema = schema.pool_field_defs
  if (Array.isArray(fromSchema) && fromSchema.length) return fromSchema
  const fromAccounts = acc.pool_field_defs
  if (Array.isArray(fromAccounts) && fromAccounts.length) return fromAccounts
  return Array.isArray(fromSchema) ? fromSchema : (Array.isArray(fromAccounts) ? fromAccounts : [])
}

const load = async () => {
  if (!props.projectId) return
  loading.value = true
  try {
    const [accRes, schemaRes] = await Promise.all([
      getProjectAccounts(props.projectId),
      getProjectAccountPoolSchema(props.projectId).catch(() => null),
    ])
    const accPayload = unwrapApiPayload(accRes)
    accounts.value = accPayload.accounts || []
    poolFieldDefs.value = resolvePoolFieldDefs(schemaRes, accRes)
    environments.value = accPayload.environments || []
    envDefaultProfile.value = String(accRes?.data?.default_profile || environments.value[0]?.key || 'test')
    if (envFilter.value && !environments.value.some((e) => e.key === envFilter.value)) envFilter.value = ''
    await loadTemplates()
  } catch (e) {
    ElMessage.error(e?.message || '加载账号失败')
  } finally {
    loading.value = false
  }
}

const pickImportDefaultEnv = () => {
  const keys = environments.value.map((e) => e.key)
  const fromFilter = envFilter.value && keys.includes(envFilter.value) ? envFilter.value : ''
  const base = fromFilter || envDefaultProfile.value || keys[0] || 'test'
  importDefaultEnv.value = keys.includes(base) ? base : (keys[0] || base)
}

const openImport = () => {
  if (!environments.value.length) {
    ElMessage.warning('先在「配置 → 环境配置」里添加环境')
    return
  }
  pickImportDefaultEnv()
  importText.value = ''
  importPreview.value = null
  importDup.value = 'merge'
  importMode.value = 'paste'
  importFile.value = null
  importOpen.value = true
}

const onImportFileChange = (uploadFile) => {
  const raw = uploadFile?.raw
  if (!raw) return
  importFile.value = raw
  importPreview.value = null
}

const buildImportFormData = () => {
  const fd = new FormData()
  fd.append('file', importFile.value)
  fd.append('default_env', importDefaultEnv.value || envDefaultProfile.value || 'test')
  fd.append('on_duplicate', importDup.value)
  return fd
}

const downloadImportTemplate = async () => {
  if (!props.projectId) return
  try {
    const blob = await downloadProjectAccountsImportTemplate(props.projectId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'account-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '下载失败')
  }
}

const fillImportSample = () => {
  importText.value = IMPORT_SAMPLE
  importPreview.value = null
}

const runImportPreview = async () => {
  if (importMode.value === 'file') {
    if (!importFile.value) {
      ElMessage.warning('请选择 .csv / .xlsx 文件')
      return
    }
  } else if (!importText.value.trim()) {
    ElMessage.warning('请粘贴 CSV/TSV 表格（首行为表头）')
    return
  }
  importPreviewing.value = true
  try {
    const res =
      importMode.value === 'file'
        ? await previewProjectAccountsImportFile(props.projectId, buildImportFormData())
        : await previewProjectAccountsImport(props.projectId, {
            text: importText.value,
            default_env: importDefaultEnv.value || envDefaultProfile.value || 'test',
            on_duplicate: importDup.value,
          })
    importPreview.value = res?.data || null
    if (!importPreview.value?.ok) {
      ElMessage.error(importPreview.value?.error || '预览失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '预览失败')
  } finally {
    importPreviewing.value = false
  }
}

const runImportCommit = async () => {
  if (!importPreview.value?.ok) {
    await runImportPreview()
    if (!importPreview.value?.ok) return
  }
  try {
    await ElMessageBox.confirm(
      `将新建 ${importStats.value.create || 0} 条、更新 ${importStats.value.update || 0} 条，跳过 ${importStats.value.skip || 0} 条。继续？`,
      '确认导入',
      { type: 'warning' },
    )
  } catch {
    return
  }
  importCommitting.value = true
  try {
    const res =
      importMode.value === 'file'
        ? await commitProjectAccountsImportFile(props.projectId, buildImportFormData())
        : await commitProjectAccountsImport(props.projectId, {
            text: importText.value,
            default_env: importDefaultEnv.value || envDefaultProfile.value || 'test',
            on_duplicate: importDup.value,
          })
    const st = res?.data?.stats || {}
    ElMessage.success(
      `导入完成：新建 ${st.created || 0}，更新 ${st.updated || 0}，跳过 ${(res?.data?.skipped || []).length}，失败 ${st.errors || 0}`,
    )
    importOpen.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '导入失败')
  } finally {
    importCommitting.value = false
  }
}

const importActionLabel = (action) => {
  const m = { create: '新建', update: '更新', skip: '跳过', error: '错误' }
  return m[action] || action
}

const openCreate = () => {
  if (!environments.value.length) {
    ElMessage.warning('先在「配置 → 环境配置」里添加环境')
    return
  }
  editingId.value = ''
  form.value = emptyForm(envFilter.value)
  dialogOpen.value = true
}

const openEdit = (row) => {
  editingId.value = row.id
  const rowDefs = templateFieldDefsForRow(row, poolFieldDefs.value)
  const editDefs = formFieldDefs.value.length ? formFieldDefs.value : rowDefs
  const projDefs = projectExtensionDefs.value
  const facetDefs = editDefs.length
    ? editDefs
    : (projDefs.length ? projDefs : rowDefs)
  form.value = {
    env: row.env || 'test',
    display_name: row.display_name || '',
    phone: row.phone || '',
    email: row.email || '',
    username: row.username || '',
    password: row.password || '',
    otp: row.otp || '',
    health: String(row.facets?.health || 'available'),
    facets: ensureFacetKeys(row.facets, facetDefs),
    note: row.note || '',
    locked: Boolean(row.locked),
  }
  dialogOpen.value = true
}

const buildAccountPayload = () => {
  const payload = {
    env: form.value.env,
    display_name: form.value.display_name,
    phone: form.value.phone,
    email: form.value.email,
    username: form.value.username,
    otp: form.value.otp,
    facets: {
      ...facetsForSave(
        { ...form.value.facets, health: form.value.health || 'available' },
        formFieldDefs.value,
      ),
    },
    note: form.value.note,
    locked: form.value.locked,
  }
  if (form.value.password) payload.password = form.value.password
  return payload
}

const saveForm = async () => {
  if (!form.value.phone && !form.value.email && !form.value.username && !form.value.display_name) {
    ElMessage.warning('至少填展示名、手机号、邮箱或用户名之一')
    return
  }
  saving.value = true
  try {
    const payload = buildAccountPayload()
    const res = editingId.value
      ? await patchProjectAccount(props.projectId, editingId.value, payload)
      : await createProjectAccount(props.projectId, payload)
    await load()
    ElMessage.success('已保存')
    dialogOpen.value = false
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm(
      `删除「${envLabel(row.env)} ${accountHeadline(row)}」？`,
      '删除账号',
      { type: 'warning' },
    )
  } catch {
    return
  }
  saving.value = true
  try {
    await deleteProjectAccount(props.projectId, row.id)
    accounts.value = accounts.value.filter((x) => x.id !== row.id)
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '删除失败')
  } finally {
    saving.value = false
  }
}

const toggleLock = async (row) => {
  saving.value = true
  try {
    const res = await patchProjectAccount(props.projectId, row.id, { locked: !row.locked })
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '更新失败')
  } finally {
    saving.value = false
  }
}

const loadResourceLogs = async () => {
  if (!props.projectId) return
  loading.value = true
  try {
    const f = logFilters.value
    const res = await getProjectResourceAllocationLogs(props.projectId, {
      page: logPage.value,
      page_size: logPageSize.value,
      run_id: f.run_id.trim(),
      case_id: f.case_id.trim(),
      action: f.action,
      account_ident: f.account_ident.trim(),
      sn: f.sn.trim(),
      env: f.env.trim(),
    })
    const { items, total } = unwrapLogListPayload(res)
    resourceLogs.value = items
    logTotal.value = total
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载日志失败')
  } finally {
    loading.value = false
  }
}

const applyLogFilters = () => {
  logPage.value = 1
  loadResourceLogs()
}

const restoringLogId = ref(null)

const restoreFromResourceLog = async (row) => {
  if (!props.projectId || !row?.id) return
  if (!canRestoreResourceLog(row)) {
    ElMessage.warning('该条日志没有可恢复快照（需 Nexus 新版本产生的「模板状态变更」记录）')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将账号 ${row.account_ident || row.account_id || '—'} 的模板状态恢复为该条日志记录变更前的快照，是否继续？`,
      '从资源日志恢复',
      { type: 'warning' },
    )
  } catch {
    return
  }
  restoringLogId.value = row.id
  try {
    await restoreProjectAccountFromResourceLog(props.projectId, row.id)
    ElMessage.success('已恢复')
    await loadResourceLogs()
    if (tab.value === 'accounts') await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '恢复失败')
  } finally {
    restoringLogId.value = null
  }
}

const loadDeviceSessions = async () => {
  if (!props.projectId) return
  loading.value = true
  try {
    const res = await getProjectDeviceAppSessions(props.projectId, {
      sn: deviceSnFilter.value.trim(),
      app_id: props.appId || undefined,
    })
    deviceSessions.value = res?.data?.sessions || []
    deviceSessionsHint.value = String(res?.data?.hint || '').trim()
  } catch (e) {
    deviceSessionsHint.value = ''
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

watch(() => props.projectId, () => {
  load()
})
watch(
  () => props.section,
  (s) => {
    if (s === 'accounts' || s === '') load()
    if (s === 'logs' || s === 'trial') loadResourceLogs()
    if (s === 'device-apps') loadDeviceSessions()
  },
)
watch(tab, (t) => {
  if (t === 'device-apps') loadDeviceSessions()
  if (t === 'logs') loadResourceLogs()
})
watch([logPage, logPageSize], () => {
  if (tab.value === 'logs') loadResourceLogs()
})

const applyLogRunIdFromRoute = () => {
  const rid = String(route.query.logRunId || '').trim()
  if (!rid) return
  tab.value = 'logs'
  logFilters.value.run_id = rid
  logFilters.value.action = 'facet_update'
  logPage.value = 1
  loadResourceLogs()
}

watch(() => route.query.logRunId, () => applyLogRunIdFromRoute())

onMounted(() => {
  load()
  applyLogRunIdFromRoute()
  if (tab.value === 'logs') loadResourceLogs()
})
onActivated(() => {
  load()
  applyLogRunIdFromRoute()
  if (tab.value === 'logs') loadResourceLogs()
})
</script>

<template>
  <div class="settings-panel assets-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ pageTitle }}</h2>
        <p class="page-lead">
          账号共用已启用业务模板字段；可在本项目<strong>追加模板/字段</strong>，或在 Console 维护全局模板。跑批按用例推断模板从同一号池选号。
        </p>
      </div>
      <div class="settings-summary-pill">{{ projectName || '当前项目' }}</div>
    </header>

    <div v-if="!hideNav" class="settings-tabbar">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        class="settings-tab"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        <strong>{{ t.label }}</strong>
        <span>{{ t.desc }}</span>
      </button>
    </div>

    <template v-if="tab === 'accounts'">
      <section class="pool-stats">
        <div class="stat-card">
          <span class="stat-num">{{ summary.total }}</span>
          <span class="stat-label">号池总数</span>
        </div>
        <div class="stat-card stat-ok">
          <span class="stat-num">{{ summary.free }}</span>
          <span class="stat-label">可租用</span>
        </div>
        <div class="stat-card stat-run">
          <span class="stat-num">{{ summary.leased }}</span>
          <span class="stat-label">跑批占用</span>
        </div>
        <div class="stat-card stat-lock">
          <span class="stat-num">{{ summary.locked }}</span>
          <span class="stat-label">手动占用</span>
        </div>
        <div v-if="summary.unhealthy" class="stat-card stat-warn">
          <span class="stat-num">{{ summary.unhealthy }}</span>
          <span class="stat-label">待处理健康</span>
        </div>
      </section>

      <section class="settings-card pick-card">
        <div class="pick-row">
          <el-input v-model="search" clearable placeholder="搜索手机号、备注…" class="search-input" />
          <el-select v-model="envFilter" placeholder="环境" clearable style="width: 110px">
            <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
          </el-select>
          <el-select v-model="leaseFilter" placeholder="占用" clearable style="width: 120px">
            <el-option v-for="f in LEASE_FILTERS" :key="f.value || 'all'" :label="f.label" :value="f.value" />
          </el-select>
          <el-button @click="poolLocalOpen = true">项目模板与字段</el-button>
          <el-button @click="openImport">批量导入</el-button>
          <el-button
            :disabled="!selectedAccounts.length"
            @click="openBulkEdit"
          >
            批量改字段{{ selectedAccounts.length ? ` (${selectedAccounts.length})` : '' }}
          </el-button>
          <el-button type="primary" @click="openCreate">新增账号</el-button>
        </div>
        <p class="filter-hint">
          筛选 {{ visibleRows.length }} 条 · 号池共 {{ accounts.length }} 条
        </p>
      </section>

      <section class="settings-table-card is-fill">
        <div class="table-fill">
        <el-table
          ref="accountTableRef"
          :data="pagedAccountRows"
          size="small"
          border
          stripe
          height="100%"
          row-key="id"
          empty-text="暂无账号"
          @selection-change="onAccountSelectionChange"
        >
          <el-table-column type="selection" width="42" fixed reserve-selection />
          <el-table-column label="账号" min-width="168" fixed>
            <template #default="{ row }">
              <div class="id-cell">
                <strong class="id-main">{{ accountHeadline(row) }}</strong>
                <span class="env-pill">{{ envLabel(row.env) }}</span>
              </div>
              <div class="id-sub">{{ accountSubline(row) }}</div>
            </template>
          </el-table-column>

          <el-table-column label="模板状态" min-width="240">
            <template #default="{ row }">
              <TestAccountStatus :rows="statusRows(row)" />
            </template>
          </el-table-column>

          <el-table-column label="租约" width="200">
            <template #default="{ row }">
              <TestAccountLeaseBadge :badge="leaseBadge(row)" />
            </template>
          </el-table-column>

          <el-table-column label="凭证" width="100" align="center">
            <template #default="{ row }">
              <div class="cred-icons">
                <span :class="['cred-dot', hasPassword(row) ? 'on' : 'off']" title="密码">密</span>
                <span :class="['cred-dot', hasOtp(row) ? 'on' : 'off']" title="验证码">码</span>
              </div>
              <div v-if="hasPassword(row)" class="pwd-mini">
                <span>{{ pwdShown(row.id) ? rowPassword(row) : '••••••' }}</span>
                <button v-if="rowPassword(row)" type="button" class="pwd-eye" @click.stop="togglePwd(row.id)">
                  <el-icon><Hide v-if="pwdShown(row.id)" /><View v-else /></el-icon>
                </button>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="备注" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="muted">{{ row.note || '—' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
              <el-button link size="small" @click="toggleLock(row)">{{ row.locked ? '解锁' : '锁定' }}</el-button>
              <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        </div>
        <el-pagination
          class="settings-table-pager"
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="visibleRows.length"
          :page-sizes="TABLE_PAGE_SIZES"
          v-model:page-size="accountPageSize"
          v-model:current-page="accountPage"
        />
      </section>
    </template>

    <template v-else-if="tab === 'logs'">
      <section class="settings-card pick-card">
        <div class="pick-row log-filters">
          <el-input v-model="logFilters.run_id" placeholder="任务 run_id" clearable style="max-width: 180px" />
          <el-input v-model="logFilters.case_id" placeholder="用例 case_id" clearable style="max-width: 160px" />
          <el-input v-model="logFilters.sn" placeholder="设备 SN" clearable style="max-width: 140px" />
          <el-input v-model="logFilters.account_ident" placeholder="账号" clearable style="max-width: 140px" />
          <el-select v-model="logFilters.action" placeholder="操作" clearable style="width: 120px">
            <el-option v-for="a in LOG_ACTIONS" :key="a.value || 'all'" :label="a.label" :value="a.value" />
          </el-select>
          <el-input v-model="logFilters.env" placeholder="环境" clearable style="width: 90px" />
          <el-button type="primary" @click="applyLogFilters">筛选</el-button>
          <el-button @click="logFilters.action = 'facet_update'; applyLogFilters()">仅模板变更</el-button>
          <el-button @click="loadResourceLogs">刷新</el-button>
        </div>
        <p class="filter-hint">
          记录跑批租号、释放、<strong>模板状态变更</strong>与恢复。带 Session 的条目可点「轨迹」跳到 Session Log（事件类型 <code>resource/account</code>）。
          「恢复」列在<strong>操作</strong>右侧；点<strong>仅模板变更</strong>筛 facet 类日志。
        </p>
        <p v-if="resourceLogs.length && !resourceLogs.some((r) => r.action === 'facet_update')" class="filter-hint log-restore-hint">
          本页暂无「模板状态变更」记录，恢复按钮仅对该类日志显示为可点。
        </p>
      </section>
      <section class="settings-table-card is-fill">
        <div class="table-fill">
          <el-table :data="resourceLogs" size="small" border stripe height="100%" empty-text="暂无资源日志（跑批租号后会出现）">
            <el-table-column label="时间" width="168">
              <template #default="{ row }">{{ formatLogTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="108">
              <template #default="{ row }">{{ actionLabel(row.action) }}</template>
            </el-table-column>
            <el-table-column label="恢复" width="72" align="center">
              <template #default="{ row }">
                <el-tooltip
                  v-if="RESTORABLE_LOG_ACTIONS.has(row.action) && !canRestoreResourceLog(row)"
                  content="无快照（需 Nexus 新版本写入的模板变更日志）"
                  placement="top"
                >
                  <span class="muted">—</span>
                </el-tooltip>
                <el-button
                  v-else-if="canRestoreResourceLog(row)"
                  link
                  type="primary"
                  size="small"
                  :loading="restoringLogId === row.id"
                  @click="restoreFromResourceLog(row)"
                >
                  恢复
                </el-button>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column prop="env" label="环境" width="64" />
            <el-table-column prop="run_id" label="任务" min-width="108" show-overflow-tooltip />
            <el-table-column prop="case_id" label="用例" min-width="100" show-overflow-tooltip />
            <el-table-column prop="sn" label="设备" width="108" show-overflow-tooltip />
            <el-table-column prop="account_ident" label="账号" width="108" show-overflow-tooltip />
            <el-table-column prop="message" label="说明" min-width="140" show-overflow-tooltip />
            <el-table-column label="Session" width="88" align="center">
              <template #default="{ row }">
                <el-button
                  v-if="row.session_id || row.detail?.session_id"
                  link
                  type="primary"
                  size="small"
                  @click="openResourceSessionLog(row)"
                >
                  轨迹
                </el-button>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-pagination
          class="settings-table-pager"
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="logTotal"
          :page-sizes="TABLE_PAGE_SIZES"
          v-model:page-size="logPageSize"
          v-model:current-page="logPage"
        />
      </section>
    </template>

    <template v-else-if="tab === 'device-apps'">
      <section class="settings-card pick-card">
        <div class="pick-row">
          <el-input v-model="deviceSnFilter" placeholder="按 SN 过滤" clearable style="max-width: 200px" />
          <el-button @click="loadDeviceSessions">刷新</el-button>
        </div>
        <p class="filter-hint">
          仅展示<strong>当前项目在环境配置里维护的包名</strong> × 设备；跑批清缓存 / inspect / 登录流块会写入登记簿。
        </p>
        <p v-if="deviceSessionsHint" class="filter-hint warn">{{ deviceSessionsHint }}</p>
      </section>
      <section class="settings-table-card is-fill">
        <div class="table-fill">
        <el-table :data="pagedDeviceSessions" size="small" border stripe height="100%" empty-text="无设备或未配置被测 App 包名">
          <el-table-column prop="sn" label="SN" width="140" show-overflow-tooltip />
          <el-table-column prop="device_label" label="设备" width="120" show-overflow-tooltip />
          <el-table-column prop="package_id" label="包名" min-width="160" show-overflow-tooltip />
          <el-table-column label="登记" width="72" align="center">
            <template #default="{ row }">
              <el-tag :type="row.registered ? 'success' : 'info'" size="small">{{ row.registered ? '已观测' : '占位' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="会话" width="120">
            <template #default="{ row }">{{ row.session_display || row.session || '—' }}</template>
          </el-table-column>
          <el-table-column prop="bound_account_id" label="绑定账号" width="120" show-overflow-tooltip />
          <el-table-column label="版本" width="100" show-overflow-tooltip>
            <template #default="{ row }">
              <span :class="{ 'text-warn': row.app_version_bad }">{{ row.app_version_display || row.app_version || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="身份摘要" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.identity_display || row.identity_hint || '—' }}</template>
          </el-table-column>
          <el-table-column label="机态备注" width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.stale_note || '—' }}</template>
          </el-table-column>
          <el-table-column prop="observed_at" label="观测时间" width="160" />
        </el-table>
        </div>
        <el-pagination
          class="settings-table-pager"
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="deviceSessions.length"
          :page-sizes="TABLE_PAGE_SIZES"
          v-model:page-size="devicePageSize"
          v-model:current-page="devicePage"
        />
      </section>
    </template>

    <el-dialog
      v-model="dialogOpen"
      :title="editingId ? '编辑测试账号' : '新增测试账号'"
      class="mo-fit-dialog account-dialog account-dialog-70"
      align-center
      append-to-body
    >
      <el-form label-width="88px" class="dialog-form account-edit-form">
          <div class="form-section-title">基础信息</div>
          <el-form-item label="环境" required>
            <el-select v-model="form.env" style="width: 100%">
              <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
            </el-select>
          </el-form-item>
          <el-form-item label="展示名">
            <el-input v-model="form.display_name" placeholder="列表主标题，可重复手机号" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="form.phone" placeholder="推荐填写" />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input v-model="form.username" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="form.email" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" show-password :placeholder="editingId ? '留空不改' : ''" />
          </el-form-item>
          <el-form-item label="验证码">
            <el-input v-model="form.otp" placeholder="固定 OTP" />
          </el-form-item>
          <el-form-item label="健康">
            <el-select v-model="form.health" style="width: 100%">
              <el-option
                v-for="o in ACCOUNT_HEALTH_OPTIONS"
                :key="o.value"
                :label="o.label"
                :value="o.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="form.note" type="textarea" :rows="2" />
          </el-form-item>

          <template v-for="t in poolTemplates" :key="t.id">
            <div class="form-section-title">
              {{ t.label }}
              <span v-if="t.description" class="form-section-hint">{{ t.description }}</span>
            </div>
            <div class="facet-form-grid">
              <el-form-item
                v-for="f in templateFieldsForTemplate(t.facet_extensions)"
                :key="`${t.id}-${f.key}`"
                :label="f.label"
              >
                <el-select v-model="form.facets[f.key]" style="width: 100%" clearable placeholder="默认（未设置）">
                  <el-option v-for="o in f.options" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </div>
          </template>
          <template v-if="projectExtensionDefs.length">
            <div class="form-section-title">项目扩展字段</div>
            <div class="facet-form-grid">
              <el-form-item v-for="f in projectExtensionDefs" :key="f.key" :label="f.label">
                <el-select v-model="form.facets[f.key]" style="width: 100%" clearable placeholder="默认（未设置）">
                  <el-option v-for="o in f.options" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </div>
          </template>
        </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="bulkEditOpen"
      title="批量修改字段"
      width="480px"
      align-center
      append-to-body
      destroy-on-close
    >
      <p class="filter-hint">
        已选 <strong>{{ selectedAccounts.length }}</strong> 条账号（表格可多选 / 表头全选当前页；翻页后已选会保留）。
      </p>
      <el-form label-width="88px" class="dialog-form">
        <el-form-item label="字段" required>
          <el-select v-model="bulkFieldKey" style="width: 100%" filterable>
            <el-option
              v-for="o in bulkFieldOptions"
              :key="o.key"
              :label="o.label"
              :value="o.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="bulkFieldMeta?.kind === 'env'" label="新值" required>
          <el-select v-model="bulkFieldValue" style="width: 100%">
            <el-option v-for="e in environments" :key="e.key" :label="e.label || e.key" :value="e.key" />
          </el-select>
        </el-form-item>
        <el-form-item v-else-if="bulkFieldMeta?.kind === 'health'" label="新值" required>
          <el-select v-model="bulkFieldValue" style="width: 100%">
            <el-option v-for="o in ACCOUNT_HEALTH_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-else-if="bulkFieldMeta?.kind === 'facet'" label="新值" required>
          <el-select v-model="bulkFieldValue" style="width: 100%" clearable placeholder="选择模板选项">
            <el-option
              v-for="o in (bulkFieldMeta.def?.options || [])"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-else-if="bulkFieldMeta?.kind === 'bool'" label="新值">
          <el-switch v-model="bulkFieldBool" active-text="锁定（手动占用）" inactive-text="解锁" />
        </el-form-item>
        <el-form-item v-else-if="bulkFieldMeta" :label="bulkFieldMeta.secret ? '新密码' : '新值'" required>
          <el-input
            v-model="bulkFieldValue"
            :type="bulkFieldMeta.secret ? 'password' : 'text'"
            :show-password="bulkFieldMeta.secret"
            :placeholder="bulkFieldMeta.kind === 'text' && bulkFieldKey === 'note' ? '可留空表示清空备注' : ''"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bulkEditOpen = false">取消</el-button>
        <el-button type="primary" :loading="bulkApplying" @click="applyBulkField">应用到所选</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="importOpen"
      title="批量导入账号"
      class="mo-fit-dialog account-dialog account-dialog-70"
      align-center
      append-to-body
      destroy-on-close
    >
      <p class="filter-hint">
        支持上传 <strong>.xlsx / .csv</strong> 或粘贴表格；首行为表头。列名：手机号、邮箱、展示名、密码、登录态、<strong>环境</strong>、备注及项目扩展字段中文名。
        未填「环境」列的账号归入下方所选默认环境。
      </p>
      <div class="pick-row" style="margin-bottom: 10px; flex-wrap: wrap; gap: 8px; align-items: center">
        <span class="filter-hint" style="margin: 0">默认环境</span>
        <el-select v-model="importDefaultEnv" style="width: 160px" @change="importPreview = null">
          <el-option v-for="e in environments" :key="e.key" :label="e.label || e.key" :value="e.key" />
        </el-select>
      </div>
      <el-radio-group v-model="importMode" style="margin-bottom: 10px">
        <el-radio-button value="paste">粘贴</el-radio-button>
        <el-radio-button value="file">上传文件</el-radio-button>
      </el-radio-group>
      <div class="pick-row" style="margin-bottom: 8px; flex-wrap: wrap; gap: 8px">
        <el-select v-model="importDup" style="width: 200px">
          <el-option label="已存在：合并（补空字段）" value="merge" />
          <el-option label="已存在：跳过" value="skip" />
          <el-option label="已存在：覆盖凭证与状态" value="overwrite_credentials" />
        </el-select>
        <el-button @click="downloadImportTemplate">下载模板</el-button>
        <el-button v-if="importMode === 'paste'" @click="fillImportSample">填入示例</el-button>
        <el-button :loading="importPreviewing" @click="runImportPreview">预览</el-button>
      </div>
      <el-upload
        v-if="importMode === 'file'"
        drag
        :auto-upload="false"
        :limit="1"
        accept=".csv,.txt,.xlsx"
        :on-change="onImportFileChange"
        :on-remove="() => { importFile.value = null; importPreview.value = null }"
      >
        <div class="el-upload__text">拖拽或点击选择表格文件</div>
        <template #tip>
          <span v-if="importFile" class="filter-hint">已选：{{ importFile.name }}</span>
        </template>
      </el-upload>
      <el-input
        v-else
        v-model="importText"
        type="textarea"
        :rows="10"
        placeholder="粘贴 Excel 复制的表格…"
      />
      <div v-if="importPreview?.stats" class="import-stats">
        预览：新建 {{ importStats.create }} · 更新 {{ importStats.update }} · 跳过 {{ importStats.skip }} · 错误 {{ importStats.error }}
        <span v-if="importPreview.preview_truncated">（仅展示前 80 行）</span>
      </div>
      <el-table
        v-if="importPreviewRows.length"
        :data="pagedImportPreviewRows"
        size="small"
        border
        max-height="240"
        style="margin-top: 12px"
      >
        <el-table-column prop="row" label="行" width="52" />
        <el-table-column label="动作" width="72">
          <template #default="{ row }">{{ importActionLabel(row.action) }}</template>
        </el-table-column>
        <el-table-column label="手机号" width="120">
          <template #default="{ row }">{{ row.incoming?.phone || '—' }}</template>
        </el-table-column>
        <el-table-column label="展示名" min-width="100">
          <template #default="{ row }">{{ row.incoming?.display_name || '—' }}</template>
        </el-table-column>
        <el-table-column label="环境" width="88">
          <template #default="{ row }">{{ envLabel(row.incoming?.env) }}</template>
        </el-table-column>
        <el-table-column label="说明" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.error || row.reason || row.account_id || '—' }}</template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="importPreviewRows.length > importPreviewPageSize"
        class="settings-table-pager"
        background
        small
        layout="total, prev, pager, next"
        :total="importPreviewRows.length"
        :page-size="importPreviewPageSize"
        v-model:current-page="importPreviewPage"
        style="margin-top: 8px"
      />
      <template #footer>
        <el-button @click="importOpen = false">取消</el-button>
        <el-button type="primary" :loading="importCommitting" @click="runImportCommit">确认导入</el-button>
      </template>
    </el-dialog>

    <ProjectAccountPoolDialog
      v-model="poolLocalOpen"
      :project-id="projectId"
      @saved="load"
    />
  </div>
</template>

<style scoped>
.assets-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.assets-page > .settings-page-header,
.assets-page > .settings-tabbar,
.pool-stats,
.pick-card,
.chosen-card,
.trial-hint {
  flex-shrink: 0;
}
.assets-page > .settings-table-card.is-fill {
  flex: 1;
  min-height: 0;
}
.table-fill {
  flex: 1;
  min-height: 0;
}
.log-restore-hint {
  color: var(--el-color-warning-dark-2, #b45309);
  margin-top: 4px;
}
.page-lead {
  margin: 0;
  font-size: 13px;
  color: var(--mo-muted, #6b7280);
  line-height: 1.45;
}
.page-lead strong {
  color: var(--mo-text, #111827);
  font-weight: 700;
}
.pool-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.stat-card {
  flex: 1 1 100px;
  min-width: 88px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--mo-card, #fff);
  border: 1px solid var(--mo-border, #e5e7eb);
}
.stat-num {
  display: block;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--mo-text, #111827);
}
.stat-label {
  font-size: 12px;
  color: var(--mo-muted, #6b7280);
  font-weight: 600;
}
.stat-ok { background: #ecfdf5; border-color: #a7f3d0; }
.stat-ok .stat-num { color: #047857; }
.stat-run { background: #eef2ff; border-color: #c7d2fe; }
.stat-run .stat-num { color: #3730a3; }
.stat-lock { background: #fffbeb; border-color: #fde68a; }
.stat-lock .stat-num { color: #b45309; }
.stat-warn { background: #fef2f2; border-color: #fecaca; }
.stat-warn .stat-num { color: #b91c1c; }

.pick-card { margin-bottom: 8px; }
.log-filters {
  flex-wrap: wrap;
  gap: 8px;
}

.text-warn {
  color: var(--el-color-warning);
}

.pick-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.template-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
.strip-label {
  color: #6b7280;
  font-weight: 600;
}
.tpl-pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.search-input {
  flex: 1 1 200px;
  min-width: 160px;
  max-width: 320px;
}
.filter-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #9ca3af;
}
.filter-hint.warn {
  color: var(--el-color-warning);
}
.gap-list {
  margin: 8px 0 0;
  padding-left: 1.2em;
  font-size: 12px;
  color: var(--el-color-warning);
}

.trial-hint p {
  margin: 0;
  font-size: 13px;
  color: #4b5563;
}
.id-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.id-main {
  font-size: 14px;
  font-weight: 800;
  color: #111827;
}
.env-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #4b5563;
}
.id-sub {
  margin-top: 4px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.35;
}
.cred-icons {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-bottom: 4px;
}
.cred-dot {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  color: #9ca3af;
  background: #f9fafb;
}
.cred-dot.on {
  border-color: #a7f3d0;
  background: #ecfdf5;
  color: #047857;
}
.pwd-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  color: #6b7280;
}
.chosen-card { margin-bottom: 8px; }
.chosen-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 200px;
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) {
  .chosen-grid { grid-template-columns: 1fr; }
}
.chosen-card h3 {
  margin: 4px 0 6px;
  font-size: 18px;
}
.chosen-card p {
  margin: 0 0 6px;
  color: #4b5563;
  font-size: 13px;
}
.preview-label,
.score-line {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}
.pick-em {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: #e0e7ff;
  color: #3730a3;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}
:deep(.account-dialog-70.mo-fit-dialog.el-dialog) {
  width: 70vw !important;
  max-width: 70vw !important;
  height: 70vh !important;
  max-height: 70vh !important;
  margin: 15vh auto !important;
}
:deep(.account-dialog-70.mo-fit-dialog .el-dialog__body) {
  max-height: none !important;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
.account-edit-form {
  padding-right: 4px;
}
.form-section-title {
  margin: 12px 0 8px;
  font-size: 13px;
  font-weight: 800;
  color: #111827;
}
.form-section-hint {
  font-weight: 600;
  color: #6b7280;
  font-size: 12px;
}
.facet-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}
.dialog-preview {
  padding: 12px;
  border-radius: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}
.preview-title {
  font-weight: 800;
  font-size: 13px;
  margin-bottom: 4px;
}
.preview-sub,
.preview-foot {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.45;
  margin: 0 0 10px;
}
.preview-card {
  padding: 10px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.preview-card strong {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
}
.pwd-eye {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}
.pwd-eye:hover {
  background: #eef2ff;
  color: #4f46e5;
}
.muted { color: #9ca3af; }
.hit { color: #4f46e5; font-weight: 650; }
.row-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ext-empty {
  margin-bottom: 12px;
}
.ext-empty .el-input {
  margin-bottom: 8px;
}
.field-help {
  margin: 4px 0 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.35;
}
.ext-del {
  margin-left: 4px;
  vertical-align: baseline;
}
</style>
