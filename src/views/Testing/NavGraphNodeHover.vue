<script setup>
import { computed } from 'vue'
import NavFsmWireframe from '@/views/Testing/NavFsmWireframe.vue'

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  wireframe: { type: Object, default: null },
  appId: { type: String, default: '' },
  stateId: { type: String, default: '' },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
})

const emit = defineEmits(['preview', 'edit', 'close'])

const style = computed(() => ({
  left: `${Math.max(8, props.x)}px`,
  top: `${Math.max(8, props.y)}px`,
}))

const hasWireframe = computed(() => Boolean((props.wireframe?.regions || []).length))
</script>

<template>
  <div class="nav-node-hover" :style="style" @mouseenter.stop @mouseleave="emit('close')">
    <div class="hover-title">{{ title }}</div>
    <div v-if="subtitle" class="hover-sub muted">{{ subtitle }}</div>
    <div v-if="hasWireframe" class="hover-preview">
      <NavFsmWireframe
        :wireframe="wireframe"
        :app-id="appId"
        :state-id="stateId"
        :connect-hotspots="false"
        preview
      />
    </div>
    <div class="hover-actions">
      <el-button size="small" type="primary" @click="emit('preview')">预览</el-button>
      <el-button size="small" @click="emit('edit')">编辑</el-button>
    </div>
  </div>
</template>

<style scoped>
.nav-node-hover {
  position: fixed;
  z-index: 4000;
  min-width: 200px;
  max-width: 300px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #cbd5e1;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  pointer-events: auto;
}

.hover-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  word-break: break-word;
}

.hover-sub {
  font-size: 11px;
  margin-top: 4px;
}

.hover-preview {
  margin-top: 8px;
  max-height: 360px;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.hover-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.muted {
  color: #64748b;
}
</style>
