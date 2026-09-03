import { getBaseUrl } from '@/utils/config'

const DATA_URL_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g
const STATIC_IMG_RE = /\/static\/[^\s"'\\>]+\.(?:png|jpe?g|webp|gif)/gi
const RAW_PNG_RE = /iVBORw0KGgo[A-Za-z0-9+/=]{80,}/g
const RAW_JPG_RE = /\/9j\/[A-Za-z0-9+/=]{80,}/g
const SECTION_RE = /^====\s*(.+?)\s*====\s*$/gm

export function parseMaybeJson(value) {
  if (value && typeof value === 'object') return value
  const s = String(value || '').trim().replace(/…+$/, '').replace(/\.\.\.$/, '')
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export function mediaSrc(src) {
  const s = String(src || '').trim().replace(/…+$/, '').replace(/\.\.\.$/, '')
  if (!s) return ''
  if (s.startsWith('data:image/')) return s
  if (s.startsWith('/static/')) return `${getBaseUrl()}${s}`
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  if (s.startsWith('iVBORw0KGgo') && s.length > 80) return `data:image/png;base64,${s}`
  if (s.startsWith('/9j/') && s.length > 80) return `data:image/jpeg;base64,${s}`
  return ''
}

const looksLikeImage = (value) => {
  const s = String(value || '').trim()
  return Boolean(
    mediaSrc(s)
    || s.startsWith('data:image/')
    || s.startsWith('/static/')
    || (s.startsWith('iVBORw0KGgo') && s.length > 80)
    || (s.startsWith('/9j/') && s.length > 80),
  )
}

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const isContentPart = (row) => (
  isPlainObject(row) && (row.type === 'text' || row.type === 'image_url' || row.image_url || ('text' in row && row.type))
)
const isMessage = (row) => isPlainObject(row) && row.role && ('content' in row || 'text' in row)

const decodeJsonString = (raw, quoteAt) => {
  let i = quoteAt + 1
  let out = ''
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\\') {
      const next = raw[i + 1]
      if (next == null) break
      if (next === 'u' && raw.length >= i + 6) {
        out += String.fromCharCode(Number.parseInt(raw.slice(i + 2, i + 6), 16))
        i += 6
        continue
      }
      const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', "'": "'", '\\': '\\', '/': '/' }
      out += map[next] ?? next
      i += 2
      continue
    }
    if (ch === '"') return out
    out += ch
    i += 1
  }
  return out
}

const extractJsonStringField = (text, keys = ['text', 'content']) => {
  const src = String(text || '')
  for (const key of keys) {
    const match = src.match(new RegExp(`"${key}"\\s*:\\s*"`))
    if (!match) continue
    const quoteAt = match.index + match[0].length - 1
    const out = decodeJsonString(src, quoteAt)
    if (out && out.length > 8) return out
  }
  return null
}

const recoverJsonArray = (text) => {
  const s = String(text || '').trim()
  if (!s.startsWith('[')) return null
  const items = []
  let depth = 0
  let start = -1
  let quote = ''
  let escape = false
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (quote) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === '\'') {
      quote = ch
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        try {
          items.push(JSON.parse(s.slice(start, i + 1)))
        } catch {
          /* skip */
        }
        start = -1
      }
    }
  }
  return items.length ? items : null
}

const pushImage = (images, seen, src) => {
  const resolved = mediaSrc(src)
  if (!resolved || seen.has(resolved)) return resolved
  seen.add(resolved)
  images.push(resolved)
  return resolved
}

const pretty = (value) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const stripImages = (value, images, seen) => {
  if (typeof value === 'string') {
    if (looksLikeImage(value)) {
      pushImage(images, seen, value)
      return `[图 ${images.length || 1}]`
    }
    if (!value.includes('data:image/') && !value.includes('iVBORw0KGgo') && !value.includes('/9j/')) {
      return value
    }
    return value
      .replace(DATA_URL_RE, (match) => {
        pushImage(images, seen, match.replace(/\s/g, ''))
        return `[图 ${images.length || 1}]`
      })
      .replace(RAW_PNG_RE, (match) => {
        pushImage(images, seen, `data:image/png;base64,${match}`)
        return `[图 ${images.length || 1}]`
      })
      .replace(RAW_JPG_RE, (match) => {
        pushImage(images, seen, `data:image/jpeg;base64,${match}`)
        return `[图 ${images.length || 1}]`
      })
  }
  if (Array.isArray(value)) return value.map((item) => stripImages(item, images, seen))
  if (isPlainObject(value)) {
    const out = {}
    Object.entries(value).forEach(([key, val]) => {
      out[key] = stripImages(val, images, seen)
    })
    return out
  }
  return value
}

const prettyJsonish = (text, images, seen) => {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const parsed = parseMaybeJson(raw)
  if (parsed && typeof parsed === 'object') return pretty(stripImages(parsed, images, seen))
  const recovered = recoverJsonArray(raw)
  if (recovered) {
    const body = pretty(stripImages(recovered, images, seen))
    return /…|\.\.\.$/.test(String(text || '').trim()) ? `${body}\n…` : body
  }
  return String(text || '')
}

const prettyEmbedded = (text, images, seen) => {
  const src = String(text || '')
  if (!src.trim()) return ''
  if (/^[\[{]/.test(src.trim())) return prettyJsonish(src, images, seen)
  if (!src.includes('====')) {
    const harvested = src
      .replace(DATA_URL_RE, (match) => {
        pushImage(images, seen, match.replace(/\s/g, ''))
        return `[图 ${images.length || 1}]`
      })
      .replace(RAW_PNG_RE, (match) => {
        pushImage(images, seen, `data:image/png;base64,${match}`)
        return `[图 ${images.length || 1}]`
      })
    return harvested
  }
  const matches = [...src.matchAll(new RegExp(SECTION_RE.source, 'gm'))]
  if (!matches.length) return src
  const chunks = []
  if (matches[0].index > 0) {
    const lead = src.slice(0, matches[0].index).trim()
    if (lead) chunks.push(lead)
  }
  matches.forEach((match, idx) => {
    const title = `==== ${match[1].trim()} ====`
    const start = match.index + match[0].length
    const end = idx + 1 < matches.length ? matches[idx + 1].index : src.length
    const body = src.slice(start, end).trim()
    chunks.push(title)
    if (body) chunks.push(prettyJsonish(body, images, seen) || body)
  })
  return chunks.join('\n')
}

const unwrapOnce = (value) => {
  if (typeof value === 'string') {
    const s = value.trim()
    const parsed = parseMaybeJson(s)
    if (parsed && typeof parsed === 'object') return parsed
    if (typeof parsed === 'string' && parsed !== s) return parsed
    if (s.startsWith('[') || s.startsWith('{')) {
      const field = extractJsonStringField(s, ['text', 'content', 'system_prompt', 'input'])
      if (field) return field
    }
    return value
  }
  if (Array.isArray(value) && value.length && value.every(isContentPart)) {
    return value
  }
  if (Array.isArray(value) && value.length && value.every(isMessage)) {
    return value
  }
  return value
}

const unwrapAll = (value) => {
  let cur = value
  for (let i = 0; i < 6; i += 1) {
    const next = unwrapOnce(cur)
    if (next === cur) return cur
    cur = next
  }
  return cur
}

const collectFromParts = (parts, images, seen) => {
  const texts = []
  parts.forEach((part) => {
    if (typeof part === 'string') {
      texts.push(prettyEmbedded(part, images, seen))
      return
    }
    if (part?.type === 'image_url' || part?.image_url) {
      const url = part?.image_url?.url || part?.image_url || part?.url || ''
      if (url) pushImage(images, seen, url)
      return
    }
    texts.push(prettyEmbedded(part?.text ?? part?.content ?? '', images, seen))
  })
  return texts.filter(Boolean).join('\n\n')
}

export function formatPayload(value, extraImages = []) {
  const images = []
  const seen = new Set()
  ;(Array.isArray(extraImages) ? extraImages : []).forEach((src) => pushImage(images, seen, src))
  if (value == null || value === '') {
    return { text: images.length ? '' : '（无）', images }
  }
  const core = unwrapAll(value)
  let text = ''
  if (Array.isArray(core) && core.length && core.every(isContentPart)) {
    text = collectFromParts(core, images, seen)
  } else if (Array.isArray(core) && core.length && core.every(isMessage)) {
    text = core.map((row) => {
      const body = unwrapAll(row.content ?? row.text)
      const inner = Array.isArray(body) && body.every(isContentPart)
        ? collectFromParts(body, images, seen)
        : prettyEmbedded(typeof body === 'string' ? body : pretty(stripImages(body, images, seen)), images, seen)
      return `${row.role}:\n${inner}`.trim()
    }).join('\n\n')
  } else if (typeof core === 'string') {
    text = prettyEmbedded(core, images, seen)
  } else if (typeof core === 'object') {
    text = pretty(stripImages(core, images, seen))
  } else {
    text = String(core)
  }
  if (!text && !images.length) text = '（无）'
  if (images.length && (text === '（无）' || text === '[图 1]' || text === '[图]')) text = ''
  return { text, images }
}

export function parsePayload(value, extraImages = []) {
  return formatPayload(value, extraImages)
}

export function payloadHasBody(row) {
  return Boolean(row?.text || row?.images?.length)
}

export function splitPayloadMedia(value, extra = []) {
  return formatPayload(value, extra)
}
