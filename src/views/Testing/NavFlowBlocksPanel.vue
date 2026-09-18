<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getAppFlowBlockOverrides,
  getFlowBlockCatalog,
  putAppFlowBlockOverrides,
} from '@/api/flowBlocks'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  appId: { type: String, required: true },
  appName: { type: String, default: '' },
})

const loading = ref(false)
const saving = ref(false)
const catalog = ref([])
const overrides = ref([])

const loginOverride = computed(() => {
  const row = overrides.value.find((o) => o.global_block_id === 'fb.global.login')
  return row || { global_block_id: 'fb.global.login', mode: 'inherit', skip_step_ids: [] }
})

const skipLegal = computed({
  get: () => (loginOverride.value.skip_step_ids || []).includes('legal_consent'),
  set: (on) => {
    const ids = new Set(loginOverride.value.skip_step_ids || [])
    if (on) ids.add('legal_consent')
    else ids.delete('legal_consent')
    upsertOverride({ ...loginOverride.value, skip_step_ids: [...ids], mode: 'replace_steps' })
  },
})

function upsertOverride(row) {
  const rest = overrides.value.filter((o) => o.global_block_id !== row.global_block_id)
  overrides.value = [...rest, row]
}

async function load() {
  loading.value = true
  try {
    const [catRes, ovRes] = await Promise.all([
      getFlowBlockCatalog(),
      getAppFlowBlockOverrides(props.appId),
    ])
    catalog.value = catRes?.data?.items || catRes?.items || []
    overrides.value = ovRes?.data?.overrides || ovRes?.overrides || []
  } catch (e) {
    ElMessage.error(e?.message || '加载逻辑块失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await putAppFlowBlockOverrides(props.appId, overrides.value)
    ElMessage.success('已保存应用逻辑块覆盖（写入 NavFSM draft）')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

watch(() => props.appId, load, { immediate: true })
onMounted(load)
</script>

<template>
  <div class="nav-flow-blocks settings-panel">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">逻辑块</h2>
        <p class="settings-page-desc muted">
          通用能力（登录、系统弹窗）在服务端统一维护，不在架构图展示。此处仅为
          {{ appName || '当前应用' }} 配置覆盖。
        </p>
      </div>
      <el-button type="primary" :loading="saving" @click="save">保存覆盖</el-button>
    </header>

    <el-skeleton v-if="loading" :rows="4" animated />

    <section v-else class="blocks-section">
      <h3 class="section-title">通用库（只读）</h3>
      <el-table :data="catalog" size="small" border>
        <el-table-column prop="block_id" label="ID" min-width="180" />
        <el-table-column prop="display_name" label="名称" min-width="120" />
        <el-table-column prop="description" label="说明" min-width="240" show-overflow-tooltip />
      </el-table>

      <h3 class="section-title">应用覆盖 · 登录流</h3>
      <div class="override-row">
        <el-checkbox v-model="skipLegal">跳过「勾选/同意协议」步骤（legal_consent）</el-checkbox>
        <p class="muted hint">
          默认顺序：发验证码 → 协议勾选 →（可选）取码。无协议框的应用可勾选此项。
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.nav-flow-blocks {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  padding: 0 4px 16px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 16px 0 8px;
}
.override-row {
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
}
</style>
