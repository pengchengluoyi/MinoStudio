<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getTaskResourceRestoreLogs,
  restoreTaskResourceLog,
} from '@/api/caseRunner'
import {
  canRestoreResourceLog,
  formatResourceLogTime,
  unwrapListPayload,
} from '@/utils/resourceLogRestore'

const props = defineProps({
  taskId: { type: String, required: true },
  caseId: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['open-logs'])

const loading = ref(false)
const restoringId = ref(null)
const rows = ref([])
const projectId = ref('')

const load = async () => {
  const tid = String(props.taskId || '').trim()
  if (!tid) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    const res = await getTaskResourceRestoreLogs(tid, {
      page_size: 30,
      case_id: props.caseId || undefined,
    })
    const payload = unwrapListPayload(res)
    rows.value = payload.items
    projectId.value = payload.project_id
  } catch (e) {
    rows.value = []
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载任务资源日志失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.taskId, props.caseId],
  () => load(),
  { immediate: true },
)

const restoreRow = async (row) => {
  if (!canRestoreResourceLog(row)) {
    ElMessage.warning('该条日志没有可恢复快照')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将账号 ${row.account_ident || row.account_id || '—'} 的模板状态恢复为该条变更前的快照？`,
      '从任务恢复号池数据',
      { type: 'warning' },
    )
  } catch {
    return
  }
  restoringId.value = row.id
  try {
    await restoreTaskResourceLog(props.taskId, row.id)
    ElMessage.success('已恢复到变更前状态')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '恢复失败')
  } finally {
    restoringId.value = null
  }
}

const openLogs = () => {
  emit('open-logs', { run_id: props.taskId, project_id: projectId.value })
}
</script>

<template>
  <section class="task-restore-panel" :class="{ compact }">
    <div class="task-restore-head">
      <div>
        <div class="settings-kicker">号池数据恢复</div>
        <p class="task-restore-lead">
          本任务执行过程中写入的<strong>模板状态变更</strong>可一键回滚到变更前（facets 与参数字段）。
        </p>
      </div>
      <el-button size="small" @click="openLogs">资源日志</el-button>
    </div>
    <el-table
      v-loading="loading"
      :data="rows"
      size="small"
      border
      stripe
      empty-text="暂无模板变更记录（跑批写回或任务内改模板参数后会出现）"
    >
      <el-table-column label="时间" width="156">
        <template #default="{ row }">{{ formatResourceLogTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column prop="case_id" label="用例" min-width="100" show-overflow-tooltip />
      <el-table-column prop="account_ident" label="账号" width="108" show-overflow-tooltip />
      <el-table-column prop="message" label="说明" min-width="140" show-overflow-tooltip />
      <el-table-column label="恢复" width="72" align="center">
        <template #default="{ row }">
          <el-button
            v-if="canRestoreResourceLog(row)"
            link
            type="primary"
            size="small"
            :loading="restoringId === row.id"
            @click="restoreRow(row)"
          >
            恢复
          </el-button>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<style scoped>
.task-restore-panel {
  margin-top: 10px;
}
.task-restore-panel.compact {
  margin-top: 8px;
}
.task-restore-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.task-restore-lead {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--mo-muted, #6b7280);
  line-height: 1.45;
}
.muted {
  color: var(--mo-muted, #9ca3af);
}
</style>
