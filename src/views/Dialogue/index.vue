<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElIcon, ElButton, ElInput, ElMessage } from 'element-plus'
import { Promotion, MagicStick, User } from '@element-plus/icons-vue'
import { copilotChat } from '@/api/copilot'
import { getDeviceList } from '@/api/device'
import { getProjects } from '@/api/workReport'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import { cancelTestingTask, listCaseRunnerDevices } from '@/api/caseRunner'
import { listAIProviders } from '@/api/settings'
import { flattenProjectApps, belongsToAgentTask } from '@/utils/copilotAgent'
import { devicePlatformKind } from '@/utils/testingTasks'
import { filterExecutableDevices, formatDeviceMeta, devicePrimaryName } from '@/utils/testingDevices'
import ExecutionTimeline from '@/components/ExecutionTimeline.vue'
import { copilotCommands } from '@/logic/CopilotCommands'
import { createAgentSession, pullAgentSessions, readAgentSessions, titleFromMessages, upsertAgentSession } from '@/utils/agentSessions'
import { getBaseUrl } from '@/utils/config'
import { pickDefaultDeviceSn } from '@/utils/devices'
import WorkShell from '@/layouts/WorkShell.vue'
import PayloadView from '@/components/PayloadView.vue'
import { rememberAgentPath } from '@/utils/workMode'

function normalizeDeviceList(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res?.data?.devices)) return res.data.devices
  if (Array.isArray(res?.devices)) return res.devices
  return []
}

const route = useRoute()
const router = useRouter()
const messages = ref([])
const inputValue = ref('')
const isLoading = ref(false)
const busyPhase = ref('')
const chatRef = ref(null)
const selectedSn = ref('')
const selectedAppId = ref('')
const devices = ref([])
const apps = ref([])
const devicesLoading = ref(false)
const stepLog = ref([])
const currentSessionId = ref('')
const agentSessions = ref([])
const liveTaskId = ref('')
let devicePollTimer = null

const showSlashMenu = ref(false)
const slashQuery = ref('')
const selectedSlashIndex = ref(0)
const modelMenuOpen = ref(false)
const deviceMenuOpen = ref(false)
const showScrollToBottom = ref(false)
const sendInFlight = ref(false)
const modelResponseRun = ref(null)
const aiProviders = ref([])
const planningEngine = ref('local')

const currentSession = computed(() => ({
  id: currentSessionId.value,
  title: titleFromMessages(messages.value),
  messages: messages.value.map(({ role, content, isSteps, isDebug, run }) => ({
    role,
    content,
    isSteps: !!isSteps,
    isDebug: !!isDebug,
    run: run || null,
  })),
  deviceSn: selectedSn.value,
  appId: selectedAppId.value,
  planningEngine: planningEngine.value,
}))
const hasUserMessages = computed(() => messages.value.some((item) => item.role === 'user' && String(item.content || '').trim()))
const recentAgentSessions = computed(() =>
  [...agentSessions.value]
    .filter((session) => (session.messages || []).some((item) => item.role === 'user' && String(item.content || '').trim()))
    .sort((a, b) => new Date(b.lastUserMessageAt || b.updatedAt) - new Date(a.lastUserMessageAt || a.updatedAt)),
)
const historyQuery = ref('')
const historySearchOpen = ref(false)
const historySearchRef = ref(null)
const visibleSessions = computed(() => {
  const q = historyQuery.value.trim().toLowerCase()
  if (!q) return recentAgentSessions.value
  return recentAgentSessions.value.filter((s) => String(s.title || '').toLowerCase().includes(q))
})
const openHistorySearch = async () => {
  historySearchOpen.value = true
  await nextTick()
  historySearchRef.value?.focus()
}
const isDraftAgent = computed(() => !hasUserMessages.value)
const isBusy = computed(() => !!busyPhase.value || sendInFlight.value)
const selectedAppLabel = computed(() => {
  const app = apps.value.find((item) => item.id === selectedAppId.value)
  return app ? (app.projectName ? `${app.name} · ${app.projectName}` : app.name) : '选择应用'
})
const selectedDeviceLabel = computed(() => {
  const device = devices.value.find((item) => item.sn === selectedSn.value)
  if (!device) return '选择设备'
  const name = devicePrimaryName(device)
  const shortSn = device.sn?.length > 8 ? `${device.sn.slice(0, 8)}…` : device.sn
  return `${name} · ${shortSn}`
})

const selectedPlanning = computed(() => {
  if (planningEngine.value === 'local') return { planningMode: 'local', providerId: '' }
  const providerId = planningEngine.value.replace(/^provider:/, '')
  return { planningMode: 'ai', providerId }
})
const configuredPlanningOptions = computed(() =>
  aiProviders.value
    .filter((provider) => provider.configured && provider.enabled !== false)
    .map((provider) => ({
      value: `provider:${provider.id}`,
      label: provider.name || provider.id,
      providerId: provider.id,
      model: provider.model || '',
      disabled: false,
    })),
)
const planningOptions = computed(() => [
  { value: 'local', label: 'Local Plan', providerId: '', disabled: false },
  ...configuredPlanningOptions.value,
  { value: '__configure_ai', label: '配置大模型 Key...', providerId: '', disabled: false },
])
const selectedPlanningLabel = computed(() =>
  planningOptions.value.find((option) => option.value === planningEngine.value)?.label || 'Local Plan',
)

const formatDeviceChip = (device) => {
  if (!device?.sn) return ''
  const model = device.model || device.type || 'Android'
  const shortSn = device.sn.length > 8 ? `${device.sn.slice(0, 8)}…` : device.sn
  return `${model} · ${shortSn}`
}

const busyStatusText = computed(() => {
  if (busyPhase.value === 'executing') return 'Agent 执行中…'
  if (busyPhase.value === 'planning' || isLoading.value) return '正在下发…'
  return '处理中…'
})

const appMenuOpen = ref(false)
const toggleAppMenu = () => {
  appMenuOpen.value = !appMenuOpen.value
  if (appMenuOpen.value) {
    deviceMenuOpen.value = false
    modelMenuOpen.value = false
  }
}
const selectApp = (app) => {
  selectedAppId.value = app?.id || ''
  appMenuOpen.value = false
  persistSession()
}

const handlePlanningChange = (value) => {
  if (value === '__configure_ai') {
    planningEngine.value = 'local'
    modelMenuOpen.value = false
    router.push({ name: 'SettingsKeys', query: { tab: 'model-keys' } })
    return
  }
  modelMenuOpen.value = false
  persistSession()
}

const selectPlanningOption = (option) => {
  if (!option || option.disabled) return
  planningEngine.value = option.value
  handlePlanningChange(option.value)
}

const toggleModelMenu = () => {
  modelMenuOpen.value = !modelMenuOpen.value
  if (modelMenuOpen.value) {
    appMenuOpen.value = false
    deviceMenuOpen.value = false
  }
}

const selectDevice = (device) => {
  selectedSn.value = device?.sn || ''
  deviceMenuOpen.value = false
  persistSession()
}

const toggleDeviceMenu = () => {
  deviceMenuOpen.value = !deviceMenuOpen.value
  if (deviceMenuOpen.value) {
    appMenuOpen.value = false
    modelMenuOpen.value = false
    loadDevices()
  }
}

const closeFloatingMenus = (event) => {
  const target = event.target
  if (!target?.closest?.('.app-picker')) appMenuOpen.value = false
  if (!target?.closest?.('.device-picker')) deviceMenuOpen.value = false
  if (!target?.closest?.('.llm-picker')) modelMenuOpen.value = false
}

const filteredSlash = computed(() => {
  const q = slashQuery.value.toLowerCase()
  if (!q) return copilotCommands
  return copilotCommands.filter(
    (a) =>
      a.id.toLowerCase().includes(q) ||
      a.title.toLowerCase().includes(q) ||
      (a.keywords && a.keywords.some((k) => k.toLowerCase().includes(q))),
  )
})

const handleInput = (val) => {
  if (val.startsWith('/')) {
    showSlashMenu.value = true
    slashQuery.value = val.slice(1)
    selectedSlashIndex.value = 0
  } else {
    showSlashMenu.value = false
  }
}

const scrollBottom = () => {
  nextTick(() => {
    if (chatRef.value) {
      chatRef.value.scrollTop = chatRef.value.scrollHeight
      showScrollToBottom.value = false
    }
  })
}

const handleChatScroll = () => {
  const el = chatRef.value
  if (!el) return
  showScrollToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight > 120
}

const persistSession = (options = {}) => {
  if (!hasUserMessages.value) return
  if (!currentSessionId.value) {
    currentSessionId.value = createAgentSession().id
    router.replace({ name: 'Dialogue', query: { sessionId: currentSessionId.value } })
  }
  upsertAgentSession(currentSession.value, options)
  refreshAgentSessions()
}

const refreshAgentSessions = (rows) => {
  agentSessions.value = Array.isArray(rows) ? rows : readAgentSessions()
}

const startNewAgent = () => {
  currentSessionId.value = ''
  messages.value = []
  stepLog.value = []
  router.replace({ name: 'Dialogue', query: { fresh: '1' } })
  refreshAgentSessions()
}

const restoreMessages = (session) => {
  messages.value = Array.isArray(session.messages)
    ? session.messages.map((item, index) => {
      const run = item.run ? { ...item.run, live: false } : item.run
      return { id: `${session.id}-${index}`, ...item, run }
    })
    : []
}

const openAgentSession = (session) => {
  currentSessionId.value = session.id
  restoreMessages(session)
  selectedSn.value = session.deviceSn || selectedSn.value
  selectedAppId.value = session.appId || selectedAppId.value
  planningEngine.value = session.planningEngine || planningEngine.value
  stepLog.value = []
  router.replace({ name: 'Dialogue', query: { sessionId: session.id } })
  scrollBottom()
}

const formatSessionTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  return date.toLocaleDateString()
}

const restoreSession = () => {
  const targetId = route.query.sessionId
  const sessions = readAgentSessions()
  const matched = targetId ? sessions.find((item) => item.id === targetId) : null
  const latest = sessions
    .filter((session) => (session.messages || []).some((item) => item.role === 'user' && String(item.content || '').trim()))
    .sort((a, b) => new Date(b.lastUserMessageAt || b.updatedAt) - new Date(a.lastUserMessageAt || a.updatedAt))[0]

  if (matched && route.query.fresh !== '1') {
    currentSessionId.value = matched.id
    restoreMessages(matched)
    selectedSn.value = matched.deviceSn || selectedSn.value
    selectedAppId.value = matched.appId || selectedAppId.value
    planningEngine.value = matched.planningEngine || planningEngine.value
    scrollBottom()
    refreshAgentSessions()
    return
  }

  if (!targetId && route.query.fresh !== '1' && latest) {
    currentSessionId.value = latest.id
    restoreMessages(latest)
    selectedSn.value = latest.deviceSn || selectedSn.value
    selectedAppId.value = latest.appId || selectedAppId.value
    planningEngine.value = latest.planningEngine || planningEngine.value
    router.replace({ name: 'Dialogue', query: { sessionId: latest.id } })
    scrollBottom()
    refreshAgentSessions()
    return
  }

  currentSessionId.value = ''
  router.replace({ name: 'Dialogue', query: { fresh: '1' } })
  messages.value = []
  stepLog.value = []
  refreshAgentSessions()
}

const loadDevices = async () => {
  devicesLoading.value = true
  try {
    const res = await listCaseRunnerDevices(true)
    const items = Array.isArray(res?.data?.items) ? res.data.items : normalizeDeviceList(res)
    devices.value = filterExecutableDevices(items).map((d) => ({
      ...d,
      type: d.device_type || d.type || '',
    }))
    if (selectedSn.value && !devices.value.some((d) => d.sn === selectedSn.value)) {
      selectedSn.value = pickDefaultDeviceSn(devices.value)
      persistSession()
    }
    if (!selectedSn.value && devices.value.length >= 1) {
      selectedSn.value = pickDefaultDeviceSn(devices.value)
      persistSession()
    }
  } catch (e) {
    console.warn('load devices', e)
    try {
      const httpRes = await getDeviceList()
      const list = normalizeDeviceList(httpRes)
      devices.value = filterExecutableDevices(list).map((d) => ({
        ...d,
        type: d.device_type || d.type || '',
      }))
    } catch (fallbackErr) {
      console.warn('load devices fallback failed', fallbackErr)
    }
  } finally {
    devicesLoading.value = false
  }
}

const loadAIProviders = async () => {
  try {
    const res = await listAIProviders()
    const data = res?.data || {}
    aiProviders.value = data.providers || []
    const defaultProvider = data.default_provider
    const defaultRow = aiProviders.value.find((item) => item.id === defaultProvider && item.configured && item.enabled !== false)
    const caseRow = aiProviders.value.find((item) => item.configured && item.enabled !== false && item.case_execution_use)
    const pick = defaultRow || caseRow
    if (pick && !currentSessionId.value && !hasUserMessages.value && planningEngine.value === 'local') {
      planningEngine.value = `provider:${pick.id}`
    }
  } catch (e) {
    console.warn('load AI providers failed', e)
  }
}

const loadApps = async () => {
  try {
    const res = await getProjects()
    const projects = Array.isArray(res) ? res : (res?.data || [])
    apps.value = flattenProjectApps(projects)
    const fromRoute = String(route.params.appId || '').trim()
    if (!selectedAppId.value && fromRoute) selectedAppId.value = fromRoute
    if (!selectedAppId.value && apps.value.length) selectedAppId.value = apps.value[0].id
  } catch (e) {
    console.warn('load apps failed', e)
  }
}

const pushAi = (content, extra = {}) => {
  messages.value.push({ id: Date.now() + Math.random(), role: 'ai', content, ...extra })
  persistSession()
  scrollBottom()
}

const pushUser = (content) => {
  messages.value.push({ id: Date.now(), role: 'user', content })
  persistSession({ touchUserTime: true })
  scrollBottom()
}

const imageSrc = (path) => {
  if (!path) return ''
  if (/^(https?:|file:|data:)/.test(path)) return path
  if (path.startsWith('/static/')) return `${getBaseUrl()}${path}`
  return `file://${path}`
}

const observeScreenPath = (run) => {
  const screen = run?.aiDebug?.screen
  if (!screen || typeof screen !== 'object') return ''
  return String(screen.image_path || '').trim()
}

const clickMarkerStyle = (result) => {
  const size = result?.screen_size || result?.screenSize || {}
  const width = Number(size.width || size.w || 0)
  const height = Number(size.height || size.h || 0)
  const x = Number(result?.x || 0)
  const y = Number(result?.y || 0)
  if (!width || !height || !x || !y) return null
  return {
    left: `${Math.max(0, Math.min(100, (x / width) * 100))}%`,
    top: `${Math.max(0, Math.min(100, (y / height) * 100))}%`,
  }
}

const targetBoxStyle = (result) => {
  const rect = result?.target_rect
  const size = result?.screen_size || result?.screenSize || {}
  const width = Number(size.width || size.w || 0)
  const height = Number(size.height || size.h || 0)
  if (!width || !height) return null
  if (rect) {
    const left = Number(rect.left ?? rect.x ?? 0)
    const top = Number(rect.top ?? rect.y ?? 0)
    const boxW = Number(rect.width ?? rect.w ?? 0)
    const boxH = Number(rect.height ?? rect.h ?? 0)
    if (boxW && boxH) {
      return {
        left: `${Math.max(0, Math.min(100, (left / width) * 100))}%`,
        top: `${Math.max(0, Math.min(100, (top / height) * 100))}%`,
        width: `${Math.max(2, Math.min(100, (boxW / width) * 100))}%`,
        height: `${Math.max(2, Math.min(100, (boxH / height) * 100))}%`,
      }
    }
  }
  const x = Number(result?.x || 0)
  const y = Number(result?.y || 0)
  if (!x || !y) return null
  return {
    left: `${Math.max(0, Math.min(100, (x / width) * 100))}%`,
    top: `${Math.max(0, Math.min(100, (y / height) * 100))}%`,
    width: '8%',
    height: '4%',
    transform: 'translate(-50%, -50%)',
  }
}

const openImagePreview = (path) => {
  const src = imageSrc(path)
  if (src) window.open(src, '_blank')
}

const pushRunRecord = ({ request, plan, execution }) => {
  const device = devices.value.find((item) => item.sn === selectedSn.value)
  messages.value.push({
    id: Date.now() + Math.random(),
    role: 'run',
    content: plan?.reply || '已下发 Agent 任务',
    run: {
      request,
      reply: plan?.reply || '',
      engine: plan?.engine || (execution?.runId ? 'agent' : 'navigate'),
      planner: { mode: plan?.engine || 'agent' },
      aiDebug: plan?.ai_debug || null,
      aiErrorInfo: plan?.ai_error_info || null,
      steps: plan?.steps || [],
      execution: execution || null,
      taskId: plan?.task_id || plan?.run_id || '',
      runId: execution?.runId || plan?.run_id || '',
      device: device
        ? { sn: device.sn, type: device.type, model: device.model }
        : { sn: selectedSn.value, type: '', model: '' },
      createdAt: new Date().toISOString(),
    },
  })
  persistSession()
  scrollBottom()
}

const openModelResponse = (run) => {
  modelResponseRun.value = run || null
}

const closeModelResponse = () => {
  modelResponseRun.value = null
}

const modelResponseTitle = computed(() => {
  const planner = modelResponseRun.value?.planner
  if (!planner?.provider_id) return '大模型 Response'
  return `${planner.provider_id} Response`
})

const modelResponsePayload = computed(() => {
  const run = modelResponseRun.value
  if (!run) return {}
  return {
    request: run.request,
    planner: run.planner,
    error: run.aiErrorInfo || null,
    response: run.aiDebug?.raw_plan || null,
    normalized_steps: run.aiDebug?.normalized_steps || run.steps || [],
  }
})

const runPlan = async (plan) => {
  if (plan.navigate?.name) {
    router.push({ name: plan.navigate.name })
    return { ok: true, type: 'navigate', results: [], msg: `已跳转到 ${plan.navigate.name}` }
  }
  const taskId = plan.run_id || plan.task_id
  if (plan.engine !== 'agent' || !taskId) {
    return { ok: false, results: [], msg: plan.reply || '未下发 Agent 任务' }
  }
  liveTaskId.value = taskId
  return new Promise((resolve) => {
    let unitId = ''
    const finish = (payload) => {
      cleanup()
      liveTaskId.value = ''
      resolve({ ...payload, runId: payload.runId || unitId || taskId })
    }
    const onMsg = (msg) => {
      const type = msg?.type || msg?.action
      const d = msg?.data || {}
      if (type === 'agent_step' && belongsToAgentTask(d, taskId)) {
        if (d.run_id) unitId = d.run_id
        if (d.phase === 'done' || d.overall) {
          const ok = d.overall === 'pass'
          finish({ ok, results: [], msg: d.summary || d.overall || 'Agent 已结束', raw: d, runId: d.run_id || unitId })
        }
        return
      }
      if (type === 'testing_task' && belongsToAgentTask(d, taskId) && ['task_finished', 'cancelled'].includes(d.event)) {
        const ok = d.event === 'task_finished' && Number(d.failed || 0) === 0
        finish({
          ok,
          results: [],
          msg: ok ? 'Agent 执行完成' : 'Agent 已结束',
          raw: d,
          runId: d.case?.report_run_id || unitId,
        })
      }
    }
    const cleanup = () => {
      removeMessageListener(onMsg)
      if (timer) clearTimeout(timer)
    }
    addMessageListener(onMsg)
    const timer = setTimeout(() => {
      finish({ ok: false, results: [], msg: '等待超时', runId: unitId || taskId })
    }, 10 * 60 * 1000)
  })
}

const stopLiveRun = async () => {
  const id = liveTaskId.value
  if (!id) return
  try {
    await cancelTestingTask(id)
  } catch (e) {
    ElMessage.warning(e?.message || '取消失败')
  }
}

const sendMessage = async () => {
  if (sendInFlight.value || isLoading.value) return
  const text = inputValue.value.trim()
  if (!text) return
  sendInFlight.value = true

  if (text.startsWith('/') && showSlashMenu.value && filteredSlash.value.length) {
    const action = filteredSlash.value[selectedSlashIndex.value]
    if (action.isPrompt) {
      inputValue.value = action.prompt
      showSlashMenu.value = false
      sendInFlight.value = false
      return
    }
    if (action.handler) {
      action.handler(router)
      inputValue.value = ''
      showSlashMenu.value = false
      pushUser(`/${action.id}`)
      sendInFlight.value = false
      return
    }
  }

  if (!selectedAppId.value) {
    ElMessage.warning('请选择应用后再下发')
    sendInFlight.value = false
    return
  }
  if (!selectedSn.value) {
    ElMessage.warning('请选择在线设备后再下发')
    sendInFlight.value = false
    return
  }

  pushUser(text)
  inputValue.value = ''
  showSlashMenu.value = false
  isLoading.value = true
  busyPhase.value = 'planning'

  try {
    const device = devices.value.find((item) => item.sn === selectedSn.value)
    const platform = devicePlatformKind(device)
    const planning = selectedPlanning.value
    const res = await copilotChat({
      text,
      sn: selectedSn.value,
      appId: selectedAppId.value,
      planningMode: planning.planningMode,
      providerId: planning.providerId,
      context: { platform, app_id: selectedAppId.value, provider_id: planning.providerId },
    })
    const plan = res?.data || {}
    if (plan.navigate?.name && plan.engine !== 'agent') {
      busyPhase.value = 'executing'
      const execution = await runPlan(plan)
      pushRunRecord({ request: text, plan, execution })
      return
    }
    const taskId = plan.run_id || plan.task_id || ''
    if (!taskId) {
      pushAi(plan.reply || plan.display_reply || '未下发 Agent 任务')
      return
    }
    const runMsgId = Date.now() + Math.random()
    const deviceMeta = device
      ? { sn: device.sn, type: device.type, model: device.model }
      : { sn: selectedSn.value, type: '', model: '' }
    messages.value.push({
      id: runMsgId,
      role: 'run',
      content: plan.reply || '已下发 Agent 任务',
      run: {
        request: text,
        reply: plan.reply || '',
        engine: 'agent',
        planner: { mode: 'agent' },
        aiDebug: plan.ai_debug || null,
        aiErrorInfo: plan.ai_error_info || null,
        steps: [],
        execution: null,
        live: true,
        taskId,
        runId: taskId,
        device: deviceMeta,
        createdAt: new Date().toISOString(),
      },
    })
    persistSession()
    scrollBottom()
    busyPhase.value = 'executing'
    const execution = await runPlan(plan)
    const msg = messages.value.find((item) => item.id === runMsgId)
    if (msg?.run) {
      msg.run.execution = execution
      msg.run.live = false
      if (execution?.runId) msg.run.runId = execution.runId
    } else {
      pushRunRecord({ request: text, plan, execution })
    }
    persistSession()
  } catch (e) {
    pushAi(`规划失败: ${e?.message || e}`)
  } finally {
    isLoading.value = false
    busyPhase.value = ''
    sendInFlight.value = false
  }
}

const applySlash = (action) => {
  if (!action) return
  if (action.isPrompt) {
    inputValue.value = action.prompt
    showSlashMenu.value = false
    return
  }
  if (action.handler) {
    action.handler(router)
    inputValue.value = ''
    showSlashMenu.value = false
    pushUser(`/${action.id}`)
  }
}

const handleKeydown = (e) => {
  if (showSlashMenu.value) {
    const n = filteredSlash.value.length
    if (!n) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedSlashIndex.value = (selectedSlashIndex.value + 1) % n
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedSlashIndex.value = (selectedSlashIndex.value - 1 + n) % n
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const action = filteredSlash.value[selectedSlashIndex.value]
      if (action.isPrompt) {
        inputValue.value = action.prompt
        showSlashMenu.value = false
      } else if (action.handler) {
        action.handler(router)
        inputValue.value = ''
        showSlashMenu.value = false
      } else {
        sendMessage()
      }
    } else if (e.key === 'Escape') {
      showSlashMenu.value = false
    }
    return
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

onMounted(async () => {
  document.addEventListener('click', closeFloatingMenus)
  rememberAgentPath(route.fullPath)
  refreshAgentSessions(await pullAgentSessions())
  await loadApps()
  await Promise.all([loadDevices(), loadAIProviders()])
  restoreSession()
  devicePollTimer = setInterval(loadDevices, 15000)
})

onUnmounted(() => {
  document.removeEventListener('click', closeFloatingMenus)
  if (devicePollTimer) clearInterval(devicePollTimer)
})

</script>

<template>
  <WorkShell mode="agent" create-title="新建对话" @search="openHistorySearch" @create="startNewAgent">
    <template #sidebar>
      <section class="agent-records">
        <div class="records-label">对话记录</div>
        <input
          v-if="historySearchOpen"
          ref="historySearchRef"
          v-model="historyQuery"
          class="history-search"
          type="search"
          placeholder="搜索对话"
        />
        <button
          v-for="session in visibleSessions"
          :key="session.id"
          type="button"
          class="record-item"
          :class="{ active: session.id === currentSessionId }"
          @click="openAgentSession(session)"
        >
          <span class="record-dot"></span>
          <span class="record-main">
            <strong>{{ session.title || '新对话' }}</strong>
            <small>{{ formatSessionTime(session.lastUserMessageAt || session.updatedAt) }}</small>
          </span>
        </button>
        <div v-if="!visibleSessions.length" class="record-empty">{{ historyQuery ? '没有匹配的对话' : '暂无对话记录' }}</div>
      </section>
    </template>
    <div class="dialogue-main-body">
      <div class="chat-panel" ref="chatRef" :class="{ 'is-draft': isDraftAgent }" @scroll="handleChatScroll">
        <div v-if="isDraftAgent" class="draft-hero">
          <div class="draft-orb">
            <el-icon><MagicStick /></el-icon>
          </div>
          <h1>准备好，我们开始吧</h1>
          <p>选择应用和设备，描述要做的操作。我会按 Agent 看图闭环下发到真机，与测试任务同一套引擎。</p>
        </div>
        <div v-for="msg in (isDraftAgent ? [] : messages)" :key="msg.id" class="msg-row" :class="msg.role">
          <div class="avatar">
            <el-icon v-if="msg.role === 'ai'"><MagicStick /></el-icon>
            <el-icon v-else-if="msg.role === 'run'"><MagicStick /></el-icon>
            <el-icon v-else><User /></el-icon>
          </div>
          <div v-if="msg.role === 'run'" class="run-card">
            <div class="run-card-head">
              <div>
                <strong>{{ msg.run?.reply || '已下发 Agent 任务' }}</strong>
                <span>
                  {{ msg.run?.engine === 'agent' ? 'Agent' : (msg.run?.planner?.mode || '-') }}
                </span>
              </div>
              <div class="run-head-side">
                <span v-if="msg.run?.device?.sn" class="device-chip" :title="msg.run.device.sn">
                  <span class="device-dot"></span>
                  {{ formatDeviceChip(msg.run.device) }}
                </span>
                <span class="run-status" :class="{ ok: msg.run?.execution?.ok }">
                  {{ msg.run?.execution?.ok ? 'Done' : 'Review' }}
                </span>
              </div>
            </div>

            <div v-if="msg.run?.engine === 'agent' && msg.run?.runId" class="run-section">
              <div class="run-section-title">Agent</div>
              <ExecutionTimeline
                :run-id="msg.run.runId"
                :live="!!msg.run.live && !msg.run.execution"
                :case-summary="msg.run.reply || ''"
              />
            </div>
            <div v-else class="run-section">
              <div class="run-section-title">Plan</div>
              <div v-if="msg.run?.aiErrorInfo" class="ai-error-card">
                <strong>{{ msg.run.aiErrorInfo.title }}</strong>
                <span>{{ msg.run.aiErrorInfo.message }}</span>
                <small>{{ msg.run.aiErrorInfo.suggestion }}</small>
              </div>
              <div v-if="observeScreenPath(msg.run)" class="observe-strip">
                <div class="compare-shot">
                  <small>AI 观察 · 规划前屏幕</small>
                  <button
                    type="button"
                    class="phone-shot"
                    @click="openImagePreview(observeScreenPath(msg.run))"
                  >
                    <img :src="imageSrc(observeScreenPath(msg.run))" alt="observe screenshot" />
                  </button>
                </div>
              </div>
              <div
                v-for="(step, index) in msg.run?.steps || []"
                :key="`plan-${index}`"
                class="run-plan-step"
              >
                <span>{{ index + 1 }}</span>
                <strong>{{ step.summary || step.kind }}</strong>
                <small v-if="step.label">target: {{ step.label }}</small>
              </div>
            </div>

            <div class="run-section">
              <div class="run-section-title">执行结果</div>
              <div
                v-for="(result, index) in msg.run?.execution?.results || []"
                :key="`result-${index}`"
                class="run-result-row"
                :class="{ ok: result.ok }"
              >
                <div v-if="result.pre_events?.length" class="pre-event-list">
                  <div
                    v-for="(event, eventIndex) in result.pre_events"
                    :key="`pre-${index}-${eventIndex}`"
                    class="pre-event-row"
                  >
                    <strong>{{ event.label || '前置准备' }}</strong>
                    <span>{{ event.summary || '执行前准备' }}</span>
                    <small v-if="event.duration_ms">{{ event.duration_ms }}ms</small>
                  </div>
                </div>
                <div class="result-main">
                  <strong>{{ result.ok ? '✓' : '✗' }} {{ result.summary || `Step ${index + 1}` }}</strong>
                  <small>{{ result.msg || '-' }}</small>
                </div>
                <div class="result-meta">
                  <span v-if="result.x || result.y">({{ result.x || '-' }}, {{ result.y || '-' }})</span>
                  <span v-if="result.method">{{ result.method }}</span>
                  <span v-if="result.duration_ms">{{ result.duration_ms }}ms</span>
                </div>
                <div v-if="result.gestures?.length" class="event-list">
                  <div
                    v-for="(event, eventIndex) in result.gestures"
                    :key="`event-${index}-${eventIndex}`"
                    class="event-row"
                  >
                    <strong>{{ event.type || event.kind || 'tap' }}</strong>
                    <span v-if="event.label">{{ event.label }}</span>
                    <small>
                      <template v-if="event.x || event.y || result.x || result.y">
                        ({{ event.x || result.x || '-' }}, {{ event.y || result.y || '-' }})
                      </template>
                      <template v-if="event.method"> · {{ event.method }}</template>
                      <template v-if="event.duration_ms"> · {{ event.duration_ms }}ms</template>
                    </small>
                  </div>
                </div>
                <div v-if="result.screenshot_before || result.screenshot_after" class="compare-strip">
                  <div v-if="result.screenshot_before" class="compare-shot">
                    <small>Before</small>
                    <button type="button" class="phone-shot" @click="openImagePreview(result.screenshot_before)">
                      <img :src="imageSrc(result.screenshot_before)" alt="before screenshot" />
                      <span v-if="targetBoxStyle(result)" class="target-box" :style="targetBoxStyle(result)"></span>
                    </button>
                  </div>
                  <div v-if="result.screenshot_after" class="compare-shot">
                    <small>After</small>
                    <button type="button" class="phone-shot" @click="openImagePreview(result.screenshot_after)">
                      <img :src="imageSrc(result.screenshot_after)" alt="after screenshot" />
                    </button>
                  </div>
                </div>
                <div v-else-if="clickMarkerStyle(result)" class="tap-map">
                  <span class="click-marker" :style="clickMarkerStyle(result)"></span>
                </div>
              </div>
              <div v-if="!(msg.run?.execution?.results || []).length" class="run-empty">
                {{ msg.run?.execution?.msg || '未执行' }}
              </div>
            </div>
          </div>
          <div v-else class="bubble">{{ msg.content }}</div>
        </div>
        <button
          v-if="showScrollToBottom"
          type="button"
          class="scroll-bottom-btn"
          @click="scrollBottom"
        >
          ↓
        </button>
      </div>

      <div v-if="showSlashMenu" class="slash-menu">
        <div
          v-for="(action, index) in filteredSlash"
          :key="action.id"
          class="slash-item"
          :class="{ active: index === selectedSlashIndex }"
          @click="applySlash(action)"
        >
          <span>{{ action.title }}</span>
          <span class="slash-id">{{ action.id }}</span>
        </div>
      </div>

      <footer class="input-bar">
        <el-input
            v-model="inputValue"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            placeholder="描述要做的操作，或输入 / 命令…"
            :readonly="isBusy"
            resize="none"
            @input="handleInput"
            @keydown="handleKeydown"
          />
        <div class="input-footer-row">
          <div class="input-pickers">
            <div class="model-picker app-picker">
              <button type="button" class="model-trigger" @click="toggleAppMenu">
                <span>{{ selectedAppLabel }}</span>
                <span class="model-chevron">⌄</span>
              </button>
              <div v-if="appMenuOpen" class="model-menu">
                <button
                  v-for="app in apps"
                  :key="app.id"
                  type="button"
                  class="model-option"
                  :class="{ active: app.id === selectedAppId }"
                  @click="selectApp(app)"
                >
                  <span class="model-option-main">
                    <strong>{{ app.name }}</strong>
                    <small v-if="app.projectName">{{ app.projectName }}</small>
                  </span>
                  <span v-if="app.id === selectedAppId" class="model-check">✓</span>
                </button>
                <div v-if="!apps.length" class="device-empty">暂无应用</div>
              </div>
            </div>
            <div class="model-picker llm-picker">
              <button type="button" class="model-trigger" @click="toggleModelMenu">
                <span>{{ selectedPlanningLabel }}</span>
                <span class="model-chevron">⌄</span>
              </button>
              <div v-if="modelMenuOpen" class="model-menu">
                <button
                  v-for="option in planningOptions"
                  :key="option.value"
                  type="button"
                  class="model-option"
                  :class="{ active: option.value === planningEngine, configure: option.value === '__configure_ai' }"
                  :disabled="option.disabled"
                  @click="selectPlanningOption(option)"
                >
                  <span class="model-option-main">
                    <strong>{{ option.label }}</strong>
                    <small v-if="option.value === 'local'">未指定时用密钥配置里的用例模型</small>
                    <small v-else-if="option.value === '__configure_ai'">添加或维护模型 Key</small>
                    <small v-else>{{ option.model ? `本会话使用 ${option.model}` : '本会话使用此模型' }}</small>
                  </span>
                  <span v-if="option.value === planningEngine" class="model-check">✓</span>
                </button>
              </div>
            </div>
            <div class="device-picker">
              <button
                type="button"
                class="model-trigger device-trigger"
                @click="toggleDeviceMenu"
              >
                <span>{{ selectedDeviceLabel }}</span>
                <span class="model-chevron">⌄</span>
              </button>
              <div v-if="deviceMenuOpen" class="model-menu device-menu">
                <button
                  v-for="device in devices"
                  :key="device.sn"
                  type="button"
                  class="model-option"
                  :class="{ active: device.sn === selectedSn }"
                  @click="selectDevice(device)"
                >
                  <span class="model-option-main">
                    <strong>{{ devicePrimaryName(device) }}</strong>
                    <small>{{ formatDeviceMeta(device) }}{{ device.busy_task_id ? ' · 占用中' : '' }}</small>
                  </span>
                  <span v-if="device.sn === selectedSn" class="model-check">✓</span>
                </button>
                <div v-if="!devices.length" class="device-empty">
                  {{ devicesLoading ? '加载设备中...' : '暂无在线设备。到设置 → 运行与设备启动 Scout' }}
                </div>
              </div>
            </div>
            <div v-if="isBusy" class="busy-status-chip">
              <span class="running-dot"></span>
              <span>{{ busyStatusText }}</span>
            </div>
          </div>
          <button
            v-if="isBusy"
            type="button"
            class="stop-run-btn"
            :title="busyStatusText"
            @click="stopLiveRun"
          >
            <span></span>
          </button>
          <el-button v-else type="primary" circle :icon="Promotion" :disabled="!inputValue" @click="sendMessage" />
        </div>
      </footer>
    <el-drawer
      :model-value="!!modelResponseRun"
      size="420px"
      direction="rtl"
      class="model-response-drawer"
      :with-header="false"
      @close="closeModelResponse"
    >
      <div class="response-panel">
        <header class="response-head">
          <div>
            <span>MODEL RESPONSE</span>
            <h3>{{ modelResponseTitle }}</h3>
          </div>
          <button type="button" class="response-close" @click="closeModelResponse">×</button>
        </header>
        <div class="response-meta">
          <span>{{ modelResponseRun?.planner?.mode || '-' }}</span>
          <span v-if="modelResponseRun?.planner?.model">{{ modelResponseRun.planner.model }}</span>
          <span v-if="modelResponseRun?.device?.sn">{{ modelResponseRun.device.sn }}</span>
        </div>
        <PayloadView :value="modelResponsePayload" />
      </div>
    </el-drawer>
    </div>
  </WorkShell>
</template>

<style scoped>
.dialogue-layout {
  --dialogue-chrome-h: 52px;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #f0f2f5;
  position: relative;
}

.dialogue-sidebar-col {
  width: 248px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f7f8fa;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  transition: width 0.22s ease, border-color 0.22s ease;
}

.dialogue-layout.is-collapsed .dialogue-sidebar-col {
  width: 0;
  border-right-color: transparent;
  pointer-events: none;
}

.aside-chrome {
  height: var(--dialogue-chrome-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px 0 0;
  background: transparent;
  -webkit-app-region: drag;
  user-select: none;
}

.mac-traffic-zone {
  width: 68px;
  height: 100%;
  flex-shrink: 0;
}

.chrome-cluster {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.chrome-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #4b5563;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chrome-btn:hover {
  background: #eceef2;
  color: #111827;
}

.chrome-btn.is-on {
  color: #4f46e5;
  background: #eef2ff;
}

.main-chrome {
  height: var(--dialogue-chrome-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px 0 0;
  background: #f0f2f5;
  -webkit-app-region: drag;
  user-select: none;
}

.dialogue-aside {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 16px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
}

.dialogue-win-controls {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  height: var(--dialogue-chrome-h);
  z-index: 30;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  color: #666;
}

.control-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}

.brand {
  font-weight: 700;
  font-size: 15px;
  padding: 8px 12px 16px;
  color: #4f46e5;
}

.nav-spacer {
  flex: 1;
  min-height: 24px;
}

.new-agent-side-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 4px 8px;
  padding: 10px 12px;
  border: 1px solid #e0e7ff;
  border-radius: 12px;
  background: #fff;
  color: #111827;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(79, 70, 229, 0.06);
}

.new-agent-side-btn:hover {
  border-color: #c7d2fe;
  background: #eef2ff;
  color: #4f46e5;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  text-align: left;
}

.nav-btn:hover,
.nav-btn.active {
  background: #eef2ff;
  color: #4f46e5;
}

.primary-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 0 4px 12px;
  padding: 4px;
  border-radius: 12px;
  background: #eef2ff;
}

.mode-switch button {
  border: none;
  border-radius: 9px;
  padding: 9px 8px;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.mode-switch button.on {
  background: #fff;
  color: #4f46e5;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}

.agent-records {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.nav-spacer {
  display: none;
}

.records-label {
  padding: 0 8px 6px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
}

.history-search {
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 8px;
  padding: 7px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  outline: none;
}

.history-search:focus {
  border-color: #c7d2fe;
}

.record-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #475569;
  cursor: pointer;
  text-align: left;
}

.record-item:hover,
.record-item.active {
  background: #f1f5f9;
  color: #111827;
}

.record-dot {
  width: 4px;
  height: 4px;
  flex-shrink: 0;
  border-radius: 999px;
  background: #cbd5e1;
}

.record-item.active .record-dot {
  background: #4f46e5;
}

.record-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.record-main strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-main small,
.record-empty {
  color: #94a3b8;
  font-size: 11px;
}

.record-empty {
  padding: 8px;
}

.side-footer-wrap {
  position: relative;
  flex-shrink: 0;
  margin-top: auto;
}

.account-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 20;
  overflow: hidden;
  padding: 6px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(12px);
}

.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: #374151;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}

.settings-menu-item:hover {
  background: #f1f5f9;
  color: #111827;
}

.settings-menu-item.danger {
  margin-top: 4px;
  border-top: 1px solid #eef2f7;
  border-radius: 0 0 9px 9px;
  color: #475569;
}

.settings-menu-item.danger:hover {
  background: #fef2f2;
  color: #b91c1c;
}

.side-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.account-mini {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.9);
  cursor: pointer;
  text-align: left;
}

.account-mini:hover,
.account-mini.active {
  background: #eef2ff;
}

.account-mini div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.account-mini strong {
  color: #111827;
  font-size: 12px;
}

.account-mini div span {
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-status {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 10px;
}

.account-status.active {
  background: #ecfdf5;
  color: #059669;
}

.settings-footer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.settings-footer-btn:hover {
  background: #eef2ff;
  color: #4f46e5;
}

:deep(.model-response-drawer .el-drawer__body) {
  padding: 0;
  background: #f8fafc;
}

.response-panel {
  display: flex;
  height: 100%;
  flex-direction: column;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
}

.response-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid #e2e8f0;
}

.response-head span {
  color: #6366f1;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.08em;
}

.response-head h3 {
  margin: 4px 0 0;
  color: #0f172a;
  font-size: 18px;
  font-weight: 780;
}

.response-close {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.response-close:hover {
  background: #eef2ff;
  color: #4f46e5;
}

.response-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 18px;
}

.response-meta span {
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
}

.response-json {
  flex: 1;
  margin: 0 18px 18px;
  padding: 14px;
  overflow: auto;
  border: 1px solid #dbeafe;
  border-radius: 14px;
  background: #0f172a;
  color: #dbeafe;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.dialogue-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 0;
  box-sizing: border-box;
}

.dialogue-main-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 24px 24px;
  box-sizing: border-box;
}

.chat-panel {
  position: relative;
  flex: 1;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.scroll-bottom-btn {
  position: sticky;
  bottom: 12px;
  left: 50%;
  z-index: 30;
  display: grid;
  width: 30px;
  height: 30px;
  margin: 0 auto;
  place-items: center;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #4f46e5;
  cursor: pointer;
  font-size: 16px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(10px);
}

.scroll-bottom-btn:hover {
  background: #eef2ff;
}

.chat-panel.is-draft {
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 50% 54%, rgba(14, 165, 233, 0.16), transparent 30%),
    radial-gradient(circle at 50% 52%, rgba(99, 102, 241, 0.12), transparent 42%),
    rgba(255, 255, 255, 0.94);
}

.draft-hero {
  max-width: 520px;
  text-align: center;
}

.draft-orb {
  display: inline-grid;
  width: 42px;
  height: 42px;
  margin-bottom: 16px;
  place-items: center;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
  box-shadow: 0 12px 32px rgba(99, 102, 241, 0.18);
}

.draft-hero h1 {
  margin: 0;
  color: #1f2937;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.draft-hero p {
  margin: 10px auto 0;
  max-width: 420px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.msg-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.msg-row.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.msg-row.ai .avatar {
  background: #e0e7ff;
  color: #4f46e5;
}

.msg-row.run .avatar {
  background: #e0e7ff;
  color: #4f46e5;
}

.msg-row.user .avatar {
  background: #e5e7eb;
}

.bubble {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 14px;
}

.msg-row.user .bubble {
  background: #4f46e5;
  color: #fff;
}

.msg-row.ai .bubble {
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.run-card {
  width: min(720px, 82%);
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #fbfdff);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.08);
}

.run-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
}

.run-head-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.model-response-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 10px;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  cursor: pointer;
  font-size: 11px;
  font-weight: 750;
}

.model-response-btn:hover {
  border-color: #bfdbfe;
  background: #dbeafe;
}

.planner-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 180px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid #ddd6fe;
  border-radius: 999px;
  background: #f5f3ff;
  color: #6d28d9;
  cursor: pointer;
  font-size: 11px;
  font-weight: 750;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.planner-chip:hover {
  border-color: #c4b5fd;
  background: #ede9fe;
}

.device-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 180px;
  padding: 3px 7px;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 750;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #2563eb;
}

.run-card-head strong {
  display: block;
  color: #0f172a;
  font-size: 14px;
  font-weight: 750;
}

.run-card-head span {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
}

.run-head-side > span {
  margin-top: 0;
}

.run-status {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 11px;
  font-weight: 750;
}

.run-status.ok {
  background: #ecfdf5;
  color: #059669;
}

.run-section {
  margin-top: 12px;
}

.run-section-title,
.ai-debug-block summary {
  margin-bottom: 8px;
  color: #475569;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.run-plan-step,
.run-result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 9px 10px;
  border-radius: 12px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
}

.ai-error-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px;
  border: 1px solid #fecaca;
  border-radius: 12px;
  background: #fef2f2;
}

.ai-error-card strong {
  color: #b91c1c;
  font-size: 13px;
}

.ai-error-card span {
  color: #7f1d1d;
  font-size: 12px;
}

.ai-error-card small {
  color: #991b1b;
  font-size: 11px;
  line-height: 1.5;
}

.run-plan-step + .run-plan-step,
.run-result-row + .run-result-row {
  margin-top: 6px;
}

.observe-strip {
  margin-bottom: 10px;
}

.observe-strip .compare-shot {
  position: relative;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.observe-strip .compare-shot small {
  display: block;
  padding: 6px 8px;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
}

.run-plan-step > span:first-child {
  display: inline-grid;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
  font-weight: 800;
}

.run-plan-step strong,
.result-main strong {
  color: #0f172a;
  font-size: 12px;
}

.run-plan-step small,
.result-main small,
.result-meta span {
  color: #64748b;
  font-size: 11px;
}

.run-result-row.ok {
  background: #f0fdf4;
}

.result-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.result-meta {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.result-meta span {
  padding: 2px 6px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e2e8f0;
}

.pre-event-list {
  width: 100%;
  display: grid;
  gap: 6px;
  margin-bottom: 8px;
}

.pre-event-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid #fde68a;
  border-radius: 10px;
  background: #fffbeb;
}

.pre-event-row strong {
  color: #92400e;
  font-size: 11px;
}

.pre-event-row span,
.pre-event-row small {
  color: #78350f;
  font-size: 11px;
}

.pre-event-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-list {
  width: 100%;
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.event-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 7px 8px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #eff6ff;
}

.event-row strong {
  color: #1d4ed8;
  font-size: 11px;
  text-transform: uppercase;
}

.event-row span {
  overflow: hidden;
  color: #334155;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-row small {
  color: #64748b;
  font-size: 11px;
}

.compare-strip {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 8px;
}

.compare-strip > div {
  position: relative;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.compare-strip small {
  display: block;
  padding: 6px 8px;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
}

.phone-shot {
  position: relative;
  display: block;
  width: 220px;
  max-width: calc(100% - 20px);
  margin: 0 auto 10px;
  padding: 0;
  overflow: hidden;
  border: 1px solid #cbd5e1;
  border-radius: 20px;
  background: #0f172a;
  cursor: zoom-in;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
}

.phone-shot img {
  display: block;
  width: 100%;
  height: auto;
  background: #0f172a;
}

.click-marker {
  position: absolute;
  z-index: 2;
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.26), 0 8px 16px rgba(239, 68, 68, 0.28);
  transform: translate(-50%, -50%);
}

.target-box {
  position: absolute;
  z-index: 2;
  border: 2px solid #ef4444;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.12);
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.18);
  pointer-events: none;
}

.tap-map {
  position: relative;
  width: 86px;
  height: 160px;
  margin-top: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 18px;
  background: linear-gradient(180deg, #f8fafc, #eef2ff);
  box-shadow: inset 0 0 0 5px #fff;
}

.tap-map::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 7px;
  width: 24px;
  height: 3px;
  border-radius: 999px;
  background: #cbd5e1;
  transform: translateX(-50%);
}

.ai-debug-block pre {
  overflow: auto;
  max-height: 220px;
  margin: 0;
  padding: 10px;
  border-radius: 12px;
  background: #0f172a;
  color: #dbeafe;
  font-size: 11px;
  white-space: pre-wrap;
}

.run-empty {
  padding: 10px;
  border-radius: 12px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
}

.slash-menu {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  padding: 6px;
  margin-bottom: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.slash-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.slash-item.active,
.slash-item:hover {
  background: #eff6ff;
  color: #4f46e5;
}

.slash-id {
  font-size: 12px;
  color: #9ca3af;
}

.input-bar {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
  margin-top: 12px;
  padding: 12px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.running-pill {
  display: none;
}

.busy-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid #e0e7ff;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  white-space: nowrap;
}

.running-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #4f46e5;
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.12);
}

.stop-run-btn {
  display: inline-grid;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  place-items: center;
  border: none;
  border-radius: 999px;
  background: #303030;
  cursor: default;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
}

.stop-run-btn span {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: #fff;
}

.input-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.input-pickers {
  display: flex;
  min-width: 0;
  gap: 8px;
}

.model-picker {
  position: relative;
}

.llm-picker .model-trigger {
  max-width: 148px;
}

.llm-picker .model-trigger span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-picker {
  position: relative;
}

.model-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}

.model-trigger:hover {
  border-color: #dbeafe;
  background: #eef2ff;
  color: #4f46e5;
}

.model-chevron {
  color: #94a3b8;
  font-size: 13px;
  transform: translateY(-1px);
}

.model-menu {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  z-index: 50;
  width: 250px;
  overflow: hidden;
  padding: 7px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(18px);
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
  padding: 10px 11px;
  border: none;
  border-radius: 11px;
  background: transparent;
  color: #334155;
  cursor: pointer;
  text-align: left;
}

.model-option:hover,
.model-option.active {
  background: #f1f5f9;
}

.model-option.configure {
  margin-top: 5px;
  border-top: 1px solid #eef2f7;
  border-radius: 0 0 11px 11px;
  color: #64748b;
}

.model-option-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.model-option-main strong {
  overflow: hidden;
  color: #111827;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-option-main small {
  color: #94a3b8;
  font-size: 11px;
}

.model-check {
  color: #4f46e5;
  font-weight: 800;
}

.device-menu {
  width: 300px;
}

.device-trigger {
  max-width: 320px;
}

.device-trigger span:first-child {
  overflow: hidden;
  max-width: 250px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-empty {
  padding: 14px;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

:deep(.el-textarea__inner) {
  box-shadow: none;
  border: none;
}
</style>
