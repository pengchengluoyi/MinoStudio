<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteProjectPoolLocalTemplate,
  getProjectAccountPoolLocal,
  saveProjectPoolBuiltinFields,
  saveProjectPoolLocalTemplate,
} from '@/api/workReport'
import TemplateFieldsEditorDialog from '@/components/accountPool/TemplateFieldsEditorDialog.vue'
import { cloneFields, listFieldSummaries } from '@/utils/accountPoolFieldEditor'

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
const editorMode = ref('custom')
const editorBaseFields = ref([])

const projectLocalIds = computed(() => new Set(localTemplates.value.map((t) => t.id)))

const isProjectLocal = (row) =>
  Boolean(row?.project_local) || projectLocalIds.value.has(row?.id)

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

const applyPayload = (res) => {
  categories.value = res?.data?.categories || categories.value
  templatesView.value = res?.data?.templates || templatesView.value
  localTemplates.value = cloneFields(res?.data?.local?.templates)
  localAddons.value = cloneFields(res?.data?.local?.extension_addons || {})
}

const mergedRowFromView = (row) => {
  const hit = templatesView.value.find((t) => t.id === row.id)
  return hit || row
}

const addonFieldsFor = (row) => cloneFields(localAddons.value[row.id] || [])

const addCustom = () => {
  const id = `ptpl_${Date.now().toString(36)}`
  openEditor({
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
  })
}

const openEditor = (row) => {
  const r = mergedRowFromView(row)
  if (isProjectLocal(r)) {
    editorMode.value = 'custom'
    editorBaseFields.value = []
    const hit = localTemplates.value.find((t) => t.id === r.id) || r
    editing.value = { ...hit, facet_extensions: cloneFields(hit.facet_extensions) }
  } else {
    editorMode.value = 'builtin'
    editorBaseFields.value = cloneFields(r.facet_extensions || [])
    editing.value = { ...r, _addonFields: addonFieldsFor(r) }
  }
  editorOpen.value = true
}

const onEditorSave = async ({ template, fields }) => {
  if (!props.projectId || !editing.value) return
  saving.value = true
  try {
    if (isProjectLocal(editing.value)) {
      const payload = {
        ...template,
        project_local: true,
        builtin: false,
        facet_extensions: fields,
      }
      const res = await saveProjectPoolLocalTemplate(props.projectId, payload.id, payload)
      applyPayload(res)
      ElMessage.success('已保存该项目模板')
    } else {
      const res = await saveProjectPoolBuiltinFields(props.projectId, editing.value.id, fields)
      applyPayload(res)
      ElMessage.success('已保存本项目对该模板的追加字段')
    }
    editorOpen.value = false
    emit('saved')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const removeCustom = async (row) => {
  try {
    await ElMessageBox.confirm(`删除项目模板「${row.label}」？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  saving.value = true
  try {
    const res = await deleteProjectPoolLocalTemplate(props.projectId, row.id)
    applyPayload(res)
    ElMessage.success('已删除')
    emit('saved')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '删除失败')
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
    size="min(780px, 92vw)"
    append-to-body
    destroy-on-close
  >
    <div v-loading="loading" class="pool-local-body">
      <p class="dlg-hint">
        与 Console 一致：每个模板在弹窗内<strong>单独保存</strong>。全局模板请在 Console「号池业务模板」维护；此处仅为本项目追加字段或新增项目模板。
      </p>
      <div class="toolbar">
        <el-button size="small" type="primary" @click="addCustom">新增项目模板</el-button>
      </div>

      <el-table :data="templatesView" size="small" border stripe empty-text="无已启用模板">
        <el-table-column prop="label" label="名称" width="120" />
        <el-table-column label="类型" width="72">
          <template #default="{ row }">{{ typeLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="分类" width="100">
          <template #default="{ row }">{{ catLabel(row.category) }}</template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="120" show-overflow-tooltip />
        <el-table-column label="已有字段" min-width="200">
          <template #default="{ row }">
            <div class="field-tags">
              <el-tag
                v-for="(txt, i) in listFieldSummaries(row.facet_extensions).slice(0, 3)"
                :key="'b' + i"
                size="small"
                effect="plain"
              >
                {{ txt }}
              </el-tag>
              <template v-if="!isProjectLocal(row) && addonFieldsFor(row).length">
                <el-tag
                  v-for="(txt, i) in listFieldSummaries(addonFieldsFor(row)).slice(0, 2)"
                  :key="'a' + i"
                  size="small"
                  type="success"
                  effect="plain"
                >
                  + {{ txt }}
                </el-tag>
              </template>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEditor(row)">字段</el-button>
            <el-button
              v-if="isProjectLocal(row)"
              link
              type="danger"
              size="small"
              @click="removeCustom(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <TemplateFieldsEditorDialog
      v-model="editorOpen"
      :template="editing"
      :mode="editorMode"
      :base-fields="editorBaseFields"
      :starter-keys="starterExtensions.map((s) => s.key)"
      :categories="categories"
      :saving="saving"
      @save="onEditorSave"
    />
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
.field-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
