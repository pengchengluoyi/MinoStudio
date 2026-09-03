<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
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
import { nexusOrigin, scoutManifestUrl } from '@/utils/config'
import { scoutReleasesPageUrl } from '@/utils/scoutRelease'
import { openExternalUrl } from '@/utils/openExternal'
import {
  nodeActionState,
  ownershipLabel,
} from '@/utils/scoutNodes'
import { formatRelativeTime } from '@/utils/relativeTime'
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
const installProgress = ref(null)
const savingConfig = ref(false)
const changingToken = ref(false)
const nexusDraft = ref('')
const tokenDraft = ref('')
const busyId = ref('')
const release = ref(null)
const releaseMissing = ref(false)
const platform = ref(detectClientPlatform())
const relativeTick = ref(0)
let relativeTimer = null
let pollTimer = null
let progressStop = null

const props = defineProps({
  embedded: { type: Boolean, default: false },
})

const isElectron = computed(() => Boolean(typeof window !== 'undefined' && window.electronAPI?.scoutStart))
const origin = computed(() => nexusOrigin())
const studioId = computed(() => localScout.value.studioId || '')
const localId = computed(() => localScout.value.scoutId || '')
const releasesPage = computed(() => scoutReleasesPageUrl(scoutManifestUrl()))

const openReleases = (e) => {
  e?.preventDefault?.()
  if (releasesPage.value) openExternalUrl(releasesPage.value)
}

/** Prefer config scout_id; else same studio_id; else sole node on this Studio. */
const resolvedLocalId = computed(() => {
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
    if (!changingToken.value) nexusDraft.value = localScout.value.nexusUrl || origin.value
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
  try {
    const res = await getScoutLatestRelease(platform.value)
    release.value = res?.data || null
    if (!release.value?.url) releaseMissing.value = true
  } catch {
    release.value = null
    releaseMissing.value = true
  }
}

const refresh = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  try {
    await refreshAuth()
    await refreshLocal()
    await Promise.all([refreshNodes(), refreshRelease()])
  } finally {
    if (!silent) loading.value = false
  }
}

const localInstalled = computed(() => Boolean(
  localScout.value.installed || localScout.value.appInstalled || localScout.value.running,
))

const localRow = computed(() => {
  const id = String(resolvedLocalId.value || '').toLowerCase()
  const matched = id
    ? nodes.value.find((n) => String(n.node_id || n.scout_id || '').toLowerCase() === id)
    : null
  if (matched) {
    return {
      ...matched,
      hostname: matched.hostname || '本机',
      _local: true,
      _placeholder: false,
    }
  }
  const running = Boolean(localScout.value.running)
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
  if (localRow.value.status === 'online' || localRow.value.online) return '在线'
  if (localInstalled.value || localScout.value.running) return '离线'
  return '未安装'
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

const showInstallUi = computed(() => !localInstalled.value && !resolvedLocalId.value)

const rowActions = (row) => {
  if (row?._local) {
    const lid = String(row.scout_id || resolvedLocalId.value || localId.value || 'local')
    return nodeActionState(
      { ...row, node_id: lid, scout_id: lid },
      { localScoutId: lid, isElectron: isElectron.value, installed: localInstalled.value },
    )
  }
  return nodeActionState(row, {
    localScoutId: resolvedLocalId.value || localId.value,
    isElectron: isElectron.value,
    installed: localInstalled.value,
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
  const flag = kind === 'start' ? starting : kind === 'stop' ? stopping : restarting
  flag.value = true
  try {
    let res
    if (kind === 'start') res = await api.scoutStart()
    else if (kind === 'stop') res = await api.scoutStop()
    else if (api.scoutRestart) res = await api.scoutRestart()
    else {
      const stopped = await api.scoutStop()
      if (!stopped?.ok) throw new Error(stopped?.error || '停止失败')
      res = await api.scoutStart()
    }
    if (!res?.ok) throw new Error(res?.error || '操作失败')
    ElMessage.success(kind === 'start' ? (res.already ? '执行器已在运行' : '已启动本机执行器')
      : kind === 'stop' ? (res.already ? '执行器已停止' : '已停止本机执行器')
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
      throw new Error(data.error || data.summary || '指令失败')
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
    if (!rowActions(row).local) {
      ElMessage.warning('请在该节点本机 Studio 更新')
      return
    }
    await updateLocal()
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

const saveNexusUrl = async () => {
  if (!window.electronAPI?.scoutWriteConfig) {
    ElMessage.warning('请在桌面端改本机配置。')
    return
  }
  savingConfig.value = true
  try {
    const res = await window.electronAPI.scoutWriteConfig({
      nexus_url: nexusDraft.value || origin.value,
    })
    if (!res?.ok) throw new Error(res?.error || '保存失败')
    ElMessage.success('已写入本机 Nexus 地址')
    await refreshLocal()
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingConfig.value = false
  }
}

const saveToken = async () => {
  if (!window.electronAPI?.scoutWriteConfig) return
  const token = String(tokenDraft.value || '').trim()
  if (!token) {
    ElMessage.warning('请填写新的凭证')
    return
  }
  savingConfig.value = true
  try {
    const res = await window.electronAPI.scoutWriteConfig({
      nexus_url: nexusDraft.value || localScout.value.nexusUrl || origin.value,
      token,
    })
    if (!res?.ok) throw new Error(res?.error || '保存失败')
    ElMessage.success('已更新本机凭证')
    tokenDraft.value = ''
    changingToken.value = false
    await refreshLocal()
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    savingConfig.value = false
  }
}

const updateLocal = async () => {
  if (!window.electronAPI?.scoutDownload) {
    ElMessage.warning('请在桌面端安装本机执行器。')
    return
  }
  updating.value = true
  installProgress.value = null
  try {
    const rel = release.value || (await getScoutLatestRelease(platform.value))?.data
    release.value = rel
    if (!rel?.url) throw new Error('没有可用的 GitHub 安装包')
    let token = ''
    try {
      const tok = await createScoutInstallToken()
      token = tok?.data?.token || tok?.token || ''
    } catch { /* keep existing token */ }
    const written = await window.electronAPI.scoutWriteConfig({
      nexus_url: origin.value,
      token,
      version: rel.version || '',
    })
    if (!written?.ok) throw new Error(written?.error || '写入配置失败')
    const filename = rel.filename || String(rel.url).split('?')[0].split('/').pop() || 'scout-installer'
    const downloaded = await window.electronAPI.scoutDownload({
      url: rel.url,
      sha256: rel.sha256 || '',
      filename,
    })
    if (!downloaded?.ok) throw new Error(downloaded?.error || '下载失败')
    const opened = await window.electronAPI.scoutInstall({ filePath: downloaded.path })
    if (!opened?.ok) throw new Error(opened?.error || '无法打开安装包')
    ElMessage.success(opened.launched ? '已注册本机启动项' : '已打开安装包')
    await refreshLocal()
    await refreshNodes()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '安装失败')
  } finally {
    updating.value = false
    installProgress.value = null
  }
}

onMounted(async () => {
  try {
    const st = await window.electronAPI?.getRuntimeStatus?.()
    if (st?.electron?.platform) {
      platform.value = {
        os: st.electron.platform,
        arch: st.electron.arch === 'arm64' ? 'arm64' : 'x64',
      }
    }
  } catch { /* UA fallback */ }
  progressStop = window.electronAPI?.onScoutDownloadProgress?.((p) => {
    installProgress.value = p
  }) || null
  await refresh()
  relativeTimer = setInterval(() => { relativeTick.value += 1 }, 30000)
  pollTimer = setInterval(() => { refresh({ silent: true }) }, 15000)
})

onUnmounted(() => {
  if (relativeTimer) clearInterval(relativeTimer)
  if (pollTimer) clearInterval(pollTimer)
  progressStop?.()
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

    <!-- 未安装：整块切换为下载安装 UI -->
    <section v-if="showInstallUi" class="settings-card install-hero">
      <div class="settings-kicker">本机 Scout</div>
      <h3 class="install-title">安装本机执行器</h3>
      <p class="settings-page-desc">
        与当前 Studio 同一台电脑上的 Scout。安装后自动连接
        <code>{{ origin }}</code>
      </p>
      <p class="install-meta">
        {{ platform.os }}/{{ platform.arch }}
        <template v-if="release?.version"> · 最新 {{ release.version }}</template>
      </p>
      <p v-if="releaseMissing" class="settings-page-desc install-warn">
        暂无可用安装包。
        <a v-if="releasesPage" href="#" @click="openReleases">打开发布页</a>
      </p>
      <p v-if="updating && installProgress?.percent != null" class="settings-page-desc">
        下载中 {{ installProgress.percent }}%
      </p>
      <div class="row-actions">
        <button
          v-if="isElectron"
          type="button"
          class="settings-action-pill"
          :disabled="updating || releaseMissing"
          @click="updateLocal"
        >
          <el-icon><Download /></el-icon>
          <span>{{ updating ? '安装中…' : '从 GitHub 下载并安装' }}</span>
        </button>
        <p v-else class="settings-page-desc">请在 Mino Studio 桌面端安装本机执行器。</p>
      </div>
    </section>

    <!-- 已安装：本机状态 + 设备列表 -->
    <section v-else class="settings-table-card local-block">
      <div class="local-row">
        <div class="local-main">
          <div class="settings-kicker">本机</div>
          <div class="local-title-line">
            <strong>{{ localRow.scout_id || localRow.node_id || '尚未注册' }}</strong>
            <el-tag size="small" :type="localStatusText === '在线' ? 'success' : 'info'" effect="light">
              {{ localStatusText }}
            </el-tag>
          </div>
          <p class="local-meta">
            {{ localRow.hostname || '本机' }}
            <template v-if="localRow.platform || platform.os"> · {{ localRow.platform || platform.os }}</template>
            <template v-if="localScout.version || localRow.scout_version"> · v{{ localScout.version || localRow.scout_version }}</template>
            <template v-if="heartbeatText(localRow)"> · {{ heartbeatText(localRow) }}</template>
          </p>
        </div>
        <div class="row-actions">
          <button
            v-if="rowActions(localRow).start.visible"
            type="button"
            class="settings-action-pill"
            :disabled="!rowActions(localRow).start.enabled || starting || busyId"
            @click="act(localRow, 'start')"
          >{{ starting ? '启动中…' : '启动' }}</button>
          <button
            v-if="rowActions(localRow).stop.visible"
            type="button"
            class="settings-action-pill"
            :disabled="!rowActions(localRow).stop.enabled || stopping || restarting || busyId"
            @click="act(localRow, 'stop')"
          >{{ stopping ? '停止中…' : '停止' }}</button>
          <button
            v-if="rowActions(localRow).restart.visible"
            type="button"
            class="settings-action-pill"
            :disabled="!rowActions(localRow).restart.enabled || starting || stopping || restarting || busyId"
            @click="act(localRow, 'restart')"
          >{{ restarting ? '重启中…' : '重启' }}</button>
          <button
            v-if="isElectron"
            type="button"
            class="settings-action-pill"
            :disabled="updating"
            @click="act(localRow, 'update')"
          >{{ updating ? '更新中…' : '更新' }}</button>
        </div>
      </div>

      <div v-if="isElectron" class="local-config">
        <div class="config-row">
          <span class="config-label">Nexus</span>
          <el-input v-model="nexusDraft" size="small" />
          <button type="button" class="settings-action-pill" :disabled="savingConfig" @click="saveNexusUrl">
            {{ savingConfig ? '保存中…' : '保存' }}
          </button>
        </div>
        <div class="config-row">
          <span class="config-label">凭证</span>
          <el-input
            v-if="changingToken"
            v-model="tokenDraft"
            size="small"
            type="password"
            show-password
            placeholder="新的凭证"
          />
          <span v-else class="config-value">{{ localScout.hasToken ? (localScout.tokenMasked || '已配置') : '未配置' }}</span>
          <button v-if="!changingToken" type="button" class="settings-action-pill" @click="changingToken = true">更改</button>
          <template v-else>
            <button type="button" class="settings-action-pill" :disabled="savingConfig" @click="saveToken">保存</button>
            <button type="button" class="settings-action-pill" @click="changingToken = false; tokenDraft = ''">取消</button>
          </template>
        </div>
      </div>

      <el-table
        :data="localDevices"
        size="small"
        border
        class="local-devices"
        empty-text="暂无设备"
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
        <el-table-column label="设备" width="64">
          <template #default="{ row }">{{ row.device_count ?? (row.devices || []).length }}</template>
        </el-table-column>
        <el-table-column label="账户" width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ rowOwnership(row) }}</template>
        </el-table-column>
        <el-table-column label="心跳" width="100">
          <template #default="{ row }">{{ heartbeatText(row) || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <button
                v-if="rowActions(row).stop.visible"
                type="button"
                class="settings-action-pill"
                :disabled="!rowActions(row).stop.enabled || stopping || restarting || busyId"
                @click="act(row, 'stop')"
              >停止</button>
              <button
                v-if="rowActions(row).restart.visible"
                type="button"
                class="settings-action-pill"
                :disabled="!rowActions(row).restart.enabled || starting || stopping || restarting || busyId"
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
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.local-config {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--mo-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.config-label {
  flex: 0 0 44px;
  font-size: 12px;
  font-weight: 700;
  color: var(--mo-muted);
}
.config-value {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--mo-text);
}
.local-config :deep(.el-input) {
  flex: 1;
  min-width: 0;
  max-width: 360px;
}
.local-devices,
.nested-table {
  margin-top: 12px;
}
code { font-size: 12px; }
</style>
