<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChatDotRound, Delete, Plus } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { deleteAgentSession, pullAgentSessions, readAgentSessions } from '@/utils/agentSessions'

const router = useRouter()
const sessions = ref([])

const sortedSessions = computed(() =>
  [...sessions.value]
    .filter((session) => (session.messages || []).some((item) => item.role === 'user' && String(item.content || '').trim()))
    .sort((a, b) => new Date(b.lastUserMessageAt || b.updatedAt) - new Date(a.lastUserMessageAt || a.updatedAt)),
)

const formatTime = (value) => {
  if (!value) return '刚刚'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '刚刚' : date.toLocaleString()
}

const loadSessions = async () => {
  sessions.value = await pullAgentSessions()
  if (!sessions.value.length) sessions.value = readAgentSessions()
}

const newAgent = () => {
  router.push({ name: 'Dialogue', query: { fresh: '1' } })
}

const openSession = (session) => {
  router.push({ name: 'Dialogue', query: { sessionId: session.id } })
}

const removeSession = async (session) => {
  try {
    await ElMessageBox.confirm('确定删除这条 Agent 对话记录吗？', '删除记录', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    deleteAgentSession(session.id)
    loadSessions()
  } catch (e) {
    // 用户取消。
  }
}

onMounted(loadSessions)
</script>

<template>
  <div class="agent-history-page">
    <header class="history-header">
      <div>
        <span class="history-kicker">对话</span>
        <h2>对话记录</h2>
        <p>保存最近的对话上下文，点击任意记录继续。</p>
      </div>
      <button type="button" class="new-agent-btn" @click="newAgent">
        <el-icon><Plus /></el-icon>
        <span>新建对话</span>
      </button>
    </header>

    <section class="history-shell">
      <div v-if="!sortedSessions.length" class="empty-history">
        <el-icon><ChatDotRound /></el-icon>
        <strong>暂无对话记录</strong>
        <span>新建对话后，内容会自动保存在这里。</span>
        <button type="button" @click="newAgent">新建对话</button>
      </div>

      <template v-else>
        <article
          v-for="session in sortedSessions"
          :key="session.id"
          class="history-card"
          @click="openSession(session)"
        >
          <div class="history-icon">
            <el-icon><ChatDotRound /></el-icon>
          </div>
          <div class="history-main">
            <div class="history-title-row">
              <strong>{{ session.title || '新对话' }}</strong>
              <span>{{ formatTime(session.updatedAt) }}</span>
            </div>
            <p>{{ session.messages?.[session.messages.length - 1]?.content || '空对话' }}</p>
            <div class="history-meta">
              <span>{{ session.messages?.length || 0 }} messages</span>
              <span v-if="session.deviceSn">device {{ session.deviceSn }}</span>
            </div>
          </div>
          <button type="button" class="delete-history" @click.stop="removeSession(session)">
            <el-icon><Delete /></el-icon>
          </button>
        </article>
      </template>
    </section>
  </div>
</template>

<style scoped>
.agent-history-page {
  min-height: 100%;
  padding: 32px;
  background: #f3f4f6;
  box-sizing: border-box;
}

.history-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  max-width: 980px;
  margin: 0 auto 18px;
}

.history-kicker {
  color: #6366f1;
  font-size: 12px;
  font-weight: 800;
}

.history-header h2 {
  margin: 6px 0 6px;
  color: #111827;
  font-size: 26px;
}

.history-header p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.new-agent-btn,
.empty-history button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #c7d2fe;
  border-radius: 12px;
  background: #eef2ff;
  color: #4f46e5;
  cursor: pointer;
  font-weight: 800;
}

.history-shell {
  max-width: 980px;
  margin: 0 auto;
  padding: 10px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.06);
}

.history-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  cursor: pointer;
}

.history-card:hover {
  background: #f8fafc;
}

.history-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 12px;
  background: #eef2ff;
  color: #4f46e5;
}

.history-main {
  min-width: 0;
  flex: 1;
}

.history-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.history-title-row strong {
  overflow: hidden;
  color: #111827;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-title-row span,
.history-meta {
  color: #94a3b8;
  font-size: 12px;
}

.history-main p {
  overflow: hidden;
  margin: 5px 0 7px;
  color: #64748b;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  display: flex;
  gap: 10px;
}

.delete-history {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}

.delete-history:hover {
  background: #fef2f2;
  color: #b91c1c;
}

.empty-history {
  display: flex;
  min-height: 320px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #94a3b8;
}

.empty-history .el-icon {
  font-size: 28px;
  color: #818cf8;
}

.empty-history strong {
  color: #111827;
}
</style>
