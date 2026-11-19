const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');

test('insert：ID・作成日時・版数・削除フラグを補完し、未定義の項目は無視', () => {
  const { g, ss } = bootstrap();
  const repo = g.Repository.get();
  const p = repo.withLock(() => repo.insert('Projects', { project_name: 'A案件', priority: 'HIGH', unknown_field: 'x' }));
  assert.match(p.project_id, /^PRJ-\d{14}-/);
  assert.match(p.created_at, /\+09:00$/);
  assert.strictEqual(p.row_version, '1');
  assert.strictEqual(p.is_deleted, 'FALSE');
  assert.strictEqual(p.unknown_field, undefined);
  assert.strictEqual(ss().getSheetByName('Projects').getLastRow(), 2);
});

test('insert：ID重複はエラー', () => {
  const { g } = bootstrap();
  const repo = g.Repository.get();
  assert.throws(() => repo.withLock(() => repo.insert('Agents', { agent_id: 'AGT-MUSE', agent_name: 'x' })), /既に存在/);
});

test('update：変更・版数加算・ID は変更不可・楽観ロック', () => {
  const { g } = bootstrap();
  const repo = g.Repository.get();
  const p = repo.withLock(() => repo.insert('Projects', { project_name: 'A' }));
  const r = repo.withLock(() => repo.update('Projects', p.project_id, { project_name: 'B', project_id: 'HACK' }, { expectedVersion: '1' }));
  assert.strictEqual(r.before.project_name, 'A');
  assert.strictEqual(r.after.project_name, 'B');
  assert.strictEqual(r.after.project_id, p.project_id);
  assert.strictEqual(r.after.row_version, '2');
  assert.throws(() => repo.withLock(() => repo.update('Projects', p.project_id, { project_name: 'C' }, { expectedVersion: '1' })),
    (e) => e.code === 'CONFLICT');
  // 変更が無ければ版数は増えない
  const same = repo.withLock(() => repo.update('Projects', p.project_id, { project_name: 'B' }));
  assert.strictEqual(same.after.row_version, '2');
});

test('update：存在しないIDは NOT_FOUND', () => {
  const { g } = bootstrap();
  const repo = g.Repository.get();
  assert.throws(() => repo.withLock(() => repo.update('Projects', 'PRJ-NONE', { project_name: 'x' })), (e) => e.code === 'NOT_FOUND');
});

test('softDelete：行は残り、通常の検索から除外される／削除フラグの無い表は削除不可', () => {
  const { g, ss } = bootstrap();
  const repo = g.Repository.get();
  const p = repo.withLock(() => repo.insert('Projects', { project_name: 'A' }));
  repo.withLock(() => repo.softDelete('Projects', p.project_id));
  assert.strictEqual(repo.findById('Projects', p.project_id), null);
  assert.strictEqual(repo.findById('Projects', p.project_id, { includeDeleted: true }).is_deleted, 'TRUE');
  assert.strictEqual(repo.findAll('Projects').length, 0);
  assert.strictEqual(ss().getSheetByName('Projects').getLastRow(), 2);
  assert.throws(() => repo.withLock(() => repo.softDelete('ExecutionLogs', 'x')), (e) => e.code === 'INVALID_STATE');
});

test('updateMany：複数行の変更を1回の書き込みにまとめる', () => {
  const { g, ss } = bootstrap();
  const repo = g.Repository.get();
  const ids = repo.withLock(() => [1, 2, 3].map((n) => repo.insert('Tasks', { task_name: 'T' + n, status: 'BACKLOG' }).task_id));
  const sheet = ss().getSheetByName('Tasks');
  const before = sheet.writes;
  const res = repo.withLock(() => repo.updateMany('Tasks', ids.map((id) => ({ id, patch: { status: 'READY' } }))));
  assert.strictEqual(sheet.writes - before, 1);
  assert.ok(res.every((r) => r.after.status === 'READY'));
  assert.ok(repo.findAll('Tasks').every((t) => t.status === 'READY'));
});

test('列の並び替えに強い：ヘッダー名で読み書きする', () => {
  const { g, ss } = bootstrap();
  const repo = g.Repository.get();
  const sheet = ss().getSheetByName('Settings');
  // description 列と setting_value 列を入れ替える
  sheet.data = sheet.data.map((r) => [r[0], r[2], r[1]]);
  repo.resetCache();
  assert.strictEqual(repo.findById('Settings', 'DAILY_PLAN_HOUR').setting_value, '7');
  repo.withLock(() => repo.update('Settings', 'DAILY_PLAN_HOUR', { setting_value: '8' }));
  const row = sheet.data.find((r) => r[0] === 'DAILY_PLAN_HOUR');
  assert.strictEqual(row[2], '8');
});

test('シート上の Date 型の値は ISO 文字列で読み出す', () => {
  const { g, ss } = bootstrap();
  const repo = g.Repository.get();
  const t = repo.withLock(() => repo.insert('Tasks', { task_name: 'X' }));
  const sheet = ss().getSheetByName('Tasks');
  const col = sheet.data[0].indexOf('deadline');
  sheet.data[1][col] = new Date('2026-12-01T01:00:00Z');
  repo.resetCache();
  assert.strictEqual(repo.findById('Tasks', t.task_id).deadline, '2026-12-01T10:00:00+09:00');
});

test('withLock：入れ子でも1回だけロック取得、取得失敗は LOCK_TIMEOUT', () => {
  const { g, mocks } = bootstrap();
  const repo = g.Repository.get();
  const n = mocks.state.lockState.acquired;
  repo.withLock(() => repo.withLock(() => repo.findAll('Tasks')));
  assert.strictEqual(mocks.state.lockState.acquired - n, 1);
  assert.strictEqual(mocks.state.lockState.held, false);
  mocks.state.lockState.failNext = true;
  assert.throws(() => repo.withLock(() => 1), (e) => e.code === 'LOCK_TIMEOUT');
});

test('tryWithLock：ロック中なら処理せずに戻る（重複実行防止）', () => {
  const { g, mocks } = bootstrap();
  const repo = g.Repository.get();
  mocks.state.lockState.failNext = true;
  let ran = false;
  const r = repo.tryWithLock(() => { ran = true; });
  assert.strictEqual(r.locked, false);
  assert.strictEqual(ran, false);
  assert.strictEqual(repo.tryWithLock(() => 42).result, 42);
});

test('例外が起きてもロックは必ず解放される', () => {
  const { g, mocks } = bootstrap();
  const repo = g.Repository.get();
  assert.throws(() => repo.withLock(() => { throw new Error('boom'); }), /boom/);
  assert.strictEqual(mocks.state.lockState.held, false);
});

test('Repository.use：必要なメソッドが揃わない実装は拒否（DB移行時の安全策）', () => {
  const { g } = bootstrap({ setup: false });
  assert.throws(() => g.Repository.use({ findAll() {} }), /不足/);
});
