import { ref, watch } from 'vue'
import {
  deleteNavFsm,
  deleteNavFsmDraft,
  getNavFsm,
  getNavFsmDraft,
  getNavFsmTemplate,
  listNavCalibrations,
  promoteNavFsmDraft,
  putNavFsm,
  putNavFsmDraft,
} from '@/api/navFsm'
import { buildClientTemplate, pendingMarks } from '@/utils/navFsmGraph'

export function useNavFsm(appIdRef) {
  const loading = ref(false)
  const saving = ref(false)
  const doc = ref(null)
  const runtimeReady = ref(false)
  const runtimeReason = ref('')
  const runtimeReasonHuman = ref('')
  const pendingMarks = ref([])
  const hasConfig = ref(false)
  const draftPending = ref([])
  const hasDraft = ref(false)
  const calibrations = ref([])

  const load = async () => {
    const appId = appIdRef.value
    if (!appId) return
    loading.value = true
    try {
      const res = await getNavFsm(appId)
      const row = res?.data || {}
      doc.value = row
      runtimeReady.value = Boolean(row.runtime_ready)
      runtimeReason.value = String(row.runtime_reason || '')
      runtimeReasonHuman.value = String(row.runtime_reason_human || row.runtime_reason || '')
      hasConfig.value = true
    } catch (e) {
      if (e?.response?.status === 404) {
        doc.value = null
        runtimeReady.value = false
        runtimeReason.value = '尚未配置导航图'
        runtimeReasonHuman.value = '还没有发布导航配置。跑探索或用例采集后可在架构页查看屏面图。'
        hasConfig.value = false
      } else {
        throw e
      }
    } finally {
      loading.value = false
    }
  }

  const loadTemplate = async (projectId = '') => {
    const appId = appIdRef.value
    const res = await getNavFsmTemplate(appId)
    const body = res?.data?.doc || {}
    if (projectId && !body.project_id) body.project_id = projectId
    return { doc: body, pending: res?.data?.pending || [] }
  }

  const loadDraft = async () => {
    const appId = appIdRef.value
    const res = await getNavFsmDraft(appId)
    hasDraft.value = true
    draftPending.value = res?.data?.pending || []
    return {
      doc: res?.data?.doc || {},
      pending: draftPending.value,
    }
  }

  /** 无正式配置且无草稿时，生成骨架草稿（Nexus 模板 API 失败则用客户端兜底）。 */
  const ensureBootstrap = async (projectId = '') => {
    const appId = appIdRef.value
    if (!appId) return { status: 'skip', doc: null }
    if (hasConfig.value) return { status: 'config_exists', doc: doc.value }

    try {
      const existing = await loadDraft()
      return { status: 'draft_exists', doc: existing.doc, pending: existing.pending }
    } catch (e) {
      if (e?.response?.status !== 404) throw e
    }

    let body
    let pending = []
    try {
      const tpl = await loadTemplate(projectId)
      body = tpl.doc
      pending = tpl.pending || []
    } catch {
      body = buildClientTemplate(appId, projectId)
      pending = pendingMarks(body)
    }

    if (projectId && !body.project_id) body.project_id = projectId
    if (!body.app_id) body.app_id = appId
    await saveDraft(body)
    hasDraft.value = true
    draftPending.value = pending
    return { status: 'created', doc: body, pending }
  }

  const saveDraft = async (body) => {
    const appId = appIdRef.value
    saving.value = true
    try {
      const res = await putNavFsmDraft(appId, body)
      draftPending.value = res?.data?.pending || []
      return res?.data
    } finally {
      saving.value = false
    }
  }

  const promoteDraft = async () => {
    const appId = appIdRef.value
    saving.value = true
    try {
      const res = await promoteNavFsmDraft(appId)
      await load()
      return res?.data
    } finally {
      saving.value = false
    }
  }

  const removeDraft = async () => {
    const appId = appIdRef.value
    await deleteNavFsmDraft(appId)
    draftPending.value = []
    hasDraft.value = false
  }

  const save = async (body) => {
    const appId = appIdRef.value
    saving.value = true
    try {
      const res = await putNavFsm(appId, body)
      doc.value = res?.data || body
      runtimeReady.value = true
      runtimeReason.value = ''
      hasConfig.value = true
      return res?.data
    } finally {
      saving.value = false
    }
  }

  const remove = async () => {
    const appId = appIdRef.value
    await deleteNavFsm(appId)
    doc.value = null
    hasConfig.value = false
    runtimeReady.value = false
    runtimeReason.value = '尚未配置导航图'
  }

  const loadCalibrations = async () => {
    const appId = appIdRef.value
    const res = await listNavCalibrations(appId)
    calibrations.value = res?.data || []
  }

  watch(appIdRef, () => {
    load().catch(() => {})
    loadCalibrations().catch(() => {})
  }, { immediate: true })

  return {
    loading,
    saving,
    doc,
    runtimeReady,
    runtimeReason,
    runtimeReasonHuman,
    pendingMarks,
    hasConfig,
    draftPending,
    hasDraft,
    calibrations,
    load,
    loadTemplate,
    loadDraft,
    ensureBootstrap,
    saveDraft,
    promoteDraft,
    removeDraft,
    save,
    remove,
    loadCalibrations,
  }
}
