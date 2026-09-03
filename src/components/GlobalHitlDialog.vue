<script setup>
/**
 * 全局 HITL 人工介入弹窗。
 * agent 执行中通过 human_* 能力发起请求，服务端 WS 广播 {type:"hitl_request", data:{...}}。
 * 本组件常驻 App.vue Global Overlays，按队列逐个弹出，回复走 POST /hitl/reply。
 */
import { ref, computed, watch, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { addMessageListener, removeMessageListener } from '@/api/mWebSocket'
import { replyHitl, skipHitl, getPendingHitl } from '@/api/hitl'

const queue = ref([])                                  // 多请求排队
const current = computed(() => queue.value[0] || null)
const visible = computed(() => !!current.value)
const answer = ref(null)                               // 按 kind 存不同类型
const submitting = ref(false)
const remainSec = ref(0)
let timer = null

// 收到新请求时，按 kind 初始化 answer 初值
watch(current, (cur) => {
  stopTimer()
  if (!cur) return
  if (cur.kind === 'choice_multiple') answer.value = []
  else if (cur.kind === 'confirm') answer.value = null
  else answer.value = ''
  startCountdown(cur)
})

function startCountdown(cur) {
  const deadline = cur.deadline_at ? Date.parse(cur.deadline_at) : 0
  if (!deadline) { remainSec.value = 0; return }
  const tick = () => {
    remainSec.value = Math.max(0, Math.round((deadline - Date.now()) / 1000))
    if (remainSec.value <= 0) { stopTimer(); onSkip() }  // 超时自动跳过（后端也会 revoke）
  }
  tick()
  timer = setInterval(tick, 1000)
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null } }

const handleWsMessage = (res) => {
  if (!res) return
  const type = res.type || res.action
  const data = res.data || {}
  if (type === 'hitl_request') {
    if (data.request_id && !queue.value.some(q => q.request_id === data.request_id)) {
      queue.value.push(data)
    }
  } else if (type === 'hitl_revoke' || type === 'hitl_resolved') {
    // 其它端已处理/超时/撤销 → 从队列移除
    queue.value = queue.value.filter(q => q.request_id !== data.request_id)
  }
}

const advance = () => { queue.value.shift(); answer.value = null; stopTimer() }

const canSubmit = computed(() => {
  const cur = current.value
  if (!cur) return false
  if (cur.kind === 'input_text') return String(answer.value || '').trim().length > 0
  if (cur.kind === 'choice_single') return !!answer.value
  if (cur.kind === 'choice_multiple') return Array.isArray(answer.value) && answer.value.length > 0
  return true
})

const inputPlaceholder = computed(() => {
  const field = current.value?.constraints?.field
  if (field === 'phone') return '请输入11位手机号'
  if (field === 'sms_code') return '请输入短信验证码'
  return '请输入…'
})

const submit = async (forced) => {
  const cur = current.value
  if (!cur) return
  let payload = forced !== undefined ? forced : answer.value
  if (cur.kind === 'acknowledge') payload = 'ack'
  submitting.value = true
  try {
    await replyHitl({ request_id: cur.request_id, kind: cur.kind, answer: payload, skipped: false })
    advance()
  } catch (e) {
    ElMessage.error(e?.message || e?.msg || '提交失败')
  } finally {
    submitting.value = false
  }
}

const onSkip = async () => {
  const cur = current.value
  if (!cur) return
  try { await skipHitl(cur.request_id, cur.kind) } catch (_) { /* noop */ }
  advance()
}

// 重连/首开时补拉未决请求
const refreshPending = async () => {
  try {
    const res = await getPendingHitl()
    const items = res?.data?.items || res?.items || res?.data || []
    if (Array.isArray(items)) {
      items.forEach(it => {
        const d = it.data || it
        if (d.request_id && !queue.value.some(q => q.request_id === d.request_id)) queue.value.push(d)
      })
    }
  } catch (_) { /* noop */ }
}

onMounted(() => {
  addMessageListener(handleWsMessage)
  refreshPending()
})
onUnmounted(() => removeMessageListener(handleWsMessage))
onBeforeUnmount(stopTimer)
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="current?.title || '需要你介入'"
    width="460px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    append-to-body
    class="hitl-dialog"
  >
    <div v-if="current" class="hitl-body">
      <p class="hitl-hint-top">Agent 已暂停等待你的回复；点选后才会继续执行。超时将自动跳过。</p>
      <p class="hitl-text">{{ current.body }}</p>

      <img v-if="current.screenshot_url" :src="current.screenshot_url" class="hitl-shot" alt="screen" />

      <!-- input_text -->
      <el-input
        v-if="current.kind === 'input_text'"
        v-model="answer" type="textarea" :rows="3"
        :maxlength="current.constraints?.max_len || 1024" show-word-limit
        :placeholder="inputPlaceholder"
      />

      <!-- choice_single -->
      <el-radio-group v-else-if="current.kind === 'choice_single'" v-model="answer" class="hitl-choices">
        <el-radio v-for="opt in current.options" :key="opt.id" :value="opt.id">
          {{ opt.label }}<span v-if="opt.hint" class="hitl-hint">（{{ opt.hint }}）</span>
        </el-radio>
      </el-radio-group>

      <!-- choice_multiple -->
      <el-checkbox-group v-else-if="current.kind === 'choice_multiple'" v-model="answer" class="hitl-choices">
        <el-checkbox v-for="opt in current.options" :key="opt.id" :value="opt.id">
          {{ opt.label }}<span v-if="opt.hint" class="hitl-hint">（{{ opt.hint }}）</span>
        </el-checkbox>
      </el-checkbox-group>

      <!-- upload_image -->
      <el-upload
        v-else-if="current.kind === 'upload_image'"
        :auto-upload="false" :limit="1" :show-file-list="true"
        :on-change="(f) => (answer = { path: f.name, mime: f.raw?.type })"
      >
        <el-button>选择图片</el-button>
      </el-upload>

      <div v-if="remainSec > 0" class="hitl-timer">剩余 {{ remainSec }}s</div>
    </div>

    <template #footer>
      <el-button text @click="onSkip">跳过</el-button>
      <template v-if="current?.kind === 'confirm'">
        <el-button @click="submit(false)">否</el-button>
        <el-button type="primary" :loading="submitting" @click="submit(true)">是</el-button>
      </template>
      <el-button
        v-else
        type="primary" :loading="submitting" :disabled="!canSubmit"
        @click="submit()"
      >
        {{ current?.kind === 'acknowledge' ? '我已知悉' : '确定' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.hitl-body { padding: 0 2px; }
.hitl-hint-top {
  margin: 0 0 10px;
  font-size: 12px;
  color: #a16207;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 10px;
  line-height: 1.5;
}
.hitl-text { margin: 0 0 14px; font-size: 14px; color: #374151; line-height: 1.6; white-space: pre-wrap; }
.hitl-shot { max-width: 100%; max-height: 240px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #e5e7eb; }
.hitl-choices { display: flex; flex-direction: column; gap: 8px; }
.hitl-hint { color: #9ca3af; font-size: 12px; }
.hitl-timer { margin-top: 12px; font-size: 12px; color: #9ca3af; text-align: right; }
</style>
