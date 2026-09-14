<script setup>
import { computed, ref, watch } from 'vue'
import NavFsmWireframe from '@/views/Testing/NavFsmWireframe.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: 'preview' },
  title: { type: String, default: '' },
  jsonText: { type: String, default: '' },
  wireframe: { type: Object, default: null },
  appId: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'apply', 'save'])

const draft = ref('')
watch(
  () => [props.visible, props.jsonText],
  () => {
    if (props.visible) draft.value = props.jsonText || ''
  },
)

const isPreview = computed(() => props.mode === 'preview')
const isEdit = computed(() => props.mode === 'edit')

const close = () => emit('update:visible', false)

const onApply = () => {
  emit('apply', draft.value)
}

const onSave = () => {
  emit('save', draft.value)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="title || (isPreview ? '页面预览' : '编辑状态')"
    width="min(96vw, 560px)"
    class="nav-graph-inspect-dialog"
    destroy-on-close
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <div v-if="isPreview && wireframe" class="preview-wrap">
      <NavFsmWireframe
        :wireframe="wireframe"
        :turn-label="title"
        :app-id="appId"
        :state-id="''"
        :connect-hotspots="false"
        preview
      />
    </div>
    <el-input
      v-if="isEdit"
      v-model="draft"
      type="textarea"
      :rows="16"
      spellcheck="false"
      class="json-area"
    />
    <template #footer>
      <el-button @click="close">关闭</el-button>
      <template v-if="isEdit">
        <el-button type="primary" @click="onApply">应用</el-button>
        <el-button type="success" @click="onSave">应用并保存</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.preview-wrap {
  max-height: 82vh;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 4px 0 8px;
}

:deep(.nav-wireframe.is-preview .wire-canvas) {
  width: min(100%, 440px);
  max-width: 440px;
  min-height: min(78vh, 820px);
  height: auto;
  aspect-ratio: 9 / 16;
}

:deep(.nav-wireframe.is-preview .wire-label) {
  font-size: 9px;
}

.json-area {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
</style>
