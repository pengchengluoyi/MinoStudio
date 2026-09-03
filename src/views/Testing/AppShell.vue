<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  runCaseRunner,
  listCaseRunnerDevices,
} from '@/api/caseRunner'
import { getAppAutomationConfig, updateAppAutomationConfig } from '@/api/appAutomation'
import { listAIProviders } from '@/api/settings'
import { getProjects } from '@/api/workReport'
import WorkShell from '@/layouts/WorkShell.vue'
import TaskDetailPane from '@/views/Testing/TaskDetailPane.vue'
import AppConfigPage from '@/views/Settings/AppConfigPage.vue'
import KnowledgePanel from '@/views/Settings/KnowledgePanel.vue'
import CasesWorkbench from '@/views/Testing/CasesWorkbench.vue'
import AssetsPage from '@/views/Testing/AssetsPage.vue'
import DispatchPage from '@/views/Settings/DispatchPage.vue'
import DispatchJobPage from '@/views/Settings/DispatchJobPage.vue'
import QaProcessPanel from '@/views/Testing/QaProcessPanel.vue'
import { filterExecutableDevices, formatDeviceMeta, formatDeviceTag } from '@/utils/testingDevices'
import {
  casePlatformKind,
  coverageLabel,
  devicePlatformKind,
  displayTaskStatus,
  filterTasks,
  formatTaskDevices,
  parseBusyConflict,
  progressStatus,
  runTypeLabel,
  shortDeviceLabel,
  shortTaskId,
  sortTasksForList,
  statusLabel,
  statusTagType,
  taskCountLabel,
  taskCoverage,
  taskProgressPct,
  taskSns,
  taskTitle,
} from '@/utils/testingTasks'
import { fetchTaskDetail, fetchTasksForApp, useTestingTaskList } from '@/composables/useTestingTasks'
import { envLabel } from '@/constants/envProfiles'
import { groupCasesByModuleTree, parseCaseIdQuery, suiteCaseIds } from '@/utils/caseLibrary'
import { generatedCasesFromProcess, mergeRunCases } from '@/utils/qaProcess'
import { slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'
import '@/views/Settings/settings-ui.css'

const route = useRoute()
const router = useRouter()

const appId = computed(() => String(route.params.appId || ''))
const appName = computed(() => String(route.query.appName || '应用'))
const projectName = computed(() => String(route.query.projectName || ''))
const projectId = computed(() => String(route.query.projectId || ''))
const VALID_TABS = ['process', 'tasks', 'dispatch', 'cases', 'knowledge', 'assets', 'config']
const TESTING_NAV = [
  {
    id: 'process',
    label: '单据',
    icon: '📌',
    color: '#3b82f6',
    children: [
      { id: 'req', label: '需求测试' },
      { id: 'rel', label: '版本测试' },
      { id: 'sch', label: '本项目排期' },
    ],
  },
  {
    id: 'tasks',
    label: '任务',
    icon: '📋',
    color: '#6366f1',
    children: [
      { id: 'runs', label: '执行批次' },
      { id: 'calls', label: '调用记录' },
    ],
  },
  {
    id: 'cases',
    label: '用例',
    icon: '📖',
    color: '#22c55e',
    children: [
      { id: 'atlas', label: '应用图谱' },
      { id: 'mindmap', label: '脑图' },
      { id: 'library', label: '用例库' },
    ],
  },
  {
    id: 'knowledge',
    label: '知识',
    icon: '💡',
    color: '#f59e0b',
    children: [
      { id: 'pending', label: '待审核' },
      { id: 'all', label: '已通过' },
    ],
  },
  {
    id: 'assets',
    label: '测试资源',
    icon: '🪪',
    color: '#8b5cf6',
    children: [
      { id: 'accounts', label: '账号管理' },
      { id: 'trial', label: '试筛账号' },
    ],
  },
  {
    id: 'config',
    label: '配置',
    icon: '⚙️',
    color: '#64748b',
    children: [
      { id: 'env', label: '环境配置', color: '#3b82f6' },
      { id: 'flow-req', label: '需求阶段模板', color: '#6366f1' },
      { id: 'flow-rel', label: '版本阶段模板', color: '#0d9488' },
      { id: 'workflow', label: '角色编排', color: '#f59e0b' },
      { id: 'figma', label: '设计稿', color: '#ec4899' },
    ],
  },
]
const resolveTab = (t) => VALID_TABS.includes(t) ? t : 'process'
const isTaskRouteName = (name) => name === 'TestingTask' || name === 'TestingTaskCase'
/** 本地 tab / task：点击立刻切面；再与路由对齐 */
const tab = ref(isTaskRouteName(route.name) ? 'tasks' : resolveTab(route.query.tab))
const selectedTaskId = computed(() => String(route.params.taskId || ''))
const selectedCaseId = computed(() => (route.name === 'TestingTaskCase' ? String(route.params.caseId || '') : ''))
const selectedCaseSn = computed(() => (route.name === 'TestingTaskCase' ? String(route.query.sn || '') : ''))
const configSection = computed(() => String(route.query.configSection || 'env'))
const resolveBoard = (b) => (b === 'rel' || b === 'sch' ? b : 'req')
const processBoard = ref(resolveBoard(route.query.board))
const processId = ref(String(route.query.pid || ''))
const processPanel = ref(null)
const runSeed = ref(null)

watch(
  () => route.query.tab,
  (t) => {
    if (isTaskRouteName(route.name)) {
      tab.value = 'tasks'
      return
    }
    tab.value = resolveTab(t)
  },
)
watch(
  () => route.name,
  (name) => {
    if (isTaskRouteName(name)) tab.value = 'tasks'
  },
)
watch(
  () => route.query.pid,
  (id) => {
    processId.value = String(id || '')
  },
)
watch(
  () => route.query.board,
  (b) => {
    processBoard.value = resolveBoard(b)
  },
)

const loading = ref(false)
const { tasks, upsert } = useTestingTaskList(appId)
const pollTimer = ref(null)
const projects = ref([])

const devices = ref([])
const providers = ref([])
const cases = ref([])
const casesLoading = ref(false)
const newRunVisible = ref(false)
const submitting = ref(false)
const runForm = ref({ sns: [], coverage: 'once', platform: 'android', use_persisted_baseline: true, use_cache: true, async_exec: true })
const selectedCaseIds = ref([])
const suites = ref([])
const selectedSuiteId = ref('')

const selectedTask = computed(() => tasks.value.find((t) => t.taskId === selectedTaskId.value) || null)
const hasCase = computed(() => route.name === 'TestingTaskCase' && !!selectedCaseId.value)
const hasDetail = computed(() => isTaskRouteName(route.name) && !!selectedTaskId.value)
const dispatchCallId = computed(() => String(route.query.call || ''))
const activeSub = computed(() => {
  if (tab.value === 'process') return processBoard.value
  if (tab.value === 'cases') {
    const raw = String(route.query.view || 'atlas')
    if (raw === 'features' || raw === 'changes') return 'atlas'
    if (raw === 'reqs') return 'mindmap'
    return raw
  }
  if (tab.value === 'assets') return String(route.query.section || 'accounts')
  if (tab.value === 'dispatch') return String(route.query.dview || 'pipeline')
  if (tab.value === 'knowledge') {
    const raw = String(route.query.kview || 'all')
    return raw === 'playbook' ? 'all' : raw
  }
  if (tab.value === 'config') {
    const s = String(configSection.value || 'env')
    if (s === 'flow') return 'flow-req'
    return s
  }
  return ''
})
const itemOpen = ref({
  process: tab.value === 'process',
  tasks: tab.value === 'tasks' || tab.value === 'dispatch',
  cases: tab.value === 'cases',
  knowledge: tab.value === 'knowledge',
  assets: tab.value === 'assets',
  config: tab.value === 'config',
})
const searchOpen = ref(false)
const searchQ = ref('')
const workspaceLabel = computed(() => projectName.value || '项目')
const workspaceInitial = computed(() => String(workspaceLabel.value).replace(/\s+/g, '').slice(0, 1) || '项')
const searchHits = computed(() => {
  const q = searchQ.value.trim().toLowerCase()
  const rows = []
  for (const n of TESTING_NAV) {
    rows.push({ tab: n.id, sub: '', label: n.label })
    for (const c of n.children || []) rows.push({ tab: n.id, sub: c.id, label: `${n.label} / ${c.label}` })
  }
  rows.push({ tab: 'cases', sub: 'library', label: '用例库' })
  rows.push({ tab: 'process', sub: '', label: '流程' })
  rows.push({ tab: 'assets', sub: '', label: '测试资源' })
  for (const t of tasks.value || []) {
    const title = taskTitle(t)
    if (title) rows.push({ tab: 'tasks', sub: '', task: t.taskId, label: `执行批次 / ${title}` })
  }
  if (!q) return rows.filter((r) => !r.task)
  return rows.filter((r) => r.label.toLowerCase().includes(q))
})
const navItemOn = (item) => {
  if (item.id === 'tasks') return tab.value === 'tasks' || tab.value === 'dispatch'
  return tab.value === item.id
}
const childOn = (item, child) => {
  if (item.id === 'tasks') {
    if (child.id === 'runs') return tab.value === 'tasks'
    if (child.id === 'calls') return tab.value === 'dispatch'
  }
  return tab.value === item.id && activeSub.value === child.id
}
const toggleNavItem = (item) => {
  if (!item.children?.length) {
    setTab(item.id)
    return
  }
  itemOpen.value[item.id] = !itemOpen.value[item.id]
  if (itemOpen.value[item.id]) {
    if (item.id === 'tasks') setTab(tab.value === 'dispatch' ? 'dispatch' : 'tasks')
    else setTab(item.id)
  }
}
const onNavChild = async (item, child) => {
  if (item.id === 'tasks') {
    await setTab(child.id === 'calls' ? 'dispatch' : 'tasks')
    return
  }
  if (tab.value !== item.id) await setTab(item.id)
  onSub(child.id)
}
const goSearchHit = async (row) => {
  searchOpen.value = false
  searchQ.value = ''
  if (row.task) {
    await onOpenTask(row.task)
    return
  }
  await setTab(row.tab)
  if (row.sub) onSub(row.sub)
}
const onShellSearch = () => {
  searchOpen.value = true
}
const canCreate = computed(() => tab.value === 'process' || tab.value === 'tasks')
const createTitle = computed(() => (tab.value === 'process' ? '新建需求' : '新建执行'))
const onShellCreate = () => {
  if (tab.value === 'process') {
    processPanel.value?.openCreate?.()
    return
  }
  if (tab.value === 'tasks') openNewRun()
}
watch(tab, (id) => {
  if (id === 'dispatch') itemOpen.value.tasks = true
  const hit = TESTING_NAV.find((n) => n.id === id)
  if (hit?.children?.length) itemOpen.value[id] = true
})
const runDialogTitle = computed(() => {
  const kind = runSeed.value?.kind
  if (kind === 'req_admit') return '下发提测冒烟'
  if (kind === 'req_test') return '下发功能测试'
  if (kind === 'release_regression') return '下发预发回归'
  if (kind === 'release_smoke') return '下发生产冒烟'
  return '新建执行'
})

const caseExecutionProvider = computed(() =>
  (providers.value || []).find((p) => p.configured && p.enabled !== false && p.case_execution_use === true) || null)
const caseExecutionModelLabel = computed(() => {
  const p = caseExecutionProvider.value
  return p ? `${p.name || p.id} · ${p.model || '默认模型'}` : '未配置（设置 → 密钥配置 → 大模型 Key）'
})
const selectedDevices = computed(() =>
  (runForm.value.sns || []).map((sn) => devices.value.find((d) => d.sn === sn)).filter(Boolean),
)
const caseQuery = ref('')
const taskFilter = ref('all')
const taskDeviceFilter = ref('')
const taskWhen = ref('all')

const taskDeviceOptions = computed(() => {
  const set = new Set()
  for (const t of tasks.value) {
    for (const sn of taskSns(t)) set.add(sn)
  }
  return [...set]
})

const visibleTasks = computed(() => sortTasksForList(filterTasks(tasks.value, {
  status: taskFilter.value,
  sn: taskDeviceFilter.value,
  when: taskWhen.value,
})))
const taskPage = ref(1)
const taskPageSize = ref(20)
const pagedTasks = computed(() => slicePage(visibleTasks.value, taskPage.value, taskPageSize.value))
const runningTaskCount = computed(() =>
  tasks.value.filter((t) => ['running', 'queued'].includes(displayTaskStatus(t))).length,
)
const taskListPill = computed(() => {
  if (runningTaskCount.value) return `${runningTaskCount.value} 条进行中`
  return `${visibleTasks.value.length} 条任务`
})
const taskEmptyText = computed(() => (tasks.value.length ? '没有符合筛选的任务' : '暂无任务'))
const formatTaskTime = (row) => (row?.startedAt || '').replace('T', ' ').slice(5, 16) || '—'

const filteredCases = computed(() => {
  const rid = runSeed.value?.requirementId
  let list = cases.value || []
  if (rid) {
    list = list.filter((c) => c.source !== 'generated' || String(c.requirement_id) === String(rid))
  }
  const q = caseQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((c) => {
    const blob = `${c.case_id || ''} ${c.name || c.title || ''} ${c.module || ''} ${c.platform || ''}`
    return blob.toLowerCase().includes(q)
  })
})
const moduleTreeRef = ref()
const caseTree = computed(() => groupCasesByModuleTree(filteredCases.value))
const syncTreeChecks = () => {
  nextTick(() => {
    moduleTreeRef.value?.setCheckedKeys((selectedCaseIds.value || []).filter(Boolean))
  })
}
const onModuleTreeCheck = () => {
  const nodes = moduleTreeRef.value?.getCheckedNodes(true) || []
  selectedCaseIds.value = nodes.map((n) => n.case_id || (n.isCase ? n.id : '')).filter(Boolean)
  selectedSuiteId.value = ''
}

const selectedDeviceKinds = computed(() => {
  const set = new Set(selectedDevices.value.map((d) => devicePlatformKind(d)).filter(Boolean))
  return [...set]
})

const mixedSelectedPlatforms = computed(() => selectedDeviceKinds.value.length > 1)

const deviceOptionDisabled = (d) => {
  if (d.busy_task_id) return true
  if (!d.reserved_slot_id) return false
  return d.reserved_slot_id !== runSeed.value?.slotId
}

const reservedSelectedDevice = computed(() => selectedDevices.value.find((d) => (
  d.reserved_slot_id && d.reserved_slot_id !== runSeed.value?.slotId
)) || null)

const unitCount = computed(() => {
  const n = selectedCaseIds.value.length
  const m = runForm.value.sns.length
  if (!n) return 0
  if (!m) return n
  return runForm.value.coverage === 'per_device' && m > 1 ? n * m : n
})

const showCoveragePick = computed(() => runForm.value.sns.length >= 2)

const platformConflictCases = computed(() => {
  if (mixedSelectedPlatforms.value || selectedDeviceKinds.value.length !== 1) return []
  if (!selectedCaseIds.value.length) return []
  const want = selectedDeviceKinds.value[0]
  return (cases.value || []).filter((c) => {
    if (!selectedCaseIds.value.includes(c.case_id)) return false
    const kind = casePlatformKind(c)
    return kind !== 'any' && kind !== want
  })
})

const busySelectedDevice = computed(() => selectedDevices.value.find((d) => d.busy_task_id) || null)

const canStartRun = computed(() => (
  selectedCaseIds.value.length > 0
  && !busySelectedDevice.value
  && !reservedSelectedDevice.value
))

const baseQuery = () => ({
  appName: appName.value,
  projectName: projectName.value,
  projectId: projectId.value,
})

const replaceQuery = (patch) => {
  const next = { ...route.query, ...patch }
  Object.keys(next).forEach((k) => {
    if (next[k] === undefined || next[k] === null || next[k] === '') delete next[k]
  })
  delete next.task
  return router.replace({ name: 'TestingApp', params: { appId: appId.value }, query: next })
}

const goApp = (query) => {
  const next = { ...baseQuery(), ...query }
  Object.keys(next).forEach((k) => {
    if (next[k] === undefined || next[k] === null || next[k] === '') delete next[k]
  })
  delete next.task
  const dest = { name: 'TestingApp', params: { appId: appId.value }, query: next }
  if (isTaskRouteName(route.name)) return router.push(dest)
  return router.replace(dest)
}

const clearTask = () => {
  tab.value = 'tasks'
  goApp({ tab: 'tasks' })
}

const clearCase = () => {
  if (!selectedTaskId.value) {
    clearTask()
    return
  }
  tab.value = 'tasks'
  router.push({
    name: 'TestingTask',
    params: { appId: appId.value, taskId: selectedTaskId.value },
    query: baseQuery(),
  })
}

const clearDispatchCall = () => {
  replaceQuery({ ...baseQuery(), tab: 'dispatch', call: undefined })
}

const onGoTab = (next) => {
  const raw = String(next || '')
  if (raw.startsWith('config')) {
    let section = raw.includes(':') ? raw.split(':')[1] : 'env'
    if (section === 'flow') section = 'flow-req'
    setConfigSection(section || 'env')
    return
  }
  setTab(raw)
}

const onOpenReq = (id) => {
  processBoard.value = 'req'
  processId.value = String(id || '')
  setTab('process')
  replaceQuery({ ...baseQuery(), tab: 'process', board: 'req', pid: processId.value, task: undefined })
}

const onSub = (id) => {
  if (tab.value === 'process') {
    onProcessBoard(id)
    return
  }
  if (tab.value === 'cases') {
    replaceQuery({
      ...baseQuery(),
      tab: 'cases',
      view: id,
      task: undefined,
      refsrc: id === 'library' ? route.query.refsrc : undefined,
    })
    return
  }
  if (tab.value === 'assets') {
    replaceQuery({ ...baseQuery(), tab: 'assets', section: id, task: undefined })
    return
  }
  if (tab.value === 'dispatch') {
    replaceQuery({ ...baseQuery(), tab: 'dispatch', dview: id, task: undefined })
    return
  }
  if (tab.value === 'knowledge') {
    replaceQuery({ ...baseQuery(), tab: 'knowledge', kview: id, task: undefined })
    return
  }
  if (tab.value === 'config') setConfigSection(id)
}

const setTab = async (next) => {
  const resolved = resolveTab(next)
  tab.value = resolved
  const q = {
    appName: appName.value || undefined,
    projectName: projectName.value || undefined,
    projectId: projectId.value || undefined,
    tab: resolved,
  }
  if (resolved === 'config') {
    const raw = String(route.query.configSection || configSection.value || 'env')
    q.configSection = raw === 'flow' ? 'flow-req' : raw
  }
  if (resolved === 'process') {
    q.board = processBoard.value
    q.pid = processId.value || undefined
    loadDevices()
  }
  if (resolved === 'cases') {
    const rawView = String(route.query.view || 'atlas')
    q.view = (rawView === 'sync' || rawView === 'feishu') ? 'library' : rawView
  }
  if (resolved === 'assets') q.section = String(route.query.section || 'accounts')
  if (resolved === 'dispatch') q.dview = String(route.query.dview || 'pipeline')
  if (resolved === 'knowledge') {
    const raw = String(route.query.kview || 'all')
    q.kview = raw === 'playbook' ? 'all' : raw
  }
  Object.keys(q).forEach((k) => {
    if (q[k] === undefined || q[k] === null || q[k] === '') delete q[k]
  })
  try {
    await goApp(q)
  } catch (_) { /* ignore dup nav */ }
  tab.value = resolved
}

const onProcessBoard = (v) => {
  processBoard.value = resolveBoard(v)
  replaceQuery({
    ...baseQuery(),
    tab: 'process',
    board: processBoard.value,
    pid: processId.value || undefined,
    task: undefined,
  })
}

const onProcessId = (id) => {
  processId.value = String(id || '')
  replaceQuery({
    ...baseQuery(),
    tab: 'process',
    board: processBoard.value,
    pid: processId.value || undefined,
    task: undefined,
  })
}

const onProcessDispatch = (seed) => {
  openNewRun(seed)
}

const setConfigSection = (key) => {
  tab.value = 'config'
  replaceQuery({ ...baseQuery(), tab: 'config', configSection: key, task: undefined })
}

const selectTask = (task) => {
  if (!task?.taskId) return
  tab.value = 'tasks'
  router.push({
    name: 'TestingTask',
    params: { appId: appId.value, taskId: task.taskId },
    query: baseQuery(),
  })
}

const selectCase = (row) => {
  const caseId = String(row?.case_id || row?.report_run_id || '').trim()
  if (!caseId || !selectedTaskId.value) return
  tab.value = 'tasks'
  router.push({
    name: 'TestingTaskCase',
    params: { appId: appId.value, taskId: selectedTaskId.value, caseId },
    query: { ...baseQuery(), sn: row.sn || undefined },
  })
}

const onOpenTask = async (id) => {
  await loadTasks()
  selectTask({ taskId: id })
}

const taskRowClass = (row) => {
  const s = displayTaskStatus(row)
  if (s === 'running' || s === 'queued') return 'is-running'
  if (s === 'failed') return 'is-failed'
  if (s === 'partial_fail' || s === 'unobserved' || s === 'unverifiable') return 'is-partial'
  if (s === 'cancelled') return 'is-cancelled'
  if (s === 'done' || s === 'pass') return 'is-done'
  return ''
}
const taskTableRowClass = ({ row }) => {
  const bits = [taskRowClass(row)]
  if (row.taskId === selectedTaskId.value) bits.push('is-current')
  return bits.filter(Boolean).join(' ')
}

watch([taskFilter, taskDeviceFilter, taskWhen, () => visibleTasks.value.length], () => {
  taskPage.value = 1
})

const openApp = (app, project) => {
  router.push({
    name: 'TestingApp',
    params: { appId: app.id },
    query: {
      appName: app.name,
      projectName: project?.name || projectName.value,
      projectId: project?.id || projectId.value,
      tab: tab.value,
      configSection: tab.value === 'config' ? (configSection.value || 'env') : undefined,
    },
  })
}

const onProjectChange = (pid) => {
  const project = projects.value.find((p) => p.id === pid)
  if (!project) return
  const first = (project.apps || [])[0]
  if (!first) {
    ElMessage.warning('该项目下还没有工作台，先到测试首页「管理」里补一个挂载点')
    return
  }
  openApp(first, project)
}

const loadProjects = async () => {
  try {
    const res = await getProjects()
    projects.value = Array.isArray(res) ? res : (res?.data || [])
    // 深链缺 projectId 时从应用反查
    if (!projectId.value && appId.value) {
      for (const p of projects.value) {
        const hit = (p.apps || []).find((a) => a.id === appId.value)
        if (hit) {
          // 只补 project 字段，勿回写整份旧 query（避免覆盖用户刚点的 任务/配置）
          replaceQuery({
            projectId: p.id,
            projectName: p.name,
            appName: route.query.appName || hit.name,
          })
          break
        }
      }
    }
  } catch (_) {
    projects.value = []
  }
}

const loadTasks = async () => {
  if (!appId.value) return
  loading.value = true
  try {
    const caseIds = (cases.value || []).map((c) => c.case_id).filter(Boolean)
    const { tasks: next } = await fetchTasksForApp(appId.value, { caseIds })
    tasks.value = next
  } finally {
    loading.value = false
  }
}

const loadDevices = async () => {
  try {
    const r = await listCaseRunnerDevices(true)
    devices.value = filterExecutableDevices(r?.data?.items || [])
    runForm.value.sns = (runForm.value.sns || []).filter((sn) => devices.value.some((d) => d.sn === sn))
  } catch (_) {
    devices.value = []
  }
}
const loadProviders = async () => {
  try {
    const r = await listAIProviders()
    providers.value = r?.data?.providers || []
  } catch (_) {
    providers.value = []
  }
}
const loadCases = async () => {
  if (!appId.value) return
  casesLoading.value = true
  try {
    const autoRes = await getAppAutomationConfig(appId.value).catch(() => null)
    const reqs = autoRes?.data?.automation?.qa_process?.requirements || []
    cases.value = generatedCasesFromProcess(reqs)
  } catch (_) {
    cases.value = []
  } finally {
    casesLoading.value = false
  }
}

const loadSuites = async () => {
  if (!appId.value) return
  try {
    const r = await getAppAutomationConfig(appId.value)
    suites.value = r?.data?.automation?.suites || []
  } catch (_) {
    suites.value = []
  }
}

const applySuiteId = (id) => {
  selectedSuiteId.value = id || ''
  if (!id) return
  if (id === '__all__') {
    selectedCaseIds.value = (cases.value || []).map((c) => c.case_id).filter(Boolean)
    return
  }
  const s = suites.value.find((x) => x.id === id)
  if (!s) return
  selectedCaseIds.value = suiteCaseIds(s, cases.value)
}

const saveSuiteFromRun = async () => {
  if (!selectedCaseIds.value.length) {
    ElMessage.warning('请先勾选用例')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('套件名称', '存为套件', {
      confirmButtonText: '保存',
      inputValue: '',
      inputPattern: /\S/,
      inputErrorMessage: '请填写名称',
    })
    const name = String(value || '').trim()
    const next = [...suites.value]
    const hit = next.findIndex((s) => s.name === name)
    const row = {
      id: hit >= 0 ? next[hit].id : '',
      name,
      case_ids: [...selectedCaseIds.value],
      updated_at: new Date().toISOString(),
    }
    if (hit >= 0) next[hit] = { ...next[hit], ...row }
    else next.push(row)
    await updateAppAutomationConfig(appId.value, { suites: next })
    await loadSuites()
    const match = suites.value.find((s) => s.name === name)
    if (match) selectedSuiteId.value = match.id
    ElMessage.success('套件已保存')
  } catch (_) { /* cancel */ }
}

const consumeOpenRun = async () => {
  if (String(route.query.openRun || '') !== '1') return
  const ids = parseCaseIdQuery(route.query.caseIds)
  const suiteId = String(route.query.suite || '')
  tab.value = 'tasks'
  await Promise.all([
    loadCases(),
    loadDevices(),
    loadSuites(),
  ])
  const sns = String(route.query.sns || '').split(',').filter(Boolean)
  selectedSuiteId.value = ''
  selectedCaseIds.value = []
  runSeed.value = ids.length || sns.length || route.query.kind
    ? {
        caseIds: ids,
        kind: String(route.query.kind || '') || undefined,
        slotId: String(route.query.slotId || '') || undefined,
        requirementId: String(route.query.requirementId || '') || undefined,
        releaseId: String(route.query.releaseId || '') || undefined,
        sns,
        envProfile: String(route.query.envProfile || '') || undefined,
      }
    : null
  newRunVisible.value = true
  if (suiteId && suites.value.some((s) => s.id === suiteId)) applySuiteId(suiteId)
  else if (ids.length) selectedCaseIds.value = ids
  if (sns.length) {
    const allowed = sns.filter((sn) => devices.value.some((d) => d.sn === sn))
    if (allowed.length) runForm.value.sns = allowed
  }
  replaceQuery({
    ...baseQuery(),
    tab: 'tasks',
    openRun: undefined,
    caseIds: undefined,
    suite: undefined,
    kind: undefined,
    slotId: undefined,
    requirementId: undefined,
    releaseId: undefined,
    sns: undefined,
    envProfile: undefined,
  })
}

const mergeSeedCases = (seed) => {
  if (seed?.generatedCases?.length) {
    cases.value = mergeRunCases(cases.value, seed.generatedCases)
  }
}

const openNewRun = async (seed = null) => {
  const real = seed && Array.isArray(seed.caseIds) ? seed : null
  runSeed.value = real && real.caseIds.length ? real : null
  selectedSuiteId.value = ''
  selectedCaseIds.value = runSeed.value ? [...runSeed.value.caseIds] : []
  mergeSeedCases(runSeed.value)
  newRunVisible.value = true
  await Promise.all([
    loadCases(),
    loadDevices(),
    loadSuites(),
  ])
  mergeSeedCases(runSeed.value)
  if (runSeed.value?.caseIds?.length) selectedCaseIds.value = [...runSeed.value.caseIds]
  if (runSeed.value?.sns?.length) {
    const allowed = runSeed.value.sns.filter((sn) => devices.value.some((d) => d.sn === sn))
    if (allowed.length) runForm.value.sns = allowed
  }
}

const selectAllVisibleCases = () => {
  const ids = (filteredCases.value || []).map((c) => c.case_id).filter(Boolean)
  selectedCaseIds.value = [...new Set(ids)]
  selectedSuiteId.value = ''
}

const clearSelectedCases = () => {
  selectedCaseIds.value = []
  selectedSuiteId.value = ''
}

const submitRun = async () => {
  if (!selectedCaseIds.value.length) { ElMessage.warning('请至少选择一条用例'); return }
  const sns = runForm.value.sns || []
  const busyDev = selectedDevices.value.find((d) => d.busy_task_id)
  if (busyDev) {
    ElMessage.warning(`设备占用中（任务 ${shortTaskId(busyDev.busy_task_id)}）`)
    return
  }
  const reservedDev = selectedDevices.value.find((d) => d.reserved_slot_id && d.reserved_slot_id !== runSeed.value?.slotId)
  if (reservedDev) {
    ElMessage.warning(`设备已被排期占用：${reservedDev.reserved_title || '其他窗口'} 至 ${String(reservedDev.reserved_until || '').replace('T', ' ').slice(5, 16)}`)
    return
  }
  submitting.value = true
  try {
    const kinds = selectedDeviceKinds.value
    const platform = kinds.length === 1
      ? kinds[0]
      : (kinds.length > 1 ? 'mixed' : (runForm.value.platform || 'android'))
    const coverage = sns.length > 1 ? runForm.value.coverage : 'once'
    const res = await runCaseRunner({
      app_id: appId.value,
      sn: sns[0] || '',
      sns,
      coverage,
      platform,
      case_ids: selectedCaseIds.value,
      async_exec: runForm.value.async_exec,
      use_persisted_baseline: runForm.value.use_persisted_baseline,
      use_cache: runForm.value.use_cache,
      run_type: runSeed.value?.kind || 'manual',
      slot_id: runSeed.value?.slotId || '',
      requirement_id: runSeed.value?.requirementId || '',
      release_id: runSeed.value?.releaseId || '',
    })
    const batch = res?.data?.run_id || res?.data?.task_id
    if (!batch) { ElMessage.error('启动失败：未拿到 run_id'); return }
    newRunVisible.value = false
    if (runSeed.value && processPanel.value?.attachRun) {
      await processPanel.value.attachRun({
        requirementId: runSeed.value.requirementId,
        releaseId: runSeed.value.releaseId,
        kind: runSeed.value.kind,
        taskId: batch,
      })
      runSeed.value = null
      ElMessage.success('已下发，单据已挂上该批次')
      await loadTasks()
      selectTask({ taskId: batch })
      return
    }
    runSeed.value = null
    ElMessage.success('已启动任务')
    await loadTasks()
    selectTask({ taskId: batch })
  } catch (e) {
    const busy = parseBusyConflict(e)
    if (busy.isReserved) {
      ElMessage.warning(`设备已被排期占用${busy.reservedTitle ? `：${busy.reservedTitle}` : ''}`)
      return
    }
    if (busy.isBusy) {
      ElMessage.warning(busy.message || '设备正在执行其他任务')
      if (busy.busyTaskId) {
        newRunVisible.value = false
        selectTask({ taskId: busy.busyTaskId })
      }
      return
    }
    ElMessage.error(`启动失败: ${e?.response?.data?.detail || e?.message || e}`)
  } finally {
    submitting.value = false
  }
}

const refreshLive = async () => {
  const running = tasks.value.filter((t) => t.status === 'running' || t.status === 'queued')
  if (!running.length) return
  try {
    await Promise.all(running.map(async (t) => {
      const next = await fetchTaskDetail(t.taskId, t)
      if (next) upsert(next)
    }))
  } catch (_) {}
}

onMounted(async () => {
  const qTask = String(route.query.task || '')
  if (qTask && !route.params.taskId) {
    const q = { ...baseQuery() }
    await router.replace({
      name: 'TestingTask',
      params: { appId: appId.value, taskId: qTask },
      query: q,
    })
  }
  // Redirect legacy config sections that used to host Feishu case sync.
  if (route.query.tab === 'config' && ['regression', 'icons', 'cases', 'feishu-legacy'].includes(String(route.query.configSection || ''))) {
    const nextTab = route.query.configSection === 'icons' ? 'config' : 'cases'
    tab.value = nextTab
    replaceQuery({ ...baseQuery(), tab: nextTab, configSection: nextTab === 'config' ? 'env' : undefined })
  }
  if (route.query.tab === 'process' && route.query.board === 'flow') {
    tab.value = 'config'
    processBoard.value = 'rel'
    replaceQuery({ ...baseQuery(), tab: 'config', configSection: 'flow', board: undefined })
  }
  await Promise.all([loadCases(), loadProjects(), loadProviders(), loadSuites(), loadDevices()])
  await loadTasks()
  await consumeOpenRun()
  pollTimer.value = setInterval(refreshLive, 20000)
})

onUnmounted(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
})

watch(appId, async () => {
  tasks.value = []
  selectedCaseIds.value = []
  tab.value = isTaskRouteName(route.name) ? 'tasks' : resolveTab(route.query.tab)
  await loadCases()
  await loadSuites()
  await loadTasks()
})

watch(() => route.query.openRun, (v) => {
  if (String(v || '') === '1') consumeOpenRun()
})

watch(() => runForm.value.sns, (sns) => {
  if (!sns?.length) return
  if (sns.length < 2) runForm.value.coverage = 'once'
  const picked = devices.value.find((d) => d.sn === sns[0])
  if (!picked) return
  runForm.value.platform = devicePlatformKind(picked) || 'android'
}, { deep: true })

watch(newRunVisible, (open) => {
  if (open) syncTreeChecks()
  if (!open && !submitting.value) runSeed.value = null
})
watch(selectedCaseIds, () => {
  if (newRunVisible.value) syncTreeChecks()
})
</script>

<template>
  <WorkShell mode="testing" :create-title="createTitle" :show-create="canCreate" @search="onShellSearch" @create="onShellCreate">
    <template #sidebar>
      <el-dropdown trigger="click" @command="onProjectChange">
        <button type="button" class="nav-workspace">
          <span class="nav-workspace-avatar">{{ workspaceInitial }}</span>
          <div>
            <strong>{{ workspaceLabel }}</strong>
            <small>工作台</small>
          </div>
          <span class="nav-workspace-caret">▾</span>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="p in projects" :key="p.id" :command="p.id">{{ p.name }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <nav class="side-actions" aria-label="项目导航">
        <template v-for="item in TESTING_NAV" :key="item.id">
          <div :class="{ 'nav-config-block': item.id === 'config' }">
            <button
              type="button"
              class="nav-item"
              :class="{ on: navItemOn(item) }"
              @click="toggleNavItem(item)"
            >
              <span class="nav-dot" :style="{ background: item.color || '#64748b' }">{{ item.icon || item.label.slice(0, 1) }}</span>
              {{ item.label }}
              <i
                v-if="item.children?.length"
                class="nav-caret nav-item-caret"
                :class="{ 'is-closed': !itemOpen[item.id] }"
              />
            </button>
            <div v-if="item.children?.length && itemOpen[item.id]" class="nav-children">
              <button
                v-for="child in item.children"
                :key="child.id"
                type="button"
                class="nav-child"
                :class="{ on: childOn(item, child) }"
                @click="onNavChild(item, child)"
              >
                {{ child.label }}
              </button>
            </div>
          </div>
        </template>
      </nav>
    </template>

    <div class="testing-workspace">
      <div
        v-if="tab === 'tasks' && !hasDetail"
        class="ws-config fill"
        v-loading="loading"
      >
        <div class="settings-panel task-list-page">
          <header class="settings-page-header">
            <div>
              <h2 class="settings-page-title">执行批次</h2>
            </div>
            <div
              class="settings-summary-pill"
              :style="runningTaskCount ? { background: '#ecfdf5', color: '#047857' } : undefined"
            >{{ taskListPill }}</div>
          </header>
          <section class="settings-table-card is-fill">
            <div class="col-head">
              <h3>全部批次</h3>
              <div class="col-actions">
                <el-select v-model="taskFilter" size="small" class="filter-item">
                  <el-option label="全部状态" value="all" />
                  <el-option label="进行中" value="running" />
                  <el-option label="部分失败" value="partial_fail" />
                  <el-option label="失败" value="failed" />
                  <el-option label="还没测完" value="unobserved" />
                  <el-option label="已取消" value="cancelled" />
                  <el-option label="已通过" value="done" />
                </el-select>
                <el-select v-model="taskDeviceFilter" size="small" clearable placeholder="设备" class="filter-item">
                  <el-option
                    v-for="sn in taskDeviceOptions"
                    :key="sn"
                    :label="shortDeviceLabel(sn)"
                    :value="sn"
                  />
                </el-select>
                <el-select v-model="taskWhen" size="small" class="filter-item">
                  <el-option label="全部时间" value="all" />
                  <el-option label="今天" value="today" />
                  <el-option label="近 7 天" value="week" />
                </el-select>
                <el-button size="small" :loading="loading" @click="loadTasks">刷新</el-button>
                <el-button size="small" type="primary" @click="openNewRun">新建执行</el-button>
              </div>
            </div>
            <div class="table-wrap">
              <el-table
                :data="pagedTasks"
                border
                stripe
                size="small"
                height="100%"
                highlight-current-row
                :row-class-name="taskTableRowClass"
                :empty-text="taskEmptyText"
                @row-click="selectTask"
              >
                <el-table-column label="状态" width="96">
                  <template #default="{ row }">
                    <el-tag :type="statusTagType(row.status, row)" size="small" effect="light">{{ statusLabel(row.status, row) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="任务" min-width="180" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span class="task-name">{{ taskTitle(row) }}</span>
                    <span v-if="row.runType && row.runType !== 'manual'" class="run-type">{{ runTypeLabel(row.runType) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="编号" width="100" show-overflow-tooltip>
                  <template #default="{ row }">{{ shortTaskId(row.taskId) }}</template>
                </el-table-column>
                <el-table-column label="进度" width="160">
                  <template #default="{ row }">
                    <div class="task-prog-cell">
                      <el-progress
                        :percentage="taskProgressPct(row)"
                        :stroke-width="6"
                        :show-text="false"
                        :status="progressStatus(row)"
                      />
                      <span>{{ taskCountLabel(row) }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="覆盖" width="72">
                  <template #default="{ row }">
                    {{ taskSns(row).length > 1 ? coverageLabel(taskCoverage(row)) : '—' }}
                  </template>
                </el-table-column>
                <el-table-column label="设备" width="140" show-overflow-tooltip>
                  <template #default="{ row }">{{ formatTaskDevices(row) || '—' }}</template>
                </el-table-column>
                <el-table-column label="时间" width="108">
                  <template #default="{ row }">{{ formatTaskTime(row) }}</template>
                </el-table-column>
                <el-table-column label="操作" width="72" fixed="right">
                  <template #default="{ row }">
                    <el-button link type="primary" size="small" @click.stop="selectTask(row)">查看</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <el-pagination
              class="settings-table-pager"
              background
              size="small"
              layout="total, sizes, prev, pager, next"
              :total="visibleTasks.length"
              :page-sizes="TABLE_PAGE_SIZES"
              v-model:page-size="taskPageSize"
              v-model:current-page="taskPage"
            />
          </section>
        </div>
      </div>

      <div
        v-else-if="tab === 'tasks'"
        class="ws-config fill task-detail-page"
        v-loading="loading"
      >
        <TaskDetailPane
          :key="selectedTaskId"
          :task-id="selectedTaskId"
          :case-id="selectedCaseId"
          :case-sn="selectedCaseSn"
          :app-id="appId"
          :seed="selectedTask"
          @open-task="onOpenTask"
          @open-case="selectCase"
        >
          <template #actions>
            <template v-if="hasCase">
              <el-button @click="clearCase">返回任务</el-button>
            </template>
            <template v-else>
              <el-button @click="clearTask">返回批次</el-button>
              <el-button type="primary" @click="openNewRun">新建执行</el-button>
            </template>
          </template>
        </TaskDetailPane>
      </div>

      <div v-else-if="tab === 'process'" class="ws-config fill">
        <QaProcessPanel
          ref="processPanel"
          hide-nav
          :app-id="appId"
          :app-name="appName"
          :cases="cases"
          :tasks="tasks"
          :suites="suites"
          :devices="devices"
          :project-id="projectId"
          :board="processBoard"
          :selected-id="processId"
          @update:board="onProcessBoard"
          @update:selected-id="onProcessId"
          @dispatch-run="onProcessDispatch"
          @open-task="onOpenTask"
          @go-tab="onGoTab"
        />
      </div>

      <div v-else-if="tab === 'dispatch'" class="ws-config fill">
        <DispatchJobPage
          v-if="dispatchCallId"
          embedded
          :call-id="dispatchCallId"
          :app-id="appId"
          @back="clearDispatchCall"
        />
        <DispatchPage v-else embedded hide-nav :app-id="appId" :view="activeSub" />
      </div>

      <div v-else-if="tab === 'cases'" class="ws-config fill">
        <CasesWorkbench
          hide-nav
          :app-id="appId"
          :app-name="appName"
          :project-id="projectId"
          :project-name="projectName"
          @open-req="onOpenReq"
        />
      </div>

      <div v-else-if="tab === 'knowledge'" class="ws-config fill">
        <KnowledgePanel
          embedded
          hide-nav
          app-only
          :app-id="appId"
          :project-id="projectId"
          :app-name="appName"
          :review-filter="activeSub"
        />
      </div>

      <div v-else-if="tab === 'assets'" class="ws-config fill">
        <AssetsPage hide-nav :project-id="projectId" :project-name="projectName" :section="activeSub" />
      </div>

      <div v-else class="ws-config">
        <AppConfigPage
          embedded
          hide-nav
          :embed-app-id="appId"
          :embed-app-name="appName"
          :embed-project-id="projectId"
          :embed-project-name="projectName"
          :embed-section="configSection"
          :hide-sections="['regression', 'logic', 'cases', 'feishu-legacy', 'icons']"
          @update:embed-section="setConfigSection"
          @go-tab="onGoTab"
        />
      </div>
    </div>

    <el-dialog v-model="searchOpen" title="搜索" width="420px" class="mo-fit-dialog" align-center append-to-body @opened="() => {}">
      <el-input
        v-model="searchQ"
        placeholder="流程、用例、配置…"
        clearable
        autofocus
        @keyup.enter="searchHits[0] && goSearchHit(searchHits[0])"
      />
      <div class="search-hits">
        <button
          v-for="row in searchHits"
          :key="`${row.tab}-${row.sub}`"
          type="button"
          class="search-hit"
          @click="goSearchHit(row)"
        >
          {{ row.label }}
        </button>
        <p v-if="!searchHits.length" class="muted">没有匹配的入口</p>
      </div>
    </el-dialog>

    <el-dialog v-model="newRunVisible" :title="runDialogTitle" width="720px" append-to-body align-center class="new-run-dialog mo-fit-dialog">
      <div class="form">
        <div class="field">
          <label>设备（可多选；不选则由测试工程师按用例申请）</label>
          <el-select
            v-model="runForm.sns"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="可不选，开跑后按用例占用设备"
            style="width:100%"
            filterable
            teleported
            popper-class="device-select-popper"
          >
            <el-option
              v-for="d in devices"
              :key="d.sn"
              :label="formatDeviceTag(d)"
              :value="d.sn"
              :disabled="deviceOptionDisabled(d)"
            >
              <div class="dev-opt">
                <span class="dev-name">{{ formatDeviceTag(d) }}</span>
                <small>
                  {{ formatDeviceMeta(d) }}
                  <template v-if="d.busy_task_id"> · 占用中 {{ shortTaskId(d.busy_task_id) }}</template>
                  <template v-else-if="d.reserved_slot_id"> · 排期占用 {{ d.reserved_title || '其他窗口' }}</template>
                </small>
              </div>
            </el-option>
          </el-select>
          <div v-if="!devices.length" class="hint warn">暂无在线设备</div>
          <div v-else-if="busySelectedDevice" class="hint warn">
            {{ formatDeviceTag(busySelectedDevice) }} 正在跑任务 {{ shortTaskId(busySelectedDevice.busy_task_id) }}，请换一台或等它结束。
          </div>
          <div v-else-if="reservedSelectedDevice" class="hint warn">
            {{ formatDeviceTag(reservedSelectedDevice) }} 当前被排期占用（{{ reservedSelectedDevice.reserved_title || '其他窗口' }}），请换一台或等窗口结束。
          </div>
          <div v-else-if="selectedDevices.length" class="hint">
            已选 {{ selectedDevices.length }} 台 · {{ selectedDevices.map((d) => formatDeviceMeta(d)).join('；') }}
            <template v-if="mixedSelectedPlatforms">。每台按项目环境里对应的包名 / Bundle 执行</template>
          </div>
          <div v-else class="hint">可不选设备</div>
        </div>
        <div v-if="showCoveragePick" class="field">
          <label>覆盖方式</label>
          <div class="coverage-pick">
            <button
              type="button"
              class="coverage-card"
              :class="{ on: runForm.coverage === 'once' }"
              @click="runForm.coverage = 'once'"
            >
              <strong>加速拆分</strong>
              <span>每条用例只跑一次，空闲设备接着领</span>
              <em>{{ selectedCaseIds.length ? `${selectedCaseIds.length} 次执行` : '先勾选用例' }}</em>
            </button>
            <button
              type="button"
              class="coverage-card"
              :class="{ on: runForm.coverage === 'per_device' }"
              @click="runForm.coverage = 'per_device'"
            >
              <strong>全机覆盖</strong>
              <span>每台设备都把这批用例跑完</span>
              <em>{{ selectedCaseIds.length ? `${(selectedCaseIds.length || 0) * runForm.sns.length} 次执行` : '先勾选用例' }}</em>
            </button>
          </div>
          <div class="hint">
            <template v-if="unitCount && runForm.sns.length">将执行 {{ unitCount }} 次 · 占用 {{ runForm.sns.length }} 台直到任务结束</template>
            <template v-else-if="unitCount">将执行 {{ unitCount }} 次 · 设备由开跑后申请</template>
            <template v-else>勾选用例后显示执行次数 · {{ runForm.sns.length ? `已选 ${runForm.sns.length} 台` : '可不选设备' }}</template>
          </div>
        </div>
        <div class="field">
          <div class="hint model-hint">将使用：{{ caseExecutionModelLabel }}</div>
          <div v-if="runSeed?.envProfile" class="hint">
            环境：{{ envLabel(runSeed.envProfile) }}
          </div>
        </div>
        <div class="field">
          <label>套件</label>
          <div class="suite-pick">
            <el-select
              :model-value="selectedSuiteId"
              placeholder="先选套件，或下面手勾"
              clearable
              style="width:100%"
              @change="applySuiteId"
            >
              <el-option
                v-for="s in suites"
                :key="s.id"
                :label="`${s.name}（${suiteCaseIds(s, cases).length}）`"
                :value="s.id"
              />
            </el-select>
            <el-button size="small" text :disabled="!selectedCaseIds.length" @click="saveSuiteFromRun">存为套件</el-button>
          </div>
          <p v-if="!suites.length" class="hint">暂无套件</p>
        </div>
        <div class="field">
          <div class="case-head">
            <label>按模块勾选用例{{ selectedCaseIds.length ? ` · 已选 ${selectedCaseIds.length}` : '' }}</label>
            <span class="case-head-actions">
              <el-button size="small" text @click="selectAllVisibleCases">全选当前列表</el-button>
              <el-button size="small" text :disabled="!selectedCaseIds.length" @click="clearSelectedCases">清空</el-button>
            </span>
          </div>
          <el-input
            v-if="cases.length > 8"
            v-model="caseQuery"
            size="small"
            clearable
            placeholder="搜索编号、名称或模块"
            class="case-search"
          />
          <div class="cases">
            <el-tree
              v-if="caseTree.length"
              ref="moduleTreeRef"
              :data="caseTree"
              node-key="id"
              show-checkbox
              default-expand-all
              :props="{ label: 'label', children: 'children' }"
              @check="onModuleTreeCheck"
            />
            <el-empty v-else-if="!cases.length && !casesLoading" description="暂无用例" :image-size="50" />
            <p v-else-if="caseQuery && !filteredCases.length" class="hint">没有匹配的用例</p>
          </div>
        </div>
        <p v-if="platformConflictCases.length" class="hint">
          {{ platformConflictCases.length }} 条用例标注了另一平台，仍会在当前设备上执行。
          该端做不到的前置会标「无法执行」并跳过，只有真实检查没过才停跑：
          {{ platformConflictCases.map((c) => c.case_id).slice(0, 4).join('、') }}{{ platformConflictCases.length > 4 ? '…' : '' }}
        </p>
        <div class="field opts">
          <el-checkbox v-model="runForm.use_persisted_baseline">沿用上次成功路径</el-checkbox>
        </div>
      </div>
      <template #footer>
        <el-button @click="newRunVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!canStartRun" @click="submitRun">
          {{ unitCount ? (runForm.sns.length ? `开始 · ${unitCount} 次执行` : `开始 · ${unitCount} 条 · 技能申请设备`) : '启动' }}
        </el-button>
      </template>
    </el-dialog>
  </WorkShell>
</template>

<style scoped>
.side-actions {
  position: relative;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 0 8px;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  min-height: 0;
}
.nav-config-block {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
:deep(.el-dropdown) {
  width: 100%;
  display: block;
}
.search-hits {
  margin-top: 10px;
  max-height: 320px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.search-hit {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #111827;
}
.search-hit:hover { background: #f3f4f6; }
.muted { font-size: 12px; color: #94a3b8; }
.side-action {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  padding: 8px 12px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 41;
  display: flex;
  align-items: center;
  gap: 7px;
}
.side-action-icon {
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}
.side-action:hover { background: #f1f5f9; }
.side-action.on {
  background: var(--mo-primary-soft);
  color: var(--mo-primary);
  border-color: var(--el-color-primary-light-7);
}
.side-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  color: #374151;
}
.side-item:hover { background: #f1f5f9; }
.side-item.active { background: var(--mo-primary-soft); color: var(--mo-primary); }
.side-item.task .row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.side-item.task strong { font-family: ui-monospace, monospace; font-size: 12px; }
.side-item.task small { font-size: 11px; color: #94a3b8; }
.side-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; }

.testing-workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 8px 10px 10px;
  box-sizing: border-box;
  overflow: hidden;
}
.ws-top {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
}
.crumb {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
}
.crumb.link { color: var(--mo-primary); cursor: pointer; }
.crumb.muted { color: #6b7280; cursor: default; }
.crumb.mono { font-family: ui-monospace, monospace; }
.page-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}
.ws-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.task-list-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.task-detail-page {
  padding: 0 !important;
  background: var(--mo-card);
}
.task-detail-page :deep(.pane) {
  height: 100%;
  min-height: 0;
}
.task-list-page .settings-table-card.is-fill {
  flex: 1 1 0;
  height: 0;
  min-height: 0;
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
.col-head.compact { padding: 2px 2px 8px; margin-bottom: 0; }
.col-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; align-items: center; }
.filter-item { width: 118px; }
.table-wrap {
  flex: 1 1 0;
  height: 0;
  min-height: 200px;
  overflow: hidden;
}
.table-wrap :deep(.el-table) {
  height: 100%;
}
.task-list-page :deep(.el-table .el-table__row) { cursor: pointer; }
.task-list-page :deep(.el-table .is-running) { background: #ecfdf5; }
.task-list-page :deep(.el-table .is-current) { background: var(--mo-primary-soft) !important; }
.task-name { font-weight: 600; color: #111827; }
.task-prog-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.task-prog-cell span { font-size: 11px; color: #6b7280; font-weight: 600; }
.run-type {
  display: inline-flex;
  margin-left: 6px;
  font-size: 10px;
  color: #64748b;
  background: #f1f5f9;
  padding: 0 6px;
  border-radius: 999px;
  vertical-align: middle;
}
.settings-table-pager.compact { padding-top: 8px; }
.ws-config {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  overflow: auto;
  border: 1px solid var(--mo-border);
  border-radius: var(--mo-radius);
  background: var(--mo-card);
  padding: 10px 12px 8px;
  box-shadow: var(--mo-shadow);
  box-sizing: border-box;
}
.ws-config.fill {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ws-config.fill > * {
  flex: 1;
  min-height: 0;
  height: 100%;
}
.ws-config.fill :deep(.settings-table-card) {
  padding: 0;
  border: none;
  box-shadow: none;
  background: transparent;
}
.coverage-pick {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.coverage-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid #e3e8f0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  color: #111827;
}
.coverage-card strong { font-size: 13px; }
.coverage-card span { font-size: 12px; color: #6b7280; line-height: 1.4; }
.coverage-card em { font-size: 12px; font-style: normal; font-weight: 650; color: var(--mo-primary); }
.coverage-card.on {
  border-color: var(--mo-primary);
  background: var(--mo-primary-soft);
}
.field label { display: block; font-size: 13px; color: #374151; margin-bottom: 6px; font-weight: 500; }
.hint { font-size: 12px; color: #6b7280; }
.hint.warn { color: #b45309; }
.model-hint { margin-top: -4px; }
.case-search { margin-bottom: 8px; }
.case-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.case-head label { margin-bottom: 0; }
.case-head-actions { display: flex; gap: 4px; flex-shrink: 0; }
.case-plat { margin-left: 6px; color: #94a3b8; font-size: 11px; }
.cases { max-height: 320px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; padding: 8px; }
.case { display: block; margin: 0 0 6px; }
.opts { display: flex; gap: 16px; flex-wrap: wrap; }
.suite-pick { display: flex; align-items: center; gap: 8px; }
</style>

<style>
.device-select-popper .dev-opt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.3;
  padding: 2px 0;
}
.device-select-popper .dev-name { font-size: 13px; color: #111827; }
.device-select-popper .dev-opt small { font-size: 11px; color: #94a3b8; }
</style>
