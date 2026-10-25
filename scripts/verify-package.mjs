// 配布物の検証：DSH が要求する宣言と、同梱ファイル、ビルド成果物がコミット済みソースと一致するかを確認する。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const errors = []
const need = (cond, msg) => { if (!cond) errors.push(msg) }

need(pkg.dsh?.bundle?.patch && existsSync(pkg.dsh.bundle.patch), 'dsh.bundle.patch が無い、またはファイルが存在しない')
need(pkg.engines?.dsh, 'engines.dsh が未指定')
need(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform が web ではない')
for (const [key, target] of Object.entries(pkg.exports ?? {})) {
  need(typeof target === 'string' && existsSync(target), `exports["${key}"] の実体が無い: ${target}`)
}
const patch = readFileSync(pkg.dsh.bundle.patch, 'utf8')
need(patch.includes(`name: ${pkg.name}`), 'cordis.patch.yml のプラグイン名が package.json の name と違う')
const client = readFileSync('lib/client.js', 'utf8')
need(client.includes(`id: ${JSON.stringify(pkg.name)}`), 'lib/client.js のモジュール ID が package name と違う')
need(!/\bconsole\.log\b/.test(readFileSync('lib/index.js', 'utf8')), 'lib/index.js に console.log が残っている')

const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8', shell: true }))
const files = packed[0].files.map((f) => f.path)
for (const f of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'package.json', 'LICENSE']) {
  need(files.includes(f), `tarball に ${f} が含まれていない`)
}
need(!files.some((f) => f.startsWith('src/') || f.startsWith('tests/') || f.includes('node_modules')), 'tarball に src/tests/node_modules が混入している')

if (errors.length > 0) {
  console.error(errors.map((e) => `NG: ${e}`).join('\n'))
  process.exit(1)
}
console.log(`OK: ${pkg.name}@${pkg.version} (${files.length} files in tarball)`)
