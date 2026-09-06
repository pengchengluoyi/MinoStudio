/* Scout 分层更新决策的自测。`node scripts/check-scout-layers.cjs`

   这段逻辑决定用户点一次「更新」要下 90 KB 还是 439 MB，判错的代价不对称：
   多下了只是慢，少下了 Scout 起不来。所以每条分支都钉一遍。

   数字取自 MinoScout 0.1.8 darwin-arm64 的实测产物。
*/

const assert = require('node:assert')
const { planScoutUpdate, parseLayersTxt } = require('../electron/scoutLayers.cjs')

const COMBINED_BYTES = 460603758
const ITEM = {
  version: '0.1.8',
  os: 'darwin',
  arch: 'arm64',
  installer: 'zip',
  filename: 'MinoScout-0.1.8-darwin-arm64.zip',
  url: 'https://example.invalid/MinoScout-0.1.8-darwin-arm64.zip',
  sha256: 'a'.repeat(64),
  bytes: COMBINED_BYTES,
  layers: {
    runtime: {
      key: 'rt-1de1cd5bf6',
      url: 'https://example.invalid/MinoScout-runtime-rt-1de1cd5bf6-darwin-arm64.zip',
      sha256: 'b'.repeat(64),
      bytes: 86404575,
      filename: 'MinoScout-runtime-rt-1de1cd5bf6-darwin-arm64.zip',
    },
    app: {
      key: '0.1.8',
      url: 'https://example.invalid/MinoScout-app-0.1.8-darwin-arm64.zip',
      sha256: 'c'.repeat(64),
      bytes: 95000,
      filename: 'MinoScout-app-0.1.8-darwin-arm64.zip',
      requires_runtime: 'rt-1de1cd5bf6',
      requires_browser: 'bw-ba2c1624ab',
    },
    browser: {
      key: 'bw-ba2c1624ab',
      url: 'https://example.invalid/MinoScout-browser-bw-ba2c1624ab-darwin-arm64.zip',
      sha256: 'd'.repeat(64),
      bytes: 374150530,
      filename: 'MinoScout-browser-bw-ba2c1624ab-darwin-arm64.zip',
      optional: true,
    },
  },
}

const CURRENT = { runtime: 'rt-1de1cd5bf6', app: '0.1.8', browser: 'bw-ba2c1624ab' }
const layersOf = (plan) => plan.steps.map((s) => s.layer)

let n = 0
const it = (name, fn) => {
  fn()
  n += 1
  console.log(`  ✓ ${name}`)
}

console.log('\nparseLayersTxt')

it('解析出三层，跳过注释与空行', () => {
  const got = parseLayersTxt([
    '# 本 zip 携带的层',
    '',
    'app 0.1.8',
    'browser bw-ba2c1624ab',
    'runtime rt-1de1cd5bf6',
  ].join('\n'))
  assert.deepStrictEqual(got, CURRENT)
})

it('空内容 / 只有注释 → null（等同没装过）', () => {
  assert.strictEqual(parseLayersTxt(''), null)
  assert.strictEqual(parseLayersTxt('# nothing'), null)
  assert.strictEqual(parseLayersTxt(undefined), null)
})

it('忽略只有一列的坏行', () => {
  assert.deepStrictEqual(parseLayersTxt('app\nruntime rt-1'), { runtime: 'rt-1' })
})

console.log('\nplanScoutUpdate')

it('全部指纹一致 → up-to-date，一个字节都不下', () => {
  const plan = planScoutUpdate(ITEM, CURRENT)
  assert.strictEqual(plan.mode, 'up-to-date')
  assert.strictEqual(plan.bytes, 0)
  assert.deepStrictEqual(plan.steps, [])
})

it('只有 app 指纹变了 → 只下 app 层，约 95 KB', () => {
  const plan = planScoutUpdate(ITEM, { ...CURRENT, app: '0.1.7' })
  assert.strictEqual(plan.mode, 'layers')
  assert.deepStrictEqual(layersOf(plan), ['app'])
  assert.strictEqual(plan.bytes, 95000)
  // 这就是整件事的意义所在
  assert.ok(COMBINED_BYTES / plan.bytes > 4000, '增量应当比全量小三个数量级以上')
})

it('runtime 与 app 都变 → 两层都下，且 runtime 在前', () => {
  const plan = planScoutUpdate(ITEM, { ...CURRENT, app: '0.1.7', runtime: 'rt-old' })
  assert.strictEqual(plan.mode, 'layers')
  // 顺序不是好看，是正确性：app 的 requires_runtime 闸门要求 runtime 先落地
  assert.deepStrictEqual(layersOf(plan), ['runtime', 'app'])
  assert.strictEqual(plan.bytes, 86404575 + 95000)
})

it('浏览器 revision 变了 → 下 browser 层', () => {
  const plan = planScoutUpdate(ITEM, { ...CURRENT, browser: 'bw-older' })
  assert.deepStrictEqual(layersOf(plan), ['browser'])
})

it('没有安装记录 → 退回合并包', () => {
  for (const installed of [null, undefined, {}, { app: '0.1.7' }]) {
    const plan = planScoutUpdate(ITEM, installed)
    assert.strictEqual(plan.mode, 'combined', `installed=${JSON.stringify(installed)}`)
    assert.strictEqual(plan.steps.length, 1)
    assert.strictEqual(plan.steps[0].url, ITEM.url)
  }
})

it('manifest 没有 layers（旧版发布）→ 退回合并包，行为与分层前一致', () => {
  const { layers, ...old } = ITEM
  const plan = planScoutUpdate(old, CURRENT)
  assert.strictEqual(plan.mode, 'combined')
  assert.strictEqual(plan.steps[0].url, ITEM.url)
  assert.match(plan.reason, /旧版发布/)
})

it('三层全变 → 增量不小于合并包，退回合并包', () => {
  const plan = planScoutUpdate(ITEM, { runtime: 'rt-x', app: '0.0.1', browser: 'bw-x' })
  assert.strictEqual(plan.mode, 'combined')
  assert.match(plan.reason, /比合并包还大/)
})

it('合并包没有 bytes 时不做大小比较，仍走分层', () => {
  const noBytes = { ...ITEM, bytes: 0 }
  const plan = planScoutUpdate(noBytes, { ...CURRENT, app: '0.1.7' })
  assert.strictEqual(plan.mode, 'layers')
})

it('manifest 少了某一层就跳过它，不会拿 undefined 去下载', () => {
  const partial = { ...ITEM, layers: { app: ITEM.layers.app } }
  const plan = planScoutUpdate(partial, { ...CURRENT, app: '0.1.7', runtime: 'rt-old' })
  assert.deepStrictEqual(layersOf(plan), ['app'])
  assert.ok(plan.steps.every((s) => /^https?:/.test(s.url)))
})

console.log(`\nOK check-scout-layers — ${n} 项通过\n`)
