<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hideQaMindmapWiki } from '@/api/appAutomation'
import { openExternalUrl } from '@/utils/openExternal'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  requirement: { type: Object, default: null },
  appId: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'updated'])

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const invalidating = ref(false)

const allRows = computed(() => {
  const list = props.requirement?.mindmap_wiki_history
  if (Array.isArray(list) && list.length) return list
  const cur = props.requirement?.mindmap_wiki
  if (!cur?.url) return []
  return [{
    url: cur.url,
    node_token: cur.node_token,
    title: cur.title,
    folder: cur.folder,
    nodes: cur.nodes,
    at: cur.updated_at,
    retired: false,
    invalid: false,
    dialogue: cur.dialogue || '',
  }]
})

/** 主列表：未失效（含当前 / 已归档） */
const activeRows = computed(() => allRows.value.filter((r) => !r?.invalid))

/** 失效列表 */
const invalidRows = computed(() => allRows.value.filter((r) => r?.invalid))

const currentToken = computed(() => props.requirement?.mindmap_wiki?.node_token || '')

const isCurrent = (row) => Boolean(row?.node_token && row.node_token === currentToken.value && !row?.invalid)

const dialogueOf = (row) => {
  const direct = String(row?.dialogue || row?.retry_note || '').trim()
  if (direct) return direct
  const at = String(row?.at || '')
  const hist = props.requirement?.cover_history
  if (!Array.isArray(hist) || !at) return ''
  const target = Date.parse(at)
  if (Number.isNaN(target)) return ''
  let best = ''
  let bestDelta = Infinity
  for (const h of hist) {
    if (!h || h.job !== 'draft_mindmap') continue
    const note = String(h.note || '').trim()
    if (!note) continue
    const t = Date.parse(h.at || '')
    if (Number.isNaN(t)) continue
    const delta = Math.abs(t - target)
    if (delta > 6 * 3600 * 1000) continue
    if (delta < bestDelta) {
      bestDelta = delta
      best = note
    }
  }
  return best
}

const formatAt = (value) => {
  const d = new Date(String(value || ''))
  if (Number.isNaN(d.getTime())) return String(value || '—')
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const copyDialogue = async (row) => {
  const text = dialogueOf(row)
  if (!text) {
    ElMessage.warning('这条记录没有重试评论')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制重试文案')
  } catch {
    ElMessage.error('复制失败')
  }
}

const invalidateCurrent = async (row) => {
  if (!props.appId || !props.requirement?.id || invalidating.value) return
  if (!isCurrent(row)) {
    ElMessage.warning('只能把「当前」这篇设为失效')
    return
  }
  const idx = activeRows.value.findIndex((r) => r?.node_token === row.node_token)
  const prev = idx >= 0
    ? activeRows.value.slice(idx + 1).find((r) => r?.node_token && r.node_token !== row.node_token && !r?.invalid)
    : null
  if (!prev) {
    ElMessage.warning('没有上一份有效脑图可恢复为当前')
    return
  }
  try {
    await ElMessageBox.confirm(
      `设为失效后这篇会移入下方失效列表，上一份「${prev.title || '脑图'}」变成当前，应用内脑图也会切回那一版。飞书里这篇会尽量改成旧版名称。`,
      '设为失效',
      { type: 'warning', confirmButtonText: '设为失效', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  invalidating.value = true
  try {
    const res = await hideQaMindmapWiki(props.appId, {
      requirement_id: props.requirement.id,
      node_token: row.node_token || '',
    })
    const data = res?.data || res || {}
    if (data.qa_process) emit('updated', data.qa_process)
    ElMessage.success(data.mindmap_restored ? '已设为失效，上一份脑图已恢复为当前' : '已设为失效，上一份已设为当前')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '设为失效失败')
  } finally {
    invalidating.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    title="飞书写入历史"
    width="860px"
    class="mo-fit-dialog"
    align-center
    append-to-body
    destroy-on-close
  >
    <p class="hist-hint">
      每次点「写入飞书 Wiki」都会记一条。飞书没有删除接口，旧文档只能改名让开。
      「设为失效」会把<strong>当前</strong>这篇移入下方失效列表，并把上一份有效记录恢复为当前（含应用内脑图）；
      之后点「重试脑图」只作用于状态为「当前」的那一版。「复制对话」复制该次重试时输入的评论。
    </p>

    <h4 class="hist-section-title">有效记录</h4>
    <el-table :data="activeRows" border stripe size="small" max-height="280" empty-text="还没有写入记录">
      <el-table-column label="时间" width="110">
        <template #default="{ row }">{{ formatAt(row.at) }}</template>
      </el-table-column>
      <el-table-column label="文档" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <a
            v-if="row.url"
            href="#"
            class="hist-link"
            @click.prevent="openExternalUrl(row.url)"
          >{{ row.title || '打开飞书脑图' }}</a>
          <span v-else>{{ row.title || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="节点" width="64">
        <template #default="{ row }">{{ row.nodes || 0 }}</template>
      </el-table-column>
      <el-table-column label="状态" width="88">
        <template #default="{ row }">
          <el-tag v-if="isCurrent(row)" type="success" size="small" effect="plain">当前</el-tag>
          <el-tag v-else-if="row.retired" type="info" size="small" effect="plain">已归档</el-tag>
          <span v-else class="muted">历史</span>
        </template>
      </el-table-column>
      <el-table-column label="目录" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.folder || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="168" fixed="right">
        <template #default="{ row }">
          <div class="hist-actions">
            <el-button
              link
              type="primary"
              size="small"
              :disabled="!dialogueOf(row)"
              @click="copyDialogue(row)"
            >复制对话</el-button>
            <el-button
              v-if="isCurrent(row)"
              link
              type="warning"
              size="small"
              :loading="invalidating"
              @click="invalidateCurrent(row)"
            >设为失效</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <h4 class="hist-section-title hist-section-title--invalid">失效列表</h4>
    <el-table :data="invalidRows" border stripe size="small" max-height="200" empty-text="暂无失效记录">
      <el-table-column label="时间" width="110">
        <template #default="{ row }">{{ formatAt(row.at) }}</template>
      </el-table-column>
      <el-table-column label="文档" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <a
            v-if="row.url"
            href="#"
            class="hist-link"
            @click.prevent="openExternalUrl(row.url)"
          >{{ row.title || '打开飞书脑图' }}</a>
          <span v-else>{{ row.title || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="节点" width="64">
        <template #default="{ row }">{{ row.nodes || 0 }}</template>
      </el-table-column>
      <el-table-column label="状态" width="88">
        <template #default>
          <el-tag type="danger" size="small" effect="plain">已失效</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="目录" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.folder || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            size="small"
            :disabled="!dialogueOf(row)"
            @click="copyDialogue(row)"
          >复制对话</el-button>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button type="primary" @click="open = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.hist-hint {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.55;
}
.hist-section-title {
  margin: 8px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.hist-section-title--invalid {
  margin-top: 18px;
}
.hist-link {
  color: var(--el-color-primary);
}
.muted {
  color: #94a3b8;
  font-size: 12px;
}
.hist-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
  align-items: center;
}
</style>
