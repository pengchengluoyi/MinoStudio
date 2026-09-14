import { defineConfig } from 'vite'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'

const require = createRequire(import.meta.url)

function electronBin() {
  return String(require('electron')).replace(/\r?\n/g, '').trim()
}

function killPidTree(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return
  // BSD pgrep requires a pattern; `pgrep -P <pid>` alone prints usage on macOS.
  const kids = spawnSync('pgrep', ['-P', String(pid), '.'], { encoding: 'utf8' })
  for (const id of (kids.stdout || '').match(/\d+/g) || []) {
    killPidTree(Number(id))
  }
  try { process.kill(pid) } catch { /* already gone */ }
}

async function startStudioElectron() {
  if (process.electronApp) {
    const prev = process.electronApp
    prev.removeAllListeners()
    await new Promise((resolve) => {
      prev.once('exit', resolve)
      killPidTree(prev.pid)
      setTimeout(resolve, 800)
    })
    process.electronApp = undefined
  }
  const stdio = process.platform === 'linux'
    ? ['inherit', 'inherit', 'inherit', 'ignore', 'ipc']
    : ['inherit', 'inherit', 'inherit', 'ipc']
  process.electronApp = spawn(electronBin(), ['.', '--no-sandbox'], { stdio })
  process.electronApp.once('exit', process.exit)
}

const DEFAULT_SCOUT_MANIFEST =
  'https://github.com/pengchengluoyi/MinoScout/releases/latest/download/manifest.json'

function detectScoutManifestUrl() {
  const explicit = String(process.env.VITE_SCOUT_MANIFEST_URL || '').trim()
  if (explicit) return explicit
  try {
    const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' })
    const url = String(remote.stdout || '').trim()
    const m = url.match(/github\.com[:/]([^/]+)\//)
    if (m) return `https://github.com/${m[1]}/MinoScout/releases/latest/download/manifest.json`
  } catch { /* local clone without a GitHub remote */ }
  return DEFAULT_SCOUT_MANIFEST
}

const NEXUS = (process.env.VITE_NEXUS_URL || 'http://127.0.0.1:10104').replace(/\/$/, '')
const SCOUT_MANIFEST = detectScoutManifestUrl()
if (SCOUT_MANIFEST && !process.env.VITE_SCOUT_MANIFEST_URL) {
  process.env.VITE_SCOUT_MANIFEST_URL = SCOUT_MANIFEST
}
const API_HTTP_PREFIXES = [
  '/auth', '/device', '/sys', '/static', '/settings', '/app-automation', '/webhooks',
  '/feishu', '/project', '/task', '/ability',
  '/schedule', '/packs', '/api', '/hitl', '/case-runner', '/app_graph', '/nav-fsm',
  '/workflow', '/workflow_run', '/releases', '/runtime',
  '/logs', '/file', '/get_api', '/upload',
]

function scoutManifestProxy() {
  const url = SCOUT_MANIFEST || DEFAULT_SCOUT_MANIFEST
  const handle = async (_req, res) => {
    try {
      const upstream = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'MinoStudio',
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
        redirect: 'follow',
      })
      const body = await upstream.text()
      res.statusCode = upstream.ok ? 200 : upstream.status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(body)
    } catch (e) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: e?.message || 'manifest proxy failed' }))
    }
  }
  return {
    name: 'scout-manifest-proxy',
    configureServer(server) {
      server.middlewares.use('/__scout_manifest', handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__scout_manifest', handle)
    },
  }
}

function apiProxy() {
  return {
    '/ws': { target: NEXUS, changeOrigin: true, ws: true },
    ...Object.fromEntries(API_HTTP_PREFIXES.map((prefix) => [prefix, { target: NEXUS, changeOrigin: true }])),
  }
}

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    'import.meta.env.VITE_MINO_CLIENT': JSON.stringify('studio'),
    'import.meta.env.VITE_SCOUT_MANIFEST_URL': JSON.stringify(
      SCOUT_MANIFEST || 'https://github.com/pengchengluoyi/MinoScout/releases/latest/download/manifest.json',
    ),
  },
  plugins: [
    scoutManifestProxy(),
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'webview',
        },
      },
    }),
    ...(mode === 'web'
      ? []
      : [
        electron([
          {
            entry: 'electron/main.js',
            onstart() {
              startStudioElectron()
            },
            vite: {
              define: {
                'process.env.VITE_NEXUS_URL': JSON.stringify(NEXUS),
              },
            },
          },
          {
            entry: 'electron/preload.js',
            onstart(options) {
              if (process.electronApp) options.reload()
              else startStudioElectron()
            },
          },
        ]),
      ]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: apiProxy(),
  },
  preview: {
    port: 4173,
    proxy: apiProxy(),
  },
}))
