<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Cellphone, Refresh, Monitor, Clock } from '@element-plus/icons-vue'
import { getDeviceList, setDevicePassword } from '@/api/device'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { displayDeviceSn, formatDeviceStatus, formatDeviceType, isDeviceOnline } from '@/utils/deviceDisplay'
import { formatRelativeTime } from '@/utils/relativeTime'
import { dedupeDevicesForUi } from '@/utils/devices'
import SecretField from '@/components/SecretField.vue'
import './settings-ui.css'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const devices = ref([])
const passwordDraft = ref('')
const settingPassword = ref(false)
const relativeTimeTick = ref(0)
let relativeTimer = null

const routeSn = computed(() => decodeURIComponent(String(route.params.sn || '')))

const device = computed(() => {
  const key = routeSn.value
  return devices.value.find((d) => d.sn === key || displayDeviceSn(d) === key) || null
})

const displaySn = computed(() => (device.value ? displayDeviceSn(device.value) : routeSn.value))
const isOnline = computed(() => isDeviceOnline(device.value))
const passwordConfigured = computed(() => Boolean(device.value?.password_configured))

const lastOnlineText = computed(() => {
  void relativeTimeTick.value
  return formatRelativeTime(device.value?.last_online)
})

const statItems = computed(() => {
  if (!device.value) return []
  return [
    { key: 'type', label: '类型', value: formatDeviceType(device.value), icon: Monitor },
    { key: 'model', label: '型号', value: device.value.model || '—', icon: Cellphone },
    { key: 'last', label: '最后在线', value: lastOnlineText.value, icon: Clock },
  ]
})

const applyList = (data) => {
  const list = Array.isArray(data) ? data : (data?.data || [])
  devices.value = dedupeDevicesForUi(list).map((item) => {
    const next = { ...item }
    if (next.password) next.password_configured = true
    delete next.password
    return next
  })
}

const loadDevices = async () => {
  loading.value = true
  try {
    try {
      applyList(await wsGetDeviceList())
    } catch {
      applyList(await getDeviceList())
    }
  } finally {
    loading.value = false
  }
}

const goBack = () => router.push({ name: 'SettingsRuntime', query: { view: 'scout' } })

const savePassword = async () => {
  if (!device.value) return
  const next = String(passwordDraft.value || '').trim()
  if (!next) {
    ElMessage.warning('请填写锁屏密码')
    return
  }
  settingPassword.value = true
  try {
    const res = await setDevicePassword({ sn: device.value.sn, password: next })
    if (res?.code === 200) {
      ElMessage.success('密码已保存')
      passwordDraft.value = ''
      if (device.value) {
        device.value.password_configured = true
        delete device.value.password
      }
    } else {
      ElMessage.error(res?.msg || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    settingPassword.value = false
  }
}

watch(device, (row) => {
  if (!row) return
  passwordDraft.value = ''
})

onMounted(async () => {
  await loadDevices()
  relativeTimer = setInterval(() => { relativeTimeTick.value += 1 }, 30000)
})

onUnmounted(() => {
  if (relativeTimer) clearInterval(relativeTimer)
})
</script>

<template>
  <div class="settings-panel device-detail-page" v-loading="loading">
    <div v-if="!device && !loading" class="empty-state">
      <p>暂无数据</p>
      <el-button @click="goBack">返回列表</el-button>
    </div>

    <template v-else-if="device">
      <header class="settings-page-header">
        <div>
          <button type="button" class="back-link" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            返回设备列表
          </button>
          <h2 class="settings-page-title">{{ displaySn }}</h2>
        </div>
        <div class="hero-actions">
          <span class="status-pill" :class="isOnline ? 'online' : 'offline'">
            {{ formatDeviceStatus(device) }}
          </span>
          <el-button circle :icon="Refresh" @click="loadDevices" />
        </div>
      </header>

      <section class="settings-card hero-card">
        <div class="hero-icon-wrap" :class="{ online: isOnline }">
          <el-icon><Cellphone /></el-icon>
        </div>
        <div class="hero-text">
          <p class="hero-sub">{{ device.model || '—' }} · {{ formatDeviceType(device) }}</p>
        </div>
      </section>

      <section class="stat-grid">
        <article v-for="item in statItems" :key="item.key" class="settings-card stat-card">
          <el-icon class="stat-icon"><component :is="item.icon" /></el-icon>
          <div>
            <span class="stat-label">{{ item.label }}</span>
            <strong class="stat-value">{{ item.value && item.value !== '—' ? item.value : '暂无数据' }}</strong>
          </div>
        </article>
      </section>

      <section class="settings-card">
        <div class="panel-head">
          <h3>锁屏密码</h3>
        </div>
        <SecretField
          v-model="passwordDraft"
          :configured="passwordConfigured"
          placeholder="未设置"
        >
          <template #default="{ showInput }">
            <el-button
              v-if="showInput"
              type="primary"
              :loading="settingPassword"
              @click="savePassword"
            >保存</el-button>
          </template>
        </SecretField>
      </section>
    </template>
  </div>
</template>

<style scoped>
.device-detail-page {
  max-width: 960px;
}

.empty-state {
  padding: 80px 24px;
  text-align: center;
  color: var(--mo-muted);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--mo-muted);
  font-size: 13px;
  cursor: pointer;
}

.back-link:hover {
  color: var(--mo-text);
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hero-card {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.hero-icon-wrap {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--mo-soft);
  color: var(--mo-muted);
  font-size: 26px;
  flex-shrink: 0;
}

.hero-icon-wrap.online {
  background: #ecfdf5;
  color: #059669;
}

.hero-sub {
  margin: 0;
  color: var(--mo-muted);
  font-size: 13px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-pill.online {
  background: #dcfce7;
  color: #15803d;
}

.status-pill.offline {
  background: var(--mo-soft);
  color: var(--mo-muted);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
}

.stat-icon {
  color: var(--mo-primary);
  font-size: 18px;
  margin-top: 2px;
}

.stat-label {
  display: block;
  font-size: 11px;
  color: var(--mo-muted);
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: 14px;
  color: var(--mo-text);
  word-break: break-all;
}

.panel-head {
  margin-bottom: 14px;
}

.panel-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--mo-text);
}
</style>
