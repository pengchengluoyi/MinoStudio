<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import {
  createScoutInstallToken,
  detectClientPlatform,
  getScoutLatestRelease,
  listRuntimeNodes,
  parseRuntimeNodes,
} from '@/api/runtime'
import { nexusOrigin, scoutManifestUrl } from '@/utils/config'
import { scoutReleasesPageUrl } from '@/utils/scoutRelease'
import { openExternalUrl } from '@/utils/openExternal'
import './settings-ui.css'

const installing = ref(false)
const checking = ref(false)
const localScout = ref({
  installed: false, appInstalled: false, running: false, pid: null,
  configPath: '', version: null, nexusUrl: null, scoutId: null, studioId: null,
})
const starting = ref(false)
const stopping = ref(false)
const release = ref(null)
const releaseMissing = ref(false)
const releaseError = ref('')
const nodes = ref([])
const progress = ref(null)
const step = ref('')

const platform = ref(detectClientPlatform())
const origin = computed(() => nexusOrigin())
const manifestUrl = computed(() => scoutManifestUrl())
const releasesPage = computed(() => scoutReleasesPageUrl(manifestUrl.value))
const openReleases = (e) => {
  e.preventDefault()
  if (releasesPage.value) openExternalUrl(releasesPage.value)
}
const nodeCount = computed(() => nodes.value.length)
const thisHostOnline = computed(() => nodes.value.some((n) => n.status === 'online' || n.online === true))

const statusLine = computed(() => {
  if (thisHostOnline.value) return '已连接'
  if (localScout.value.running) return '运行中'
  if (localScout.value.installed || localScout.value.appInstalled) return '已安装'
  return '未安装'
})

const apiUnavailable = (e) => {
  const status = e?.response?.status
  return status === 404 || status === 501 || status === 502
}

const refreshNodes = async () => {
  try {
    nodes.value = parseRuntimeNodes(await listRuntimeNodes())
  } catch (e) {
    if (!apiUnavailable(e)) console.warn('[Scout] list nodes', e)
    nodes.value = []
  }
}

const refreshRelease = async () => {
  releaseMissing.value = false
  releaseError.value = ''
  try {
    const res = await getScoutLatestRelease(platform.value)
    release.value = res?.data || res || null
    if (!release.value?.url) releaseMissing.value = true
  } catch (e) {
    release.value = null
    releaseMissing.value = true
    releaseError.value = e?.response?.data?.detail || e?.message || ''
  }
}

const refreshLocal = async () => {
  if (!window.electronAPI?.scoutInstalledVersion) {
    localScout.value = { installed: false, appInstalled: false, configPath: '', version: null, nexusUrl: null, scoutId: null, studioId: null }
    return
  }
  try {
    localScout.value = await window.electronAPI.scoutInstalledVersion() || localScout.value
  } catch (_) { /* ignore */ }
}

const refresh = async () => {
  checking.value = true
  try {
    await Promise.all([refreshLocal(), refreshRelease(), refreshNodes()])
  } finally {
    checking.value = false
  }
}

const onProgress = (payload) => {
  progress.value = payload
}

const stopLocal = async () => {
  if (!window.electronAPI?.scoutStop) {
    ElMessage.warning('请在 Mino Studio 桌面端停止执行器。')
    return
  }
  stopping.value = true
  try {
    const res = await window.electronAPI.scoutStop()
    if (!res?.ok) throw new Error(res?.error || '停止失败')
    ElMessage.success(res.already ? '执行器已停止' : '已停止本机执行器')
    await refreshLocal()
    await refreshNodes()
  } catch (e) {
    ElMessage.error(e?.message || '停止失败')
  } finally {
    stopping.value = false
  }
}

const startLocal = async () => {
  if (!window.electronAPI?.scoutStart) {
    ElMessage.warning('请在 Mino Studio 桌面端启动执行器。')
    return
  }
  starting.value = true
  try {
    const res = await window.electronAPI.scoutStart()
    if (!res?.ok) throw new Error(res?.error || '启动失败')
    ElMessage.success(res.already ? '执行器已在运行' : '已启动本机执行器')
    step.value = '等待节点注册'
    const seen = await waitForNode()
    await refreshLocal()
    if (seen) ElMessage.success('执行器已出现在节点列表')
    else ElMessage.info('已发出启动。若列表仍为空，稍后再点刷新。')
  } catch (e) {
    ElMessage.error(e?.message || '启动失败')
  } finally {
    starting.value = false
    step.value = ''
  }
}

const waitForNode = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 2000))
    await refreshNodes()
    if (thisHostOnline.value) return true
  }
  return false
}

const install = async () => {
  if (!window.electronAPI?.scoutDownload) {
    ElMessage.warning('请在 Mino Studio 桌面端安装执行器。浏览器不能写本机配置、也不能唤起系统安装程序。')
    return
  }
  if (!release.value?.url) {
    ElMessage.warning(releaseMissing.value
      ? (manifestUrl.value
        ? 'GitHub 上还没有对应系统的 Scout 安装包（打 tag 后才会有 latest/manifest.json）。'
        : '无法解析 GitHub Scout 仓库地址。给本仓配置 origin，或设置 VITE_SCOUT_MANIFEST_URL。')
      : (releaseError.value || '没有可用的安装包'))
    return
  }

  installing.value = true
  progress.value = null
  try {
    step.value = '领取安装凭证'
    let token = ''
    try {
      const tok = await createScoutInstallToken()
      token = tok?.data?.token || tok?.token || ''
    } catch (e) {
      if (!apiUnavailable(e)) throw e
    }

    step.value = '写入 Scout 配置'
    const written = await window.electronAPI.scoutWriteConfig({
      nexus_url: origin.value,
      token,
      version: release.value.version || '',
    })
    if (!written?.ok) throw new Error(written?.error || '写入配置失败')

    step.value = '下载安装包'
    const filename = release.value.filename
      || String(release.value.url).split('?')[0].split('/').pop()
      || `scout-${platform.value.os}-${platform.value.arch}`
    const downloaded = await window.electronAPI.scoutDownload({
      url: release.value.url,
      sha256: release.value.sha256 || '',
      filename,
    })
    if (!downloaded?.ok) throw new Error(downloaded?.error || '下载失败')

    const isZip = (release.value.installer === 'zip')
      || String(filename).toLowerCase().endsWith('.zip')
    step.value = isZip ? '解压并注册本机启动项' : '打开系统安装程序'
    const opened = await window.electronAPI.scoutInstall({ filePath: downloaded.path })
    if (!opened?.ok) throw new Error(opened?.error || '无法打开安装包')

    ElMessage.success(opened.launched
      ? '已注册本机启动项。Scout 会自己连 Nexus。'
      : '已打开安装包。装完后 Scout 会自己连 Nexus。')
    step.value = '等待节点注册'
    const seen = await waitForNode()
    await refreshLocal()
    if (seen) ElMessage.success('执行器已出现在节点列表')
    else ElMessage.info('安装程序已打开。若列表仍为空，装完后点刷新。')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '安装失败')
  } finally {
    installing.value = false
    step.value = ''
    progress.value = null
  }
}

let stopProgress = null

onMounted(async () => {
  stopProgress = window.electronAPI?.onScoutDownloadProgress?.(onProgress) || null
  try {
    const st = await window.electronAPI?.getRuntimeStatus?.()
    if (st?.electron?.platform) {
      platform.value = {
        os: st.electron.platform,
        arch: st.electron.arch === 'arm64' ? 'arm64' : 'x64',
      }
    }
  } catch { /* UA fallback already set */ }
  refresh()
})

onUnmounted(() => {
  stopProgress?.()
})
</script>

<template>
  <section class="settings-card scout-card">
    <div class="settings-kicker">本机执行器</div>
    <h3>Mino Scout</h3>
    <p class="settings-page-desc">{{ statusLine }}</p>
    <p class="meta">Nexus <code>{{ origin }}</code> · {{ platform.os }}/{{ platform.arch }} · 已注册 {{ nodeCount }} 个节点</p>
    <p v-if="localScout.configPath" class="meta">配置：{{ localScout.configPath }}</p>
    <p v-if="localScout.scoutId" class="meta">Scout ID <code>{{ localScout.scoutId }}</code></p>
    <p v-if="release?.version" class="meta">最新包 {{ release.version }}</p>
    <p v-else-if="releaseMissing" class="meta warn">
      还没有可用的 GitHub 安装包（<code>releases/latest/download/manifest.json</code>）。
      <a v-if="releasesPage" :href="releasesPage" target="_blank" rel="noopener" @click="openReleases">打开发布页</a>
    </p>
    <p v-if="(installing || starting || stopping) && step" class="meta">{{ step }}<template v-if="progress?.percent != null"> · {{ progress.percent }}%</template></p>
    <div class="actions">
      <button
        v-if="localScout.installed || localScout.appInstalled"
        type="button"
        class="settings-action-pill"
        :disabled="starting || stopping || installing || localScout.running"
        @click="startLocal"
      >
        <span>{{ starting ? '启动中…' : (localScout.running ? '执行器已在运行' : '启动本机执行器') }}</span>
      </button>
      <button
        v-if="localScout.running"
        type="button"
        class="settings-action-pill"
        :disabled="starting || stopping || installing"
        @click="stopLocal"
      >
        <span>{{ stopping ? '停止中…' : '停止本机执行器' }}</span>
      </button>
      <button type="button" class="settings-action-pill" :disabled="installing || starting" @click="install">
        <el-icon><Download /></el-icon>
        <span>{{ installing ? '安装中…' : (localScout.installed ? '重新安装执行器' : '从 GitHub 下载并安装') }}</span>
      </button>
      <button type="button" class="settings-action-pill refresh-pill" :disabled="checking || installing || starting" @click="refresh">
        刷新
      </button>
    </div>
  </section>
</template>

<style scoped>
.scout-card h3 {
  margin: 8px 0 4px;
  font-size: 16px;
  font-weight: 700;
}
.meta {
  margin: 4px 0;
  font-size: 12px;
  color: #6b7280;
}
.meta.warn { color: #b45309; }
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
code { font-size: 12px; }
</style>
