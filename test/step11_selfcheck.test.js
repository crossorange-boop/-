const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');

test('導入確認：セットアップ直後は「注意」（トリガー未登録・バックアップ未実行）、登録後は「問題なし」', () => {
  const { g } = bootstrap();
  let r = g.runSelfCheck();
  assert.strictEqual(r.overall, 'WARN');
  const by = Object.fromEntries(r.items.map((i) => [i.name, i.status]));
  assert.strictEqual(by['データベースのシート・列'], 'OK');
  assert.strictEqual(by['設定値'], 'OK');
  assert.strictEqual(by['定期処理（トリガー）'], 'WARN');
  assert.strictEqual(by['バックアップ'], 'WARN');
  g.setupTriggers();
  g.api('backup.runNow');
  r = g.api('system.selfCheck').data;
  assert.strictEqual(r.overall, 'OK', JSON.stringify(r.items));
  assert.ok(r.items.find((i) => i.name === '設定値').detail.includes('昼13時'));
});

test('導入確認：列の不足・壊れたルール・重複トリガーを「要対応」として検出し、データは変更しない', () => {
  const { g, ss, mocks } = bootstrap();
  g.setupTriggers();
  const sheet = ss().getSheetByName('Tasks');
  sheet.data[0] = sheet.data[0].filter((h) => h !== 'retry_count');
  g.Repository.get().withLock(() => g.Repository.get().update('AssignmentRules', 'RUL-SNS', { keyword_pattern: '(' }));
  mocks.globals.ScriptApp.newTrigger('jobQueueCheck').timeBased().everyMinutes(5).create();
  const before = JSON.stringify(ss().sheets.map((s) => s.data));
  const r = g.runSelfCheck();
  assert.strictEqual(r.overall, 'NG');
  const by = Object.fromEntries(r.items.map((i) => [i.name, i]));
  assert.match(by['データベースのシート・列'].detail, /Tasks（列不足：retry_count）/);
  assert.match(by['割り振りルール'].detail, /RUL-SNS/);
  assert.match(by['定期処理（トリガー）'].detail, /重複登録/);
  assert.strictEqual(JSON.stringify(ss().sheets.map((s) => s.data)), before, '点検でデータを変更しない');
});

test('導入確認：未セットアップなら初期設定の不足を知らせる／オーナー以外は実行不可', () => {
  const { g } = bootstrap({ setup: false, mockOptions: { properties: { OWNER_EMAIL: 'owner@example.com' } } });
  const r = g.runSelfCheck();
  assert.strictEqual(r.overall, 'NG');
  assert.match(r.items[0].detail, /setupSystem/);
  g.Session.getActiveUser = () => ({ getEmail: () => 'x@example.com' });
  assert.throws(() => g.runSelfCheck(), (e) => e.code === 'FORBIDDEN');
});
