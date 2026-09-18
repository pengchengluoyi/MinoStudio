import { normalizeScoutVersion } from '@/utils/scoutRelease'

/** Shell 单引号字符串转义 */
export const shellSingleQuote = (value) => String(value ?? '').replace(/'/g, "'\\''")

/**
 * 从 GitHub manifest URL 解析 owner/repo（默认 MinoScout）。
 * @param {string} manifestUrl
 */
export const scoutGithubRepoFromManifest = (manifestUrl) => {
  const raw = String(manifestUrl || '').trim()
  const m = raw.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git|\/|$)/i)
  if (m) return `${m[1]}/${m[2]}`
  return 'pengchengluoyi/MinoScout'
}

/**
 * 拼远程执行机安装命令（curl GitHub bootstrap，参数走 bash -s --）。
 */
export const buildScoutInstallCommand = ({
  version,
  token,
  nexusUrl,
  studioId = '',
  manifestUrl = '',
}) => {
  const ver = normalizeScoutVersion(version)
  if (!ver) throw new Error('没有 Scout 发布版本')
  if (!token) throw new Error('没有安装凭证')

  const repo = scoutGithubRepoFromManifest(manifestUrl)
  const bootstrap = `https://github.com/${repo}/releases/download/v${ver}/bootstrap.sh`
  const nexus = String(nexusUrl || '').replace(/\/$/, '')

  const lines = [
    `curl -fsSL '${bootstrap}' | bash -s -- \\`,
    `  --token '${shellSingleQuote(token)}' \\`,
    `  --nexus-url '${shellSingleQuote(nexus)}' \\`,
    `  --release-version '${shellSingleQuote(ver)}' \\`,
    `  --studio-id '${shellSingleQuote(studioId)}'`,
  ]
  return lines.join('\n')
}

export async function copyTextToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  throw new Error('当前环境无法写入剪贴板')
}
