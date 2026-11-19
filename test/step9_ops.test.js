const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');

function world() {
  const env = bootstrap();
  const { g } = env;
  const prj = g.ProjectService.create({ project_name: 'P' });
  const T = (d) => g.TaskService.create(Object.assign({ project_id: prj.project_id }, d));
  const repo = g.Repository.get();
  const get = (id) => repo.findById('Tasks', id);
  return { ...env, prj, T, repo, get };
}
const toFailed = (g, id) => {
  const path = ['BACKLOG', 'READY', 'ASSIGNED', 'IN_PROGRESS'];
  const cur = g.Repository.get().findById('Tasks', id).status;
  for (const s of path.slice(path.indexOf(cur) + 1)) g.TaskService.changeStatus(id, s);
  g.TaskService.changeStatus(id, 'FAILED', '出力が要件を満たさない');
};

// ---- 再実行 ----
test('手動の再実行：FAILED → READY、回数加算、上限でブロック、オーナーは上限超え可', () => {
  const { g, T, get } = world();
  g.SettingsService.update('MAX_RETRY_COUNT', '2');
  const t = T({ task_name: 'バナー', assigned_agent_id: 'AGT-CANVA' });
  assert.throws(() => g.TaskService.retry(t.task_id), /失敗」のタスクだけ/);
  for (let i = 1; i <= 2; i++) {
    toFailed(g, t.task_id);
    const r = g.TaskService.retry(t.task_id, '指示を修正');
    assert.strictEqual(r.status, 'READY');
    assert.strictEqual(r.retry_count, String(i));
  }
  toFailed(g, t.task_id);
  assert.throws(() => g.TaskService.retry(t.task_id), /上限（2回）/);
  g.SettingsService.update('ALLOWED_USERS', 'editor@example.com:EDITOR');
  g.Session.getActiveUser = () => ({ getEmail: () => 'editor@example.com' });
  assert.throws(() => g.TaskService.retry(t.task_id, '', true), /上限/, '編集者は force できない');
  g.Session.getActiveUser = () => ({ getEmail: () => 'owner@example.com' });
  assert.strictEqual(g.TaskService.retry(t.task_id, '', true).retry_count, '3');
  assert.strictEqual(g.Repository.get().findAll('ExecutionLogs').filter((l) => l.execution_type === 'MANUAL_RETRY').length, 3);
  assert.strictEqual(get(t.task_id).status, 'READY');
});

test('自動の再投入：外部実行の失敗は上限まで自動で READY に戻し、上限到達で重大通知。人が失敗にしたものは戻さない', () => {
  const { g, T, get } = world();
  g.SettingsService.update('MAX_RETRY_COUNT', '1');
  const t = T({ task_name: 'システム実装' });
  g.QueueEngine.run();
  assert.strictEqual(get(t.task_id).status, 'ASSIGNED');
  g.QueueEngine.reportFailure(t.task_id, 'API タイムアウト');
  assert.strictEqual(get(t.task_id).status, 'FAILED');
  assert.match(get(t.task_id).waiting_reason, /^\[自動\] API タイムアウト/);
  const r = g.QueueEngine.run();
  assert.strictEqual(r.retried, 1);
  assert.strictEqual(get(t.task_id).status, 'ASSIGNED', '再投入後そのまま再割当');
  assert.strictEqual(get(t.task_id).retry_count, '1');
  g.QueueEngine.reportFailure(t.task_id, 'API タイムアウト');
  g.QueueEngine.run();
  assert.strictEqual(get(t.task_id).status, 'FAILED', '上限に達したので戻さない');
  assert.ok(g.NotificationService.list().some((n) => n.notification_type === 'FAILED' && n.severity === 'CRITICAL'));

  const human = T({ task_name: 'システム改修', assigned_agent_id: 'AGT-CLAUDE-CODE' });
  toFailed(g, human.task_id);
  g.QueueEngine.run();
  assert.strictEqual(get(human.task_id).status, 'FAILED');
});

// ---- 復元 ----
test('復元：プロジェクトを戻すと一緒に削除された配下タスクも戻る。先に削除済みのタスクは戻らない', () => {
  const { g, T, prj, repo } = world();
  const a = T({ task_name: 'A' });
  const b = T({ task_name: 'B' });
  g.TaskService.remove(b.task_id);
  // B を先に削除した時刻を過去にずらす（同時削除と区別するため）
  repo.withLock(() => {
    const sheet = g.SheetsRepository._getSpreadsheet().getSheetByName('Tasks');
    const col = sheet.data[0].indexOf('updated_at');
    const row = sheet.data.find((r) => r[0] === b.task_id); row[col] = '2026-01-01T00:00:00+09:00';
  });
  repo.resetCache();
  const req = g.ProjectService.requestDelete(prj.project_id);
  g.ApprovalService.approve(req.approval_id);
  assert.strictEqual(repo.findById('Tasks', a.task_id), null);
  const trash = g.api('trash.list').data;
  assert.strictEqual(trash.projects.length, 1);
  assert.strictEqual(trash.tasks.length, 2);
  assert.throws(() => g.TaskService.restore(a.task_id), /先にプロジェクトを復元/);
  const r = g.ProjectService.restore(prj.project_id);
  assert.strictEqual(r.restored_tasks, 1);
  assert.ok(repo.findById('Tasks', a.task_id));
  assert.strictEqual(repo.findById('Tasks', b.task_id), null);
  g.TaskService.restore(b.task_id);
  assert.ok(repo.findById('Tasks', b.task_id));
  assert.ok(repo.findAll('AuditLogs').filter((x) => x.action === 'RESTORE').length >= 3);
});

test('復元・削除済み一覧はオーナーのみ', () => {
  const { g } = world();
  g.SettingsService.update('ALLOWED_USERS', 'editor@example.com:EDITOR');
  g.Session.getActiveUser = () => ({ getEmail: () => 'editor@example.com' });
  assert.strictEqual(g.api('trash.list').error.code, 'FORBIDDEN');
  assert.strictEqual(g.api('tasks.restore', { task_id: 'x' }).error.code, 'FORBIDDEN');
});

// ---- 割り振りルール ----
test('割り振りルール：追加・検証・無効化、追加したルールで振り分けが変わる', () => {
  const { g, T, get } = world();
  assert.throws(() => g.RuleService.create({ keyword_pattern: '(', required_capability: 'x' }), /書き方/);
  assert.throws(() => g.RuleService.create({ keyword_pattern: '動画', required_capability: '動画' }), /半角英小文字/);
  assert.throws(() => g.RuleService.create({ keyword_pattern: '動画', required_capability: 'video', preferred_agent_id: 'AGT-NONE' }), /推奨AIが存在しません/);
  assert.throws(() => g.RuleService.create({ keyword_pattern: '動画', required_capability: 'video', match_field: 'password' }), /照合する項目/);
  g.AgentService.create({ agent_id: 'AGT-VIDEO', agent_name: '動画AI', capabilities: 'video' });
  const rule = g.RuleService.create({ keyword_pattern: '動画|ショート', required_capability: 'Video', preferred_agent_id: 'AGT-VIDEO', priority: 5 });
  assert.strictEqual(rule.required_capability, 'video');
  assert.strictEqual(rule.category, 'video');
  const t = T({ task_name: 'ショート動画の編集' });
  g.QueueEngine.run();
  assert.strictEqual(get(t.task_id).assigned_agent_id, 'AGT-VIDEO');

  const test1 = g.api('rules.test', { data: { task_name: 'Instagram の投稿' } }).data;
  assert.strictEqual(test1.classification.rule_id, 'RUL-SNS');
  assert.strictEqual(test1.agent_name, 'Muse');
  g.RuleService.update('RUL-SNS', { enabled: false });
  assert.strictEqual(g.api('rules.test', { data: { task_name: 'Instagram の投稿' } }).data.classification.source, null);
  assert.strictEqual(g.api('rules.list').data[0].rule_id, rule.rule_id, '優先順位順');
  assert.ok(g.Repository.get().findAll('AuditLogs').some((a) => a.entity_type === 'AssignmentRules' && a.action === 'UPDATE'));
});

// ---- ログ・システム情報 ----
test('ログ検索：新しい順・結果や種別で絞り込み・タスク名付き', () => {
  const { g, T } = world();
  const t = T({ task_name: 'Instagram 投稿' });
  g.QueueEngine.run();
  g.QueueEngine.reportFailure(t.task_id, 'x');
  const all = g.api('logs.executions', { filter: {} }).data;
  assert.ok(all.total >= 3);
  assert.ok(all.items[0].start_time >= all.items[all.items.length - 1].start_time);
  const failed = g.api('logs.executions', { filter: { result: 'FAILED' } }).data;
  assert.strictEqual(failed.items.length, 1);
  assert.strictEqual(failed.items[0].task_name, 'Instagram 投稿');
  const assigns = g.api('logs.executions', { filter: { execution_type: 'AUTO_ASSIGN' } }).data;
  assert.ok(assigns.items.every((e) => e.execution_type === 'AUTO_ASSIGN'));
  const audits = g.api('logs.audits', { filter: { entity_type: 'Tasks', action: 'CREATE' } }).data;
  assert.strictEqual(audits.items.length, 1);
  assert.strictEqual(audits.items[0].entity_name, 'Instagram 投稿');
  assert.strictEqual(g.api('logs.executions', { filter: { limit: 99999 } }).data.items.length <= 500, true);
});

test('システム情報：保存場所・データ量・直近24時間のエラー件数', () => {
  const { g, T } = world();
  const t = T({ task_name: 'Instagram 投稿' });
  g.QueueEngine.run();
  g.QueueEngine.reportFailure(t.task_id, 'x');
  const h = g.api('system.health').data;
  assert.match(h.spreadsheet_url, /^https:\/\/docs\.google\.com\/spreadsheets\/d\//);
  assert.match(h.backup_folder_url, /^https:\/\/drive\.google\.com\/drive\/folders\//);
  assert.strictEqual(h.sheets.length, 11);
  assert.strictEqual(h.errors_24h, 1);
  assert.ok(h.cell_usage_percent >= 0 && h.cell_usage_percent < 1);
});
