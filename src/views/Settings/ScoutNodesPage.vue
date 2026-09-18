<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { getAuthStatus } from '@/api/auth'
import {
  createScoutInstallToken,
  detectClientPlatform,
  getScoutLatestRelease,
  listRuntimeNodes,
  parseRuntimeNodes,
  sendNodeCommand,
} from '@/api/runtime'
import { canInstallLocalScout, nexusOrigin, scoutManifestUrl } from '@/utils/config'
import {
  packedArchForOs,
  scoutReleasesPageUrl,
  normalizeScoutVersion,
  nodeScoutVersion,
  scoutVersionStatus,
} from '@/utils/scoutRelease'
import { openExternalUrl } from '@/utils/openExternal'
import {
  nodeActionState,
  ownershipLabel,
} from '@/utils/scoutNodes'
import { formatRelativeTime } from '@/utils/relativeTime'
import { ipcPayload } from '@/utils/ipcPayload'
import { buildScoutInstallCommand, copyTextToClipboard } from '@/utils/scoutInstallCommand'
import './settings-ui.css'

const loading = ref(false)
const nodes = ref([])
const localScout = ref({
  installed: false,
  appInstalled: false,
  running: false,
  pid: null,
  configPath: '',
  version: null,
  nexusUrl: null,
  scoutId: null,
  studioId: null,
  hasToken: false,
  tokenMasked: '',
})
const account = ref({ userId: '', role: '', name: '' })
const starting = ref(false)
const stopping = ref(false)
const restarting = ref(false)
const updating = ref(false)
const copyingRemote = ref(false)
const uninstalling = ref(false)
const installProgress = ref(null)
const setupJob = ref({
  active: false,
  stage: '',
  label: '',
  percent: 0,
  error: '',
})
const busyId = ref('')
const remoteBusy = computed(() => Boolean(busyId.value))
const startJob = ref({
  active: false,
  stage: '',
  label: '',
  error: '',
  pid: null,
})
const release = ref(null)
const releaseMissing = ref(false)
const releaseError = ref('')
const checkingVersion = ref(true)
const platform = ref(detectClientPlatform())
const relativeTick = ref(0)
let relativeTimer = null
let pollTimer = null
let progressStop = null
let startProgressStop = null
let startWatching = false

const props = defineProps({
  embedded: { type: Boolean, default: false },
})

const canInstall = computed(() => canInstallLocalScout())
const isElectron = computed(() => canInstall.value)
const origin = computed(() => nexusOrigin())
const manifestUrl = computed(() => scoutManifestUrl())
const studioId = computed(() => localScout.value.studioId || '')
const localId = computed(() => localScout.value.scoutId || '')
const releasesPage = computed(() => scoutReleasesPageUrl(scoutManifestUrl()))
const latestVersion = computed(() => normalizeScoutVersion(release.value?.version || ''))
const installedVersion = computed(() => {
  const cfg = normalizeScoutVersion(localScout.value.version || '')
  if (cfg) return cfg
  const id = String(localId.value || '').toLowerCase()
  if (!id) return ''
  const hit = nodes.value.find((n) => String(n.node_id || n.scout_id || '').toLowerCase() === id)
  return nodeScoutVersion(hit)
})
const localInstalled = computed(() => Boolean(
  localScout.value.installed || localScout.value.appInstalled,
))
const setupInProgress = computed(() => Boolean(setupJob.value.active))
const versionCheck = computed(() => {
  if (setupInProgress.value) return ''
  if (checkingVersion.value) return 'checking'
  if (!latestVersion.value || releaseMissing.value) return 'unknown'
  if (!localInstalled.value && !installedVersion.value) return ''
  if (!installedVersion.value) return 'unknown'
  return scoutVersionStatus(installedVersion.value, latestVersion.value)
})
const updateAvailable = computed(() => versionCheck.value === 'outdated')
const versionBannerTitle = computed(() => {
  if (checkingVersion.value) return '正在检测 Scout 版本…'
  if (!latestVersion.value) return '无法获取 GitHub 稳定版'
  return `GitHub 最新稳定版 v${latestVersion.value}`
})
const versionBannerHint = computed(() => {
  if (releaseMissing.value) return releaseError.value || '请检查网络或 manifest 配置'
  return '比对来源：GitHub Release Latest（不含 Pre-release）。推 main 触发的 dev 包不会当作最新。'
})
const rowNeedsUpdate = (row) => {
  const cur = nodeScoutVersion(row)
  if (!cur || !latestVersion.value) return false
  return scoutVersionStatus(cur, latestVersion.value) === 'outdated'
}

const rowOnline = (row) => Boolean(row?.status === 'online' || row?.online || row?.alive)

const remoteCommandId = (row) => {
  const nid = String(row?.node_id || row?.scout_id || '').trim()
  return nid && nid !== 'local' ? nid : ''
}

/** 浏览器不能写本机文件；在线节点一律走 Nexus `node.update`。 */
const canRemoteUpdate = (row) => rowOnline(row) && Boolean(remoteCommandId(row))
const downloadPercent = computed(() => {
  const n = Number(setupJob.value?.percent ?? installProgress.value?.percent)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null
})
const setupPhase = computed(() => {
  const stage = setupJob.value.stage
  if (stage === 'start' || stage === 'done') return '启动中'
  return '安装中'
})
const setupProgressText = computed(() => {
  const phase = setupPhase.value
  const label = setupJob.value.label || phase
  if (downloadPercent.value != null) return `${phase} · ${label} ${downloadPercent.value}%`
  return `${phase} · ${label}`
})

const openReleases = (e) => {
  e?.preventDefault?.()
  if (releasesPage.value) openExternalUrl(releasesPage.value)
}

/** Prefer config scout_id; else same studio_id; else sole node on this Studio. */
const resolvedLocalId = computed(() => {
  if (!localInstalled.value) return ''
  if (localId.value) return String(localId.value)
  const sid = String(studioId.value || '').toLowerCase()
  if (sid) {
    const hit = nodes.value.find((n) => String(n.studio_id || '').toLowerCase() === sid)
    if (hit) return String(hit.node_id || hit.scout_id || '')
  }
  if (nodes.value.length === 1) {
    return String(nodes.value[0].node_id || nodes.value[0].scout_id || '')
  }
  return ''
})

const applySetupJob = (job) => {
  if (!job) return
  setupJob.value = {
    active: Boolean(job.active),
    stage: job.stage || '',
    label: job.label || '',
    percent: Number(job.percent) || 0,
    error: job.error || '',
  }
  if (job.active) {
    updating.value = true
    installProgress.value = { percent: job.percent, stage: job.stage, label: job.label }
    return
  }
  if (job.stage === 'done') {
    updating.value = false
    installProgress.value = { percent: 100, stage: 'done', label: job.label || '安装完成' }
    return
  }
  if (job.error) updating.value = false
}

const applyStartJob = (job) => {
  if (!job) return
  const wasActive = startJob.value.active
  startJob.value = {
    active: Boolean(job.active),
    stage: job.stage || '',
    label: job.label || '',
    error: job.error || '',
    pid: job.pid || null,
  }
  starting.value = Boolean(job.active)
  if (job.active) return
  if (!startWatching && !wasActive) return
  startWatching = false
  if (job.error) {
    ElMessage.error(job.error)
    return
  }
  if (job.stage === 'done') {
    ElMessage.success('已启动本机执行器')
    refreshLocal()
    refreshNodes()
  }
}

const refreshAuth = async () => {
  try {
    const auth = await getAuthStatus()
    const data = auth?.data || auth || {}
    account.value = {
      userId: data.user_id || '',
      role: data.role || '',
      name: data.name || data.username || '',
    }
  } catch {
    account.value = { userId: '', role: '', name: '' }
  }
}

const refreshLocal = async () => {
  if (!window.electronAPI?.scoutInstalledVersion) {
    localScout.value = {
      installed: false, appInstalled: false, running: false, pid: null,
      configPath: '', version: null, nexusUrl: null, scoutId: null, studioId: null,
      hasToken: false, tokenMasked: '',
    }
    return
  }
  try {
    const next = await window.electronAPI.scoutInstalledVersion()
    localScout.value = { ...localScout.value, ...(next || {}) }
    if (next?.setup) applySetupJob(next.setup)
  } catch { /* ignore */ }
}

const refreshNodes = async () => {
  try {
    const res = await listRuntimeNodes(studioId.value ? { studio_id: studioId.value } : {})
    nodes.value = parseRuntimeNodes(res)
  } catch (e) {
    const status = e?.response?.status
    if (status !== 404 && status !== 501 && status !== 502) {
      ElMessage.error(e?.response?.data?.detail || e?.message || '加载节点失败')
    }
    nodes.value = []
  }
}

const refreshRelease = async () => {
  releaseMissing.value = false
  releaseError.value = ''
  try {
    const res = await getScoutLatestRelease({ os: platform.value.os })
    release.value = ipcPayload(res?.data || null)
    if (!release.value?.url) {
      releaseMissing.value = true
      releaseError.value = 'GitHub 上没有当前系统的安装包'
    }
  } catch (e) {
    release.value = null
    releaseMissing.value = true
    releaseError.value = e?.response?.data?.detail || e?.message || '拉取安装包失败'
  }
}

const refresh = async ({ silent = false } = {}) => {
  if (!silent) {
    loading.value = true
    checkingVersion.value = true
  }
  try {
    await refreshAuth()
    await refreshLocal()
    await Promise.all([refreshNodes(), refreshRelease()])
  } finally {
    checkingVersion.value = false
    if (!silent) loading.value = false
  }
}

const localRow = computed(() => {
  const id = String(resolvedLocalId.value || '').toLowerCase()
  const matched = id
    ? nodes.value.find((n) => String(n.node_id || n.scout_id || '').toLowerCase() === id)
    : null
  const running = Boolean(localScout.value.running)
  if (matched) {
    const online = matched.status === 'online' || matched.online || matched.alive || running
    return {
      ...matched,
      hostname: matched.hostname || '本机',
      status: online ? 'online' : (matched.status || 'offline'),
      online,
      alive: online,
      _local: true,
      _placeholder: false,
    }
  }
  return {
    node_id: resolvedLocalId.value || localId.value || 'local',
    scout_id: localId.value || resolvedLocalId.value || '',
    hostname: '本机',
    platform: platform.value?.os || '',
    status: running ? 'online' : 'offline',
    online: running,
    alive: running,
    devices: [],
    device_count: 0,
    scout_version: localScout.value.version || '',
    owner_name: account.value.name || '当前账号',
    owner_user_id: account.value.userId || '',
    _local: true,
    _placeholder: true,
  }
})

const localStatusText = computed(() => {
  if (setupInProgress.value) return setupPhase.value
  if (starting.value || startJob.value.active || restarting.value) {
    return startJob.value.label ? `启动中 · ${startJob.value.label}` : '启动中'
  }
  if (stopping.value) return '停止中'
  if (localScout.value.running || localRow.value.online || localRow.value.status === 'online') return '在线'
  if (localInstalled.value) return '已停止'
  return '未安装'
})

const localStatusType = computed(() => {
  if (localStatusText.value === '在线') return 'success'
  if (localStatusText.value === '启动中' || localStatusText.value === '安装中' || localStatusText.value === '停止中') return 'warning'
  return 'info'
})

const remoteRows = computed(() => {
  const id = String(resolvedLocalId.value || localId.value || '').toLowerCase()
  const localKey = String(localRow.value.node_id || localRow.value.scout_id || '').toLowerCase()
  return nodes.value.filter((n) => {
    const nid = String(n.node_id || n.scout_id || '').toLowerCase()
    if (id && nid === id) return false
    if (localKey && nid === localKey) return false
    return true
  })
})

const localDevices = computed(() => {
  const list = Array.isArray(localRow.value.devices) ? localRow.value.devices : []
  return list
})

const showInstallUi = computed(() => setupInProgress.value || !localInstalled.value)

const rowActions = (row) => {
  const needsUpdate = rowNeedsUpdate(row)
  if (row?._local) {
    const lid = String(row.scout_id || resolvedLocalId.value || localId.value || 'local')
    return nodeActionState(
      { ...row, node_id: lid, scout_id: lid },
      {
        localScoutId: lid,
        isElectron: isElectron.value,
        installed: localInstalled.value,
        updateAvailable: needsUpdate || updateAvailable.value,
      },
    )
  }
  return nodeActionState(row, {
    localScoutId: resolvedLocalId.value || localId.value,
    isElectron: isElectron.value,
    installed: localInstalled.value,
    updateAvailable: needsUpdate,
  })
}

const rowOwnership = (row) => ownershipLabel(row, {
  studioId: studioId.value,
  userId: account.value.userId,
})

const deviceAccount = (row, d) => d?.owner_name || d?.owner_user_id || rowOwnership(row)

const heartbeatText = (row) => {
  void relativeTick.value
  const t = formatRelativeTime(row?.last_heartbeat || '')
  return t === '—' ? '' : t
}

const runLocal = async (kind) => {
  const api = window.electronAPI
  if (!api?.scoutStart || !api?.scoutStop) {
    ElMessage.warning('请在 Mino Studio 桌面端操作本机执行器。')
    return
  }
  if (kind === 'start') {
    startWatching = true
    starting.value = true
    await nextTick()
    try {
      const res = await api.scoutStart()
      if (res?.start) applyStartJob(res.start)
      if (!res?.ok) throw new Error(res?.error || '启动失败')
      if (res.already) {
        startWatching = false
        starting.value = false
        ElMessage.success('执行器已在运行')
        await refreshLocal()
        await refreshNodes()
      }
    } catch (e) {
      startWatching = false
      starting.value = false
      ElMessage.error(e?.message || '启动失败')
    }
    return
  }
  const flag = kind === 'stop' ? stopping : restarting
  flag.value = true
  await nextTick()
  try {
    let res
    if (kind === 'stop') res = await api.scoutStop()
    else if (api.scoutRestart) res = await api.scoutRestart()
    else {
      const stopped = await api.scoutStop()
      if (!stopped?.ok) throw new Error(stopped?.error || '停止失败')
      res = await api.scoutStart()
    }
    if (!res?.ok) throw new Error(res?.error || '操作失败')
    ElMessage.success(kind === 'stop' ? (res.already ? '执行器已停止' : '已停止本机执行器')
      : '已重启本机执行器')
    await refreshLocal()
    await refreshNodes()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    flag.value = false
  }
}

const runRemote = async (row, command) => {
  busyId.value = `${row.node_id}:${command}`
  try {
    const res = await sendNodeCommand(row.node_id || row.scout_id, command, { studioId: studioId.value })
    const data = res?.data || res || {}
    if (data.status && data.status !== 'pass') {
      const err = data.error || data.summary || '指令失败'
      if (/远程更新未实现/i.test(err)) {
        throw new Error(
          `${err}（执行机 Scout 版本过旧，需先装 v0.1.21+：复制远程安装命令或在该机执行 mino-scout update）`,
        )
      }
      throw new Error(err)
    }
    ElMessage.success(data.summary || '已下发')
    await refreshNodes()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '下发失败')
  } finally {
    busyId.value = ''
  }
}

const act = async (row, command) => {
  const state = rowActions(row)[command]
  if (!state?.enabled) {
    ElMessage.warning(state?.reason || '当前状态不可执行该操作')
    return
  }
  if (command === 'update') {
    if (isElectron.value && rowActions(row).local) {
      await updateLocal()
      return
    }
    if (canRemoteUpdate(row)) {
      await runRemote(row, 'update')
      return
    }
    if (rowActions(row).local && !isElectron.value) {
      ElMessage.warning('浏览器不能安装/更新本机 Scout。请用「复制远程安装命令」在专机执行，或打开桌面版 Studio。')
      return
    }
    ElMessage.warning(rowActions(row).update?.reason || '当前不可更新')
    return
  }
  if (command === 'start') {
    if (!rowActions(row).local) {
      ElMessage.warning('离线专机无法远程启动')
      return
    }
    await runLocal('start')
    return
  }
  // stop / restart：在线节点优先 NODE_COMMAND（覆盖本机 venv/cli）。
  const online = row?.status === 'online' || row?.online || row?.alive
  const nodeId = row?.node_id || row?.scout_id
  if (online && nodeId && nodeId !== 'local') {
    await runRemote(row, command)
    // 本机再清 launchd / 冻结服务；restart 由 Scout 自拉起，不再 IPC restart
    if (command === 'stop' && rowActions(row).local && isElectron.value) {
      try {
        await window.electronAPI?.scoutStop?.()
        await refreshLocal()
      } catch { /* remote already stopped */ }
    } else {
      await refreshLocal()
      await refreshNodes()
    }
    return
  }
  if (rowActions(row).local) {
    await runLocal(command === 'restart' ? 'restart' : command)
    return
  }
  ElMessage.warning('节点离线，无法下发')
}

const humanBytes = (n) => {
  const b = Number(n) || 0
  if (b <= 0) return ''
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/** 让提示说清这次到底走了哪条路 —— 增量和全量差三个数量级，用户该看得到。 */
const scoutSetupSummary = (res) => {
  const tail = res?.launched ? '并启动本机 Scout' : ''
  if (res?.mode === 'up-to-date') return `本机 Scout 已是最新，无需下载${tail ? '，已' + tail : ''}`
  const size = humanBytes(res?.bytes)
  if (res?.mode === 'layers' && res.layers?.length) {
    return `已更新 ${res.layers.join(' + ')} 层${size ? `（${size}）` : ''}${tail}`
  }
  return `Studio 已安装${tail ? tail : ' Scout'}${size ? `（${size}）` : ''}`
}

const resolveStudioIdForInstall = async () => {
  let sid = String(studioId.value || '').trim()
  if (sid) return sid
  try {
    const st = await window.electronAPI?.scoutInstalledVersion?.()
    sid = String(st?.studioId || '').trim()
  } catch { /* ignore */ }
  return sid
}

const copyRemoteInstall = async () => {
  const ver = release.value?.version || latestVersion.value
  if (!ver) {
    ElMessage.warning('没有可用的 Scout 发布版本')
    return
  }
  copyingRemote.value = true
  try {
    const tokRes = await createScoutInstallToken()
    const tok = tokRes?.data || tokRes || {}
    const token = tok.token || ''
    if (!token) throw new Error('未拿到安装凭证')
    const cmd = buildScoutInstallCommand({
      version: ver,
      token,
      nexusUrl: tok.nexus_url || origin.value,
      studioId: await resolveStudioIdForInstall(),
      manifestUrl: manifestUrl.value,
    })
    await copyTextToClipboard(cmd)
    ElMessage.success('已复制。请在执行机终端粘贴（凭证约 15 分钟有效，勿外传）。')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '复制失败')
  } finally {
    copyingRemote.value = false
  }
}

const updateLocal = async () => {
  const api = window.electronAPI
  if (typeof api?.scoutSetup !== 'function') {
    ElMessage.error('当前不是 Mino Studio 桌面窗口，无法安装 Scout。请运行 npm run dev 打开应用后再点下载。')
    return
  }
  if (setupJob.value.active) return
  updating.value = true
  try {
    const rel = release.value || (await getScoutLatestRelease({ os: platform.value.os }))?.data
    release.value = rel
    if (!rel?.url) throw new Error('没有可用的 GitHub 安装包')
    let token = ''
    try {
      const tok = await createScoutInstallToken()
      token = tok?.data?.token || tok?.token || ''
    } catch { /* keep existing token */ }
    const filename = rel.filename || String(rel.url).split('?')[0].split('/').pop() || 'scout-installer'
    const res = await api.scoutSetup(ipcPayload({
      url: rel.url,
      sha256: rel.sha256 || '',
      filename,
      nexus_url: origin.value,
      token,
      version: rel.version || '',
      // 分层字段。主进程拿它跟本机 bin/layers.txt 比对，只下指纹变了的层 ——
      // 只改代码的发版是 90 KB，不是 439 MB。缺了这两个字段就退回下合并包。
      bytes: rel.bytes || 0,
      layers: rel.layers || null,
    }))
    if (res?.setup) applySetupJob(res.setup)
    if (!res?.ok) throw new Error(res?.error || '安装失败')
    ElMessage.success(scoutSetupSummary(res))
    await refreshLocal()
    await refreshNodes()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '安装失败')
  } finally {
    if (!setupJob.value.active) updating.value = false
  }
}

const uninstallLocal = async () => {
  const api = window.electronAPI
  if (typeof api?.scoutUninstall !== 'function') {
    ElMessage.warning('请在 Mino Studio 桌面端卸载。')
    return
  }
  if (localScout.value.running) {
    ElMessage.warning('请先停止 Scout，再卸载')
    return
  }
  try {
    await ElMessageBox.confirm('卸载后本机 Scout 将停止并从这台电脑移除，确定继续？', '卸载本机 Scout', {
      type: 'warning',
      confirmButtonText: '卸载',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  uninstalling.value = true
  try {
    const res = await api.scoutUninstall()
    if (!res?.ok) throw new Error(res?.error || '卸载失败')
    ElMessage.success('已卸载本机 Scout')
    await refreshLocal()
    await refreshNodes()
  } catch (e) {
    ElMessage.error(e?.message || '卸载失败')
  } finally {
    uninstalling.value = false
  }
}

onMounted(async () => {
  try {
    const st = await window.electronAPI?.getRuntimeStatus?.()
    if (st?.electron?.platform) {
      const os = st.electron.platform
      platform.value = { os, arch: packedArchForOs(os) }
    }
  } catch { /* UA fallback */ }
  progressStop = window.electronAPI?.onScoutSetupProgress?.((p) => {
    applySetupJob(p)
  }) || null
  startProgressStop = window.electronAPI?.onScoutStartProgress?.((p) => {
    applyStartJob(p)
  }) || null
  try {
    const status = await window.electronAPI?.scoutSetupStatus?.()
    if (status) applySetupJob(status)
  } catch { /* no job yet */ }
  try {
    const startStatus = await window.electronAPI?.scoutStartStatus?.()
    if (startStatus) applyStartJob(startStatus)
  } catch { /* no job yet */ }
  await refresh()
  relativeTimer = setInterval(() => { relativeTick.value += 1 }, 30000)
  pollTimer = setInterval(() => { refresh({ silent: true }) }, 15000)
})

onUnmounted(() => {
  if (relativeTimer) clearInterval(relativeTimer)
  if (pollTimer) clearInterval(pollTimer)
  progressStop?.()
  startProgressStop?.()
})
</script>

<template>
  <div
    class="scout-nodes-page"
    :class="{ 'is-embedded': embedded, 'settings-panel wide-panel': !embedded }"
    v-loading="loading && !nodes.length && !localInstalled"
  >
    <header v-if="!embedded" class="settings-page-header">
      <div>
        <h2 class="settings-page-title">Scout 节点</h2>
      </div>
      <div class="settings-summary-pill" :class="{ 'is-muted': showInstallUi && !remoteRows.length }">
        {{ showInstallUi ? remoteRows.length : remoteRows.length + 1 }} 个节点
      </div>
    </header>

    <section class="settings-card version-banner">
      <div class="version-banner-main">
        <div class="settings-kicker">Scout 版本</div>
        <p class="version-banner-title">{{ versionBannerTitle }}</p>
        <p class="version-banner-hint">{{ versionBannerHint }}</p>
        <p v-if="installedVersion" class="version-banner-local">
          本机/当前节点报告版本：<strong>v{{ installedVersion }}</strong>
          <span v-if="versionCheck === 'latest'" class="version-ok"> · 已对齐稳定版</span>
          <span v-else-if="versionCheck === 'outdated'" class="version-warn"> · 可更新</span>
        </p>
      </div>
      <div class="row-actions">
        <button
          v-if="releasesPage"
          type="button"
          class="settings-action-pill"
          @click="openReleases"
        >GitHub Releases</button>
        <button
          v-if="updateAvailable && (isElectron || canRemoteUpdate(localRow))"
          type="button"
          class="settings-action-pill"
          :disabled="updating || setupInProgress || (!isElectron && !canRemoteUpdate(localRow))"
          @click="act(localRow, 'update')"
        >{{ setupInProgress || updating ? setupProgressText : (isElectron ? `本机更新到 v${latestVersion}` : `远程更新到 v${latestVersion}`) }}</button>
      </div>
    </section>

    <!-- 未安装：整块切换为下载安装 UI -->
    <section v-if="showInstallUi" class="settings-card install-hero">
      <div class="settings-kicker">本机 Scout</div>
      <h3 class="install-title">{{ setupInProgress ? setupPhase : '安装本机执行器' }}</h3>
      <p class="settings-page-desc">
        {{ setupInProgress
          ? (setupPhase === '启动中' ? '正在启动本机 Scout，并连接工作台。' : '正在安装本机 Scout，请稍候。')
          : '这台电脑还没有 Scout。下载安装后会自动连上当前工作台。' }}
      </p>
      <p class="install-meta">
        {{ platform.os }}-{{ platform.arch }}
        <template v-if="latestVersion"> · 最新 v{{ latestVersion }}</template>
      </p>
      <p v-if="!release?.url" class="settings-page-desc install-warn">
        {{ releaseError || '暂无可用安装包。' }}
        <a v-if="releasesPage" href="#" @click="openReleases">打开发布页</a>
      </p>
      <el-progress
        v-if="setupInProgress || (updating && downloadPercent != null)"
        :percentage="downloadPercent ?? 0"
        :stroke-width="10"
      />
      <p v-if="setupInProgress || updating" class="install-meta">{{ setupProgressText }}</p>
      <p v-if="setupJob.error && !setupInProgress" class="settings-page-desc install-warn">{{ setupJob.error }}</p>
      <div class="row-actions">
        <button
          v-if="release?.version || latestVersion"
          type="button"
          class="settings-action-pill"
          :disabled="copyingRemote || setupInProgress"
          @click="copyRemoteInstall"
        >
          <span>{{ copyingRemote ? '生成中…' : '复制远程安装命令' }}</span>
        </button>
        <button
          v-if="canInstall && release?.url"
          type="button"
          class="settings-action-pill"
          :disabled="updating || setupInProgress"
          @click="updateLocal"
        >
          <el-icon><Download /></el-icon>
          <span>{{ setupInProgress || updating ? setupProgressText : '本机：从 GitHub 下载并安装' }}</span>
        </button>
        <p v-else-if="release?.url" class="settings-page-desc">
          浏览器里不能装本机 Scout；请用「复制远程安装命令」在专机执行，或 <code>npm run dev</code> 打开桌面窗口。
        </p>
      </div>
    </section>

    <!-- 已安装：本机状态 + 设备列表 -->
    <section v-else class="settings-table-card local-block">
      <div class="local-row">
        <div class="local-main">
          <div class="settings-kicker">本机</div>
          <div class="local-title-line">
            <strong>{{ localRow.scout_id || localRow.node_id || '尚未注册' }}</strong>
            <el-tag size="small" :type="localStatusType" effect="light">
              {{ localStatusText }}
            </el-tag>
          </div>
          <p class="local-meta">
            {{ localRow.hostname || '本机' }}
            <template v-if="platform.os"> · {{ platform.os }}-{{ platform.arch }}</template>
            <template v-if="installedVersion"> · 本机 v{{ installedVersion }}</template>
            <template v-if="latestVersion"> · 最新 v{{ latestVersion }}</template>
            <template v-if="heartbeatText(localRow)"> · {{ heartbeatText(localRow) }}</template>
          </p>
        </div>
        <div class="row-actions">
          <button
            v-if="rowActions(localRow).start.visible && !setupInProgress"
            type="button"
            class="settings-action-pill"
            :disabled="!rowActions(localRow).start.enabled || starting || remoteBusy"
            @click="act(localRow, 'start')"
          >{{ starting ? (startJob.label || '启动中…') : '启动' }}</button>
          <button
            v-if="rowActions(localRow).stop.visible"
            type="button"
            class="settings-action-pill"
            :disabled="!rowActions(localRow).stop.enabled || stopping || restarting || remoteBusy || setupInProgress"
            @click="act(localRow, 'stop')"
          >{{ stopping ? '停止中…' : '停止' }}</button>
          <button
            v-if="rowActions(localRow).restart.visible"
            type="button"
            class="settings-action-pill"
            :disabled="!rowActions(localRow).restart.enabled || starting || stopping || restarting || remoteBusy || setupInProgress"
            @click="act(localRow, 'restart')"
          >{{ restarting ? '重启中…' : '重启' }}</button>
          <button
            v-if="latestVersion || release?.version"
            type="button"
            class="settings-action-pill"
            :disabled="copyingRemote"
            @click="copyRemoteInstall"
          >{{ copyingRemote ? '…' : '复制远程安装命令' }}</button>
          <span
            v-if="isElectron && localInstalled && versionCheck === 'checking'"
            class="version-status"
          >正在检测版本…</span>
          <span
            v-else-if="isElectron && localInstalled && versionCheck === 'latest'"
            class="version-status is-latest"
          >当前已是最新版本</span>
          <button
            v-else-if="isElectron && localInstalled && updateAvailable"
            type="button"
            class="settings-action-pill"
            :disabled="updating || setupInProgress || !release?.url"
            @click="act(localRow, 'update')"
          >{{ setupInProgress || updating ? setupProgressText : `更新到 v${latestVersion}` }}</button>
          <span
            v-else-if="isElectron && localInstalled && versionCheck === 'unknown'"
            class="version-status"
          >无法检测最新版本</span>
          <button
            v-if="isElectron && localInstalled && !localScout.running"
            type="button"
            class="settings-action-pill"
            :disabled="uninstalling || setupInProgress || updating || starting || stopping"
            @click="uninstallLocal"
          >{{ uninstalling ? '卸载中…' : '卸载' }}</button>
        </div>
      </div>
      <p v-if="startJob.error && !starting" class="settings-page-desc install-warn">{{ startJob.error }}</p>
      <el-progress
        v-if="setupInProgress || (updating && downloadPercent != null)"
        class="install-progress"
        :percentage="downloadPercent ?? 0"
        :stroke-width="10"
      />
      <p v-if="setupInProgress || updating" class="install-meta">{{ setupProgressText }}</p>

      <el-table
        :data="localDevices"
        size="small"
        border
        class="local-devices"
        empty-text="暂无在线设备"
      >
        <el-table-column label="设备" min-width="140">
          <template #default="{ row: d }">{{ d.sn || '—' }}</template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row: d }">{{ d.type || d.platform || '—' }}</template>
        </el-table-column>
        <el-table-column label="型号" min-width="120">
          <template #default="{ row: d }">{{ d.model || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row: d }">
            <el-tag size="small" :type="d.status === 'online' ? 'success' : 'info'">
              {{ d.status === 'online' ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="settings-table-card">
      <div class="settings-kicker">其他 Scout</div>
      <el-table :data="remoteRows" size="small" border stripe empty-text="暂无其他节点" row-key="node_id">
        <el-table-column type="expand">
          <template #default="{ row }">
            <el-table :data="row.devices || []" size="small" border empty-text="暂无设备" class="nested-table">
              <el-table-column label="设备" min-width="140">
                <template #default="{ row: d }">{{ d.sn || '—' }}</template>
              </el-table-column>
              <el-table-column label="类型" width="90">
                <template #default="{ row: d }">{{ d.type || d.platform || '—' }}</template>
              </el-table-column>
              <el-table-column label="型号" min-width="120">
                <template #default="{ row: d }">{{ d.model || '—' }}</template>
              </el-table-column>
              <el-table-column label="账户" min-width="120">
                <template #default="{ row: d }">{{ deviceAccount(row, d) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="80">
                <template #default="{ row: d }">
                  <el-tag size="small" :type="d.status === 'online' ? 'success' : 'info'">
                    {{ d.status === 'online' ? '在线' : '离线' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </el-table-column>
        <el-table-column label="Scout" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <code>{{ row.scout_id || row.node_id || '—' }}</code>
          </template>
        </el-table-column>
        <el-table-column label="主机" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.hostname || '—' }} / {{ row.platform || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'online' || row.online ? 'success' : 'info'" effect="light">
              {{ row.status === 'online' || row.online ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="版本" width="88">
          <template #default="{ row }">
            <span v-if="nodeScoutVersion(row)">v{{ nodeScoutVersion(row) }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="设备" width="64">
          <template #default="{ row }">{{ row.device_count ?? (row.devices || []).length }}</template>
        </el-table-column>
        <el-table-column label="账户" width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ rowOwnership(row) }}</template>
        </el-table-column>
        <el-table-column label="心跳" width="100">
          <template #default="{ row }">{{ heartbeatText(row) || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <button
                v-if="rowActions(row).update.visible"
                type="button"
                class="settings-action-pill"
                :disabled="!rowActions(row).update.enabled || remoteBusy"
                @click="act(row, 'update')"
              >更新</button>
              <button
                v-if="rowActions(row).stop.visible"
                type="button"
                class="settings-action-pill"
                :disabled="!rowActions(row).stop.enabled || stopping || restarting || remoteBusy"
                @click="act(row, 'stop')"
              >停止</button>
              <button
                v-if="rowActions(row).restart.visible"
                type="button"
                class="settings-action-pill"
                :disabled="!rowActions(row).restart.enabled || starting || stopping || restarting || remoteBusy"
                @click="act(row, 'restart')"
              >重启</button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.scout-nodes-page.is-embedded {
  min-height: 0;
}
.install-hero {
  margin-bottom: 14px;
}
.install-title {
  margin: 8px 0 6px;
  font-size: 18px;
  font-weight: 700;
  color: var(--mo-text);
}
.install-meta {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--mo-muted);
}
.install-warn {
  color: #b45309;
}
.install-progress {
  margin: 10px 0 0;
  max-width: 360px;
}
.local-block {
  margin-bottom: 14px;
  padding: 14px 16px;
}
.local-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.local-title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.local-title-line strong {
  font-size: 15px;
  font-weight: 700;
  color: var(--mo-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.local-meta {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--mo-muted);
}
.version-status {
  font-size: 12px;
  font-weight: 600;
  color: var(--mo-muted);
  line-height: 28px;
  white-space: nowrap;
}
.version-status.is-latest {
  color: #059669;
}
.version-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding: 14px 16px;
}
.version-banner-title {
  margin: 6px 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--mo-text);
}
.version-banner-hint,
.version-banner-local {
  margin: 0;
  font-size: 12px;
  color: var(--mo-muted);
  line-height: 1.5;
}
.version-ok { color: #059669; font-weight: 600; }
.version-warn { color: #b45309; font-weight: 600; }
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.local-devices,
.nested-table {
  margin-top: 12px;
}
code { font-size: 12px; }
</style>






