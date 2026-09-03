import { reactive, onUnmounted } from 'vue'

function revokeBlobUrl(url) {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }
}

/**
 * path -> display URL，带 blob revoke 与 LRU 上限，避免截图缓存无限增长。
 */
export function useBlobUrlCache(maxEntries = 48) {
  const map = reactive({})
  const order = []

  const touch = (path) => {
    const i = order.indexOf(path)
    if (i >= 0) order.splice(i, 1)
    order.push(path)
  }

  const evict = () => {
    while (order.length > maxEntries) {
      const old = order.shift()
      if (old && map[old]) {
        revokeBlobUrl(map[old])
        delete map[old]
      }
    }
  }

  const set = (path, url) => {
    if (!path || !url) return
    const prev = map[path]
    if (prev && prev !== url) revokeBlobUrl(prev)
    map[path] = url
    touch(path)
    evict()
  }

  const get = (path) => {
    if (!path) return ''
    if (map[path]) touch(path)
    return map[path] || ''
  }

  const has = (path) => Boolean(path && map[path])

  const clear = () => {
    Object.keys(map).forEach((k) => {
      revokeBlobUrl(map[k])
      delete map[k]
    })
    order.length = 0
  }

  onUnmounted(clear)

  return { map, set, get, has, clear }
}
