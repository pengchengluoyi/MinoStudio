<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getAppAutomationConfig,
  updateAppAutomationConfig,
  syncAppFigma,
  applyFigmaAppLogic,
} from '@/api/appAutomation'
import { getDeviceList } from '@/api/device'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { initWebSocket } from '@/api/mWebSocket'
import { envSummaries, filledEnvKeys, pipelineKeys } from '@/constants/envProfiles'
import { getProjectEnv } from '@/api/workReport'
import ProjectEnvEditor from './ProjectEnvEditor.vue'
import QaWorkflowEditor from '@/views/Testing/QaWorkflowEditor.vue'
import { useQaProcess } from '@/composables/useQaProcess'
import { getFigmaSettings } from '@/api/settings'
import './settings-ui.css'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  embedAppId: { type: String, default: '' },
  embedAppName: { type: String, default: '' },
  embedProjectId: { type: String, default: '' },
  embedProjectName: { type: String, default: '' },
  embedSection: { type: String, default: 'env' },
  hideSections: { type: Array, default: () => [] },
  hideNav: { type: Boolean, default: false },
})
const emit = defineEmits(['update:embedSection', 'go-tab'])

const route = useRoute()
const router = useRouter()
const appId = computed(() => (props.embedded ? props.embedAppId : route.params.appId))
const sectionRaw = computed(() => {
  const raw = props.embedded ? (props.embedSection || 'env') : (route.params.section || 'env')
  if (raw === 'icons' || raw === 'skills') return 'env'
  if (raw === 'flow') return 'flow-req'
  return raw
})
const section = computed(() => {
  const raw = sectionRaw.value
  if (raw === 'flow-req' || raw === 'flow-rel') return 'flow'
  return raw
})
const flowTrack = computed(() => (sectionRaw.value === 'flow-rel' ? 'rel' : 'req'))
const appName = computed(() => (props.embedded ? props.embedAppName : route.query.appName) || '应用')
const projectName = computed(() => (props.embedded ? props.embedProjectName : route.query.projectName) || '')
const projectId = computed(() => String((props.embedded ? props.embedProjectId : route.query.projectId) || ''))
const envEditorRef = ref(null)

const tabs = computed(() => {
  const hidden = props.hideSections || []
  if (props.embedded) {
    return [
      { key: 'env', label: '环境配置', desc: '上线顺序 · 应用与平台 · 登录凭证' },
      { key: 'flow', label: '阶段模板', desc: '阶段对齐已配环境' },
      { key: 'workflow', label: '角色编排', desc: '角色 Prompt 编排' },
      { key: 'figma', label: '设计稿', desc: '同步 Figma' },
    ].filter((t) => !hidden.includes(t.key))
  }
  return [
    { key: 'env', label: '环境配置', desc: '上线顺序 · 应用与平台 · 登录凭证' },
    { key: 'flow', label: '阶段模板', desc: '阶段对齐已配环境' },
    { key: 'workflow', label: '角色编排', desc: '角色 Prompt 编排' },
    { key: 'figma', label: '设计稿' },
  ].filter((t) => !hidden.includes(t.key))
})

const figmaForm = ref({ file_url: '', file_key: '', last_sync_at: '', pages_summary: [], logic_applied_at: '' })
const figmaTokenConfigured = ref(false)

const loading = ref(false)
const saving = ref(false)
const figmaApplying = ref(false)
const figmaSyncing = ref(false)
const selectedDeviceSn = ref('*')
const devices = ref([])
const skillsDefault = ref({ pre: [], post: [] })
const skillsDevices = ref({})
const envSnap = ref({ summaries: [], filledKeys: [], pipeline: [] })

const appIdRef = computed(() => appId.value)
const {
  workflow,
  requirements,
  releases,
  saving: flowSaving,
  load: loadFlow,
  saveWorkflow,
} = useQaProcess(appIdRef)

const parseFigmaFileKeyFromUrl = (url = '') => {
  const m = String(url || '').match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/i)
  return m ? m[1] : ''
}

const normalizeFigmaForm = () => {
  const url = (figmaForm.value.file_url || '').trim()
  let key = (figmaForm.value.file_key || '').trim()
  if (key.toLowerCase().startsWith('figd_')) {
    key = ''
  }
  const fromUrl = parseFigmaFileKeyFromUrl(url)
  if (fromUrl) {
    figmaForm.value.file_key = fromUrl
  } else if (key.toLowerCase().startsWith('figd_')) {
    figmaForm.value.file_key = ''
  }
}

const deviceSkillBlock = computed(() => {
  if (selectedDeviceSn.value === '*') return skillsDefault.value
  if (!skillsDevices.value[selectedDeviceSn.value]) {
    skillsDevices.value[selectedDeviceSn.value] = { pre: [], post: [] }
  }
  return skillsDevices.value[selectedDeviceSn.value]
})

const preLines = computed({
  get: () => (deviceSkillBlock.value.pre || []).join('\n'),
  set: (v) => {
    deviceSkillBlock.value.pre = String(v || '').split('\n').map((s) => s.trim()).filter(Boolean)
  },
})
const postLines = computed({
  get: () => (deviceSkillBlock.value.post || []).join('\n'),
  set: (v) => {
    deviceSkillBlock.value.post = String(v || '').split('\n').map((s) => s.trim()).filter(Boolean)
  },
})

const switchTab = (key) => {
  if (props.embedded) {
    emit('update:embedSection', key)
    return
  }
  router.replace({
    name: 'SettingsAppConfig',
    params: { appId: appId.value, section: key },
    query: route.query,
  })
}

const normalizeDevices = (res) => {
  const list = Array.isArray(res) ? res : res?.data || []
  return list.filter((d) => d.status === 'online')
}

const load = async () => {
  loading.value = true
  try {
    const res = await getAppAutomationConfig(appId.value)
    const data = res?.data || {}
    const auto = data.automation || {}
    skillsDefault.value = { pre: [...(auto.skills?.default?.pre || [])], post: [...(auto.skills?.default?.post || [])] }
    skillsDevices.value = { ...(auto.skills?.devices || {}) }
    const figma = data.automation?.figma || {}
    figmaForm.value = {
      file_url: figma.file_url || '',
      file_key: figma.file_key || '',
      last_sync_at: figma.last_sync_at || '',
      pages_summary: figma.pages_summary || [],
      logic_applied_at: figma.logic_applied_at || '',
    }
    normalizeFigmaForm()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadDevices = async () => {
  try {
    let list = []
    try {
      list = normalizeDevices(await wsGetDeviceList())
    } catch {
      initWebSocket()
      list = normalizeDevices(await getDeviceList())
    }
    devices.value = list
  } catch {
    devices.value = []
  }
}

const loadEnvSnap = async () => {
  if (!projectId.value) {
    envSnap.value = { summaries: [], filledKeys: [], pipeline: [] }
    return
  }
  try {
    const res = await getProjectEnv(projectId.value)
    const data = res?.data || res || {}
    const env = data.env || data
    envSnap.value = {
      summaries: envSummaries(env),
      filledKeys: filledEnvKeys(env),
      pipeline: pipelineKeys(env),
    }
  } catch {
    envSnap.value = { summaries: [], filledKeys: [], pipeline: [] }
  }
}

const onGoProcess = ({ track } = {}) => {
  if (props.embedded) {
    emit('go-tab', 'process')
    return
  }
  router.push({
    name: 'TestingApp',
    params: { appId: appId.value },
    query: { ...route.query, tab: 'process', board: track === 'rel' ? 'rel' : 'req' },
  })
}

const onSaveWorkflow = async (next) => {
  const moved = await saveWorkflow(next)
  ElMessage.success(moved ? `流程模板已保存。${moved} 张单据已对到还在的阶段。` : '流程模板已保存')
}

const saveFigma = async () => {
  saving.value = true
  try {
    await updateAppAutomationConfig(appId.value, { figma: figmaForm.value })
    ElMessage.success('设计稿配置已保存')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

const openFigmaPlugin = () => {
  router.push({ name: 'SettingsPluginDetail', params: { pluginId: 'figma' } })
}

const syncFigmaPreview = async () => {
  if (!figmaForm.value.file_url?.trim()) return ElMessage.warning('请填写 Figma 文件链接')
  if (!figmaTokenConfigured.value) {
    ElMessage.warning('请先在「设置 → 插件 → Figma」中配置 Token')
    return
  }
  normalizeFigmaForm()
  figmaSyncing.value = true
  try {
    const res = await syncAppFigma(appId.value, {
      file_url: figmaForm.value.file_url,
      file_key: figmaForm.value.file_key,
    })
    const figma = res?.data?.figma || {}
    figmaForm.value = {
      file_url: figma.file_url || figmaForm.value.file_url,
      file_key: figma.file_key || figmaForm.value.file_key,
      last_sync_at: figma.last_sync_at || '',
      pages_summary: figma.pages_summary || [],
    }
    const pages = res?.data?.page_count ?? 0
    ElMessage.success(`设计稿已同步（${pages} 个页面）`)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '同步失败')
  } finally {
    figmaSyncing.value = false
  }
}

const applyFigmaLogic = async () => {
  if (!figmaForm.value.file_url?.trim()) return ElMessage.warning('请填写 Figma 文件链接')
  if (!figmaTokenConfigured.value) {
    ElMessage.warning('请先在「设置 → 插件 → Figma」配置 Token（普通账号即可，无需 Developer 应用）')
    return
  }
  normalizeFigmaForm()
  if (!figmaForm.value.file_key) {
    return ElMessage.warning('无法从链接解析 File Key，请检查 Figma 设计稿 URL')
  }
  figmaApplying.value = true
  try {
    const res = await applyFigmaAppLogic(appId.value, {
      file_url: figmaForm.value.file_url,
      file_key: figmaForm.value.file_key,
      write_knowledge: true,
      write_graph: true,
    })
    const data = res?.data || {}
    const figma = data.figma || {}
    figmaForm.value = {
      file_url: figma.file_url || figmaForm.value.file_url,
      file_key: figma.file_key || figmaForm.value.file_key,
      last_sync_at: figma.last_sync_at || '',
      pages_summary: figma.pages_summary || [],
      logic_applied_at: figma.logic_applied_at || '',
    }
    ElMessage.success(
      `已从 Figma 学习：${data.pages || 0} 页 → 图谱 ${data.nodes_upserted || 0} 节点、知识库 ${data.knowledge_written || 0} 条`
    )
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '学习失败')
  } finally {
    figmaApplying.value = false
  }
}

const saveEnvTab = async () => {
  if (!projectId.value || !envEditorRef.value) return
  saving.value = true
  try {
    const ok = await envEditorRef.value.save({ quiet: true })
    if (!ok) return
    ElMessage.success('环境配置已保存')
    await loadEnvSnap()
  } finally {
    saving.value = false
  }
}

watch(section, (s) => {
  if (s === 'flow' || s === 'workflow') {
    loadFlow()
    loadEnvSnap()
  }
})

watch(() => appId.value, async () => {
  await Promise.all([load(), loadFlow(), loadEnvSnap()])
})

onMounted(async () => {
  try {
    const res = await getFigmaSettings()
    figmaTokenConfigured.value = !!res?.data?.configured
  } catch {
    figmaTokenConfigured.value = false
  }
  await Promise.all([load(), loadDevices(), loadFlow(), loadEnvSnap()])
  const raw = props.embedded ? props.embedSection : route.params.section
  if (raw === 'icons') switchTab('env')
  if (raw === 'logic' || raw === 'regression') {
    const tab = raw === 'logic' ? 'knowledge' : 'tasks'
    if (props.embedded) emit('go-tab', tab)
    else {
      router.replace({
        name: 'TestingApp',
        params: { appId: appId.value },
        query: { appName: appName.value, projectName: projectName.value, projectId: projectId.value, tab },
      })
    }
  }
})
</script>

<template>
  <div
    class="settings-panel app-config-panel"
    :class="{
      'wide-panel': true,
      embedded: embedded,
    }"
    v-loading="loading"
  >
    <div v-if="embedded && !hideNav" class="settings-tabbar embed-tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="settings-tab"
        :class="{ active: section === t.key }"
        @click="switchTab(t.key)"
      >
        <strong>{{ t.label }}</strong>
        <span v-if="t.desc">{{ t.desc }}</span>
      </button>
    </div>
    <div v-show="section === 'env'" class="tab-body">
      <div class="settings-toolbar env-sticky" :class="{ dirty: envEditorRef?.dirty }">
        <span v-if="envEditorRef?.dirty" class="unsaved">有未保存的更改</span>
        <span v-else class="saved-hint">与服务器同步</span>
        <el-button type="primary" size="small" :loading="saving || envEditorRef?.saving" @click="saveEnvTab">保存</el-button>
      </div>
      <el-card v-if="projectId" shadow="never" class="card env-config-card">
        <h3>环境配置</h3>
        <ProjectEnvEditor ref="envEditorRef" :project-id="projectId" :workflow="workflow" @saved="() => { loadEnvSnap() }" />
      </el-card>
      <el-alert v-else type="info" show-icon :closable="false" class="env-missing">
        未关联项目
      </el-alert>
    </div>

    <div v-if="section === 'flow'" class="tab-body flow-tab">
      <QaWorkflowEditor
        mode="tracks"
        :track="hideNav ? flowTrack : ''"
        :hide-nav="hideNav"
        :workflow="workflow"
        :requirements="requirements"
        :releases="releases"
        :saving="flowSaving"
        :env-summaries="envSnap.summaries"
        @save="onSaveWorkflow"
        @go-env="switchTab('env')"
        @go-process="onGoProcess"
      />
    </div>

    <div v-else-if="section === 'workflow'" class="tab-body flow-tab">
      <QaWorkflowEditor
        mode="chains"
        :workflow="workflow"
        :requirements="requirements"
        :releases="releases"
        :saving="flowSaving"
        :env-summaries="envSnap.summaries"
        @save="onSaveWorkflow"
        @go-env="switchTab('env')"
        @go-process="onGoProcess"
      />
    </div>

    <div v-show="section === 'figma'" class="tab-body">
      <el-card shadow="never" class="card">
        <h3>Figma 设计稿 · 应用逻辑学习</h3>
        <p class="hint">
          <el-tag :type="figmaTokenConfigured ? 'success' : 'warning'" size="small">
            {{ figmaTokenConfigured ? 'Token 已配置' : 'Token 未配置' }}
          </el-tag>
        </p>
        <el-form label-width="120px" class="config-form">
          <el-form-item label="文件链接">
            <el-input
              v-model="figmaForm.file_url"
              placeholder="https://www.figma.com/design/..."
              @blur="normalizeFigmaForm"
            />
          </el-form-item>
          <el-form-item label="File Key">
            <el-input
              v-model="figmaForm.file_key"
              placeholder="留空即可，从链接自动解析（勿填 figd_ Token）"
              readonly
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :loading="figmaApplying"
              :disabled="figmaSyncing"
              @click="applyFigmaLogic"
            >
              从 Figma 学习应用逻辑
            </el-button>
            <el-button
              plain
              :loading="figmaSyncing"
              :disabled="figmaApplying"
              @click="syncFigmaPreview"
            >
              仅同步预览
            </el-button>
            <el-button plain @click="saveFigma">保存链接</el-button>
          </el-form-item>
        </el-form>
        <ul v-if="figmaForm.pages_summary?.length" class="figma-summary">
          <li v-for="(line, i) in figmaForm.pages_summary" :key="i">{{ line }}</li>
        </ul>
        <p v-if="figmaForm.logic_applied_at" class="hint">逻辑已写入：{{ figmaForm.logic_applied_at }}</p>
        <p v-else-if="figmaForm.last_sync_at" class="hint">上次同步：{{ figmaForm.last_sync_at }}</p>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.app-config-panel { padding-top: 0; width: 100%; box-sizing: border-box; }
.app-config-panel.embedded {
  padding: 0;
  max-width: none;
  width: 100%;
  height: 100%;
  overflow: auto;
  background: transparent;
}
.embed-tabs {
  margin-bottom: 12px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: #fff;
  width: 100%;
}
.config-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }
.tab-body { margin-top: 8px; width: 100%; }
.env-sticky {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin: -4px 0 12px;
  padding: 8px 0;
  background: #fff;
}
.env-sticky.dirty { background: #fffbeb; margin-left: -8px; margin-right: -8px; padding: 8px 12px; border-radius: 10px; }
.unsaved { font-size: 12px; font-weight: 650; color: #b45309; margin-right: auto; }
.saved-hint { font-size: 12px; color: #94a3b8; margin-right: auto; }
.env-config-card { margin-top: 0; }
.env-missing { margin-top: 12px; }
.card { border: 1px solid #e5e7eb; margin-bottom: 16px; width: 100%; box-sizing: border-box; }
.config-form {
  width: 100%;
  max-width: none;
}
.config-form :deep(.el-form-item__content) {
  flex: 1;
  min-width: 0;
}
.config-select {
  width: min(280px, 100%);
}
.env-radios {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  width: 100%;
}
.env-radios :deep(.el-radio) {
  margin-right: 0;
  height: auto;
  white-space: normal;
  align-items: flex-start;
}
.logic-tab .logic-graph-card { margin-bottom: 20px; }
.flow-tab { min-height: 0; }
.card h3 { margin: 0 0 12px; font-size: 15px; }
.hint { color: #6b7280; font-size: 12px; }
.hint-pill { margin-top: 0; margin-left: 8px; vertical-align: middle; }
.mono { font-family: ui-monospace, monospace; font-size: 13px; }
.figma-summary { margin: 12px 0 0; padding-left: 20px; font-size: 12px; color: #4b5563; }
</style>
