<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Monitor, Cpu, Connection, Refresh, List, Grid, ArrowRight } from '@element-plus/icons-vue'
import { VueFlow, MarkerType, Handle, Position } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { getNodeStatus, getRuntimeStatusHttp } from '@/api/system'
import { getDeviceList } from '@/api/device'
import { getBaseUrl } from '@/utils/config'
import { dedupeDevicesForUi, applyStableDeviceOrder, applyOnlineStatusGrace } from '@/utils/devices'
import { displayDeviceSn, formatDeviceStatus, formatDeviceType, isDeviceOnline } from '@/utils/deviceDisplay'
import { formatRelativeTime } from '@/utils/relativeTime'
import ScoutNodesPage from '@/views/Settings/ScoutNodesPage.vue'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const initialLoading = ref(true)
const runtime = ref(null)
const nodeStatus = ref(null)
const devices = ref([])
const lastUpdated = ref('')
const activeTab = ref('overview')
const clusterViewMode = ref('list')
const relativeTimeTick = ref(0)
let relativeTimer = null
let pollTimer = null

const formatLastOnline = (value) => {
  void relativeTimeTick.value
  return formatRelativeTime(value)
}

const goToDeviceDetail = (row) => {
  const sn = row?.sn || displayDeviceSn(row)
  if (!sn || sn === '—') return
  router.push({ name: 'SettingsDeviceDetail', params: { sn: encodeURIComponent(sn) } })
}

const isMobileType = (device) => ['android', 'ios', 'mobile', 'android_direct'].includes(String(device?.type || '').toLowerCase())
const isExecutorNode = (device) => device?.type === 'pc' || (device?.role === 'node' && !isMobileType(device))

const executorNodes = computed(() => devices.value.filter((d) => isExecutorNode(d)))
const serviceOnline = computed(() => {
  if (runtime.value?.isLocalGateway) return true
  if (runtime.value?.embeddedServer?.running) return true
  if (nodeStatus.value?.connected || nodeStatus.value?.role === 'gateway' || nodeStatus.value?.role === 'node') return true
  return runtime.value?.endpoints?.some((item) => item.online) ?? false
})
const serverEndpoint = computed(() => {
  const onlineEndpoint = runtime.value?.endpoints?.find((item) => item.online)
  return onlineEndpoint?.url || getBaseUrl()
})
const serverRole = computed(() => {
  if (nodeStatus.value?.role && nodeStatus.value.role !== 'unknown') return nodeStatus.value.role
  if (runtime.value?.isLocalGateway || runtime.value?.embeddedServer?.running) return 'gateway'
  return 'unknown'
})
const serverSn = computed(() => nodeStatus.value?.sn || runtime.value?.electron?.pid || 'local')
const displayDevices = computed(() => devices.value)
const devicePool = computed(() => displayDevices.value.filter((d) => !isExecutorNode(d)))
const onlineDevices = computed(() => displayDevices.value.filter((d) => isDeviceOnline(d)))
const mobileDevices = computed(() => displayDevices.value.filter((d) => isMobileType(d)))
const runtimeSummary = computed(() => {
  if (!lastUpdated.value) return '等待刷新'
  return `${onlineDevices.value.length} 台在线 · ${lastUpdated.value}`
})

const statusType = (ok) => (ok ? 'success' : 'danger')
const statusText = (ok) => (ok ? '在线' : '离线')
const shortId = (value) => {
  const text = String(value || '')
  return text.length > 18 ? `${text.slice(0, 10)}...${text.slice(-4)}` : text || '—'
}
const connectionMode = (row) => {
  const ip = String(row?.ip || '').trim()
  if (!ip) return '未知连接'
  if (ip.toUpperCase() === 'USB') return 'USB 直连'
  return '局域网 / Wi-Fi'
}
const executorConnectionLabel = (row) => {
  if (isDeviceOnline(row)) return '已注册在线'
  return '历史注册，当前离线'
}
const deviceOwnerKey = (row) => {
  const keys = ['executor_sn', 'executorSn', 'owner_sn', 'ownerSn', 'node_sn', 'nodeSn', 'hub_sn', 'hubSn', 'parent_sn', 'parentSn']
  for (const key of keys) {
    if (row?.[key]) return String(row[key])
  }
  return ''
}
const hostGroups = computed(() => {
  const executors = executorNodes.value
  const primaryExecutor =
    executors.find((node) => node.sn === nodeStatus.value?.sn || node.sn === serverSn.value) ||
    executors[0] ||
    null

  const groups = executors.map((node, index) => ({
    id: node.sn || `executor-${index}`,
    title: node.sn === primaryExecutor?.sn ? '当前电脑 / Nexus 宿主机' : `电脑 / 执行器 ${index + 1}`,
    isServerHost: node.sn === primaryExecutor?.sn,
    executor: node,
    devices: [],
  }))

  if (!groups.length) {
    groups.push({
      id: 'server-host',
      title: '当前电脑 / Nexus 宿主机',
      isServerHost: true,
      executor: null,
      devices: [],
    })
  }

  for (const device of devicePool.value) {
    const owner = deviceOwnerKey(device)
    const matched = owner
      ? groups.find((group) => {
        const node = group.executor || {}
        return [node.sn, node.id, node.ip, node.model].filter(Boolean).some((value) => String(value) === owner)
      })
      : null
    const fallback = groups.find((group) => group.isServerHost) || groups[0]
    const targetGroup = matched || fallback
    targetGroup.devices.push({
      ...device,
      inferredOwner: !matched,
    })
  }

  return groups
})
const DEVICE_COLUMN_X = 660
const DEVICE_NODE_STEP = 150

const topologyFlowNodes = computed(() => {
  const nodes = []
  let y = 72

  hostGroups.value.forEach((group) => {
    const deviceCount = Math.max(group.devices.length, 1)
    const rowHeight = Math.max(300, deviceCount * DEVICE_NODE_STEP)
    const hostId = `host-${group.id}`

    nodes.push({
      id: hostId,
      type: 'runtime',
      position: { x: 120, y },
      data: group.executor
        ? {
          kind: 'host',
          title: group.title,
          status: group.isServerHost ? 'nexus' : 'executor',
          online: isDeviceOnline(group.executor) || group.isServerHost,
          hasSource: true,
          hasTarget: false,
          sections: [
            ...(group.isServerHost
              ? [{
                label: 'Nexus',
                status: statusText(serviceOnline.value),
                online: serviceOnline.value,
                value: serverEndpoint.value,
                chips: [`role ${serverRole.value}`, `SN ${shortId(serverSn.value)}`],
              }]
              : []),
            {
              label: 'Scout',
              status: formatDeviceStatus(group.executor),
              online: isDeviceOnline(group.executor),
              value: group.executor.model || shortId(group.executor.sn),
              chips: [executorConnectionLabel(group.executor), group.executor.ip || '无 IP'],
            },
          ],
        }
        : {
          kind: 'host',
          title: group.title,
          status: 'missing',
          online: false,
          hasSource: true,
          hasTarget: false,
          sections: [
            ...(group.isServerHost
              ? [{
                label: 'Nexus',
                status: statusText(serviceOnline.value),
                online: serviceOnline.value,
                value: serverEndpoint.value,
                chips: [`role ${serverRole.value}`, `SN ${shortId(serverSn.value)}`],
              }]
              : []),
            {
              label: 'Scout',
              status: 'missing',
              online: false,
              value: '本机执行器尚未注册',
              chips: ['到上方安装并启动 Scout'],
            },
          ],
        },
    })

    group.devices.forEach((device, deviceIndex) => {
      nodes.push({
        id: `device-${group.id}-${device.sn}`,
        type: 'runtime',
        position: { x: DEVICE_COLUMN_X, y: y + deviceIndex * DEVICE_NODE_STEP },
        data: {
          kind: 'device',
          title: device.model || displayDeviceSn(device),
          status: formatDeviceStatus(device),
          online: isDeviceOnline(device),
          hasSource: false,
          hasTarget: true,
          subtitle: connectionMode(device),
          meta: [device.type, device.ip || '无连接地址', displayDeviceSn(device)],
        },
      })
    })

    if (!group.devices.length) {
      nodes.push({
        id: `device-empty-${group.id}`,
        type: 'runtime',
        position: { x: DEVICE_COLUMN_X, y: y + 80 },
        data: {
          kind: 'device',
          title: '暂无归属设备',
          status: 'empty',
          online: false,
          hasSource: false,
          hasTarget: true,
          subtitle: 'Scout 连上后，USB / Wi-Fi 设备会出现在这里',
          meta: ['empty'],
        },
      })
    }

    y += rowHeight + 76
  })

  return nodes
})
const topologyFlowEdges = computed(() => {
  const edges = []

  hostGroups.value.forEach((group) => {
    const source = `host-${group.id}`

    group.devices.forEach((device) => {
      edges.push({
        id: `edge-${group.id}-${device.sn}`,
        source,
        target: `device-${group.id}-${device.sn}`,
        sourceHandle: 'source-right',
        targetHandle: 'target-left',
        type: 'smoothstep',
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: MarkerType.ArrowClosed,
      })
    })
  })

  return edges
})

const applyDeviceList = (data) => {
  const list = Array.isArray(data) ? data : (data?.data || [])
  const nextDevices = Array.isArray(list) ? dedupeDevicesForUi(list) : []
  const previous = devices.value

  const merged = nextDevices.map((item) => {
    const next = { ...item }
    if (next.password) next.password_configured = true
    delete next.password
    return next
  })

  const withGrace = applyOnlineStatusGrace(merged, previous)
  devices.value = applyStableDeviceOrder(withGrace, previous)
}

const applyRouteQuery = () => {
  const view = route.query.view
  if (view === 'scout' || view === 'topology' || route.query.tab === 'cluster') activeTab.value = 'scout'
  else activeTab.value = 'overview'
}

const handleWsMessage = (res) => {
  if (!res) return
  const action = res.action || res.type
  const data = res.data || {}

  if (action === 'get_device_list') {
    applyDeviceList(data)
  } else if (action === 'device_list_update') {
    applyDeviceList(data?.devices || data)
  }
}

const fetchDeviceList = async () => {
  try {
    const res = await wsGetDeviceList()
    applyDeviceList(res)
    return
  } catch (wsErr) {
    console.warn('[RuntimeStatus] WS device list failed, fallback HTTP', wsErr)
  }
  try {
    const res = await getDeviceList()
    applyDeviceList(res)
  } catch (httpErr) {
    console.warn('[RuntimeStatus] HTTP device list failed', httpErr)
  }
}

const fetchRuntime = async () => {
  if (window.electronAPI?.getRuntimeStatus) {
    try {
      return await window.electronAPI.getRuntimeStatus()
    } catch (_) { /* 网页或 IPC 失败时走 HTTP */ }
  }
  const res = await getRuntimeStatusHttp()
  return res?.data || null
}

const isWebClient = computed(() => !window.electronAPI)
const clientOrigin = computed(() => getBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : ''))

const load = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  try {
    const [runtimeRes, nodeRes] = await Promise.allSettled([
      fetchRuntime(),
      getNodeStatus(),
      fetchDeviceList(),
    ])
    runtime.value = runtimeRes.status === 'fulfilled' ? runtimeRes.value : null
    const wsNode = nodeRes.status === 'fulfilled' ? nodeRes.value?.data : null
    nodeStatus.value = wsNode || runtime.value?.node || null
    lastUpdated.value = new Date().toLocaleTimeString()
  } catch (e) {
    ElMessage.error(e?.message || '状态刷新失败')
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

onMounted(() => {
  addMessageListener(handleWsMessage)
  load()
  applyRouteQuery()
  relativeTimer = setInterval(() => { relativeTimeTick.value += 1 }, 30000)
  pollTimer = setInterval(() => { load({ silent: true }) }, 15000)
})

watch(() => route.query, applyRouteQuery)

onUnmounted(() => {
  removeMessageListener(handleWsMessage)
  if (relativeTimer) clearInterval(relativeTimer)
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="settings-panel runtime-page wide-panel" v-loading="initialLoading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ activeTab === 'scout' ? 'Scout 节点' : '运行与设备' }}</h2>
      </div>
      <div v-if="activeTab !== 'scout'" class="runtime-actions">
        <span class="settings-summary-pill">{{ runtimeSummary }}</span>
      </div>
    </header>

    <template v-if="activeTab === 'overview'">
      <section class="status-grid">
        <article class="settings-card status-card online-card">
          <el-icon class="status-icon electron"><Monitor /></el-icon>
          <div>
            <div class="status-title-row">
              <h3>{{ isWebClient ? '网页' : 'Studio' }}</h3>
              <el-tag :type="statusType(isWebClient || runtime?.electron?.online)" size="small">{{ statusText(isWebClient || runtime?.electron?.online) }}</el-tag>
            </div>
            <p v-if="isWebClient">浏览器预览 · {{ clientOrigin }}</p>
            <p v-else>PID {{ runtime?.electron?.pid || '—' }} · v{{ runtime?.electron?.version || '—' }} · {{ runtime?.electron?.platform || '—' }}</p>
          </div>
        </article>

        <article class="settings-card status-card" :class="{ 'online-card': serviceOnline }">
          <el-icon class="status-icon server"><Cpu /></el-icon>
          <div>
            <div class="status-title-row">
              <h3>Nexus</h3>
              <el-tag :type="statusType(serviceOnline)" size="small">{{ statusText(serviceOnline) }}</el-tag>
            </div>
            <p>{{ serverEndpoint }} · role {{ serverRole }}</p>
          </div>
        </article>

        <article class="settings-card status-card" :class="{ 'online-card': onlineDevices.length }">
          <el-icon class="status-icon executor"><Connection /></el-icon>
          <div>
            <div class="status-title-row">
              <h3>Scout / 设备</h3>
              <el-tag :type="onlineDevices.length ? 'success' : 'info'" size="small">{{ onlineDevices.length }} 在线</el-tag>
            </div>
            <p>{{ executorNodes.length }} 个执行器 · {{ mobileDevices.length }} 台移动设备</p>
          </div>
        </article>
      </section>

      <section class="settings-info-card service-card">
        <span class="settings-kicker">Nexus</span>
        <div class="section-head">
          <h3>已连接的 Nexus</h3>
        </div>
        <div class="discovery-actions">
          <span class="paired-pill">{{ clientOrigin || '未配置' }}</span>
        </div>
      </section>
    </template>

    <template v-else>
      <ScoutNodesPage embedded />
    </template>
  </div>
</template>

<style scoped>
.runtime-page {
  width: 100%;
}

.runtime-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.refresh-pill {
  min-height: 30px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.status-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  min-height: 84px;
  position: relative;
  overflow: hidden;
}

.status-card::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 3px;
  background: #e5e7eb;
}

.status-card.online-card::after {
  background: linear-gradient(90deg, #6366f1, #0ea5e9, #10b981);
}

.status-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.status-card h3 {
  margin: 0;
  font-size: 15px;
  color: #111827;
}

.status-card p {
  margin: 8px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.status-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.status-icon.electron { color: #6366f1; background: #eef2ff; }
.status-icon.server { color: #0ea5e9; background: #e0f2fe; }
.status-icon.executor { color: #10b981; background: #ecfdf5; }

.service-card {
  margin-bottom: 16px;
}

.section-head {
  margin: 6px 0 12px;
}

.section-head h3 {
  margin: 0 0 4px;
  color: #111827;
  font-size: 16px;
}

.section-head span {
  color: #6b7280;
  font-size: 13px;
}

.discovery-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.paired-pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  font-size: 12px;
}

.section-head.with-switch {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section-head.with-switch > div:first-child {
  min-width: 0;
}

.view-mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

.view-mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}

.view-mode-btn.active {
  background: #eff6ff;
  color: #0284c7;
}

.view-mode-btn:hover {
  background: #f3f4f6;
}

:deep(.device-table-clickable .el-table__row.device-row-online) {
  background: #f0fdf4;
}

:deep(.device-table-clickable .el-table__row.device-row-online:hover) {
  background: #dcfce7;
}

:deep(.device-table-clickable .el-table__row.device-row-offline) {
  color: #6b7280;
}

:deep(.device-table-clickable .el-table__row) {
  cursor: pointer;
}

:deep(.device-table-clickable .el-table__row:hover) {
  background: #f8fafc;
}

.row-enter-icon {
  color: #9ca3af;
}

.runtime-table {
  margin-top: 4px;
}

.topology-card {
  margin-top: 16px;
}

.topology-card h3 {
  margin: 0 0 4px;
  color: #111827;
  font-size: 18px;
}

.topology-canvas {
  position: relative;
  height: 720px;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid rgba(199, 210, 254, 0.86);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(239, 246, 255, 0.72));
  user-select: none;
}

.canvas-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: 1px solid rgba(219, 234, 254, 0.9);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(8px);
  color: #64748b;
  font-size: 12px;
  pointer-events: none;
}

.canvas-toolbar strong {
  color: #475569;
}

.runtime-vue-flow {
  width: 100%;
  height: 100%;
  background: transparent;
}

:deep(.runtime-vue-flow .vue-flow__pane),
:deep(.runtime-vue-flow .vue-flow__node),
:deep(.runtime-vue-flow .vue-flow__edge-text) {
  user-select: none;
}

:deep(.runtime-vue-flow .vue-flow__edge-path) {
  stroke-linecap: round;
}

.runtime-flow-node {
  position: relative;
  box-sizing: border-box;
  width: 300px;
  min-height: 96px;
  padding: 12px 14px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}

.runtime-flow-node-host {
  width: 340px;
  padding: 12px;
  border-color: #bfdbfe;
  background: rgba(248, 250, 252, 0.96);
}

.runtime-flow-node-host::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  border-radius: 12px 0 0 12px;
  background: linear-gradient(180deg, #60a5fa, #6366f1);
}

.runtime-flow-node-device {
  width: 300px;
  min-height: 116px;
  border-color: #c7d2fe;
}

.runtime-host-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding-left: 4px;
}

.runtime-host-head strong {
  color: #111827;
  font-size: 14px;
}

.runtime-service-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.runtime-service-mini {
  padding: 10px;
  border: 1px solid #e0e7ff;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.86);
}

.runtime-service-mini p {
  margin: 8px 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.node-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-head strong {
  flex: 1;
  font-size: 13px;
  color: #111827;
}

.node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
}

.node-dot.online {
  background: #10b981;
}

.node-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.node-meta span {
  padding: 2px 6px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 11px;
}

:deep(.runtime-handle) {
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  background: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16);
}

:deep(.runtime-handle-target) {
  left: -5px;
}

:deep(.runtime-handle-source) {
  right: -5px;
}

.topology-detail-card {
  margin-top: 16px;
}

.connection-notes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.connection-notes div {
  padding: 12px;
  border-radius: 12px;
  background: #fbfdff;
  border: 1px solid #edf2f7;
}

.connection-notes strong {
  color: #1f2937;
  font-size: 13px;
}

.connection-notes p {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .status-grid,
  .connection-notes {
    grid-template-columns: 1fr;
  }
}
</style>
