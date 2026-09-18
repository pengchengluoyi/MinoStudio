<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getProjectAccountPoolLocal, saveProjectAccountPoolLocal } from '@/api/workReport'

const props = defineProps({
  projectId: { type: String, default: '' },
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const saving = ref(false)
const categories = ref([])
const templatesView = ref([])
const localTemplates = ref([])
const localAddons = ref({})
const starterExtensions = ref([])

const editorOpen = ref(false)
const editing = ref(null)
const editingAddonFields = ref([])

const projectLocalIds = computed(() => new Set(localTemplates.value.map((t) => t.id)))

const isProjectLocal = (row) =>
  Boolean(row?.project_local) || projectLocalIds.value.has(row?.id)

function cloneFields(rows) {
  return JSON.parse(JSON.stringify(rows || []))
}

function newOption() {
  return { value: 'unknown', label: '未设置' }
}

function newField() {
  return {
    key: `field_${Date.now().toString(36).slice(-6)}`,
    label: '新字段',
    options: [newOption(), { value: 'yes', label: '是' }, { value: 'no', label: '否' }],
  }
}

const load = async () => {
  if (!props.projectId) return
  loading.value = true
  try {
    const res = await getProjectAccountPoolLocal(props.projectId)
    categories.value = res?.data?.categories || []
    templatesView.value = res?.data?.templates || []
    localTemplates.value = cloneFields(res?.data?.local?.templates)
    localAddons.value = cloneFields(res?.data?.local?.extension_addons || {})
    starterExtensions.value = res?.data?.starter_extensions || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.projectId],
  ([visible, pid]) => {
    if (visible && pid) load()
  },
)

const addCustom = () => {
  const id = `ptpl_${Date.now().toString(36)}`
  const row = {
    id,
    category: 'personal',
    label: '项目模板',
    description: '',
    builtin: false,
    enabled: true,
    project_local: true,
    credential_fields: ['phone', 'email', 'password'],
    default_facets: { lifecycle: 'registered', session: 'logged_out', health: 'available' },
    facet_extensions: cloneFields(starterExtensions.value),
  }
  localTemplates.value = [...localTemplates.value, row]
  openEditor(row)
}

const openEditor = (row) => {
  if (isProjectLocal(row)) {
    const hit = localTemplates.value.find((t) => t.id === row.id) || row
    editing.value = { ...hit, facet_extensions: cloneFields(hit.facet_extensions) }
    editingAddonFields.value = []
  } else {
    editing.value = { ...row }
    editingAddonFields.value = cloneFields(localAddons.value[row.id] || [])
  }
  editorOpen.value = true
}

const editorFields = computed(() => {
  if (!editing.value) return []
  if (isProjectLocal(editing.value)) {
    return editing.value.facet_extensions || []
  }
  const baseKeys = new Set((editing.value.facet_extensions || []).map((f) => f.key))
  return editingAddonFields.value.filter((f) => !baseKeys.has(f.key))
})

const setEditorFields = (fields) => {
  if (!editing.value) return
  if (isProjectLocal(editing.value)) {
    editing.value.facet_extensions = fields
  } else {
    editingAddonFields.value = fields
  }
}

const addField = () => setEditorFields([...editorFields.value, newField()])
const removeField = (idx) => {
  const next = [...editorFields.value]
  next.splice(idx, 1)
  setEditorFields(next)
}
const addOption = (field) => {
  if (!field.options) field.options = []
  field.options.push({ value: `v_${field.options.length}`, label: '选项' })
}
const removeOption = (field, idx) => field.options.splice(idx, 1)

const applyEditor = () => {
  if (!editing.value) return
  const row = editing.value
  if (isProjectLocal(row)) {
    const idx = localTemplates.value.findIndex((t) => t.id === row.id)
    const payload = {
      ...row,
      project_local: true,
      builtin: false,
      facet_extensions: cloneFields(row.facet_extensions),
    }
    if (idx >= 0) {
      const next = [...localTemplates.value]
      next[idx] = payload
      localTemplates.value = next
    } else {
      localTemplates.value = [...localTemplates.value, payload]
    }
  } else {
    localAddons.value = {
      ...localAddons.value,
      [row.id]: cloneFields(editingAddonFields.value),
    }
  }
  editorOpen.value = false
  ElMessage.info('字段已写入草稿，请点击右上角「保存」落盘')
}

const removeCustom = (id) => {
  localTemplates.value = localTemplates.value.filter((t) => t.id !== id)
}

const save = async () => {
  if (!props.projectId) return
  saving.value = true
  try {
    const res = await saveProjectAccountPoolLocal(props.projectId, {
      templates: localTemplates.value,
      extension_addons: localAddons.value,
    })
    categories.value = res?.data?.categories || categories.value
    templatesView.value = res?.data?.templates || templatesView.value
    localTemplates.value = cloneFields(res?.data?.local?.templates)
    localAddons.value = cloneFields(res?.data?.local?.extension_addons || {})
    ElMessage.success('已保存项目模板与字段')
    emit('saved')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const catLabel = (id) => categories.value.find((c) => c.id === id)?.label || id

const typeLabel = (row) => {
  if (isProjectLocal(row)) return '项目'
  if (row.builtin) return '内置'
  return '全局'
}
</script>

<template>
  <el-drawer
    v-model="open"
    title="项目模板与字段"
    size="min(720px, 92vw)"
    append-to-body
    destroy-on-close
  >
    <div v-loading="loading" class="pool-local-body">
      <p class="dlg-hint">
        在此为<strong>当前项目</strong>新增模板，或为已启用的全局/内置模板<strong>追加字段</strong>（不写 Console）。
        全局自定义模板请在 Console「号池业务模板」维护。
      </p>
      <div class="toolbar">
        <el-button size="small" @click="addCustom">新增项目模板</el-button>
        <el-button type="primary" size="small" :loading="saving" @click="save">保存</el-button>
      </div>

      <el-table :data="templatesView" size="small" border stripe empty-text="无已启用模板">
        <el-table-column prop="label" label="名称" width="120" />
        <el-table-column label="类型" width="72">
          <template #default="{ row }">{{ typeLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="分类" width="100">
          <template #default="{ row }">{{ catLabel(row.category) }}</template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="140" show-overflow-tooltip />
        <el-table-column label="字段数" width="72" align="center">
          <template #default="{ row }">{{ (row.facet_extensions || []).length }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEditor(row)">字段</el-button>
            <el-button
              v-if="isProjectLocal(row)"
              link
              type="danger"
              size="small"
              @click="removeCustom(row.id)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="editorOpen"
      :title="editing ? `模板字段 · ${editing.label}` : '模板字段'"
      width="720px"
      class="mo-fit-dialog"
      align-center
      append-to-body
      destroy-on-close
    >
      <template v-if="editing">
        <p v-if="!isProjectLocal(editing)" class="dlg-hint">
          仅可为本项目追加字段；基础字段来自 Console / 内置定义。
        </p>
        <el-form v-if="isProjectLocal(editing)" label-width="88px" class="dlg-meta">
          <el-form-item label="ID">
            <el-input v-model="editing.id" disabled />
          </el-form-item>
          <el-form-item label="名称">
            <el-input v-model="editing.label" />
          </el-form-item>
          <el-form-item label="分类">
            <el-select v-model="editing.category" style="width: 100%">
              <el-option v-for="c in categories" :key="c.id" :label="c.label" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="editing.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="editing.enabled" />
          </el-form-item>
        </el-form>

        <div class="field-toolbar">
          <strong>状态字段</strong>
          <el-button size="small" type="primary" @click="addField">添加字段</el-button>
        </div>

        <div v-for="(field, fi) in editorFields" :key="field.key + fi" class="field-card">
          <div class="field-head">
            <el-input v-model="field.key" size="small" placeholder="key" style="width: 140px" />
            <el-input v-model="field.label" size="small" placeholder="显示名" style="width: 160px" />
            <el-button
              v-if="isProjectLocal(editing) || !starterExtensions.some((s) => s.key === field.key)"
              link
              type="danger"
              size="small"
              @click="removeField(fi)"
            >
              删除字段
            </el-button>
          </div>
          <div class="opt-rows">
            <div v-for="(opt, oi) in field.options || []" :key="oi" class="opt-row">
              <el-input v-model="opt.value" size="small" placeholder="value" style="width: 120px" />
              <el-input v-model="opt.label" size="small" placeholder="标签" style="width: 140px" />
              <el-button link type="danger" size="small" @click="removeOption(field, oi)">删</el-button>
            </div>
            <el-button link type="primary" size="small" @click="addOption(field)">+ 选项</el-button>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="editorOpen = false">取消</el-button>
        <el-button type="primary" @click="applyEditor">确定</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.pool-local-body {
  min-height: 120px;
}
.dlg-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}
.toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}
.field-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0 8px;
}
.field-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.field-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.opt-rows {
  padding-left: 4px;
}
.opt-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 4px;
}
</style>
