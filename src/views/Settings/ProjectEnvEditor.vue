<template>
  <div v-loading="loading" class="env-shell">
    <nav class="env-nav" aria-label="上线顺序">
      <div class="nav-head">上线顺序</div>
      <p class="nav-sub">从上到下依次上线</p>
      <template v-for="(p, idx) in environments" :key="p.key">
        <button
          type="button"
          class="env-nav-item"
          :class="{ active: activeTab === p.key }"
          @click="activeTab = p.key"
        >
          <span class="nav-step">{{ idx + 1 }}</span>
          <span class="nav-label">{{ p.label }}</span>
          <span class="nav-move">
            <button type="button" class="icon-btn" :disabled="idx === 0" @click.stop="moveEnv(idx, -1)">↑</button>
            <button type="button" class="icon-btn" :disabled="idx === environments.length - 1" @click.stop="moveEnv(idx, 1)">↓</button>
          </span>
        </button>
        <div v-if="idx < environments.length - 1" class="nav-seq" aria-hidden="true">↓</div>
      </template>
      <button type="button" class="nav-add" @click="addEnvOpen = true">+ 新增环境</button>
    </nav>

    <section class="env-panel">
      <div class="panel-toolbar">
        <el-input v-model="activeLabel" size="small" class="name-input" placeholder="环境名称" />
        <el-tooltip placement="bottom" :show-after="200">
          <template #content>
            <span v-if="activeUsage.length">流程：{{ activeUsageText }}</span>
            <span v-else>流程模板里还没有阶段挂到「{{ activeLabel || '当前环境' }}」</span>
          </template>
          <span class="step-chip">第 {{ activeIndex + 1 }} 步</span>
        </el-tooltip>
        <el-button
          link
          type="danger"
          size="small"
          :disabled="environments.length <= 1"
          @click="removeEnv"
        >删除环境</el-button>
      </div>

      <div class="channel-head">
        <span>应用与平台</span>
        <el-button size="small" @click="openAddChannel">新增应用</el-button>
      </div>
      <div class="field-list">
        <div v-for="ch in channels" :key="ch.id" class="field-row">
          <div class="field-label">
            <span class="field-name">{{ channelTitle(ch) }}</span>
            <span v-if="channelKindText(ch)" class="field-meta">{{ channelKindText(ch) }}</span>
            <button type="button" class="var-chip" :title="'复制 ' + wrapVar(ch)" @click="copyKey(ch)">{{ wrapVar(ch) }}</button>
          </div>
          <div class="field-control">
            <el-input
              :model-value="channelVal(ch)"
              :placeholder="ch.placeholder || channelTitle(ch)"
              clearable
              spellcheck="false"
              @update:model-value="(v) => setChannelVal(ch, v)"
            />
            <p v-if="inheritHint(ch)" class="field-note">{{ inheritHint(ch) }}</p>
          </div>
          <el-button
            link
            type="danger"
            size="small"
            :disabled="channels.length <= 1"
            @click="removeChannel(ch.id)"
          >删除</el-button>
        </div>
      </div>

      <div class="channel-head">
        <span>登录凭证</span>
      </div>
      <div class="field-list">
        <div class="field-row">
          <div class="field-label">
            <span class="field-name">一次性口令</span>
          </div>
          <div class="field-control">
            <el-select v-model="otpMode" style="width: 100%">
              <el-option label="自动（账号固定码 → 环境固定码 → 知识 → 解码平台 → 问人）" value="auto" />
              <el-option label="只用固定码" value="fixed" />
              <el-option label="解码平台" value="adapter" />
              <el-option label="每次问人" value="hitl" />
            </el-select>
            <el-input
              v-if="otpMode === 'fixed' || otpMode === 'auto'"
              v-model="otpFixed"
              placeholder="本环境默认固定码，可空；账号备注里的码优先"
              style="margin-top: 8px"
            />
            <template v-if="otpMode === 'adapter' || otpMode === 'auto'">
              <el-input
                v-model="otpAdapterUrl"
                placeholder="解码平台 URL，POST {slot, env, account}"
                style="margin-top: 8px"
              />
              <el-input
                v-model="otpAdapterHeader"
                type="password"
                show-password
                placeholder="可选 Authorization"
                style="margin-top: 8px"
              />
            </template>
          </div>
        </div>
        <div class="field-row">
          <div class="field-label">
            <span class="field-name">登录号</span>
          </div>
          <div class="field-control">
            <el-select v-model="phoneMode" style="width: 100%">
              <el-option label="自动（账号管理 → 知识 → 解码平台 → 问人）" value="auto" />
              <el-option label="只用账号管理" value="pool" />
              <el-option label="解码平台" value="adapter" />
              <el-option label="真实号 / 问人" value="hitl" />
            </el-select>
            <template v-if="phoneMode === 'adapter' || phoneMode === 'auto'">
              <el-input
                v-model="phoneAdapterUrl"
                placeholder="取号平台 URL"
                style="margin-top: 8px"
              />
              <el-input
                v-model="phoneAdapterHeader"
                type="password"
                show-password
                placeholder="可选 Authorization"
                style="margin-top: 8px"
              />
            </template>
          </div>
        </div>
      </div>

    </section>

    <el-dialog v-model="addEnvOpen" title="新增环境" width="400px" align-center append-to-body>
      <el-form label-position="top">
        <el-form-item label="环境名称" required>
          <el-input v-model="draftEnvLabel" placeholder="例如：灰度" @keyup.enter="confirmAddEnv" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addEnvOpen = false">取消</el-button>
        <el-button type="primary" @click="confirmAddEnv">添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addChannelOpen" title="新增应用" width="460px" align-center append-to-body>
      <el-form label-position="top">
        <el-form-item label="类型" required>
          <el-select v-model="draftKind" style="width: 100%">
            <el-option v-for="k in CHANNEL_KINDS" :key="k.id" :label="k.label" :value="k.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="draftKind === 'app'" label="端" required>
          <el-select v-model="draftPlatform" style="width: 100%">
            <el-option v-for="p in APP_PLATFORMS" :key="p.id" :label="p.label" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="sameKindExists ? '三方简称（必填）' : '三方简称'">
          <el-input v-model="draftAlias" :placeholder="sameKindExists ? '例如：CRM、OR、管理后台' : '主应用可空；三方必填，例如 CRM'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addChannelOpen = false">取消</el-button>
        <el-button type="primary" @click="confirmAddChannel">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getProjectEnv, updateProjectEnv } from '@/api/workReport'
import {
  APP_PLATFORMS,
  CHANNEL_KINDS,
  DEFAULT_CHANNELS,
  channelKindText,
  channelTitle,
  emptyEnvSecrets,
  emptyProfile,
  normalizeEnvDoc,
  normalizeEnvSecrets,
  resolveChannelValue,
  slugEnvKey,
} from '@/constants/envProfiles'
import { envUsage } from '@/utils/qaWorkflow'

const props = defineProps({
  projectId: { type: String, required: true },
  workflow: { type: Object, default: null },
})

const emit = defineEmits(['saved'])

const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
const loadedProjectName = ref('')
const activeTab = ref('test')
const environments = ref([])
const channels = ref([])
const profiles = reactive({})

const addEnvOpen = ref(false)
const draftEnvLabel = ref('')
const addChannelOpen = ref(false)
const draftKind = ref('web')
const draftPlatform = ref('android')
const draftAlias = ref('')

const activeIndex = computed(() => Math.max(0, environments.value.findIndex((e) => e.key === activeTab.value)))
const activeLabel = computed({
  get: () => environments.value.find((e) => e.key === activeTab.value)?.label || '',
  set: (v) => {
    const hit = environments.value.find((e) => e.key === activeTab.value)
    if (hit) hit.label = String(v || '').trim() || hit.key
    dirty.value = true
  },
})
const sameKindExists = computed(() => channels.value.some((c) => {
  if (c.kind !== draftKind.value) return false
  if (draftKind.value !== 'app') return true
  return c.platform === draftPlatform.value
}))
const activeUsage = computed(() => envUsage(props.workflow, activeTab.value))
const activeUsageText = computed(() => activeUsage.value.map((u) => `${u.trackLabel}「${u.stepLabel}」`).join('、'))

const wrapVar = (ch) => `{{app.${ch.id}.${ch.field || 'value'}}}`
const envOrder = computed(() => environments.value.map((e) => e.key))

const ensureProfile = (key) => {
  if (!profiles[key]) profiles[key] = emptyProfile(channels.value)
  for (const ch of channels.value) {
    if (!profiles[key][ch.id]) profiles[key][ch.id] = { [ch.field]: '' }
    if (profiles[key][ch.id][ch.field] == null) profiles[key][ch.id][ch.field] = ''
  }
}

const localChannelVal = (ch, key = activeTab.value) => {
  if (!key) return ''
  ensureProfile(key)
  return String(profiles[key]?.[ch.id]?.[ch.field] || '').trim()
}

const inheritHit = (ch) => resolveChannelValue(profiles, envOrder.value, activeTab.value, ch.id, ch.field)

const channelVal = (ch) => inheritHit(ch).value || localChannelVal(ch)

const setChannelVal = (ch, v) => {
  ensureProfile(activeTab.value)
  profiles[activeTab.value][ch.id][ch.field] = v
}

const inheritHint = (ch) => {
  const hit = inheritHit(ch)
  if (!hit.inherited || !hit.value) return ''
  const name = environments.value.find((e) => e.key === hit.fromKey)?.label || hit.fromKey
  if (hit.fromChannel && hit.fromChannel !== ch.id) {
    return `未单独填写，沿用${hit.fromChannel === 'android' ? '安卓包名' : 'iOS Bundle'}`
  }
  return `未单独填写，与「${name}」相同`
}

const activeEnv = computed(() => environments.value.find((e) => e.key === activeTab.value) || null)
const ensureSecrets = (env) => {
  if (!env) return emptyEnvSecrets()
  if (!env.secrets?.otp || !env.secrets?.phone) {
    env.secrets = normalizeEnvSecrets(env.secrets)
  }
  return env.secrets
}
const otpMode = computed({
  get: () => ensureSecrets(activeEnv.value).otp.mode,
  set: (v) => { ensureSecrets(activeEnv.value).otp.mode = v; dirty.value = true },
})
const otpFixed = computed({
  get: () => ensureSecrets(activeEnv.value).otp.fixed,
  set: (v) => { ensureSecrets(activeEnv.value).otp.fixed = v; dirty.value = true },
})
const otpAdapterUrl = computed({
  get: () => ensureSecrets(activeEnv.value).otp.adapter_url,
  set: (v) => { ensureSecrets(activeEnv.value).otp.adapter_url = v; dirty.value = true },
})
const otpAdapterHeader = computed({
  get: () => ensureSecrets(activeEnv.value).otp.adapter_header,
  set: (v) => { ensureSecrets(activeEnv.value).otp.adapter_header = v; dirty.value = true },
})
const phoneMode = computed({
  get: () => ensureSecrets(activeEnv.value).phone.mode,
  set: (v) => { ensureSecrets(activeEnv.value).phone.mode = v; dirty.value = true },
})
const phoneAdapterUrl = computed({
  get: () => ensureSecrets(activeEnv.value).phone.adapter_url,
  set: (v) => { ensureSecrets(activeEnv.value).phone.adapter_url = v; dirty.value = true },
})
const phoneAdapterHeader = computed({
  get: () => ensureSecrets(activeEnv.value).phone.adapter_header,
  set: (v) => { ensureSecrets(activeEnv.value).phone.adapter_header = v; dirty.value = true },
})

const profileFilled = (key) => {
  const snap = profiles[key]
  if (!snap) return false
  return channels.value.some((ch) => String(snap[ch.id]?.[ch.field] || '').trim())
}

let hydrating = false

const applyDoc = (raw) => {
  hydrating = true
  const doc = normalizeEnvDoc(raw)
  const byKey = new Map(doc.environments.map((e) => [e.key, { ...e }]))
  const ordered = []
  for (const key of doc.pipeline) {
    const hit = byKey.get(key)
    if (hit && !ordered.some((e) => e.key === hit.key)) ordered.push(hit)
  }
  for (const env of doc.environments) {
    if (!ordered.some((e) => e.key === env.key)) ordered.push({ ...env })
  }
  environments.value = ordered.length ? ordered : doc.environments.map((e) => ({ ...e }))
  channels.value = doc.channels.map((c) => ({ ...c }))
  Object.keys(profiles).forEach((k) => delete profiles[k])
  for (const env of environments.value) {
    profiles[env.key] = emptyProfile(doc.channels)
    const snap = doc.profiles[env.key] || {}
    for (const ch of doc.channels) {
      profiles[env.key][ch.id][ch.field] = snap[ch.id]?.[ch.field] || ''
    }
  }
  activeTab.value = environments.value[0]?.key || ''
  dirty.value = false
  nextTick(() => {
    hydrating = false
    dirty.value = false
  })
}

const buildPayload = () => {
  const keys = environments.value.map((e) => e.key)
  return {
    default_profile: keys[0] || 'test',
    environments: environments.value.map((e) => ({
      key: e.key,
      label: e.label,
      secrets: normalizeEnvSecrets(e.secrets),
    })),
    channels: channels.value.map((c) => ({
      id: c.id,
      kind: c.kind,
      platform: c.platform,
      alias: c.alias || '',
      third_party: Boolean(c.third_party || c.alias),
      label: channelTitle(c),
      field: c.field,
      placeholder: c.placeholder || '',
    })),
    pipeline: keys,
    profiles: Object.fromEntries(environments.value.map((e) => {
      const snap = {}
      for (const ch of channels.value) {
        snap[ch.id] = { [ch.field]: String(profiles[e.key]?.[ch.id]?.[ch.field] || '').trim() }
      }
      return [e.key, snap]
    })),
  }
}

const loadProject = async () => {
  if (!props.projectId) return
  loading.value = true
  try {
    const res = await getProjectEnv(props.projectId)
    const data = res?.data || res || {}
    loadedProjectName.value = data.project_name || ''
    applyDoc(data.env || data)
  } catch {
    ElMessage.error('加载项目环境失败')
  } finally {
    loading.value = false
  }
}

const save = async ({ quiet = false } = {}) => {
  if (!props.projectId) return false
  const payload = buildPayload()
  if (payload.environments.length < 1) {
    ElMessage.warning('至少保留一个环境')
    return false
  }
  saving.value = true
  try {
    await updateProjectEnv(props.projectId, payload)
    if (!quiet) ElMessage.success('环境配置已保存')
    dirty.value = false
    emit('saved', payload)
    return true
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
    return false
  } finally {
    saving.value = false
  }
}

const moveEnv = (idx, dir) => {
  const j = idx + dir
  if (j < 0 || j >= environments.value.length) return
  const next = [...environments.value]
  const [row] = next.splice(idx, 1)
  next.splice(j, 0, row)
  environments.value = next
  dirty.value = true
}

const confirmAddEnv = () => {
  const label = String(draftEnvLabel.value || '').trim()
  if (!label) {
    ElMessage.warning('请填写环境名称')
    return
  }
  let key = slugEnvKey(label, 'env')
  if (environments.value.some((e) => e.key === key)) key = `${key}${environments.value.length + 1}`
  environments.value = [...environments.value, { key, label, secrets: emptyEnvSecrets() }]
  profiles[key] = emptyProfile(channels.value)
  activeTab.value = key
  draftEnvLabel.value = ''
  addEnvOpen.value = false
  dirty.value = true
}

const removeEnv = async () => {
  if (environments.value.length <= 1) return
  const cur = environments.value.find((e) => e.key === activeTab.value)
  try {
    await ElMessageBox.confirm(`删除环境「${cur?.label || activeTab.value}」？各应用配置会一起丢掉。`, '删除环境', { type: 'warning' })
  } catch { return }
  const key = activeTab.value
  const idx = environments.value.findIndex((e) => e.key === key)
  environments.value = environments.value.filter((e) => e.key !== key)
  delete profiles[key]
  const fallback = environments.value[Math.min(Math.max(idx, 0), environments.value.length - 1)]
  activeTab.value = fallback?.key || ''
  dirty.value = true
}

const openAddChannel = () => {
  draftKind.value = 'web'
  draftPlatform.value = 'android'
  draftAlias.value = ''
  addChannelOpen.value = true
}

const confirmAddChannel = () => {
  const kind = draftKind.value
  const platform = kind === 'app' ? draftPlatform.value : kind
  const alias = String(draftAlias.value || '').trim()
  if (sameKindExists.value && !alias) {
    ElMessage.warning('同类型已有一条，请填写三方平台简称，例如 CRM、管理后台')
    return
  }
  const preset = DEFAULT_CHANNELS.find((c) => c.id === platform) || DEFAULT_CHANNELS.find((c) => c.kind === kind)
  const aliasSlug = slugEnvKey(alias, '')
  let id = aliasSlug ? `${platform}-${aliasSlug}` : platform
  if (channels.value.some((c) => c.id === id)) id = `${id}${channels.value.length + 1}`
  const ch = {
    id,
    kind,
    platform,
    alias,
    third_party: Boolean(alias),
    label: alias || preset?.label || kind,
    field: preset?.field || 'value',
    placeholder: preset?.placeholder || '',
  }
  channels.value = [...channels.value, ch]
  for (const env of environments.value) {
    ensureProfile(env.key)
    profiles[env.key][ch.id] = { [ch.field]: '' }
  }
  addChannelOpen.value = false
  dirty.value = true
}

const removeChannel = async (id) => {
  if (channels.value.length <= 1) return
  const ch = channels.value.find((c) => c.id === id)
  try {
    await ElMessageBox.confirm(`删除「${channelTitle(ch) || id}」？所有环境下的这项配置都会丢掉。`, '删除应用', { type: 'warning' })
  } catch { return }
  channels.value = channels.value.filter((c) => c.id !== id)
  for (const env of environments.value) {
    if (profiles[env.key]) delete profiles[env.key][id]
  }
  dirty.value = true
}

const copyKey = async (ch) => {
  const text = wrapVar(ch)
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.info(text)
  }
}

watch(() => props.projectId, loadProject, { immediate: true })
watch(profiles, () => { if (!hydrating) dirty.value = true }, { deep: true })
watch(environments, () => { if (!hydrating) dirty.value = true }, { deep: true })

defineExpose({ save, saving, dirty, loadedProjectName, loadProject, profileFilled })
</script>

<style scoped>
.env-shell {
  display: flex;
  gap: 0;
  min-height: 320px;
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fafafa;
  box-sizing: border-box;
}
.env-nav {
  width: 188px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 8px;
  background: #f3f4f6;
  border-right: 1px solid #e5e7eb;
}
.nav-head {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  padding: 4px 12px 0;
}
.nav-sub {
  margin: 2px 12px 10px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
}
.env-nav-item {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  color: #4b5563;
  box-sizing: border-box;
}
.env-nav-item:hover,
.env-nav-item.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.nav-step {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.env-nav-item.active .nav-step {
  background: #4f46e5;
  color: #fff;
}
.nav-label { flex: 1; min-width: 0; }
.nav-seq {
  text-align: center;
  color: #818cf8;
  font-size: 12px;
  line-height: 1;
  padding: 2px 0;
}
.nav-move { display: flex; gap: 2px; }
.icon-btn {
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  padding: 0 2px;
  font-size: 11px;
  line-height: 1;
}
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.nav-add {
  margin-top: 6px;
  border: 1px dashed #d1d5db;
  background: transparent;
  border-radius: 8px;
  padding: 8px 12px;
  color: #4f46e5;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.nav-add:hover { background: #eef2ff; }
.env-panel {
  flex: 1;
  min-width: 0;
  padding: 16px 20px 20px;
  background: #fff;
}
.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.name-input { width: 160px; }
.step-chip {
  font-size: 12px;
  font-weight: 650;
  color: #4f46e5;
  background: #eef2ff;
  padding: 2px 8px;
  border-radius: 999px;
  cursor: help;
}
.channel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
}
.field-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field-control { min-width: 0; }
.field-warn {
  margin: 6px 0 0;
  font-size: 12px;
  color: #b45309;
}
.field-note {
  margin: 6px 0 0;
  font-size: 12px;
  color: #6b7280;
}
.field-row {
  display: grid;
  grid-template-columns: minmax(148px, 200px) minmax(0, 1fr) auto;
  gap: 12px 16px;
  align-items: center;
}
.field-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}
.field-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--mo-text);
}
.field-meta {
  font-size: 11px;
  color: var(--mo-muted);
}
.var-chip {
  border: none;
  background: #f3f4f6;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: #6b7280;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.var-chip:hover { background: #eef2ff; color: #4f46e5; }
.field-row :deep(.el-input) { width: 100%; }
.panel-hint {
  margin-top: 18px;
  margin-bottom: 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.6;
}
.panel-hint.tight { margin-top: 6px; margin-bottom: 10px; }
</style>
