<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  SLOT_KINDS,
  addDays,
  canCreateSlot,
  conflictingSlotIds,
  createSlot,
  dayKey,
  defaultSlotRange,
  formatDayLabel,
  fromDateEnd,
  fromDateStart,
  ganttBarStyle,
  ganttTodayStyle,
  isSameDay,
  isWeekend,
  layoutGanttLanes,
  slotHours,
  barRangeLabel,
  slotKindMeta,
  slotTitle,
  slotTouchesDay,
  startOfWeek,
  toInclusiveDateValue,
  weekDays,
  gateLabel,
} from '@/utils/qaProcess'
import { slicePage, TABLE_PAGE_SIZES } from '@/utils/tablePage'

const props = defineProps({
  slots: { type: Array, default: () => [] },
  requirements: { type: Array, default: () => [] },
  releases: { type: Array, default: () => [] },
  devices: { type: Array, default: () => [] },
  cases: { type: Array, default: () => [] },
  workflow: { type: Object, default: null },
  workflowsByApp: { type: Object, default: () => ({}) },
  labMode: { type: Boolean, default: false },
  appOptions: { type: Array, default: () => [] },
  focusProjectId: { type: String, default: '' },
})

const emit = defineEmits(['save', 'remove', 'open-req', 'open-rel'])

const workflowOf = (req, rel, appId) => {
  if (!props.labMode) return props.workflow
  const id = appId || req?.app_id || rel?.app_id || form.app_id
  return (id && props.workflowsByApp?.[id]) || null
}

const weekStart = ref(startOfWeek())
const days = computed(() => weekDays(weekStart.value))
const today = new Date()
const dialogOpen = ref(false)
const editingId = ref('')
const form = reactive({
  kind: 'req_test',
  app_id: '',
  requirement_id: '',
  release_id: '',
  start_at: '',
  end_at: '',
  note: '',
})

const conflicts = computed(() => conflictingSlotIds(props.slots))
const weekSlots = computed(() => props.slots.filter((s) => days.value.some((d) => slotTouchesDay(s, d))))
const slotPage = ref(1)
const slotPageSize = ref(10)
const pagedWeekSlots = computed(() => slicePage(weekSlots.value, slotPage.value, slotPageSize.value))
watch(() => weekSlots.value.length, () => { slotPage.value = 1 })
const weekLabel = computed(() => {
  const a = days.value[0]
  const b = days.value[6]
  return `${a.getMonth() + 1}/${a.getDate()} – ${b.getMonth() + 1}/${b.getDate()}`
})

const kindOptions = SLOT_KINDS
const visibleAppOptions = computed(() => {
  const list = props.appOptions || []
  if (!props.focusProjectId) return list
  const focused = list.filter((a) => a.projectId === props.focusProjectId)
  return focused.length ? focused : list
})
const reqOptions = computed(() => {
  const list = props.requirements || []
  if (!props.labMode || !form.app_id) return list
  return list.filter((r) => r.app_id === form.app_id)
})
const relOptions = computed(() => {
  const list = props.releases || []
  if (!props.labMode || !form.app_id) return list
  return list.filter((r) => r.app_id === form.app_id)
})
const appLabel = (slotOrId) => {
  const id = typeof slotOrId === 'string' ? slotOrId : slotOrId?.app_id
  const hit = (props.appOptions || []).find((a) => a.id === id)
  if (hit) return hit.projectName ? `${hit.projectName} · ${hit.name}` : hit.name
  return slotOrId?.app_name || ''
}

const workGroups = computed(() => {
  const reqs = [...(props.requirements || [])]
  const seenReq = new Set(reqs.map((r) => r.id))
  const rels = [...(props.releases || [])]
  const seenRel = new Set(rels.map((r) => r.id))
  for (const s of weekSlots.value) {
    if (s.requirement_id && !seenReq.has(s.requirement_id)) {
      seenReq.add(s.requirement_id)
      reqs.push({
        id: s.requirement_id,
        title: s.title || '未命名需求',
        app_id: s.app_id,
        gate: '',
      })
    }
    if (s.release_id && !s.requirement_id && !seenRel.has(s.release_id)) {
      seenRel.add(s.release_id)
      rels.push({
        id: s.release_id,
        title: s.title || '未命名版本',
        app_id: s.app_id,
      })
    }
  }
  const toReqRow = (r) => ({
    type: 'req',
    id: r.id,
    title: r.title,
    app_id: r.app_id,
    gate: r.gate,
  })
  const toRelRow = (r) => ({
    type: 'rel',
    id: r.id,
    title: r.title,
    app_id: r.app_id,
  })
  if (props.labMode) {
    const groups = new Map()
    const ensure = (appId, fallback) => {
      if (!groups.has(appId || '_none')) {
        const app = (props.appOptions || []).find((a) => a.id === appId)
        groups.set(appId || '_none', {
          id: appId || '_none',
          label: app ? (app.projectName ? `${app.projectName} · ${app.name}` : app.name) : (fallback || '未分组'),
          rows: [],
        })
      }
      return groups.get(appId || '_none')
    }
    for (const r of reqs) ensure(r.app_id).rows.push(toReqRow(r))
    for (const r of rels) ensure(r.app_id).rows.push(toRelRow(r))
    const orphan = weekSlots.value.some((s) => !s.requirement_id && !s.release_id)
    if (orphan) {
      ensure('_loose', '未挂对象').rows.push({ type: 'loose', id: '_loose', title: '未挂需求 / 版本' })
    }
    return [...groups.values()].filter((g) => g.rows.length)
  }
  const groups = [
    { id: 'req', label: '需求', rows: reqs.map(toReqRow) },
    { id: 'rel', label: '版本', rows: rels.map(toRelRow) },
  ]
  if (weekSlots.value.some((s) => !s.requirement_id && !s.release_id)) {
    groups.push({
      id: 'loose',
      label: '未挂对象',
      rows: [{ type: 'loose', id: '_loose', title: '未挂需求 / 版本' }],
    })
  }
  return groups.filter((g) => g.rows.length)
})

const workRowLabel = (row) => {
  if (row.type === 'rel') return `版本 · ${row.title}`
  if (row.type === 'loose') return row.title
  const gate = row.gate ? gateLabel('req', row.gate, workflowOf(row)) : ''
  return gate ? `${row.title}` : row.title
}

const workRowSub = (row) => {
  if (row.type === 'rel') return '版本单'
  if (row.gate) return gateLabel('req', row.gate, workflowOf(row))
  return ''
}

const rowSlots = (row) => {
  const list = weekSlots.value
  if (row.type === 'req') return list.filter((s) => s.requirement_id === row.id)
  if (row.type === 'rel') return list.filter((s) => s.release_id === row.id && !s.requirement_id)
  return list.filter((s) => !s.requirement_id && !s.release_id)
}

const rowLanes = (row) => layoutGanttLanes(rowSlots(row))

const rowStats = (row) => {
  const slots = rowSlots(row)
  const hours = slots.reduce((n, s) => n + slotHours(s), 0)
  return { count: slots.length, days: Math.round((hours / 24) * 10) / 10 }
}

const rowTrackHeight = (row) => {
  const n = Math.max(1, rowLanes(row).length)
  return Math.max(48, 10 + n * 28)
}

const laneStyle = (lane, slot) => ({
  ...ganttBarStyle(slot, weekStart.value),
  top: `${6 + lane * 28}px`,
})

const todayLine = computed(() => ganttTodayStyle(weekStart.value, today))

const barText = (slot) => {
  const kind = slotKindMeta(slot.kind).label
  const range = barRangeLabel(slot)
  const name = slotTitle(slot, { requirements: props.requirements, releases: props.releases })
  const app = props.labMode ? appLabel(slot) : ''
  if (!props.labMode) return `${kind}  ${range}`
  return `${app ? `${app} · ` : ''}${name}  ·  ${kind}  ${range}`
}

const isForeign = (slot) => Boolean(
  props.labMode && props.focusProjectId && slot.project_id && slot.project_id !== props.focusProjectId,
)

const onTrackClick = (row, ev) => {
  const rect = ev.currentTarget.getBoundingClientRect()
  const pct = (ev.clientX - rect.left) / Math.max(1, rect.width)
  const dayIndex = Math.min(6, Math.max(0, Math.floor(pct * 7)))
  const day = days.value[dayIndex]
  onWorkCellClick(row, day)
}

const shiftWeek = (n) => {
  weekStart.value = addDays(weekStart.value, n * 7)
}

const resetWeek = () => {
  weekStart.value = startOfWeek()
}

const openCreate = (seed = {}) => {
  const range = defaultSlotRange(seed.day || new Date())
  editingId.value = ''
  form.app_id = seed.app_id || (visibleAppOptions.value.length === 1 ? visibleAppOptions.value[0].id : '')
  form.kind = seed.kind || (relOptions.value.length ? 'rel_test' : 'req_test')
  form.requirement_id = seed.requirement_id || ''
  form.release_id = seed.release_id || ''
  form.start_at = toInclusiveDateValue(seed.start_at || range.start_at)
  form.end_at = toInclusiveDateValue(seed.end_at || range.end_at, { end: true })
  form.note = ''
  dialogOpen.value = true
}

const openEdit = (slot) => {
  editingId.value = slot.id
  form.app_id = slot.app_id || ''
  form.kind = slot.kind
  form.requirement_id = slot.requirement_id || ''
  form.release_id = slot.release_id || ''
  form.start_at = toInclusiveDateValue(slot.start_at)
  form.end_at = toInclusiveDateValue(slot.end_at, { end: true })
  form.note = slot.note || ''
  dialogOpen.value = true
}

const onWorkCellClick = (row, day) => {
  if (row.type === 'loose') {
    openCreate({ day, kind: 'req_review' })
    return
  }
  openCreate({
    day,
    app_id: row.app_id,
    requirement_id: row.type === 'req' ? row.id : '',
    release_id: row.type === 'rel' ? row.id : '',
    kind: row.type === 'rel' ? 'rel_test' : 'req_test',
  })
}

watch(() => form.kind, (kind) => {
  if (kind.startsWith('rel_')) form.requirement_id = ''
  else form.release_id = ''
})

const saveSlot = () => {
  if (!form.start_at || !form.end_at) {
    ElMessage.warning('请填写开始和结束日期')
    return
  }
  if (form.kind.startsWith('req') && !form.requirement_id) {
    ElMessage.warning('请选择需求')
    return
  }
  if (form.kind.startsWith('rel') && !form.release_id) {
    ElMessage.warning('请选择版本')
    return
  }
  if (props.labMode && !form.app_id) {
    ElMessage.warning('请选择应用，排期要落到具体工作台')
    return
  }
  const start = fromDateStart(form.start_at)
  const end = fromDateEnd(form.end_at)
  if (parseWhenSafe(end) <= parseWhenSafe(start)) {
    ElMessage.warning('结束日期不能早于开始日期')
    return
  }
  const req = props.requirements.find((r) => r.id === form.requirement_id)
  const rel = props.releases.find((r) => r.id === form.release_id)
  const gate = canCreateSlot(form.kind, { req, rel, workflow: workflowOf(req, rel) })
  if (!gate.ok) {
    ElMessage.warning(gate.reason)
    return
  }
  const slot = createSlot({
    id: editingId.value,
    kind: form.kind,
    requirement_id: form.requirement_id,
    release_id: form.release_id,
    sns: [],
    start_at: start,
    end_at: end,
    note: form.note,
    title: req?.title || rel?.title || '',
  })
  if (editingId.value) slot.id = editingId.value
  if (form.app_id) slot.app_id = form.app_id
  emit('save', slot)
  dialogOpen.value = false
}

function parseWhenSafe(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

const removeCurrent = async () => {
  if (!editingId.value) return
  try {
    await ElMessageBox.confirm('删除这条排期？不会取消已在跑的任务。', '删除排期', { type: 'warning' })
  } catch { return }
  emit('remove', editingId.value, form.app_id || '')
  dialogOpen.value = false
}

const goProcessFromSlot = (slot) => {
  if (slot.release_id) {
    emit('open-rel', slot.release_id, slot.app_id)
    return
  }
  if (slot.requirement_id) {
    emit('open-req', slot.requirement_id, slot.app_id)
    return
  }
  ElMessage.info('先把排期挂到需求或版本，再到流程里下发')
}

const openLinked = (slot) => {
  if (slot.release_id) emit('open-rel', slot.release_id, slot.app_id)
  else if (slot.requirement_id) emit('open-req', slot.requirement_id, slot.app_id)
}

defineExpose({ openCreate })
</script>

<template>
  <section class="settings-table-card is-fill sch-board">
    <div class="col-head">
      <h3>{{ labMode ? '实验室排期' : '测试排期' }}</h3>
      <div class="col-actions">
        <el-button size="small" @click="shiftWeek(-1)">上一周</el-button>
        <el-button size="small" @click="resetWeek">本周 {{ weekLabel }}</el-button>
        <el-button size="small" @click="shiftWeek(1)">下一周</el-button>
        <el-button size="small" type="primary" @click="openCreate()">新建排期</el-button>
      </div>
    </div>
    <p class="sch-hint">
      排期只预约日期，不占机、不直接开跑。真机下发在「流程」或「任务」里做。
    </p>
    <div class="gantt-wrap">
      <div class="gantt">
        <div class="gantt-head">
          <div class="gantt-label">需求 / 版本</div>
          <div class="gantt-days">
            <div
              v-for="d in days"
              :key="dayKey(d)"
              class="gantt-day-h"
              :class="{ weekend: isWeekend(d), today: isSameDay(d, today) }"
            >
              {{ formatDayLabel(d) }}
            </div>
          </div>
        </div>
        <template v-for="g in workGroups" :key="g.id">
          <div class="gantt-group">{{ g.label }}</div>
          <div
            v-for="row in g.rows"
            :key="`${row.type}-${row.id}`"
            class="gantt-row"
          >
            <div class="gantt-label">
              <strong>
                {{ workRowLabel(row) }}
              </strong>
              <span class="gantt-metrics">
                <template v-if="workRowSub(row)">{{ workRowSub(row) }} · </template>
                排期 {{ rowStats(row).count }}
                <template v-if="rowStats(row).days"> · {{ rowStats(row).days }}天</template>
              </span>
            </div>
            <div
              class="gantt-track"
              :style="{ height: `${rowTrackHeight(row)}px` }"
              @click="onTrackClick(row, $event)"
            >
              <div
                v-for="d in days"
                :key="dayKey(d)"
                class="gantt-col"
                :class="{ weekend: isWeekend(d), today: isSameDay(d, today) }"
              />
              <div v-if="todayLine" class="gantt-now" :style="todayLine" />
              <button
                v-for="item in rowLanes(row)"
                :key="`${item.slot.app_id || ''}-${item.slot.id}`"
                type="button"
                class="gantt-bar"
                :class="{
                  conflict: conflicts.has(item.slot.id),
                  milestone: !slotKindMeta(item.slot.kind).run,
                  foreign: isForeign(item.slot),
                }"
                :style="laneStyle(item.lane, item.slot)"
                :title="barText(item.slot)"
                @click.stop="openEdit(item.slot)"
              >{{ barText(item.slot) }}</button>
            </div>
          </div>
        </template>
      </div>
      <p v-if="!workGroups.length" class="muted empty-dev">还没有需求或版本。先在流程里建单，或点「新建排期」。</p>
    </div>

    <div class="slot-table">
      <h4>本周安排</h4>
      <div class="table-wrap">
        <el-table :data="pagedWeekSlots" border stripe size="small" height="100%" empty-text="本周还没有排期，点日历空格或「新建排期」。">
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ slotKindMeta(row.kind).label }}</template>
        </el-table-column>
        <el-table-column v-if="labMode" label="应用" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ appLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="对象" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openLinked(row)">{{ slotTitle(row, { requirements, releases }) }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="日期" width="170">
          <template #default="{ row }">{{ barRangeLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.note || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="148" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">改</el-button>
            <el-button
              link
              type="primary"
              size="small"
              @click="goProcessFromSlot(row)"
            >去流程</el-button>
          </template>
        </el-table-column>
      </el-table>
      </div>
      <el-pagination
        class="settings-table-pager"
        background
        size="small"
        layout="total, sizes, prev, pager, next"
        :total="weekSlots.length"
        :page-sizes="TABLE_PAGE_SIZES"
        v-model:page-size="slotPageSize"
        v-model:current-page="slotPage"
      />
    </div>

    <el-dialog v-model="dialogOpen" :title="editingId ? '改排期' : '新建排期'" width="520px" class="mo-fit-dialog" align-center append-to-body destroy-on-close>
      <el-form label-position="top">
        <el-form-item v-if="labMode" label="应用" required>
          <el-select
            v-model="form.app_id"
            filterable
            style="width: 100%"
            placeholder="排期保存到哪个应用"
            :disabled="Boolean(editingId)"
            @change="() => { form.requirement_id = ''; form.release_id = '' }"
          >
            <el-option
              v-for="a in visibleAppOptions"
              :key="a.id"
              :label="a.projectName ? `${a.projectName} · ${a.name}` : a.name"
              :value="a.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="排什么">
          <el-select v-model="form.kind" style="width: 100%">
            <el-option v-for="k in kindOptions" :key="k.id" :label="k.label" :value="k.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.kind.startsWith('req')" label="需求" required>
          <el-select v-model="form.requirement_id" filterable style="width: 100%" placeholder="选择要测 / 提审 / 上线的需求">
            <el-option v-for="r in reqOptions" :key="r.id" :label="r.title" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="版本" required>
          <el-select v-model="form.release_id" filterable style="width: 100%" placeholder="选择开始测试 / 上线的版本">
            <el-option v-for="r in relOptions" :key="r.id" :label="r.title" :value="r.id" />
          </el-select>
        </el-form-item>
        <div class="time-row">
          <el-form-item label="开始日期">
            <el-date-picker v-model="form.start_at" type="date" value-format="YYYY-MM-DD" format="MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="结束日期">
            <el-date-picker v-model="form.end_at" type="date" value-format="YYYY-MM-DD" format="MM-DD" style="width: 100%" />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="form.note" placeholder="例如：只跑 Android、夜间优先" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="editingId" type="danger" text @click="removeCurrent">删除</el-button>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" @click="saveSlot">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.sch-board {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.col-head h3 { margin: 0; font-size: 14px; font-weight: 600; flex: 1; color: #111827; }
.col-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.sch-hint { margin: 0 0 8px; font-size: 12px; color: #6b7280; flex-shrink: 0; }
.gantt-wrap {
  flex: 1;
  min-height: 180px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.gantt { min-width: 860px; }
.gantt-head,
.gantt-row {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  align-items: stretch;
}
.gantt-head {
  position: sticky;
  top: 0;
  z-index: 3;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}
.gantt-label {
  padding: 8px 12px;
  border-right: 1px solid #e5e7eb;
  background: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}
.gantt-head .gantt-label {
  font-size: 12px;
  font-weight: 650;
  color: #6b7280;
}
.gantt-label strong {
  font-size: 13px;
  font-weight: 650;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gantt-metrics {
  font-size: 11px;
  color: #9ca3af;
}
.gantt-days,
.gantt-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.gantt-day-h,
.gantt-col {
  border-right: 1px solid #f3f4f6;
}
.gantt-day-h {
  padding: 10px 8px;
  font-size: 12px;
  font-weight: 650;
  color: #374151;
  text-align: center;
}
.gantt-day-h.weekend,
.gantt-col.weekend { background: #f8fafc; }
.gantt-day-h.today { color: #2563eb; }
.gantt-col.today { background: #eff6ff; }
.gantt-group {
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  background: #f9fafb;
  border-bottom: 1px solid #eef2f7;
  letter-spacing: 0.02em;
}
.gantt-row { border-bottom: 1px solid #f3f4f6; }
.gantt-row:hover .gantt-label,
.gantt-row:hover .gantt-track { background: #fafbfc; }
.gantt-track { cursor: pointer; min-height: 48px; }
.gantt-now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #2563eb;
  z-index: 2;
  pointer-events: none;
}
.gantt-bar {
  position: absolute;
  height: 24px;
  border: 1px solid #93c5fd;
  background: #dbeafe;
  color: #1e3a8a;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  z-index: 1;
  line-height: 22px;
}
.gantt-bar.milestone {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #92400e;
}
.gantt-bar.foreign {
  background: #f3f4f6;
  border-color: #e5e7eb;
  color: #6b7280;
}
.gantt-bar.conflict {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}
.muted { color: #94a3b8; }
.empty-dev { padding: 8px 10px; font-size: 12px; }
.slot-table {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 168px;
  max-height: 42%;
  padding-top: 10px;
  padding-bottom: 4px;
  overflow: hidden;
  box-sizing: border-box;
}
.slot-table h4 { margin: 0 0 8px; font-size: 13px; flex-shrink: 0; }
.slot-table .table-wrap { flex: 1 1 0; min-height: 88px; overflow: hidden; }
.slot-table :deep(.el-pagination) {
  margin: 0;
  flex-shrink: 0;
  width: 100%;
}
.time-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
.time-row :deep(.el-form-item) { margin-bottom: 0; }
.time-row :deep(.el-date-editor) { width: 100%; max-width: 100%; }
</style>
