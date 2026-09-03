<template>
  <div class="case-editor-root" ref="editorContainerRef">
    <!-- 🔥 Teleport Toolbar to Global TitleBar -->
    <Teleport to="#titlebar-center-portal">
      <div class="editor-toolbar-portal" v-if="isPicker">
        <span class="portal-label">请点击画面中的热区进行选择</span>
        <div class="portal-actions">
          <el-button size="small" round @click="$emit('close')">取消</el-button>
        </div>
      </div>
      <div class="editor-toolbar-portal" v-else>
        <el-button :icon="ArrowLeft" text circle size="default" @click="$router.back()" class="portal-back-btn"/>

        <div class="portal-group">
          <el-button-group>
            <el-button type="primary" link size="small" @click="addNode('page')">
              <el-icon><Document /></el-icon> 页面
            </el-button>
            <el-button type="warning" link size="small" @click="addNode('component')">
              <el-icon><Cpu /></el-icon> 组件
            </el-button>
          </el-button-group>
        </div>

        <div class="portal-divider"></div>

        <div class="portal-group">
          <el-button type="primary" link size="small" @click="openSharedPanel" title="跨页面共有组件">
            <el-icon><Connection /></el-icon> 共用组件
          </el-button>
          <el-button type="success" link size="small" @click="openIdentifyPageDialog" title="上传截图，按骨架匹配页面">
            <el-icon><Search /></el-icon> 识别页面
          </el-button>
          <el-button type="warning" link size="small" @click="openCrawlDialog" title="连接真机自动跑图">
            跑图
          </el-button>
        </div>

        <div class="portal-divider"></div>

        <div class="portal-group">
          <el-button type="danger" link size="small" :icon="Delete" :disabled="selectedElements.length === 0" @click="removeSelected" title="删除选中">
          </el-button>
          <el-button type="info" link size="small" :icon="Refresh" @click="fitView" title="重置视图"></el-button>
        </div>

        <div class="portal-info">
          <span v-if="saveStatus === 'saving'" class="save-status saving">
            <el-icon class="is-loading"><Refresh/></el-icon>
          </span>
          <span v-else-if="saveStatus === 'saved'" class="save-status saved">✔</span>
          <span v-else-if="saveStatus === 'unsaved'" class="save-status unsaved">⚠️</span>
        </div>
      </div>
    </Teleport>

    <!-- 🔥 Layer 0: Full Screen Canvas -->
    <div class="flow-wrapper">
        <VueFlow
            id="case-editor-canvas"
            v-if="isReady"
            v-model:nodes="nodes"
            v-model:edges="edges"
            :default-zoom="1.2"
            :min-zoom="0.2"
            :max-zoom="4"
            fit-view-on-init
            class="flow-canvas"
            :nodes-draggable="!isPicker"
            :nodes-connectable="!isPicker"
            @connect="onConnect"
            @pane-ready="onPaneReady"
            @nodes-selection-change="onSelectionChange"
            @node-click="onNodeClick"
            @node-double-click="onNodeDoubleClick"
            @pane-click="onPaneClick"
            @nodes-change="onNodesChange"
            @edges-change="onEdgesChange"
            @dragover.prevent
            @drop="onCanvasDrop"
        >
          <!-- SOP Visual Grouping Layer -->
          <div v-for="sop in sops" :key="sop.id"
               class="sop-group-bg"
               :class="[sop.type === 'system' ? 'system' : 'business', { active: selectedSopId === sop.id }]"
               :style="getSopBoundingStyle(sop)">
            <span class="sop-group-label">{{ sop.name }}</span>
          </div>

          <template #node-page="props">
            <PageNode v-bind="props" :is-picker="isPicker" @update-size="(s) => handleNodeSizeUpdate(props.id, s)"/>
          </template>
          <template #node-component="props">
            <PageNode v-bind="props" :is-picker="isPicker" @update-size="(s) => handleNodeSizeUpdate(props.id, s)"/>
          </template>

          <Background pattern-color="rgba(203, 213, 225, 0.4)" :gap="20"/>
          <Controls/>
          <MiniMap/>
        </VueFlow>
    </div>

    <!-- 🔥 Layer 10: Floating Left Card (SOPs) -->
    <Transition name="slide-fade-left">
      <div class="floating-card left" v-if="!isPicker && showLeftPanel">
        <div class="panel-header">
          <span class="panel-title">SOP Graph</span>
          <div class="header-actions">
            <el-button
                type="success"
                link
                size="small"
                :disabled="!currentProjectId"
                @click="showProjectEnvSettings = true"
                title="项目环境（开发/测试/预发/正式）"
            >
              项目环境
            </el-button>
            <el-button type="info" link size="small" @click="openGraphSettings" title="图谱变量 (graph.*)">
              <el-icon><Setting /></el-icon>
            </el-button>
            <el-button type="primary" link size="small" @click="createNewSOP">
              <el-icon><Plus /></el-icon>
            </el-button>
            <el-button link size="small" @click="showLeftPanel = false" class="collapse-btn">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>

        <ElTabs v-model="activeSopTab" class="glass-tabs" stretch>
          <ElTabPane label="Business" name="business">
            <el-scrollbar>
              <div class="sop-list">
                <div v-for="sop in businessSops" :key="sop.id"
                     class="glass-card sop-item business"
                     :class="{ active: selectedSopId === sop.id }"
                     draggable="true"
                     @dragstart="onSopDragStart($event, sop)"
                     @click="selectSOP(sop)">
                  <div class="sop-header">
                    <span class="sop-name">{{ sop.name }}</span>
                  </div>
                  <div class="sop-desc">{{ sop.desc || 'No description' }}</div>
                </div>
              </div>
            </el-scrollbar>
          </ElTabPane>
          <ElTabPane label="System" name="system">
            <el-scrollbar>
              <div class="sop-list">
                <div v-for="sop in systemSops" :key="sop.id"
                     class="glass-card sop-item system"
                     :class="{ active: selectedSopId === sop.id }"
                     draggable="true"
                     @dragstart="onSopDragStart($event, sop)"
                     @click="selectSOP(sop)">
                  <div class="sop-header">
                    <span class="sop-name">{{ sop.name }}</span>
                    <el-tag size="small" type="danger" effect="dark" round>P{{ sop.priority }}</el-tag>
                  </div>
                  <div class="sop-desc">{{ sop.desc || 'No trigger defined' }}</div>
                </div>
              </div>
            </el-scrollbar>
          </ElTabPane>
        </ElTabs>
      </div>
    </Transition>

    <!-- Left FAB (Closed) -->
    <Transition name="fade">
      <div class="fab-toggle left" v-if="!isPicker && !showLeftPanel" @click="showLeftPanel = true">
        <el-icon size="20"><Menu /></el-icon>
      </div>
    </Transition>

    <!-- 🔥 Layer 10: Floating Right Card (Config) -->
    <Transition name="slide-fade-right">
      <div class="floating-card right" v-if="!isPicker && selectedSopId && showRightPanel">
        <div class="panel-header">
          <el-button link size="small" @click="showRightPanel = false" class="collapse-btn">
            <el-icon><Close /></el-icon>
          </el-button>
          <span class="panel-title">Configuration</span>
            <el-button type="danger" link size="small" @click="handleDeleteSOP">
              <el-icon><Delete /></el-icon>
            </el-button>
        </div>
          <el-scrollbar>
            <div class="form-wrapper">
              <div class="section-header">Basic Info</div>
              <div class="form-item">
                <div class="label">Name</div>
              <el-input v-model="currentSopForm.name" @change="handleUpdateSOP" class="glass-input"/>
              </div>
              <div class="form-item" v-if="activeSopTab === 'system'">
                <div class="label">Priority (Higher = First)</div>
              <el-input-number v-model="currentSopForm.priority" :min="0" :max="999" @change="handleUpdateSOP" class="glass-input"/>
              </div>
              <div class="form-item">
                <div class="label">Description</div>
              <el-input v-model="currentSopForm.desc" type="textarea" :rows="3" @change="handleUpdateSOP" class="glass-input"/>
              </div>

              <div class="section-divider"></div>
              <div class="section-header">Configuration</div>
              
              <div class="form-item">
                <div class="label">Variables (JSON)</div>
                <SmartJsonEditor 
                  v-model="currentSopForm.variablesStr" 
                  placeholder='{"key": "value"}'
                  @change="handleUpdateSOPVariables" 
                />
              </div>

              <div class="section-divider"></div>
              <div class="section-header">Workflow</div>

              <div class="form-item">
                <div class="label">Associated Cases</div>
                <div v-if="getSopCases(selectedSopId).length === 0" class="empty-text">No cases linked</div>
              <div v-for="c in getSopCases(selectedSopId)" :key="c.id" class="glass-card case-list-item">
                  <div class="case-info">
                    <el-icon><Document /></el-icon>
                    <span class="case-label" :title="c.label">{{ c.label }}</span>
                  </div>
                  <el-button link type="primary" size="small" @click="editCase(c)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                </div>
              </div>

              <div class="form-item">
                <div class="label">Actions</div>
                <el-button type="primary" plain style="width: 100%" @click="addCaseToSOP">
                  <el-icon><Plus /></el-icon> 新增关联用例 (Workflow)
                </el-button>
              </div>
            </div>
          </el-scrollbar>
      </div>
    </Transition>

    <!-- Right FAB (Closed) -->
    <Transition name="fade">
      <div class="fab-toggle right" v-if="!isPicker && selectedSopId && !showRightPanel" @click="showRightPanel = true">
        <el-icon size="20"><Setting /></el-icon>
      </div>
    </Transition>

    <!-- 共用组件面板 -->
    <Transition name="slide-fade-right">
      <div class="floating-card right shared-components-card" v-if="!isPicker && showSharedPanel">
        <SharedComponentsPanel
            :graph-id="graphId"
            :initial-shared="sharedComponents"
            @close="showSharedPanel = false"
            @focus-node="focusSharedNode"
            @saved="onSharedComponentsSaved"
        />
      </div>
    </Transition>

    <!-- 🔥 Layer 20: Focus Mode Overlay -->
    <transition name="fade">
      <div v-if="selectedNode" class="focus-mode-overlay" @click.self="clearSelection">
        <PageDetailEditor
            :node="selectedNode"
            :graph-id="graphId"
            :shared-components="sharedComponents"
            @close="clearSelection"
            @update="onNodeUpdate"
        />
      </div>
    </transition>

    <!-- 图谱变量 (graph.*) — 不含包名/URL -->
    <el-dialog v-model="showGraphSettings" title="图谱变量 (graph.*)" width="500px">
      <div class="form-wrapper" style="padding: 0">
        <div class="form-item">
          <div class="label">Variables (JSON)</div>
          <el-input 
            v-model="graphVariablesStr" 
            type="textarea" 
            :rows="10" 
            placeholder='{"api_host": "https://api.test.com"}'
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="showGraphSettings = false">Cancel</el-button>
        <el-button type="primary" @click="saveGraphSettings">Save</el-button>
      </template>
    </el-dialog>

    <ProjectEnvSettings
        v-model="showProjectEnvSettings"
        :project-id="currentProjectId"
        :project-name="currentProjectName"
    />

    <el-dialog v-model="showCrawlDialog" title="自动跑图" width="560px" destroy-on-close :close-on-click-modal="!crawlLoading">
      <div class="form-item">
        <div class="label">执行节点（已连接设备）</div>
        <el-select
            v-model="crawlForm.sn"
            placeholder="请选择在线节点"
            filterable
            style="width: 100%"
            :loading="crawlDevicesLoading"
        >
          <el-option
              v-for="d in crawlDeviceOptions"
              :key="d.sn"
              :label="`${d.sn} (${d.type || 'unknown'})`"
              :value="d.sn"
              :disabled="d.status !== 'online'"
          />
        </el-select>
      </div>
      <div class="form-item">
        <div class="label">应用包名</div>
        <el-input v-model="crawlForm.package" placeholder="留空则不自动启动 App" />
      </div>
      <div class="form-item">
        <div class="label">最多探索页面数</div>
        <el-input-number v-model="crawlForm.maxPages" :min="1" :max="40" />
      </div>
      <el-alert
          v-if="crawlLoading"
          type="info"
          :closable="false"
          show-icon
          title="跑图进行中…"
          description="请勿锁屏或切换 App，完成后会自动刷新图谱。"
          style="margin-bottom: 12px"
      />
      <div v-if="crawlResult" class="identify-result">
        <p class="identify-best matched">
          完成：{{ crawlResult.pages?.length || 0 }} 页，{{ crawlResult.navigations?.length || 0 }} 条跳转
        </p>
        <el-table
            v-if="crawlResult.pages?.length"
            :data="crawlResult.pages"
            size="small"
            max-height="200"
            style="margin-top: 8px"
        >
          <el-table-column prop="label" label="页面" min-width="120"/>
          <el-table-column prop="node_id" label="节点 ID" min-width="140" show-overflow-tooltip/>
          <el-table-column label="" width="72">
            <template #default="{ row }">
              <el-button type="primary" link size="small" @click="focusIdentifiedNode(row.node_id)">定位</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="showCrawlDialog = false" :disabled="crawlLoading">关闭</el-button>
        <el-button type="primary" :loading="crawlLoading" @click="startCrawl">开始跑图</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showIdentifyPageDialog" title="骨架识别页面" width="520px" destroy-on-close>
      <el-upload
          drag
          accept="image/*"
          :auto-upload="false"
          :show-file-list="false"
          :disabled="identifyPageLoading"
          @change="onIdentifyImagePick"
      >
        <el-icon class="el-icon--upload"><Search /></el-icon>
        <div class="el-upload__text">拖拽或点击选择截图</div>
      </el-upload>
      <div v-if="identifyPreviewUrl" class="identify-preview">
        <img :src="identifyPreviewUrl" alt="preview"/>
      </div>
      <div v-if="identifyPageResult" class="identify-result">
        <div v-if="identifyPageResult.matched" class="identify-best matched">
          最匹配：<strong>{{ identifyPageResult.label }}</strong>
          <el-tag type="success" size="small">相似度 {{ (identifyPageResult.score * 100).toFixed(1) }}%</el-tag>
          <el-button type="primary" link size="small" @click="focusIdentifiedNode(identifyPageResult.node_id)">定位</el-button>
        </div>
        <div v-else class="identify-best unmatched">
          未达到阈值（{{ (identifyPageResult.min_score * 100).toFixed(0) }}%），最高分页面见下表
        </div>
        <el-table
            v-if="identifyPageResult.rankings?.length"
            :data="identifyPageResult.rankings"
            size="small"
            max-height="220"
            style="margin-top: 10px"
        >
          <el-table-column prop="label" label="页面" min-width="120"/>
          <el-table-column label="相似度" width="100">
            <template #default="{ row }">{{ (row.score * 100).toFixed(1) }}%</template>
          </el-table-column>
          <el-table-column label="" width="72">
            <template #default="{ row }">
              <el-button type="primary" link size="small" @click="focusIdentifiedNode(row.node_id)">定位</el-button>
            </template>
          </el-table-column>
        </el-table>
        <p v-if="identifyPageResult.skipped_pages?.length" class="env-hint" style="margin-top: 8px">
          {{ identifyPageResult.skipped_pages.length }} 个页面未训练骨架，未参与比对
        </p>
      </div>
      <template #footer>
        <el-button @click="showIdentifyPageDialog = false">关闭</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import {ref, onMounted, onUnmounted, watch, shallowRef, computed} from 'vue'
import {useRouter, useRoute, onBeforeRouteLeave} from 'vue-router'
import {VueFlow, useVueFlow} from '@vue-flow/core'
import {Background} from '@vue-flow/background'
import {Controls} from '@vue-flow/controls'
import {MiniMap} from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import {ElButton, ElButtonGroup, ElTag, ElContainer, ElHeader, ElMain, ElIcon, ElMessage, ElAside, ElScrollbar, ElInput, ElInputNumber, ElEmpty, ElDialog, ElTabs, ElTabPane, ElUpload, ElTable, ElTableColumn, ElSelect, ElOption, ElAlert} from 'element-plus'
import {Delete, Refresh, ArrowLeft, Plus, Document, Edit, Setting, Cpu, CaretLeft, CaretRight, Menu, Close, Connection, Search} from '@element-plus/icons-vue'
import PageNode from './PageNode.vue'
import SmartJsonEditor from '@/components/Core/SmartJsonEditor.vue'
import { useAppStore } from '@/store/appStore'
import PageDetailEditor from './PageDetailEditor.vue'
import ProjectEnvSettings from './ProjectEnvSettings.vue'
import SharedComponentsPanel from './SharedComponentsPanel.vue'
import * as api from '../../../api/workReport'
import * as wsApi from '@/api/wsAppGraph'
import { fetchWorkflowDetailSimple, fetchWorkflowAdd } from '@/api/workflow'

const props = defineProps({
  nodeData: { type: Object, default: () => ({}) },
  isPicker: { type: Boolean, default: false },
  appId: { type: [String, Number], default: '' }
})
const emit = defineEmits(['pick', 'close'])

const appStore = useAppStore()

const isReady = ref(false)
const nodes = ref([])
const edges = ref([])
const activeSopTab = ref('business')
const workflowCache = ref({}) // 🔥 缓存 Workflow 详情 (id -> {id, name, desc})
const sops = ref([]) // SOP List
const selectedSopId = ref(null)
const currentSopForm = ref({ name: '', desc: '', variablesStr: '{}' })
const showGraphSettings = ref(false)
const showProjectEnvSettings = ref(false)
const currentProjectId = ref('')
const currentProjectName = ref('')
const graphVariablesStr = ref('{}')
const router = useRouter()
const route = useRoute()
const graphId = ref(null)
const saveStatus = ref('saved')
let autoSaveTimer = null
const flowInstance = shallowRef(null)
const editorContainerRef = ref(null)

// 🔥 Panel State
const showLeftPanel = ref(true)
const showRightPanel = ref(true)
const showSharedPanel = ref(false)
const sharedComponents = ref([])

const showCrawlDialog = ref(false)
const crawlLoading = ref(false)
const crawlResult = ref(null)
const crawlForm = ref({ sn: '', package: '', maxPages: 15 })
const crawlDeviceOptions = ref([])
const crawlDevicesLoading = ref(false)

const showIdentifyPageDialog = ref(false)
const identifyPageLoading = ref(false)
const identifyPreviewUrl = ref('')
const identifyPageResult = ref(null)

const currentAppId = computed(() => {
  const id = props.appId || route.params.appId || route.query.appId
  return id ? String(id) : ''
})

const loadProjectMeta = async () => {
  if (!currentAppId.value) {
    currentProjectId.value = ''
    currentProjectName.value = ''
    return
  }
  try {
    const res = await api.getAppDetail(currentAppId.value)
    const data = res?.data || res || {}
    currentProjectId.value = data.project_id || ''
    currentProjectName.value = data.project_name || ''
  } catch {
    currentProjectId.value = ''
    currentProjectName.value = ''
  }
}

watch(currentAppId, () => loadProjectMeta(), { immediate: true })

const onPaneReady = (instance) => {
  flowInstance.value = instance
  instance.fitView()
}

// --- Drag & Drop Logic (SOP to Canvas) ---
const onSopDragStart = (event, sop) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify(sop))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

const onCanvasDrop = async (event) => {
  const dataStr = event.dataTransfer?.getData('application/json')
  if (!dataStr) return
  
  try {
    const sop = JSON.parse(dataStr)
    const { x, y } = flowInstance.value.project({ x: event.clientX, y: event.clientY })
    
    // Create a new node representing a logic branch for this SOP
    // The prompt asks for "automatically generating a logic branch dependent on that component's recognition result"
    // We'll create a 'component' node with the SOP name as label, implying a check.
    
    const newNode = {
      id: `node-${Date.now()}`,
      type: 'component', 
      position: { x, y },
      label: `Check: ${sop.name}`,
      data: {
        label: `Check: ${sop.name}`,
        desc: `Logic branch for SOP: ${sop.name}`,
        type: 'component',
        interactions: [], 
        naturalSize: { w: 375, h: 667 }
      }
    }
    
    // Save to backend
    if (graphId.value) {
      await wsApi.wsAddEmptyNode({
        graph_id: graphId.value,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(x),
        y: parseInt(y)
      })
    }
    
    nodes.value.push(newNode)
    triggerAutoSave()
  } catch (e) {
    console.error('Drop failed', e)
  }
}

// --- SOP Logic ---
const createNewSOP = async () => {
  if (!graphId.value) return
  try {
    const type = activeSopTab.value === 'system' ? 'system' : 'business'
    const priority = type === 'system' ? 100 : 0
    const res = await wsApi.wsCreateSOP({
      graph_id: graphId.value,
      name: 'New SOP ' + (sops.value.length + 1),
      type: type,
      priority: priority,
      desc: 'Created via frontend',
      nodes: []
    })
    if (res.code === 200) {
      // Refresh or push to list
      // Assuming backend returns the created SOP object
      // For now, let's reload the graph to be safe or push if structure matches
      loadGraphData() 
    }
  } catch (e) {
    ElMessage.error('Failed to create SOP')
  }
}

const selectSOP = (sop) => {
  selectedSopId.value = sop.id
  // Init form
  currentSopForm.value = {
    name: sop.name,
    desc: sop.desc,
    priority: sop.priority || 0,
    variablesStr: JSON.stringify(sop.variables || {}, null, 2)
  }
}

const businessSops = computed(() => sops.value.filter(s => s.type !== 'system' && s.type !== 'interaction'))
const systemSops = computed(() => sops.value.filter(s => s.type === 'system' || s.type === 'interaction').sort((a, b) => (b.priority || 0) - (a.priority || 0)))

const getSopBoundingStyle = (sop) => {
  if (!sop || !sop.nodes || sop.nodes.length === 0) return { display: 'none' }
  
  // 找到所有关联节点
  const relatedNodes = nodes.value.filter(n => sop.nodes.includes(n.id))
  if (relatedNodes.length === 0) return { display: 'none' }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  relatedNodes.forEach(n => {
    const x = n.position.x
    const y = n.position.y
    // Use dimensions from VueFlow if available, else fallback to estimated size
    const w = n.dimensions?.width || 160 
    const h = n.dimensions?.height || 200
    
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + w > maxX) maxX = x + w
    if (y + h > maxY) maxY = y + h
  })

  const padding = 40
  return {
    left: (minX - padding) + 'px',
    top: (minY - padding) + 'px',
    width: (maxX - minX + padding * 2) + 'px',
    height: (maxY - minY + padding * 2) + 'px'
  }
}

const getSopCases = (sopId) => {
  const sop = sops.value.find(s => s.id === sopId)
  if (!sop || !sop.workflows) return []
  // 从缓存中获取 Workflow 详情，如果没有则显示 ID
  return sop.workflows.map(wfItem => {
    const wfId = typeof wfItem === 'object' ? wfItem.id : wfItem
    return workflowCache.value[wfId] || { id: wfId, label: 'Loading...', desc: '' }
  })
}

const editCase = (node) => {
  const targetId = node.id
  const currentAppId = props.appId || route.params.appId || route.query.appId

  if (targetId) {
    router.push({
      name: 'Editor',
      params: { id: targetId },
      query: { appId: currentAppId }
    })
  } else {
    ElMessage.warning('未找到关联的工作流 ID')
  }
}

const addCaseToSOP = async () => {
  if (!selectedSopId.value) return
  
  // 1. 直接创建 Workflow
  let newWorkflowId = null
  const newName = 'New Case ' + new Date().toLocaleString()
  try {
    const initialContent = {
      nodes: [
        {
          id: `public-trigger-${Date.now()}`,
          type: 'custom',
          nodeCode: 'public/trigger',
          nodeType: 200,
          position: { x: 100, y: 200 },
          data: {
            label: '开始',
            nodeCode: 'public/trigger',
            nodeType: 200,
            platform: 'common'
          }
        }
      ],
      edges: []
    }
    const res = await fetchWorkflowAdd(newName, 'Created via SOP', initialContent)
    if (res.code === 200) {
      newWorkflowId = res.data?.id || (res.data && typeof res.data !== 'object' ? res.data : null) || res.id
      // 缓存新用例信息
      if (newWorkflowId) {
        workflowCache.value[newWorkflowId] = { id: newWorkflowId, label: res.data?.name || newName, desc: '' }
      }
    }
  } catch (e) {
    ElMessage.error('创建用例失败')
    return
  }
  
  if (!newWorkflowId) return

  // 2. 关联到当前 SOP
  const sop = sops.value.find(s => s.id === selectedSopId.value)
  if (sop) {
    // 后端返回的是对象列表，但更新时通常传 ID 列表，或者我们需要构造一个临时对象推入
    const newWorkflowsList = [...(sop.workflows || []).map(w => String(typeof w === 'object' ? w.id : w)), String(newWorkflowId)]
    try {
      await wsApi.wsUpdateSOP({
        sop_id: selectedSopId.value,
        workflows: newWorkflowsList
      })
      sop.workflows = newWorkflowsList
      ElMessage.success('已创建用例并关联到 SOP')
    } catch (e) {
      ElMessage.error('关联 SOP 失败')
    }
  }
}

const handleUpdateSOP = async () => {
  if (!selectedSopId.value) return
  try {
    await wsApi.wsUpdateSOP({
      sop_id: selectedSopId.value,
      name: currentSopForm.value.name,
      desc: currentSopForm.value.desc,
      priority: currentSopForm.value.priority
    })
    // Update local list
    const sop = sops.value.find(s => s.id === selectedSopId.value)
    if (sop) {
      sop.name = currentSopForm.value.name
      sop.desc = currentSopForm.value.desc
      sop.priority = currentSopForm.value.priority
    }
  } catch (e) {
    ElMessage.error('Update failed')
  }
}

const handleUpdateSOPVariables = async () => {
  if (!selectedSopId.value) return
  try {
    const vars = JSON.parse(currentSopForm.value.variablesStr)
    const reserved = ['package', 'package_name', 'bundle', 'base_url']
    const hit = Object.keys(vars).filter(k =>
        reserved.some(r => k.toLowerCase().includes(r))
    )
    if (hit.length) {
      ElMessage.warning(`包名/URL 请在项目环境配置，不要写在 SOP 变量里（${hit.join(', ')}）`)
    }
    await wsApi.wsUpdateSOP({
      sop_id: selectedSopId.value,
      variables: vars
    })
    const sop = sops.value.find(s => s.id === selectedSopId.value)
    if (sop) sop.variables = vars
    ElMessage.success('SOP 变量已保存')
  } catch (e) {
    ElMessage.error('Invalid JSON format')
  }
}

const handleDeleteSOP = async () => {
  if (!selectedSopId.value) return
  try {
    await wsApi.wsDeleteSOP(selectedSopId.value)
    sops.value = sops.value.filter(s => s.id !== selectedSopId.value)
    selectedSopId.value = null
    ElMessage.success('SOP deleted')
  } catch (e) {
    ElMessage.error('Delete failed')
  }
}

const openGraphSettings = () => {
  showGraphSettings.value = true
}

const saveGraphSettings = async () => {
  try {
    const vars = JSON.parse(graphVariablesStr.value)
    // Assuming wsUpdateAppGraph exists or we use a generic update
    // Since wsUpdateAppGraph is not in the provided wsAppGraph.js context, 
    // I will assume it needs to be added or I should use a generic request.
    // For now, I'll use a direct sendWsRequest call pattern if needed, or assume wsApi has it.
    // Let's assume we need to add it to wsAppGraph.js as well.
    await wsApi.wsUpdateAppGraph({ graph_id: graphId.value, variables: vars })
    ElMessage.success('Global variables updated')
    showGraphSettings.value = false
  } catch (e) {
    ElMessage.error('Failed to save settings: ' + e.message)
  }
}

// 1. 完整的数据加载与重试逻辑
const loadGraphData = async (retryCount = 0) => {
  // 🔥 拾取模式 (单节点预览)：只有 nodeData 没有 appId 时才使用单节点预览
  if (props.isPicker && props.nodeData && !props.appId && !route.params.appId) {
    const n = props.nodeData
    nodes.value = [{
      id: n.id || 'preview',
      type: 'page',
      position: {x: 0, y: 0},
      data: {
        ...n,
        interactions: n.interactions || []
      }
    }]
    isReady.value = true
    return
  }

  // 🔥 优先使用传入的 appId (拾取模式)，否则使用路由参数
  const id = props.appId || route.params.appId || route.query.appId;

  if (id) {
    try {
      const isAppId = isNaN(Number(id))
      if (isAppId) {
        const listRes = await wsApi.wsGetAppGraphList(id)
        if (listRes.code === 200 && listRes.data?.length > 0) {
          graphId.value = listRes.data[0].id
        } else {
          const createRes = await wsApi.wsCreateAppGraph({name: 'Default Graph', app_id: id})
          if (createRes.code === 200) graphId.value = createRes.data.id
        }
      } else {
        graphId.value = id
      }

      if (graphId.value) {
        const detailRes = await wsApi.wsGetAppGraphDetail(graphId.value)
        if (detailRes.code === 200) {
          const rawNodes = detailRes.data.nodes || []
          const rawEdges = detailRes.data.edges || []// 在 loadGraphData 函数内修改 nodes.value 的映射部分
          sops.value = detailRes.data.sops || [] // Load SOPs

          // Load Graph Variables
          const gVars = detailRes.data.variables || {}
          graphVariablesStr.value = JSON.stringify(gVars, null, 2)
          sharedComponents.value = gVars.shared_components || []

          const allMappedNodes = rawNodes.map(n => {
            // 1. 兼容后端返回的 components 字段 (你在 save 时传的是这个)
            const rawComponents = n.components || n.data?.interactions || [];

            // 2. 还原 interactions 结构
            const processedInteractions = rawComponents.map((c, idx) => {
              const rect = c.rect || c
              const rules = c.rules || {}
              
              // 🔥 修复：确保 ID 存在。如果后端数据缺失 ID，使用确定性算法生成临时 ID
              const effectiveId = c.id || c.uid || `gen-${n.id}-${idx}`
              const base = {
                ...c,
                id: effectiveId,
                uid: effectiveId,
                component_type: c.component_type || rules.component_type || 'custom',
                shared_region: c.shared_region || rules.shared_region || '',
                needs_confirmation: c.needs_confirmation ?? rules.needs_confirmation ?? false,
                action: c.action || rules.action || 'click',
              }

              if (c.rect) {
                return {...base, x: Number(c.rect.x), y: Number(c.rect.y), w: Number(c.rect.w), h: Number(c.rect.h), states: c.states || []};
              }
              return {...base, x: Number(c.x), y: Number(c.y), w: Number(c.w), h: Number(c.h), states: c.states || []};
            });

            return {
              id: String(n.id),
              type: n.type || 'page',
              label: n.label || n.data?.label || '未命名',
              position: {x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0},
              data: {
                ...(n.data || {}),
                // 🔥 核心修复：确保 naturalSize 从数据库还原回 data 中
                naturalSize: n.naturalSize || n.data?.naturalSize || {w: 375, h: 667},
                interactions: processedInteractions,
                desc: n.desc || n.data?.desc || '',
                type: n.type || 'page',
                is_blocking: n.is_blocking || n.data?.is_blocking || false, // 🔥 阻断属性
                workflow_id: n.workflow_id || n.data?.workflow_id,
                screenshot: n.screenshot || n.data?.screenshot,
                skeleton_config: n.skeleton_config || n.data?.skeleton_config || {},

              },
              selected: false,
              dragging: false
            }
          })

          // 🔥 过滤掉旧数据的 Case 节点，画布只显示页面和组件
          nodes.value = allMappedNodes.filter(n => n.type !== 'case')

          // 🔥 加载 SOP 关联的 Workflow 详情
          const allWorkflowIds = new Set()
          sops.value.forEach(s => {
            if (s.workflows && Array.isArray(s.workflows)) {
              s.workflows.forEach(w => {
                const id = typeof w === 'object' ? w.id : w
                allWorkflowIds.add(id)
              })
            }
          })
          
          if (allWorkflowIds.size > 0) {
            Promise.all(Array.from(allWorkflowIds).map(async (wfId) => {
              try {
                const res = await fetchWorkflowDetailSimple(wfId)
                if (res.code === 200 && res.data) {
                  workflowCache.value[wfId] = { id: wfId, label: res.data.name, desc: res.data.desc || '' }
                }
              } catch (e) {
                console.error('Fetch workflow detail failed', e)
              }
            }))
          }

          // 🔥 修复：过滤掉孤立的连线 (因为部分节点可能被隐藏)
          const validNodeIds = new Set(nodes.value.map(n => n.id))
          edges.value = rawEdges
              .filter(e => validNodeIds.has(String(e.source)) && validNodeIds.has(String(e.target)))
              .map(e => {
                // Smart Connection Logic: Color code based on label
                const label = (e.label || '').toLowerCase()
                let stroke = '#94a3b8' // Default Grey
                let strokeDasharray = '0'

                if (['yes', 'ok', 'success', 'pass', 'true'].some(k => label.includes(k))) stroke = '#10b981' // Green
                else if (['no', 'fail', 'error', 'cancel', 'false'].some(k => label.includes(k))) stroke = '#ef4444' // Red
                else if (['loop', 'fallback', 'retry'].some(k => label.includes(k))) {
                  stroke = '#64748b'
                  strokeDasharray = '5 5'
                }
                return {...e, id: String(e.id), style: { stroke, strokeWidth: 2, strokeDasharray }}
              })
        }
      }
    } catch (e) {
      if ((e.code === 'ECONNABORTED' || e.code === 'ERR_NETWORK') && retryCount < 3) {
        setTimeout(() => loadGraphData(retryCount + 1), 3000);
      } else {
        ElMessage.error('加载图谱数据失败')
      }
    }
  }
  setTimeout(() => {
    isReady.value = true
    const lastVisitedId = sessionStorage.getItem('last_visited_case_id')
    if (lastVisitedId) {
      sessionStorage.removeItem('last_visited_case_id')
      const targetNode = nodes.value.find(n => n.id === lastVisitedId)
      if (targetNode) flowInstance.value?.fitView({nodes: [targetNode], padding: 0.2, duration: 800})
    }
  }, 400)
}

onMounted(() => {
  loadGraphData()
})
watch(() => route.fullPath, () => {
  loadGraphData()
})

// 2. 完整的快捷键逻辑
const handleKeydown = (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return
  if (selectedElements.value.length === 0) return
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      selectedNode.value = selectedElements.value[0];
      break
    case 'Enter':
      e.preventDefault();
      addSiblingNode();
      break
    case 'Tab':
      e.preventDefault();
      e.shiftKey ? addParentNode() : addChildNode();
      break
  }
}
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  Object.values(saveTimers).forEach(t => clearTimeout(t))
})

const selectedElements = ref([])
const selectedNode = ref(null)
const saveTimers = {}

const getSafeScreenshot = (val) => {
  if (val && typeof val === 'object') return val.path || val.url
  return typeof val === 'string' ? val : null
}

// 辅助：清洗路径
const cleanPath = (path) => {
  if (path && typeof path === 'string' && path.startsWith('/static/')) return path.replace('/static/', '')
  return path
}

// 3. 完整的连线与 ParentNode 逻辑
const onConnect = async (params) => {
  // 🔥 拾取模式下禁止连线操作
  if (props.isPicker) return

  flowInstance.value?.addEdges([{
    ...params,
    style: { stroke: '#94a3b8', strokeWidth: 2 }
  }])
  const sourceNode = nodes.value.find(n => n.id === params.source)
  const targetNode = nodes.value.find(n => n.id === params.target)
  if (sourceNode && targetNode) {
    let parentId = null;
    let childNode = null
    const priority = {page: 3, component: 2, case: 1}
    const sLevel = priority[sourceNode.type] || 0
    const tLevel = priority[targetNode.type] || 0
    if (sLevel >= tLevel) {
      parentId = sourceNode.id;
      childNode = targetNode
    } else {
      parentId = targetNode.id;
      childNode = sourceNode
    }

    if (childNode && parentId) {
      childNode.parentNode = parentId
      const payload = {
        graph_id: graphId.value,
        node_id: childNode.id,
        type: childNode.type,
        label: childNode.label,
        desc: childNode.data.desc || '',
        parentNode: parentId,
        naturalSize: childNode.data.naturalSize || null,
        screenshot: cleanPath(getSafeScreenshot(childNode.data.screenshot)),
        workflow_id: childNode.data.workflow_id ? String(childNode.data.workflow_id) : null,
        skeleton_config: childNode.data.skeleton_config || {},
        components: (childNode.data.interactions || []).map(c => ({
          ...c,
          uid: c.uid || c.id || null,
          rect: {x: c.x, y: c.y, w: c.w, h: c.h},
          skeleton_config: c.skeleton_config || {},
          states: (c.states || []).map(s => ({...s, skeleton_config: s.skeleton_config || {}}))
        }))
      }
      try {
        await wsApi.wsSaveNodeDetail(payload)
      } catch (e) {
        console.error('Save parentNode failed', e)
      }
    }
  }
  triggerAutoSave()
}

const onSelectionChange = (elements) => {
  selectedElements.value = elements.nodes || []
}
const onNodeClick = (e) => {
  // 🔥 拾取模式：计算点击位置是否命中热区
  if (props.isPicker) {
    const {node, event} = e
    
    // 1. 尝试使用 DOM 元素计算 (最准确，所见即所得)
    // 🔥 修复：使用 ref 获取当前容器，防止 document.querySelector 选中背景中其他编辑器的节点
    const container = editorContainerRef.value?.$el || editorContainerRef.value
    const nodeEl = container?.querySelector(`[data-id="${node.id}"]`)
    let checkX, checkY
    
    if (nodeEl) {
      // 🔥 修复：优先定位图片元素，排除节点头部/边框的影响 (Header 高度会导致 Y 轴偏移)
      const targetEl = nodeEl.querySelector('img') || nodeEl
      const rect = targetEl.getBoundingClientRect()

      // 计算点击在节点内的相对百分比位置
      const percentX = (event.clientX - rect.left) / rect.width
      const percentY = (event.clientY - rect.top) / rect.height
      
      // 映射到原始尺寸
      const naturalW = node.data.naturalSize?.w || rect.width
      const naturalH = node.data.naturalSize?.h || rect.height
      
      checkX = percentX * naturalW
      checkY = percentY * naturalH

      // 🔥 增加模糊匹配逻辑：如果未精准命中，尝试寻找最近的热区 (容错范围 20px)
      const scale = naturalW / rect.width
      const threshold = 20 * scale
      const interactions = node.data.interactions || []

      // 1. 精准命中
      let hit = interactions.find(i =>
          checkX >= i.x && checkX <= i.x + i.w &&
          checkY >= i.y && checkY <= i.y + i.h
      )

      // 2. 模糊命中 (寻找最近的)
      if (!hit) {
        let minDesc = Infinity
        let closest = null
        for (const i of interactions) {
          // 计算点到矩形的距离
          const dx = Math.max(i.x - checkX, 0, checkX - (i.x + i.w))
          const dy = Math.max(i.y - checkY, 0, checkY - (i.y + i.h))
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist <= threshold && dist < minDesc) {
            minDesc = dist
            closest = i
          }
        }
        if (closest) hit = closest
      }

      if (hit) {
        // 🔥 携带上下文信息 (截图、尺寸)，以便接收方能显示缩略图
        const payload = {
          ...hit,
          __context: { screenshot: node.data.screenshot, naturalSize: node.data.naturalSize, sourceNodeId: node.id }
        }
        emit('pick', payload)
      } else {
        ElMessage.info('未点击到热区，请点击标记框选区域')
      }
      return
    } else {
      // 2. 降级方案：使用 Vue Flow 坐标投影
      if (!flowInstance.value) return
      const flowPos = flowInstance.value.project({x: event.clientX, y: event.clientY})
      const relX = flowPos.x - node.position.x
      const relY = flowPos.y - node.position.y

      const currentW = node.dimensions?.width || node.data.naturalSize?.w || 1
      const currentH = node.dimensions?.height || node.data.naturalSize?.h || 1
      const scaleX = (node.data.naturalSize?.w || currentW) / currentW
      const scaleY = (node.data.naturalSize?.h || currentH) / currentH
      
      checkX = relX * scaleX
      checkY = relY * scaleY

      const hit = (node.data.interactions || []).find(i =>
          checkX >= i.x && checkX <= i.x + i.w &&
          checkY >= i.y && checkY <= i.y + i.h
      )
      if (hit) {
        // 🔥 携带上下文信息 (截图、尺寸)，以便接收方能显示缩略图
        const payload = {
          ...hit,
          __context: { screenshot: node.data.screenshot, naturalSize: node.data.naturalSize }
        }
        emit('pick', payload)
      }
    }
    return
  }
}

// 4. 完整的双击跳转逻辑
const onNodeDoubleClick = (e) => {
  // 🔥 拾取模式：支持双击选中 (复用单击逻辑)
  if (props.isPicker) {
    onNodeClick(e)
    return
  }

  const {node} = e
  if (node.type === 'case') {
    sessionStorage.setItem('last_visited_case_id', node.id)
    const targetId = node.data?.workflow_id
    
    // 🔥 关键修复：跳转时携带当前 AppID，确保流程编辑器知道上下文
    const currentAppId = props.appId || route.params.appId || route.query.appId

    if (targetId) {
      router.push({name: 'Editor', params: {id: targetId}, query: {appId: currentAppId}})
    } else if (node.id.toString().startsWith('node-')) {
      router.push({name: 'Editor', query: {appId: currentAppId}})
    } else {
      router.push({name: 'Editor', params: {id: node.id}, query: {appId: currentAppId}})
    }
    return
  }

  // 🔥 Focus Mode: Zoom into the node
  flowInstance.value?.fitView({ nodes: [node.id], duration: 800, padding: 0.5 })
  selectedNode.value = node
}

const onPaneClick = () => {
}
const clearSelection = () => {
  selectedNode.value = null
}

// 5. 完整的自动保存逻辑
const triggerAutoSave = () => {
  // 🔥 严重修复：拾取模式下绝对禁止触发自动保存，否则会覆盖掉被隐藏的节点(如用例节点)导致数据丢失
  if (props.isPicker) return

  appStore.setCanvasDirty(true)
  saveStatus.value = 'saving'
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(handleSaveLayout, 1000)
}

const ensureGraphId = async () => {
  if (graphId.value) return graphId.value
  const appId = route.params.appId
  if (!appId) return null
  try {
    const createRes = await wsApi.wsCreateAppGraph({name: 'New Workflow ' + new Date().toLocaleString(), app_id: appId})
    if (createRes.code === 200) {
      graphId.value = createRes.data.id
      router.replace({query: {...route.query, id: graphId.value}})
      return graphId.value
    }
  } catch (e) {
    console.error(e)
  }
  return null
}

const handleSaveLayout = async () => {
  // 🔥 严重修复：拾取模式下禁止保存布局
  if (props.isPicker) return

  try {
    if (!graphId.value) {
      if (!await ensureGraphId()) {
        saveStatus.value = 'unsaved';
        return
      }
    }
    const saveNodes = nodes.value.map(n => ({
      id: n.id,
      position: n.position,
      type: n.type,
      parentNode: n.parentNode,
      data: {...n.data, label: n.label || n.data.label}
    }))
    const saveEdges = edges.value.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      label: e.label,
      trigger: e.data?.trigger
    }))
    await wsApi.wsSyncGraphLayout({graph_id: graphId.value, nodes: saveNodes, edges: saveEdges})
    appStore.setCanvasDirty(false)
    saveStatus.value = 'saved'
  } catch (e) {
    // On failure, it remains dirty
    saveStatus.value = 'unsaved'
  }
}

const onNodesChange = (changes) => {
  if (changes.some(c => c.type === 'position' || c.type === 'remove' || c.type === 'add')) triggerAutoSave()
}
const onEdgesChange = (changes) => {
  if (changes.some(c => c.type === 'remove' || c.type === 'add')) triggerAutoSave()
}

const buildNodeSavePayload = (updatedNode) => ({
  graph_id: graphId.value,
  node_id: updatedNode.id,
  type: updatedNode.type || 'page',
  label: updatedNode.label,
  desc: updatedNode.data.desc || '',
  is_blocking: updatedNode.data.is_blocking || false,
  parentNode: updatedNode.parentNode || null,
  naturalSize: updatedNode.data.naturalSize || null,
  screenshot: cleanPath(getSafeScreenshot(updatedNode.data.screenshot)),
  skeleton_config: updatedNode.data.skeleton_config || {},
  workflow_id: updatedNode.data.workflow_id ? String(updatedNode.data.workflow_id) : null,
  components: (updatedNode.data.interactions || []).map(c => ({
    ...c,
    uid: c.uid || c.id || null,
    rect: {x: c.x, y: c.y, w: c.w, h: c.h},
    rules: {
      ...(c.rules || {}),
      component_type: c.component_type || c.rules?.component_type || 'custom',
      shared_region: c.shared_region || c.rules?.shared_region || '',
      needs_confirmation: !!c.needs_confirmation,
      action: c.action || c.rules?.action || 'click',
    },
    skeleton_config: c.skeleton_config || {},
    states: (c.states || []).map(s => ({...s, skeleton_config: s.skeleton_config || {}}))
  }))
})

const onNodeUpdate = (updatedNode, opts = {}) => {
  // 🔥 严重修复：拾取模式下禁止更新节点详情
  if (props.isPicker) return

  if (!graphId.value) return

  const nodeId = updatedNode.id
  if (saveTimers[nodeId]) clearTimeout(saveTimers[nodeId])

  const saveNow = async () => {
    const payload = buildNodeSavePayload(updatedNode)
    try {
      await wsApi.wsSaveNodeDetail(payload)
      triggerAutoSave()
    } catch (error) {
      ElMessage.error('保存失败')
    }
    delete saveTimers[nodeId]
  }

  if (opts.flush) {
    saveNow()
    return
  }

  saveTimers[nodeId] = setTimeout(saveNow, 1000)
}

const createNodeData = (type, position, label) => {
  const labelMap = {page: '新页面', component: '新组件', case: '新用例'}
  return {
    id: `node-${Date.now()}`,
    type, label: label || labelMap[type], position,
    data: {
      label: label || labelMap[type], type, desc: '', ...(type === 'page' ? {
        naturalSize: {w: 375, h: 667},
        interactions: []
      } : {}), ...(type === 'case' ? {workflow_id: null} : {})
    }
  }
}

// 7. 完整的节点添加系列方法
const addNode = async (type) => {
  let position = {x: 100 + Math.random() * 50, y: 100 + Math.random() * 50}
  let parentNode = null
  if (selectedElements.value.length > 0) {
    parentNode = selectedElements.value[selectedElements.value.length - 1]
    position = {x: parentNode.position.x + 250, y: parentNode.position.y}
  }
  const newNode = createNodeData(type, position)
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await wsApi.wsAddEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(position.x),
        y: parseInt(position.y)
      })
      await wsApi.wsSaveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        is_blocking: false,
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    ElMessage.error('添加失败');
    return null
  }

  if (parentNode) {
    setTimeout(() => {
      flowInstance.value?.addEdges([{
        id: `e-${parentNode.id}-${newNode.id}`,
        source: parentNode.id,
        target: newNode.id,
        type: 'smoothstep'
      }])
    }, 10)
    triggerAutoSave()
  }
  return newNode
}

const addChildNode = async () => {
  if (selectedElements.value.length === 0) return
  const parent = selectedElements.value[0]
  const newNode = createNodeData(parent.type || 'page', {x: parent.position.x + 300, y: parent.position.y})
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await wsApi.wsAddEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(newNode.position.x),
        y: parseInt(newNode.position.y)
      })
      await wsApi.wsSaveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    return
  }
  setTimeout(() => {
    flowInstance.value?.addEdges([{
      id: `e-${parent.id}-${newNode.id}`,
      source: parent.id,
      target: newNode.id,
      type: 'smoothstep'
    }])
  }, 10)
  triggerAutoSave()
}

const addParentNode = async () => {
  if (selectedElements.value.length === 0) return
  const child = selectedElements.value[0]
  const newNode = createNodeData(child.type || 'page', {x: child.position.x - 300, y: child.position.y})
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await wsApi.wsAddEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(newNode.position.x),
        y: parseInt(newNode.position.y)
      })
      await wsApi.wsSaveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    return
  }
  setTimeout(() => {
    flowInstance.value?.addEdges([{
      id: `e-${newNode.id}-${child.id}`,
      source: newNode.id,
      target: child.id,
      type: 'smoothstep'
    }])
  }, 10)
  triggerAutoSave()
}

const addSiblingNode = async () => {
  if (selectedElements.value.length === 0) return
  const current = selectedElements.value[0]
  const newNode = createNodeData(current.type || 'page', {x: current.position.x, y: current.position.y + 150})
  try {
    const gid = await ensureGraphId()
    if (gid) {
      await wsApi.wsAddEmptyNode({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        x: parseInt(newNode.position.x),
        y: parseInt(newNode.position.y)
      })
      await wsApi.wsSaveNodeDetail({
        graph_id: gid,
        node_id: newNode.id,
        type: newNode.type,
        label: newNode.label,
        desc: '',
        parentNode: null,
        naturalSize: newNode.data.naturalSize || null,
        screenshot: null,
        components: []
      })
    }
    nodes.value.push(newNode)
  } catch (error) {
    return
  }
  triggerAutoSave()
}

const removeSelected = () => {
  if (flowInstance.value) flowInstance.value.removeNodes(selectedElements.value)
  selectedElements.value = [];
  triggerAutoSave()
}

const fitView = () => flowInstance.value?.fitView()

const openSharedPanel = () => {
  showSharedPanel.value = true
  showRightPanel.value = false
}

const focusSharedNode = (nodeId) => {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node || !flowInstance.value) return
  flowInstance.value.fitView({ nodes: [nodeId], padding: 0.4, duration: 400 })
  selectedElements.value = [node]
}

const fetchCrawlDevices = async () => {
  crawlDevicesLoading.value = true
  try {
    const res = await wsApi.wsGetDeviceList()
    const list = res.data || []
    crawlDeviceOptions.value = list.filter((d) => d.status === 'online')
    if (!crawlForm.value.sn && crawlDeviceOptions.value.length === 1) {
      crawlForm.value.sn = crawlDeviceOptions.value[0].sn
    }
  } catch (e) {
    ElMessage.warning('获取设备列表失败，请确认 WebSocket 已连接')
  } finally {
    crawlDevicesLoading.value = false
  }
}

const loadCrawlPackageDefault = async () => {
  if (!currentProjectId.value || crawlForm.value.package) return
  try {
    const res = await api.getProjectEnv(currentProjectId.value)
    const env = res?.data || res || {}
    const pkg =
      env?.android?.package ||
      env?.dev?.android?.package ||
      env?.test?.android?.package ||
      ''
    if (pkg) crawlForm.value.package = pkg
  } catch {
    /* ignore */
  }
}

const openCrawlDialog = async () => {
  if (!graphId.value) {
    ElMessage.warning('请先加载应用图谱')
    return
  }
  crawlResult.value = null
  showCrawlDialog.value = true
  await fetchCrawlDevices()
  await loadCrawlPackageDefault()
}

const startCrawl = async () => {
  if (!crawlForm.value.sn?.trim()) {
    ElMessage.warning('请选择在线设备节点')
    return
  }
  const selected = crawlDeviceOptions.value.find((d) => d.sn === crawlForm.value.sn)
  if (selected && selected.status !== 'online') {
    ElMessage.warning('所选设备未在线，请先在设置 → 运行与设备确认 Scout 已连接')
    return
  }
  crawlLoading.value = true
  crawlResult.value = null
  try {
    const res = await wsApi.wsCrawlApp({
      graph_id: graphId.value,
      sn: crawlForm.value.sn.trim(),
      package: crawlForm.value.package?.trim() || undefined,
      max_pages: crawlForm.value.maxPages,
      max_sim: 0.85,
      min_sim: 0.5,
    })
    if (res.code !== 200) {
      ElMessage.error(res.msg || '跑图失败')
      return
    }
    crawlResult.value = res.data
    ElMessage.success(`跑图完成：${res.data?.pages?.length || 0} 个页面`)
    await loadGraphData()
  } catch (e) {
    ElMessage.error(e?.message || '跑图失败')
  } finally {
    crawlLoading.value = false
  }
}

const openIdentifyPageDialog = () => {
  if (!graphId.value) {
    ElMessage.warning('请先加载应用图谱')
    return
  }
  identifyPageResult.value = null
  identifyPreviewUrl.value = ''
  showIdentifyPageDialog.value = true
}

const focusIdentifiedNode = (nodeId) => {
  if (!nodeId) return
  focusSharedNode(nodeId)
  showIdentifyPageDialog.value = false
}

const onIdentifyImagePick = async (uploadFile) => {
  const file = uploadFile?.raw
  if (!file || !graphId.value) return
  identifyPageLoading.value = true
  identifyPageResult.value = null
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    identifyPreviewUrl.value = base64
    const res = await wsApi.wsIdentifyPage({
      graph_id: graphId.value,
      content: base64,
      min_score: 0.55,
      top_k: 12,
    })
    if (res.code !== 200) {
      ElMessage.error(res.msg || '识别失败')
      return
    }
    identifyPageResult.value = res.data || null
    if (res.data?.matched) {
      ElMessage.success(`识别为「${res.data.label}」(${(res.data.score * 100).toFixed(1)}%)`)
    } else if (res.data?.rankings?.length) {
      ElMessage.info('未达到置信阈值，请查看排行或重新训练骨架')
    } else {
      ElMessage.info('没有可比对的页面，请先为各页训练骨架')
    }
  } catch (e) {
    ElMessage.error(e?.message || '识别失败')
  } finally {
    identifyPageLoading.value = false
  }
}

const onSharedComponentsSaved = (payload) => {
  sharedComponents.value = payload
  try {
    const vars = JSON.parse(graphVariablesStr.value || '{}')
    vars.shared_components = payload
    graphVariablesStr.value = JSON.stringify(vars, null, 2)
  } catch (_) { /* ignore */ }
}

const handleNodeSizeUpdate = (nodeId, size) => {
  const node = nodes.value.find(n => n.id === nodeId)
  if (node) {
    // 更新内存数据
    node.data.naturalSize = size
    // 立即触发一次保存，确保后端数据里有了 naturalSize
    // 这样下次刷新页面，loadGraphData 拿到的就是正确的尺寸了
    onNodeUpdate(node)
  }
}
</script>

<style scoped>
.case-editor-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f2f3f5;
}

/* 🔥 Portal Toolbar Styles */
.editor-toolbar-portal {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
  padding: 0 10px;
  width: 100%;
  justify-content: center;
}

.portal-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.portal-group {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 16px;
  padding: 2px 4px;
}

.portal-divider {
  width: 1px;
  height: 16px;
  background: #e5e7eb;
  margin: 0 4px;
}

.portal-info {
  margin-left: 12px;
  display: flex;
  align-items: center;
}

.portal-actions {
  margin-left: auto;
}

.portal-back-btn {
  color: #606266;
}

/* 🔥 Floating Cards */
.floating-card {
  position: absolute;
  top: 80px;
  bottom: 100px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.75); /* High opacity for readability */
  backdrop-filter: blur(24px) saturate(180%); /* Strong blur */
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08); /* Soft, diffuse shadow */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.floating-card.left {
  left: 20px;
  width: 260px;
}

.floating-card.right {
  right: 20px;
  width: 320px;
}

.shared-components-card {
  width: 360px;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  backdrop-filter: none;
}

.shared-components-card :deep(.shared-panel) {
  height: 100%;
}

.panel-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0,0,0,0.03);
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
}

/* 🔥 FAB Toggles */
.fab-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 20;
  color: #666;
  transition: all 0.2s;
}
.fab-toggle:hover {
  transform: translateY(-50%) scale(1.1);
  box-shadow: 0 8px 20px rgba(0,0,0,0.15);
  color: #333;
}

.fab-toggle.left { left: 20px; }
.fab-toggle.right { right: 20px; }

.collapse-btn {
  color: #9ca3af;
  transition: color 0.2s;
}
.collapse-btn:hover { color: #4b5563; }

/* Transitions */
.slide-fade-left-enter-active, .slide-fade-left-leave-active { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.slide-fade-left-enter-from, .slide-fade-left-leave-to { transform: translateX(-50px); opacity: 0; }

.slide-fade-right-enter-active, .slide-fade-right-leave-active { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.slide-fade-right-enter-from, .slide-fade-right-leave-to { transform: translateX(50px); opacity: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 🔥 Glass Cards (SOP Items) */
.glass-card {
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 12px;
  padding: 12px 16px;
  margin: 0 12px 10px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.glass-card:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.glass-card.active {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.15);
  padding-left: 20px; /* Offset for the active strip */
}

.glass-card.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #6366f1;
}

.glass-card.system.active {
  border-color: rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 24px rgba(249, 115, 22, 0.15);
}

.glass-card.system.active::before {
  background: #f97316;
}

.sop-name { font-weight: 500; font-size: 14px; color: #1f2937; display: block; margin-bottom: 4px; }
.sop-desc { font-size: 12px; color: #9ca3af; }

/* 🔥 Segmented Control Tabs */
.glass-tabs { flex: 1; display: flex; flex-direction: column; }
:deep(.glass-tabs .el-tabs__header) { margin: 0 12px 12px 12px; border-bottom: none; }
:deep(.glass-tabs .el-tabs__nav-wrap::after) { display: none; }
:deep(.glass-tabs .el-tabs__nav) { width: 100%; display: flex; background: rgba(0,0,0,0.05); border-radius: 8px; padding: 2px; }
:deep(.glass-tabs .el-tabs__item) { flex: 1; text-align: center; height: 32px; line-height: 32px; border-radius: 6px; border: none; margin: 0; padding: 0; font-size: 13px; color: #666; transition: all 0.2s; }
:deep(.glass-tabs .el-tabs__item.is-active) { background: white; color: #1f2937; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
:deep(.glass-tabs .el-tabs__active-bar) { display: none; }
:deep(.glass-tabs .el-tabs__content) { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
:deep(.glass-tabs .el-tab-pane) { height: 100%; display: flex; flex-direction: column; }

/* Config Form Styles */
.form-wrapper { padding: 0 12px 20px 12px; }
.form-item { margin-bottom: 16px; }
.form-item .label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 6px;
}

.section-header {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: #94a3b8;
  margin: 16px 0 12px 0;
  letter-spacing: 0.05em;
}

.env-hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 12px;
  line-height: 1.5;
}

.identify-preview {
  margin-top: 12px;
  text-align: center;
  max-height: 200px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.identify-preview img {
  max-width: 100%;
  max-height: 200px;
  object-fit: contain;
}
.identify-result {
  margin-top: 12px;
}
.identify-best {
  font-size: 13px;
  color: #334155;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.identify-best.unmatched {
  color: #b45309;
}

.section-divider {
  height: 1px;
  background: rgba(0,0,0,0.06);
  margin: 20px 0;
}

.empty-text { font-size: 12px; color: #9ca3af; font-style: italic; }

.case-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 8px 0; /* Override glass-card margin */
  padding: 8px 12px;
}
.case-info { display: flex; align-items: center; gap: 6px; overflow: hidden; flex: 1; font-size: 13px; color: #334155; }
.case-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Transparent Inputs */
:deep(.glass-input .el-input__wrapper), :deep(.glass-input .el-textarea__inner) {
  background: rgba(255, 255, 255, 0.4);
  box-shadow: none;
  border: 1px solid rgba(255, 255, 255, 0.6);
}
:deep(.glass-input .el-input__wrapper:hover), :deep(.glass-input .el-textarea__inner:hover) {
  background: rgba(255, 255, 255, 0.7);
  border-color: #a5b4fc;
}
:deep(.glass-input .el-input__wrapper.is-focus), :deep(.glass-input .el-textarea__inner:focus) {
  background: white;
  box-shadow: 0 0 0 1px #6366f1;
  border-color: #6366f1;
}

/* 画布通透感 */
.flow-wrapper {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.flow-canvas {
  background: transparent !important;
}

/* SOP Visual Grouping */
.sop-group-bg {
  position: absolute;
  z-index: -1;
  border: 1px dashed #ccc;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
  pointer-events: none; /* Let clicks pass through to nodes */
  transition: all 0.3s ease;
}
.sop-group-bg.system {
  border-color: #f97316;
  background: rgba(249, 115, 22, 0.05);
  background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(249, 115, 22, 0.05) 10px, rgba(249, 115, 22, 0.05) 20px);
}
.sop-group-label {
  position: absolute; top: -24px; left: 0;
  background: inherit; color: #666; font-size: 12px; padding: 2px 8px; border-radius: 4px;
  font-weight: bold;
}
.sop-group-bg.active {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
}

/* 状态标签 */
.save-status {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 20px;
}

.save-status.saving {
  background: rgba(230, 162, 60, 0.1);
  color: #e6a23c;
}

.save-status.saved {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.save-status.unsaved {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

/* 🔥 Focus Mode Overlay */
.focus-mode-overlay {
  position: absolute;
  inset: 0;
  z-index: 100; /* Above VueFlow but below TitleBar */
  background: rgba(242, 243, 245, 0.85); /* Neutral canvas color with transparency */
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

/* VueFlow 辅助控件毛玻璃化 */
:deep(.vue-flow__controls), :deep(.vue-flow__minimap) {
  background: rgba(255, 255, 255, 0.4) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.fade-enter-active, .fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

@keyframes fadeIn {
  from { opacity: 0; } to { opacity: 1; }
}
</style>