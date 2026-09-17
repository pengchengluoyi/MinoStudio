<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import NavCaptureTurnPanel from '@/views/Testing/NavCaptureTurnPanel.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: 'preview' },
  title: { type: String, default: '' },
  state: { type: Object, default: null },
  wireframe: { type: Object, default: null },
  appId: { type: String, default: '' },
  allStateOptions: { type: Array, default: () => [] },
  atlasTurnRefs: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'save', 'merge-states', 'split-capture', 'pin-capture'])

const form = reactive({
  id: '',
  kind: 'page',
  entry: false,
  displayName: '',
  aliases: [],
  tab: '',
  pageRole: '',
  headerTitle: '',
  chromeTexts: [],
  visitCount: 0,
  inferredRole: '',
  layoutClass: '',
  layoutExtent: null,
  morphCount: 0,
  evidenceTier: '',
  mergeIntoIds: [],
})

const advancedPanels = ref([])
const advancedJson = ref('')

const PAGE_ROLES = [
  { value: '', label: '（未设置）' },
  { value: 'main', label: '主内容' },
  { value: 'feed', label: '信息流' },
  { value: 'profile', label: '个人页' },
  { value: 'detail', label: '详情' },
]

function tabFromIdentify(st) {
  const blocks = st?.identify?.required
  const list = Array.isArray(blocks) ? blocks : blocks ? [blocks] : []
  for (const b of list) {
    if (b?.signal === 'tab_bar') {
      return String(b?.match?.selected || '').trim()
    }
  }
  return ''
}

function chromeFromMeta(meta) {
  const ct = meta?.chrome_texts
  if (Array.isArray(ct) && ct.length) {
    return ct.map((a) => String(a || '').trim()).filter(Boolean)
  }
  const legacy = meta?.chrome
  if (Array.isArray(legacy)) {
    return legacy.map((a) => String(a || '').trim()).filter(Boolean)
  }
  return []
}

function loadForm(st) {
  const raw = st && typeof st === 'object' ? st : {}
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {}
  form.id = String(raw.id || '').trim()
  form.kind = String(raw.kind || 'page').trim() || 'page'
  form.entry = Boolean(raw.entry)
  form.displayName = String(meta.display_name || meta.page_title || '').trim()
  const aliases = meta.aliases
  const rawAliases = Array.isArray(aliases) ? aliases.map((a) => String(a || '').trim()).filter(Boolean) : []
  form.aliases = rawAliases.filter((a) => a !== form.id && !/^page\.sk/i.test(a))
  form.tab = String(meta.tab || tabFromIdentify(raw) || '').trim()
  form.pageRole = String(meta.page_role || '').trim()
  form.chromeTexts = chromeFromMeta(meta)
  form.headerTitle = String(meta.header_title || form.chromeTexts[0] || '').trim()
  form.visitCount = Number(meta.visit_count || 0)
  form.inferredRole = String(meta.inferred_role || meta.page_role || '').trim()
  form.layoutClass = String(meta.layout_class || '').trim()
  form.layoutExtent = meta.layout_extent && typeof meta.layout_extent === 'object' ? meta.layout_extent : null
  form.morphCount = Number(meta.morph_count || 0)
  form.evidenceTier = String(meta.evidence_tier || '').trim()
  form.mergeIntoIds = []
  advancedJson.value = JSON.stringify(raw, null, 2)
}

watch(
  () => [props.visible, props.state],
  () => {
    if (props.visible) loadForm(props.state)
  },
  { deep: true },
)

const isPreview = computed(() => props.mode === 'preview')
const isEdit = computed(() => props.mode === 'edit')

const mergeTargetOptions = computed(() =>
  (props.allStateOptions || [])
    .filter((o) => o?.id && o.id !== form.id)
    .map((o) => ({
      value: o.id,
      label: `${o.label || o.id} (${o.id})`,
    })),
)

const close = () => emit('update:visible', false)

function buildStatePayload() {
  let base = props.state && typeof props.state === 'object' ? JSON.parse(JSON.stringify(props.state)) : { id: form.id }
  if (advancedPanels.value.includes('json') && advancedJson.value.trim()) {
    try {
      base = JSON.parse(advancedJson.value)
    } catch {
      throw new Error('高级 JSON 格式无效')
    }
  }
  const meta = { ...(base.meta || {}) }
  const dn = String(form.displayName || '').trim()
  if (dn) meta.display_name = dn
  else delete meta.display_name
  const aliases = (form.aliases || []).map((a) => String(a || '').trim()).filter(Boolean)
  if (aliases.length) meta.aliases = aliases
  else delete meta.aliases
  const tab = String(form.tab || '').trim()
  if (tab) meta.tab = tab
  else delete meta.tab
  const role = String(form.pageRole || '').trim()
  if (role) meta.page_role = role
  else delete meta.page_role
  const chrome = (form.chromeTexts || []).map((a) => String(a || '').trim()).filter(Boolean)
  if (chrome.length) meta.chrome_texts = chrome
  else delete meta.chrome_texts
  const ht = String(form.headerTitle || '').trim()
  if (ht) meta.header_title = ht
  else delete meta.header_title
  base.meta = meta
  base.id = String(base.id || form.id || '').trim()
  base.kind = String(form.kind || 'page').trim() || 'page'
  base.entry = Boolean(form.entry)
  return base
}

const addChromeToAliases = () => {
  const ht = String(form.headerTitle || '').trim()
  if (!ht) return
  if (!form.aliases.includes(ht)) form.aliases = [...form.aliases, ht]
}

const onSave = () => {
  try {
    const payload = buildStatePayload()
    if (!payload.id) throw new Error('状态 ID 不能为空')
    emit('save', payload)
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  }
}

const onMerge = () => {
  const ids = (form.mergeIntoIds || []).map((x) => String(x || '').trim()).filter(Boolean)
  if (!form.id || !ids.length) {
    ElMessage.warning('请选择要合并到本页的其它节点')
    return
  }
  emit('merge-states', { canonicalId: form.id, mergeIds: ids })
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="title || (isPreview ? '页面预览' : '编辑页面')"
    :width="isPreview ? 'min(96vw, 960px)' : 'min(96vw, 640px)'"
    class="nav-graph-inspect-dialog"
    destroy-on-close
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <div v-if="isPreview" class="preview-wrap">
      <NavCaptureTurnPanel
        :app-id="appId"
        :state-id="form.id"
        :turn-refs="atlasTurnRefs"
        :fallback-wireframe="wireframe"
        :title="title"
        :layout-class="form.layoutClass"
        :layout-extent="form.layoutExtent"
        @split-capture="(p) => emit('split-capture', p)"
        @pin-capture="(p) => emit('pin-capture', p)"
      />
    </div>

    <div v-if="isEdit" class="edit-form">
      <el-table :data="[form]" border size="small" class="field-table">
        <el-table-column label="字段" width="108">
          <template #default>
            <span class="field-label">状态 ID</span>
          </template>
        </el-table-column>
        <el-table-column label="值" min-width="200">
          <template #default>
            <span class="mono-id">{{ form.id }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="read-only-stats">
        <span>采集次数：{{ form.visitCount }}</span>
        <span v-if="form.inferredRole">推断角色：{{ form.inferredRole }}</span>
        <span v-if="form.layoutClass">布局：{{ form.layoutClass }}</span>
        <span v-if="form.evidenceTier">证据：{{ form.evidenceTier }}</span>
        <span v-if="form.morphCount > 0">多态：{{ form.morphCount }}</span>
      </div>

      <el-form label-position="top" class="stack-form" @submit.prevent>
        <el-form-item label="页面名称" required>
          <el-input v-model="form.displayName" placeholder="架构图展示名，供 fsm_navigate 自然语言匹配" clearable />
        </el-form-item>
        <el-form-item label="顶栏文案">
          <el-input v-model="form.headerTitle" placeholder="采集到的顶栏标题（不参与分桶）" clearable />
          <p class="hint">
            下方列表为采集到的 chrome 短文案；可与页面名称不同。
            <el-button link type="primary" size="small" @click="addChromeToAliases">加入别名</el-button>
          </p>
          <el-select
            v-model="form.chromeTexts"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="chrome_texts"
            style="width: 100%; margin-top: 6px"
          />
        </el-form-item>
        <el-form-item label="别名">
          <el-select
            v-model="form.aliases"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="如：手办详情页、3D 预览（回车添加）"
            style="width: 100%"
          />
          <p class="hint">与大模型口语描述匹配；保存后写入 NavFSM meta.aliases。</p>
        </el-form-item>
        <div class="two-col">
          <el-form-item label="Tab">
            <el-input v-model="form.tab" placeholder="底栏 Tab 文案" clearable />
          </el-form-item>
          <el-form-item label="页面角色">
            <el-select v-model="form.pageRole" placeholder="未设置" clearable style="width: 100%">
              <el-option
                v-for="o in PAGE_ROLES.filter((x) => x.value)"
                :key="o.value"
                :label="o.label"
                :value="o.value"
              />
            </el-select>
            <p class="hint">仅展示与辅助；架构分桶已改为应用骨骼，一般留空即可。</p>
          </el-form-item>
        </div>
        <div class="two-col">
          <el-form-item label="类型">
            <el-select v-model="form.kind" style="width: 100%">
              <el-option label="页面 page" value="page" />
              <el-option label="弹窗 dialog" value="dialog" />
            </el-select>
          </el-form-item>
          <el-form-item label="Tab 入口">
            <el-switch v-model="form.entry" active-text="是" inactive-text="否" />
          </el-form-item>
        </div>
        <el-form-item v-if="mergeTargetOptions.length" label="合并到本页（隐藏其它节点）">
          <el-select
            v-model="form.mergeIntoIds"
            multiple
            filterable
            placeholder="选择要合并的重复节点"
            style="width: 100%"
          >
            <el-option
              v-for="o in mergeTargetOptions"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            />
          </el-select>
          <el-button class="merge-btn" type="warning" plain size="small" @click="onMerge">执行合并</el-button>
          <p class="hint">合并后刷新架构图；跳转边会指向本页。</p>
        </el-form-item>
      </el-form>

      <el-collapse v-model="advancedPanels" class="advanced">
        <el-collapse-item title="高级：原始 JSON（可选）" name="json">
          <el-input v-model="advancedJson" type="textarea" :rows="10" spellcheck="false" class="json-area" />
          <p class="hint">展开并修改 JSON 时，保存以 JSON 为准并覆盖上方表单对应字段。</p>
        </el-collapse-item>
      </el-collapse>
    </div>

    <template #footer>
      <el-button @click="close">关闭</el-button>
      <el-button v-if="isEdit" type="primary" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.preview-wrap {
  max-height: 82vh;
  overflow: auto;
  padding: 4px 0 8px;
}

.preview-wrap :deep(.nav-wireframe.is-preview .wire-canvas) {
  width: min(100%, 440px);
  max-width: 440px;
  min-height: min(70vh, 760px);
  height: auto;
  aspect-ratio: 9 / 16;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-table {
  margin-bottom: 4px;
}

.read-only-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.field-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.mono-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}

.stack-form {
  margin-top: 4px;
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.45;
}

.merge-btn {
  margin-top: 8px;
}

.json-area {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.advanced {
  border: none;
}

.advanced :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
