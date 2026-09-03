<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import RobotIntegrationsPanel from './RobotIntegrationsPanel.vue'
import PluginDebugPanel from './PluginDebugPanel.vue'
import {
  getPlugin,
  savePlugin,
  testFigmaToken,
  testZentaoPlugin,
  fetchZentaoToken,
  testZentaoBug,
  chatPlugin,
  syncFeishuListener,
  startWechatLogin,
  getWechatLogin,
  verifyWechatLogin,
  logoutWechat,
  syncWechatListener,
  debugFeishuWiki,
} from '@/api/settings'
import { getAppAutomationConfig, updateAppAutomationConfig } from '@/api/appAutomation'
import { getProjects } from '@/api/workReport'
import SecretField from '@/components/SecretField.vue'
import './settings-ui.css'

const route = useRoute()
const router = useRouter()
const pluginId = computed(() => String(route.params.pluginId || ''))
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const fetchingToken = ref(false)
const testingBug = ref(false)
const plugin = ref(null)
const tab = ref('connect')

const wikiForm = ref({
  space_id: '',
  root_node_token: '',
  folder_pattern: '{project}/版本/{version}',
    childrenText: '测试报告、测试用例、测试脑图、需求、缺陷',
})
const wikiDebug = ref({
  busy: false,
  result: null,
})
const wikiDebugActions = [
  { id: 'ping', label: '测试连接' },
  { id: 'list', label: '列出当前层' },
  { id: 'mkdir', label: '建调试文件夹' },
  { id: 'create_doc', label: '建调试页' },
]
const notifyForm = ref({
  bot_id: '',
  chat_id: '',
  on_run_fail: true,
  on_atlas_pending: true,
  on_verdict: true,
})
const figmaForm = ref({ access_token: '', default_file_url: '' })
const zentaoForm = ref({ url: '', account: '', password: '', token: '' })
const DEFAULT_ZENTAO_TITLE_TEMPLATE = '[{project}] {title}'
const DEFAULT_ZENTAO_STEPS_TEMPLATE = [
  '【项目】{project}',
  '【应用】{app}',
  '【版本】{version}',
  '【模块】{module}',
  '【用例】{case}',
  '【环境】{env}',
  '',
  '【重现步骤】',
  '{steps}',
  '',
  '【期望】',
  '{expected}',
  '',
  '【实际】',
  '{actual}',
  '',
  '【来源】Mino {run}',
  '',
].join('\n')

const zentaoFlow = ref({
  auto_create_local: false,
  push_requires_confirm: true,
  list_default: 'current_version',
})
const zentaoTemplates = ref([])
const zentaoBindings = ref([])
const zentaoTestBug = ref({
  template_id: '',
  project_id: '',
  product_id: '',
  result: null,
})
const bindDialog = ref(false)
const bindSaving = ref(false)
const bindForm = ref({})
const bindKind = ref('')
const templateDialog = ref(false)
const templateForm = ref({})

const ZENTAO_TYPE_LABELS = {
  codeerror: '代码错误',
  config: '配置相关',
  install: '安装部署',
  security: '安全相关',
  performance: '性能问题',
  standard: '标准规范',
  automation: '测试脚本',
  designdefect: '设计缺陷',
  others: '其他',
}

const capabilities = computed(() =>
  (plugin.value?.capabilities || []).filter((c) => c.id !== 'cases' && c.id !== 'writeback'),
)
const robots = computed(() => plugin.value?.robots || [])
const bindings = computed(() => plugin.value?.bindings || [])
const isNotify = computed(() => ['wecom', 'dingtalk', 'slack'].includes(pluginId.value))
const isIm = computed(() => pluginId.value === 'feishu' || pluginId.value === 'wechat' || isNotify.value)
const isLiveIm = computed(() => pluginId.value === 'feishu' || pluginId.value === 'wechat')
const chatForm = ref({
  enabled: false,
})
const chatWebhookPath = ref('/webhooks/feishu')
const chatListener = ref({
  running: false,
  wanted: false,
  error: '',
  last: {},
})
const chatting = ref(false)
const chatTrial = ref({
  mode: 'auto',
  draft: '',
  messages: [],
})
const chatTrialModes = [
  { id: 'auto', label: '自动' },
  { id: 'dialogue', label: '问答' },
  { id: 'defect', label: '提缺陷' },
]

const formatChatTime = (iso) => {
  const raw = String(iso || '').trim()
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

const chatLink = computed(() => {
  const row = chatListener.value || {}
  const wechat = pluginId.value === 'wechat'
  if (row.connected) return { tone: '', label: '已连上', hint: '' }
  if (row.error) return { tone: 'is-err', label: '连接失败', hint: row.error }
  if (row.running) return { tone: 'is-warn', label: '握手中', hint: '' }
  if (chatForm.value.enabled) return { tone: 'is-warn', label: '未连上', hint: '' }
  return { tone: 'is-muted', label: '已关闭', hint: '' }
})

const lastEventLabel = computed(() => {
  const last = chatListener.value.last || {}
  if (!last.at) return '还没有收到消息'
  const kind = String(last.kind || '')
  const reason = String(last.result?.reason || last.result?.ignored || '')
  const mode = String(last.result?.mode || '')
  let label = '已收到'
  if (kind === 'message') label = mode === 'defect' ? '已回 · 提缺陷' : '已回'
  else if (kind === 'challenge') label = '校验'
  else if (kind === 'ignore') {
    if (reason === 'chat_off') label = '忽略 · 对话关着'
    else if (reason === 'not_mentioned') label = '忽略 · 群里没 @'
    else if (reason === 'bot') label = '忽略 · 机器人自己'
    else label = '已忽略'
  }
  return `${label} · ${formatChatTime(last.at)}`
})

const wechatLogin = ref({
  logged_in: false,
  status: 'idle',
  qrcode_img: '',
  need_verify: false,
  error: '',
  ilink_user_id: '',
})
const wechatPairCode = ref('')
const wechatBusy = ref(false)
let wechatPollTimer = null

const isWechatQrImage = (text) => {
  const t = String(text || '').trim()
  return t.startsWith('data:image') || /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(t)
}

const toWechatQrImage = async (raw) => {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (isWechatQrImage(text)) return text
  return QRCode.toDataURL(text, { width: 280, margin: 1, errorCorrectionLevel: 'M' })
}

const applyWechatLogin = async (data) => {
  const row = data || {}
  const nextStatus = row.status || (row.logged_in ? 'confirmed' : wechatLogin.value.status || 'idle')
  const keepImg = nextStatus !== 'expired' && nextStatus !== 'idle' && !row.logged_in
  const incoming = String(row.qrcode_img || '').trim()
  let img = ''
  if (incoming) img = await toWechatQrImage(incoming)
  else if (keepImg) img = wechatLogin.value.qrcode_img
  wechatLogin.value = {
    logged_in: Boolean(row.logged_in),
    status: nextStatus,
    qrcode_img: img,
    need_verify: Boolean(row.need_verify),
    error: row.error || '',
    ilink_user_id: row.ilink_user_id || '',
  }
  if (row.listener) chatListener.value = { ...(chatListener.value || {}), ...row.listener }
}

const stopWechatPoll = () => {
  if (wechatPollTimer) {
    clearInterval(wechatPollTimer)
    wechatPollTimer = null
  }
}

const refreshWechatLogin = async () => {
  const res = await getWechatLogin()
  await applyWechatLogin(res?.data || {})
  return wechatLogin.value
}

const startWechatPoll = () => {
  stopWechatPoll()
  wechatPollTimer = setInterval(async () => {
    try {
      const row = await refreshWechatLogin()
      if (row.logged_in || row.status === 'expired') stopWechatPoll()
    } catch {
      stopWechatPoll()
    }
  }, 1600)
}

const beginWechatLogin = async () => {
  wechatBusy.value = true
  wechatLogin.value = {
    ...wechatLogin.value,
    logged_in: false,
    status: 'loading',
    error: '',
  }
  try {
    const res = await startWechatLogin()
    await applyWechatLogin(res?.data || {})
    if (!wechatLogin.value.qrcode_img && !wechatLogin.value.error) {
      wechatLogin.value.error = '微信没有返回二维码图，请再试一次'
    }
    if (wechatLogin.value.qrcode_img) startWechatPoll()
  } catch (e) {
    const msg = e?.response?.data?.detail || e?.message || '拿二维码失败'
    wechatLogin.value = { ...wechatLogin.value, status: 'idle', error: String(msg) }
    ElMessage.error(msg)
  } finally {
    wechatBusy.value = false
  }
}

const submitWechatPair = async () => {
  if (!wechatPairCode.value.trim()) return ElMessage.warning('先填微信里的配对码')
  wechatBusy.value = true
  try {
    const res = await verifyWechatLogin(wechatPairCode.value.trim())
    await applyWechatLogin(res?.data || {})
    wechatPairCode.value = ''
    if (wechatLogin.value.logged_in) {
      stopWechatPoll()
      ElMessage.success('微信已绑定')
      await load()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '配对失败')
  } finally {
    wechatBusy.value = false
  }
}

const unbindWechat = async () => {
  wechatBusy.value = true
  try {
    const res = await logoutWechat()
    await applyWechatLogin(res?.data || {})
    ElMessage.success('已退出微信')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '退出失败')
  } finally {
    wechatBusy.value = false
  }
}

const reconnectLiveIm = async () => {
  saving.value = true
  try {
    const res = pluginId.value === 'wechat' ? await syncWechatListener() : await syncFeishuListener()
    chatListener.value = { ...(chatListener.value || {}), ...(res?.data || {}) }
    ElMessage.success(res?.data?.connected ? '已连上' : '已发起连接，等几秒再看状态')
    setTimeout(load, 2500)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '连接失败')
  } finally {
    saving.value = false
  }
}
const statusLabel = computed(() => {
  const s = plugin.value?.status
  if (s === 'ready') return '已连接'
  if (s === 'off') return '已关闭'
  return '待连接'
})

const skipFlowSave = ref(false)

const applyConfig = (data) => {
  skipFlowSave.value = true
  plugin.value = data
  const cfg = data?.config || {}
  const wiki = cfg.wiki || {}
  wikiForm.value = {
    space_id: wiki.space_id || '',
    root_node_token: wiki.root_node_token || '',
    folder_pattern: wiki.folder_pattern || '{project}/版本/{version}',
    childrenText: (wiki.children || ['测试报告', '测试用例', '测试脑图', '需求', '缺陷']).join('、'),
  }
  notifyForm.value = {
    bot_id: cfg.notify?.bot_id || '',
    chat_id: cfg.notify?.chat_id || '',
    on_run_fail: cfg.notify?.on_run_fail !== false,
    on_atlas_pending: cfg.notify?.on_atlas_pending !== false,
    on_verdict: cfg.notify?.on_verdict !== false,
  }
  figmaForm.value = {
    access_token: '',
    default_file_url: data?.figma?.default_file_url || '',
  }
  zentaoForm.value = {
    url: cfg.url || '',
    account: cfg.account || '',
    password: '',
    token: '',
  }
  zentaoFlow.value = {
    auto_create_local: Boolean(cfg.flow?.auto_create_local),
    push_requires_confirm: cfg.flow?.push_requires_confirm !== false,
    list_default: cfg.flow?.list_default || 'current_version',
  }
  zentaoTemplates.value = Array.isArray(cfg.templates) ? cfg.templates.map((x) => ({ ...x })) : []
  zentaoBindings.value = Array.isArray(cfg.bindings) ? cfg.bindings.map((x) => ({ ...x })) : []
  chatForm.value = {
    enabled: Boolean(cfg.chat?.enabled),
  }
  chatWebhookPath.value = cfg.chat_webhook?.path || '/webhooks/feishu'
  chatListener.value = cfg.chat_listener || { running: false, error: '', last: {} }
  if (pluginId.value === 'wechat') {
    void applyWechatLogin({
      ...(cfg.wechat_account || {}),
      listener: cfg.chat_listener,
      status: cfg.wechat_account?.logged_in ? 'confirmed' : (wechatLogin.value.status || 'idle'),
      qrcode_img: wechatLogin.value.qrcode_img,
      need_verify: wechatLogin.value.need_verify,
      error: cfg.chat_listener?.error || wechatLogin.value.error,
    })
  }
  const keepTpl = zentaoTemplates.value.find((x) => x.id === zentaoTestBug.value.template_id)
    || zentaoTemplates.value.find((x) => x.is_default)
    || zentaoTemplates.value[0]
  zentaoTestBug.value.template_id = keepTpl?.id || ''
  const keep = zentaoBindings.value.find((x) => x.project_id === zentaoTestBug.value.project_id)
    || zentaoBindings.value.find((x) => String(x.product_id || '').trim())
  zentaoTestBug.value.project_id = keep?.project_id || ''
  if (keep?.product_id) zentaoTestBug.value.product_id = keep.product_id
  nextTick(() => { skipFlowSave.value = false })
}

const load = async () => {
  if (!pluginId.value) return
  loading.value = true
  try {
    const res = await getPlugin(pluginId.value)
    applyConfig(res?.data || null)
    const first = (res?.data?.capabilities || [])[0]?.id || 'connect'
    const want = String(route.query.tab || '')
    tab.value = (res?.data?.capabilities || []).some((c) => c.id === want) ? want : first
  } catch (e) {
    plugin.value = null
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载插件失败')
  } finally {
    loading.value = false
  }
}

const persist = async (payload, msg = '已保存') => {
  saving.value = true
  try {
    const res = await savePlugin(pluginId.value, payload)
    applyConfig(res?.data || plugin.value)
    if (msg) ElMessage.success(msg)
    return true
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
    return false
  } finally {
    saving.value = false
  }
}

const setTab = (id) => {
  tab.value = id
  const cat = String(route.query.cat || '')
  router.replace({
    name: 'SettingsPluginDetail',
    params: { pluginId: pluginId.value },
    query: { tab: id, ...(cat ? { cat } : {}) },
  })
}

const backToCatalog = () => {
  const cat = String(route.query.cat || '')
  router.push({
    name: 'SettingsPlugins',
    query: cat ? { cat } : {},
  })
}

const toggleEnabled = async (val) => {
  await persist({ enabled: val }, val ? '已开启' : '已关闭')
}

const parseChildren = (text) => String(text || '').split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean)

const saveWiki = () => persist({
  wiki: {
    space_id: wikiForm.value.space_id.trim(),
    root_node_token: wikiForm.value.root_node_token.trim(),
    folder_pattern: wikiForm.value.folder_pattern.trim() || '{project}/版本/{version}',
    children: parseChildren(wikiForm.value.childrenText),
  },
})

const runWikiDebug = async (action) => {
  if (wikiDebug.value.busy) return
  wikiDebug.value.busy = true
  wikiDebug.value.result = { action, ok: true, title: '进行中', summary: '' }
  try {
    const res = await debugFeishuWiki({
      action,
      space_id: wikiForm.value.space_id.trim(),
      root_node_token: wikiForm.value.root_node_token.trim(),
      folder_pattern: wikiForm.value.folder_pattern.trim(),
      children: parseChildren(wikiForm.value.childrenText),
      project: 'Mino',
      version: '调试',
    })
    wikiDebug.value.result = res?.data || { ok: true, action, title: '已完成' }
    ElMessage.success(wikiDebug.value.result.title || '已完成')
  } catch (e) {
    const error = e?.response?.data?.detail || e?.message || '调试失败'
    wikiDebug.value.result = { ok: false, action, title: '没连上', summary: error, error }
    ElMessage.error(error)
  } finally {
    wikiDebug.value.busy = false
  }
}

const chatPayload = () => ({
  enabled: chatForm.value.enabled,
})

const toggleChatEnabled = async (val) => {
  chatForm.value.enabled = Boolean(val)
  await persist({ chat: chatPayload() }, val ? '已开启群对话' : '已关闭群对话')
}

const reconnectFeishu = reconnectLiveIm

const sendChatTrial = async () => {
  const text = chatTrial.value.draft.trim()
  if (!text) return ElMessage.warning('先说一句话')
  chatting.value = true
  chatTrial.value.messages = [
    ...chatTrial.value.messages,
    { role: 'user', content: text },
  ]
  chatTrial.value.draft = ''
  try {
    const history = chatTrial.value.messages
      .slice(0, -1)
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({ role: row.role, content: row.content }))
    const res = await chatPlugin(pluginId.value, {
      text,
      mode: chatTrial.value.mode === 'auto' ? '' : chatTrial.value.mode,
      history,
    })
    const reply = res?.data?.reply || '没有返回内容'
    chatTrial.value.messages = [
      ...chatTrial.value.messages,
      {
        role: 'assistant',
        content: reply,
        mode: res?.data?.mode || '',
        action: res?.data?.action || '',
      },
    ]
  } catch (e) {
    chatTrial.value.messages = [
      ...chatTrial.value.messages,
      { role: 'assistant', content: e?.response?.data?.detail || e?.message || '试对话失败' },
    ]
  } finally {
    chatting.value = false
  }
}

const saveNotify = () => persist({
  notify: {
    bot_id: notifyForm.value.bot_id,
    chat_id: notifyForm.value.chat_id.trim(),
    on_run_fail: notifyForm.value.on_run_fail,
    on_atlas_pending: notifyForm.value.on_atlas_pending,
    on_verdict: notifyForm.value.on_verdict,
  },
})

const saveFigma = async () => {
  const ok = await persist({
    access_token: figmaForm.value.access_token,
    default_file_url: figmaForm.value.default_file_url.trim(),
  })
  if (ok) figmaForm.value.access_token = ''
}

const testFigma = async () => {
  testing.value = true
  try {
    const res = await testFigmaToken(figmaForm.value.access_token || '')
    const who = res?.data?.email || res?.data?.handle || ''
    ElMessage.success(who ? `Token 有效（${who}）` : 'Token 有效')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || 'Token 无效')
  } finally {
    testing.value = false
  }
}

const saveZentaoConnect = async () => {
  if (!zentaoForm.value.url.trim()) return ElMessage.warning('请填写禅道地址')
  const ok = await persist({
    url: zentaoForm.value.url.trim(),
    account: zentaoForm.value.account.trim(),
    token: zentaoForm.value.token,
  })
  if (ok) {
    zentaoForm.value.token = ''
    zentaoForm.value.password = ''
  }
}

const fetchZentaoTokenByPassword = async () => {
  if (!zentaoForm.value.url.trim()) return ElMessage.warning('请填写禅道地址')
  if (!zentaoForm.value.account.trim()) return ElMessage.warning('请填写账号')
  if (!zentaoForm.value.password) return ElMessage.warning('请填写密码')
  fetchingToken.value = true
  try {
    const res = await fetchZentaoToken({
      url: zentaoForm.value.url.trim(),
      account: zentaoForm.value.account.trim(),
      password: zentaoForm.value.password,
    })
    zentaoForm.value.password = ''
    zentaoForm.value.token = ''
    if (res?.data?.plugin) applyConfig(res.data.plugin)
    else await load()
    ElMessage.success(res?.msg || '已用账号密码换到 Token 并保存')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '获取 Token 失败')
  } finally {
    fetchingToken.value = false
  }
}

const testZentao = async () => {
  testing.value = true
  try {
    const res = await testZentaoPlugin({
      url: zentaoForm.value.url,
      account: zentaoForm.value.account,
      token: zentaoForm.value.token,
    })
    ElMessage.success(res?.data?.hint || '已连通')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '连接失败')
  } finally {
    testing.value = false
  }
}

const saveZentaoFlow = () => {
  if (skipFlowSave.value) return
  persist({
    flow: {
      auto_create_local: zentaoFlow.value.auto_create_local,
      push_requires_confirm: zentaoFlow.value.push_requires_confirm,
      list_default: zentaoFlow.value.list_default,
    },
  })
}

const blankZentaoTemplate = () => ({
  id: '',
  name: '',
  title: DEFAULT_ZENTAO_TITLE_TEMPLATE,
  steps: DEFAULT_ZENTAO_STEPS_TEMPLATE,
  type: 'codeerror',
  severity: 3,
  pri: 3,
  opened_build: 'trunk',
  is_default: zentaoTemplates.value.length === 0,
})

const saveZentaoTemplates = (rows, msg = '已保存提单模板') => persist({ templates: rows }, msg)

const openZentaoTemplate = (row) => {
  templateForm.value = row
    ? { ...row }
    : blankZentaoTemplate()
  templateDialog.value = true
}

const submitZentaoTemplate = async () => {
  const name = String(templateForm.value.name || '').trim()
  if (!name) return ElMessage.warning('请填写模板名称')
  const id = String(templateForm.value.id || '').trim() || `tpl-${Date.now().toString(36)}`
  const next = zentaoTemplates.value.filter((x) => x.id !== id)
  const row = {
    id,
    name,
    title: String(templateForm.value.title || '').trim() || DEFAULT_ZENTAO_TITLE_TEMPLATE,
    steps: String(templateForm.value.steps || '').trim() || DEFAULT_ZENTAO_STEPS_TEMPLATE,
    type: templateForm.value.type || 'codeerror',
    severity: Number(templateForm.value.severity) || 3,
    pri: Number(templateForm.value.pri) || 3,
    opened_build: String(templateForm.value.opened_build || '').trim() || 'trunk',
    is_default: Boolean(templateForm.value.is_default) || next.length === 0,
  }
  const rows = row.is_default
    ? [...next.map((x) => ({ ...x, is_default: false })), row]
    : [...next, row]
  templateDialog.value = false
  await saveZentaoTemplates(rows)
}

const setZentaoDefaultTemplate = async (row) => {
  const rows = zentaoTemplates.value.map((x) => ({ ...x, is_default: x.id === row.id }))
  await saveZentaoTemplates(rows, `已将「${row.name}」设为默认`)
}

const removeZentaoTemplate = async (row) => {
  if (zentaoTemplates.value.length <= 1) return ElMessage.warning('至少留一个模板')
  try {
    await ElMessageBox.confirm(`删除模板「${row.name}」？`, '删除模板', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  let rows = zentaoTemplates.value.filter((x) => x.id !== row.id)
  if (!rows.some((x) => x.is_default) && rows[0]) rows = rows.map((x, i) => ({ ...x, is_default: i === 0 }))
  await saveZentaoTemplates(rows, '已删除模板')
}

const zentaoTestTargets = computed(() =>
  zentaoBindings.value.filter((x) => String(x.product_id || '').trim()),
)

const onPickZentaoTestProject = (id) => {
  const row = zentaoBindings.value.find((x) => x.project_id === id)
  zentaoTestBug.value.project_id = id
  zentaoTestBug.value.product_id = row?.product_id || ''
}

const testZentaoBugSubmit = async () => {
  const tpl = zentaoTemplates.value.find((x) => x.id === zentaoTestBug.value.template_id)
    || zentaoTemplates.value.find((x) => x.is_default)
    || zentaoTemplates.value[0]
  if (!tpl) return ElMessage.warning('请选择提单模板')
  const productId = String(zentaoTestBug.value.product_id || '').trim()
  if (!productId) return ElMessage.warning(zentaoTestTargets.value.length ? '请选择要提交到的产品' : '请填写禅道产品 ID')
  try {
    await ElMessageBox.confirm(
      `会用「${tpl.name}」在禅道产品 ${productId} 建一张测试缺陷，测完请关掉。`,
      '测试提交 Bug',
      { confirmButtonText: '提交', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  testingBug.value = true
  try {
    const res = await testZentaoBug({
      project_id: zentaoTestBug.value.project_id,
      product_id: productId,
      template_id: tpl.id,
    })
    zentaoTestBug.value.result = res?.data || null
    const bugId = res?.data?.bug_id
    ElMessage.success(bugId ? `已在禅道建测试单 #${bugId}` : (res?.msg || '已提交'))
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '提交失败')
  } finally {
    testingBug.value = false
  }
}

const saveZentaoBindings = () => persist({ bindings: zentaoBindings.value })

const openZentaoBind = (row) => {
  bindKind.value = 'zentao'
  bindForm.value = row
    ? { ...row }
    : { project_id: '', project_name: '', product_id: '', product_name: '' }
  bindDialog.value = true
}

const projects = ref([])
const loadProjects = async () => {
  try {
    const res = await getProjects()
    projects.value = Array.isArray(res) ? res : (res?.data || [])
  } catch {
    projects.value = []
  }
}

const onPickProject = (id) => {
  const row = projects.value.find((p) => p.id === id)
  bindForm.value.project_id = id
  bindForm.value.project_name = row?.name || ''
}

const submitZentaoBind = async () => {
  if (!bindForm.value.project_id) return ElMessage.warning('请选择项目')
  const next = zentaoBindings.value.filter((x) => x.project_id !== bindForm.value.project_id)
  next.push({
    project_id: bindForm.value.project_id,
    project_name: bindForm.value.project_name,
    product_id: String(bindForm.value.product_id || '').trim(),
    product_name: String(bindForm.value.product_name || '').trim(),
  })
  zentaoBindings.value = next
  bindDialog.value = false
  await saveZentaoBindings()
}

const removeZentaoBind = async (row) => {
  zentaoBindings.value = zentaoBindings.value.filter((x) => x.project_id !== row.project_id)
  await saveZentaoBindings()
}


const openFigmaBind = (row) => {
  bindKind.value = 'figma'
  bindForm.value = {
    app_id: row.app_id,
    app_name: row.app_name,
    project_name: row.project_name,
    file_url: row.file_url || '',
  }
  bindDialog.value = true
}

const submitFigmaBind = async () => {
  bindSaving.value = true
  try {
    const res = await getAppAutomationConfig(bindForm.value.app_id)
    const prev = res?.data?.automation?.figma || {}
    const url = String(bindForm.value.file_url || '').trim()
    const keyMatch = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/i)
    await updateAppAutomationConfig(bindForm.value.app_id, {
      figma: {
        ...prev,
        file_url: url,
        file_key: keyMatch?.[1] || prev.file_key || '',
      },
    })
    ElMessage.success('已绑定设计稿')
    bindDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    bindSaving.value = false
  }
}

const goApp = (row, section) => {
  router.push({
    name: 'TestingApp',
    params: { appId: row.app_id },
    query: {
      appName: row.app_name,
      projectName: row.project_name,
      projectId: row.project_id,
      tab: 'config',
      configSection: section,
    },
  })
}

const submitBind = () => {
  if (bindKind.value === 'figma') return submitFigmaBind()
  return submitZentaoBind()
}

watch(pluginId, () => {
  tab.value = 'connect'
  stopWechatPoll()
  load()
})

onMounted(async () => {
  await Promise.all([load(), loadProjects()])
  if (pluginId.value === 'wechat') {
    try { await refreshWechatLogin() } catch { /* ignore */ }
  }
})

onUnmounted(() => {
  stopWechatPoll()
})
</script>

<template>
  <div class="settings-panel plugin-detail wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <button type="button" class="back-link" @click="backToCatalog">← 返回分类</button>
        <h2 class="settings-page-title">{{ plugin?.name || '插件' }}</h2>
        <p class="settings-page-desc">{{ plugin?.summary || '' }}</p>
      </div>
      <div class="header-side">
        <div class="settings-summary-pill">{{ statusLabel }}</div>
        <el-switch
          :model-value="plugin?.enabled !== false"
          :loading="saving"
          active-text="启用"
          @change="toggleEnabled"
        />
      </div>
    </header>

    <p v-if="!loading && !plugin" class="settings-page-desc">暂无数据</p>

    <div v-if="capabilities.length > 1" class="settings-tabbar is-compact">
      <button
        v-for="cap in capabilities"
        :key="cap.id"
        type="button"
        class="settings-tab"
        :class="{ active: tab === cap.id }"
        @click="setTab(cap.id)"
      >
        <strong>{{ cap.label }}</strong>
        <span>{{ cap.desc }}</span>
      </button>
    </div>

    <section v-if="tab === 'connect' && pluginId === 'wechat'" class="settings-card wechat-connect">
      <div class="settings-kicker">微信 ClawBot</div>
      <div v-if="wechatLogin.logged_in" class="wechat-bound">
        <div class="settings-summary-pill">已绑定</div>
        <p v-if="wechatLogin.ilink_user_id">账号 {{ wechatLogin.ilink_user_id }}</p>
        <div class="row-actions">
          <button type="button" class="settings-action-pill" :disabled="wechatBusy" @click="unbindWechat">
            退出微信
            <span class="settings-action-arrow">→</span>
          </button>
        </div>
      </div>
      <div v-else class="wechat-qr-box">
        <div v-if="wechatLogin.qrcode_img" class="wechat-qr">
          <img :src="wechatLogin.qrcode_img" alt="微信登录二维码">
        </div>
        <p v-if="wechatBusy" class="hint">正在向微信要二维码…</p>
        <p v-if="wechatLogin.status === 'expired'" class="hint">二维码过期了，重新拿一张。</p>
        <p v-else-if="wechatLogin.status === 'scaned' || wechatLogin.status === 'scanned'" class="hint">已扫码，在手机上确认。</p>
        <p v-else-if="wechatLogin.error" class="hint">{{ wechatLogin.error }}</p>
        <div v-if="wechatLogin.need_verify" class="wechat-pair">
          <el-input v-model="wechatPairCode" placeholder="微信显示的配对码" style="max-width: 220px" />
          <button type="button" class="settings-action-pill" :disabled="wechatBusy" @click="submitWechatPair">
            确认配对
            <span class="settings-action-arrow">→</span>
          </button>
        </div>
        <button type="button" class="settings-action-pill" :disabled="wechatBusy" @click="beginWechatLogin">
          {{ wechatBusy ? '正在获取二维码' : (wechatLogin.qrcode_img ? '刷新二维码' : '扫码绑定微信') }}
          <span class="settings-action-arrow">→</span>
        </button>
      </div>
    </section>

    <section v-else-if="tab === 'connect' && (pluginId === 'feishu' || isNotify)">
      <RobotIntegrationsPanel :platform="plugin?.robot_platform || pluginId" />
    </section>

    <template v-else-if="pluginId === 'feishu' && tab === 'wiki'">
      <div class="wiki-page">
      <section class="settings-card">
        <div class="settings-kicker">Wiki 规则</div>
        <el-form label-position="top" class="settings-form-stack">
          <el-form-item label="知识空间 ID">
            <el-input v-model="wikiForm.space_id" placeholder="空间 ID，或任意 Wiki 节点 token" />
          </el-form-item>
          <el-form-item label="根节点 token">
            <el-input v-model="wikiForm.root_node_token" placeholder="可选，挂在某个已有目录下" />
          </el-form-item>
          <el-form-item label="文件夹规则">
            <el-input v-model="wikiForm.folder_pattern" placeholder="{project}/版本/{version}" />
          </el-form-item>
          <el-form-item label="版本下的子目录">
            <el-input v-model="wikiForm.childrenText" placeholder="测试报告、测试用例、测试脑图、需求、缺陷" />
          </el-form-item>
          <div>
            <button type="button" class="settings-action-pill" :disabled="saving" @click="saveWiki">
              保存 Wiki
              <span class="settings-action-arrow">→</span>
            </button>
          </div>
        </el-form>
      </section>

      <PluginDebugPanel
        title="Wiki 调试"
        :busy="wikiDebug.busy"
        busy-label="请求中"
        :result="wikiDebug.result"
        :actions="wikiDebugActions"
        @run="runWikiDebug"
      />
      </div>
    </template>

    <template v-else-if="isIm && tab === 'chat'">
      <div class="im-chat-page">
        <section class="settings-card im-channel">
          <div class="im-channel-top">
            <div>
              <div class="settings-kicker">通道</div>
              <p v-if="isLiveIm && chatLink.hint">{{ chatLink.hint }}</p>
            </div>
            <div class="im-channel-controls">
              <span
                v-if="isLiveIm"
                class="settings-summary-pill"
                :class="chatLink.tone"
              >{{ chatLink.label }}</span>
              <label class="im-switch">
                <span>自动回复</span>
                <el-switch
                  :model-value="chatForm.enabled"
                  :loading="saving"
                  :disabled="!isLiveIm"
                  @change="toggleChatEnabled"
                />
              </label>
            </div>
          </div>
          <div v-if="isLiveIm" class="im-channel-meta">
            <p>{{ lastEventLabel }}</p>
            <div class="im-channel-links">
              <button
                type="button"
                class="settings-action-pill"
                :disabled="saving"
                @click="reconnectFeishu"
              >
                重新连接
                <span class="settings-action-arrow">→</span>
              </button>
            </div>
          </div>
        </section>

        <section class="settings-card im-trial">
          <div class="im-trial-head">
            <div>
              <div class="settings-kicker">试对话</div>
            </div>
            <div class="im-mode">
              <button
                v-for="item in chatTrialModes"
                :key="item.id"
                type="button"
                :class="{ active: chatTrial.mode === item.id }"
                @click="chatTrial.mode = item.id"
              >
                {{ item.label }}
              </button>
            </div>
          </div>

          <div class="im-trial-log">
            <div v-if="!chatTrial.messages.length" class="im-trial-empty">暂无数据</div>
            <div
              v-for="(row, idx) in chatTrial.messages"
              :key="`im-${idx}`"
              class="im-trial-row"
              :class="row.role === 'user' ? 'is-user' : 'is-bot'"
            >
              <strong>{{ row.role === 'user' ? '你' : '机器人' }}</strong>
              <p>{{ row.content }}</p>
            </div>
            <div v-if="chatting" class="im-trial-row is-bot is-pending">
              <strong>机器人</strong>
              <p>正在回复…</p>
            </div>
          </div>

          <div class="im-trial-composer">
            <el-input
              v-model="chatTrial.draft"
              type="textarea"
              :rows="2"
              resize="none"
              placeholder="回车发送"
              @keydown.enter.exact.prevent="sendChatTrial"
            />
            <button
              type="button"
              class="settings-action-pill"
              :disabled="chatting || !chatTrial.draft.trim()"
              @click="sendChatTrial"
            >
              {{ chatting ? '回复中' : '发送' }}
              <span class="settings-action-arrow">→</span>
            </button>
          </div>
        </section>
      </div>
    </template>

    <section v-else-if="pluginId === 'feishu' && tab === 'notify'" class="settings-card">
      <div class="settings-kicker">群通知</div>
      <el-form label-position="top" class="settings-form-stack">
        <el-form-item label="发送机器人">
          <el-select v-model="notifyForm.bot_id" clearable placeholder="默认用第一个已配置机器人" style="width: 100%">
            <el-option v-for="b in robots" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="群 chat_id">
          <el-input v-model="notifyForm.chat_id" placeholder="oc_ 开头的会话 ID" />
        </el-form-item>
        <el-form-item label="何时通知">
          <el-checkbox v-model="notifyForm.on_run_fail">用例失败</el-checkbox>
          <el-checkbox v-model="notifyForm.on_atlas_pending">图谱待确认</el-checkbox>
          <el-checkbox v-model="notifyForm.on_verdict">验收 / 发版结论</el-checkbox>
        </el-form-item>
        <div>
          <button type="button" class="settings-action-pill" :disabled="saving" @click="saveNotify">
            保存通知
            <span class="settings-action-arrow">→</span>
          </button>
        </div>
      </el-form>
    </section>

    <section v-else-if="pluginId === 'figma' && tab === 'connect'" class="settings-card">
      <div class="settings-kicker">Figma Token</div>
      <el-form label-position="top" class="settings-form-stack">
        <el-form-item label="Token">
          <SecretField
            v-model="figmaForm.access_token"
            :configured="!!plugin?.figma?.configured && !figmaForm.access_token"
            placeholder="figd_..."
          />
        </el-form-item>
        <el-form-item label="默认文件链接（可选）">
          <el-input v-model="figmaForm.default_file_url" placeholder="https://www.figma.com/design/..." />
        </el-form-item>
        <div class="row-actions">
          <button type="button" class="settings-action-pill" :disabled="testing" @click="testFigma">
            验证 Token
            <span class="settings-action-arrow">→</span>
          </button>
          <button type="button" class="settings-action-pill" :disabled="saving" @click="saveFigma">
            保存
            <span class="settings-action-arrow">→</span>
          </button>
        </div>
      </el-form>
    </section>

    <section v-else-if="pluginId === 'figma' && tab === 'bind'" class="settings-table-card">
      <div class="card-head">
        <div>
          <h3>应用设计稿</h3>
        </div>
      </div>
          <el-table :data="bindings" empty-text="暂无数据">
        <el-table-column label="项目" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.project_name }}</template>
        </el-table-column>
        <el-table-column label="应用" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.app_name }}</template>
        </el-table-column>
        <el-table-column label="文件" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.file_url || '未绑定' }}</template>
        </el-table-column>
        <el-table-column label="上次同步" width="168">
          <template #default="{ row }">{{ row.last_sync_at || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openFigmaBind(row)">绑定</el-button>
            <el-button link type="primary" @click="goApp(row, 'figma')">去学习</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else-if="pluginId === 'zentao' && tab === 'connect'" class="settings-card">
      <div class="settings-kicker">禅道连接</div>
      <el-form label-position="top" class="settings-form-stack">
        <el-form-item label="禅道地址" required>
          <el-input v-model="zentaoForm.url" placeholder="https://zentao.example.com" />
        </el-form-item>
        <el-form-item label="账号" required>
          <el-input v-model="zentaoForm.account" placeholder="登录账号" />
        </el-form-item>
        <el-form-item label="密码">
          <SecretField
            v-model="zentaoForm.password"
            :configured="false"
            placeholder="登录密码，仅用于换 Token"
          />
        </el-form-item>
        <div class="row-actions">
          <button type="button" class="settings-action-pill" :disabled="fetchingToken || saving" @click="fetchZentaoTokenByPassword">
            {{ fetchingToken ? '正在获取 Token' : '用账号密码获取 Token' }}
            <span class="settings-action-arrow">→</span>
          </button>
        </div>
        <el-form-item label="Token">
          <SecretField
            v-model="zentaoForm.token"
            :configured="!!plugin?.config?.has_token && !zentaoForm.token"
            placeholder="个人访问令牌，可手填"
          />
        </el-form-item>
        <div class="row-actions">
          <button type="button" class="settings-action-pill" :disabled="testing" @click="testZentao">
            测试连接
            <span class="settings-action-arrow">→</span>
          </button>
          <button type="button" class="settings-action-pill" :disabled="saving" @click="saveZentaoConnect">
            保存
            <span class="settings-action-arrow">→</span>
          </button>
        </div>
      </el-form>
    </section>

    <section v-else-if="pluginId === 'zentao' && tab === 'bind'" class="settings-table-card">
      <div class="card-head">
        <div>
          <h3>项目 ↔ 禅道产品</h3>
        </div>
        <button type="button" class="settings-action-pill" @click="openZentaoBind()">
          添加绑定
          <span class="settings-action-arrow">→</span>
        </button>
      </div>
          <el-table :data="zentaoBindings" empty-text="暂无数据">
        <el-table-column label="项目" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.project_name || row.project_id }}</template>
        </el-table-column>
        <el-table-column label="禅道产品 ID" width="140">
          <template #default="{ row }">{{ row.product_id || '—' }}</template>
        </el-table-column>
        <el-table-column label="产品名" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.product_name || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openZentaoBind(row)">编辑</el-button>
            <el-button link type="danger" @click="removeZentaoBind(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else-if="pluginId === 'zentao' && tab === 'flow'" class="settings-card">
      <div class="settings-kicker">提单规则</div>
      <el-form label-position="top" class="settings-form-stack">
        <el-form-item label="高置信产品失败自动开本地单">
          <el-switch v-model="zentaoFlow.auto_create_local" @change="saveZentaoFlow" />
        </el-form-item>
        <el-form-item label="推禅道前必须人确认">
          <el-switch v-model="zentaoFlow.push_requires_confirm" @change="saveZentaoFlow" />
        </el-form-item>
        <el-form-item label="缺陷列表默认范围">
          <el-select v-model="zentaoFlow.list_default" style="width: 240px" @change="saveZentaoFlow">
            <el-option label="当前版本" value="current_version" />
            <el-option label="项目全部未关闭" value="all_open" />
          </el-select>
        </el-form-item>
      </el-form>
    </section>

    <template v-else-if="pluginId === 'zentao' && tab === 'templates'">
      <section class="settings-table-card">
        <div class="card-head">
          <div>
            <h3>提单模板</h3>
            <p v-pre>推禅道时按模板填标题和描述。变量：{title} {project} {app} {version} {module} {case} {env} {steps} {expected} {actual} {run}</p>
          </div>
          <button type="button" class="settings-action-pill" @click="openZentaoTemplate()">
            添加模板
            <span class="settings-action-arrow">→</span>
          </button>
        </div>
          <el-table :data="zentaoTemplates" empty-text="暂无数据">
          <el-table-column label="名称" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.name }}
              <span v-if="row.is_default" class="settings-summary-pill">默认</span>
            </template>
          </el-table-column>
          <el-table-column label="标题模板" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.title }}</template>
          </el-table-column>
          <el-table-column label="类型" width="110">
            <template #default="{ row }">{{ ZENTAO_TYPE_LABELS[row.type] || row.type }}</template>
          </el-table-column>
          <el-table-column label="严重 / 优先" width="110">
            <template #default="{ row }">{{ row.severity }} / {{ row.pri }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openZentaoTemplate(row)">编辑</el-button>
              <el-button v-if="!row.is_default" link type="primary" @click="setZentaoDefaultTemplate(row)">默认</el-button>
              <el-button link type="danger" @click="removeZentaoTemplate(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section class="settings-card">
        <div class="settings-kicker">测试提交</div>
        <el-form label-position="top" class="settings-form-stack">
          <el-form-item label="模板" required>
            <el-select v-model="zentaoTestBug.template_id" placeholder="选择提单模板" style="width: 240px">
              <el-option
                v-for="row in zentaoTemplates"
                :key="row.id"
                :label="row.is_default ? `${row.name}（默认）` : row.name"
                :value="row.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="产品" required>
            <el-select
              v-if="zentaoTestTargets.length"
              :model-value="zentaoTestBug.project_id"
              placeholder="选择已绑定的产品"
              style="width: 240px"
              @change="onPickZentaoTestProject"
            >
              <el-option
                v-for="row in zentaoTestTargets"
                :key="row.project_id"
                :label="`${row.project_name || row.project_id} → ${row.product_name || row.product_id}`"
                :value="row.project_id"
              />
            </el-select>
            <el-input
              v-else
              v-model="zentaoTestBug.product_id"
              placeholder="还没有绑定，先填禅道产品 ID"
              style="width: 240px"
            />
          </el-form-item>
          <div class="row-actions">
            <button type="button" class="settings-action-pill" :disabled="testingBug" @click="testZentaoBugSubmit">
              {{ testingBug ? '正在提交' : '测试提交 Bug' }}
              <span class="settings-action-arrow">→</span>
            </button>
          </div>
          <p v-if="zentaoTestBug.result?.bug_id" class="hint">
            已建单 #{{ zentaoTestBug.result.bug_id }}
            <a
              v-if="zentaoTestBug.result.url"
              :href="zentaoTestBug.result.url"
              target="_blank"
              rel="noreferrer"
            >打开禅道</a>
          </p>
        </el-form>
      </section>
    </template>
  </div>

  <el-dialog
    v-model="bindDialog"
    :title="bindKind === 'zentao' ? '绑定禅道产品' : '绑定设计稿'"
    width="520px"
    destroy-on-close
    class="mo-fit-dialog"
  >
    <el-form v-if="bindKind === 'figma'" label-position="top">
      <el-form-item label="应用">
        <el-input :model-value="`${bindForm.project_name} / ${bindForm.app_name}`" disabled />
      </el-form-item>
      <el-form-item label="Figma 文件链接">
        <el-input v-model="bindForm.file_url" placeholder="https://www.figma.com/design/..." />
      </el-form-item>
    </el-form>
    <el-form v-else label-position="top">
      <el-form-item label="项目" required>
        <el-select v-model="bindForm.project_id" placeholder="选择项目" style="width: 100%" @change="onPickProject">
          <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="禅道产品 ID">
        <el-input v-model="bindForm.product_id" placeholder="如 12" />
      </el-form-item>
      <el-form-item label="产品名">
        <el-input v-model="bindForm.product_name" placeholder="便于识别，可不填" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="bindDialog = false">取消</el-button>
      <el-button type="primary" :loading="bindSaving || saving" @click="submitBind">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="templateDialog"
    :title="templateForm.id ? '编辑提单模板' : '添加提单模板'"
    width="640px"
    destroy-on-close
    class="mo-fit-dialog"
  >
    <el-form label-position="top">
      <el-form-item label="名称" required>
        <el-input v-model="templateForm.name" placeholder="如：自动化失败、手工发现" />
      </el-form-item>
      <el-form-item label="标题模板">
        <el-input v-model="templateForm.title" placeholder="[{project}] {title}" />
      </el-form-item>
      <el-form-item label="描述模板">
        <el-input v-model="templateForm.steps" type="textarea" :rows="8" placeholder="【重现步骤】{steps}" />
      </el-form-item>
      <el-form-item label="缺陷类型">
        <el-select v-model="templateForm.type" style="width: 100%">
          <el-option v-for="(label, value) in ZENTAO_TYPE_LABELS" :key="value" :label="label" :value="value" />
        </el-select>
      </el-form-item>
      <el-form-item label="严重程度">
        <el-select v-model="templateForm.severity" style="width: 100%">
          <el-option :value="1" label="1 致命" />
          <el-option :value="2" label="2 严重" />
          <el-option :value="3" label="3 一般" />
          <el-option :value="4" label="4 轻微" />
        </el-select>
      </el-form-item>
      <el-form-item label="优先级">
        <el-select v-model="templateForm.pri" style="width: 100%">
          <el-option :value="1" label="1 高" />
          <el-option :value="2" label="2 中" />
          <el-option :value="3" label="3 低" />
          <el-option :value="4" label="4 较低" />
        </el-select>
      </el-form-item>
      <el-form-item label="影响版本">
        <el-input v-model="templateForm.opened_build" placeholder="trunk，或禅道版本 ID" />
      </el-form-item>
      <el-form-item label="设为默认">
        <el-switch v-model="templateForm.is_default" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="templateDialog = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submitZentaoTemplate">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.back-link {
  border: 0;
  background: transparent;
  color: #6366f1;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
}

.header-side {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hint {
  margin: 6px 0 14px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.55;
}

.hint a {
  color: #6366f1;
  font-weight: 700;
  margin-left: 8px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.card-head h3 {
  margin: 0 0 4px;
  font-size: 16px;
  color: #111827;
}

.card-head p,
.plugin-detail :deep(.table-title span) {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.settings-toolbar .hint {
  margin: 0;
}

.settings-table-card :deep(.settings-summary-pill) {
  margin-left: 6px;
  min-height: 22px;
  padding: 0 8px;
  font-size: 11px;
}

.im-chat-page,
.wiki-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wiki-page .settings-info-card p {
  margin: 8px 0 0;
  color: var(--settings-text);
  font-size: 13px;
  line-height: 1.65;
}

.im-channel-top,
.im-channel-meta,
.im-trial-head,
.im-channel-controls,
.im-channel-links,
.im-trial-composer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.im-channel-top {
  align-items: flex-start;
}

.im-channel p,
.im-trial-head p {
  margin: 6px 0 0;
  color: var(--settings-muted);
  font-size: 12px;
  line-height: 1.5;
}

.im-channel-meta {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--settings-border);
}

.im-channel-meta > p {
  margin: 0;
}

.im-channel-controls,
.im-channel-links {
  justify-content: flex-end;
}

.im-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--settings-text);
  font-size: 12px;
  font-weight: 700;
}

.im-trial {
  display: flex;
  flex-direction: column;
  min-height: min(52vh, 520px);
}

.im-mode {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--settings-border);
  border-radius: 999px;
  background: var(--settings-soft);
}

.im-mode button {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--settings-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.im-mode button.active {
  background: #fff;
  color: var(--settings-primary);
  box-shadow: var(--settings-shadow);
}

.im-trial-log {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 180px;
  max-height: 360px;
  margin: 12px 0;
  overflow: auto;
}

.im-trial-empty {
  margin: auto;
  color: var(--settings-muted);
  font-size: 13px;
}

.im-trial-row {
  max-width: 86%;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--settings-soft);
  border: 1px solid var(--settings-border);
}

.im-trial-row.is-user {
  align-self: flex-end;
  background: var(--settings-primary-soft);
  border-color: #c7d2fe;
}

.im-trial-row.is-pending {
  opacity: 0.7;
}

.im-trial-row strong {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--settings-muted);
}

.im-trial-row p {
  margin: 0;
  white-space: pre-wrap;
  color: var(--settings-text);
  font-size: 13px;
  line-height: 1.55;
}

.im-trial-composer :deep(.el-textarea) {
  min-width: 0;
  flex: 1;
}

.im-trial-composer :deep(.el-textarea__inner) {
  border-radius: 12px;
}

.im-trial-composer .settings-action-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.plugin-detail code {
  font-size: 12px;
  color: #4338ca;
}

.wechat-connect .hint {
  margin: 8px 0 12px;
  color: var(--settings-muted);
  font-size: 13px;
  line-height: 1.6;
}

.wechat-qr-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.wechat-qr {
  width: 220px;
  height: 220px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--settings-border);
  background: #fff;
}

.wechat-qr img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.wechat-pair,
.wechat-bound .row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
</style>
