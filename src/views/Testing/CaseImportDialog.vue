<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { commitCaseImport, previewCaseImport } from '@/api/projectCases'
import { getProjectEnv } from '@/api/workReport'
import {
  detectHeaderRow,
  FLAG_LABELS,
  headerRowLooksValid,
  suggestColumnMap,
  suggestSkipRows,
} from '@/utils/caseImportTable'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectId: { type: String, default: '' },
  requirementId: { type: String, default: '' },
  requirements: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'imported'])

const step = ref('file')
const pickedReqId = ref('')
const tableData = ref([])
const filename = ref('')
const headerRow = ref(0)
const skipRows = ref(new Set())
const columnMap = ref({})
const previewToken = ref('')
const previewRows = ref([])
const previewMeta = ref({})
const defaultConflict = ref('skip')
const submitting = ref(false)
const parsing = ref(false)
const fileRef = ref(null)
const importPlatforms = ref([])
const defaultImportPlatform = ref('')

const FIELD_OPTS = [
  { key: 'case_id', label: '编号' },
  { key: 'name', label: '名称' },
  { key: 'module', label: '模块' },
  { key: 'platform', label: '端' },
  { key: 'precondition', label: '前置条件' },
  { key: 'steps', label: '测试步骤' },
  { key: 'expected', label: '预期效果' },
]

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const headerLabels = computed(() => {
  const row = tableData.value[headerRow.value] || []
  return row.map((cell, i) => String(cell || '').trim() || `列${i + 1}`)
})

const headerRowOk = computed(() => headerRowLooksValid(headerLabels.value))

const mappedColSet = computed(() => new Set(Object.values(columnMap.value).filter((v) => v != null)))

const maxCols = computed(() => Math.max(0, ...tableData.value.map((r) => r.length)))

const conflictCount = computed(() => previewRows.value.filter((r) => r.conflict).length)

const headerHint = computed(() => headerLabels.value.filter(Boolean).slice(0, 8).join(' · '))

const platformColumnMapped = computed(() => {
  const v = columnMap.value.platform
  return v !== undefined && v !== null && v !== ''
})

const platformLabelFor = (id) => {
  const key = String(id || '').trim()
  if (!key) return '—'
  const hit = importPlatforms.value.find((p) => p.id === key)
  return hit?.label || key
}

const effectivePlatform = (row) => {
  const fromRow = String(row?.platform || row?.payload?.platform || '').trim()
  if (fromRow) return fromRow
  return String(defaultImportPlatform.value || '').trim()
}

const previewRowsNeedPlatform = computed(() =>
  previewRows.value.filter((r) => r.selected && !effectivePlatform(r)),
)

const resetState = () => {
  step.value = 'file'
  tableData.value = []
  filename.value = ''
  headerRow.value = 0
  skipRows.value = new Set()
  columnMap.value = {}
  previewToken.value = ''
  previewRows.value = []
  previewMeta.value = {}
  defaultConflict.value = 'skip'
  importPlatforms.value = []
  defaultImportPlatform.value = ''
}

const loadImportPlatforms = async () => {
  if (!props.projectId) return
  try {
    const res = await getProjectEnv(props.projectId)
    const doc = res?.data?.data || res?.data || {}
    const channels = (doc.channels || []).filter((c) => c && c.id)
    importPlatforms.value = channels.map((c) => ({
      id: String(c.id),
      label: String(c.label || c.alias || c.id),
    }))
    if (importPlatforms.value.length && !defaultImportPlatform.value) {
      defaultImportPlatform.value = importPlatforms.value[0].id
    }
  } catch {
    importPlatforms.value = []
  }
}

watch(
  () => [props.modelValue, props.requirementId],
  ([visible]) => {
    if (!visible) return
    resetState()
    pickedReqId.value = props.requirementId || props.requirements[0]?.id || ''
    loadImportPlatforms()
  },
)

const applyHeaderRow = () => {
  columnMap.value = suggestColumnMap(headerLabels.value)
}

watch(headerRow, () => {
  applyHeaderRow()
})

const normalizeExcelCell = (v) => {
  if (v == null) return ''
  return String(v)
    .replace(/_x([0-9A-Fa-f]{4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u2028/g, '\n')
    .replace(/\u2029/g, '\n')
}

const bootstrapTable = (table) => {
  tableData.value = table
  headerRow.value = detectHeaderRow(table)
  skipRows.value = suggestSkipRows(table, headerRow.value)
  applyHeaderRow()
}

const loadExcel = async (file) => {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellText: false })
  const names = wb.SheetNames || []
  const sheetName = names.find((n) => /测试用例|用例/.test(n)) || names[0]
  if (!sheetName) throw new Error('Excel 里没有工作表')
  const sheet = wb.Sheets[sheetName]
  const table = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  })
    .map((row) => (Array.isArray(row) ? row.map(normalizeExcelCell) : []))
    .filter((row) => row.some((c) => String(c).trim()))
  if (!table.length) throw new Error('工作表是空的')
  return table
}

const loadCsv = async (file) => {
  const text = await file.text()
  const line = text.split(/\r?\n/).find((l) => l.trim()) || ''
  const delim = line.includes('\t') ? '\t' : ','
  return text.split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(delim).map((c) => c.trim()))
}

const pickFile = () => fileRef.value?.click()

const onFile = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  filename.value = file.name
  try {
    const name = file.name.toLowerCase()
    let table
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      table = await loadExcel(file)
    } else if (name.endsWith('.csv') || name.endsWith('.tsv')) {
      table = await loadCsv(file)
    } else {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data?.table?.length) throw new Error('JSON 需要 { table: 二维数组 }')
      table = data.table.map((row) => row.map(normalizeExcelCell))
    }
    bootstrapTable(table)
    step.value = 'map'
    ElMessage.success(`已读取「${file.name}」，请确认列名行与跳过的表头行`)
  } catch (e) {
    filename.value = ''
    tableData.value = []
    ElMessage.error(e?.message || '读取文件失败')
  }
}

const toggleSkip = (idx, checked) => {
  const next = new Set(skipRows.value)
  if (checked) next.add(idx)
  else next.delete(idx)
  skipRows.value = next
}

const isSkipped = (idx) => skipRows.value.has(idx) || idx === headerRow.value

const flagText = (flags = []) => flags.map((f) => FLAG_LABELS[f] || f).join(' · ')

const runPreview = async () => {
  if (!props.projectId) {
    ElMessage.warning('缺少项目 ID')
    return
  }
  if (!pickedReqId.value) {
    ElMessage.warning('请选择需求')
    return
  }
  if (!tableData.value.length) {
    ElMessage.warning('请先上传文件')
    return
  }
  if (!headerRowOk.value) {
    ElMessage.warning('列名行不像表头（应含「用例编号」「名称」「步骤」等）。请调整列名行或勾选跳过')
    return
  }
  if (!platformColumnMapped.value && importPlatforms.value.length && !defaultImportPlatform.value) {
    ElMessage.warning('未映射「端」列时，请先选择默认端')
    return
  }
  parsing.value = true
  try {
    const res = await previewCaseImport(props.projectId, {
      requirement_id: pickedReqId.value,
      table: tableData.value,
      header_row: headerRow.value,
      skip_rows: [...skipRows.value],
      column_map: columnMap.value,
      default_platform: defaultImportPlatform.value,
    })
    const data = res?.data || {}
    previewToken.value = data.preview_token || ''
    previewRows.value = (data.rows || []).map((row) => ({
      ...row,
      selected: row.selected_by_default !== false,
      on_conflict: row.conflict ? 'skip' : defaultConflict.value,
    }))
    previewMeta.value = data
    step.value = 'preview'
    if ((data.conflicts || []).length) {
      ElMessage.warning(`解析 ${data.parsed} 条，${data.conflicts.length} 条与库中已有用例冲突/重复，请确认处理方式`)
    } else {
      ElMessage.success(`已解析 ${data.parsed} 条用例`)
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '解析失败')
  } finally {
    parsing.value = false
  }
}

const applyDefaultConflict = () => {
  previewRows.value = previewRows.value.map((row) => (
    row.conflict ? { ...row, on_conflict: defaultConflict.value } : row
  ))
}

const submit = async () => {
  if (!props.projectId || !pickedReqId.value || !previewToken.value) return
  const selected = previewRows.value.filter((r) => r.selected)
  if (!selected.length) {
    ElMessage.warning('请至少选择一条要导入的用例')
    return
  }
  if (previewRowsNeedPlatform.value.length && !defaultImportPlatform.value) {
    ElMessage.warning('部分用例未指定端，请在下方选择导入端')
    return
  }
  submitting.value = true
  try {
    const res = await commitCaseImport(props.projectId, {
      requirement_id: pickedReqId.value,
      preview_token: previewToken.value,
      default_on_conflict: defaultConflict.value,
      default_platform: defaultImportPlatform.value,
      rows: previewRows.value.map((row) => ({
        row_index: row.row_index,
        selected: Boolean(row.selected),
        on_conflict: row.on_conflict || defaultConflict.value,
      })),
    })
    const data = res?.data || {}
    emit('imported', data)
    open.value = false
    ElMessage.success(`新增 ${data.created || 0}，更新 ${data.updated || 0}，跳过 ${data.skipped || 0}`)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '导入失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    title="导入用例"
    :width="step === 'file' ? '640px' : '1040px'"
    class="mo-fit-dialog case-import-dialog"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="!submitting && !parsing"
  >
    <p class="import-hint">
      上传 Excel / CSV，指定<strong>列名行</strong>（含「用例编号」「名称」等文字的那一行）、勾选要跳过的其它表头行，再映射列。
      合并单元格非首格保持为空，步骤/预期只在有内容的行显示。
    </p>

    <el-form v-if="step === 'file'" label-position="top">
      <el-form-item label="导入到需求" required>
        <el-select v-model="pickedReqId" filterable placeholder="选择需求" style="width: 100%">
          <el-option
            v-for="req in requirements"
            :key="req.id"
            :label="req.title || req.external_id || req.id"
            :value="req.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="filename ? `文件 · ${filename}` : '选择文件'">
        <p class="import-hint is-tip">多级表头：第 0 行可能是「5-11回归」，第 1 行才是列名，第 2 行起才是数据。</p>
      </el-form-item>
    </el-form>

    <template v-else-if="step === 'map'">
      <div class="toolbar">
        <label>列名行（0 起）<el-input-number v-model="headerRow" :min="0" :max="Math.max(0, tableData.length - 1)" size="small" /></label>
        <span class="muted">当前列名：{{ headerHint || '—' }}</span>
      </div>
      <el-alert
        v-if="!headerRowOk"
        type="warning"
        :closable="false"
        show-icon
        title="列名行可能选错了"
        description="下拉框应显示「用例编号」「用例名称」等，而不是 app-001、一键登录 这类数据。请把列名行改到真正的表头行，并勾选上方回归/iOS 等行「跳过」。"
        class="map-alert"
      />
      <div v-if="importPlatforms.length" class="default-platform-row">
        <span class="map-label">默认端</span>
        <el-select v-model="defaultImportPlatform" placeholder="选择端" size="small" style="width: 200px">
          <el-option v-for="p in importPlatforms" :key="p.id" :label="p.label" :value="p.id" />
        </el-select>
        <span class="muted">
          {{ platformColumnMapped ? '已映射「端」列；单元格为空时用此端' : '未映射「端」列时，导入的用例将全部使用该端' }}
        </span>
      </div>
      <div class="map-row">
        <span v-for="opt in FIELD_OPTS" :key="opt.key" class="map-item">
          <span class="map-label">{{ opt.label }}</span>
          <el-select v-model="columnMap[opt.key]" clearable placeholder="—" size="small" style="width: 130px">
            <el-option
              v-for="(label, idx) in headerLabels"
              :key="`${opt.key}-${idx}`"
              :label="`${idx}: ${label}`"
              :value="idx"
            />
          </el-select>
        </span>
      </div>
      <div class="table-wrap">
        <table class="raw-table">
          <thead>
            <tr>
              <th>跳过</th>
              <th>#</th>
              <th v-for="c in maxCols" :key="c" :class="{ 'is-mapped': mappedColSet.has(c - 1) }">列{{ c - 1 }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, ri) in tableData"
              :key="ri"
              :class="{ 'is-header': ri === headerRow, 'is-skip': isSkipped(ri) }"
            >
              <td>
                <el-checkbox
                  :model-value="skipRows.has(ri)"
                  :disabled="ri === headerRow"
                  @change="(v) => toggleSkip(ri, v)"
                />
              </td>
              <td>{{ ri }}</td>
              <td
                v-for="ci in maxCols"
                :key="ci"
                :class="{ 'is-mapped': mappedColSet.has(ci - 1) }"
              >{{ row[ci - 1] ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <div class="toolbar preview-toolbar">
        <span class="muted">共 {{ previewRows.length }} 条<template v-if="conflictCount">，冲突 {{ conflictCount }} 条</template></span>
        <div v-if="importPlatforms.length" class="default-platform-row is-preview">
          <span class="map-label">导入端</span>
          <el-select v-model="defaultImportPlatform" placeholder="选择端" size="small" style="width: 200px">
            <el-option v-for="p in importPlatforms" :key="p.id" :label="p.label" :value="p.id" />
          </el-select>
          <span v-if="previewRowsNeedPlatform.length" class="muted warn-text">
            {{ previewRowsNeedPlatform.length }} 条未填端，将统一设为该端
          </span>
          <span v-else class="muted">表格已带端；仅空单元格会用此默认</span>
        </div>
        <label v-if="conflictCount">
          冲突默认
          <el-select v-model="defaultConflict" size="small" style="width: 120px" @change="applyDefaultConflict">
            <el-option label="保留已有" value="skip" />
            <el-option label="覆盖" value="overwrite" />
          </el-select>
        </label>
      </div>
      <div class="table-wrap">
        <table class="raw-table preview-table">
          <thead>
            <tr>
              <th>导入</th>
              <th>编号</th>
              <th>名称</th>
              <th>端</th>
              <th>前置条件</th>
              <th>步骤摘要</th>
              <th>预期摘要</th>
              <th>备注</th>
              <template v-if="conflictCount">
                <th>冲突</th>
                <th>策略</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in previewRows"
              :key="i"
              :class="{
                'is-conflict': row.conflict,
                'is-warn': (row.flags || []).length && !row.conflict,
              }"
            >
              <td><el-checkbox v-model="row.selected" /></td>
              <td>{{ row.case_id || '（系统生成）' }}</td>
              <td>{{ row.name }}</td>
              <td :class="{ 'plat-from-default': !String(row.platform || row.payload?.platform || '').trim() }">
                {{ platformLabelFor(effectivePlatform(row)) }}
              </td>
              <td>
                <pre class="cell-pre">{{ row.precondition_preview }}</pre>
                <span v-if="row.resource_claim_summary" class="claim-sum">{{ row.resource_claim_summary }}</span>
              </td>
              <td><pre class="cell-pre">{{ row.steps_preview }}</pre></td>
              <td><pre class="cell-pre">{{ row.expected_preview }}</pre></td>
              <td class="flag-cell">
                <span v-if="(row.flags || []).length" class="flag-tag">{{ flagText(row.flags) }}</span>
                <span v-else class="muted">—</span>
              </td>
              <template v-if="conflictCount">
                <td>
                  <template v-if="row.conflict">
                    已有「{{ row.conflict.existing_name }}」（{{ row.conflict.existing_case_id }}）
                    <span v-if="row.conflict.content_match"> · 内容相同</span>
                    <span v-else-if="row.conflict.requirement_changed"> · {{ row.conflict.existing_requirement_title }}</span>
                  </template>
                  <span v-else>—</span>
                </td>
                <td>
                  <el-select v-if="row.conflict" v-model="row.on_conflict" size="small" style="width: 100px">
                    <el-option label="保留" value="skip" />
                    <el-option label="覆盖" value="overwrite" />
                  </el-select>
                  <span v-else>—</span>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <input ref="fileRef" class="file-hidden" type="file" accept=".xlsx,.xls,.csv,.tsv,.json" @change="onFile">

    <template #footer>
      <template v-if="step === 'file'">
        <el-button @click="pickFile">选择文件</el-button>
        <el-button @click="open = false">取消</el-button>
      </template>
      <template v-else-if="step === 'map'">
        <el-button @click="step = 'file'">上一步</el-button>
        <el-button type="primary" :loading="parsing" @click="runPreview">解析预览</el-button>
      </template>
      <template v-else>
        <el-button @click="step = 'map'">上一步</el-button>
        <el-button type="primary" :loading="submitting" :disabled="submitting" @click="submit">确认导入</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-hint {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.55;
}
.import-hint.is-tip {
  margin-top: 4px;
  color: #9ca3af;
}
.file-hidden { display: none; }
.map-alert { margin-bottom: 12px; }
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
}
.default-platform-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.default-platform-row.is-preview {
  margin-bottom: 0;
}

.preview-toolbar {
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.plat-from-default {
  color: var(--el-color-primary);
}

.warn-text {
  color: var(--el-color-warning);
}

.map-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 12px;
}
.map-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.map-label {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}
.table-wrap {
  max-height: 420px;
  overflow: auto;
  border: 1px solid #e5e7ef;
  border-radius: 8px;
}
.raw-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.raw-table th,
.raw-table td {
  border: 1px solid #e5e7ef;
  padding: 4px 6px;
  vertical-align: top;
  max-width: 160px;
  word-break: break-word;
}
.raw-table th {
  background: #eef2ff;
  position: sticky;
  top: 0;
  z-index: 1;
}
.raw-table th.is-mapped,
.raw-table td.is-mapped {
  background: #fef9c3;
}
.raw-table tr.is-header td {
  background: #f0fdf4;
}
.raw-table tr.is-skip td {
  opacity: 0.45;
}
.raw-table tr.is-conflict td {
  background: #fff7ed;
}
.raw-table tr.is-warn td {
  background: #fffbeb;
}
.cell-pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 12px;
  max-height: 72px;
  overflow: hidden;
}
.claim-sum {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #5b21b6;
}
.flag-cell { min-width: 100px; }
.flag-tag {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: #fef3c7;
  color: #92400e;
  font-size: 11px;
  line-height: 1.4;
}
.muted { color: #64748b; font-size: 13px; }
</style>
