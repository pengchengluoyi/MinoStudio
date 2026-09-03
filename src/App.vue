<template>
  <div class="app-root">
    <TitleBar v-if="!hideGlobalTitlebar" />

    <div class="content-area" :class="{ 'is-settings': hideGlobalTitlebar }">
      <router-view />
    </div>

    <CopilotWidget v-if="showCopilotWidget" />
    <CommandPalette ref="commandPaletteRef" />
    <UpdatePrompt />
    <GlobalAlert />
    <GlobalHitlDialog />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import UpdatePrompt from './components/UpdatePrompt.vue'
import GlobalAlert from './components/GlobalAlert.vue'
import TitleBar from './components/Core/TitleBar.vue'
import CommandPalette from './components/Core/CommandPalette.vue'
import CopilotWidget from './components/Ai/CopilotWidget.vue'
import GlobalHitlDialog from './components/GlobalHitlDialog.vue'
import { bootstrapRealtime } from '@/utils/realtime'
import { reportOverlayOpen } from '@/composables/useOverlayState'

const route = useRoute()
const commandPaletteRef = ref(null)
const isSettingsRoute = computed(() => route.path.startsWith('/settings'))
const isWorkShellRoute = computed(() => (
  route.name === 'Dialogue' ||
  route.meta?.workMode === 'agent' ||
  route.meta?.workMode === 'testing' ||
  route.path.startsWith('/testing')
))
const isGuestRoute = computed(() => (
  route.name === 'Login' ||
  !!route.meta?.requiresGuest ||
  route.path === '/' ||
  route.path === '/login' ||
  !route.matched.length
))
const hideGlobalTitlebar = computed(() => (
  isSettingsRoute.value || isWorkShellRoute.value || isGuestRoute.value
))
const showCopilotWidget = computed(() => (
  !!route.meta?.requiresAuth &&
  route.name !== 'Dialogue' &&
  route.name !== 'Login' &&
  !route.path.startsWith('/testing') &&
  route.meta?.workMode !== 'testing' &&
  !route.meta?.requiresGuest &&
  !isGuestRoute.value &&
  !reportOverlayOpen.value
))

const handleGlobalKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    commandPaletteRef.value?.open()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  bootstrapRealtime()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style>
body {
  margin: 0;
  padding: 0;
  background: var(--mo-bg);
  font-family: var(--el-font-family);
  overflow: hidden;
}

.app-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.content-area {
  width: 100%;
  height: 100vh;
  padding-top: 50px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

.content-area.is-settings {
  padding-top: 0;
}

.content-area.is-settings > * {
  height: 100%;
  min-height: 0;
}
</style>
