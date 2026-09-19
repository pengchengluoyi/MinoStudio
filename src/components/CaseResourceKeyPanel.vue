<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { compileCaseResourceKey, updateProjectCase } from '@/api/projectCases'

const props = defineProps({
  row: { type: Object, default: () => ({}) },
  projectId: { type: String, default: '' },
})

const emit = defineEmits(['saved'])

const jsonText = ref('')
const sceneText = ref('')
const saving = ref(false)
const compiling = ref(false)
const showScene = ref(false)

const sceneSummary = computed(() => {
  const scene = props.row?.case_scene
  if (!scene || typeof scene !== 'object') return '—'
  const prep = (scene.prep_items || [])
    .map((it) => String(it?.kind || it?.text || '').trim())
    .filter(Boolean)
  const bits = [
    scene.required_session ? `会话 ${scene.required_session}` : '',
    scene.platform ? `端 ${scene.platform}` : '',
    prep.length ? `prep ${prep.join(',')}` : '',
  ].filter(Boolean)
  return bits.join(' · ') || '已配置'
})

const syncFromRow = () => {
  const rk = props.row?.resource_key
  jsonText.value = rk && typeof rk === 'object'
    ? JSON.stringify(rk, null, 2)
    : ''
  const scene = props.row?.case_scene
  sceneText.value = scene && typeof scene === 'object'
    ? JSON.stringify(scene, null, 2)
    : ''
}

watch(
  () => `${props.row?.case_id || ''}:${props.row?.updated_at || ''}`,
  syncFromRow,
  { immediate: true },
)

const parseJson = (text, label) => {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    const val = JSON.parse(raw)
    if (val !== null && typeof val !== 'object') {
      throw new Error('须为 JSON 对象')
    }
    return val
  } catch (e) {
    ElMessage.error(`${label} JSON 无效：${e?.message || e}`)
    return undefined
  }
}

const saveKeys = async () => {
  const cid = String(props.row?.case_id || '').trim()
  if (!cid || !props.projectId) return
  const resource_key = parseJson(jsonText.value, 'resource_key')
  if (resource_key === undefined) return
  const payload = {}
  if (resource_key !== null) payload.resource_key = resource_key
  if (showScene.value) {
    const case_scene = parseJson(sceneText.value, 'case_scene')
    if (case_scene === undefined) return
    if (case_scene !== null) payload.case_scene = case_scene
  }
  if (!Object.keys(payload).length) {
    ElMessage.warning('无内容可保存')
    return
  }
  saving.value = true
  try {
    const res = await updateProjectCase(props.projectId, cid, payload)
    const saved = res?.data?.case || { ...props.row, ...payload }
    emit('saved', saved)
    ElMessage.success('用例密钥已保存')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const compileFromPrecondition = async () => {
  const cid = String(props.row?.case_id || '').trim()
  if (!cid || !props.projectId) return
  compiling.value = true
  try {
    const res = await compileCaseResourceKey(props.projectId, cid)
    const saved = res?.data?.case
    if (saved) {
      emit('saved', saved)
      syncFromRow()
    }
    ElMessage.success('已从前置重新编译')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '编译失败')
  } finally {
    compiling.value = false
  }
}
</script>

<template>
  <section class="resource-key-panel">
    <div class="rk-head">
      <h5>用例密钥（resource_key）</h5>
      <span class="rk-summary">CaseScene：{{ sceneSummary }}</span>
    </div>
    <p class="rk-hint">
      跑批 Claim 真源；改<strong>前置</strong>后保存步骤会由服务端再次编译。手动改 JSON 后点「保存密钥」。
    </p>
    <textarea
      v-model="jsonText"
      class="rk-json"
      spellcheck="false"
      rows="14"
      placeholder='{"version":1,"device_app":{...},"account":{...}}'
    />
    <label class="rk-toggle">
      <input v-model="showScene" type="checkbox" />
      编辑 case_scene（循环闸门，一般不必改）
    </label>
    <textarea
      v-if="showScene"
      v-model="sceneText"
      class="rk-json rk-json-scene"
      spellcheck="false"
      rows="8"
    />
    <div class="rk-actions">
      <el-button size="small" :loading="compiling" @click="compileFromPrecondition">从前置编译</el-button>
      <el-button size="small" type="primary" :loading="saving" @click="saveKeys">保存密钥</el-button>
    </div>
  </section>
</template>

<style scoped>
.resource-key-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e5e7eb;
}
.rk-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}
h5 {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
  color: #6b7280;
}
.rk-summary {
  font-size: 11px;
  color: #9ca3af;
}
.rk-hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.45;
}
.rk-json {
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  resize: vertical;
}
.rk-json-scene {
  margin-top: 8px;
}
.rk-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
  font-size: 11px;
  color: #6b7280;
}
.rk-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
