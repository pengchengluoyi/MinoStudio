<script setup>
/** 脑图导入。用例导入见 CaseImportDialog.vue */
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
const submitting = ref(false)
const pickedReqId = ref('')
const fileRef = ref(null)

watch(
  () => [props.modelValue, props.requirementId],
  ([open]) => {
    if (!open) return
    text.value = ''
    filename.value = ''
    pickedReqId.value = props.requirementId || props.requirements[0]?.id || ''
  },
)

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const hint = '支持 Markdown 大纲、缩进列表、OPML、JSON 树。导入后覆盖当前需求的脑图，并自动对齐应用图谱。'
const mindTip = '第一层写端（App / Web / 运营平台…），中间层写模块和功能的短名，叶子写一句能判定的话。'
const fileAccept = '.md,.txt,.opml,.xml,.json,.csv,.tsv'

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

const onFile = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  filename.value = file.name
  try {
    text.value = await file.text()
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
      kind: 'mindmap',
      text: text.value,
      filename: filename.value,
      replace: true,
    })
    const data = res?.data || {}
    emit('imported', data)
    open.value = false
    showMindReceipt(data)
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
    title="导入测试脑图"
    width="640px"
    class="mo-fit-dialog"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="!submitting"
  >
    <p class="import-hint">{{ hint }}</p>
    <p class="import-hint is-tip">{{ mindTip }}</p>
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
          placeholder="例如 Markdown：# 需求名 / ## App / ### 模块 / - 测试点"
        />
      </el-form-item>
    </el-form>
    <input ref="fileRef" class="file-hidden" type="file" :accept="fileAccept" @change="onFile">
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
