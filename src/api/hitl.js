import request from '@/utils/request'

// HITL 人工介入：回复 / 跳过 / 拉取待处理
// 与后端 server/routers/rHitl.py 对齐（prefix /hitl）

// 回复一个 HITL 请求
// data = { request_id, kind, answer, skipped }
// answer 按 kind：confirm=bool，acknowledge="ack"，input_text=str，
//                 choice_single=选项id，choice_multiple=[id...]，upload_image={path,mime}
export const replyHitl = (data) =>
  request({ url: '/hitl/reply', method: 'post', data })

// 跳过一个 HITL 请求（后端 /skip 复用 ReplyBody，会校验 kind，故需带上真实 kind）
export const skipHitl = (requestId, kind = 'confirm') =>
  request({ url: '/hitl/skip', method: 'post', data: { request_id: requestId, kind, answer: null, skipped: true } })

// 拉取当前所有待处理请求（页面重开/重连后补拉）
export const getPendingHitl = () =>
  request({ url: '/hitl/pending', method: 'get' })
