import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
    failures.push(name)
  }
}

const loadUtil = () => {
  const file = path.join(root, 'src/utils/scoutNodes.js')
  const code = fs.readFileSync(file, 'utf8')
    .replaceAll('export function', 'function')
    .replaceAll('export const', 'const')
  const boxed = `${code}\n;({ parseScoutNodes, isLocalNode, nodeActionState, ownershipLabel, EMPTY_HINT })`
  return vm.runInNewContext(boxed, { console })
}

const u = loadUtil()

console.log('== empty / parse ==')
check('empty hint', u.EMPTY_HINT === '暂无节点', u.EMPTY_HINT)
check('parse empty', u.parseScoutNodes({ data: { nodes: [] } }).length === 0)
const rows = u.parseScoutNodes({
  data: {
    nodes: [
      { node_id: 'aabbccddeeff0011', scout_id: 'aabbccddeeff0011', status: 'online', studio_id: 's1', owner_user_id: 'u1' },
      { node_id: '1122334455667788', status: 'offline', hostname: 'lab' },
    ],
  },
})
check('parse two', rows.length === 2, String(rows.length))

console.log('== local IPC vs remote ==')
const localOnline = rows[0]
const remote = rows[1]
const localOffline = { ...rows[0], status: 'offline', online: false, alive: false }
check('is local', u.isLocalNode(localOnline, 'aabbccddeeff0011'))
check('not local', !u.isLocalNode(remote, 'aabbccddeeff0011'))
const localOn = u.nodeActionState(localOnline, { localScoutId: 'aabbccddeeff0011', isElectron: true, installed: true })
const localOff = u.nodeActionState(localOffline, { localScoutId: 'aabbccddeeff0011', isElectron: true, installed: true })
const notInstalled = u.nodeActionState(localOffline, { localScoutId: 'aabbccddeeff0011', isElectron: true, installed: false })
const calls = { start: 0, stop: 0, restart: 0 }
const electronAPI = {
  scoutStart: async () => { calls.start += 1; return { ok: true } },
  scoutStop: async () => { calls.stop += 1; return { ok: true } },
  scoutRestart: async () => { calls.restart += 1; return { ok: true } },
}
if (localOff.start.enabled) await electronAPI.scoutStart()
if (localOn.stop.enabled) await electronAPI.scoutStop()
if (localOn.restart.enabled) await electronAPI.scoutRestart()
check('local start/stop/restart via IPC', calls.start === 1 && calls.stop === 1 && calls.restart === 1, JSON.stringify(calls))
check('online local cannot start', localOn.start.enabled === false)
check('online local start hidden', localOn.start.visible === false)
check('online local stop shown', localOn.stop.visible === true)
check('online local restart shown', localOn.restart.visible === true)
check('offline local start shown', localOff.start.visible === true)
check('offline local stop hidden', localOff.stop.visible === false)
check('offline local restart hidden', localOff.restart.visible === false)
check('not installed local start hidden', notInstalled.start.visible === false)
const remoteActs = u.nodeActionState(remote, { localScoutId: 'aabbccddeeff0011', isElectron: true })
check('remote start hidden', remoteActs.start.visible === false)
check('remote start disabled', remoteActs.start.enabled === false)
check('remote start reason', remoteActs.start.reason.includes('无法远程启动'), remoteActs.start.reason)
check('remote stop disabled when offline', remoteActs.stop.enabled === false)
check('remote update hidden', remoteActs.update.visible === false)
check('remote update disabled', remoteActs.update.enabled === false)

console.log('== page + nav ==')
const page = fs.readFileSync(path.join(root, 'src/views/Settings/ScoutNodesPage.vue'), 'utf8')
check('page empty copy', page.includes('暂无节点'))
check('page calls scoutStart', page.includes('scoutStart'))
check('page calls scoutStop', page.includes('scoutStop'))
check('page calls scoutRestart', page.includes('scoutRestart'))
check('page one table', (page.match(/settings-table-card/g) || []).length === 1)
check('page expand devices', page.includes('type="expand"') && page.includes('row.devices'))
check('page start v-if visible', page.includes('rowActions(row).start.visible'))
check('page stop v-if visible', page.includes('rowActions(row).stop.visible'))
check('no leftover local card', !page.includes('本机启停') && !page.includes('nodeCount'))
const router = fs.readFileSync(path.join(root, 'src/router/index.js'), 'utf8')
check('route /settings/scout', router.includes("path: 'scout'") && router.includes('SettingsScout'))
const nav = fs.readFileSync(path.join(root, 'src/views/Settings/index.vue'), 'utf8')
check('nav label', nav.includes('Scout 节点') && nav.includes("id: 'scout'"))
const studioNav = fs.readFileSync(path.join(root, 'src/utils/studioNav.js'), 'utf8')
check('default nav has scout', studioNav.includes("'scout'"))

if (failures.length) {
  console.log(`\nFAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nALL OK — scout nodes page')
