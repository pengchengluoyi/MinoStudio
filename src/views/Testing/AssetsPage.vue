<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Hide, View } from '@element-plus/icons-vue'
import { getProjectAccounts, pickProjectAccounts, saveProjectAccounts } from '@/api/workReport'
import { channelTitle } from '@/constants/envProfiles'
import '@/views/Settings/settings-ui.css'

defineOptions({ name: 'AssetsPage' })

const props = defineProps({
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
  section: { type: String, default: '' },
})

const TABS = [
  { id: 'accounts', label: '账号管理', desc: '标签 · 环境 · 租约' },
  { id: 'trial', label: '试筛账号', desc: '用场景句子试租号' },
]

const tab = ref(props.section === 'trial' ? 'trial' : 'accounts')
const pageTitle = computed(() => {
  if (!props.hideNav) return '测试资源'
  return tab.value === 'trial' ? '试筛账号' : '账号管理'
})
watch(() => props.section, (s) => {
  if (s === 'trial' || s === 'accounts') tab.value = s
})
const loading = ref(false)
const saving = ref(false)
const picking = ref(false)
const accounts = ref([])
const environments = ref([])
const channels = ref([])
const envFilter = ref('')
const surfaceFilter = ref('')
const trialEnv = ref('')
const trialSurface = ref('')
const prompt = ref('')
const ranked = ref([])
const dialogOpen = ref(false)
const editingId = ref('')
const form = ref(emptyForm())
const pwdOpen = ref(new Set())

function emptyForm(env = '') {
  return {
    env: env || (environments.value[0]?.key || 'test'),
    surface: surfaceFilter.value || channels.value.find((c) => !c.third_party && !c.alias)?.id || channels.value[0]?.id || '',
    phone: '',
    email: '',
    username: '',
    password: '',
    tags: [],
    note: '',
    locked: false,
  }
}

const envLabel = (key) => environments.value.find((e) => e.key === key)?.label || key || '未分环境'
const surfaceLabel = (id) => {
  const ch = channels.value.find((c) => c.id === id)
  return ch ? channelTitle(ch) : (id || '未选平台')
}
const cell = (v) => String(v || '').trim() || '—'
const rowPassword = (row) => String(row?.password || '').trim()
const hasPassword = (row) => Boolean(rowPassword(row) || row?.has_password)
const pwdShown = (id) => pwdOpen.value.has(id)
const togglePwd = (id) => {
  const next = new Set(pwdOpen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  pwdOpen.value = next
}
const maskedPwd = (row) => {
  const pwd = rowPassword(row)
  if (pwd) return '•'.repeat(Math.max(6, pwd.length))
  return row?.password_masked || '••••••••'
}
const visibleRows = computed(() => {
  return accounts.value.filter((r) => {
    if (envFilter.value && r.env !== envFilter.value) return false
    if (surfaceFilter.value && (r.surface || '') !== surfaceFilter.value) return false
    return true
  })
})
const chosen = computed(() => ranked.value[0] || null)

const load = async () => {
  if (!props.projectId) return
  loading.value = true
  try {
    const res = await getProjectAccounts(props.projectId)
    accounts.value = res?.data?.accounts || []
    environments.value = res?.data?.environments || []
    channels.value = res?.data?.channels || []
    if (envFilter.value && !environments.value.some((e) => e.key === envFilter.value)) envFilter.value = ''
    if (surfaceFilter.value && !channels.value.some((c) => c.id === surfaceFilter.value)) surfaceFilter.value = ''
  } catch (e) {
    ElMessage.error(e?.message || '加载账号失败')
  } finally {
    loading.value = false
  }
}

const persist = async (next) => {
  saving.value = true
  try {
    const res = await saveProjectAccounts(props.projectId, next)
    accounts.value = res?.data?.accounts || next
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const openCreate = () => {
  if (!channels.value.length) {
    ElMessage.warning('先在「配置 → 环境配置」里添加应用或三方平台')
    return
  }
  editingId.value = ''
  form.value = emptyForm(envFilter.value)
  dialogOpen.value = true
}

const openEdit = (row) => {
  editingId.value = row.id
  form.value = {
    env: row.env || 'test',
    surface: row.surface || '',
    phone: row.phone || '',
    email: row.email || '',
    username: row.username || '',
    password: row.password || '',
    tags: [...(row.tags || [])],
    note: row.note || '',
    locked: Boolean(row.locked),
  }
  dialogOpen.value = true
}

const saveForm = async () => {
  if (!form.value.surface) {
    ElMessage.warning('请选择这个账号登录的平台，避免租号时登错系统')
    return
  }
  if (!form.value.phone && !form.value.email && !form.value.username) {
    ElMessage.warning('至少填手机号、邮箱或用户名之一')
    return
  }
  const row = {
    id: editingId.value || undefined,
    ...form.value,
    tags: (form.value.tags || []).map((t) => String(t).trim()).filter(Boolean),
  }
  const next = editingId.value
    ? accounts.value.map((x) => (x.id === editingId.value ? { ...x, ...row } : x))
    : [...accounts.value, row]
  await persist(next)
  dialogOpen.value = false
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm(
      `删除「${envLabel(row.env)} ${row.phone || row.username || row.email || '未填'}」？`,
      '删除账号',
      { type: 'warning' },
    )
  } catch {
    return
  }
  await persist(accounts.value.filter((x) => x.id !== row.id))
}

const toggleLock = async (row) => {
  await persist(accounts.value.map((x) => (x.id === row.id ? { ...x, locked: !x.locked } : x)))
}

const runTrial = async () => {
  if (!prompt.value.trim()) {
    ElMessage.warning('写一句场景，例如「我要发造物秀」')
    return
  }
  picking.value = true
  try {
    const res = await pickProjectAccounts(props.projectId, {
      prompt: prompt.value,
      env: trialEnv.value,
      surface: trialSurface.value,
    })
    ranked.value = res?.data?.accounts || []
    if (!ranked.value.length) ElMessage.info('这个场景下没有匹配到账号')
  } catch (e) {
    ElMessage.error(e?.message || '筛选失败')
  } finally {
    picking.value = false
  }
}

watch(() => props.projectId, () => {
  ranked.value = []
  load()
})
onMounted(load)
</script>

<template>
  <div class="settings-panel assets-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ pageTitle }}</h2>
      </div>
      <div class="settings-summary-pill">{{ projectName || '当前项目' }} · {{ accounts.length }} 个账号</div>
    </header>

    <div v-if="!hideNav" class="settings-tabbar">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        class="settings-tab"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        <strong>{{ t.label }}</strong>
        <span>{{ t.desc }}</span>
      </button>
    </div>

    <template v-if="tab === 'accounts'">
      <section class="settings-card pick-card">
        <div class="pick-row">
          <el-select v-model="envFilter" placeholder="全部环境" clearable style="width: 140px">
            <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
          </el-select>
          <el-select v-model="surfaceFilter" placeholder="全部平台" clearable style="width: 180px">
            <el-option v-for="c in channels" :key="c.id" :label="channelTitle(c)" :value="c.id" />
          </el-select>
          <el-button type="primary" @click="openCreate">新增账号</el-button>
        </div>
      </section>

      <section class="settings-table-card is-fill">
        <el-table :data="visibleRows" size="small" border stripe height="100%" row-key="id" empty-text="暂无数据">
          <el-table-column label="环境" width="100">
            <template #default="{ row }">{{ envLabel(row.env) }}</template>
          </el-table-column>
          <el-table-column label="平台" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ surfaceLabel(row.surface) }}</template>
          </el-table-column>
          <el-table-column label="用户名" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              {{ cell(row.username) }}
              <em v-if="row.locked" class="lock-tag">占用</em>
              <em v-if="row.lease?.run_id" class="lock-tag is-pick">租用</em>
            </template>
          </el-table-column>
          <el-table-column label="手机号" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ cell(row.phone) }}</template>
          </el-table-column>
          <el-table-column label="邮箱" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ cell(row.email) }}</template>
          </el-table-column>
          <el-table-column label="密码" min-width="150">
            <template #default="{ row }">
              <span v-if="!hasPassword(row)" class="muted">—</span>
              <span v-else class="pwd-cell">
                <span class="pwd-text">{{ pwdShown(row.id) ? rowPassword(row) || maskedPwd(row) : maskedPwd(row) }}</span>
                <button
                  v-if="rowPassword(row)"
                  type="button"
                  class="pwd-eye"
                  :title="pwdShown(row.id) ? '隐藏密码' : '显示密码'"
                  @click.stop="togglePwd(row.id)"
                >
                  <el-icon><Hide v-if="pwdShown(row.id)" /><View v-else /></el-icon>
                </button>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="标签" min-width="180">
            <template #default="{ row }">
              <span v-if="!(row.tags || []).length" class="muted">—</span>
              <el-tag v-for="t in row.tags || []" :key="t" size="small" class="tag-chip">{{ t }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="168" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
              <el-button link size="small" @click="toggleLock(row)">{{ row.locked ? '释放' : '占用' }}</el-button>
              <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>

    <template v-else>
      <section class="settings-card pick-card">
        <div class="pick-row">
          <el-select v-model="trialEnv" placeholder="不限环境" clearable style="width: 140px">
            <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
          </el-select>
          <el-select v-model="trialSurface" placeholder="不限平台" clearable style="width: 180px">
            <el-option v-for="c in channels" :key="c.id" :label="channelTitle(c)" :value="c.id" />
          </el-select>
          <el-input
            v-model="prompt"
            placeholder="例如：我要发造物秀"
            @keyup.enter="runTrial"
          />
          <el-button type="primary" :loading="picking" @click="runTrial">试租号</el-button>
        </div>
      </section>

      <section v-if="chosen" class="settings-card chosen-card">
        <div class="settings-kicker">首选</div>
        <h3>{{ chosen.phone || chosen.username || chosen.email || '未填号码' }}</h3>
        <p>{{ envLabel(chosen.env) }} · {{ surfaceLabel(chosen.surface) || chosen.surface_label || '未选平台' }}</p>
        <p class="hit">{{ chosen.reason || '—' }} · 分 {{ chosen.score ?? 0 }}</p>
        <div class="tag-row">
          <el-tag v-for="t in chosen.tags || []" :key="t" size="small" class="tag-chip">{{ t }}</el-tag>
        </div>
      </section>

      <section class="settings-table-card is-fill">
        <el-table :data="ranked" size="small" border stripe height="100%" row-key="id" empty-text="还没有试过。写一句场景再点试租号。">
          <el-table-column label="#" width="52">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="环境" width="88">
            <template #default="{ row }">{{ envLabel(row.env) }}</template>
          </el-table-column>
          <el-table-column label="平台" width="120" show-overflow-tooltip>
            <template #default="{ row }">{{ row.surface_label || surfaceLabel(row.surface) }}</template>
          </el-table-column>
          <el-table-column label="用户名" min-width="120" show-overflow-tooltip>
            <template #default="{ row, $index }">
              {{ cell(row.username) }}
              <em v-if="$index === 0" class="lock-tag is-pick">首选</em>
              <em v-if="row.locked" class="lock-tag">占用</em>
            </template>
          </el-table-column>
          <el-table-column label="手机号" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ cell(row.phone) }}</template>
          </el-table-column>
          <el-table-column label="邮箱" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ cell(row.email) }}</template>
          </el-table-column>
          <el-table-column label="分" width="64">
            <template #default="{ row }">{{ row.score ?? 0 }}</template>
          </el-table-column>
          <el-table-column label="为什么" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="hit">{{ row.reason || '—' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>

    <el-dialog v-model="dialogOpen" :title="editingId ? '编辑账号' : '新增账号'" width="560px" class="mo-fit-dialog" align-center append-to-body>
      <el-form label-width="92px">
        <el-form-item label="环境">
          <el-select v-model="form.env" style="width: 100%">
            <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台" required>
          <el-select v-model="form.surface" placeholder="这个号登录哪一端" style="width: 100%">
            <el-option v-for="c in channels" :key="c.id" :label="channelTitle(c)" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="可空" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="可空" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="可空" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password :placeholder="editingId ? '留空则保持原密码' : '可空'" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="尽量 5 字内，如：已注册、已登录、未领礼"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="业务状态。固定口令可写「验证码为888888」" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.assets-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.assets-page > .settings-page-header,
.assets-page > .settings-tabbar,
.pick-card,
.chosen-card,
.settings-info-card {
  flex-shrink: 0;
}
.pick-card {
  margin-bottom: 8px;
}
.pick-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.chosen-card {
  margin-bottom: 8px;
}
.chosen-card h3 {
  margin: 4px 0 6px;
  font-size: 18px;
}
.chosen-card p {
  margin: 0 0 6px;
  color: #4b5563;
  font-size: 13px;
}
.tag-chip {
  margin: 0 4px 4px 0;
}
.lock-tag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}
.lock-tag.is-pick {
  background: #e0e7ff;
  color: #3730a3;
}
.pwd-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}
.pwd-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}
.pwd-eye {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}
.pwd-eye:hover {
  background: #eef2ff;
  color: #4f46e5;
}
.muted { color: #9ca3af; }
.hit { color: #4f46e5; font-weight: 650; }
</style>
