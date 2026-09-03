<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { importQaCover } from '@/api/appAutomation'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  appId: { type: String, default: '' },
  kind: { type: String, default: 'mindmap' },
  requirementId: { type: String, default: '' },
  requirements: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'imported'])

const text = ref('')
const filename = ref('')
const replace = ref(false)
const submitting = ref(false)
const pickedReqId = ref('')
const fileRef = ref(null)

watch(
  () => [props.modelValue, props.requirementId, props.kind],
  ([open]) => {
    if (!open) return
    text.value = ''
    filename.value = ''
    replace.value = props.kind === 'mindmap'
    pickedReqId.value = props.requirementId || props.requirements[0]?.id || ''
  },
)

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const isMind = computed(() => props.kind === 'mindmap')
const title = computed(() => (isMind.value ? '导入测试脑图' : '导入用例'))
const hint = computed(() => (
  isMind.value
    ? '支持 Markdown 大纲、缩进列表、OPML、JSON 树。导入后覆盖当前需求的脑图，并自动对齐应用图谱。'
    : '支持 Excel（.xlsx / .xls，Numbers 请先导出）、CSV / TSV、Markdown 表、JSON。单元格内换行会保留。首行建议含：编号、名称、模块、前置条件、测试步骤、预期效果。'
))
const mindTip = '第一层写端（App / Web / 运营平台…），中间层写模块和功能的短名，叶子写一句能判定的话。'
const fileAccept = computed(() => (
  isMind.value
    ? '.md,.txt,.opml,.xml,.json,.csv,.tsv'
    : '.xlsx,.xls,.csv,.tsv,.json,.md,.txt'
))

const showMindReceipt = (data) => {
  const bits = []
  if (Number(data.matched || 0)) bits.push(`对上图谱 ${data.matched} 个`)
  if (Number(data.created || 0)) bits.push(`新增 ${data.created} 个`)
  if (Number(data.review || 0)) bits.push(`${data.review} 个待确认`)
  const head = `已导入 ${data.points || 0} 个测试点${bits.length ? `（${bits.join('，')}）` : ''}`
  if (data.atlas === 'patch') {
    ElMessage({ type: 'warning', duration: 6000, message: `${head}。图谱还没动，去「图谱变更」确认后才会落地。` })
  } else if (data.atlas === 'pending') {
    ElMessage({ type: 'warning', duration: 6000, message: `${head}。同样的图谱建议已在队列里，先去「图谱变更」处理。` })
  } else if (data.atlas === 'merged') {
    ElMessage.success(`${head}。全部精确命中，图谱已同步更新。`)
  } else {
    ElMessage.success(head)
  }
}

const pickFile = () => fileRef.value?.click()

const isExcelName = (name) => /\.(xlsx|xls)$/i.test(String(name || ''))

const normalizeExcelCell = (v) => {
  if (v == null) return ''
  return String(v)
    .replace(/_x([0-9A-Fa-f]{4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u2028/g, '\n')
    .replace(/\u2029/g, '\n')
}

/** 用 JSON 表格提交，避免 sheet_to_csv 把单元格内换行弄丢。 */
const excelToTableJson = async (file) => {
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
  return JSON.stringify({ table })
}

const onFile = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  filename.value = file.name
  try {
    if (!isMind.value && isExcelName(file.name)) {
      text.value = await excelToTableJson(file)
      ElMessage.success(`已读取 Excel「${file.name}」，单元格内换行会保留`)
    } else {
      text.value = await file.text()
    }
  } catch (e) {
    filename.value = ''
    text.value = ''
    ElMessage.error(e?.message || '读取文件失败')
  }
}

const submit = async () => {
  if (!props.appId) {
    ElMessage.warning('缺少应用')
    return
  }
  if (!pickedReqId.value) {
    ElMessage.warning('请先选一条需求')
    return
  }
  if (!String(text.value || '').trim()) {
    ElMessage.warning('请粘贴内容或选择文件')
    return
  }
  submitting.value = true
  try {
    const res = await importQaCover(props.appId, {
      requirement_id: pickedReqId.value,
      kind: isMind.value ? 'mindmap' : 'cases',
      text: text.value,
      filename: filename.value,
      replace: isMind.value ? true : replace.value,
    })
    const data = res?.data || {}
    emit('imported', data)
    open.value = false
    if (data.kind === 'cases') {
      ElMessage.success(`已导入 ${data.cases || 0} 条用例`)
    } else {
      showMindReceipt(data)
    }
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
    :title="title"
    width="640px"
    class="mo-fit-dialog"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="!submitting"
  >
    <p class="import-hint">{{ hint }}</p>
    <p v-if="isMind" class="import-hint is-tip">{{ mindTip }}</p>
    <el-form label-position="top">
      <el-form-item v-if="requirements.length > 1 || !requirementId" label="导入到需求" required>
        <el-select v-model="pickedReqId" filterable placeholder="选择需求" style="width: 100%">
          <el-option
            v-for="req in requirements"
            :key="req.id"
            :label="req.title || req.external_id || req.id"
            :value="req.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="filename ? `内容 · ${filename}` : '内容'">
        <el-input
          v-model="text"
          type="textarea"
          :rows="12"
          :placeholder="isMind
            ? '例如 Markdown：# 需求名 / ## App / ### 模块 / - 测试点'
            : '例如 Excel/CSV：编号,名称,模块,步骤,预期（也可点「选择文件」上传 .xlsx）'"
        />
      </el-form-item>
      <el-form-item v-if="!isMind">
        <el-checkbox v-model="replace">覆盖已有用例草稿（不勾选则追加）</el-checkbox>
      </el-form-item>
    </el-form>
    <input
      ref="fileRef"
      class="file-hidden"
      type="file"
      :accept="fileAccept"
      @change="onFile"
    >
    <template #footer>
      <el-button :disabled="submitting" @click="pickFile">选择文件</el-button>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">导入</el-button>
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
  margin-top: -6px;
  color: #9ca3af;
}
.file-hidden {
  display: none;
}
</style>
