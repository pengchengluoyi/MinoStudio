<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElLoading, ElMessage } from 'element-plus'
import { Minus, FullScreen, Close } from '@element-plus/icons-vue'
import { getAuthStatus, loginAccount, registerAccount } from '@/api/auth'
import { persistRealtimeTokens, bootstrapRealtime } from '@/utils/realtime'
import { pullAgentSessions } from '@/utils/agentSessions'
import { useAppChrome } from '@/composables/useAppChrome'
import { waitForServer, getBaseUrl } from '@/utils/config'
import { setGlobalBaseUrl } from '@/utils/request'
import { lastTestingPath } from '@/utils/workMode'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const router = useRouter()
const mode = ref('login')
const name = ref('')
const email = ref('')
const password = ref('')
const confirm = ref('')
const showPassword = ref(false)
const loading = ref(false)
const serverOk = ref(true)
const bootOpen = ref(true)
const bootPhase = ref('connecting')
const { isElectron, isMac, showMacTraffic, showWinControls, handleMinimize, handleMaximize, handleClose } = useAppChrome()

let bootGen = 0

const bootTitle = computed(() => {
  if (bootPhase.value === 'entering') return '登录中'
  if (bootPhase.value === 'auth') return '正在确认登录'
  return '正在连接服务'
})

let bootLoading = null
const setBootLoading = (open, text) => {
  if (!open) {
    bootLoading?.close()
    bootLoading = null
    return
  }
  if (bootLoading) {
    bootLoading.setText?.(text)
    return
  }
  bootLoading = ElLoading.service({
    lock: true,
    text,
    background: 'rgba(246, 247, 251, 0.56)',
  })
}

watch([bootOpen, bootTitle], ([open, text]) => {
  setBootLoading(open, text)
}, { immediate: true })

const isRegister = computed(() => mode.value === 'register')
const title = computed(() => (isRegister.value ? '邮箱注册' : '邮箱登录'))
const submitLabel = computed(() => {
  if (loading.value) return '请稍候…'
  return isRegister.value ? '注册并进入' : '登录'
})

const homePath = () => {
  const last = lastTestingPath()
  if (!last || last === '/' || last.startsWith('/login')) return '/testing'
  return last
}

const goHome = () => router.replace(homePath())

const persistSession = (data) => {
  persistRealtimeTokens(data || {})
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const setMode = (next) => {
  mode.value = next
  password.value = ''
  confirm.value = ''
}

const runBoot = async () => {
  const gen = ++bootGen
  bootOpen.value = true
  bootPhase.value = 'connecting'
  serverOk.value = true

  const connected = await waitForServer({
    timeoutMs: 8000,
    intervalMs: 600,
    isCancelled: () => gen !== bootGen,
  })
  if (gen !== bootGen) return
  if (!connected) {
    serverOk.value = false
    bootOpen.value = false
    return
  }

  try {
    setGlobalBaseUrl(getBaseUrl())
  } catch (_) { /* axios will probe */ }

  bootPhase.value = 'auth'
  try {
    const res = await getAuthStatus()
    if (gen !== bootGen) return
    const data = res?.data || {}
    serverOk.value = true
    if (data.logged_in) {
      bootPhase.value = 'entering'
      await bootstrapRealtime()
      try { await pullAgentSessions() } catch (_) { /* sessions can wait */ }
      if (gen !== bootGen) return
      goHome()
      return
    }
    await sleep(280)
  } catch (_) {
    if (gen !== bootGen) return
    serverOk.value = false
    bootOpen.value = false
    return
  }
  bootOpen.value = false
}

const validate = () => {
  const em = email.value.trim()
  if (!EMAIL_RE.test(em)) return '请填写有效邮箱'
  if (password.value.length < 8) return '密码至少 8 位'
  if (isRegister.value) {
    if (name.value.trim().length > 32) return '名称最多 32 个字符'
    if (password.value !== confirm.value) return '两次密码不一致'
  }
  return ''
}

const submit = async () => {
  const err = validate()
  if (err) {
    ElMessage.warning(err)
    return
  }
  loading.value = true
  try {
    if (isRegister.value) {
      const res = await registerAccount({
        email: email.value.trim(),
        password: password.value,
        name: name.value.trim(),
      })
      persistSession(res?.data || {})
      ElMessage.success('注册成功')
    } else {
      const res = await loginAccount({ email: email.value.trim(), password: password.value })
      persistSession(res?.data || {})
      ElMessage.success('登录成功')
    }
    bootOpen.value = true
    bootPhase.value = 'entering'
    await bootstrapRealtime()
    await pullAgentSessions()
    goHome()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || (isRegister.value ? '注册失败' : '登录失败'))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  runBoot()
})
onUnmounted(() => {
  bootGen += 1
  setBootLoading(false, '')
})
</script>

<template>
  <div class="login-page" :class="{ 'is-electron': isElectron, 'is-mac': isMac }">
    <header class="login-chrome">
      <div v-if="showMacTraffic" class="mac-traffic" aria-hidden="true" />
      <div class="chrome-brand">
        <img src="@/assets/vue.svg" alt="" />
        <strong>Mino Studio</strong>
      </div>
      <div class="chrome-spacer" />
      <div v-if="showWinControls" class="win-controls">
        <button type="button" class="control-btn" title="最小化" @click="handleMinimize">
          <el-icon><Minus /></el-icon>
        </button>
        <button type="button" class="control-btn" title="最大化" @click="handleMaximize">
          <el-icon><FullScreen /></el-icon>
        </button>
        <button type="button" class="control-btn is-close" title="关闭" @click="handleClose">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </header>

    <div class="login-body">
      <section class="login-brand">
        <h1>开发工作台</h1>
      </section>

      <section class="login-panel">
        <div class="login-card">
          <header>
            <h2>{{ title }}</h2>
          </header>

          <div v-if="!serverOk" class="server-off">
            <p>无法连接服务器</p>
            <button type="button" class="ghost" @click="runBoot">重试</button>
          </div>

          <template v-else>
            <form class="login-form" @submit.prevent="submit">
              <label v-if="isRegister">
                名称
                <input v-model="name" type="text" autocomplete="name" placeholder="怎么称呼你（可选）" />
              </label>
              <label>
                邮箱
                <input v-model="email" type="email" autocomplete="email" placeholder="name@company.com" />
              </label>
              <label>
                密码
                <span class="pass-row">
                  <input
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    :autocomplete="isRegister ? 'new-password' : 'current-password'"
                    placeholder="至少 8 位"
                  />
                  <button type="button" class="eye" @click="showPassword = !showPassword">
                    {{ showPassword ? '隐藏' : '显示' }}
                  </button>
                </span>
              </label>
              <label v-if="isRegister">
                确认密码
                <input v-model="confirm" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="再输入一次" />
              </label>
              <button type="submit" class="submit" :disabled="loading">{{ submitLabel }}</button>
            </form>

            <p class="switch">
              <template v-if="isRegister">
                已有邮箱账号？
                <button type="button" @click="setMode('login')">去登录</button>
              </template>
              <template v-else>
                还没有账号？
                <button type="button" @click="setMode('register')">邮箱注册</button>
              </template>
            </p>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f6f7fb;
}
.login-chrome {
  flex-shrink: 0;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  background: #111827;
  color: #fff;
  -webkit-app-region: no-drag;
  user-select: none;
}
.mac-traffic {
  width: 78px;
  height: 100%;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  pointer-events: none;
}
.chrome-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.chrome-brand img { width: 22px; height: 22px; }
.chrome-brand strong { font-size: 14px; font-weight: 700; }
.chrome-spacer { flex: 1; -webkit-app-region: drag; height: 100%; }
.win-controls {
  display: flex;
  height: 100%;
  margin-right: -16px;
  -webkit-app-region: no-drag;
}
.control-btn {
  width: 46px;
  height: 52px;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.control-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.control-btn.is-close:hover { background: #e81123; color: #fff; }
.login-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(420px, 520px);
}
.login-brand {
  padding: 48px 64px;
  background:
    radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.16), transparent 42%),
    linear-gradient(180deg, #111827 0%, #1e1b4b 100%);
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: auto;
}
.login-brand h1 {
  margin: 0;
  font-size: 36px;
  line-height: 1.2;
  color: #fff;
  font-weight: 700;
  max-width: 420px;
}
.login-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  overflow: auto;
}
.login-card {
  width: 100%;
  max-width: 380px;
}
.login-card header h2 {
  margin: 0 0 22px;
  font-size: 26px;
  color: #111827;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.login-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.login-form input {
  height: 42px;
  width: 100%;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  color: #111827;
  background: #fff;
  box-sizing: border-box;
}
.login-form input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}
.pass-row {
  position: relative;
  display: block;
}
.pass-row input { padding-right: 52px; }
.eye {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
}
.submit {
  margin-top: 6px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: #4f46e5;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.submit:disabled { opacity: 0.6; cursor: default; }
.switch {
  margin: 18px 0 0;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}
.switch button {
  border: 0;
  background: transparent;
  color: #4f46e5;
  font-weight: 600;
  cursor: pointer;
}
.server-off {
  text-align: center;
  color: #b91c1c;
  font-size: 13px;
}
.ghost {
  margin-top: 8px;
  border: 1px solid #e3e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
}
@media (max-width: 860px) {
  .login-body { grid-template-columns: 1fr; }
  .login-brand { display: none; }
  .login-panel { padding: 24px 20px 32px; }
}
</style>
