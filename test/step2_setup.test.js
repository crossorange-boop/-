const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');

test('初回セットアップ：11シート・初期データ・バックアップフォルダを作成', () => {
  const { g, mocks, report, ss } = bootstrap();
  assert.strictEqual(report.spreadsheetCreated, true);
  const names = ss().getSheets().map((s) => s.getName());
  assert.deepStrictEqual(names, Object.keys(g.Config.SHEETS)); // 既定の「シート1」は削除済み
  for (const [name, def] of Object.entries(g.Config.SHEETS)) {
    const header = ss().getSheetByName(name).getRange(1, 1, 1, def.columns.length).getValues()[0];
    assert.deepStrictEqual(header, Array.from(def.columns), name);
    assert.strictEqual(ss().getSheetByName(name).frozenRows, 1);
  }
  assert.strictEqual(report.agentsAdded.length, 4);
  assert.strictEqual(report.rulesAdded.length, 4);
  assert.ok(report.settingsAdded.includes('DAILY_SUMMARY_HOUR'));
  assert.ok(report.settingsAdded.includes('BACKUP_FOLDER_ID'));
  assert.ok(mocks.state.props.BACKUP_FOLDER_ID);
  assert.strictEqual(mocks.state.props.OWNER_EMAIL, 'owner@example.com');

  const repo = g.Repository.get();
  const muse = repo.findById('Agents', 'AGT-MUSE');
  assert.strictEqual(muse.agent_name, 'Muse');
  assert.strictEqual(muse.availability, 'AVAILABLE');
  assert.strictEqual(muse.enabled, 'TRUE');
  assert.strictEqual(repo.findById('Settings', 'DAILY_PLAN_HOUR').setting_value, '7');
  assert.strictEqual(repo.findAll('AuditLogs').filter((a) => a.action === 'SETUP').length, 1);
});

test('2回目のセットアップ：何も重複追加せず、編集済みデータを上書きしない', () => {
  const { g, mocks } = bootstrap();
  const repo = g.Repository.get();
  repo.withLock(() => {
    repo.update('Settings', 'DAILY_SUMMARY_HOUR', { setting_value: '16' });
    repo.update('Agents', 'AGT-CANVA', { availability: 'UNAVAILABLE', notes: '手動メモ' });
  });
  const ssCount = Object.keys(mocks.state.spreadsheets).length;

  const report2 = g.Setup.run();
  assert.strictEqual(report2.spreadsheetCreated, false);
  assert.strictEqual(Object.keys(mocks.state.spreadsheets).length, ssCount);
  assert.deepStrictEqual(Array.from(report2.sheetsCreated), []);
  assert.deepStrictEqual(Array.from(report2.settingsAdded), []);
  assert.deepStrictEqual(Array.from(report2.agentsAdded), []);
  assert.deepStrictEqual(Array.from(report2.rulesAdded), []);
  assert.strictEqual(repo.findById('Settings', 'DAILY_SUMMARY_HOUR').setting_value, '16');
  const canva = repo.findById('Agents', 'AGT-CANVA');
  assert.strictEqual(canva.availability, 'UNAVAILABLE');
  assert.strictEqual(canva.notes, '手動メモ');
  assert.strictEqual(repo.findAll('Agents').length, 4);
});

test('既存シートに列が不足していれば末尾に追加し、既存データ・独自列は保持する', () => {
  const { g, ss } = bootstrap();
  const sheet = ss().getSheetByName('Projects');
  // 旧バージョン想定：row_version 列が無く、利用者が独自列 memo を足していた
  sheet.data = [
    ['project_id', 'project_name', 'description', 'priority', 'start_date', 'deadline', 'status', 'created_at', 'updated_at', 'goal', 'is_deleted', 'memo'],
    ['PRJ-OLD', '既存案件', '', 'HIGH', '', '', 'ACTIVE', '', '', '', 'FALSE', '独自メモ']
  ];
  g.Repository.get().resetCache();
  const report = g.Setup.run();
  assert.deepStrictEqual(Array.from(report.columnsAdded.Projects), ['row_version']);
  assert.deepStrictEqual(Array.from(report.extraColumnsKept.Projects), ['memo']);
  assert.strictEqual(sheet.data[0][12], 'row_version');
  assert.strictEqual(sheet.data[1][11], '独自メモ');
  const p = g.Repository.get().findById('Projects', 'PRJ-OLD');
  assert.strictEqual(p.project_name, '既存案件');
  assert.strictEqual(p.memo, '独自メモ');
});

test('登録済みのDBが開けない場合は、新規作成せずに停止する（データ分裂防止）', () => {
  const { g, mocks } = bootstrap({ setup: false, mockOptions: { properties: { SPREADSHEET_ID: 'missing-id' } } });
  assert.throws(() => g.Setup.run(), /開けません/);
  assert.strictEqual(Object.keys(mocks.state.spreadsheets).length, 0);
  assert.strictEqual(mocks.state.props.SPREADSHEET_ID, 'missing-id');
});
