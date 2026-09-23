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
import { canInstallLocalScout, nexusOrigin, scoutManifestUrl } from '@/utils/config'
import { packedArchForOs, scoutReleasesPageUrl } from '@/utils/scoutRelease'
import { buildScoutInstallCommand, copyTextToClipboard } from '@/utils/scoutInstallCommand'
import { openExternalUrl } from '@/utils/openExternal'
import { ipcPayload } from '@/utils/ipcPayload'
import './settings-ui.css'

const installing = ref(false)
const copyingRemote = ref(false)
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
const canInstall = computed(() => canInstallLocalScout())
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
    const res = await getScoutLatestRelease({ os: platform.value.os })
    release.value = res.data ? ipcPayload(res.data) : (res.version ? { version: res.version, url: '' } : null)
    if (res.packaging) {
      releaseMissing.value = false
      if (res.error) releaseError.value = res.error
      return
    }
    if (!release.value?.url) {
      releaseMissing.value = true
      releaseError.value = res.error || 'GitHub 上没有当前系统的安装包'
    }
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
  // scoutSetup 的进度自带阶段名（含「下载安装包（app 层）」这类分层信息），
  // 比这里手写的 step 更细，来了就用它。
  if (installing.value && payload?.label) step.value = payload.label
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

const resolveStudioId = async () => {
  let sid = String(localScout.value.studioId || '').trim()
  if (sid) return sid
  try {
    const st = await window.electronAPI?.scoutInstalledVersion?.()
    sid = String(st?.studioId || '').trim()
  } catch { /* ignore */ }
  return sid
}

const copyRemoteInstall = async () => {
  if (!release.value?.version) {
    ElMessage.warning(releaseMissing.value ? 'GitHub 上还没有 Scout 发布包' : '请先刷新 release 信息')
    return
  }
  copyingRemote.value = true
  try {
    const tokRes = await createScoutInstallToken()
    const tok = tokRes?.data || tokRes || {}
    const token = tok.token || ''
    if (!token) throw new Error('未拿到安装凭证，请确认已登录 Nexus')
    const cmd = buildScoutInstallCommand({
      version: release.value.version,
      token,
      nexusUrl: tok.nexus_url || origin.value,
      studioId: await resolveStudioId(),
      manifestUrl: manifestUrl.value,
    })
    await copyTextToClipboard(cmd)
    ElMessage.success('已复制安装命令。请在执行机终端粘贴（含临时凭证，约 15 分钟内有效，勿外传）。')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '复制失败')
  } finally {
    copyingRemote.value = false
  }
}

const install = async () => {
  const api = window.electronAPI
  if (typeof api?.scoutSetup !== 'function') {
    ElMessage.error('当前不是 Mino Studio 桌面窗口，无法安装 Scout。请运行 npm run dev 打开应用后再点下载。')
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

    // 走 scoutSetup（与 Scout 节点页同一条路径）而不是 scoutDownload + scoutInstall：
    // 那条老的两步流程只会下合并包，永远拿不到分层增量。scoutSetup 会比对本机
    // bin/layers.txt，只下指纹变了的层 —— 只改代码的更新是 90 KB 而非 439 MB。
    // 它自己写配置并注册启动项，所以这里不再单独 scoutWriteConfig。
    step.value = '下载并安装'
    const filename = release.value.filename
      || String(release.value.url).split('?')[0].split('/').pop()
      || `scout-${platform.value.os}-${packedArchForOs(platform.value.os)}`
    const res = await api.scoutSetup(ipcPayload({
      url: release.value.url,
      sha256: release.value.sha256 || '',
      filename,
      nexus_url: origin.value,
      token,
      version: release.value.version || '',
      bytes: release.value.bytes || 0,
      layers: release.value.layers || null,
    }))
    if (!res?.ok) throw new Error(res?.error || '安装失败')

    if (res.mode === 'up-to-date') {
      ElMessage.success('本机 Scout 已是最新，无需下载。')
    } else if (res.mode === 'layers' && res.layers?.length) {
      ElMessage.success(`已增量更新 ${res.layers.join(' + ')} 层。Scout 会自己连 Nexus。`)
    } else {
      ElMessage.success('已安装并注册本机启动项。Scout 会自己连 Nexus。')
    }

    step.value = '等待节点注册'
    const seen = await waitForNode()
    await refreshLocal()
    if (seen) ElMessage.success('执行器已出现在节点列表')
    else ElMessage.info('已安装。若列表仍为空，稍后点刷新。')
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
  // 订阅 setup 的进度，不再是 download 的 —— install() 走的是 scoutSetup。
  stopProgress = window.electronAPI?.onScoutSetupProgress?.(onProgress) || null
  try {
    const st = await window.electronAPI?.getRuntimeStatus?.()
    if (st?.electron?.platform) {
      platform.value = { os: st.electron.platform, arch: packedArchForOs(st.electron.platform) }
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
    <p class="meta">Nexus <code>{{ origin }}</code> · {{ platform.os }}-{{ platform.arch }} · 已注册 {{ nodeCount }} 个节点</p>
    <p v-if="localScout.configPath" class="meta">配置：{{ localScout.configPath }}</p>
    <p v-if="localScout.scoutId" class="meta">Scout ID <code>{{ localScout.scoutId }}</code></p>
    <p v-if="localScout.version" class="meta">本机 v{{ localScout.version }}</p>
    <p v-if="release?.version" class="meta">最新包 v{{ release.version }}</p>
    <p v-else-if="releaseMissing" class="meta warn">
      还没有可用的 GitHub 安装包（<code>releases/latest/download/manifest.json</code>）。
      <a v-if="releasesPage" :href="releasesPage" target="_blank" rel="noopener" @click="openReleases">打开发布页</a>
    </p>
    <el-progress
      v-if="installing && progress?.percent != null"
      :percentage="Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0)))"
      :stroke-width="10"
    />
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
      <button
        v-if="release?.version"
        type="button"
        class="settings-action-pill"
        :disabled="copyingRemote || installing"
        @click="copyRemoteInstall"
      >
        <span>{{ copyingRemote ? '生成中…' : '复制远程安装命令' }}</span>
      </button>
      <button v-if="canInstall" type="button" class="settings-action-pill" :disabled="installing || starting" @click="install">
        <el-icon><Download /></el-icon>
        <span>{{ installing ? (progress?.percent != null ? `下载中 ${progress.percent}%` : 'Studio 正在安装 Scout…') : (localScout.installed ? (release?.version && String(localScout.version || '') !== String(release.version) ? `更新到 v${release.version}` : '重新安装执行器') : '从 GitHub 下载并安装') }}</span>
      </button>
      <p v-else-if="!canInstall" class="meta">本机浏览器页不能装 Scout；请用上方「复制远程安装命令」在专机执行，或 <code>npm run dev</code> 打开桌面窗口本机安装。</p>
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
.el-progress {
  margin: 8px 0;
  max-width: 360px;
}
code { font-size: 12px; }
</style>
