<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getNavFsmLiveGraph, planNavRoute } from '@/api/navFsm'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  appId: { type: String, required: true },
  projectId: { type: String, default: '' },
})

const loading = ref(false)
const planning = ref(false)
const graphDoc = ref(null)
const trajectory = ref(null)
const fromState = ref('')
const toState = ref('')
const routeResult = ref(null)

const stateOptions = computed(() => {
  const rows = graphDoc.value?.states || []
  const labels = graphDoc.value?.meta?.tab_bar?.labels || {}
  return rows
    .map((st) => {
      const id = String(st.id || '')
      const tab = labels[id] || ''
      const suffix = tab && !id.includes(tab) ? ` · ${tab}` : ''
      return { id, label: `${id}${suffix}` }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
})

const latestState = computed(() => {
  const steps = trajectory.value?.steps || []
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const sid = String(steps[i]?.localize_chosen || steps[i]?.state_id || '').trim()
    if (sid) return sid
  }
  return ''
})

const load = async () => {
  loading.value = true
  try {
    const res = await getNavFsmLiveGraph(props.appId, {
      sync: false,
      project_id: props.projectId || undefined,
    })
    graphDoc.value = res?.data?.doc || null
    trajectory.value = res?.data?.trajectory || null
    if (!fromState.value && latestState.value) fromState.value = latestState.value
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载导航图失败')
  } finally {
    loading.value = false
  }
}

const onPlan = async () => {
  if (!fromState.value || !toState.value) {
    ElMessage.warning('请选择起点和终点')
    return
  }
  planning.value = true
  routeResult.value = null
  try {
    const res = await planNavRoute(props.appId, {
      from_state: fromState.value,
      to_state: toState.value,
      use_live: true,
      project_id: props.projectId || '',
    })
    routeResult.value = res?.data || null
    if (!routeResult.value?.ok) {
      ElMessage.warning(routeResult.value?.error || '无可用路径')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '路径规划失败')
  } finally {
    planning.value = false
  }
}

const stepLabel = (step) => {
  const exec = step.execute || {}
  const steps = exec.steps || []
  const hint = steps.length ? steps.join(' → ') : '导航'
  return `${step.from} → ${step.to}（${hint}）`
}

onMounted(load)
</script>

<template>
  <div class="nav-test settings-page is-fill" v-loading="loading">
    <section class="settings-card">
      <div class="route-form">
        <div class="field">
          <label>当前页面</label>
          <el-select v-model="fromState" filterable placeholder="选择起点" class="state-select">
            <el-option v-for="opt in stateOptions" :key="opt.id" :label="opt.label" :value="opt.id" />
          </el-select>
          <button v-if="latestState" type="button" class="ghost-pill" @click="fromState = latestState">
            用最近采集：{{ latestState }}
          </button>
        </div>
        <div class="field">
          <label>目标页面</label>
          <el-select v-model="toState" filterable placeholder="选择终点" class="state-select">
            <el-option v-for="opt in stateOptions" :key="`to-${opt.id}`" :label="opt.label" :value="opt.id" />
          </el-select>
        </div>
        <el-button type="primary" :loading="planning" :disabled="!fromState || !toState" @click="onPlan">
          计算最短路线
        </el-button>
      </div>
    </section>

    <section v-if="routeResult?.ok" class="settings-card route-result">
      <div class="result-head">
        <strong>{{ routeResult.hop_count }} 步</strong>
        <span class="muted">{{ routeResult.from_state }} → {{ routeResult.to_state }}</span>
      </div>
      <ol v-if="routeResult.steps?.length" class="route-steps">
        <li v-for="(step, i) in routeResult.steps" :key="step.edge_id || i">{{ stepLabel(step) }}</li>
      </ol>
      <p v-else class="muted">已在目标页面，无需跳转。</p>
    </section>

    <section v-else-if="routeResult && !routeResult.ok" class="settings-card route-fail">
      <p class="error-text">{{ routeResult.error || '无法到达目标页面' }}</p>
      <div v-if="routeResult.target_incoming?.length" class="incoming">
        <span class="muted">已知进入「{{ routeResult.to_state }}」的路径来自：</span>
        <span v-for="src in routeResult.target_incoming" :key="src" class="incoming-pill">{{ src }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.nav-test {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 4px 8px;
  min-height: 0;
}

.hint {
  margin: 0 0 12px;
  color: var(--mo-muted, #64748b);
  font-size: 13px;
}

.route-form {
  display: grid;
  gap: 12px;
  max-width: 640px;
}

.field {
  display: grid;
  gap: 6px;
}

.field label {
  font-size: 13px;
  font-weight: 600;
}

.state-select {
  width: 100%;
}

.ghost-pill {
  justify-self: start;
  border: 1px dashed var(--mo-border, #e2e8f0);
  background: transparent;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.route-result .result-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.route-steps {
  margin: 0;
  padding-left: 1.2rem;
  display: grid;
  gap: 8px;
}

.error-text {
  color: #dc2626;
  margin: 0 0 8px;
}

.route-fail .incoming {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin: 8px 0;
}

.incoming-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  font-size: 11px;
}
</style>
