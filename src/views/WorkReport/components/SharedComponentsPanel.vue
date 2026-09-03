<template>
  <div class="shared-panel">
    <div class="panel-header">
      <div class="header-left">
        <el-icon class="header-icon"><Connection /></el-icon>
        <span class="panel-title">共用组件</span>
      </div>
      <el-button link size="small" class="collapse-btn" @click="$emit('close')">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>

    <div class="panel-intro">
      扫描多个页面中<strong>结构相似</strong>的区域（如底部 Tab「首页 / 我的」），标记为图谱级共用组件，Run 时统一识别。
    </div>

    <div class="scan-bar">
      <el-select v-model="regionHints" multiple collapse-tags size="small" class="region-select">
        <el-option label="底部导航 Tab" value="bottom_tab" />
        <el-option label="顶部导航栏" value="top_header" />
      </el-select>
      <el-button type="primary" size="small" :loading="scanning" @click="runDetect">
        扫描相似区域
      </el-button>
    </div>

    <el-scrollbar class="panel-scroll">
      <div v-if="!clusters.length && !loading" class="empty-state">
        <el-icon size="36" color="#94a3b8"><Grid /></el-icon>
        <p>尚未检测到共用组件</p>
        <span>请确保各页面已上传截图并完成骨架训练，再点击「扫描相似区域」</span>
      </div>

      <div v-for="cluster in clusters" :key="cluster.uid" class="cluster-card">
        <div class="cluster-head">
          <div class="cluster-title">
            <el-tag size="small" effect="dark" type="warning">{{ regionLabel(cluster.region) }}</el-tag>
            <span class="name">{{ cluster.name }}</span>
          </div>
          <div class="cluster-head-right">
            <div class="cluster-meta">
              <span class="score">{{ Math.round((cluster.avg_similarity || 0) * 100) }}% 相似</span>
              <span class="dot">·</span>
              <span>{{ cluster.member_count }} 个页面</span>
            </div>
            <el-button link type="danger" size="small" @click.stop="deleteCluster(cluster)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </div>
        </div>

        <!-- 区域示意 -->
        <div class="region-preview">
          <div class="phone-frame">
            <div class="phone-content"></div>
            <div
              v-if="cluster.region === 'bottom_tab'"
              class="region-highlight bottom"
              :style="highlightStyle(cluster.normalized_rect)"
            />
            <div
              v-else-if="cluster.region === 'top_header'"
              class="region-highlight top"
              :style="highlightStyle(cluster.normalized_rect)"
            />
          </div>
          <div class="rect-label">归一化区域 y={{ formatRect(cluster.normalized_rect) }}</div>
        </div>

        <!-- Tab 槽位 -->
        <div v-if="cluster.tabs?.length" class="tab-slots">
          <span class="section-label">识别到的 Tab 槽位</span>
          <div class="tab-chips">
            <el-tag
              v-for="tab in cluster.tabs"
              :key="tab.index"
              size="small"
              round
              effect="plain"
            >
              {{ tab.label }}
            </el-tag>
          </div>
        </div>

        <!-- 成员页面 -->
        <div class="members">
          <span class="section-label">出现在以下页面</span>
          <div
            v-for="m in cluster.members"
            :key="m.node_id"
            class="member-row"
            @click="$emit('focus-node', m.node_id)"
          >
            <div class="member-info">
              <span class="member-name">{{ m.node_label }}</span>
              <span v-if="m.component_label" class="member-comp">已关联热区 · {{ m.component_label }}</span>
              <span v-else class="member-comp muted">未关联热区</span>
            </div>
            <div class="member-right">
              <el-tag size="small" type="success" effect="light">{{ Math.round((m.similarity || 1) * 100) }}%</el-tag>
              <el-icon><ArrowRight /></el-icon>
            </div>
          </div>
        </div>

        <div class="cluster-actions">
          <el-button
            size="small"
            :type="cluster.status === 'confirmed' ? 'success' : 'primary'"
            plain
            @click="confirmCluster(cluster)"
          >
            {{ cluster.status === 'confirmed' ? '已确认为共用' : '确认为共用组件' }}
          </el-button>
        </div>
      </div>
    </el-scrollbar>

    <div v-if="clusters.length" class="panel-footer">
      <el-button type="primary" size="small" :loading="saving" @click="saveAll">
        保存到图谱
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Close, Connection, Grid, ArrowRight, Delete } from '@element-plus/icons-vue'
import { wsDetectSharedComponents, wsSaveSharedComponents } from '@/api/wsAppGraph'

const props = defineProps({
  graphId: [String, Number],
  initialShared: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'focus-node', 'saved'])

const regionHints = ref(['bottom_tab'])
const scanning = ref(false)
const saving = ref(false)
const loading = ref(false)
const clusters = ref([])

const regionLabel = (key) => ({
  bottom_tab: '底部 Tab',
  top_header: '顶部栏'
}[key] || key)

const formatRect = (rect) => {
  if (!rect || rect.length < 4) return '-'
  return `${(rect[1] * 100).toFixed(0)}% ~ ${((rect[1] + rect[3]) * 100).toFixed(0)}%`
}

const highlightStyle = (rect) => {
  if (!rect || rect.length < 4) return {}
  const [, y, , h] = rect
  return {
    top: `${y * 100}%`,
    height: `${h * 100}%`
  }
}

watch(
  () => props.initialShared,
  (val) => {
    if (val?.length && !clusters.value.length) {
      clusters.value = val.map(c => ({ ...c, status: c.status || 'confirmed' }))
    }
  },
  { immediate: true }
)

const runDetect = async () => {
  if (!props.graphId) {
    ElMessage.warning('图谱未就绪')
    return
  }
  scanning.value = true
  try {
    const res = await wsDetectSharedComponents({
      graph_id: props.graphId,
      region_hints: regionHints.value,
      min_similarity: 0.72
    })
    if (res.code === 200 && res.data) {
      clusters.value = (res.data.clusters || []).map(c => ({
        ...c,
        status: props.initialShared.find(s => s.region === c.region)?.status === 'confirmed'
          ? 'confirmed'
          : 'detected'
      }))
      if (!clusters.value.length) {
        ElMessage.info('未发现足够相似的共用区域，请确认多个页面已上传截图')
      } else {
        ElMessage.success(`发现 ${clusters.value.length} 组共用组件`)
      }
    } else {
      ElMessage.error(res.msg || '扫描失败')
    }
  } catch (e) {
    ElMessage.error('扫描请求异常')
  } finally {
    scanning.value = false
  }
}

const confirmCluster = (cluster) => {
  cluster.status = 'confirmed'
  ElMessage.success(`已标记「${cluster.name}」为共用组件`)
}

const deleteCluster = async (cluster) => {
  const idx = clusters.value.findIndex(c => c.uid === cluster.uid)
  if (idx < 0) return
  clusters.value.splice(idx, 1)
  ElMessage.success(`已移除「${cluster.name}」`)
  if (props.graphId) {
    await saveAll(true)
  }
}

const saveAll = async (silent = false) => {
  if (!props.graphId) return
  saving.value = true
  try {
    const payload = clusters.value.map(c => ({
      uid: c.uid,
      name: c.name,
      region: c.region,
      category: c.category,
      scope: c.scope,
      normalized_rect: c.normalized_rect,
      avg_similarity: c.avg_similarity,
      member_count: c.member_count,
      members: c.members,
      tabs: c.tabs,
      status: c.status || 'detected'
    }))
    const res = await wsSaveSharedComponents({
      graph_id: props.graphId,
      shared_components: payload
    })
    if (res.code === 200) {
      if (!silent) {
        ElMessage.success('共用组件已保存到图谱')
      }
      emit('saved', payload)
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.shared-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(16px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: #6366f1;
}

.panel-title {
  font-weight: 600;
  font-size: 15px;
  color: #1e293b;
}

.panel-intro {
  padding: 0 16px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}

.scan-bar {
  display: flex;
  gap: 8px;
  padding: 0 16px 12px;
}

.region-select {
  flex: 1;
}

.panel-scroll {
  flex: 1;
  padding: 0 12px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
}

.empty-state p {
  margin: 12px 0 4px;
  font-weight: 500;
  color: #64748b;
}

.empty-state span {
  font-size: 12px;
}

.cluster-card {
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}

.cluster-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.cluster-head-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.cluster-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.cluster-title .name {
  font-weight: 600;
  color: #334155;
}

.cluster-meta {
  font-size: 12px;
  color: #64748b;
}

.cluster-meta .score {
  color: #6366f1;
  font-weight: 500;
}

.cluster-meta .dot {
  margin: 0 4px;
}

.region-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.phone-frame {
  position: relative;
  width: 56px;
  height: 96px;
  border-radius: 8px;
  border: 2px solid #cbd5e1;
  background: #0f172a;
  overflow: hidden;
  flex-shrink: 0;
}

.phone-content {
  position: absolute;
  inset: 12% 8% 18%;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
}

.region-highlight {
  position: absolute;
  left: 0;
  right: 0;
  background: rgba(99, 102, 241, 0.55);
  border: 1px solid #818cf8;
}

.rect-label {
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

.section-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}

.tab-slots {
  margin-bottom: 12px;
}

.tab-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.members {
  margin-bottom: 12px;
}

.member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.member-row:hover {
  background: rgba(99, 102, 241, 0.08);
}

.member-name {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
}

.member-comp {
  display: block;
  font-size: 11px;
  color: #6366f1;
  margin-top: 2px;
}

.member-comp.muted {
  color: #94a3b8;
}

.member-right {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #94a3b8;
}

.cluster-actions {
  display: flex;
  justify-content: flex-end;
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.8);
}
</style>
