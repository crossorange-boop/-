const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');

function world() {
  const env = bootstrap();
  const { g } = env;
  const prj = g.ProjectService.create({ project_name: 'P', priority: 'HIGH' });
  const repo = g.Repository.get();
  const T = (data) => g.TaskService.create(Object.assign({ project_id: prj.project_id }, data));
  const get = (id) => repo.findById('Tasks', id);
  const run = (opts) => g.QueueEngine.run(opts);
  const setAgent = (id, patch) => g.AgentService.update(id, patch);
  return { ...env, prj, repo, T, get, run, setAgent };
}

// ---- 分類 ----
test('分類：キーワード一致・優先順位・手動指定優先・不一致', () => {
  const { g, repo } = world();
  const rules = repo.findAll('AssignmentRules');
  const c = (t) => g.AssignmentEngine.classify(t, rules);
  assert.strictEqual(c({ task_name: 'Instagram 投稿作成' }).required_capability, 'sns');
  assert.strictEqual(c({ task_name: 'バナーのデザイン' }).preferred_agent_id, 'AGT-CANVA');
  assert.strictEqual(c({ task_name: 'x', description: 'GAS で集計システムを実装' }).rule_id, 'RUL-DEV'); // 開発(10) が分類(90) より優先
  assert.strictEqual(c({ task_name: '資料', required_capability: 'sns' }).source, 'MANUAL');
  assert.strictEqual(c({ task_name: '打合せ', assigned_agent_id: 'AGT-MUSE' }).source, 'AGENT');
  assert.strictEqual(c({ task_name: '打合せ' }).source, null);
});

test('分類：無効化したルール・壊れた正規表現は無視する', () => {
  const { g } = world();
  const rules = [
    { rule_id: 'R1', priority: 1, match_field: 'task_name', keyword_pattern: '([', category: 'x', required_capability: 'x', enabled: 'TRUE' },
    { rule_id: 'R2', priority: 2, match_field: 'task_name', keyword_pattern: '投稿', category: 'sns', required_capability: 'sns', enabled: 'FALSE' },
    { rule_id: 'R3', priority: 3, match_field: 'task_name', keyword_pattern: '投稿', category: 'sns2', required_capability: 'sns', enabled: 'TRUE' }
  ];
  assert.strictEqual(g.AssignmentEngine.classify({ task_name: '投稿' }, rules).rule_id, 'R3');
});

// ---- 担当選定 ----
test('担当選定：推奨AI・代替AI・全員不可は WAIT・上限は HOLD・指定AI固定', () => {
  const { g, repo } = world();
  const agents = () => repo.findAll('Agents');
  const sel = (t, c, counts) => g.AssignmentEngine.selectAgent(t, c, agents(), counts || {});
  const design = { required_capability: 'design', preferred_agent_id: 'AGT-CANVA' };
  assert.deepStrictEqual([sel({}, design).decision, sel({}, design).agent_id], ['ASSIGN', 'AGT-CANVA']);

  g.AgentService.create({ agent_id: 'AGT-DESIGN2', agent_name: '予備デザインAI', capabilities: 'design', priority: 9 });
  g.AgentService.setStatus('AGT-CANVA', null, 'LIMITED');
  const alt = sel({}, design);
  assert.deepStrictEqual([alt.decision, alt.agent_id], ['ASSIGN', 'AGT-DESIGN2']);

  g.AgentService.setStatus('AGT-DESIGN2', 'UNAVAILABLE');
  const wait = sel({}, design);
  assert.deepStrictEqual([wait.decision, wait.agent_id], ['WAIT', 'AGT-CANVA']); // 推奨AIで待つ

  g.AgentService.setStatus('AGT-CANVA', null, 'OK');
  assert.strictEqual(sel({}, design, { 'AGT-CANVA': 5 }).decision, 'HOLD');
  assert.strictEqual(sel({ assigned_agent_id: 'AGT-DESIGN2' }, design).decision, 'WAIT');
  assert.strictEqual(sel({}, { required_capability: 'video' }).decision, 'NO_CANDIDATE');
});

// ---- 振り分け全体 ----
test('振り分け：未着手 → 分類 → 割当まで1回で進み、実行履歴が残る', () => {
  const { T, get, run, repo } = world();
  const t = T({ task_name: 'Instagram リール投稿', instruction: '冬らしく' });
  const r = run();
  assert.strictEqual(r.classified, 1);
  assert.strictEqual(r.assigned, 1);
  const after = get(t.task_id);
  assert.strictEqual(after.status, 'ASSIGNED');
  assert.strictEqual(after.assigned_agent_id, 'AGT-MUSE');
  assert.strictEqual(after.category, 'sns');
  const logs = repo.findAll('ExecutionLogs');
  assert.ok(logs.some((l) => l.execution_type === 'AUTO_ASSIGN' && l.task_id === t.task_id && l.agent_id === 'AGT-MUSE' && l.result === 'SUCCESS'));
  assert.ok(logs.some((l) => l.execution_type === 'QUEUE_CHECK' && l.result === 'SUCCESS'));
  assert.ok(repo.findAll('AuditLogs').some((a) => a.action === 'STATUS_CHANGE' && a.user === 'SYSTEM'));
});

test('障害管理：AI停止で WAITING（データ保持）→ 復旧で自動再開', () => {
  const { T, get, run, setAgent, g } = world();
  setAgent('AGT-CANVA', { usage_limit_status: 'LIMITED' });
  const t = T({ task_name: 'キャンペーンバナー制作', instruction: '赤基調', reference_urls: 'https://drive.google.com/x', deadline: '2030-01-01' });
  run();
  let x = get(t.task_id);
  assert.strictEqual(x.status, 'WAITING');
  assert.strictEqual(x.assigned_agent_id, 'AGT-CANVA');
  assert.match(x.waiting_reason, /^\[自動\]/);
  assert.strictEqual(x.instruction, '赤基調');
  assert.strictEqual(x.reference_urls, 'https://drive.google.com/x');

  assert.strictEqual(run().recovered, 0); // まだ復旧していない
  setAgent('AGT-CANVA', { usage_limit_status: 'OK' });
  const r = run();
  assert.strictEqual(r.recovered, 1);
  x = get(t.task_id);
  assert.strictEqual(x.status, 'ASSIGNED');
  assert.strictEqual(x.waiting_reason, '');
  assert.strictEqual(x.instruction, '赤基調');
  assert.ok(g.NotificationService.list().some((n) => n.notification_type === 'RECOVERED'));
});

test('障害管理：割当済みタスクは AI 停止で WAITING、作業中は状態を変えず通知', () => {
  const { T, get, run, setAgent, g } = world();
  const a = T({ task_name: 'システム実装A' });
  const b = T({ task_name: 'システム実装B', assigned_agent_id: 'AGT-CLAUDE-CODE' });
  run();
  g.TaskService.changeStatus(b.task_id, 'IN_PROGRESS');
  setAgent('AGT-CLAUDE-CODE', { availability: 'MAINTENANCE' });
  run();
  assert.strictEqual(get(a.task_id).status, 'WAITING');
  assert.strictEqual(get(b.task_id).status, 'IN_PROGRESS');
  assert.ok(g.NotificationService.list().some((n) => n.notification_type === 'AGENT_UNAVAILABLE_IN_PROGRESS' && n.task_id === b.task_id));
  run();
  assert.strictEqual(g.NotificationService.list().filter((n) => n.notification_type === 'AGENT_UNAVAILABLE_IN_PROGRESS').length, 1, '通知は重複しない');
});

test('人が手動で WAITING にしたタスクは自動で戻さない', () => {
  const { T, get, run, g } = world();
  const t = T({ task_name: 'Instagram 投稿', assigned_agent_id: 'AGT-MUSE' });
  g.TaskService.changeStatus(t.task_id, 'WAITING', '先方の素材待ち');
  run();
  assert.strictEqual(get(t.task_id).status, 'WAITING');
});

test('依存関係：前提未完了は BLOCKED、前提完了で自動的に割当まで進む', () => {
  const { T, get, run, g } = world();
  const a = T({ task_name: 'デザイン案', assigned_agent_id: 'AGT-CANVA' });
  const b = T({ task_name: 'Instagram 告知投稿', dependency_task_ids: a.task_id });
  run();
  assert.strictEqual(get(b.task_id).status, 'BLOCKED');
  assert.match(get(b.task_id).waiting_reason, /前提タスク待ち：デザイン案/);
  assert.strictEqual(get(a.task_id).status, 'ASSIGNED');
  for (const s of ['IN_PROGRESS', 'REVIEW', 'COMPLETED']) g.TaskService.changeStatus(a.task_id, s);
  const r = run();
  assert.strictEqual(r.unblocked, 1);
  assert.strictEqual(get(b.task_id).status, 'ASSIGNED');
  assert.strictEqual(get(b.task_id).assigned_agent_id, 'AGT-MUSE');
});

test('優先順位：同時担当上限があるとき、優先度・期限の順に割り当て残りは READY のまま', () => {
  const { T, get, run, setAgent } = world();
  setAgent('AGT-MUSE', { max_concurrent_tasks: 2 });
  const low = T({ task_name: 'Instagram 投稿 low', priority: 'LOW' });
  const crit = T({ task_name: 'Instagram 投稿 critical', priority: 'CRITICAL' });
  const midLate = T({ task_name: 'Instagram 投稿 mid late', priority: 'MEDIUM', deadline: '2030-12-31' });
  const midSoon = T({ task_name: 'Instagram 投稿 mid soon', priority: 'MEDIUM', deadline: '2030-01-01' });
  const r = run();
  assert.strictEqual(r.assigned, 2);
  assert.strictEqual(r.held, 2);
  assert.strictEqual(get(crit.task_id).status, 'ASSIGNED');
  assert.strictEqual(get(midSoon.task_id).status, 'ASSIGNED');
  assert.strictEqual(get(midLate.task_id).status, 'READY');
  assert.strictEqual(get(low.task_id).status, 'READY');
});

test('分類できないタスクは BACKLOG のまま、要分類の通知は重複しない', () => {
  const { T, get, run, g } = world();
  const t = T({ task_name: '社内打合せの準備' });
  run(); run();
  assert.strictEqual(get(t.task_id).status, 'BACKLOG');
  assert.strictEqual(g.NotificationService.list().filter((n) => n.notification_type === 'NEEDS_CLASSIFICATION' && n.task_id === t.task_id).length, 1);
});

test('重複実行防止：別の処理がロック中ならスキップ／タスク単位ロック中のタスクは対象外', () => {
  const { T, get, run, mocks, g } = world();
  const t = T({ task_name: 'Instagram 投稿' });
  mocks.state.lockState.failNext = true;
  const r = run();
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(get(t.task_id).status, 'BACKLOG');

  const token = g.Repository.get().withLock(() => g.QueueEngine.acquireTaskLock(t.task_id, 10));
  assert.ok(token);
  assert.strictEqual(g.Repository.get().withLock(() => g.QueueEngine.acquireTaskLock(t.task_id, 10)), null, '二重取得できない');
  run();
  assert.strictEqual(get(t.task_id).status, 'BACKLOG');
  g.Repository.get().withLock(() => g.QueueEngine.releaseTaskLock(t.task_id, token));
  run();
  assert.strictEqual(get(t.task_id).status, 'ASSIGNED');
});

test('障害の局所化：1件で例外が起きても他のタスクは処理され、失敗が記録される', () => {
  const { T, get, run, g, repo } = world();
  const bad = T({ task_name: 'Instagram 投稿 bad' });
  const good = T({ task_name: 'Instagram 投稿 good' });
  const orig = g.TaskService._transition;
  g.TaskService._transition = function (id, to, opts) {
    if (id === bad.task_id) throw new Error('模擬障害');
    return orig(id, to, opts);
  };
  const r = run();
  g.TaskService._transition = orig;
  assert.ok(r.errors >= 1);
  assert.strictEqual(get(good.task_id).status, 'ASSIGNED');
  assert.strictEqual(get(bad.task_id).status, 'BACKLOG', 'データは消えない');
  assert.ok(repo.findAll('ExecutionLogs').some((l) => l.task_id === bad.task_id && l.result === 'FAILED' && l.error_message === '模擬障害'));
  assert.ok(repo.findAll('ExecutionLogs').some((l) => l.execution_type === 'QUEUE_CHECK' && l.result === 'PARTIAL'));
});

test('実行時間の上限：時間切れなら処理を打ち切り、次回に持ち越す', () => {
  const { T, get, run } = world();
  const t = T({ task_name: 'Instagram 投稿' });
  const r = run({ time_budget_sec: -1 });
  assert.strictEqual(r.timed_out, true);
  assert.strictEqual(get(t.task_id).status, 'BACKLOG');
  run();
  assert.strictEqual(get(t.task_id).status, 'ASSIGNED');
});

test('変化がなければ実行履歴を増やさない（シート肥大化防止）', () => {
  const { run, repo } = world();
  run();
  const n = repo.findAll('ExecutionLogs').length;
  run(); run();
  assert.strictEqual(repo.findAll('ExecutionLogs').length, n);
});

test('作業待ちキュー：AI別の一覧と指示書テキスト、今すぐ振り分けは編集者以上', () => {
  const { T, run, g } = world();
  const t = T({ task_name: 'Instagram 告知', instruction: 'ハッシュタグ5個', reference_urls: 'https://drive.google.com/ref', deadline: '2030-01-01' });
  run();
  const q = g.api('queue.byAgent').data;
  const muse = q.lanes.find((l) => l.agent_id === 'AGT-MUSE');
  assert.strictEqual(muse.tasks.length, 1);
  assert.strictEqual(muse.counts.assigned, 1);
  const text = muse.tasks[0].instruction_text;
  assert.match(text, /【作業依頼】Instagram 告知/);
  assert.match(text, /ハッシュタグ5個/);
  assert.match(text, /https:\/\/drive\.google\.com\/ref/);
  assert.ok(text.includes(t.task_id));
  assert.ok(q.last_run && q.last_run.result === 'SUCCESS');

  g.SettingsService.update('ALLOWED_USERS', 'viewer@example.com:VIEWER');
  g.Session.getActiveUser = () => ({ getEmail: () => 'viewer@example.com' });
  assert.strictEqual(g.api('queue.runNow').error.code, 'FORBIDDEN');
  assert.strictEqual(g.api('queue.byAgent').ok, true);
});

test('外部AI接続アダプター：未登録の接続方式は手動キュー扱い、登録には dispatch が必要', () => {
  const { g } = world();
  assert.strictEqual(g.AgentAdapter.get('N8N_WEBHOOK'), g.AgentAdapter.ManualQueueAdapter);
  assert.throws(() => g.AgentAdapter.register('X', {}), /dispatch/);
  const calls = [];
  g.AgentAdapter.register('OFFICIAL_API', { dispatch: (t, a) => { calls.push([t.task_id, a.agent_id]); return { mode: 'SENT' }; } });
  g.AgentService.create({ agent_id: 'AGT-API', agent_name: 'API AI', capabilities: 'video', connection_type: 'OFFICIAL_API' });
  const t = g.TaskService.create({ project_id: g.Repository.get().findAll('Projects')[0].project_id, task_name: '動画', required_capability: 'video' });
  g.QueueEngine.run();
  assert.deepStrictEqual(calls, [[t.task_id, 'AGT-API']]);
});
