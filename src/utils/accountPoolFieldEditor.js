/** 号池模板字段编辑：Console / Studio 共用逻辑 */

export const FACET_DATA_KIND_STATIC = 'static'
export const FACET_DATA_KIND_DYNAMIC = 'dynamic'

export function cloneFields(rows) {
  return JSON.parse(JSON.stringify(rows || []))
}

export function newOption(value = 'unknown', label = '未设置') {
  return { value, label }
}

export const PRESET_YES_NO = [
  newOption('unknown', '未设置'),
  newOption('yes', '是'),
  newOption('no', '否'),
]

export const PRESET_FLOW_1234 = [
  newOption('unknown', '未设置'),
  newOption('1', '状态 1'),
  newOption('2', '状态 2'),
  newOption('3', '状态 3'),
  newOption('4', '状态 4'),
]

export const DYNAMIC_FLOW_PRESETS = {
  register_flow: [
    newOption('unknown', '未设置'),
    newOption('not_started', '未开始'),
    newOption('phone_entered', '已填手机号'),
    newOption('sms_ok', '短信验证通过'),
    newOption('registered', '注册完成'),
  ],
  login_flow: [
    newOption('unknown', '未设置'),
    newOption('logged_out', '未登录'),
    newOption('credential_ok', '凭证已提交'),
    newOption('otp_ok', '验证码通过'),
    newOption('logged_in', '已登录'),
  ],
  audit_flow: [
    newOption('unknown', '未设置'),
    newOption('none', '无'),
    newOption('submitted', '已提交'),
    newOption('reviewing', '审核中'),
    newOption('approved', '已通过'),
    newOption('rejected', '已拒绝'),
  ],
}

export function newField(preset = 'yesNo') {
  let options = cloneFields(PRESET_YES_NO)
  let data_kind = FACET_DATA_KIND_STATIC
  if (preset === 'flow1234') {
    options = cloneFields(PRESET_FLOW_1234)
    data_kind = FACET_DATA_KIND_STATIC
  } else if (preset === 'dynamicFlow') {
    options = cloneFields(DYNAMIC_FLOW_PRESETS.audit_flow)
    data_kind = FACET_DATA_KIND_DYNAMIC
  } else if (DYNAMIC_FLOW_PRESETS[preset]) {
    options = cloneFields(DYNAMIC_FLOW_PRESETS[preset])
    data_kind = FACET_DATA_KIND_DYNAMIC
  }
  const key =
    preset === 'dynamicFlow'
      ? `flow_${Date.now().toString(36).slice(-6)}`
      : preset in DYNAMIC_FLOW_PRESETS
        ? preset
        : `field_${Date.now().toString(36).slice(-6)}`
  const label =
    preset === 'register_flow'
      ? '注册流程'
      : preset === 'login_flow'
        ? '登录流程'
        : preset === 'audit_flow'
          ? '审核流程'
          : preset === 'dynamicFlow'
            ? '自定义流程'
            : '新字段'
  return {
    key,
    label,
    options,
    data_kind,
  }
}

export function appendFlowOptions(field) {
  if (!field.options) field.options = []
  const have = new Set(field.options.map((o) => String(o.value || '')))
  for (const o of PRESET_FLOW_1234) {
    if (o.value === 'unknown') continue
    if (!have.has(o.value)) field.options.push({ ...o })
  }
}

export function addOption(field, value = '', label = '选项') {
  if (!field.options) field.options = []
  const v = value || `opt_${field.options.length + 1}`
  field.options.push({ value: v, label })
}

export function fieldKindPrefix(field) {
  return String(field?.data_kind || FACET_DATA_KIND_STATIC) === FACET_DATA_KIND_DYNAMIC ? '流转·' : '侧写·'
}

export function fieldSummary(field) {
  const opts = (field.options || []).filter((o) => String(o.value || '') !== 'unknown')
  if (!opts.length) return `${fieldKindPrefix(field)}${field.label || field.key || '—'}`
  const tail = opts
    .slice(0, 4)
    .map((o) => o.label || o.value)
    .join(' / ')
  return `${fieldKindPrefix(field)}${field.label || field.key}（${tail}${opts.length > 4 ? '…' : ''}）`
}

export const ACCOUNT_LEVEL_FIELD_KEYS = new Set(['lifecycle', 'session', 'health'])

export function listFieldSummaries(fields) {
  return (fields || [])
    .filter((f) => !ACCOUNT_LEVEL_FIELD_KEYS.has(String(f?.key || '')))
    .map(fieldSummary)
}

export function partitionFieldsByKind(fields) {
  const staticFields = []
  const dynamicFields = []
  for (const f of fields || []) {
    if (ACCOUNT_LEVEL_FIELD_KEYS.has(String(f?.key || ''))) continue
    if (String(f?.data_kind || FACET_DATA_KIND_STATIC) === FACET_DATA_KIND_DYNAMIC) {
      dynamicFields.push(f)
    } else {
      staticFields.push(f)
    }
  }
  return { staticFields, dynamicFields }
}
