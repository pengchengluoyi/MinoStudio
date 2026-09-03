<template>
  <div class="list-container">
    <header class="header">
      <div class="left-panel">
      <WindowControls />
        <div class="logo">Ming Orange</div>
      </div>
      <div class="search-bar">
        <input v-model="searchQuery" placeholder="搜索流程名称或描述..." />
      </div>
      <button class="create-btn" @click="createNewFlow">+ 创建流程</button>
    </header>

    <div class="content">
       <!-- 加载状态 -->
       <div v-if="loading" class="loading">
         <span>正在从服务器加载数据...</span>
       </div>

       <!-- 空状态 -->
       <div v-else-if="filteredWorkflows.length === 0" class="empty-state">
         暂无数据或未找到匹配的流程
       </div>

       <!-- 列表网格 -->
       <div v-else class="grid">
          <div v-for="flow in filteredWorkflows" :key="flow.id" class="card file" @click="openFlow(flow)">
             <div class="card-header">
               <div class="icon file-icon">⚡️</div>
               <!-- 删除按钮 -->
               <div class="delete-btn" @click.stop="handleDelete(flow)">🗑️</div>
             </div>
             <div class="name" :title="flow.name">{{ flow.name }}</div>
             <div class="desc">{{ flow.desc || '暂无描述' }}</div>
             <div class="time">更新于: {{ formatDate(flow.updated_at || flow.created_at) }}</div>
          </div>
       </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWorkflowList, fetchWorkflowDelete } from '@/api/workflow' // 引入你的API

import WindowControls from '@/components/WindowControls.vue'

const router = useRouter()

// 状态定义
const workflows = ref([])
const loading = ref(false)
const searchQuery = ref('')

// 计算过滤后的列表
const filteredWorkflows = computed(() => {
  const query = searchQuery.value.toLowerCase()
  return workflows.value.filter(f => {
    const nameMatch = f.name && f.name.toLowerCase().includes(query)
    const descMatch = f.desc && f.desc.toLowerCase().includes(query)
    return nameMatch || descMatch
  })
})

// 获取列表数据
const loadData = async () => {
  loading.value = true
  try {
    const res = await fetchWorkflowList()
    // 假设后端返回的数据结构是 { code: 200, data: [...] } 或者直接就是数组
    // 请根据实际接口响应调整，这里假设 res.data 是列表
    workflows.value = res.data || [] 
  } catch (e) {
    console.error('获取流程列表失败:', e)
    alert('获取列表失败，请检查网络或服务端')
  } finally {
    loading.value = false
  }
}

// 路由跳转：打开现有流程
const openFlow = (flow) => {
  router.push({
    name: 'Editor',
    query: { 
      id: flow.id,
    }
  })
}

// 路由跳转：创建新流程
const createNewFlow = () => {
  router.push({
    name: 'Editor',
    query: {} // 标记为新建
  })
}

// 删除流程
const handleDelete = async (flow) => {
  if (!confirm(`确定要删除流程 "${flow.name}" 吗？此操作不可恢复。`)) return

  try {
    await fetchWorkflowDelete(flow.id)
    // 删除成功后重新加载列表
    await loadData()
  } catch (e) {
    console.error(e)
    alert('删除失败')
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

// 初始化
onMounted(() => {
  loadData()
})
</script>

<style scoped>
.list-container { height: 100vh; display: flex; flex-direction: column; background: #f8fafc; }

/* Header */
.header { height: 64px; background: white; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; padding: 0 24px; justify-content: space-between; flex-shrink: 0; }
.left-panel { display: flex; align-items: center; }
.logo { font-weight: 700; font-size: 18px; color: #4f46e5; }

.search-bar input { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; width: 300px; outline: none; transition: border 0.2s; }
.search-bar input:focus { border-color: #4f46e5; }

.create-btn { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.create-btn:hover { background: #4338ca; }

/* Content */
.content { padding: 24px; flex: 1; overflow-y: auto; }
.loading, .empty-state { text-align: center; color: #94a3b8; margin-top: 100px; font-size: 16px; }

/* Grid & Cards */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }

.card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; height: 140px; position: relative; }
.card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); border-color: #c7d2fe; }

.card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.file-icon { font-size: 20px; background: #eef2ff; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #4f46e5; }

.delete-btn { font-size: 14px; opacity: 0; transition: opacity 0.2s; padding: 4px; border-radius: 4px; }
.delete-btn:hover { background-color: #fee2e2; }
.card:hover .delete-btn { opacity: 1; }

.name { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.desc { font-size: 12px; color: #64748b; margin-bottom: auto; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4; }
.time { font-size: 11px; color: #94a3b8; margin-top: 12px; padding-top: 8px; border-top: 1px solid #f1f5f9; }
</style>