<script setup>
import { computed, ref, watch } from 'vue'
import {
  addOption,
  appendFlowOptions,
  cloneFields,
  newField,
} from '@/utils/accountPoolFieldEditor'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  template: { type: Object, default: null },
  /** builtin 只编辑 addon；custom 编辑全部 facet_extensions */
  mode: { type: String, default: 'custom' },
  baseFields: { type: Array, default: () => [] },
  starterKeys: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'save'])

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const draft = ref(null)
const editableFields = ref([])

const isBuiltin = computed(() => props.mode === 'builtin')

watch(
  () => [props.modelValue, props.template],
  ([visible, tpl]) => {
    if (!visible || !tpl) return
    draft.value = { ...tpl, facet_extensions: cloneFields(tpl.facet_extensions) }
    if (isBuiltin.value) {
      editableFields.value = cloneFields(tpl._addonFields || [])
    } else {
      editableFields.value = cloneFields(tpl.facet_extensions || [])
    }
  },
  { immediate: true },
)

const addFieldYesNo = () => editableFields.value.push(newField('yesNo'))
const addFieldFlow = () => editableFields.value.push(newField('flow1234'))
const addFieldRegisterFlow = () => editableFields.value.push(newField('register_flow'))
const addFieldLoginFlow = () => editableFields.value.push(newField('login_flow'))
const addFieldAuditFlow = () => editableFields.value.push(newField('audit_flow'))
const addFieldDynamic = () => editableFields.value.push(newField('dynamicFlow'))

const removeField = (idx) => {
  editableFields.value.splice(idx, 1)
}

const canRemoveField = (field) => {
  if (!isBuiltin.value) return true
  return !props.starterKeys.includes(field.key)
}

const onSave = () => {
  if (!draft.value) return
  emit('save', {
    template: { ...draft.value, facet_extensions: cloneFields(editableFields.value) },
    fields: cloneFields(editableFields.value),
  })
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="template ? `模板字段 · ${template.label}` : '模板字段'"
    width="min(780px, 94vw)"
    class="tpl-field-dialog mo-fit-dialog"
    align-center
    append-to-body
    destroy-on-close
  >
    <template v-if="draft">
      <p v-if="isBuiltin" class="dlg-lead">
        内置字段分<strong>静态侧写</strong>与<strong>动态流转</strong>。灰色区域只读；下方可追加字段。
      </p>
      <p v-else class="dlg-lead">
        静态侧写可直接改值；动态流转按选项顺序写回（须符合转移规则）。
      </p>

      <el-form v-if="!isBuiltin" label-width="88px" class="meta-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="ID">
              <el-input v-model="draft.id" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="名称">
              <el-input v-model="draft.label" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="分类">
              <el-select v-model="draft.category" style="width: 100%">
                <el-option v-for="c in categories" :key="c.id" :label="c.label" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启用">
              <el-switch v-model="draft.enabled" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="说明">
          <el-input v-model="draft.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <section v-if="isBuiltin && baseFields.length" class="base-fields">
        <div class="sec-title">内置字段（只读）</div>
        <div class="chip-list">
          <el-tag v-for="f in baseFields" :key="f.key" size="small" type="info" effect="plain">
            {{ f.label || f.key }}
            <span class="chip-sub">{{ (f.options || []).length }} 项</span>
          </el-tag>
        </div>
      </section>

      <div class="sec-head">
        <div>
          <div class="sec-title">{{ isBuiltin ? '追加字段' : '状态字段' }}</div>
          <div class="sec-sub">侧写：是/否或 1–4；流转：按步骤顺序配置选项。</div>
        </div>
        <div class="sec-actions">
          <el-button size="small" @click="addFieldYesNo">+ 静态·是/否</el-button>
          <el-button size="small" @click="addFieldFlow">+ 静态·1–4</el-button>
          <el-button size="small" type="warning" plain @click="addFieldRegisterFlow">+ 注册流程</el-button>
          <el-button size="small" type="warning" plain @click="addFieldLoginFlow">+ 登录流程</el-button>
          <el-button size="small" type="warning" plain @click="addFieldAuditFlow">+ 审核流程</el-button>
          <el-button size="small" type="warning" @click="addFieldDynamic">+ 自定义流程</el-button>
        </div>
      </div>

      <el-empty v-if="!editableFields.length" description="暂无追加字段，可点击上方按钮添加" :image-size="64" />

      <div v-for="(field, fi) in editableFields" :key="field.key + fi" class="field-block">
        <div class="field-block-head">
          <el-tag size="small" :type="field.data_kind === 'dynamic' ? 'warning' : 'info'" effect="plain">
            {{ field.data_kind === 'dynamic' ? '流转' : '侧写' }}
          </el-tag>
          <el-input v-model="field.key" size="small" placeholder="key（英文）" class="inp-key" />
          <el-input v-model="field.label" size="small" placeholder="显示名" class="inp-label" />
          <el-button v-if="canRemoveField(field)" link type="danger" size="small" @click="removeField(fi)">
            删除字段
          </el-button>
        </div>
        <div class="opt-table-head">
          <span>选项 value</span>
          <span>展示标签</span>
          <span />
        </div>
        <div v-for="(opt, oi) in field.options || []" :key="oi" class="opt-line">
          <el-input v-model="opt.value" size="small" placeholder="如 yes / 1 / stage_a" />
          <el-input v-model="opt.label" size="small" placeholder="标签" />
          <el-button link type="danger" size="small" @click="field.options.splice(oi, 1)">删</el-button>
        </div>
        <div class="opt-actions">
          <el-button link type="primary" size="small" @click="addOption(field)">+ 选项</el-button>
          <el-button link size="small" @click="appendFlowOptions(field)">+ 补全 1–4</el-button>
        </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存此模板</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dlg-lead {
  margin: 0 0 14px;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
}
.meta-form {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef0f3;
}
.base-fields {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.chip-sub {
  margin-left: 4px;
  opacity: 0.75;
  font-size: 11px;
}
.sec-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.sec-title {
  font-weight: 600;
  font-size: 14px;
  color: #111827;
}
.sec-sub {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}
.sec-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}
.field-block {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: #fff;
}
.field-block-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.inp-key {
  width: 160px;
}
.inp-label {
  flex: 1;
  min-width: 140px;
}
.opt-table-head,
.opt-line {
  display: grid;
  grid-template-columns: 1fr 1fr 48px;
  gap: 8px;
  align-items: center;
}
.opt-table-head {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 4px;
  padding: 0 2px;
}
.opt-line {
  margin-bottom: 6px;
}
.opt-actions {
  margin-top: 6px;
  display: flex;
  gap: 12px;
}
</style>
