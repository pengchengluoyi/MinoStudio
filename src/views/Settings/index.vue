<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting, Key, Monitor, Operation, Connection } from '@element-plus/icons-vue'
import { Minus, FullScreen, Close } from '@element-plus/icons-vue'
import { rememberSettingsPath, returnFromSettingsPath } from '@/utils/workMode'
import { loadStudioNav, studioNavAllowed } from '@/utils/studioNav'
import { useAppChrome } from '@/composables/useAppChrome'
import '@/layouts/work-shell.css'
import './settings-ui.css'

const route = useRoute()
const router = useRouter()
const { isElectron, showMacTraffic, showWinControls, handleMinimize, handleMaximize, handleClose } = useAppChrome()
const navTick = ref(0)

const allSections = [
  { id: 'runtime', label: '运行与设备', icon: Monitor, to: '/settings/runtime' },
  { id: 'dispatch', label: '调用记录', icon: Operation, to: '/settings/dispatch' },
  { id: 'plugins', label: '插件', icon: Connection, to: '/settings/plugins' },
  { id: 'keys', label: '模型密钥', icon: Key, to: '/settings/keys' },
]

const sections = computed(() => {
  navTick.value
  return allSections.filter((s) => studioNavAllowed(s.id))
})

onMounted(async () => {
  await loadStudioNav()
  navTick.value += 1
})

const runtimeSubNav = [
  { id: 'overview', label: '运行概览' },
  { id: 'scout', label: 'Scout 节点' },
  { id: 'schedule', label: '定时任务', to: { name: 'SettingsSchedule' } },
]

const pluginSubNav = [
  { id: 'all', label: '全部' },
  { id: 'docs', label: '文档' },
  { id: 'im', label: 'IM' },
  { id: 'defect', label: '缺陷' },
  { id: 'design', label: '设计' },
]

const appConfigSubNav = [
  { key: 'env', label: '环境配置' },
  { key: 'flow', label: '阶段模板' },
  { key: 'workflow', label: '角色编排' },
  { key: 'figma', label: '设计稿' },
]

const isActive = (s) => {
  if (s.id === 'runtime') {
    return route.path.startsWith('/settings/runtime')
      || route.path.startsWith('/settings/schedule')
      || route.path.startsWith('/settings/scout')
  }
  if (s.id === 'keys') {
    return route.path.startsWith('/settings/keys') || route.path.startsWith('/settings/ai')
  }
  if (s.id === 'plugins') {
    return route.path.startsWith('/settings/plugins') || route.path.startsWith('/settings/feishu')
  }
  if (s.id === 'system') {
    return route.path.startsWith('/settings/system')
  }
  return route.path === s.to || route.path.startsWith(s.to + '/')
}

const secondaryNav = computed(() => {
  if (route.name === 'SettingsAppConfig') {
    const appId = route.params.appId
    const appName = route.query.appName || '应用'
    return {
      kind: 'app',
      title: appName,
      back: { name: 'TestingApp', params: { appId }, query: { ...route.query, tab: 'config' } },
      items: appConfigSubNav.map((item) => ({
        id: item.key,
        label: item.label,
        to: {
          name: 'SettingsAppConfig',
          params: { appId, section: item.key },
          query: route.query,
        },
      })),
    }
  }
  if (
    (route.path.startsWith('/settings/runtime') && route.name !== 'SettingsDeviceDetail')
    || route.name === 'SettingsSchedule'
  ) {
    return { kind: 'simple', parent: 'runtime', items: runtimeSubNav }
  }
  if (route.path.startsWith('/settings/plugins')) {
    return {
      kind: 'simple',
      parent: 'plugins',
      items: pluginSubNav.map((item) => ({
        id: item.id,
        label: item.label,
        to: {
          name: 'SettingsPlugins',
          query: item.id === 'all' ? {} : { cat: item.id },
        },
      })),
    }
  }
  return null
})

const isSubActive = (item) => {
  if (secondaryNav.value?.kind === 'app') {
    return route.params.section === item.id
  }
  if (secondaryNav.value?.parent === 'runtime') {
    if (item.id === 'schedule') return route.name === 'SettingsSchedule'
    if (item.id === 'scout') {
      return route.name === 'SettingsScout'
        || route.query.view === 'scout'
        || route.query.view === 'topology'
        || route.query.tab === 'cluster'
    }
    if (route.name === 'SettingsSchedule' || route.name === 'SettingsScout') return false
    if (route.query.view === 'scout' || route.query.view === 'topology' || route.query.tab === 'cluster') return false
    const view = route.query.view || 'overview'
    return view === item.id
  }
  if (secondaryNav.value?.parent === 'plugins') {
    const cat = String(route.query.cat || 'all')
    return cat === item.id
  }
  return false
}

const go = (s) => {
  if (s.id === 'runtime') {
    router.push({ path: '/settings/runtime', query: { view: 'overview' } })
    return
  }
  if (s.id === 'keys') {
    router.push({ path: '/settings/keys', query: { tab: 'model-keys' } })
    return
  }
  if (s.id === 'plugins') {
    router.push({ name: 'SettingsPlugins' })
    return
  }
  router.push(s.to)
}

const goSub = (item) => {
  if (secondaryNav.value?.kind === 'app') {
    router.push(item.to)
    return
  }
  const parent = secondaryNav.value?.parent
  if (parent === 'runtime') {
    if (item.id === 'scout') {
      router.replace({ path: '/settings/runtime', query: { view: 'scout' } })
      return
    }
    if (item.to) {
      router.push(item.to)
      return
    }
    router.replace({ path: '/settings/runtime', query: { ...route.query, view: item.id, tab: undefined } })
    return
  }
  if (parent === 'plugins') {
    router.push(item.to)
  }
}

const goAppBack = () => {
  router.push(secondaryNav.value?.back || { name: 'TestingHome' })
}

const leaveSettings = () => {
  router.push(returnFromSettingsPath())
}

watch(
  () => route.fullPath,
  (p) => rememberSettingsPath(p),
  { immediate: true },
)
</script>

<template>
  <div
    class="settings-layout"
    :class="{
      'is-electron': isElectron,
      'has-mac-traffic': showMacTraffic,
      'has-win-controls': showWinControls,
    }"
  >
    <div class="settings-sidebar-col">
      <div class="aside-chrome">
        <div v-if="showMacTraffic" class="mac-traffic-zone" aria-hidden="true" />
        <div class="aside-head">
          <el-icon><Setting /></el-icon>
          <span>设置</span>
        </div>
        <div class="aside-chrome-drag" />
      </div>

      <aside class="settings-aside">
        <nav class="section-nav" aria-label="设置导航">
          <template v-for="s in sections" :key="s.id">
            <button
              type="button"
              class="nav-item"
              :class="{ on: isActive(s) }"
              :title="s.label"
              @click="go(s)"
            >
              <el-icon><component :is="s.icon" /></el-icon>
              <span>{{ s.label }}</span>
            </button>

            <div
              v-if="secondaryNav && secondaryNav.parent === s.id && isActive(s)"
              class="nav-children"
            >
              <button
                v-for="item in secondaryNav.items"
                :key="item.id"
                type="button"
                class="nav-child"
                :class="{ on: isSubActive(item) }"
                @click="goSub(item)"
              >
                {{ item.label }}
              </button>
            </div>
          </template>

          <div v-if="secondaryNav?.kind === 'app'" class="nav-children app-config-nav">
            <button type="button" class="nav-child settings-nav-back" @click="goAppBack">← {{ secondaryNav.title }}</button>
            <button
              v-for="item in secondaryNav.items"
              :key="item.id"
              type="button"
              class="nav-child"
              :class="{ on: isSubActive(item) }"
              @click="goSub(item)"
            >
              {{ item.label }}
            </button>
          </div>
        </nav>

        <button type="button" class="nav-item settings-back-apps" @click="leaveSettings">← 返回工作台</button>
      </aside>
    </div>

    <main class="settings-main">
      <div id="settings-overlay-portal" class="settings-overlay-portal" />
      <router-view />
    </main>

    <div v-if="showWinControls" class="settings-win-controls">
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

<style scoped>
.settings-layout {
  --settings-chrome-h: 52px;
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--mo-canvas);
  position: relative;
}

.settings-sidebar-col {
  width: 248px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--mo-soft);
  border-right: 1px solid var(--mo-border);
  -webkit-app-region: no-drag;
}

.aside-chrome {
  height: var(--settings-chrome-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px 0 0;
  box-sizing: border-box;
  background: transparent;
  -webkit-app-region: no-drag;
  user-select: none;
}

/* Browser / non-Electron: still keep a compact title row */
.settings-layout:not(.is-electron) .aside-chrome {
  height: 44px;
  padding-left: 10px;
}

.mac-traffic-zone {
  width: 78px;
  height: 100%;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  pointer-events: none;
}

.aside-chrome-drag {
  flex: 1;
  min-width: 8px;
  height: 100%;
  -webkit-app-region: drag;
}

.settings-aside {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.aside-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  padding: 0 4px;
  color: var(--mo-primary);
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.section-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.settings-nav-back {
  color: var(--mo-primary);
  font-weight: 600;
}

.settings-back-apps {
  margin-top: auto;
  flex-shrink: 0;
  color: var(--mo-muted);
  font-size: 13px;
}

.settings-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 20px 24px;
  position: relative;
  background: var(--mo-bg);
}

/* Mac: clear traffic lights above main content when sidebar is short */
.settings-layout.has-mac-traffic .settings-main {
  padding-top: calc(14px + 8px);
}

/* Windows / Linux: keep content clear of custom caption buttons */
.settings-layout.has-win-controls .settings-main {
  padding-top: var(--settings-chrome-h);
  padding-right: 12px;
}

.settings-overlay-portal {
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 0;
}

.settings-overlay-portal:not(:empty) {
  z-index: 10001;
}

.settings-overlay-portal:empty {
  display: none;
}

.settings-win-controls {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  height: var(--settings-chrome-h);
  z-index: 30;
  -webkit-app-region: no-drag;
}

.settings-main :deep(.settings-panel) {
  max-width: 1100px;
}

.settings-main :deep(.settings-panel.wide-panel) {
  max-width: none;
  width: 100%;
}

.control-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  color: #666;
}

.control-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}
</style>
