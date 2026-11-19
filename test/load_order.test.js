/**
 * Apps Script はファイルを「プロジェクト内の並び順」で1つずつ読み込む（clasp の送信順はファイル名順とは限らない）。
 * どの順番で読み込まれても起動時にエラーにならず、正しく動くことを確認する。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadGas } = require('./gas-loader');
const { createGasMocks } = require('./gas-mocks');
const { seedDemo } = require('../tools/demo-data');

const files = fs.readdirSync(path.join(__dirname, '..', 'src')).filter((f) => f.endsWith('.gs')).sort();

test('各ファイルは単独で読み込める（読み込み時に他ファイルを参照しない）', () => {
  for (const f of files) assert.doesNotThrow(() => loadGas(createGasMocks().globals, [f]), f);
});

function shuffled(seed) {
  const a = files.slice();
  let x = seed;
  for (let i = a.length - 1; i > 0; i--) { x = (x * 9301 + 49297) % 233280; const j = Math.floor((x / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

for (const [name, order] of [['逆順', files.slice().reverse()], ['ランダム順1', shuffled(1)], ['ランダム順2', shuffled(42)]]) {
  test('読み込み順が「' + name + '」でもセットアップから自動振り分けまで動く', () => {
    const mocks = createGasMocks();
    const g = loadGas(mocks.globals, order);
    g.Setup.run();
    seedDemo(g);
    const r = g.QueueEngine.run();
    assert.ok(r.assigned >= 1);
    assert.strictEqual(g.api('dashboard.summary').ok, true);
    assert.strictEqual(g.setupTriggers().created.length, 6);
  });
}
