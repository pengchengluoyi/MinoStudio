<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listAIProviders, saveAIProvider, deleteAIProvider, saveAIUsage, getMailSettings, saveMailSettings, testMailSettings } from '@/api/settings'
import { getProjectAccounts, getProjects } from '@/api/workReport'
import { loadKnowledgeJobSettings, persistKnowledgeJobSettings } from '@/utils/knowledgeJobs'
import SecretField from '@/components/SecretField.vue'
import './settings-ui.css'

const KEY_TABS = [
  { id: 'model-keys', label: '大模型', desc: '规划与校验用的 API Key' },
]
const activeTab = ref('model-keys')
const mailSaving = ref(false)
const mailTesting = ref(false)
const mailForm = reactive({
  host: '',
  port: 587,
  username: '',
  password: '',
  from_email: '',
  from_name: 'Mino',
  use_tls: true,
  configured: false,
  password_masked: '',
})
const route = useRoute()
const router = useRouter()
const loading = ref(false)
const savingId = ref('')
const savingUsage = ref(false)
const expandedProvider = ref('')
const defaultProvider = ref('openai')
const providers = ref([])
const forms = reactive({})
const usage = reactive({
  case_execution_enabled: false,
  case_execution_provider_id: '',
})
const jobSettings = reactive({
  capture_enabled: true,
  review_enabled: true,
})
const savingJobs = ref(false)
const accounts = ref([])
const selectedAccountId = ref('')

const selectedAccount = computed(() => accounts.value.find((a) => a.id === selectedAccountId.value) || null)
const accountLabel = (row) => {
  const ident = String(row?.email || row?.phone || row?.username || row?.name || '').trim()
  const env = String(row?.env || '').trim()
  const proj = String(row?.project_name || '').trim()
  return [ident || row?.id, env, proj].filter(Boolean).join(' · ')
}
const jobScope = () => {
  const acc = selectedAccount.value
  return {
    account_id: acc?.id || '',
    account_ident: acc ? (acc.email || acc.phone || acc.username || acc.name || '') : '',
    project_id: acc?.project_id || '',
  }
}

const loadAccounts = async () => {
  try {
    const res = await getProjects()
    const projects = Array.isArray(res) ? res : (res?.data || [])
    const rows = []
    for (const p of projects) {
      const pid = p?.id
      if (!pid) continue
      try {
        const acc = await getProjectAccounts(pid)
        for (const a of (acc?.data?.accounts || [])) {
          rows.push({ ...a, project_id: pid, project_name: p.name || '' })
        }
      } catch (_) { /* 单个项目号池读失败不挡其它 */ }
    }
    accounts.value = rows
    if (selectedAccountId.value && !rows.some((a) => a.id === selectedAccountId.value)) {
      selectedAccountId.value = ''
    }
    if (!selectedAccountId.value && rows.length) selectedAccountId.value = rows[0].id
  } catch (_) {
    accounts.value = []
  }
}

const configuredCount = computed(() => providers.value.filter((p) => p.configured).length)

const sortedProviders = computed(() => {
  const forCase = []
  const enabledOnly = []
  const rest = []
  for (const p of providers.value) {
    const form = forms[p.id]
    if (form?.case_execution_use) {
      forCase.push(p)
    } else if (form?.enabled) {
      enabledOnly.push(p)
    } else {
      rest.push(p)
    }
  }
  return [...forCase, ...enabledOnly, ...rest]
})

const caseExecutionProviderId = computed(() => {
  const hit = providers.value.find((p) => forms[p.id]?.case_execution_use === true)
  return hit?.id || usage.case_execution_provider_id || ''
})

const isDefaultProvider = (id) => caseExecutionProviderId.value === id

const apiTypeLabel = (provider) => {
  const t = String(provider?.api_type || '').toLowerCase()
  if (t === 'anthropic') return 'Messages API'
  if (t === 'gemini') return 'Gemini API'
  return 'Chat API'
}

const roundRatio = (value, fallback = 3) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(10, Math.max(1, Math.round(num * 10) / 10))
}

const syncForms = () => {
  for (const p of providers.value) {
    const options = p.model_options?.length ? [...p.model_options] : []
    const savedModel = (p.model || '').trim()
    if (savedModel && !options.includes(savedModel)) options.unshift(savedModel)
    forms[p.id] = {
      name: p.name || '',
      api_type: p.api_type || 'openai',
      api_key: '',
      base_url: p.base_url || '',
      model: savedModel,
      model_options: options.length ? options : [savedModel].filter(Boolean),
      enabled: p.configured ? p.enabled !== false : false,
      case_execution_use: p.configured && p.enabled !== false ? p.case_execution_use === true : false,
      plan_compress_ratio: roundRatio(p.plan_compress_ratio ?? 3, 3),
      web_compress_ratio: roundRatio(p.web_compress_ratio ?? 2, 2),
      clear_key: false,
      set_default: defaultProvider.value === p.id,
    }
  }
}

const applyDefaultFromCaseOrder = () => {
  const selected = caseExecutionProviderId.value
  usage.case_execution_provider_id = selected || ''
  for (const p of providers.value) {
    if (forms[p.id]) forms[p.id].set_default = p.id === selected
  }
}

const persistProviderToggle = async (provider, patch = {}) => {
  const form = forms[provider.id]
  if (!form) return
  savingId.value = provider.id
  try {
    await saveAIProvider(provider.id, {
      ...form,
      ...patch,
      api_key: '',
      clear_key: false,
    })
    applyDefaultFromCaseOrder()
    await saveAIUsage({ copilot_enabled: false, ...usage, mode: 'local_first' })
    ElMessage.success('已保存')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
    await load()
  } finally {
    savingId.value = ''
  }
}

const load = async () => {
  loading.value = true
  try {
    const res = await listAIProviders()
    const data = res?.data || {}
    providers.value = data.providers || []
    defaultProvider.value = data.default_provider || 'openai'
    Object.assign(usage, data.usage || {})
    if (!usage.case_execution_provider_id) {
      usage.case_execution_provider_id = defaultProvider.value
    }
    syncForms()
    applyDefaultFromCaseOrder()
    if (!expandedProvider.value && sortedProviders.value.length) {
      expandedProvider.value = sortedProviders.value[0].id
    }
    try {
      await loadAccounts()
      Object.assign(jobSettings, await loadKnowledgeJobSettings(jobScope()))
    } catch (_) { /* 知识任务开关读失败不挡模型列表 */ }
  } finally {
    loading.value = false
  }
}

const saveMail = async () => {
  mailSaving.value = true
  try {
    const res = await saveMailSettings({
      host: mailForm.host,
      port: Number(mailForm.port) || 587,
      username: mailForm.username,
      password: mailForm.password,
      from_email: mailForm.from_email,
      from_name: mailForm.from_name,
      use_tls: mailForm.use_tls,
    })
    mailForm.password = ''
    mailForm.configured = !!res?.data?.configured
    mailForm.password_masked = res?.data?.password_masked || ''
    ElMessage.success('发信配置已保存')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    mailSaving.value = false
  }
}

const testMail = async () => {
  mailTesting.value = true
  try {
    if (mailForm.password || mailForm.host) {
      await saveMailSettings({
        host: mailForm.host,
        port: Number(mailForm.port) || 587,
        username: mailForm.username,
        password: mailForm.password,
        from_email: mailForm.from_email,
        from_name: mailForm.from_name,
        use_tls: mailForm.use_tls,
      })
      mailForm.password = ''
    }
    const res = await testMailSettings(mailForm.from_email)
    ElMessage.success(`测试信已发到 ${res?.data?.to || mailForm.from_email}`)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '测试失败')
  } finally {
    mailTesting.value = false
  }
}

const saveUsage = async () => {
  applyDefaultFromCaseOrder()
  savingUsage.value = true
  try {
    await saveAIUsage({ copilot_enabled: false, ...usage, mode: 'local_first' })
    ElMessage.success('已生效')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
    await load()
  } finally {
    savingUsage.value = false
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
    Object.assign(jobSettings, await persistKnowledgeJobSettings({
      capture_enabled: jobSettings.capture_enabled,
      review_enabled: jobSettings.review_enabled,
    }, jobScope()))
    ElMessage.success('已生效')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
    await load()
  } finally {
    savingJobs.value = false
  }
}

const onAccountChange = async () => {
  try {
    Object.assign(jobSettings, await loadKnowledgeJobSettings(jobScope()))
  } catch (_) { /* 换账号读失败保持当前开关 */ }
}

const save = async (provider) => {
  const form = forms[provider.id]
  if (!form) return
  form.plan_compress_ratio = roundRatio(form.plan_compress_ratio, 3)
  form.web_compress_ratio = roundRatio(form.web_compress_ratio, 2)
  form.set_default = provider.id === caseExecutionProviderId.value
  savingId.value = provider.id
  try {
    await saveAIProvider(provider.id, form)
    ElMessage.success('已保存')
    await load()
  } finally {
    savingId.value = ''
  }
}

const onToggleEnabled = async (provider, enabled) => {
  const form = forms[provider.id]
  if (!form) return
  if (enabled && !provider.configured && !form.api_key?.trim()) {
    form.enabled = false
    ElMessage.warning('请先填写并保存 API Key 后再启用')
    return
  }
  form.enabled = enabled
  if (!enabled) form.case_execution_use = false
  await persistProviderToggle(provider, {
    enabled,
    case_execution_use: form.case_execution_use,
  })
}

const onToggleCaseExecution = async (provider, useForCase) => {
  const form = forms[provider.id]
  if (!form) return
  if (!form.enabled) {
    form.case_execution_use = false
    return
  }
  if (useForCase && !provider.configured && !form.api_key?.trim()) {
    form.case_execution_use = false
    ElMessage.warning('请先填写并保存 API Key')
    return
  }
  form.case_execution_use = useForCase
  if (useForCase) {
    for (const p of providers.value) {
      if (p.id !== provider.id && forms[p.id]) {
        forms[p.id].case_execution_use = false
      }
    }
  }
  await persistProviderToggle(provider, {
    enabled: true,
    case_execution_use: useForCase,
  })
}

const onRatioChange = (provider) => {
  const form = forms[provider.id]
  if (form) form.plan_compress_ratio = roundRatio(form.plan_compress_ratio, 3)
}

const onWebRatioChange = (provider) => {
  const form = forms[provider.id]
  if (form) form.web_compress_ratio = roundRatio(form.web_compress_ratio, 2)
}

const clearKey = async (provider) => {
  const form = forms[provider.id]
  if (!form) return
  form.api_key = ''
  form.clear_key = true
  form.enabled = false
  form.case_execution_use = false
  await save(provider)
}

const removeCustom = async (provider) => {
  savingId.value = provider.id
  try {
    await deleteAIProvider(provider.id)
    ElMessage.success('已删除')
    await load()
  } finally {
    savingId.value = ''
  }
}

const isPreset = (id) => [
  'openai',
  'anthropic',
  'umodelverse',
  'google',
  'deepseek',
  'qwen',
  'volcengine',
].includes(id)

const previewSizeHint = (ratio) => {
  const r = roundRatio(ratio, 3)
  if (r <= 1) return '1200×2608（不压缩）'
  return `${Math.round(1200 / r)}×${Math.round(2608 / r)}（比例 ${r}）`
}

const previewWebSizeHint = (ratio) => {
  const r = roundRatio(ratio, 2)
  if (r <= 1) return '1280×800（不压缩）'
  return `${Math.round(1280 / r)}×${Math.round(800 / r)}（比例 ${r}）`
}

onMounted(() => {
  syncTabFromRoute()
  load()
})

const syncTabFromRoute = () => {
  if (route.query.tab === 'robots') {
    router.replace({ name: 'SettingsPlugins' })
    return
  }
  activeTab.value = KEY_TABS.some((t) => t.id === route.query.tab) ? String(route.query.tab) : 'model-keys'
}

watch(() => route.query.tab, syncTabFromRoute)
</script>

<template>
  <div class="settings-panel keys-page" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">模型密钥</h2>
      </div>
      <div class="settings-summary-pill">{{ configuredCount }} 个模型已配置</div>
    </header>

    <div v-if="KEY_TABS.length > 1" class="settings-tabbar">
      <button
        v-for="item in KEY_TABS"
        :key="item.id"
        type="button"
        class="settings-tab"
        :class="{ active: activeTab === item.id }"
        @click="router.replace({ query: { ...route.query, tab: item.id } })"
      >
        <strong>{{ item.label }}</strong>
        <span>{{ item.desc }}</span>
      </button>
    </div>

    <section v-if="activeTab === 'mail'" class="keys-content">
      <section class="settings-card">
        <div class="mail-grid">
          <label>SMTP 主机<input v-model="mailForm.host" placeholder="smtp.163.com" /></label>
          <label>端口<input v-model.number="mailForm.port" type="number" placeholder="587" /></label>
          <label>账号<input v-model="mailForm.username" autocomplete="off" placeholder="发信账号" /></label>
          <label>
            密码 / 授权码
            <SecretField
              v-model="mailForm.password"
              :configured="mailForm.configured && !mailForm.password"
              placeholder="未设置"
            />
          </label>
          <label>发件人邮箱<input v-model="mailForm.from_email" placeholder="name@company.com" /></label>
          <label>发件人名称<input v-model="mailForm.from_name" placeholder="Mino" /></label>
        </div>
        <div class="mail-row">
          <span>STARTTLS</span>
          <el-switch v-model="mailForm.use_tls" />
        </div>
        <div class="mail-actions">
          <button type="button" class="settings-action-pill" :disabled="mailSaving" @click="saveMail">
            保存
            <span class="settings-action-arrow">→</span>
          </button>
          <el-button size="small" :loading="mailTesting" :disabled="!mailForm.host" @click="testMail">发一封测试</el-button>
        </div>
      </section>
    </section>

    <section v-else-if="activeTab === 'model-keys'" class="keys-content">
      <section class="settings-card exec-card">
        <div class="exec-copy">
          <span class="settings-kicker">用例执行</span>
          <h3>使用大模型能力</h3>
        </div>
        <el-switch
          v-model="usage.case_execution_enabled"
          :loading="savingUsage"
          @change="saveUsage"
        />
      </section>

      <section class="settings-card settings-job-card">
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
            style="width: 260px"
            @change="onAccountChange"
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
            :disabled="!selectedAccountId"
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
            :disabled="!selectedAccountId"
            @change="saveJobSettings"
          />
        </div>
      </section>

      <el-collapse v-model="expandedProvider" accordion class="provider-accordion">
        <el-collapse-item
          v-for="p in sortedProviders"
          :key="p.id"
          :name="p.id"
        >
          <template #title>
            <div class="accordion-head">
              <div class="accordion-main">
                <span class="provider-name">{{ p.name }}</span>
                <span class="provider-meta">
                  {{ p.configured ? `已配置 ${p.api_key_masked}` : '未配置 API Key' }}
                </span>
              </div>
              <div class="accordion-badges">
                <span v-if="isDefaultProvider(p.id)" class="badge badge-default">默认</span>
                <span
                  class="badge"
                  :title="`接口类型：${p.api_type || 'openai'}`"
                >{{ apiTypeLabel(p) }}</span>
              </div>
              <div class="accordion-switches">
                <div class="switch-item" title="模型可用">
                  <span class="switch-label">可用</span>
                  <el-switch
                    :model-value="forms[p.id]?.enabled === true"
                    :disabled="!p.configured && !forms[p.id]?.api_key"
                    :loading="savingId === p.id"
                    @click.stop
                    @change="(val) => onToggleEnabled(p, val)"
                  />
                </div>
                <div
                  v-if="forms[p.id]?.enabled"
                  class="switch-item switch-item-case"
                  title="用例执行模型（单选）"
                >
                  <span class="switch-label">用例</span>
                  <el-switch
                    :model-value="forms[p.id]?.case_execution_use === true"
                    :loading="savingId === p.id"
                    @click.stop
                    @change="(val) => onToggleCaseExecution(p, val)"
                  />
                </div>
              </div>
            </div>
          </template>

          <el-form v-if="forms[p.id]" label-position="top" class="provider-form">
            <el-form-item label="API Key">
              <SecretField
                v-model="forms[p.id].api_key"
                :configured="p.configured && !forms[p.id].api_key"
                placeholder="sk-... / API Key"
              />
            </el-form-item>
            <el-form-item label="Base URL">
              <el-input v-model="forms[p.id].base_url" />
            </el-form-item>
            <el-form-item :label="p.id === 'volcengine' ? '默认模型 / 接入点 ID' : '默认模型'">
              <el-select
                v-model="forms[p.id].model"
                :placeholder="p.id === 'volcengine' ? '选择或输入模型 ID / ep-...' : '选择平台模型'"
                filterable
                allow-create
                default-first-option
              >
                <el-option
                  v-for="model in forms[p.id].model_options"
                  :key="model"
                  :label="model"
                  :value="model"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="Plan 截图压缩比例">
              <div class="ratio-field">
                <el-input-number
                  v-model="forms[p.id].plan_compress_ratio"
                  :min="1"
                  :max="10"
                  :step="0.1"
                  :precision="1"
                  controls-position="right"
                  @change="onRatioChange(p)"
                />
                <p class="ratio-hint">
                  默认 3；1 表示不压缩。示例 1200×2608 → {{ previewSizeHint(forms[p.id].plan_compress_ratio) }}
                </p>
              </div>
            </el-form-item>
            <el-form-item label="Web 截图压缩比例">
              <div class="ratio-field">
                <el-input-number
                  v-model="forms[p.id].web_compress_ratio"
                  :min="1"
                  :max="10"
                  :step="0.1"
                  :precision="1"
                  controls-position="right"
                  @change="onWebRatioChange(p)"
                />
                <p class="ratio-hint">
                  默认 2；1 表示不压缩。示例 1280×800 → {{ previewWebSizeHint(forms[p.id].web_compress_ratio) }}
                </p>
              </div>
            </el-form-item>

            <div class="form-footer">
              <el-button
                type="primary"
                class="btn-save"
                :loading="savingId === p.id"
                @click="save(p)"
              >
                保存配置
              </el-button>
              <el-button
                v-if="p.configured"
                class="btn-clear"
                :loading="savingId === p.id"
                @click="clearKey(p)"
              >
                清除 Key
              </el-button>
              <el-button
                v-if="!isPreset(p.id)"
                class="btn-delete"
                :loading="savingId === p.id"
                @click="removeCustom(p)"
              >
                删除
              </el-button>
            </div>
          </el-form>
        </el-collapse-item>
      </el-collapse>
    </section>
  </div>
</template>

<style scoped>
.keys-page {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.keys-content {
  min-width: 0;
  max-width: 100%;
}

.exec-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.exec-copy h3 {
  margin: 6px 0 4px;
  color: var(--settings-text);
  font-size: 16px;
  font-weight: 700;
}

.exec-copy p {
  margin: 0;
  color: var(--settings-muted);
  font-size: 13px;
  line-height: 1.55;
  max-width: 640px;
}

.keys-tip {
  margin: 0 0 14px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--settings-soft);
  border: 1px solid var(--settings-border);
  color: var(--settings-muted);
  font-size: 12px;
  line-height: 1.55;
}

.provider-accordion {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--settings-border);
  border-radius: var(--settings-radius);
  overflow: hidden;
  background: var(--settings-card);
  box-shadow: var(--settings-shadow);
}

.provider-accordion :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 52px;
  line-height: 1.4;
  padding: 0 14px 0 16px;
  border-bottom: 1px solid var(--settings-border);
  background: var(--settings-card);
  font-size: 14px;
}

.provider-accordion :deep(.el-collapse-item__wrap) {
  border-bottom: 1px solid var(--settings-border);
}

.provider-accordion :deep(.el-collapse-item__content) {
  padding: 4px 16px 16px;
}

.provider-accordion :deep(.el-collapse-item__arrow) {
  margin-left: 8px;
  color: #94a3b8;
}

.accordion-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 10px 0;
}

.accordion-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.provider-name {
  color: var(--settings-text);
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.provider-meta {
  color: #94a3b8;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.accordion-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
}

.badge-default {
  background: #ecfdf5;
  color: #047857;
}

.accordion-switches {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 8px;
}

.switch-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.switch-item-case {
  padding-left: 12px;
  border-left: 1px solid var(--settings-border);
}

.switch-label {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.provider-form {
  padding-top: 8px;
}

.provider-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.provider-form :deep(.el-form-item__label) {
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  padding-bottom: 6px;
}

.provider-form :deep(.el-input),
.provider-form :deep(.el-select) {
  width: 100%;
}

.ratio-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.ratio-field :deep(.el-input-number) {
  width: 140px;
}

.ratio-hint {
  margin: 0;
  color: var(--settings-muted);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.form-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 14px;
  margin-top: 4px;
  border-top: 1px solid var(--settings-border);
}

.btn-save {
  min-width: 104px;
  border-radius: 8px;
}

.btn-clear {
  min-width: 96px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #64748b;
}

.btn-clear:hover {
  border-color: #fbbf24;
  background: #fffbeb;
  color: #b45309;
}

.btn-delete {
  margin-left: auto;
  border-radius: 8px;
  border: 1px solid #fecaca;
  background: #fff;
  color: #dc2626;
}

.btn-delete:hover {
  border-color: #f87171;
  background: #fef2f2;
  color: #b91c1c;
}

.mail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.mail-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.mail-grid input {
  height: 38px;
  border: 1px solid var(--settings-border, #e3e8f0);
  border-radius: 10px;
  padding: 0 10px;
}
.mail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0;
  color: #6b7280;
  font-size: 13px;
}
.mail-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

@media (max-width: 720px) {
  .mail-grid { grid-template-columns: 1fr; }
  .exec-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .accordion-badges {
    display: none;
  }

  .accordion-switches {
    gap: 8px;
  }

  .switch-label {
    display: none;
  }
}
</style>
