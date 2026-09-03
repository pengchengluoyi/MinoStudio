<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElIcon, ElButton, ElInput, ElSelect, ElOption, ElMessage } from 'element-plus'
import { Promotion, User, MagicStick, Message } from '@element-plus/icons-vue'
import { copilotChat } from '@/api/copilot'
import { getDeviceList } from '@/api/device'
import { listCaseRunnerDevices } from '@/api/caseRunner'
import { listAIProviders } from '@/api/settings'
import { getProjects } from '@/api/workReport'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import { actions as registryActions } from '@/logic/ActionRegistry'
import { createAgentSession, readAgentSessions, titleFromMessages, upsertAgentSession } from '@/utils/agentSessions'
import { flattenProjectApps, belongsToAgentTask } from '@/utils/copilotAgent'
import { devicePlatformKind } from '@/utils/testingTasks'
import { filterExecutableDevices, formatDeviceTag } from '@/utils/testingDevices'

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
const isFocused = ref(false)
const isHovered = ref(false)
const isLoading = ref(false)
const isExpanded = ref(false)
const chatContainerRef = ref(null)
const inputRef = ref(null)
const selectedSn = ref('')
const selectedAppId = ref('')
const planningEngine = ref('local')
const aiProviders = ref([])
const devices = ref([])
const apps = ref([])
const currentSessionId = ref('')

const isSettingsRoute = computed(() => route.path.startsWith('/settings'))
const shouldShowOrb = computed(() => isSettingsRoute.value && !isExpanded.value)
const isIdle = computed(() => !isExpanded.value && !isHovered.value && !isFocused.value && !inputValue.value && !showSlashMenu.value)

const routeAppId = computed(() => String(route.params.appId || '').trim())

// --- Slash Command Logic ---
const showSlashMenu = ref(false)
const slashQuery = ref('')
const selectedSlashIndex = ref(0)

const filteredSlashActions = computed(() => {
  if (!slashQuery.value) return registryActions
  const lower = slashQuery.value.toLowerCase()
  return registryActions.filter(a => 
    a.id.toLowerCase().includes(lower) || 
    a.title.toLowerCase().includes(lower) ||
    (a.keywords && a.keywords.some(k => k.toLowerCase().includes(lower)))
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

const executeSlashCommand = (action) => {
  if (action && action.handler) {
    // Record the command in chat history
    messages.value.push({
      id: Date.now(),
      role: 'user',
      content: `Executed: ${action.title}`,
      isCommand: true
    })
    persistSession()
    
    // Execute locally
    action.handler(router)
    
    // Reset UI
    inputValue.value = ''
    showSlashMenu.value = false
    scrollToBottom()
  }
}

const persistSession = () => {
  const hasUserMessage = messages.value.some((item) => item.role === 'user' && String(item.content || '').trim())
  if (!hasUserMessage) return
  if (!currentSessionId.value) currentSessionId.value = createAgentSession().id
  upsertAgentSession({
    id: currentSessionId.value,
    title: titleFromMessages(messages.value),
    messages: messages.value.map(({ role, content, isCommand }) => ({ role, content, isCommand: !!isCommand })),
    deviceSn: selectedSn.value,
    appId: selectedAppId.value,
    planningEngine: planningEngine.value,
  })
}

const restoreLastSession = () => {
  const sessions = readAgentSessions().filter((session) =>
    (session.messages || []).some((item) => item.role === 'user' && String(item.content || '').trim()),
  )
  const last = sessions[0]
  if (last) {
    currentSessionId.value = last.id
    selectedSn.value = last.deviceSn || ''
    selectedAppId.value = last.appId || routeAppId.value || selectedAppId.value
    planningEngine.value = last.planningEngine || planningEngine.value
    messages.value = (last.messages || []).map((item, index) => ({ id: `${last.id}-${index}`, ...item }))
    return
  }
  currentSessionId.value = ''
  messages.value = [{
    id: Date.now(),
    role: 'ai',
    content: '你好，我是 AI 执行助手。选择应用和设备，描述要做的操作，我会按 Agent 看图闭环下发到真机。',
  }]
}

const loadDevices = async () => {
  try {
    const res = await listCaseRunnerDevices(true)
    const items = Array.isArray(res?.data?.items) ? res.data.items : normalizeDeviceList(res)
    devices.value = filterExecutableDevices(items).map((d) => ({
      ...d,
      type: d.device_type || d.type || '',
    }))
    if (!selectedSn.value && devices.value.length) selectedSn.value = devices.value[0].sn
  } catch (e) {
    console.warn('load widget devices failed', e)
    try {
      const res = await getDeviceList()
      const list = normalizeDeviceList(res).filter((d) => d.status === 'online')
      devices.value = filterExecutableDevices(list).map((d) => ({
        ...d,
        type: d.device_type || d.type || '',
      }))
    } catch (err) {
      console.warn('widget device fallback failed', err)
    }
  }
}

const loadAIProviders = async () => {
  try {
    const res = await listAIProviders()
    const data = res?.data || {}
    aiProviders.value = (data.providers || []).filter((p) => p.configured && p.enabled !== false)
    const pick = aiProviders.value.find((p) => p.id === data.default_provider)
      || aiProviders.value.find((p) => p.case_execution_use)
      || aiProviders.value[0]
    if (pick && planningEngine.value === 'local' && !messages.value.some((item) => item.role === 'user')) {
      planningEngine.value = `provider:${pick.id}`
    }
  } catch (e) {
    console.warn('load widget providers failed', e)
  }
}

const loadApps = async () => {
  try {
    const res = await getProjects()
    const projects = Array.isArray(res) ? res : (res?.data || [])
    apps.value = flattenProjectApps(projects)
    if (!selectedAppId.value && routeAppId.value) selectedAppId.value = routeAppId.value
    if (!selectedAppId.value && apps.value.length) selectedAppId.value = apps.value[0].id
  } catch (e) {
    console.warn('load widget apps failed', e)
  }
}

const waitForAgentTask = (taskId) => new Promise((resolve) => {
  const thoughts = []
  const onMsg = (msg) => {
    const type = msg?.type || msg?.action
    const d = msg?.data || {}
    if (type === 'agent_step' && belongsToAgentTask(d, taskId)) {
      if (d.thought) thoughts.push(String(d.thought))
      if (d.phase === 'done' || d.overall) {
        cleanup()
        resolve({ thoughts, overall: d.overall || '', summary: d.summary || '' })
      }
      return
    }
    if (type === 'testing_task' && belongsToAgentTask(d, taskId) && ['task_finished', 'cancelled'].includes(d.event)) {
      cleanup()
      resolve({ thoughts, overall: d.status || d.event, summary: d.event })
    }
  }
  const cleanup = () => {
    removeMessageListener(onMsg)
    if (timer) clearTimeout(timer)
  }
  addMessageListener(onMsg)
  const timer = setTimeout(() => {
    cleanup()
    resolve({ thoughts, overall: 'timeout', summary: '等待超时' })
  }, 10 * 60 * 1000)
})

const runPlan = async (plan) => {
  if (plan.navigate?.name) {
    router.push({ name: plan.navigate.name })
    return
  }
  const taskId = plan.run_id || plan.task_id
  if (plan.engine === 'agent' && taskId) {
    const done = await waitForAgentTask(taskId)
    const last = (done.thoughts || []).slice(-3).join('\n')
    const line = done.overall
      ? `Agent 结束：${done.overall}${done.summary ? ` · ${done.summary}` : ''}`
      : 'Agent 已结束'
    messages.value.push({
      id: Date.now() + Math.random(),
      role: 'ai',
      content: [last, line].filter(Boolean).join('\n'),
    })
    persistSession()
  }
}

const sendMessage = async () => {
  const text = inputValue.value.trim()
  if (!text) return

  // Handle Slash Command via Enter key if menu is open
  if (text.startsWith('/') && showSlashMenu.value && filteredSlashActions.value.length > 0) {
    executeSlashCommand(filteredSlashActions.value[selectedSlashIndex.value])
    return
  }

  if (!selectedAppId.value) {
    ElMessage.warning('请选择应用后再下发')
    return
  }
  if (!selectedSn.value) {
    ElMessage.warning('请选择在线设备后再下发')
    return
  }

  // Normal Message
  messages.value.push({ id: Date.now(), role: 'user', content: text })
  persistSession()
  inputValue.value = ''
  showSlashMenu.value = false
  isLoading.value = true
  scrollToBottom()

  try {
    const device = devices.value.find((item) => item.sn === selectedSn.value)
    const platform = devicePlatformKind(device)
    const providerId = planningEngine.value.startsWith('provider:') ? planningEngine.value.slice('provider:'.length) : ''
    const res = await copilotChat({
      text,
      sn: selectedSn.value,
      appId: selectedAppId.value,
      planningMode: providerId ? 'ai' : 'local',
      providerId,
      context: { platform, app_id: selectedAppId.value, provider_id: providerId },
    })
    const plan = res?.data || {}
    messages.value.push({ id: Date.now(), role: 'ai', content: plan.reply || plan.display_reply || '已处理', plan })
    persistSession()
    if (plan.auto_run !== false || plan.engine === 'agent') await runPlan(plan)
  } catch (e) {
    messages.value.push({ id: Date.now(), role: 'ai', content: `规划失败：${e?.message || e}` })
    persistSession()
    ElMessage.error(e?.message || '对话请求失败')
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

const handleKeydown = (e) => {
  if (showSlashMenu.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedSlashIndex.value = (selectedSlashIndex.value + 1) % filteredSlashActions.value.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedSlashIndex.value = (selectedSlashIndex.value - 1 + filteredSlashActions.value.length) % filteredSlashActions.value.length
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executeSlashCommand(filteredSlashActions.value[selectedSlashIndex.value])
    } else if (e.key === 'Escape') {
      showSlashMenu.value = false
    }
  } else {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
    }
  })
}

onMounted(async () => {
  restoreLastSession()
  await Promise.all([loadDevices(), loadApps(), loadAIProviders()])
  scrollToBottom()
})
</script>

<template>
  <button v-if="shouldShowOrb" type="button" class="copilot-orb" @click="isExpanded = true">
    <el-icon><Message /></el-icon>
  </button>
  <div
    v-else
    class="copilot-widget" 
    :class="{ 'ghost-mode': isIdle, 'is-active': !isIdle, 'settings-float': isSettingsRoute }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false; if (isSettingsRoute && !inputValue && !isLoading) isExpanded = false"
  >
    <!-- Chat History -->
    <div class="chat-history" ref="chatContainerRef">
      <div v-for="msg in messages" :key="msg.id" class="message-row" :class="msg.role">
        <div class="avatar">
          <el-icon v-if="msg.role === 'ai'"><MagicStick /></el-icon>
          <el-icon v-else><User /></el-icon>
        </div>
        <div class="bubble">
          <span v-if="msg.isCommand" class="command-tag">COMMAND</span>
          {{ msg.content }}
        </div>
      </div>
      <div v-if="isLoading" class="message-row ai">
        <div class="avatar"><el-icon class="is-loading"><MagicStick /></el-icon></div>
        <div class="bubble typing">Thinking...</div>
      </div>
    </div>

    <!-- Slash Command Popover -->
    <div v-if="showSlashMenu" class="slash-menu">
      <div 
        v-for="(action, index) in filteredSlashActions" 
        :key="action.id"
        class="slash-item"
        :class="{ active: index === selectedSlashIndex }"
        @click="executeSlashCommand(action)"
      >
        <span class="slash-title">{{ action.title }}</span>
        <span class="slash-id">{{ action.id }}</span>
      </div>
      <div v-if="filteredSlashActions.length === 0" class="slash-empty">No commands found</div>
    </div>

    <!-- Input Area -->
    <div class="input-area">
      <el-input
          ref="inputRef"
          v-model="inputValue"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 4 }"
          placeholder="Ask AI or type '/' for commands..."
          resize="none"
          @input="handleInput"
          @keydown="handleKeydown"
          @focus="isFocused = true"
          @blur="!inputValue && (isFocused = false)"
        />
      <div class="input-footer">
        <div class="input-selects">
          <el-select v-model="planningEngine" size="small" class="mini-select" placeholder="模型" @change="persistSession">
            <el-option label="Local Plan" value="local" />
            <el-option
              v-for="p in aiProviders"
              :key="p.id"
              :label="p.name || p.id"
              :value="`provider:${p.id}`"
            />
          </el-select>
          <el-select v-model="selectedAppId" size="small" class="mini-select" placeholder="应用" filterable>
            <el-option
              v-for="app in apps"
              :key="app.id"
              :label="app.projectName ? `${app.name} · ${app.projectName}` : app.name"
              :value="app.id"
            />
          </el-select>
          <el-select v-model="selectedSn" size="small" class="device-select" placeholder="Device">
            <el-option
              v-for="device in devices"
              :key="device.sn"
              :label="formatDeviceTag(device)"
              :value="device.sn"
            />
          </el-select>
        </div>
        <el-button type="primary" circle :icon="Promotion" @click="sendMessage" :disabled="!inputValue" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Widget Container & Ghost Mode */
.copilot-orb {
  position: fixed;
  right: 22px;
  top: 50%;
  z-index: 9000;
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(199, 210, 254, 0.9);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #4f46e5;
  cursor: pointer;
  box-shadow: 0 16px 42px rgba(79, 70, 229, 0.2);
  transform: translateY(-50%);
}

.copilot-orb:hover {
  background: #eef2ff;
}

.copilot-widget {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  max-width: 90vw;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 24px; /* Capsule / Dynamic Island style */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  z-index: 9000;
}

.copilot-widget.settings-float {
  top: 50%;
  bottom: auto;
  transform: translate(-50%, -50%);
  width: 640px;
}

.copilot-widget.ghost-mode {
  opacity: 0.4;
  transform: translateX(-50%) scale(0.95);
}

.copilot-widget.settings-float.ghost-mode {
  transform: translate(-50%, -50%) scale(0.98);
}

.copilot-widget.is-active {
  opacity: 1;
  transform: translateX(-50%) scale(1);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
  background: rgba(255, 255, 255, 0.95);
}

.copilot-widget.settings-float.is-active {
  transform: translate(-50%, -50%) scale(1);
}

/* Chat History */
.chat-history {
  max-height: 300px;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: none; 
}
.chat-history::-webkit-scrollbar { display: none; }

.message-row { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5; }
.message-row.user { flex-direction: row-reverse; }

.avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.message-row.ai .avatar { background: #e0e7ff; color: #4f46e5; }
.message-row.user .avatar { background: #f3f4f6; color: #374151; }

.bubble { padding: 8px 12px; border-radius: 12px; max-width: 80%; word-break: break-word; }
.message-row.user .bubble { background: #4f46e5; color: white; border-bottom-right-radius: 2px; }
.message-row.ai .bubble { background: white; border-bottom-left-radius: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }

.command-tag { font-size: 10px; background: rgba(255,255,255,0.2); padding: 2px 4px; border-radius: 4px; margin-right: 4px; text-transform: uppercase; font-weight: bold; }

/* Input Area */
.input-area {
  padding: 12px;
  border-top: 1px solid rgba(0,0,0,0.05);
}
:deep(.el-textarea__inner) { background: transparent; box-shadow: none; border: none; padding: 8px; resize: none; font-family: inherit; }
:deep(.el-textarea__inner:focus) { box-shadow: none; }

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
}

.input-selects {
  display: flex;
  min-width: 0;
  gap: 8px;
}

.mini-select {
  width: 118px;
}

.device-select {
  width: 190px;
}

:deep(.mini-select .el-select__wrapper),
:deep(.device-select .el-select__wrapper) {
  min-height: 28px;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.9);
  box-shadow: none;
}

/* Slash Menu */
.slash-menu {
  position: absolute;
  bottom: 100%;
  left: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
  margin-bottom: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
}

.slash-item { padding: 8px 12px; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.1s; }
.slash-item.active, .slash-item:hover { background: #eff6ff; color: #4f46e5; }
.slash-title { font-weight: 500; font-size: 14px; }
.slash-id { font-size: 12px; color: #9ca3af; }
.slash-empty { padding: 12px; text-align: center; color: #9ca3af; font-size: 13px; }
</style>