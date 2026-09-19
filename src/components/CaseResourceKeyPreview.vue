<script setup>
import { ref, watch } from 'vue'
import { previewResourceKey } from '@/api/projectCases'

const props = defineProps({
  projectId: { type: String, default: '' },
  precondition: { type: String, default: '' },
  platform: { type: String, default: 'android' },
})

const summary = ref('')
const loading = ref(false)

const load = async () => {
  const pre = String(props.precondition || '').trim()
  if (!props.projectId || !pre) {
    summary.value = ''
    return
  }
  loading.value = true
  try {
    const res = await previewResourceKey(props.projectId, {
      precondition: pre,
      platform: props.platform,
    })
    summary.value = res?.data?.summary || ''
  } catch {
    summary.value = ''
  } finally {
    loading.value = false
  }
}

watch(
  () => `${props.projectId}:${props.precondition}:${props.platform}`,
  load,
  { immediate: true },
)
</script>

<template>
  <p v-if="summary || loading" class="rk-preview" v-loading="loading">
    <span class="rk-label">用例密钥</span>
    {{ summary || '—' }}
  </p>
</template>

<style scoped>
.rk-preview {
  margin: 10px 0 0;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.45;
}
.rk-label {
  display: inline-block;
  margin-right: 6px;
  padding: 0 5px;
  border-radius: 4px;
  background: #ede9fe;
  color: #5b21b6;
  font-weight: 600;
}
</style>
