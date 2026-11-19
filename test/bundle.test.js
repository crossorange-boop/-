/** ブラウザ導入用のまとめファイル（dist/）の検証 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBundle } = require('./gas-loader');
const { createGasMocks } = require('./gas-mocks');
const { renderTemplate } = require('../tools/build-bundle');
const { seedDemo } = require('../tools/demo-data');

const DIST = path.join(__dirname, '..', 'dist');
const SRC = path.join(__dirname, '..', 'src');

test('まとめファイルは最新のソースと一致している（作り直し忘れの検出）', () => {
  const code = fs.readFileSync(path.join(DIST, 'Code.gs'), 'utf8');
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.gs'))) {
    assert.ok(code.includes('// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(SRC, f), 'utf8').trim() + '\n'), f + ' が古いままです。node tools/build-bundle.js を実行してください');
  }
  assert.strictEqual(fs.readFileSync(path.join(DIST, 'ui_index.html'), 'utf8'), renderTemplate('ui/index'), 'ui_index.html が古いままです');
  assert.strictEqual(fs.readFileSync(path.join(DIST, 'appsscript.json'), 'utf8'), fs.readFileSync(path.join(SRC, 'appsscript.json'), 'utf8'));
});

test('まとめファイルだけでセットアップ・振り分け・定期処理・自己診断まで動く', () => {
  const mocks = createGasMocks();
  const g = loadBundle(mocks.globals);
  g.setupSystem();
  seedDemo(g);
  assert.ok(g.QueueEngine.run().assigned >= 1);
  assert.strictEqual(g.setupTriggers().created.length, 6);
  assert.strictEqual(g.api('dashboard.summary').ok, true);
  g.api('backup.runNow');
  assert.strictEqual(g.runSelfCheck().overall, 'OK');
});

test('画面ファイルにテンプレート記号が残っていない（HtmlService で誤解釈されない）', () => {
  const html = fs.readFileSync(path.join(DIST, 'ui_index.html'), 'utf8');
  assert.ok(!/<\?/.test(html) && !/\?>/.test(html));
  assert.ok(html.includes('App.start()'));
});
