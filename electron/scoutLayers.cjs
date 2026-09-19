/* Scout 安装包的分层更新决策。纯函数，不碰 fs / electron —— 好单测。

   Scout 仓 docs/PACKAGING.md 是权威说明；这里只需要知道两件事：

   - 浏览器层占安装体积的 77%（实测 780 MB）且几乎从不变；Scout 自己的代码占 0.02%
     却每次发版都变。所以能只下变了的那层，改一行代码的更新就从 439 MB 变成 90 KB。
   - 安装顺序必须是 runtime → app → browser。app 层带 requires_runtime，Scout 的安装
     脚本会拿它跟本机已装的 runtime 指纹比对，runtime 没先落地就会被拒并退出非 0。
*/

const SCOUT_LAYERS = ['runtime', 'app', 'browser']
const BOOTSTRAP_LAYERS = ['runtime', 'app']

/** 解析 <bin>/layers.txt：`<层> <指纹>` 两列，`#` 开头是注释。没有内容返回 null。 */
const parseLayersTxt = (text) => {
  const out = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 2) out[parts[0]] = parts[1]
  }
  return Object.keys(out).length ? out : null
}

/**
 * 给定 manifest item 与本机已装指纹，决定要下哪些 zip。
 *
 * @returns {{mode: 'combined'|'layers'|'up-to-date', reason: string, bytes: number, steps: Array}}
 */
const planScoutUpdate = (item = {}, installed = null) => {
  const combinedBytes = Number(item.bytes) || 0
  const combined = (reason) => ({
    mode: 'combined',
    reason,
    bytes: combinedBytes,
    steps: [{
      layer: '',
      key: String(item.version || ''),
      url: String(item.url || ''),
      sha256: String(item.sha256 || ''),
      filename: String(item.filename || 'scout-installer'),
      bytes: combinedBytes,
    }],
  })

  const layers = item.layers && typeof item.layers === 'object' ? item.layers : null
  if (!layers) return combined('manifest 没有分层字段（旧版发布）')
  // 首次安装：只拉 runtime+app；Chromium 由 Scout 启动后后台装。
  if (!installed || !installed.runtime) {
    const steps = []
    for (const name of BOOTSTRAP_LAYERS) {
      const layer = layers[name]
      if (!layer || !layer.url) continue
      if (installed && installed[name] && installed[name] === layer.key) continue
      steps.push({
        layer: name,
        key: String(layer.key || ''),
        url: String(layer.url),
        sha256: String(layer.sha256 || ''),
        filename: String(layer.filename || ''),
        bytes: Number(layer.bytes) || 0,
      })
    }
    if (!steps.length) {
      return { mode: 'up-to-date', reason: 'runtime+app 已就绪', bytes: 0, steps: [] }
    }
    const bytes = steps.reduce((n, s) => n + s.bytes, 0)
    return {
      mode: 'layers',
      reason: '首次安装：runtime+app',
      bytes,
      steps,
    }
  }

  const steps = []
  for (const name of SCOUT_LAYERS) {
    const layer = layers[name]
    if (!layer || !layer.url) continue
    if (installed[name] && installed[name] === layer.key) continue
    steps.push({
      layer: name,
      key: String(layer.key || ''),
      url: String(layer.url),
      sha256: String(layer.sha256 || ''),
      filename: String(layer.filename || ''),
      bytes: Number(layer.bytes) || 0,
    })
  }
  if (!steps.length) return { mode: 'up-to-date', reason: '所有层指纹一致', bytes: 0, steps: [] }

  const bytes = steps.reduce((n, s) => n + s.bytes, 0)
  // 分层的意义就是省字节。真要下的比合并包还多就别绕远路了。
  if (combinedBytes && bytes >= combinedBytes) return combined('增量比合并包还大')
  return { mode: 'layers', reason: '', bytes, steps }
}

module.exports = { SCOUT_LAYERS, parseLayersTxt, planScoutUpdate }
