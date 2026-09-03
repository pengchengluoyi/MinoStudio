<script setup>
import { computed, ref, watch } from 'vue'
import { flattenPatchAfter, changeHint, changeJobLabel, changeLines, changeTitle, nodeKindLabel, opLabel, patchKind, patchStatusLabel, patchStatusType } from '@/utils/atlasChange'
import { fmtTime } from '@/utils/dispatchLog'
import { moveNode, renameNode } from '@/utils/appAtlas'
import HintFold from '@/components/HintFold.vue'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  patch: { type: Object, required: true },
  requirements: { type: Array, default: () => [] },
  impactLabel: { type: String, default: '' },
  reviewing: { type: Boolean, default: false },
})

const emit = defineEmits(['accept', 'reject'])

const editedAfter = ref(null)
const editingTree = ref(false)

watch(() => props.patch?.id, () => {
  editedAfter.value = null
  editingTree.value = false
})

const afterTree = computed(() => editedAfter.value || props.patch?.after)
const kind = computed(() => patchKind(props.patch, afterTree.value))
const lines = computed(() => changeLines(props.patch, { edited: afterTree.value, requirements: props.requirements }))
const treeRows = computed(() => flattenPatchAfter(props.patch, afterTree.value))
const canEditTree = computed(() => ['create', 'structure'].includes(kind.value))
const pending = computed(() => props.patch?.status === 'pending')

const indentPad = (depth) => `${8 + Number(depth || 0) * 18}px`

const rename = (nodeId, name) => {
  editedAfter.value = renameNode(afterTree.value, nodeId, name)
}

const move = (nodeId, dir) => {
  editedAfter.value = moveNode(afterTree.value, nodeId, dir)
}

const accept = () => {
  emit('accept', { patch: props.patch, after: editedAfter.value || undefined })
}
</script>

<template>
  <article class="settings-card change-card">
    <div class="role-meta-head">
      <div>
        <div class="settings-kicker">{{ changeJobLabel(patch) }} · {{ patchStatusLabel(patch.status) }}</div>
        <h3>{{ changeTitle(patch, afterTree) }}</h3>
        <p>
          <span v-if="fmtTime(patch.at)">{{ fmtTime(patch.at) }} · </span>
          {{ changeHint(patch, afterTree) }}
          <span v-if="impactLabel"> 相对上一版本：{{ impactLabel }}。</span>
        </p>
      </div>
      <div class="header-actions">
        <el-tag :type="patchStatusType(patch.status)" size="small" effect="light">{{ patchStatusLabel(patch.status) }}</el-tag>
        <template v-if="pending">
          <button
            v-if="kind !== 'empty'"
            type="button"
            class="settings-action-pill"
            :disabled="reviewing"
            @click="accept"
          >
            {{ reviewing ? '确认中…' : '确认图谱' }}
            <span class="settings-action-arrow">→</span>
          </button>
          <button type="button" class="ghost-pill" :disabled="reviewing" @click="emit('reject', patch)">驳回</button>
        </template>
      </div>
    </div>

    <HintFold
      v-if="patch.reason"
      title="变更说明"
      :summary="patch.reason"
    >
      <p class="change-reason">{{ patch.reason }}</p>
    </HintFold>

    <div v-if="lines.length" class="change-log">
      <div v-for="(line, idx) in lines" :key="`${line.op}-${line.path}-${idx}`" class="change-line" :class="line.op">
        <em>{{ opLabel(line.op) }}</em>
        <span>{{ nodeKindLabel(line.kind) }} {{ line.path }}</span>
        <span v-if="line.extra" class="change-extra">{{ line.extra }}</span>
      </div>
    </div>
    <p v-else class="empty-hint">没有模块增删或新挂需求。</p>

    <template v-if="canEditTree">
      <div class="tree-toolbar">
        <h4>确认后的骨架</h4>
        <el-button v-if="pending && !editingTree" link type="primary" size="small" @click="editingTree = true">编辑骨架</el-button>
        <el-button v-else-if="editingTree" link size="small" @click="editingTree = false">完成</el-button>
      </div>
      <div v-if="!editingTree" class="atlas-edit-list is-view">
        <div v-for="row in treeRows" :key="row.id" class="atlas-diff-line" :style="{ paddingLeft: indentPad(row.depth) }">
          {{ row.name }}
        </div>
      </div>
      <div v-else class="atlas-edit-list">
        <div v-for="row in treeRows" :key="row.id" class="atlas-diff-line is-edit">
          <input
            class="atlas-edit-input"
            :style="{ paddingLeft: indentPad(row.depth) }"
            :value="row.name"
            @change="rename(row.id, $event.target.value)"
          />
          <button type="button" class="tiny" @click="move(row.id, -1)">上</button>
          <button type="button" class="tiny" @click="move(row.id, 1)">下</button>
        </div>
      </div>
    </template>

    <HintFold
      v-if="(patch.aliases || []).length"
      title="命名对齐建议"
      :summary="`${(patch.aliases || []).length} 条 · 确认后以后自动对齐`"
    >
      <div class="mind-table">
        <div v-for="(row, idx) in (patch.aliases || []).slice(0, 8)" :key="row.target_id || idx" class="mind-row is-case">
          <div class="mind-name">脑图「{{ row.alias || row.text }}」</div>
          <div class="mind-kind">→</div>
          <div class="mind-note">图谱「{{ row.atlas_name || row.target_id }}」{{ row.score ? ` · ${row.score}%` : '' }}</div>
        </div>
      </div>
    </HintFold>

    <HintFold
      v-if="(patch.case_changes || []).length"
      title="可能要改的旧用例"
      :summary="`${(patch.case_changes || []).length} 条提醒`"
    >
      <div class="mind-table">
        <div v-for="(row, idx) in (patch.case_changes || []).slice(0, 6)" :key="row.case_id || idx" class="mind-row is-case">
          <div class="mind-name">{{ row.name || row.case_id }}</div>
          <div class="mind-kind">用例</div>
          <div class="mind-note">{{ row.reason }}</div>
        </div>
      </div>
    </HintFold>
  </article>
</template>

<style scoped>
.change-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.role-meta-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.role-meta-head h3 {
  margin: 6px 0 4px;
  font-size: 15px;
}
.role-meta-head p {
  margin: 0;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.change-reason {
  margin: 8px 0 0;
  color: var(--settings-text);
  font-size: 13px;
}
.change-log,
.atlas-edit-list {
  border: 1px solid var(--settings-border);
  border-radius: 10px;
  overflow: auto;
  max-height: 220px;
}
.change-line,
.atlas-diff-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--settings-border);
  font-size: 13px;
}
.change-line:last-child,
.atlas-diff-line:last-child { border-bottom: 0; }
.change-line em {
  flex-shrink: 0;
  font-style: normal;
  font-weight: 700;
  font-size: 11px;
}
.change-line.add em { color: #047857; }
.change-line.remove em { color: #b91c1c; }
.change-line.update em { color: #4338ca; }
.change-line.hang em { color: #b45309; }
.change-extra { color: var(--settings-muted); }
.tree-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tree-toolbar h4,
.change-card > h4 {
  margin: 4px 0 0;
  font-size: 13px;
}
.atlas-diff-line.is-edit { gap: 6px; }
.atlas-edit-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  border: 0;
  background: transparent;
  font-size: 12px;
}
.tiny {
  flex-shrink: 0;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--settings-border);
  border-radius: 999px;
  background: #fff;
  color: var(--settings-muted);
  font-size: 11px;
  cursor: pointer;
}
.empty-hint {
  margin: 0;
  font-size: 12px;
  color: var(--settings-muted);
}
.mind-table { min-width: 0; }
.mind-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.4fr) 56px minmax(0, 1.6fr);
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--settings-border);
  font-size: 13px;
}
.mind-kind,
.mind-note { color: var(--settings-muted); font-size: 12px; }
</style>
