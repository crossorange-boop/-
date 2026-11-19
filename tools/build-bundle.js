/**
 * ブラウザだけで導入するための「まとめファイル」を作る。
 *   node tools/build-bundle.js
 * 出力（dist/）：
 *   Code.gs          … src/*.gs を1つに連結（どの順でも動く設計のため、並び順は名前順）
 *   ui_index.html    … 画面一式（部品を埋め込んだ1ファイル）。エディタでは「ui/index」という名前で作成する
 *   appsscript.json  … マニフェスト（タイムゾーン・権限・公開範囲）
 * clasp を使う場合はこのファイルは不要（src/ をそのまま push する）。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

function renderTemplate(name) {
  const html = fs.readFileSync(path.join(SRC, name + '.html'), 'utf8');
  return html.replace(/<\?!=\s*include\('([^']+)'\)\s*\?>/g, (_, n) => renderTemplate(n));
}

function build() {
  let rev = '';
  try { rev = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (e) { rev = 'unknown'; }
  const version = (fs.readFileSync(path.join(SRC, '00_Config.gs'), 'utf8').match(/VERSION = '([^']+)'/) || [])[1] || '';
  fs.mkdirSync(DIST, { recursive: true });

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
  const header = [
    '/**',
    ' * AI統合管制システム v' + version + '（まとめファイル・自動生成：直接編集しないでください）',
    ' * 元のソース：src/*.gs（' + files.length + 'ファイル） 生成元コミット：' + rev,
    ' * 導入方法：docs/06_ブラウザだけで導入.md',
    ' */',
    ''
  ].join('\n');
  const code = header + files.map((f) => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(SRC, f), 'utf8').trim() + '\n').join('\n');
  fs.writeFileSync(path.join(DIST, 'Code.gs'), code);

  const html = renderTemplate('ui/index');
  if (/<\?/.test(html) || /\?>/.test(html)) throw new Error('ui_index.html にテンプレート記号が残っています');
  fs.writeFileSync(path.join(DIST, 'ui_index.html'), html);

  fs.copyFileSync(path.join(SRC, 'appsscript.json'), path.join(DIST, 'appsscript.json'));
  return { files: files.length, codeBytes: Buffer.byteLength(code), htmlBytes: Buffer.byteLength(html) };
}

if (require.main === module) console.log(build());
module.exports = { build, renderTemplate };
