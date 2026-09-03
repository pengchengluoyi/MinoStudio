<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Fold, Expand, Setting, SwitchButton, Search, Plus, Minus, FullScreen, Close } from '@element-plus/icons-vue'
import { useAppChrome } from '@/composables/useAppChrome'
import { getDeviceList } from '@/api/device'
import { getAuthStatus, logoutAccount } from '@/api/auth'
import { clearRealtimeTokens } from '@/utils/realtime'
import {
  lastAgentPath,
  lastTestingPath,
  openSettingsRemembering,
  rememberAgentPath,
  rememberTestingPath,
} from '@/utils/workMode'
import { loadStudioNav, studioNavAllowed } from '@/utils/studioNav'
import './work-shell.css'

const props = defineProps({
  mode: { type: String, required: true }, // 'agent' | 'testing'
  createTitle: { type: String, default: '新建' },
  showCreate: { type: Boolean, default: true },
})

const emit = defineEmits(['search', 'create'])

const route = useRoute()
const router = useRouter()
const collapsed = ref(localStorage.getItem('work-shell-collapsed') === '1')
const { isElectron, showMacTraffic, showWinControls, handleMinimize, handleMaximize, handleClose } = useAppChrome()
const accountMenuOpen = ref(false)
const deviceCount = ref(0)
const accountName = ref('Mino Studio')
const showAgent = ref(true)
const showTesting = ref(true)

onMounted(async () => {
  try {
    const r = await getDeviceList()
    const list = Array.isArray(r) ? r : (r?.data || r?.data?.devices || [])
    deviceCount.value = list.length || 0
  } catch (_) {
    deviceCount.value = 0
  }
  try {
    const auth = await getAuthStatus()
    const who = auth?.data?.name || auth?.data?.email || auth?.data?.username
    if (who) accountName.value = who
  } catch (_) { /* keep default */ }
  try {
    await loadStudioNav()
    showAgent.value = studioNavAllowed('agent')
    showTesting.value = studioNavAllowed('testing')
  } catch (_) { /* keep default */ }
})

watch(
  () => route.fullPath,
  (p) => {
    if (props.mode === 'testing') rememberTestingPath(p)
    if (props.mode === 'agent') rememberAgentPath(p)
  },
  { immediate: true },
)

const modeValue = computed(() => (props.mode === 'testing' ? 'testing' : 'agent'))

const setMode = (id) => {
  if (id === 'agent') router.push(lastAgentPath())
  else router.push(lastTestingPath().startsWith('/testing') ? lastTestingPath() : '/testing')
}

const toggleAside = () => {
  collapsed.value = !collapsed.value
  localStorage.setItem('work-shell-collapsed', collapsed.value ? '1' : '0')
}

const openSettings = () => openSettingsRemembering(router, route.fullPath)

const handleLogout = async () => {
  accountMenuOpen.value = false
  try {
    await logoutAccount()
  } catch (_) { /* 本地清会话即可 */ }
  clearRealtimeTokens()
  router.push({ name: 'Login' })
}
</script>

<template>
  <div class="work-shell" :class="{ 'is-collapsed': collapsed, 'is-electron': isElectron }">
    <div class="work-sidebar-col">
      <div class="work-aside-chrome">
        <div v-if="showMacTraffic" class="work-mac-traffic" aria-hidden="true" />
        <div class="work-chrome-drag" />
        <div class="work-chrome-cluster">
          <button
            type="button"
            class="work-chrome-btn is-on"
            title="收起侧栏"
            @click="toggleAside"
          >
            <el-icon><Fold /></el-icon>
          </button>
          <button type="button" class="work-chrome-btn" title="搜索" @click="emit('search')">
            <el-icon><Search /></el-icon>
          </button>
          <button v-if="showCreate" type="button" class="work-chrome-btn" :title="createTitle" @click="emit('create')">
            <el-icon><Plus /></el-icon>
          </button>
        </div>
      </div>

      <aside class="work-aside">
        <div class="mode-switch" role="tablist" aria-label="工作面">
          <button
            v-if="showAgent"
            type="button"
            role="tab"
            :aria-selected="modeValue === 'agent'"
            :class="{ on: modeValue === 'agent' }"
            @click="setMode('agent')"
          >
            Agent
          </button>
          <button
            v-if="showTesting"
            type="button"
            role="tab"
            :aria-selected="modeValue === 'testing'"
            :class="{ on: modeValue === 'testing' }"
            @click="setMode('testing')"
          >
            测试
          </button>
        </div>

        <div class="work-aside-mid">
          <slot name="sidebar" />
        </div>

        <div class="work-side-footer-wrap">
          <div v-if="accountMenuOpen" class="work-account-popover">
            <button type="button" class="work-menu-item danger" @click="handleLogout">
              <el-icon><SwitchButton /></el-icon>
              <span>退出登录</span>
            </button>
          </div>
          <div class="work-side-footer">
            <button
              type="button"
              class="work-account-mini"
              :class="{ active: accountMenuOpen }"
              @click="accountMenuOpen = !accountMenuOpen"
            >
              <div>
                <strong>{{ accountName }}</strong>
                <span>{{ deviceCount }} 台设备</span>
              </div>
              <span class="work-account-status" :class="{ active: deviceCount }">{{ deviceCount ? '在线' : '空闲' }}</span>
            </button>
            <button type="button" class="work-settings-btn" title="设置" @click="openSettings">
              <el-icon><Setting /></el-icon>
            </button>
          </div>
        </div>
      </aside>
    </div>

    <main class="work-main">
      <div v-if="collapsed" class="work-main-chrome">
        <div v-if="showMacTraffic" class="work-mac-traffic" aria-hidden="true" />
        <div class="work-chrome-drag" />
        <div class="work-chrome-cluster">
          <button
            type="button"
            class="work-chrome-btn"
            title="展开侧栏"
            @click="toggleAside"
          >
            <el-icon><Expand /></el-icon>
          </button>
          <button type="button" class="work-chrome-btn" title="搜索" @click="emit('search')">
            <el-icon><Search /></el-icon>
          </button>
          <button v-if="showCreate" type="button" class="work-chrome-btn" :title="createTitle" @click="emit('create')">
            <el-icon><Plus /></el-icon>
          </button>
        </div>
      </div>
      <div class="work-main-slot">
        <slot />
      </div>
    </main>

    <div v-if="showWinControls" class="work-win-controls">
      <div class="control-btn minimize" @click="handleMinimize">
        <el-icon><Minus /></el-icon>
      </div>
      <div class="control-btn maximize" @click="handleMaximize">
        <el-icon><FullScreen /></el-icon>
      </div>
      <div class="control-btn close" @click="handleClose">
        <el-icon><Close /></el-icon>
      </div>
    </div>
  </div>
</template>
