<script setup>
import { computed } from 'vue'
import NavFsmPanel from '@/views/Testing/NavFsmPanel.vue'
import NavFlowBlocksPanel from '@/views/Testing/NavFlowBlocksPanel.vue'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '' },
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  section: { type: String, default: 'arch' },
})

const SECTIONS = {
  arch: { title: '架构', desc: '' },
  'flow-blocks': { title: '逻辑块', desc: '通用登录/系统弹窗与按应用覆盖' },
}

const panelSection = computed(() => (
  props.section === 'flow-blocks' ? 'flow-blocks' : 'arch'
))

const meta = computed(() => SECTIONS[panelSection.value] || SECTIONS.arch)
</script>

<template>
  <div class="nav-workbench settings-panel wide-panel">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">导航 · {{ meta.title }}</h2>
        <p v-if="meta.desc" class="settings-page-desc">{{ meta.desc }}</p>
      </div>
    </header>

    <NavFlowBlocksPanel
      v-if="panelSection === 'flow-blocks'"
      :app-id="appId"
      :app-name="appName"
    />
    <NavFsmPanel
      v-else
      section="arch"
      :app-id="appId"
      :project-id="projectId"
      :project-name="projectName"
      :app-name="appName"
    />
  </div>
</template>

<style scoped>
.nav-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.nav-workbench > :deep(.nav-fsm-panel),
.nav-workbench > :deep(.nav-test) {
  flex: 1;
  min-height: 0;
}
</style>
