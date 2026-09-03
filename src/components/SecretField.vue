<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  configured: { type: Boolean, default: false },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '未设置' },
  configuredText: { type: String, default: '已配置' },
})

const emit = defineEmits(['update:modelValue'])
const replacing = ref(false)

watch(() => props.configured, (ready) => {
  if (ready) replacing.value = false
})

const showInput = computed(() => !props.configured || replacing.value)

const startReplace = () => {
  replacing.value = true
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="secret-field">
    <el-input
      v-if="showInput"
      :model-value="modelValue"
      type="password"
      autocomplete="new-password"
      :placeholder="placeholder"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <el-input
      v-else
      :model-value="configuredText"
      disabled
      readonly
    />
    <el-button v-if="configured && !replacing" @click="startReplace">更改</el-button>
    <slot :replacing="replacing" :show-input="showInput" />
  </div>
</template>

<style scoped>
.secret-field {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 420px;
}

.secret-field :deep(.el-input) {
  flex: 1;
  min-width: 0;
}
</style>
