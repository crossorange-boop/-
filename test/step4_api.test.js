const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');
const { seedDemo } = require('../tools/demo-data');

test('api：成功時は {ok:true,data}、bootstrap で利用者と列挙値を返す', () => {
  const { g } = bootstrap();
  const r = g.api('bootstrap');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.user.role, 'OWNER');
  assert.strictEqual(r.data.enums.task_status.length, 11);
});

test('api：不明な操作・不正な入力・業務エラーは安全なメッセージで返す', () => {
  const { g } = bootstrap();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.api('drop.everything'))), { ok: false, error: { code: 'NOT_FOUND', message: '不明な操作です' } });
  assert.strictEqual(g.api('tasks.list', 'oops').error.code, 'VALIDATION');
  assert.strictEqual(g.api('projects.create', { data: { project_name: '' } }).error.code, 'VALIDATION');
  assert.strictEqual(g.api('__proto__').error.code, 'NOT_FOUND');
  assert.strictEqual(g.api('hasOwnProperty').error.code, 'NOT_FOUND');
});

test('api：想定外の例外は内部情報を隠す', () => {
  const { g } = bootstrap();
  g.DashboardService.summary = () => { throw new TypeError('secret internal detail at line 42'); };
  const origError = console.error; console.error = () => {};
  const r = g.api('dashboard.summary');
  console.error = origError;
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, 'INTERNAL');
  assert.ok(!r.error.message.includes('secret'));
});

test('api：ロールによる入口での拒否（閲覧者は閲覧のみ・承認と設定はオーナーのみ）', () => {
  const { g } = bootstrap();
  g.SettingsService.update('ALLOWED_USERS', 'viewer@example.com:VIEWER,editor@example.com:EDITOR');
  g.Session.getActiveUser = () => ({ getEmail: () => 'viewer@example.com' });
  assert.strictEqual(g.api('dashboard.summary').ok, true);
  assert.strictEqual(g.api('tasks.create', { data: {} }).error.code, 'FORBIDDEN');
  g.Session.getActiveUser = () => ({ getEmail: () => 'editor@example.com' });
  assert.strictEqual(g.api('settings.list').error.code, 'FORBIDDEN');
  assert.strictEqual(g.api('approvals.approve', { approval_id: 'x' }).error.code, 'FORBIDDEN');
  g.Session.getActiveUser = () => ({ getEmail: () => 'stranger@example.com' });
  assert.strictEqual(g.api('bootstrap').error.code, 'FORBIDDEN');
});

test('setupSystem：2回目以降はオーナー以外実行できない', () => {
  const { g } = bootstrap();
  g.Session.getActiveUser = () => ({ getEmail: () => 'stranger@example.com' });
  assert.throws(() => g.setupSystem(), (e) => e.code === 'FORBIDDEN');
});

test('ダッシュボード集計：4分類・期限超過・期限間近・AI別件数・承認待ち', () => {
  const { g } = bootstrap();
  seedDemo(g);
  const s = g.api('dashboard.summary').data;
  assert.strictEqual(s.project_count, 4);
  assert.strictEqual(s.task_count, 10);
  const grp = Object.fromEntries(s.groups.map((x) => [x.key, x.count]));
  assert.deepStrictEqual(grp, { NOT_STARTED: 3, IN_PROGRESS: 4, ON_HOLD: 1, COMPLETED: 2 });
  assert.strictEqual(s.groups.reduce((n, x) => n + x.count, 0), s.task_count);
  assert.deepStrictEqual(Array.from(s.overdue.map((t) => t.task_name)).sort(), ['キャンペーンバナー', 'トップページのデザイン案'].sort());
  assert.ok(s.due_soon.some((t) => t.task_name === 'サイト構成とGASフォーム実装'));
  const agents = Object.fromEntries(s.agents.map((a) => [a.agent_id, a]));
  assert.strictEqual(agents['AGT-CLAUDE-CODE'].active_task_count, 2);
  assert.strictEqual(agents['AGT-CANVA'].usable, false);
  assert.strictEqual(s.pending_approval_count, 1);
  assert.strictEqual(s.unassigned_count, 1);
  assert.ok(s.recent_activity.length <= 10);
  assert.ok(s.recent_activity[0].entity_name);
});
