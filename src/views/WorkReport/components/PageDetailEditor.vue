<template>
  <div class="focus-editor-root" tabindex="0" @keydown.esc="handleClose">
    <!-- 🔥 Teleport Controls to Global TitleBar -->
    <Teleport to="#titlebar-center-portal">
      <div class="focus-toolbar">
        <div class="focus-info">
          <el-tag effect="dark" type="info" size="small" class="id-badge">ID: {{
              node.id ? node.id.slice(-4) : 'NA'
            }}
          </el-tag>
          <el-input
              v-model="localData.label"
              class="focus-input-title"
              placeholder="Page Name"
              size="small"
              @input="updateNode"
          />
          <el-tag v-if="localData.is_blocking" type="danger" effect="dark" size="small">🛑 BLOCKING</el-tag>
        </div>

        <div class="focus-divider"></div>

        <!-- 🔥 新增：骨架蒙版显隐控制 -->
        <el-switch v-model="showSkeletonMask" inline-prompt active-text="Mask On" inactive-text="Mask Off" size="small"
                   title="骨架叠加仅用于预览结构，编辑热区建议关闭以免画面发花"/>
                   style="margin-right: 12px; --el-switch-on-color: #6366f1;"/>

        <div class="focus-divider"></div>

        <el-button-group>
          <el-button :icon="ZoomIn" @click="zoomIn" size="small" text title="Zoom In"/>
          <el-button :icon="ZoomOut" @click="zoomOut" size="small" text title="Zoom Out"/>
          <el-button :icon="FullScreen" @click="fitToScreen" size="small" text title="Fit Screen"/>
        </el-button-group>
        <span class="zoom-label">{{ Math.round(scale * 100) }}%</span>

        <div class="focus-divider"></div>

        <el-button type="primary" size="small" round @click="handleSave">
          <el-icon>
            <Check/>
          </el-icon>
          Done
        </el-button>
        <el-button size="small" circle @click="handleClose">
          <el-icon>
            <Close/>
          </el-icon>
        </el-button>
      </div>
    </Teleport>

    <!-- Hidden File Input (Kept in DOM for functionality) -->
    <input type="file" ref="fileInput" accept="image/*" style="display:none" @change="handleFileUpload"/>

    <el-container class="editor-layout">
      <!-- 中间画布区域 -->
      <el-main class="visual-container" ref="visualPanelRef" @wheel.prevent="handleWheel">
        <div class="canvas-wrapper"
             @dragstart.prevent
             @mousedown="handleCanvasMouseDown"
             @mousemove="handleCanvasMouseMove"
             @mouseup="handleCanvasMouseUp">

          <!-- 预览模式提示条 -->
          <div v-if="previewImage" class="preview-banner">
            <span>正在预览骨架素材</span>
            <el-button link type="primary" size="small" @click="exitPreview">退出预览</el-button>
          </div>
          <div class="transform-layer" :style="transformStyle">
            <div class="artboard" ref="imageRef" :style="imageWrapperStyle">
              <img v-if="currentDisplayScreenshot" :src="currentDisplayScreenshot" class="base-img"
                   draggable="false" @load="onImgLoad"/>
              <!-- 🔥 骨架蒙版层: 改为高亮模式，而不是遮挡模式 -->
              <img v-if="localData.skeletonMask && !previewImage && showSkeletonMask"
                   :src="getStateImageUrl(localData.skeletonMask)"
                   class="skeleton-highlight-overlay"
                   draggable="false"/>
              <div v-else-if="!currentDisplayScreenshot" class="empty-artboard">
                <el-empty description="暂无截图"/>
              </div>

              <!-- 现有热区 -->
              <div v-for="(comp, index) in localData.interactions" :key="index"
                   class="hotspot-box"
                   :class="{
                          selected: selectedCompIndices.has(index),
                          'needs-confirm': comp.needs_confirmation,
                         'is-system': comp.component_type === 'System Areas',
                         'is-container': comp.component_type === 'container',
                         'is-shared-nav': comp.component_type === 'tab_item' && !!comp.shared_region
                       }"
                   :style="{
                          left: comp.x + 'px',
                          top: comp.y + 'px',
                          width: comp.w + 'px',
                          height: comp.h + 'px'
                        }"
                   @mousedown="handleHotspotMouseDown($event, index)">
                <div class="label-tag">
                  {{ index + 1 }}
                  <span v-if="comp.needs_confirmation" title="需确认">❓</span>
                </div>
              </div>

              <!-- 正在绘制的热区 -->
              <div v-if="isDrawing && currentBox" class="drawing-box" :style="drawingBoxStyle"></div>

              <!-- 裁剪框 -->
              <div v-if="isCropping && cropBox" class="crop-box" :style="cropBoxStyle">
                <div class="crop-actions">
                  <el-button type="success" size="small" @click="confirmCrop">确认裁剪</el-button>
                  <el-button size="small" @click="cancelCrop">取消</el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部提示 -->
        <div class="canvas-tip">
          <el-tag type="info" size="small" effect="light" round>
            <el-icon style="vertical-align: middle">
              <InfoFilled/>
            </el-icon>
            按住 Command/Ctrl + 鼠标左键拖拽创建热区 | 空格 + 拖拽移动画布
          </el-tag>
        </div>
      </el-main>

      <!-- 右侧属性栏 -->
      <el-aside width="320px" class="props-sidebar">
        <div class="sidebar-header">
          <div v-if="selectedCompIndices.size > 1" class="header-row">
            <el-button link :icon="ArrowLeft" @click="clearSelection">取消选择</el-button>
            <span class="title">已选 {{ selectedCompIndices.size }} 项</span>
          </div>
          <div v-if="selectedCompIndex === -1" class="header-row">
            <!-- Moved Description Input Here -->
            <el-input
                v-model="localData.desc"
                size="small"
                placeholder="Page Description..."
                @input="updateNode"
                style="margin-right: 8px; flex: 1;"
            />
            <span class="title">页面配置</span>
            <el-tag size="small" type="info" round>{{ localData.interactions.length }}</el-tag>
          </div>
          <div v-else class="header-row">
            <el-button link :icon="ArrowLeft" @click="selectedCompIndex = -1">返回列表</el-button>
            <span class="title">组件配置</span>
          </div>
        </div>
        <el-scrollbar class="list-content">
          <!-- 🔥 多选模式 (Multi-select Mode) -->
          <div v-if="selectedCompIndices.size > 1" class="multi-select-view">
            <div class="form-group">
              <el-button type="primary" style="width: 100%" @click="mergeSelectedComponents">
                <el-icon>
                  <Connection/>
                </el-icon>
                合并热区 (Merge)
              </el-button>
            </div>
            <div class="form-group">
              <el-button type="danger" plain style="width: 100%" @click="deleteSelectedComponents">
                <el-icon>
                  <Delete/>
                </el-icon>
                批量删除
              </el-button>
            </div>
            <div class="divider-line"></div>
            <div class="selected-list-preview">
              <div v-for="idx in Array.from(selectedCompIndices).sort((a,b)=>a-b)" :key="idx" class="comp-card mini"
                   style="padding: 6px;">
                <div class="index-circle" style="width: 20px; height: 20px; font-size: 10px;">{{ idx + 1 }}</div>
                <div class="comp-label-text" style="font-size: 12px;">{{ localData.interactions[idx]?.label }}</div>
              </div>
            </div>
          </div>
          <!-- 列表模式 -->
          <div v-else-if="selectedCompIndex === -1">
            <ElTabs v-model="pageActiveTab" class="comp-tabs">
              <ElTabPane label="组件清单" name="list">
                <div v-if="!localData.interactions.length" class="comp-empty-state">
                  <p>暂无组件热区</p>
                  <span v-if="localData.screenshotPath || localData.skeletonMask">
                    以骨架蒙版白色连通域为热区；宽顶/底条按列切分。可配合 OCR 补文案
                  </span>
                  <span v-else>暂无数据</span>
                  <el-button
                    type="primary"
                    size="small"
                    :loading="detectingComponents || ocrLoading"
                    :disabled="!localData.screenshotPath && !localData.skeletonMask"
                    style="margin-top: 12px"
                    @click="syncHotspotsAfterScreenshot(false)"
                  >
                    识别热区
                  </el-button>
                </div>
                <div v-for="(comp, index) in localData.interactions" :key="index"
                     :ref="(el) => setItemRef(el, index)"
                     class="comp-card"
                     :class="{ active: selectedCompIndex === index }"
                     @click="focusComponent(index)">
                  <div class="card-left">
                    <div class="index-circle">{{ index + 1 }}</div>
                    <div class="comp-thumbnail" :style="getThumbStyle(comp)"></div>
                  </div>
                  <div class="card-body">
                    <div class="comp-label-text">{{ comp.label || '未命名组件' }}</div>
                    <div class="comp-meta-text">X:{{ comp.x }} Y:{{ comp.y }}</div>
                  </div>
                  <el-button link type="danger" class="delete-btn" :icon="Delete" @click.stop="deleteComp(index)"/>
                </div>
                <div v-if="localData.interactions.length" class="comp-list-actions">
                  <el-button
                    size="small"
                    plain
                    :loading="detectingComponents"
                    :disabled="!localData.skeletonMask"
                    @click="syncHotspotsAfterScreenshot(true)"
                  >
                    重新识别热区
                  </el-button>
                </div>
              </ElTabPane>

              <ElTabPane label="Page Config" name="config">
                <!-- 页面结构模型训练 -->
                <div class="config-section">
                  <div class="section-header">
                    <span class="title">页面结构模型</span>
                    <el-tag size="small" type="info">{{ pageTrainingSelectedUids.size }} 已选</el-tag>
                  </div>
                  <div class="helper-text">
                    上传同一页面、不同内容的多张截图，训练静态骨架。Run 执行时会用骨架识别当前页面。
                  </div>

                  <div class="skeleton-gallery">
                    <el-upload
                        action="#"
                        list-type="picture-card"
                        :auto-upload="false"
                        :on-change="handleSkeletonImgChange"
                        :file-list="skeletonFileList"
                        multiple
                        class="mini-uploader"
                    >
                      <template #default>
                        <el-icon>
                          <Plus/>
                        </el-icon>
                      </template>
                      <template #file="{ file }">
                        <div class="gallery-item" :class="{ selected: pageTrainingSelectedUids.has(file.uid) }"
                             @click.stop="togglePageSampleSelection(file)">
                          <img class="el-upload-list__item-thumbnail" :src="file.url" alt=""/>
                          <div class="selection-overlay">
                            <el-icon v-if="pageTrainingSelectedUids.has(file.uid)">
                              <Check/>
                            </el-icon>
                          </div>
                          <span class="el-upload-list__item-actions" @click.stop>
                               <span class="action-btn" @click.stop="handleViewSkeleton(file)" title="Preview">
                                 <el-icon><View/></el-icon>
                               </span>
                               <span class="action-btn delete" @click.stop="handleRemoveSkeleton(file)" title="Remove">
                                 <el-icon><Delete/></el-icon>
                               </span>
                             </span>
                        </div>
                      </template>
                    </el-upload>
                  </div>

                  <el-button type="primary" style="width: 100%; margin-top: 12px"
                             :disabled="pageTrainingSelectedUids.size < 2"
                             @click="trainSkeleton">
                    训练页面骨架
                  </el-button>
                  <div v-if="pageTrainingSelectedUids.size < 2" class="helper-text" style="margin-top: 8px">
                    至少选择 2 张截图（同页面、内容不同）才能提取静态骨架
                  </div>
                  <div class="helper-text" style="margin-top: 8px">
                    训练时自动排除顶部状态栏与底部系统导航栏，主截图默认使用第一张训练图
                  </div>
                </div>
              </ElTabPane>
            </ElTabs>
          </div>


          <!-- 详情模式 -->
          <div v-else class="detail-view">
            <div class="comp-preview-large"
                 :style="getThumbStyle(localData.interactions[selectedCompIndex], 280, 100)"></div>
            <!-- 🔥 画布底图切换 (全局) -->
            <div class="form-group" style="margin-bottom: 12px; padding: 0 2px;">
              <el-select v-model="currentCanvasSource" size="small" style="width: 100%"
                         @change="handleCanvasSourceChange" placeholder="切换画布底图">
                <template #prefix>
                  <el-icon>
                    <Picture/>
                  </el-icon>
                </template>
                <el-option label="主截图 (Main Screenshot)" value="main"/>
                <el-option v-for="(file, idx) in skeletonFileList" :key="idx" :label="file.name" :value="idx"/>
              </el-select>
            </div>

            <ElTabs v-model="activeTab" class="comp-tabs">
              <ElTabPane label="基础属性" name="props">
                <div class="form-group">
                  <div class="form-label">组件名称</div>
                  <el-input v-model="localData.interactions[selectedCompIndex].label" @input="updateNode"/>
                </div>
                <!-- 🔥 适配服务端分类与确认逻辑 -->
                <div class="form-group"
                     v-if="localData.interactions[selectedCompIndex].component_type || localData.interactions[selectedCompIndex].needs_confirmation">
                  <div class="form-label">智能分类 (AI Classification)</div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <el-tag size="small" effect="plain">
                      {{ localData.interactions[selectedCompIndex].component_type || 'Custom' }}
                    </el-tag>
                    <el-tag v-if="localData.interactions[selectedCompIndex].needs_confirmation" type="warning"
                            size="small" effect="dark">需确认
                    </el-tag>
                  </div>
                  <el-button v-if="localData.interactions[selectedCompIndex].needs_confirmation" type="warning" plain
                             size="small" style="width: 100%" @click="confirmComponent(selectedCompIndex)">
                    <el-icon>
                      <Check/>
                    </el-icon>
                    确认此区域有效
                  </el-button>
                </div>
                <!-- 🔥 1. 业务逻辑断层修复：增加业务动作定义 -->
                <div class="form-group">
                  <div class="form-label">业务动作 (SOP Action)</div>
                  <el-select v-model="localData.interactions[selectedCompIndex].action" size="small" filterable
                             allow-create default-first-option placeholder="定义业务含义" style="width: 100%"
                             @change="updateNode">
                    <el-option label="点击 (Click/Tap)" value="click"/>
                    <el-option label="输入 (Input)" value="input"/>
                    <el-option label="断言 (Assert)" value="assert"/>
                    <el-option label="导航 (Navigate)" value="navigate"/>
                    <el-option label="关闭 (Close)" value="close"/>
                  </el-select>
                </div>
                <div class="form-group">
                  <div class="form-label">坐标区域</div>
                  <div class="coord-inputs-grid">
                    <div class="coord-item"><span>X</span>
                      <el-input v-model.number="localData.interactions[selectedCompIndex].x" type="number"
                                @input="updateNode"/>
                    </div>
                    <div class="coord-item"><span>Y</span>
                      <el-input v-model.number="localData.interactions[selectedCompIndex].y" type="number"
                                @input="updateNode"/>
                    </div>
                    <div class="coord-item"><span>W</span>
                      <el-input v-model.number="localData.interactions[selectedCompIndex].w" type="number"
                                @input="updateNode"/>
                    </div>
                    <div class="coord-item"><span>H</span>
                      <el-input v-model.number="localData.interactions[selectedCompIndex].h" type="number"
                                @input="updateNode"/>
                    </div>
                  </div>
                </div>
                <div class="form-group" style="margin-top: 20px">
                  <el-button type="danger" plain style="width: 100%" @click="deleteComp(selectedCompIndex)">
                    删除此组件
                  </el-button>

                  <!-- 🔥 2.1 组件骨架训练 (新增) -->
                  <div class="form-group" style="margin-top: 20px">
                    <el-collapse>
                      <el-collapse-item title="组件骨架配置 (Skeleton)" name="1">
                        <div style="margin-bottom: 10px">
                          <el-button size="small" :icon="Picture" @click="openComponentImageSelector">
                            从页面样本选择 ({{ compSkeletonFileList.length }})
                          </el-button>
                        </div>
                        <!-- 🔥 3. 移除 el-upload，改为展示已选图片列表 -->
                        <div class="selected-samples-grid" v-if="compSkeletonFileList.length > 0">
                          <div v-for="(file, idx) in compSkeletonFileList" :key="idx" class="sample-thumb-item">
                            <img :src="file.url" class="sample-img"/>
                            <div class="sample-actions">
                              <el-icon class="remove-icon" @click="handleRemoveCompSkeletonImage(idx)">
                                <Delete/>
                              </el-icon>
                            </div>
                          </div>
                        </div>
                        <div v-else class="empty-samples-text">
                          暂未选择样本，请点击上方按钮从页面截图库中选择

                        </div>
                        <div v-if="localData.interactions[selectedCompIndex].skeleton_config?.mask_url"
                             class="skeleton-preview-mini">
                          <span class="label">已生成蒙版:</span>
                          <img
                              :src="getStateImageUrl(localData.interactions[selectedCompIndex].skeleton_config.mask_url)"
                              class="mini-mask"/>
                        </div>
                        <el-button type="primary" plain size="small" style="width: 100%; margin-top: 10px"
                                   :disabled="compSkeletonFileList.length < 1"
                                   @click="trainComponentSkeleton">
                          生成组件骨架
                        </el-button>
                      </el-collapse-item>
                    </el-collapse>
                  </div>
                </div>
              </ElTabPane>

              <ElTabPane label="Training & States" name="states">
                <div class="training-header"
                     style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <span class="title" style="font-weight: 600; font-size: 13px;">Multi-State Training</span>
                  <el-button type="primary" size="small" @click="trainComponent">Train Model</el-button>
                </div>

                <div class="states-list">
                  <div v-for="(state, sIdx) in localData.interactions[selectedCompIndex].states" :key="sIdx"
                       class="state-card"
                       :class="{ active: selectedStateIndex === sIdx }"
                       @click="selectedStateIndex = sIdx">

                    <!-- State Header -->
                    <div class="state-header">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="state-idx">#{{ sIdx + 1 }}</span>
                        <el-select v-model="state.state_type" size="small" style="width: 110px" @change="updateNode">
                          <el-option v-for="opt in stateTypeOptions" :key="opt.value" :label="opt.label"
                                     :value="opt.value"/>
                        </el-select>
                      </div>
                      <div class="state-actions">
                        <el-button link size="small" @click.stop="startCrop(selectedCompIndex, sIdx)"
                                   title="Crop new sample from canvas">
                          <el-icon>
                            <Crop/>
                          </el-icon>
                        </el-button>
                        <el-button link type="danger" :icon="Delete" @click.stop="removeState(sIdx)"/>
                      </div>
                    </div>

                    <!-- Samples Management -->
                    <div class="state-samples-area"
                         style="margin-top: 8px; background: #fff; padding: 8px; border-radius: 6px; border: 1px solid #f1f5f9;">
                      <div
                          style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; color: #64748b;">
                        <span>Training Samples</span>
                        <span style="font-weight: 600;">{{ (stateSelectedImages[sIdx] || []).length }} selected</span>
                      </div>

                      <div class="samples-thumbs-row" style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <!-- Add Button -->
                        <div class="add-sample-btn" @click.stop="openImageSelector(sIdx)"
                             style="width: 32px; height: 32px; border: 1px dashed #cbd5e1; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #6366f1;">
                          <el-icon>
                            <Plus/>
                          </el-icon>
                        </div>

                        <!-- Thumbnails (Limit 5) -->
                        <div v-for="(name, imgIdx) in (stateSelectedImages[sIdx] || []).slice(0, 5)" :key="imgIdx"
                             class="mini-thumb"
                             style="width: 32px; height: 32px; border-radius: 4px; overflow: hidden; border: 1px solid #e2e8f0;">
                          <img :src="getStateImageUrl(name)" style="width: 100%; height: 100%; object-fit: cover;"/>
                        </div>
                        <div v-if="(stateSelectedImages[sIdx] || []).length > 5"
                             style="font-size: 10px; color: #94a3b8; line-height: 32px;">
                          +{{ (stateSelectedImages[sIdx] || []).length - 5 }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <el-button class="add-state-btn" @click="addState" :icon="Plus"
                             style="width: 100%; margin-top: 10px;">Add State
                  </el-button>
                </div>
              </ElTabPane>
            </ElTabs>
          </div>
        </el-scrollbar>
      </el-aside>
    </el-container>

    <!-- 🔥 图片选择弹窗 -->
    <el-dialog v-model="showImageSelector" title="选择训练样本" width="600px" append-to-body>
      <div class="img-selector-grid">
        <div v-for="(file, idx) in selectorCandidateList" :key="idx"
             class="img-select-item"
             :class="{ selected: tempSelectedImageNames.includes(file.name) }"
             @click="toggleImageSelection(file.name)">
          <img :src="file.url" class="select-thumb"/>
          <div class="select-overlay">
            <el-icon v-if="tempSelectedImageNames.includes(file.name)">
              <Check/>
            </el-icon>
          </div>
          <div class="img-name">{{ file.name }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showImageSelector = false">取消</el-button>
        <el-button type="primary" @click="confirmImageSelection">确定 ({{
            tempSelectedImageNames.length
          }})
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {ref, reactive, computed, onMounted, onUnmounted, nextTick, onBeforeUpdate, watch} from 'vue'
import {
  ElMessage,
  ElContainer,
  ElHeader,
  ElMain,
  ElAside,
  ElButton,
  ElButtonGroup,
  ElInput,
  ElTag,
  ElIcon,
  ElEmpty,
  ElScrollbar,
  ElTabs,
  ElTabPane,
  ElUpload,
  ElSelect,
  ElOption,
  ElSwitch,
  ElCollapse,
  ElCollapseItem,
  ElCheckbox,
  ElDialog,
  ElInputNumber
} from 'element-plus'
import {
  ZoomIn,
  ZoomOut,
  FullScreen,
  Check,
  Close,
  Delete,
  Document,
  InfoFilled,
  ArrowLeft,
  Plus,
  Upload,
  View,
  Picture,
  Connection,
  Crop,
} from '@element-plus/icons-vue'
import * as api from '@/api/appGraph'
import { ocrRecognition } from '@/api/workReport'
import {wsUploadFile, wsGetFile} from '@/api/mWebSocket'
import {wsTrainSkeleton, wsDetectPageComponents} from '@/api/wsAppGraph'

const props = defineProps({node: Object, graphId: [String, Number], sharedComponents: { type: Array, default: () => [] }})
const emit = defineEmits(['close', 'update'])

const localData = reactive({
  label: '',
  desc: '',
  screenshot: '',
  screenshotPath: '',
  interactions: [],
  naturalW: 0,
  naturalH: 0,
  skeletonMask: '',
  is_blocking: false,
  skeletonImages: [],
})
const detectingComponents = ref(false)
const pageTrainingSelectedUids = ref(new Set())
const ocrLoading = ref(false)
const selectedCompIndex = ref(-1)
const selectedCompIndices = ref(new Set()) // 🔥 多选集合
const activeTab = ref('props')
const pageActiveTab = ref('list')
const uploadContext = ref(null)
const skeletonFileList = ref([])
const showSkeletonMask = ref(false)
const currentCanvasSource = ref('main')
const compSkeletonFileList = ref([])
const selectedStateIndex = ref(-1) // 🔥 2. 追踪当前选中的状态索引
const stateSelectedImages = ref({}) // Map: stateIndex -> [imageName1, imageName2...]
const showImageSelector = ref(false)
const currentSelectorStateIndex = ref(-1)
const tempSelectedImageNames = ref([])
const selectorCandidateList = ref([])
const selectorMode = ref('state') // 'state' | 'component'

// 过滤过大/过时的热区（旧版「内容区块」或 OCR 整行条）
const isOversizedHotspot = (comp, imgW, imgH) => {
  if (!imgW || !imgH) return false
  const w = Number(comp.w) || 0
  const h = Number(comp.h) || 0
  const x = Number(comp.x) || 0
  const y = Number(comp.y) || 0
  const ct = comp.component_type || ''
  if (ct === 'tab_item') {
    // 仅去掉几乎占满屏宽的整条导航（细分 Tab 宽度通常 < 屏宽 40%）
    if (h > imgH * 0.11 || w > imgW * 0.92) return true
    if (h < 18 || w < 20) return true
    const cy = y + h / 2
    if (comp.shared_region === 'bottom_tab' && (y < imgH * 0.91 || cy > imgH * 0.99)) return true
    if (comp.shared_region === 'top_header' && (y > imgH * 0.13 || y + h < imgH * 0.055)) return true
    return false
  }
  if (ct === 'container') return true
  if (ct === 'repeat_card') {
    // 骨架内容白块允许较宽；仅去掉几乎整屏的块
    return w >= imgW * 0.94 && h >= imgH * 0.42
  }
  if (!imgW || !imgH) return false
  if (w >= imgW * 0.58 && h >= imgH * 0.06) return true
  if (w * h >= imgW * imgH * 0.09) return true
  return false
}

const filterDisplayInteractions = (list, imgW, imgH, nodeId) => {
  if (!imgW || !imgH) return [...(list || [])]
  const allowedRegions = new Set()
  for (const sc of props.sharedComponents || []) {
    if ((sc.members || []).some(m => m.node_id === nodeId) && sc.region) {
      allowedRegions.add(sc.region)
    }
  }
  return (list || []).filter((c) => {
    if (isOversizedHotspot(c, imgW, imgH)) return false
    // 仅隐藏图谱登记的共用组件；本页骨架识别的 Tab/卡片始终展示
    if (c.shared_component_uid) {
      return allowedRegions.has(c.shared_region)
    }
    return true
  })
}

const sanitizeComponent = (comp) => {
  const base = {
    id: comp.id || comp.uid || `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    label: comp.label || '未命名',
    x: Math.round(Number(comp.x) || 0),
    y: Math.round(Number(comp.y) || 0),
    w: Math.round(Number(comp.w) || 0),
    h: Math.round(Number(comp.h) || 0),
    skeleton_config: comp.skeleton_config || {},
    action: comp.action || 'click',
    component_type: comp.component_type || 'custom',
    needs_confirmation: comp.needs_confirmation || false,
    is_shared_navigation: !!comp.is_shared_navigation,
    shared_region: comp.shared_region || ''
  }
  // Deep sanitize states
  base.states = (Array.isArray(comp.states) ? comp.states : []).map(s => ({
    ...s,
    skeleton_config: s.skeleton_config || {},
    x: s.x !== undefined ? s.x : base.x,
    y: s.y !== undefined ? s.y : base.y,
    w: s.w !== undefined ? s.w : base.w,
    h: s.h !== undefined ? s.h : base.h
  }))
  return base
}

// 🔥 新增：骨架蒙版高亮样式
const skeletonMaskStyle = computed(() => {
  const maskUrl = getStateImageUrl(localData.skeletonMask);
  if (maskUrl) {
    return {
      'mask-image': `url(${maskUrl})`,
      '-webkit-mask-image': `url(${maskUrl})`,
      'mask-size': '100% 100%',
      '-webkit-mask-size': '100% 100%',
      'mask-mode': 'luminance',
      '-webkit-mask-mode': 'luminance',
    };
  }
  return {};
});
// 🔥 2. 数据模型混乱修复：统一后端路径解析工具
const resolveBackendPath = (data) => {
  if (!data) return ''
  if (typeof data === 'string') return data
  // 优先取 path (绝对路径), 其次 url, 最后 filename
  return data.path || data.url || data.filename || ''
}


// 🔥 预览相关
const previewImage = ref('') // 当前临时预览的图片 URL
const currentDisplayScreenshot = computed(() => previewImage.value || localData.screenshot)

// 🔥 Image Lifecycle Management
const activeBlobUrls = new Set()
const screenshotCache = ref({}) // path -> url

const registerBlobUrl = (url) => {
  if (url && url.startsWith('blob:')) {
    activeBlobUrls.add(url)
  }
  return url
}

// Helper: Process raw file data into a usable URL (Blob or Base64)
const processFileDataToUrl = (data, fileName = '') => {
  if (!data) return ''

  // 1. Blob / ArrayBuffer -> Blob URL
  if (data instanceof Blob) return registerBlobUrl(URL.createObjectURL(data))
  if (data instanceof ArrayBuffer) return registerBlobUrl(URL.createObjectURL(new Blob([data])))
  if (data.type === 'Buffer' && Array.isArray(data.data)) {
    return registerBlobUrl(URL.createObjectURL(new Blob([new Uint8Array(data.data)])))
  }

  // 2. Complex Object { content, name } -> Base64
  if (data.content && typeof data.content === 'string') {
    let rawStr = data.content
    if (!rawStr.startsWith('data:')) {
      let mime = 'image/png'
      if (fileName && (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg'))) mime = 'image/jpeg'
      else if (data.name && (data.name.endsWith('.jpg') || data.name.endsWith('.jpeg'))) mime = 'image/jpeg'
      rawStr = `data:${mime};base64,${rawStr}`
    }
    return rawStr
  }

  // 3. String -> Base64
  if (typeof data === 'string') {
    return data.startsWith('data:') ? data : `data:image/png;base64,${data}`
  }
  return ''
}

// 🔥 Unified File Getter (Checks Cache -> Fetches -> Caches)
const getFileUrl = async (path) => {
  if (!path) return ''
  if (path.startsWith('data:') || path.startsWith('http')) return path
  if (screenshotCache.value[path]) return screenshotCache.value[path]

  try {
    const res = await wsGetFile(path)
    if (res.code === 200 && res.data) {
      const url = processFileDataToUrl(res.data, path)
      if (url) {
        screenshotCache.value[path] = url
        return url
      }
    }
  } catch (e) {
    console.error('Get file url failed', path, e)
  }
  return ''
}

const stateTypeOptions = [
  {label: 'Hover', value: 'hover'},
  {label: 'Pressed', value: 'pressed'},
  {label: 'Disabled', value: 'disabled'},
  {label: 'Checked', value: 'checked'},
  {label: 'Focused', value: 'focused'},
  {label: 'Custom', value: 'custom'}
]

const loadOneScreenshot = async (path, retryCount = 0) => {
  if (!path) return
  if (screenshotCache.value[path]) return

  if (path.startsWith('data:') || path.startsWith('http')) {
    screenshotCache.value[path] = path
    return
  }

  const maxRetries = 3

  try {
    const res = await wsGetFile(path)
    console.log('Load screenshot result:', path, res)
    if (res.code === 200) {
      const data = res.data
      const url = processFileDataToUrl(data, path)
      if (url) screenshotCache.value[path] = url

    } else if (retryCount < maxRetries) {
      // 🔥 失败重试逻辑
      console.log(`Load failed, retrying (${retryCount + 1}/${maxRetries})...`)
      setTimeout(() => loadOneScreenshot(path, retryCount + 1), 1000 * Math.pow(2, retryCount))
    }
  } catch (e) {
    // console.error('Failed to load screenshot in CustomNode', e)
  }
}


const fileInput = ref(null);
const imageRef = ref(null);
const visualPanelRef = ref(null)
const scale = ref(0.5)
const translate = ref({x: 40, y: 40})
const isPanning = ref(false);
const panStart = ref({x: 0, y: 0})
const isDrawing = ref(false);
const drawStart = ref({x: 0, y: 0});
const currentBox = ref(null)
const isCropping = ref(false);
const cropBox = ref(null);
const cropTargetState = ref(null)

// 列表滚动相关
const itemRefs = ref([])
const setItemRef = (el, index) => {
  if (el) itemRefs.value[index] = el
}
onBeforeUpdate(() => {
  itemRefs.value = []
})

const transformStyle = computed(() => ({
  transform: `translate(${translate.value.x}px, ${translate.value.y}px) scale(${scale.value})`
}))

const imageWrapperStyle = computed(() => ({
  width: (localData.naturalW || 1280) + 'px',
  height: (localData.naturalH || 800) + 'px',
  backgroundColor: '#fff',
  boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
  position: 'relative'
}))

const drawingBoxStyle = computed(() => currentBox.value ? {
  left: currentBox.value.x + 'px',
  top: currentBox.value.y + 'px',
  width: currentBox.value.w + 'px',
  height: currentBox.value.h + 'px'
} : {})

const cropBoxStyle = computed(() => cropBox.value ? {
  left: cropBox.value.x + 'px',
  top: cropBox.value.y + 'px',
  width: cropBox.value.w + 'px',
  height: cropBox.value.h + 'px'
} : {})

const triggerStateUpload = (cIndex, sIndex) => {
  uploadContext.value = {type: 'state', compIndex: cIndex, stateIndex: sIndex}
  fileInput.value.value = ''
  fileInput.value.click()
}

const handleFileUpload = async (e) => {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (evt) => {
    const base64 = evt.target.result
    ocrLoading.value = true
    try {
      // 1. Upload via WebSocket
      const res = await wsUploadFile(file.name, base64)
      if (res.code === 200) {
        // 🔥 使用统一解析器，防止 [object Object]
        const path = resolveBackendPath(res.data)

        if (uploadContext.value?.type === 'state') {
          const {compIndex, stateIndex} = uploadContext.value
          localData.interactions[compIndex].states[stateIndex].image_url = path
          if (path && base64) screenshotCache.value[path] = base64
          updateNode()
        }
      } else {
        ElMessage.error(res.msg || '上传失败')
        ocrLoading.value = false
      }
    } catch (e) {
      console.error(e)
      ElMessage.error('上传出错')
      ocrLoading.value = false
    }
    uploadContext.value = null
  }
  reader.readAsDataURL(file)
}

const performOCR = async (imageUrl, replace = false) => {
  if (!imageUrl) return 0
  ocrLoading.value = true
  try {
    const results = await ocrRecognition(imageUrl)
    const ocrItems = results?.data?.ocr_result || []
    if (!ocrItems.length) return 0

    if (replace) {
      localData.interactions = []
    } else if (!localData.interactions) {
      localData.interactions = []
    }

    ocrItems.forEach(item => {
      const box = item.coordinates?.box
      if (!box?.length) return
      const xs = box.map(p => p[0])
      const ys = box.map(p => p[1])
      const x = Math.round(Math.min(...xs))
      const y = Math.round(Math.min(...ys))
      const w = Math.round(Math.max(...xs) - x)
      const h = Math.round(Math.max(...ys) - y)
      if (w <= 0 || h <= 0) return
      const nw = localData.naturalW || 1280
      const nh = localData.naturalH || 800
      if (w >= nw * 0.55 || h >= nh * 0.18 || w * h >= nw * nh * 0.08) return
      // 顶/底导航带内的 OCR 文字不单独加热区（与骨架 Tab 重复、易误检图标区）
      if (y < nh * 0.13 || y + h > nh * 0.90) return

      localData.interactions.push({
        x, y, w, h,
        label: item.text || '文本热区',
        category: 'action',
        component_type: 'text',
        action: 'click',
        states: [],
      })
    })
    updateNode()
    return localData.interactions.length
  } catch (e) {
    console.error(e)
    ElMessage.error('OCR 识别失败')
    return 0
  } finally {
    ocrLoading.value = false
  }
}

const generateHotspotsFromScreenshot = async (replace = true, silent = false) => {
  const path = localData.screenshotPath
  if (!path) return 0

  const prevCount = localData.interactions.length
  const count = await performOCR(path, replace)
  const added = replace ? count : count - prevCount
  if (added > 0 && !silent) {
    ElMessage.success(`OCR 识别成功，添加了 ${added} 个热区`)
  }
  return count
}

const handleSave = async () => {
  updateNode()
  emit('update', props.node, { flush: true })
  emit('close')
}

const handleClose = () => {
  updateNode()
  emit('update', props.node, { flush: true })
  emit('close')
}

const onImgLoad = (e) => {
  localData.naturalW = e.target.naturalWidth
  localData.naturalH = e.target.naturalHeight

  // 图片真实尺寸与库内不一致时，按比例修正热区坐标
  const stored = props.node.data?.naturalSize
  if (stored?.w > 0 && stored?.h > 0
      && (stored.w !== localData.naturalW || stored.h !== localData.naturalH)
      && localData.interactions.length > 0) {
    const sx = localData.naturalW / stored.w
    const sy = localData.naturalH / stored.h
    localData.interactions.forEach((c) => {
      c.x = Math.round(c.x * sx)
      c.y = Math.round(c.y * sy)
      c.w = Math.round(c.w * sx)
      c.h = Math.round(c.h * sy)
    })
  }

  nextTick(() => {
    fitToScreen()
  })

  if (stored?.w > 0 && stored?.h > 0
      && (stored.w !== localData.naturalW || stored.h !== localData.naturalH)) {
    updateNode()
  }
}

const updateNode = () => {
  // 同步回父组件
  props.node.label = localData.label
  props.node.desc = localData.desc
  if (props.node.data) props.node.data.desc = localData.desc
  if (props.node.data) props.node.data.is_blocking = localData.is_blocking
  props.node.data.screenshot = localData.screenshotPath || localData.screenshot
  props.node.data.interactions = localData.interactions
  props.node.data.naturalSize = {w: localData.naturalW, h: localData.naturalH}

  if (!props.node.data.skeleton_config) props.node.data.skeleton_config = {}
  // 🔥 优先存储 filename，同时兼容 mask_url
  props.node.data.skeleton_config.filename = localData.skeletonMask
  props.node.data.skeleton_config.mask_url = localData.skeletonMask
  props.node.data.skeleton_config.images = localData.skeletonImages // 🔥 保存图片列表
  emit('update', props.node)
}

// 画布交互逻辑
const handleWheel = (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const zoomFactor = 0.1
    const direction = e.deltaY < 0 ? 1 : -1
    const newScale = Math.max(0.1, Math.min(5, scale.value + direction * zoomFactor))

    // 计算鼠标相对于容器的位置，实现以鼠标为中心的缩放
    const rect = visualPanelRef.value.$el.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const tx = translate.value.x
    const ty = translate.value.y

    const newTx = mouseX - (mouseX - tx) * (newScale / scale.value)
    const newTy = mouseY - (mouseY - ty) * (newScale / scale.value)

    scale.value = newScale
    translate.value = {x: newTx, y: newTy}
  } else {
    translate.value.x -= e.deltaX;
    translate.value.y -= e.deltaY
  }
}

const getRelativePos = (e) => {
  const rect = imageRef.value.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / scale.value,
    y: (e.clientY - rect.top) / scale.value
  }
}

const getThumbStyle = (comp, boxW = 48, boxH = 32) => {
  if (!localData.screenshot || !localData.naturalW || !comp.w || !comp.h) {
    return {display: 'none'}
  }
  const scale = Math.min(boxW / comp.w, boxH / comp.h)

  const bgW = localData.naturalW * scale
  const bgH = localData.naturalH * scale
  const bgX = -comp.x * scale + (boxW - comp.w * scale) / 2
  const bgY = -comp.y * scale + (boxH - comp.h * scale) / 2

  return {
    backgroundImage: `url(${localData.screenshot})`,
    backgroundSize: `${bgW}px ${bgH}px`,
    backgroundPosition: `${bgX}px ${bgY}px`,
    width: `${boxW}px`,
    height: `${boxH}px`
  }
}

// 获取状态图片的 URL (优先从缓存取，支持 base64 预览)
const getStateImageUrl = (path) => {
  if (!path) return ''
  // 🔥 修复：如果缓存里没有，绝对不要返回原始 path，否则浏览器会去请求 localhost/static/...
  // 除非 path 本身就是 data: 或 http 开头
  return screenshotCache.value[path] || (path.startsWith('data:') || path.startsWith('http') ? path : '')
}

const selectComp = (index) => {
  selectedCompIndex.value = index
  // 🔥 修复：重新赋值 Set 以触发 Vue 响应式更新，确保多选 UI (合并按钮) 能正确显示
  selectedCompIndices.value = new Set(index !== -1 ? [index] : [])
  nextTick(() => {
    const el = itemRefs.value[index]
    if (el) {
      // 🔥 修复：将 'center' 改为 'nearest'
      // nearest 会自动判断方向，且只滚动最近的滚动父级（即 el-scrollbar）
      // 注意：在详情模式下列表被隐藏，这里可能需要判断视图状态，但保持逻辑无害
      el.scrollIntoView({behavior: 'smooth', block: 'nearest'})
    }
  })
}

const handleHotspotMouseDown = (e, index) => {
  // 如果按住 Command/Ctrl (绘制) 或 Space (平移)，则不阻止冒泡，允许触发画布的逻辑
  if (e.metaKey || e.ctrlKey || e.code === 'Space') {
    e.preventDefault()
    return
  }

  e.stopPropagation()
  // 🔥 支持 Shift 多选
  if (e.shiftKey) {
    // 🔥 修复：克隆 Set 进行操作，然后重新赋值以触发响应式
    const newSet = new Set(selectedCompIndices.value)
    if (newSet.has(index)) {
      newSet.delete(index)
      // 如果取消的是当前主选，尝试转移主选
      if (selectedCompIndex.value === index) {
        const next = Array.from(newSet).pop()
        selectedCompIndex.value = next !== undefined ? next : -1
      }
    } else {
      newSet.add(index)
      selectedCompIndex.value = index
    }
    selectedCompIndices.value = newSet
  } else {
    selectComp(index)
  }
}

const focusComponent = (index) => {
  selectedCompIndex.value = index
  const comp = localData.interactions[index]
  if (!comp || !visualPanelRef.value || !localData.naturalW) return

  // 聚焦时稍微放大一点
  const targetScale = Math.max(scale.value, 0.8)
  scale.value = targetScale

  const viewW = visualPanelRef.value.$el.clientWidth
  const viewH = visualPanelRef.value.$el.clientHeight

  const cx = comp.x + comp.w / 2
  const cy = comp.y + comp.h / 2

  translate.value = {
    x: viewW / 2 - cx * targetScale,
    y: viewH / 2 - cy * targetScale
  }
}

const startPan = (e) => {
  isPanning.value = true;
  panStart.value = {x: e.clientX - translate.value.x, y: e.clientY - translate.value.y}
}

const handleCanvasMouseDown = (e) => {
  const isSpacePan = e.code === 'Space'
  const isMiddlePan = e.button === 1
  const isLeftPan = e.button === 0 && !e.metaKey && !e.ctrlKey

  if (isSpacePan || isMiddlePan || isLeftPan) {
    e.preventDefault()
    if (isLeftPan) clearSelection()
    startPan(e)
    return
  }

  if (isCropping.value && e.button === 0) {
    e.preventDefault()
    isDrawing.value = true // 复用 isDrawing 状态来追踪鼠标移动
    drawStart.value = getRelativePos(e)
    cropBox.value = {...drawStart.value, w: 0, h: 0}
    return
  }

  // 2. 绘制逻辑：Command/Ctrl + 左键
  if (e.button === 0 && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    isDrawing.value = true;
    selectedCompIndex.value = -1;
    selectedCompIndices.value.clear();
    drawStart.value = getRelativePos(e);
    currentBox.value = {...drawStart.value, w: 0, h: 0}
  }
}

const handleCanvasMouseMove = (e) => {
  if (isPanning.value) {
    translate.value.x = e.clientX - panStart.value.x;
    translate.value.y = e.clientY - panStart.value.y;
    return
  }

  if (!isDrawing.value) return;

  const pos = getRelativePos(e);
  const w = pos.x - drawStart.value.x;
  const h = pos.y - drawStart.value.y;

  if (isCropping.value) {
    cropBox.value = {
      x: Math.round(w > 0 ? drawStart.value.x : pos.x),
      y: Math.round(h > 0 ? drawStart.value.y : pos.y),
      w: Math.round(Math.abs(w)),
      h: Math.round(Math.abs(h))
    }
    return
  }

  currentBox.value = {
    x: Math.round(w > 0 ? drawStart.value.x : pos.x),
    y: Math.round(h > 0 ? drawStart.value.y : pos.y),
    w: Math.round(Math.abs(w)),
    h: Math.round(Math.abs(h))
  }
}

const handleCanvasMouseUp = () => {
  isPanning.value = false;
  isDrawing.value = false;
  if (isCropping.value) {
    // 裁剪模式下，松开鼠标只停止绘制，等待用户确认
    return
  }

  if (currentBox.value && currentBox.value.w > 5 && currentBox.value.h > 5) {
    if (!localData.interactions) localData.interactions = []
    localData.interactions.push({label: 'New Area', ...currentBox.value});
    selectedCompIndex.value = localData.interactions.length - 1
    updateNode()
    selectComp(selectedCompIndex.value) // 统一使用 selectComp 更新多选状态
    updateNode()
  }
  currentBox.value = null
}

const setMainScreenshotFromFilename = async (filename) => {
  if (!filename) return
  localData.screenshotPath = filename
  const url = await getFileUrl(filename)
  if (url) {
    localData.screenshot = url
    screenshotCache.value[filename] = url
  }
  previewImage.value = ''
}

const deleteComp = (i) => {
  localData.interactions.splice(i, 1);
  clearSelection()
  updateNode()
}

 const clearSelection = () => {
   selectedCompIndex.value = -1
   selectedCompIndices.value = new Set()
 }

const confirmComponent = (index) => {
  if (localData.interactions[index]) {
    localData.interactions[index].needs_confirmation = false
    updateNode()
  }
}
// 🔥 合并选中的热区
 const mergeSelectedComponents = () => {
   const indices = Array.from(selectedCompIndices.value).sort((a, b) => a - b)
   if (indices.length < 2) return

   const comps = indices.map(i => localData.interactions[i])

   let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
   comps.forEach(c => {
     if (c.x < minX) minX = c.x
     if (c.y < minY) minY = c.y
     if (c.x + c.w > maxX) maxX = c.x + c.w
     if (c.y + c.h > maxY) maxY = c.y + c.h
   })

   const newComp = {
     ...JSON.parse(JSON.stringify(comps[0])), // 继承第一个组件的属性
     id: `gen-${Date.now()}`,
     label: 'Merged Area',
     x: minX,
     y: minY,
     w: maxX - minX,
     h: maxY - minY,
     states: [], // 重置状态
     component_type: 'custom',
     needs_confirmation: false
   }
// 从后往前删除，避免索引偏移
   for (let i = indices.length - 1; i >= 0; i--) {
     localData.interactions.splice(indices[i], 1)
   }

   localData.interactions.push(newComp)
   selectComp(localData.interactions.length - 1)
   updateNode()
   ElMessage.success('热区合并成功')
 }

 const deleteSelectedComponents = () => {
   const indices = Array.from(selectedCompIndices.value).sort((a, b) => a - b)
   for (let i = indices.length - 1; i >= 0; i--) {
     localData.interactions.splice(indices[i], 1)
   }
   clearSelection()
   updateNode()
 }


const addState = () => {
  const comp = localData.interactions[selectedCompIndex.value]
  if (!comp.states) comp.states = []
  comp.states.push({
    state_type: 'custom',
    image_url: '',
    attributes: '{}',
    skeleton_config: {},
    description: '',
    x: comp.x,
    y: comp.y,
    w: comp.w,
    h: comp.h
  })
  updateNode()
}

const removeState = (sIndex) => {
  const comp = localData.interactions[selectedCompIndex.value]
  comp.states.splice(sIndex, 1)
  updateNode()
}

// --- 裁剪逻辑 ---
const startCrop = (cIndex, sIndex) => {
  isCropping.value = true
  cropTargetState.value = {cIndex, sIndex}
  // 默认选中当前组件区域
  const comp = localData.interactions[cIndex]
  const state = comp.states[sIndex]
  if (state.w && state.h) {
    cropBox.value = {x: state.x, y: state.y, w: state.w, h: state.h}
  } else {
    cropBox.value = {x: comp.x, y: comp.y, w: comp.w, h: comp.h}
  }
  ElMessage.info('请在画布上调整裁剪区域，然后点击确认')
}

const cancelCrop = () => {
  isCropping.value = false
  cropBox.value = null
  cropTargetState.value = null
}

const confirmCrop = () => {
  if (!cropBox.value || !currentDisplayScreenshot.value) return

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const img = new Image()
  img.crossOrigin = "Anonymous"
  img.src = currentDisplayScreenshot.value
  img.onload = async () => {
    canvas.width = cropBox.value.w
    canvas.height = cropBox.value.h
    ctx.drawImage(img, cropBox.value.x, cropBox.value.y, cropBox.value.w, cropBox.value.h, 0, 0, cropBox.value.w, cropBox.value.h)

    const base64 = canvas.toDataURL('image/png')
    // 上传裁剪后的图片
    try {
      const res = await wsUploadFile(`crop_${Date.now()}.png`, base64)
      if (res.code === 200) {
        const path = (res.data && typeof res.data === 'object' && res.data.path) ? res.data.path : res.data
        const {cIndex, sIndex} = cropTargetState.value
        localData.interactions[cIndex].states[sIndex].image_url = path
        // 🔥 更新状态坐标为裁剪框坐标
        localData.interactions[cIndex].states[sIndex].x = cropBox.value.x
        localData.interactions[cIndex].states[sIndex].y = cropBox.value.y
        localData.interactions[cIndex].states[sIndex].w = cropBox.value.w
        localData.interactions[cIndex].states[sIndex].h = cropBox.value.h

        screenshotCache.value[path] = base64
        updateNode()
        ElMessage.success('裁剪并上传成功')
      }
    } catch (e) {
      ElMessage.error('上传裁剪图失败')
    }

    cancelCrop()
  }
}

// --- 组件识别 ---
/** 检测坐标常为骨架原图像素；若与画布 naturalSize 不一致则按比例缩放到画布 */
const scaleDetectedToCanvas = (mapped) => {
  const nw = localData.naturalW
  const nh = localData.naturalH
  if (!nw || !nh || !mapped?.length) return mapped

  const maxR = Math.max(...mapped.map((c) => c.x + c.w))
  const maxB = Math.max(...mapped.map((c) => c.y + c.h))
  if (maxR <= nw * 1.08 && maxB <= nh * 1.08) return mapped
  if (maxR < nw * 0.55 && maxB < nh * 0.55) return mapped

  const sx = nw / maxR
  const sy = nh / maxB
  const uniform = Math.abs(sx - sy) < 0.12 ? (sx + sy) / 2 : null
  const fx = uniform ?? sx
  const fy = uniform ?? sy
  return mapped.map((c) => ({
    ...c,
    x: Math.round(c.x * fx),
    y: Math.round(c.y * fy),
    w: Math.max(8, Math.round(c.w * fx)),
    h: Math.max(8, Math.round(c.h * fy)),
  }))
}

const mapDetectedComponents = (list) => {
  return (list || []).map((c, i) => ({
    id: c.uid || c.id || `gen-${Date.now()}-${i}`,
    uid: c.uid || c.id || `gen-${Date.now()}-${i}`,
    x: Math.round(c.x),
    y: Math.round(c.y),
    w: Math.round(c.w || c.width),
    h: Math.round(c.h || c.height),
    label: c.label || c.type || `组件 ${i + 1}`,
    category: c.category || 'action',
    component_type: c.component_type || c.type || 'custom',
    needs_confirmation: c.needs_confirmation !== false,
    is_shared_navigation: !!c.is_shared_navigation,
    shared_region: c.shared_region || '',
    action: 'click',
    states: [],
    skeleton_config: c.skeleton_config || {}
  }))
}

const boxIoU = (a, b) => {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  if (x2 <= x1 || y2 <= y1) return 0
  const inter = (x2 - x1) * (y2 - y1)
  const union = a.w * a.h + b.w * b.h - inter
  return inter / Math.max(union, 1)
}

const applyDetectedComponents = (list, replace = true) => {
  let mapped = scaleDetectedToCanvas(mapDetectedComponents(list))
  if (!mapped.length) return 0

  if (replace || !localData.interactions.length) {
    localData.interactions = mapped
  } else {
    mapped.forEach((c) => {
      const dup = localData.interactions.some((ex) => boxIoU(ex, c) >= 0.35)
      if (!dup) localData.interactions.push(c)
    })
  }
  clearSelection()
  localData.interactions = filterDisplayInteractions(
    localData.interactions,
    localData.naturalW,
    localData.naturalH,
    props.node?.id
  )
  updateNode()
  return localData.interactions.length
}

const detectComponentsFromSkeletonCore = async (replace = false, silent = false) => {
  const res = await wsDetectPageComponents({
    graph_id: props.graphId,
    node_id: props.node.id
  })
  if (res.code !== 200) {
    if (!silent) ElMessage.error(res.msg || '组件识别失败')
    return 0
  }
  const list = res.data?.detected_components || res.data?.hotspots || []
  const count = applyDetectedComponents(list, replace)
  if (!silent) {
    if (count > 0) {
      ElMessage.success(`识别出 ${count} 个可能组件，请确认后保存`)
    } else {
      ElMessage.info('未识别到明显组件区域，可手动框选热区')
    }
  }
  return count
}

const syncHotspotsAfterScreenshot = async (replace = true, silent = false) => {
  detectingComponents.value = true
  try {
    if (replace) {
      localData.interactions = []
    }

    const ocrBefore = localData.interactions.length
    if (localData.screenshotPath) {
      await performOCR(localData.screenshotPath, false)
    }
    const ocrAdded = localData.interactions.length - ocrBefore

    let visionAdded = 0
    if (localData.skeletonMask || localData.screenshotPath) {
      const beforeVision = localData.interactions.length
      await detectComponentsFromSkeletonCore(false, true)
      visionAdded = localData.interactions.length - beforeVision
    }

    const total = localData.interactions.length
    if (total > 0 && !silent) {
      const parts = []
      if (ocrAdded > 0) parts.push(`OCR ${ocrAdded} 个`)
      if (visionAdded > 0) parts.push(`结构/重复 ${visionAdded} 个`)
      ElMessage.success(
        parts.length
          ? `识别出 ${total} 个热区（${parts.join('，')}）`
          : `识别出 ${total} 个热区，请确认后保存`
      )
    }
    return total
  } finally {
    detectingComponents.value = false
  }
}

const detectComponentsFromSkeleton = async (replace = false) => {
  if (!localData.skeletonMask && !localData.screenshotPath) {
    ElMessage.warning('请先训练页面骨架或准备主截图')
    return
  }
  await syncHotspotsAfterScreenshot(replace, false)
}

// --- 骨架训练逻辑 ---
const togglePageSampleSelection = (file) => {
  if (pageTrainingSelectedUids.value.has(file.uid)) {
    pageTrainingSelectedUids.value.delete(file.uid)
  } else {
    pageTrainingSelectedUids.value.add(file.uid)
  }
}

const handleSkeletonImgChange = (uploadFile, uploadFiles) => {
  skeletonFileList.value = uploadFiles
  if (uploadFile.status === 'ready') {
    pageTrainingSelectedUids.value.add(uploadFile.uid)
  }
}

const handleRemoveSkeleton = (file) => {
  const idx = skeletonFileList.value.indexOf(file)
  if (idx > -1) skeletonFileList.value.splice(idx, 1)
  pageTrainingSelectedUids.value.delete(file.uid)
}

// 🔥 预览骨架图片（不改变节点数据，仅改变画布显示）
const handleViewSkeleton = async (file) => {
  if (!file.url) {
    file.url = await getFileUrl(file.name)
  }
  previewImage.value = file.url
  // 切换到预览图时，自动适应屏幕
  nextTick(() => fitToScreen())
}

const exitPreview = () => {
  previewImage.value = ''
  nextTick(() => fitToScreen())
}

// 切换画布底图
const handleCanvasSourceChange = async (val) => {
  if (val === 'main') {
    previewImage.value = ''
  } else {
    const file = skeletonFileList.value[val]
    if (file) {
      if (!file.url) {
        file.url = await getFileUrl(file.name)
      }
      previewImage.value = file.url
    }
  }
  nextTick(() => fitToScreen())
}

// 监听 previewImage 变化同步下拉框状态
watch(previewImage, (newVal) => {
  if (!newVal) {
    currentCanvasSource.value = 'main'
  } else {
    const idx = skeletonFileList.value.findIndex(f => f.url === newVal)
    if (idx !== -1) currentCanvasSource.value = idx
  }
})

// 🔥 新增：切换 Tab 时加载骨架训练图片
const loadSkeletonImages = async () => {
  if (!skeletonFileList.value.length) return

  for (const file of skeletonFileList.value) {
    // 如果没有 URL 或者 URL 不是 blob/data (即不是本地预览也不是已加载的)，则请求
    if (!file.url || (!file.url.startsWith('blob:') && !file.url.startsWith('data:'))) {
      const url = await getFileUrl(file.name)
      if (url) file.url = url
    }
  }
}

watch(pageActiveTab, (val) => {
  if (val === 'config') loadSkeletonImages()
})

// 监听组件选择，加载对应的骨架文件列表
watch(selectedCompIndex, (newVal) => {
  if (newVal !== -1) {
    const comp = localData.interactions[newVal]
    const images = comp.skeleton_config?.images || []
    // 🔥 标记为 success 以便 uploadFilesList 知道无需重复上传
    compSkeletonFileList.value = images.map(name => ({name, url: '', status: 'success'}))
    stateSelectedImages.value = {}
    if (comp.states) {
      comp.states.forEach((s, i) => {
        const sImages = s.skeleton_config?.images || []
        stateSelectedImages.value[i] = sImages || []
      })
    }
  }
})

const trainSkeleton = async () => {
  const selectedFiles = skeletonFileList.value.filter(f => pageTrainingSelectedUids.value.has(f.uid))
  if (selectedFiles.length < 2) {
    ElMessage.warning('请至少选择 2 张同页面、不同内容的截图')
    return
  }

  const uploadedNames = await uploadFilesList(selectedFiles)

  console.log('All samples uploaded, starting training with:', uploadedNames)

  try {
    const res = await wsTrainSkeleton({
      graph_id: props.graphId,
      node_id: props.node.id,
      image_names: uploadedNames,
      threshold: 10,
    })
    console.log('Train response:', res)
    if (res.code === 200 && res.data) {
      localData.skeletonImages = res.data.images || uploadedNames
      localData.skeletonMask = resolveBackendPath(res.data)
      await loadOneScreenshot(localData.skeletonMask)

      const masterName = res.data.master_path || (res.data.images || uploadedNames)[0]
      await setMainScreenshotFromFilename(masterName)

      const hotspotCount = await syncHotspotsAfterScreenshot(true, true)

      updateNode()
      showSkeletonMask.value = false
      if (hotspotCount > 0) {
        ElMessage.success(`页面骨架训练成功，并识别出 ${hotspotCount} 个热区`)
      } else {
        ElMessage.success('页面骨架训练成功，Run 时将用于页面识别')
      }
    } else {
      ElMessage.error(res.msg || '训练失败')
    }
  } catch (e) {
    console.error('Train request error:', e)
    ElMessage.error('训练请求异常')
  }
}
// 🔥 1. 实现点击状态图片切换画布预览
const handleStateImageClick = async (state) => {
  if (!state.image_url) {
    ElMessage.warning('该状态暂无图片')
    return
  }

  let url = getStateImageUrl(state.image_url)
  // 如果缓存中没有（非 http/data 开头），尝试加载
  if (!url) {
    await loadOneScreenshot(state.image_url)
    url = getStateImageUrl(state.image_url)
  }

  if (url) {
    previewImage.value = url
    ElMessage.success(`已切换预览: ${state.state_type}`)
    nextTick(() => fitToScreen())
  } else {
    ElMessage.error('无法加载图片')
  }
}
// --- 组件/状态骨架训练逻辑 ---
const handleRemoveCompSkeletonImage = (idx) => {
  compSkeletonFileList.value.splice(idx, 1)
}

const openComponentImageSelector = async () => {
  if (skeletonFileList.value.length === 0) {
    ElMessage.warning('页面骨架配置中暂无图片，请先在"骨架与配置"页签上传')
    return
  }
  // 加载缩略图
  for (const file of skeletonFileList.value) {
    if (!file.url) file.url = await getFileUrl(file.name)
  }

  selectorCandidateList.value = skeletonFileList.value
  selectorMode.value = 'component'
  // 预选已有的
  tempSelectedImageNames.value = compSkeletonFileList.value.map(f => f.name)
  showImageSelector.value = true
}

const openImageSelector = async (sIdx) => {
  if (compSkeletonFileList.value.length === 0) {
    ElMessage.warning('请先在"基础属性"页签的"组件骨架配置"中上传图片')
    return
  }

  // 加载缩略图以便预览
  for (const file of compSkeletonFileList.value) {
    if (!file.url) file.url = await getFileUrl(file.name)
  }

  selectorCandidateList.value = compSkeletonFileList.value
  selectorMode.value = 'state'
  currentSelectorStateIndex.value = sIdx
  tempSelectedImageNames.value = [...(stateSelectedImages.value[sIdx] || [])]
  showImageSelector.value = true
}

const toggleImageSelection = (name) => {
  const idx = tempSelectedImageNames.value.indexOf(name)
  if (idx > -1) tempSelectedImageNames.value.splice(idx, 1)
  else tempSelectedImageNames.value.push(name)
}

const confirmImageSelection = () => {
  if (selectorMode.value === 'state') {
    stateSelectedImages.value[currentSelectorStateIndex.value] = [...tempSelectedImageNames.value]
  } else {
    // Component Mode: 同步选择到 compSkeletonFileList
    const newFiles = []
    const currentNames = compSkeletonFileList.value.map(f => f.name)

    // 1. 保留已存在且仍被选中的
    compSkeletonFileList.value.forEach(f => {
      if (tempSelectedImageNames.value.includes(f.name)) {
        newFiles.push(f)
      }
    })

    // 2. 添加新选中的 (从 selectorCandidateList 中查找信息)
    tempSelectedImageNames.value.forEach(name => {
      if (!currentNames.includes(name)) {
        const candidate = selectorCandidateList.value.find(c => c.name === name)
        if (candidate) {
          newFiles.push({
            name: candidate.name,
            url: candidate.url,
            status: 'success', // 页面样本通常已上传
            uid: candidate.uid || Date.now() + Math.random()
          })
        }
      }
    })
    compSkeletonFileList.value = newFiles
  }
  showImageSelector.value = false
}

const uploadFilesList = async (fileList) => {
  const uploadedNames = []
  for (const file of fileList) {
    if (file.status === 'success' && file.name && !file.raw) {
      uploadedNames.push(file.name)
      continue
    }
    const reader = new FileReader()
    const p = new Promise((resolve) => {
      reader.onload = async (e) => {
        const res = await wsUploadFile(file.name, e.target.result)
        if (res.code === 200) {
          const path = resolveBackendPath(res.data)
          const filename = path.split(/[/\\]/).pop()
          resolve(filename)
        } else {
          resolve(null)
        }
      }
    })
    reader.readAsDataURL(file.raw || file)
    const name = await p
    if (name) uploadedNames.push(name)
  }
  return uploadedNames
}

const trainComponentSkeleton = async () => {
  const comp = localData.interactions[selectedCompIndex.value]
  if (!comp) return
  const names = await uploadFilesList(compSkeletonFileList.value)

  const res = await wsTrainSkeleton({
    component_id: comp.uid || comp.id,
    image_names: names,
    threshold: 10
  })

  if (res.code === 200 && res.data) {
    comp.skeleton_config = {
      mask_url: resolveBackendPath(res.data),
      images: res.data.images || names
    }
    ElMessage.success('组件骨架生成成功')
    updateNode()
  } else {
    ElMessage.error(res.msg || '训练失败')
  }
}
const trainStateSkeleton = async (sIdx) => {
  const comp = localData.interactions[selectedCompIndex.value]
  const state = comp.states[sIdx]
  const names = stateSelectedImages.value[sIdx] || []
  if (names.length === 0) return

  // 🔥 确保选中的图片已上传 (针对刚添加到组件列表但未点击生成的图片)
  const filesToUpload = compSkeletonFileList.value.filter(f => names.includes(f.name))
  await uploadFilesList(filesToUpload)

  const res = await wsTrainSkeleton({
    component_id: comp.uid || comp.id,
    state_type: state.state_type,
    image_names: names,
    threshold: 10
  })

  if (res.code === 200 && res.data) {
    state.skeleton_config = {
      mask_url: resolveBackendPath(res.data),
      images: res.data.images || names
    };
    ElMessage.success(`状态 ${state.state_type} 骨架生成成功`)
    updateNode()
  } else {
    ElMessage.error(res.msg || '训练失败')
  }
}

const trainComponent = async () => {
  const comp = localData.interactions[selectedCompIndex.value]
  if (!comp) return

  const statesPayload = []
  const allFilesToUpload = new Set()

  // 1. Prepare Payload & Collect Files
  for (const [sIdx, state] of comp.states.entries()) {
    const sampleNames = stateSelectedImages.value[sIdx] || []

    if (sampleNames.length > 0) {
      statesPayload.push({
        name: state.state_type,
        samples: sampleNames
      })
      // Collect files that need to be uploaded
      sampleNames.forEach(name => allFilesToUpload.add(name))
    }
  }

  if (statesPayload.length === 0) {
    ElMessage.warning('Please select samples for at least one state.')
    return
  }

  // 2. Upload Files (Reuse existing logic)
  // Find file objects from skeletonFileList or compSkeletonFileList
  const filesToUpload = skeletonFileList.value.filter(f => allFilesToUpload.has(f.name))
  await uploadFilesList(filesToUpload)

  // 3. Send Request
  const res = await wsTrainSkeleton({
    component_id: comp.uid || comp.id,
    states: statesPayload, // 🔥 New Payload Structure
    threshold: 10
  })

  if (res.code === 200) {
    ElMessage.success('Component multi-state model training started!')
  } else {
    ElMessage.error(res.msg || 'Training failed')
  }
}

const zoomIn = () => scale.value = Math.min(5, scale.value * 1.2)
const zoomOut = () => scale.value = Math.max(0.1, scale.value * 0.8)

const fitToScreen = () => {
  if (!localData.naturalW || !localData.naturalH || !visualPanelRef.value) return

  const containerEl = visualPanelRef.value.$el
  const containerW = containerEl.clientWidth
  const containerH = containerEl.clientHeight
  const padding = 40

  // 计算缩放比例：保证图片完整显示在容器内
  const scaleX = (containerW - padding) / localData.naturalW
  const scaleY = (containerH - padding) / localData.naturalH
  const newScale = Math.min(scaleX, scaleY, 1) // 不超过原图大小

  scale.value = newScale

  // 居中计算
  const scaledW = localData.naturalW * newScale
  const scaledH = localData.naturalH * newScale

  translate.value = {
    x: (containerW - scaledW) / 2,
    y: (containerH - scaledH) / 2
  }
}

const handleKeydown = (e) => {
  if (selectedCompIndex.value === -1) return
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return

  const comp = localData.interactions[selectedCompIndex.value]
  if (!comp) return
// 如果在多态 Tab 且选中了某个状态，则移动状态的坐标
  let target = comp
  if (activeTab.value === 'states' && selectedStateIndex.value !== -1 && comp.states && comp.states[selectedStateIndex.value]) {
    target = comp.states[selectedStateIndex.value]
  }
  let handled = false
  if (e.key === 'ArrowUp') {
    target.y -= 1;
    handled = true
  } else if (e.key === 'ArrowDown') {
    target.y += 1;
    handled = true
  } else if (e.key === 'ArrowLeft') {
    target.x -= 1;
    handled = true
  } else if (e.key === 'ArrowRight') {
    target.x += 1;
    handled = true
  }

  if (handled) {
    e.preventDefault()
    updateNode()
  }
}

onMounted(async () => {
  if (props.node) {
    localData.label = props.node.label
    localData.desc = props.node.desc || props.node.data?.desc || ''

    // 初始化阻断状态
    localData.is_blocking = props.node.data?.is_blocking || false

    localData.skeletonMask = resolveBackendPath(props.node.data?.skeleton_config) || props.node.data?.skeleton_config?.mask_url || ''

    // 🔥 关键修复：如果存在骨架蒙版，加载其内容
    if (localData.skeletonMask) loadOneScreenshot(localData.skeletonMask)

    // 🔥 关键修复：回显已上传的训练图片
    const savedImages = props.node.data?.skeleton_config?.images || []
    localData.skeletonImages = savedImages
    skeletonFileList.value = savedImages.map(name => ({name: name, url: '', uid: name})) // URL 留空，切换 Tab 时懒加载
    // Auto-select saved images
    savedImages.forEach(name => pageTrainingSelectedUids.value.add(name))


    // 🔥 修复：安全地获取截图路径字符串，防止因数据为对象而崩溃
    const screenshotData = props.node.data.screenshot
    let path = resolveBackendPath(screenshotData)
    localData.screenshotPath = path

    // 🔥 修复：如果已经是 Base64 或 HTTP URL，直接显示，无需请求后端
    if (path && (String(path).startsWith('data:') || String(path).startsWith('http'))) {
      localData.screenshot = path
    }
    // 否则尝试通过 WebSocket 获取文件内容
    else if (path) {
      try {
        const res = await wsGetFile(path)
        if (res.code === 200) {
          // 🔥 修复：处理 raw base64，补全前缀
          const data = res.data
          if (data && typeof data === 'object') {
            // 处理二进制对象
            if (data instanceof Blob) localData.screenshot = URL.createObjectURL(data)
            else if (data instanceof ArrayBuffer) localData.screenshot = URL.createObjectURL(new Blob([data]))
            else if (data.type === 'Buffer' && Array.isArray(data.data)) {
              const u8 = new Uint8Array(data.data)
              localData.screenshot = URL.createObjectURL(new Blob([u8]))
            } else if (data.content && typeof data.content === 'string') {
              // 🔥 新增：处理 { name, content } 结构
              let rawStr = data.content
              if (!rawStr.startsWith('data:')) {
                let mime = 'image/png'
                if (data.name) {
                  const ext = data.name.split('.').pop().toLowerCase()
                  if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
                }
                rawStr = `data:${mime};base64,${rawStr}`
              }
              localData.screenshot = rawStr
            }
          } else if (typeof data === 'string') {
            if (data && !data.startsWith('data:')) {
              const ext = path.split('.').pop().toLowerCase()
              const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png'
              localData.screenshot = `data:${mime};base64,${data}`
            } else {
              localData.screenshot = data
            }
          }
        }
      } catch (e) {
        console.error('Failed to load image via WS', e)
      }
    } else {
      localData.screenshot = path
    }

    if (!localData.screenshot && savedImages.length > 0) {
      const master = props.node.data?.skeleton_config?.master_path || savedImages[0]
      await setMainScreenshotFromFilename(master)
    }

    localData.naturalW = props.node.data.naturalSize?.w || 0
    localData.naturalH = props.node.data.naturalSize?.h || 0

    // 打开页面时只做清洗，不按尺寸过滤（避免 naturalSize 未就绪时误删 Tab 等热区）
    localData.interactions = JSON.parse(
      JSON.stringify(props.node.data.interactions || [])
    ).map(sanitizeComponent)

    // 🔥 修复：预加载所有状态图片的缓存
    localData.interactions.forEach(comp => {
      if (comp.states) {
        comp.states.forEach(s => {
          if (s.image_url) loadOneScreenshot(s.image_url)
        })
      }
    })

    // 如果已有图片，尝试适应屏幕
    if (localData.naturalW) {
      nextTick(() => fitToScreen())
    }

    if ((localData.screenshotPath || localData.skeletonMask) && localData.interactions.length === 0) {
      nextTick(() => syncHotspotsAfterScreenshot(false))
    }
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  // 🔥 Robust Cleanup: Revoke all tracked blob URLs
  activeBlobUrls.forEach(url => URL.revokeObjectURL(url))
  activeBlobUrls.clear()
})
</script>

<style scoped>
/* 🔥 Focus Mode Layout */
.focus-editor-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.editor-layout {
  flex: 1;
  overflow: hidden;
  display: flex;
}

/* 🔥 Teleport Toolbar Styles */
.focus-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
  width: 100%;
  justify-content: center;
}

.focus-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.focus-input-title {
  width: 160px;
}

:deep(.focus-input-title .el-input__wrapper) {
  box-shadow: none !important;
  background: transparent;
  border-bottom: 1px dashed #ccc;
  padding: 0;
}

:deep(.focus-input-title .el-input__inner) {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.focus-divider {
  width: 1px;
  height: 16px;
  background: #e5e7eb;
  margin: 0 4px;
}

.zoom-label {
  font-size: 12px;
  color: #64748b;
  min-width: 36px;
  text-align: center;
}

.visual-container {
  flex: 1;
  background: transparent; /* Transparent to show underlying canvas context if needed, or just clean look */
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.canvas-wrapper {
  flex: 1;
  overflow: hidden;
  cursor: grab;
  position: relative;
}

.transform-layer {
  transform-origin: 0 0;
}

.artboard {
  position: relative;
  background: #fff;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15); /* Floating effect */
}

.base-img {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.empty-artboard {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}

.hotspot-box {
  position: absolute;
  border: 1px solid #6366f1;
  background: rgba(99, 102, 241, 0.1);
  z-index: 10;
  cursor: pointer;
  box-sizing: border-box;
}

.hotspot-box.selected {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
  z-index: 20;
}

.hotspot-box.needs-confirm {
  border-style: dashed;
  border-color: #e6a23c;
  background: rgba(230, 162, 60, 0.15);
}

.hotspot-box.is-system {
  border-color: #909399;
  background: rgba(144, 147, 153, 0.05);
}

/* 🔥 Style for backend-detected containers */
.hotspot-box.is-container {
  border-color: #a1a1aa;
  background: rgba(212, 212, 216, 0.1);
  border-style: dotted;
}

.hotspot-box.is-shared-nav {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  border-style: solid;
}

.hotspot-box.is-shared-nav .label-tag {
  background: #f59e0b;
}

.label-tag {
  position: absolute;
  top: -22px;
  left: -2px;
  background: #6366f1;
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.drawing-box {
  position: absolute;
  border: 1px dashed #6366f1;
  background: rgba(99, 102, 241, 0.1);
  pointer-events: none;
  z-index: 30;
}

.props-sidebar {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-left: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  z-index: 20;
  overflow: hidden;
}

.sidebar-header {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #f1f5f9;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.sidebar-header .title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-left: 4px;
}

.list-content {
  flex: 1;
  padding: 12px;
}

.comp-empty-state {
  text-align: center;
  padding: 28px 16px;
  color: #64748b;
  font-size: 13px;
}

.comp-empty-state p {
  margin: 0 0 6px;
  font-weight: 600;
  color: #334155;
}

.comp-empty-state span {
  display: block;
  font-size: 12px;
  line-height: 1.5;
}

.comp-list-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.comp-card {
  display: flex;
  align-items: center;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.comp-card:hover {
  border-color: #6366f1;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08);
  transform: translateY(-1px);
}

.comp-card.active {
  border-color: #6366f1;
  background: #eff6ff;
}

.card-left {
  display: flex;
  align-items: center;
  margin-right: 10px;
}

.index-circle {
  width: 24px;
  height: 24px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  margin-right: 8px;
  flex-shrink: 0;
}

.comp-thumbnail {
  background-color: #e2e8f0;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background-repeat: no-repeat;
  flex-shrink: 0;
}

.comp-label-text {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  margin-bottom: 2px;
}

.comp-meta-text {
  font-size: 11px;
  color: #94a3b8;
  font-family: monospace;
}

.comp-card.active .index-circle {
  background: #6366f1;
  color: white;
}

:deep(.comp-name-edit .el-input__wrapper) {
  box-shadow: none;
  padding: 0;
}

.meta-row {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.coord-inputs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.coord-inputs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.coord-item {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: #909399;
}

.coord-input {
  width: 42px;
}

:deep(.coord-input .el-input__inner) {
  padding: 0 2px;
  text-align: center;
  height: 20px;
  line-height: 20px;
  font-size: 11px;
}

:deep(.coord-input .el-input__wrapper) {
  padding: 0;
  min-height: 20px;
  box-shadow: none;
  background: #f8fafc;
}

.delete-btn {
  position: absolute;
  right: 8px;
  top: 8px;
  opacity: 0;
}

.comp-card:hover .delete-btn {
  opacity: 1;
}

.btn-icon-close {
  font-size: 20px;
  color: #94a3b8;
}

.canvas-tip {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  pointer-events: none;
}

.detail-view {
  padding: 0 4px;
}

.comp-preview-large {
  width: 100%;
  height: 100px;
  background-color: #f1f5f9;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #e2e8f0;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
  font-weight: 500;
}

.state-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}

.state-card.active {
  border-color: #6366f1;
  background: #eff6ff;
}

.state-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.state-idx {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
}

.state-body {
  display: flex;
  gap: 10px;
}

.state-img-uploader {
  width: 60px;
  height: 60px;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: white;
  overflow: hidden;
  flex-shrink: 0;
}

.state-img-uploader:hover {
  border-color: #6366f1;
  color: #6366f1;
}

.state-img-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 10px;
  color: #94a3b8;
  gap: 2px;
}

.state-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.skeleton-uploader {
  border: 1px dashed #e2e8f0;
  padding: 10px;
  border-radius: 8px;
  background: #f8fafc;
}

/* 🔥 4. 安全区域交互优化：影院模式 (Dimmed) */
.safe-area-overlay {
  position: absolute;
  left: 0;
  width: 100%;
  background: transparent; /* 🔥 1. 透明背景，仅保留线条 */
  pointer-events: none;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  transition: background 0.2s;
}

/* 拖拽时稍微显示背景，方便感知区域 */
.safe-area-overlay.is-dragging {
  background: rgba(245, 108, 108, 0.1);
}

.safe-area-overlay.top {
  top: 0;
  border-bottom: 2px solid #f56c6c; /* 仅保留清晰的边界线 */
}

.safe-area-overlay.bottom {
  bottom: 0;
  border-top: 2px solid #f56c6c;
  border-bottom: none;
  align-items: flex-start;
}

.safe-area-label {
  font-size: 10px;
  color: white;
  background: #f56c6c;
  padding: 1px 6px;
  border-radius: 0 0 4px 4px;
  pointer-events: none;
  font-weight: 600;
}

.safe-area-handle {
  position: absolute;
  left: 0;
  width: 100%;
  height: 10px;
  cursor: ns-resize;
  pointer-events: auto;
}

.safe-area-overlay.top .safe-area-handle {
  bottom: -5px;
}

.safe-area-overlay.bottom .safe-area-handle {
  top: -5px;
}


/* 自定义骨架文件列表样式 */
.skeleton-file-item {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skeleton-file-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.el-upload-list__item-actions {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.skeleton-file-item:hover .el-upload-list__item-actions {
  opacity: 1;
}

.action-btn {
  color: white;
  cursor: pointer;
  font-size: 18px;
}

.action-btn:hover {
  color: #6366f1;
}

.action-btn.delete:hover {
  color: #ef4444;
}

.preview-banner {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.main-screenshot-uploader {
  width: 100%;
  height: 160px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #f8fafc;
  overflow: hidden;
  position: relative;
  transition: all 0.2s;
}

.main-screenshot-uploader:hover {
  border-color: #6366f1;
}

.main-screenshot-uploader .preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #e2e8f0;
}

.main-screenshot-uploader .upload-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.reupload-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: white;
  font-size: 24px;
}

.main-screenshot-uploader:hover .reupload-overlay {
  opacity: 1;
}

.uploader-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #6366f1;
  font-size: 13px;
}

.skeleton-highlight-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.35;
  /* 不用 screen 混合，避免与正文叠层后文字发花、出现块状噪点 */
  mix-blend-mode: normal;
}

.crop-box {
  position: absolute;
  border: 2px solid #10b981;
  background: rgba(16, 185, 129, 0.1);
  z-index: 50;
  cursor: move;
}

.crop-actions {
  position: absolute;
  bottom: -40px;
  left: 0;
  display: flex;
  gap: 8px;
  background: white;
  padding: 4px 8px;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.state-coords-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.coord-mini {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: #909399;
  flex: 1;
}

.coord-mini span {
  min-width: 8px;
}

:deep(.coord-mini .el-input__inner) {
  padding: 0 2px;
  text-align: center;
  height: 20px;
  line-height: 20px;
  font-size: 10px;
}

:deep(.coord-mini .el-input__wrapper) {
  padding: 0;
  min-height: 20px;
  box-shadow: none;
  background: #fff;
  border: 1px solid #e2e8f0;
}

.skeleton-preview-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  background: #f8fafc;
  padding: 4px;
  border-radius: 4px;
}

.skeleton-preview-mini .label {
  font-size: 11px;
  color: #64748b;
}

.mini-mask {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border: 1px solid #e2e8f0;
  background: white;
}

.state-skeleton-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
}

.skeleton-label {
  font-size: 11px;
  color: #94a3b8;
}

.mini-uploader {
  display: flex;
  gap: 8px;
  align-items: center;
}

.img-selector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
}

.img-select-item {
  position: relative;
  aspect-ratio: 1;
  border: 2px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
}

.img-select-item.selected {
  border-color: #6366f1;
}

.select-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.select-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.img-select-item.selected .select-overlay {
  opacity: 1;
  background: #6366f1;
  color: white;
}

.img-select-item:hover .select-overlay {
  opacity: 1;
}

.img-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 10px;
  padding: 2px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 组件骨架样本列表 */
.selected-samples-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.sample-thumb-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.sample-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sample-actions {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.sample-thumb-item:hover .sample-actions {
  opacity: 1;
}

.remove-icon {
  color: white;
  cursor: pointer;
  font-size: 16px;
}

.remove-icon:hover {
  color: #ef4444;
}

.empty-samples-text {
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
  padding: 10px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px dashed #e2e8f0;
}

.safe-area-info {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
}

.config-section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-header .title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.control-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}

.control-row .label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;
}

.control-inputs {
  display: flex;
  align-items: center;
}

.divider-line {
  height: 1px;
  background: #f1f5f9;
  margin: 20px -12px;
}

.helper-text {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 12px;
  line-height: 1.4;
}

.gallery-item {
  width: 100%;
  height: 100%;
  position: relative;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
}

.gallery-item.selected {
  border-color: #6366f1;
}

.selection-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  background: #6366f1;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.gallery-item.selected .selection-overlay {
  opacity: 1;
}

.mini-uploader :deep(.el-upload--picture-card) {
  width: 80px;
  height: 80px;
  line-height: 80px;
}

.mini-uploader :deep(.el-upload-list--picture-card .el-upload-list__item) {
  width: 80px;
  height: 80px;
}

</style>