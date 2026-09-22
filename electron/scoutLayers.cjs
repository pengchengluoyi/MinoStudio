/* Scout 安装包的分层更新决策。与 MinoScout/mino_scout/install_plan.py 对齐。 */

const SCOUT_LAYERS = ['runtime', 'app', 'browser']
const BOOTSTRAP_LAYERS = ['runtime', 'app']

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

const normalizeDirs = (value) => {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((x) => String(x || '').trim()).filter(Boolean))].sort()
}

const refineBrowserSteps = (steps, layers, installed, browserDirs) => {
  if (!steps.length) return steps
  const names = new Set(steps.map((s) => s.layer))
  if (!names.has('browser')) return steps

  const manifestBrowser = layers?.browser
  const manifestDirs = normalizeDirs(manifestBrowser?.dirs)
  const localDirs = normalizeDirs(browserDirs)

  if (manifestDirs.length && localDirs.join('|') === manifestDirs.join('|')) {
    steps = steps.filter((s) => s.layer !== 'browser')
    names.delete('browser')
  }

  const stillBrowser = steps.some((s) => s.layer === 'browser')
  if (stillBrowser && !names.has('runtime')) {
    const manifestRuntime = layers?.runtime
    if (manifestRuntime?.url) {
      steps = [
        {
          layer: 'runtime',
          key: String(manifestRuntime.key || ''),
          url: String(manifestRuntime.url),
          sha256: String(manifestRuntime.sha256 || ''),
          filename: String(manifestRuntime.filename || ''),
          bytes: Number(manifestRuntime.bytes) || 0,
        },
        ...steps,
      ]
    }
  }
  return steps
}

const planScoutUpdate = (item = {}, installed = null, opts = {}) => {
  const browserDirs = normalizeDirs(opts.browserDirs)
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
    return { mode: 'layers', reason: '首次安装：runtime+app', bytes, steps }
  }

  let steps = []
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

  steps = refineBrowserSteps(steps, layers, installed, browserDirs)

  if (!steps.length) return { mode: 'up-to-date', reason: '所有层指纹一致', bytes: 0, steps: [] }

  const bytes = steps.reduce((n, s) => n + s.bytes, 0)
  if (combinedBytes && bytes >= combinedBytes) return combined('增量比合并包还大')
  return { mode: 'layers', reason: '', bytes, steps }
}

module.exports = { SCOUT_LAYERS, parseLayersTxt, planScoutUpdate, refineBrowserSteps, normalizeDirs }
