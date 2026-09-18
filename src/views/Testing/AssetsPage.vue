<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Hide, View } from '@element-plus/icons-vue'
import {
  getProjectAccounts,
  getProjectAccountPoolSchema,
  getProjectAccountPoolTemplates,
  pickProjectAccounts,
  createProjectAccount,
  deleteProjectAccount,
  patchProjectAccount,
} from '@/api/workReport'
import TestAccountLeaseBadge from '@/components/TestAccountLeaseBadge.vue'
import TestAccountStatus from '@/components/TestAccountStatus.vue'
import ProjectAccountPoolDialog from '@/components/ProjectAccountPoolDialog.vue'
import {
  accountHeadline,
  accountSubline,
  ensureFacetKeys,
  emptyFacetForm,
  extensionFieldDefs,
  facetsForSave,
  ACCOUNT_HEALTH_OPTIONS,
  leaseBadge,
  poolSummary,
  projectOnlyFieldDefs,
  statusDisplayRows,
  templateFieldDefsForRow,
  templateFieldsForTemplate,
} from '@/utils/testAccountFacets'
import '@/views/Settings/settings-ui.css'

defineOptions({ name: 'AssetsPage' })

const props = defineProps({
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  hideNav: { type: Boolean, default: false },
  section: { type: String, default: '' },
})

const TABS = [
  { id: 'accounts', label: '账号管理', desc: '号池状态与租约' },
  { id: 'trial', label: '试筛账号', desc: '模拟用例前置选号' },
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
const poolTemplates = ref([])
const poolFieldDefs = ref([])
const envFilter = ref('')
const leaseFilter = ref('')
const search = ref('')
const trialEnv = ref('')
const prompt = ref('')
const ranked = ref([])
const pickRequirements = ref(null)
const dialogOpen = ref(false)
const poolLocalOpen = ref(false)
const editingId = ref('')
const form = ref(emptyForm())
const pwdOpen = ref(new Set())

const LEASE_FILTERS = [
  { value: '', label: '全部占用' },
  { value: 'free', label: '仅可租用' },
  { value: 'leased', label: '跑批占用' },
  { value: 'locked', label: '手动占用' },
]

function emptyForm(env = '') {
  return {
    env: env || (environments.value[0]?.key || 'test'),
    display_name: '',
    phone: '',
    email: '',
    username: '',
    password: '',
    otp: '',
    health: 'available',
    facets: emptyFacetForm(poolFieldDefs.value.length ? poolFieldDefs.value : poolTemplates.value),
    note: '',
    locked: false,
  }
}

const envLabel = (key) => environments.value.find((e) => e.key === key)?.label || key || '未分环境'
const rowPassword = (row) => String(row?.password || '').trim()
const hasPassword = (row) => Boolean(rowPassword(row) || row?.has_password)
const hasOtp = (row) => Boolean(String(row?.otp || '').trim() || row?.has_otp)
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

const summary = computed(() => poolSummary(accounts.value))

const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return accounts.value.filter((r) => {
    if (envFilter.value && r.env !== envFilter.value) return false
    if (leaseFilter.value && leaseBadge(r).kind !== leaseFilter.value) return false
    if (!q) return true
    const blob = [accountHeadline(r), accountSubline(r), r.note].join(' ').toLowerCase()
    return blob.includes(q)
  })
})

const formFieldDefs = computed(() => extensionFieldDefs(poolFieldDefs.value))
const projectExtensionDefs = computed(() =>
  projectOnlyFieldDefs(poolFieldDefs.value, poolTemplates.value),
)
const chosen = computed(() => ranked.value[0] || null)
const statusRows = (row) => statusDisplayRows(row, templateFieldDefsForRow(row, poolFieldDefs.value))

const loadTemplates = async () => {
  if (!props.projectId) return
  try {
    const res = await getProjectAccountPoolTemplates(props.projectId)
    poolTemplates.value = res?.data?.templates || []
  } catch {
    poolTemplates.value = []
  }
}

const load = async () => {
  if (!props.projectId) return
  loading.value = true
  try {
    const [accRes, schemaRes] = await Promise.all([
      getProjectAccounts(props.projectId),
      getProjectAccountPoolSchema(props.projectId),
    ])
    accounts.value = accRes?.data?.accounts || []
    poolFieldDefs.value = schemaRes?.data?.pool_field_defs || []
    environments.value = accRes?.data?.environments || []
    if (envFilter.value && !environments.value.some((e) => e.key === envFilter.value)) envFilter.value = ''
    await loadTemplates()
  } catch (e) {
    ElMessage.error(e?.message || '加载账号失败')
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  if (!environments.value.length) {
    ElMessage.warning('先在「配置 → 环境配置」里添加环境')
    return
  }
  editingId.value = ''
  form.value = emptyForm(envFilter.value)
  dialogOpen.value = true
}

const openEdit = (row) => {
  editingId.value = row.id
  const defs = templateFieldDefsForRow(row, poolFieldDefs.value)
  form.value = {
    env: row.env || 'test',
    display_name: row.display_name || '',
    phone: row.phone || '',
    email: row.email || '',
    username: row.username || '',
    password: row.password || '',
    otp: row.otp || '',
    health: String(row.facets?.health || 'available'),
    facets: ensureFacetKeys(row.facets, defs),
    note: row.note || '',
    locked: Boolean(row.locked),
  }
  dialogOpen.value = true
}

const buildAccountPayload = () => {
  const payload = {
    env: form.value.env,
    display_name: form.value.display_name,
    phone: form.value.phone,
    email: form.value.email,
    username: form.value.username,
    otp: form.value.otp,
    facets: {
      ...facetsForSave(
        { ...form.value.facets, health: form.value.health || 'available' },
        formFieldDefs.value,
      ),
    },
    note: form.value.note,
    locked: form.value.locked,
  }
  if (form.value.password) payload.password = form.value.password
  return payload
}

const saveForm = async () => {
  if (!form.value.phone && !form.value.email && !form.value.username && !form.value.display_name) {
    ElMessage.warning('至少填展示名、手机号、邮箱或用户名之一')
    return
  }
  saving.value = true
  try {
    const payload = buildAccountPayload()
    const res = editingId.value
      ? await patchProjectAccount(props.projectId, editingId.value, payload)
      : await createProjectAccount(props.projectId, payload)
    await load()
    ElMessage.success('已保存')
    dialogOpen.value = false
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm(
      `删除「${envLabel(row.env)} ${accountHeadline(row)}」？`,
      '删除账号',
      { type: 'warning' },
    )
  } catch {
    return
  }
  saving.value = true
  try {
    await deleteProjectAccount(props.projectId, row.id)
    accounts.value = accounts.value.filter((x) => x.id !== row.id)
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '删除失败')
  } finally {
    saving.value = false
  }
}

const toggleLock = async (row) => {
  saving.value = true
  try {
    const res = await patchProjectAccount(props.projectId, row.id, { locked: !row.locked })
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '更新失败')
  } finally {
    saving.value = false
  }
}

const runTrial = async () => {
  if (!prompt.value.trim()) {
    ElMessage.warning('写一句用例前置；系统会自动识别业务模板（如购物车→电商）')
    return
  }
  picking.value = true
  ranked.value = []
  pickRequirements.value = null
  try {
    const res = await pickProjectAccounts(props.projectId, {
      prompt: prompt.value,
      env: trialEnv.value,
    })
    ranked.value = res?.data?.accounts || []
    pickRequirements.value = res?.data?.requirements || null
    if (!ranked.value.length) ElMessage.info('没有满足条件的账号')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '筛选失败')
  } finally {
    picking.value = false
  }
}

watch(() => props.projectId, () => {
  ranked.value = []
  load()
})
watch(
  () => props.section,
  (s) => {
    if (s === 'accounts' || s === '') load()
  },
)
onMounted(load)
onActivated(load)
</script>

<template>
  <div class="settings-panel assets-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">{{ pageTitle }}</h2>
        <p class="page-lead">
          账号共用已启用业务模板字段；可在本项目<strong>追加模板/字段</strong>，或在 Console 维护全局模板。跑批按用例推断模板从同一号池选号。
        </p>
      </div>
      <div class="settings-summary-pill">{{ projectName || '当前项目' }}</div>
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
      <section class="pool-stats">
        <div class="stat-card">
          <span class="stat-num">{{ summary.total }}</span>
          <span class="stat-label">号池总数</span>
        </div>
        <div class="stat-card stat-ok">
          <span class="stat-num">{{ summary.free }}</span>
          <span class="stat-label">可租用</span>
        </div>
        <div class="stat-card stat-run">
          <span class="stat-num">{{ summary.leased }}</span>
          <span class="stat-label">跑批占用</span>
        </div>
        <div class="stat-card stat-lock">
          <span class="stat-num">{{ summary.locked }}</span>
          <span class="stat-label">手动占用</span>
        </div>
        <div v-if="summary.unhealthy" class="stat-card stat-warn">
          <span class="stat-num">{{ summary.unhealthy }}</span>
          <span class="stat-label">待处理健康</span>
        </div>
      </section>

      <section class="settings-card pick-card">
        <div class="pick-row">
          <el-input v-model="search" clearable placeholder="搜索手机号、备注…" class="search-input" />
          <el-select v-model="envFilter" placeholder="环境" clearable style="width: 110px">
            <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
          </el-select>
          <el-select v-model="leaseFilter" placeholder="占用" clearable style="width: 120px">
            <el-option v-for="f in LEASE_FILTERS" :key="f.value || 'all'" :label="f.label" :value="f.value" />
          </el-select>
          <el-button @click="poolLocalOpen = true">项目模板与字段</el-button>
          <el-button type="primary" @click="openCreate">新增账号</el-button>
        </div>
        <p class="filter-hint">显示 {{ visibleRows.length }} / {{ accounts.length }} 条</p>
      </section>

      <section class="settings-table-card is-fill">
        <el-table :data="visibleRows" size="small" border stripe height="100%" row-key="id" empty-text="暂无账号">
          <el-table-column label="账号" min-width="168" fixed>
            <template #default="{ row }">
              <div class="id-cell">
                <strong class="id-main">{{ accountHeadline(row) }}</strong>
                <span class="env-pill">{{ envLabel(row.env) }}</span>
              </div>
              <div class="id-sub">{{ accountSubline(row) }}</div>
            </template>
          </el-table-column>

          <el-table-column label="模板状态" min-width="240">
            <template #default="{ row }">
              <TestAccountStatus :rows="statusRows(row)" />
            </template>
          </el-table-column>

          <el-table-column label="租约" width="200">
            <template #default="{ row }">
              <TestAccountLeaseBadge :badge="leaseBadge(row)" />
            </template>
          </el-table-column>

          <el-table-column label="凭证" width="100" align="center">
            <template #default="{ row }">
              <div class="cred-icons">
                <span :class="['cred-dot', hasPassword(row) ? 'on' : 'off']" title="密码">密</span>
                <span :class="['cred-dot', hasOtp(row) ? 'on' : 'off']" title="验证码">码</span>
              </div>
              <div v-if="hasPassword(row)" class="pwd-mini">
                <span>{{ pwdShown(row.id) ? rowPassword(row) : '••••••' }}</span>
                <button v-if="rowPassword(row)" type="button" class="pwd-eye" @click.stop="togglePwd(row.id)">
                  <el-icon><Hide v-if="pwdShown(row.id)" /><View v-else /></el-icon>
                </button>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="备注" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="muted">{{ row.note || '—' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
              <el-button link size="small" @click="toggleLock(row)">{{ row.locked ? '解锁' : '锁定' }}</el-button>
              <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>

    <template v-else>
      <section class="settings-card trial-hint">
        <p>输入与<strong>用例前置</strong>相同的一句话；系统会从文案推断业务模板并选号（无需手选模板）。</p>
      </section>
      <section class="settings-card pick-card">
        <div class="pick-row">
          <el-select v-model="trialEnv" placeholder="环境" clearable style="width: 110px">
            <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
          </el-select>
          <el-input v-model="prompt" placeholder="有购物车的老用户，已登录" @keyup.enter="runTrial" />
          <el-button type="primary" :loading="picking" @click="runTrial">试筛</el-button>
        </div>
        <p v-if="pickRequirements?.all?.length" class="filter-hint pick-req-hint">
          编译约束：
          <code>{{ (pickRequirements.all || []).map((c) => `${c.facet} ${c.op} ${c.value}`).join(' · ') }}</code>
        </p>
      </section>

      <section v-if="chosen" class="settings-card chosen-card">
        <div class="chosen-grid">
          <div>
            <div class="settings-kicker">系统将首选</div>
            <h3>{{ accountHeadline(chosen) }}</h3>
            <p>{{ envLabel(chosen.env) }}</p>
            <p class="hit">{{ chosen.reason || '—' }}</p>
            <p class="score-line">匹配分 <strong>{{ chosen.score ?? 0 }}</strong></p>
          </div>
          <div>
            <div class="preview-label">状态是否满足前置</div>
            <TestAccountStatus :rows="statusRows(chosen)" />
          </div>
          <div>
            <TestAccountLeaseBadge :badge="leaseBadge(chosen)" />
          </div>
        </div>
      </section>

      <section class="settings-table-card is-fill">
        <el-table :data="ranked" size="small" border stripe height="100%" row-key="id" empty-text="写前置后点试筛">
          <el-table-column label="#" width="48">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="账号" min-width="140">
            <template #default="{ row, $index }">
              {{ accountHeadline(row) }}
              <em v-if="$index === 0" class="pick-em">首选</em>
            </template>
          </el-table-column>
          <el-table-column label="状态" min-width="220">
            <template #default="{ row }">
              <TestAccountStatus :rows="statusRows(row)" compact />
            </template>
          </el-table-column>
          <el-table-column label="分" width="56" align="center">
            <template #default="{ row }">{{ row.score ?? 0 }}</template>
          </el-table-column>
          <el-table-column label="说明" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="hit">{{ row.reason || '—' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>

    <el-dialog
      v-model="dialogOpen"
      :title="editingId ? '编辑测试账号' : '新增测试账号'"
      class="mo-fit-dialog account-dialog account-dialog-70"
      align-center
      append-to-body
    >
      <el-form label-width="88px" class="dialog-form account-edit-form">
          <div class="form-section-title">基础信息</div>
          <el-form-item label="环境" required>
            <el-select v-model="form.env" style="width: 100%">
              <el-option v-for="e in environments" :key="e.key" :label="e.label" :value="e.key" />
            </el-select>
          </el-form-item>
          <el-form-item label="展示名">
            <el-input v-model="form.display_name" placeholder="列表主标题，可重复手机号" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="form.phone" placeholder="推荐填写" />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input v-model="form.username" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="form.email" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" show-password :placeholder="editingId ? '留空不改' : ''" />
          </el-form-item>
          <el-form-item label="验证码">
            <el-input v-model="form.otp" placeholder="固定 OTP" />
          </el-form-item>
          <el-form-item label="健康">
            <el-select v-model="form.health" style="width: 100%">
              <el-option
                v-for="o in ACCOUNT_HEALTH_OPTIONS"
                :key="o.value"
                :label="o.label"
                :value="o.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="form.note" type="textarea" :rows="2" />
          </el-form-item>

          <template v-for="t in poolTemplates" :key="t.id">
            <div class="form-section-title">
              {{ t.label }}
              <span v-if="t.description" class="form-section-hint">{{ t.description }}</span>
            </div>
            <div class="facet-form-grid">
              <el-form-item
                v-for="f in templateFieldsForTemplate(t.facet_extensions)"
                :key="`${t.id}-${f.key}`"
                :label="f.label"
              >
                <el-select v-model="form.facets[f.key]" style="width: 100%" clearable placeholder="默认（未设置）">
                  <el-option v-for="o in f.options" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </div>
          </template>
          <template v-if="projectExtensionDefs.length">
            <div class="form-section-title">项目扩展字段</div>
            <div class="facet-form-grid">
              <el-form-item v-for="f in projectExtensionDefs" :key="f.key" :label="f.label">
                <el-select v-model="form.facets[f.key]" style="width: 100%" clearable placeholder="默认（未设置）">
                  <el-option v-for="o in f.options" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </div>
          </template>
        </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <ProjectAccountPoolDialog
      v-model="poolLocalOpen"
      :project-id="projectId"
      @saved="load"
    />
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
.pool-stats,
.pick-card,
.chosen-card,
.trial-hint {
  flex-shrink: 0;
}
.page-lead {
  margin: 0;
  font-size: 13px;
  color: var(--mo-muted, #6b7280);
  line-height: 1.45;
}
.page-lead strong {
  color: var(--mo-text, #111827);
  font-weight: 700;
}
.pool-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.stat-card {
  flex: 1 1 100px;
  min-width: 88px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--mo-card, #fff);
  border: 1px solid var(--mo-border, #e5e7eb);
}
.stat-num {
  display: block;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--mo-text, #111827);
}
.stat-label {
  font-size: 12px;
  color: var(--mo-muted, #6b7280);
  font-weight: 600;
}
.stat-ok { background: #ecfdf5; border-color: #a7f3d0; }
.stat-ok .stat-num { color: #047857; }
.stat-run { background: #eef2ff; border-color: #c7d2fe; }
.stat-run .stat-num { color: #3730a3; }
.stat-lock { background: #fffbeb; border-color: #fde68a; }
.stat-lock .stat-num { color: #b45309; }
.stat-warn { background: #fef2f2; border-color: #fecaca; }
.stat-warn .stat-num { color: #b91c1c; }

.pick-card { margin-bottom: 8px; }
.pick-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.template-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
.strip-label {
  color: #6b7280;
  font-weight: 600;
}
.tpl-pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.search-input {
  flex: 1 1 200px;
  min-width: 160px;
  max-width: 320px;
}
.filter-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #9ca3af;
}
.trial-hint p {
  margin: 0;
  font-size: 13px;
  color: #4b5563;
}
.id-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.id-main {
  font-size: 14px;
  font-weight: 800;
  color: #111827;
}
.env-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #4b5563;
}
.id-sub {
  margin-top: 4px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.35;
}
.cred-icons {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-bottom: 4px;
}
.cred-dot {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  color: #9ca3af;
  background: #f9fafb;
}
.cred-dot.on {
  border-color: #a7f3d0;
  background: #ecfdf5;
  color: #047857;
}
.pwd-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  color: #6b7280;
}
.chosen-card { margin-bottom: 8px; }
.chosen-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 200px;
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) {
  .chosen-grid { grid-template-columns: 1fr; }
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
.preview-label,
.score-line {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}
.pick-em {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: #e0e7ff;
  color: #3730a3;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}
:deep(.account-dialog-70.mo-fit-dialog.el-dialog) {
  width: 70vw !important;
  max-width: 70vw !important;
  height: 70vh !important;
  max-height: 70vh !important;
  margin: 15vh auto !important;
}
:deep(.account-dialog-70.mo-fit-dialog .el-dialog__body) {
  max-height: none !important;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
.account-edit-form {
  padding-right: 4px;
}
.form-section-title {
  margin: 12px 0 8px;
  font-size: 13px;
  font-weight: 800;
  color: #111827;
}
.form-section-hint {
  font-weight: 600;
  color: #6b7280;
  font-size: 12px;
}
.facet-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}
.dialog-preview {
  padding: 12px;
  border-radius: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}
.preview-title {
  font-weight: 800;
  font-size: 13px;
  margin-bottom: 4px;
}
.preview-sub,
.preview-foot {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.45;
  margin: 0 0 10px;
}
.preview-card {
  padding: 10px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.preview-card strong {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
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
.row-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ext-empty {
  margin-bottom: 12px;
}
.ext-empty .el-input {
  margin-bottom: 8px;
}
.field-help {
  margin: 4px 0 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.35;
}
.ext-del {
  margin-left: 4px;
  vertical-align: baseline;
}
</style>
