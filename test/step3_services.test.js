const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');

function setupWorld(opts = {}) {
  const env = bootstrap(opts);
  const { g } = env;
  const prj = g.ProjectService.create({ project_name: 'Web刷新', priority: 'HIGH', deadline: '2030-12-31' });
  return { ...env, prj };
}

test('プロジェクト：登録・編集・入力検証・期限の前後関係', () => {
  const { g, prj } = setupWorld();
  assert.strictEqual(prj.status, 'PLANNING');
  const up = g.ProjectService.update(prj.project_id, { status: 'ACTIVE', goal: '12月公開' }, prj.row_version);
  assert.strictEqual(up.status, 'ACTIVE');
  assert.throws(() => g.ProjectService.create({ project_name: '' }), /必須/);
  assert.throws(() => g.ProjectService.create({ project_name: 'x', priority: 'URGENT' }), /不正/);
  assert.throws(() => g.ProjectService.create({ project_name: 'x', start_date: '2030-02-01', deadline: '2030-01-01' }), /開始日以降/);
  const audits = g.Repository.get().findAll('AuditLogs').filter((a) => a.entity_id === prj.project_id);
  assert.deepStrictEqual(audits.map((a) => a.action), ['CREATE', 'UPDATE']);
  assert.strictEqual(audits[0].user, 'owner@example.com');
});

test('プロジェクト別進捗：完了率と期限超過数', () => {
  const { g, prj } = setupWorld();
  const t1 = g.TaskService.create({ project_id: prj.project_id, task_name: 'A', assigned_agent_id: 'AGT-CLAUDE-CODE' });
  g.TaskService.create({ project_id: prj.project_id, task_name: 'B', deadline: '2020-01-01' });
  for (const s of ['READY', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']) g.TaskService.changeStatus(t1.task_id, s);
  const p = g.ProjectService.list()[0];
  assert.strictEqual(p.task_count, 2);
  assert.strictEqual(p.progress, 50);
  assert.strictEqual(p.overdue_count, 1);
  assert.strictEqual(g.ProjectService.get(prj.project_id).tasks.length, 2);
});

test('プロジェクト削除は承認制：承認されるまで削除されず、承認で配下タスクごと論理削除', () => {
  const { g, prj } = setupWorld();
  const t = g.TaskService.create({ project_id: prj.project_id, task_name: 'A' });
  const r = g.ProjectService.requestDelete(prj.project_id, '不要になった');
  assert.strictEqual(r.status, 'APPROVAL_REQUESTED');
  assert.ok(g.Repository.get().findById('Projects', prj.project_id));
  assert.strictEqual(g.ApprovalService.pendingCount(), 1);
  g.ApprovalService.approve(r.approval_id, 'OK');
  assert.strictEqual(g.Repository.get().findById('Projects', prj.project_id), null);
  assert.strictEqual(g.Repository.get().findById('Tasks', t.task_id), null);
  assert.ok(g.Repository.get().findById('Tasks', t.task_id, { includeDeleted: true }), '行は残る');
  assert.strictEqual(g.ApprovalService.pendingCount(), 0);
});

test('タスク：登録時は BACKLOG、参照先の存在チェック、資料URLは https のみ', () => {
  const { g, prj } = setupWorld();
  const t = g.TaskService.create({ project_id: prj.project_id, task_name: 'LP作成', reference_urls: 'https://drive.google.com/a, https://example.com/b' });
  assert.strictEqual(t.status, 'BACKLOG');
  assert.strictEqual(t.retry_count, '0');
  assert.throws(() => g.TaskService.create({ project_id: 'PRJ-NONE', task_name: 'x' }), /プロジェクトが存在しません/);
  assert.throws(() => g.TaskService.create({ project_id: prj.project_id, task_name: 'x', assigned_agent_id: 'AGT-NONE' }), /担当AIが存在しません/);
  assert.throws(() => g.TaskService.create({ project_id: prj.project_id, task_name: 'x', reference_urls: 'http://insecure' }), /https/);
  assert.throws(() => g.TaskService.update(t.task_id, { status: 'COMPLETED' }), /状態変更/);
});

test('依存関係：登録・循環の拒否・前提未完了なら着手不可・完了で SATISFIED', () => {
  const { g, prj } = setupWorld();
  const pid = prj.project_id;
  const a = g.TaskService.create({ project_id: pid, task_name: 'A', assigned_agent_id: 'AGT-CLAUDE-CODE' });
  const b = g.TaskService.create({ project_id: pid, task_name: 'B', assigned_agent_id: 'AGT-CANVA', dependency_task_ids: a.task_id });
  assert.strictEqual(b.dependency_task_ids, a.task_id);
  assert.throws(() => g.TaskService.update(a.task_id, { dependency_task_ids: b.task_id }), /循環/);
  assert.throws(() => g.TaskService.update(a.task_id, { dependency_task_ids: a.task_id }), /自分自身/);
  assert.throws(() => g.TaskService.changeStatus(b.task_id, 'READY'), /前提タスクが完了していません/);
  g.TaskService.changeStatus(b.task_id, 'BLOCKED');

  for (const s of ['READY', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']) g.TaskService.changeStatus(a.task_id, s);
  const dep = g.Repository.get().findAll('Dependencies')[0];
  assert.strictEqual(dep.status, 'SATISFIED');
  g.TaskService.changeStatus(b.task_id, 'READY');
  const detail = g.TaskService.get(b.task_id);
  assert.strictEqual(detail.predecessors[0].task_id, a.task_id);
  assert.strictEqual(g.TaskService.get(a.task_id).successors[0].task_id, b.task_id);

  // 依存を外すと REMOVED になり、行は残る
  g.TaskService.update(b.task_id, { dependency_task_ids: '' });
  assert.strictEqual(g.Repository.get().findAll('Dependencies')[0].status, 'REMOVED');
});

test('状態遷移：不正遷移の拒否、理由必須、担当未設定で割当不可', () => {
  const { g, prj } = setupWorld();
  const t = g.TaskService.create({ project_id: prj.project_id, task_name: 'A' });
  assert.throws(() => g.TaskService.changeStatus(t.task_id, 'COMPLETED'), /変更できません/);
  assert.throws(() => g.TaskService.changeStatus(t.task_id, 'CANCELLED'), /理由/);
  assert.throws(() => g.TaskService.changeStatus(t.task_id, 'ASSIGNED'), /担当AI/);
  const w = g.TaskService.changeStatus(t.task_id, 'WAITING', 'Canva 利用上限');
  assert.strictEqual(w.waiting_reason, 'Canva 利用上限');
  const c = g.TaskService.changeStatus(t.task_id, 'CANCELLED', '中止');
  assert.strictEqual(c.status, 'CANCELLED');
  const back = g.TaskService.changeStatus(t.task_id, 'BACKLOG');
  assert.strictEqual(back.waiting_reason, '');
});

test('StateMachine：自動処理の権限制限', () => {
  const { g } = bootstrap({ setup: false });
  const SM = g.StateMachine;
  assert.ok(SM.check('BACKLOG', 'READY', 'SYSTEM').ok);
  assert.ok(SM.check('ASSIGNED', 'WAITING', 'SYSTEM').ok);
  assert.ok(!SM.check('REVIEW', 'COMPLETED', 'SYSTEM').ok);
  assert.ok(!SM.check('READY', 'CANCELLED', 'SYSTEM').ok);
  assert.ok(!SM.check('APPROVAL', 'COMPLETED', 'USER').ok);
  assert.ok(SM.check('APPROVAL', 'COMPLETED', 'APPROVAL').ok);
  assert.deepStrictEqual(Array.from(SM.nextStatuses('COMPLETED')), []);
  // すべての遷移先が定義済みの状態であること
  for (const [from, tos] of Object.entries(SM.TRANSITIONS)) for (const to of tos) assert.ok(SM.TRANSITIONS[to], from + '->' + to);
});

test('成果物：版の自動採番、提出でREVIEWへ、差し戻しでIN_PROGRESS、承認で完了', () => {
  const { g, prj } = setupWorld();
  const t = g.TaskService.create({ project_id: prj.project_id, task_name: 'バナー', assigned_agent_id: 'AGT-CANVA' });
  for (const s of ['READY', 'ASSIGNED', 'IN_PROGRESS']) g.TaskService.changeStatus(t.task_id, s);
  const d1 = g.DeliverableService.register({ task_id: t.task_id, file_name: 'banner.png', file_url: 'https://drive.google.com/file/d/1' });
  assert.strictEqual(d1.version, '1');
  assert.strictEqual(d1.submitted_by, 'AGT-CANVA');
  assert.strictEqual(g.Repository.get().findById('Tasks', t.task_id).status, 'REVIEW');
  assert.throws(() => g.DeliverableService.review(d1.deliverable_id, 'REJECTED', ''), /必須/);
  g.DeliverableService.review(d1.deliverable_id, 'REJECTED', '色味を修正');
  assert.strictEqual(g.Repository.get().findById('Tasks', t.task_id).status, 'IN_PROGRESS');
  const d2 = g.DeliverableService.register({ task_id: t.task_id, file_name: 'banner.png', file_url: 'https://drive.google.com/file/d/2' });
  assert.strictEqual(d2.version, '2');
  g.DeliverableService.review(d2.deliverable_id, 'APPROVED', '');
  assert.strictEqual(g.Repository.get().findById('Tasks', t.task_id).status, 'COMPLETED');
  assert.throws(() => g.DeliverableService.review(d2.deliverable_id, 'APPROVED'), /確認済み/);
  assert.throws(() => g.DeliverableService.register({ task_id: t.task_id, file_name: 'x', file_url: 'javascript:alert(1)' }), /https/);
});

test('承認：APPROVAL へ進むと承認依頼が自動作成され、承認で完了・差し戻しで作業中', () => {
  const { g, prj } = setupWorld();
  const mk = (name) => {
    const t = g.TaskService.create({ project_id: prj.project_id, task_name: name, assigned_agent_id: 'AGT-MUSE' });
    for (const s of ['READY', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'APPROVAL']) g.TaskService.changeStatus(t.task_id, s);
    return t;
  };
  const t1 = mk('投稿1');
  assert.throws(() => g.TaskService.changeStatus(t1.task_id, 'COMPLETED'), /承認画面/);
  const a1 = g.ApprovalService.list({ status: 'PENDING' }).find((a) => a.task_id === t1.task_id);
  assert.strictEqual(a1.action_type, 'TASK_COMPLETION');
  g.ApprovalService.approve(a1.approval_id, '公開OK');
  assert.strictEqual(g.Repository.get().findById('Tasks', t1.task_id).status, 'COMPLETED');
  assert.strictEqual(g.Repository.get().findById('Approvals', a1.approval_id).approver, 'owner@example.com');

  const t2 = mk('投稿2');
  const a2 = g.ApprovalService.list({ status: 'PENDING' }).find((a) => a.task_id === t2.task_id);
  assert.throws(() => g.ApprovalService.reject(a2.approval_id, ''), /必須/);
  g.ApprovalService.reject(a2.approval_id, '表現を修正');
  assert.strictEqual(g.Repository.get().findById('Tasks', t2.task_id).status, 'IN_PROGRESS');
  assert.throws(() => g.ApprovalService.approve(a2.approval_id), /処理済み/);
  assert.ok(g.NotificationService.list().some((n) => n.notification_type === 'APPROVAL_REQUESTED'));
});

test('AIエージェント：追加・能力の正規化・停止/復旧で通知・担当件数', () => {
  const { g, prj } = setupWorld();
  const a = g.AgentService.create({ agent_name: 'Ollama', provider: 'Local', capabilities: 'Summary, classification', connection_type: 'LOCAL_LLM' });
  assert.match(a.agent_id, /^AGT-/);
  assert.strictEqual(a.capabilities, 'summary,classification');
  assert.throws(() => g.AgentService.create({ agent_name: 'x', capabilities: '要約' }), /半角英小文字/);
  assert.throws(() => g.AgentService.create({ agent_name: 'x', agent_id: 'bad id' }), /AI ID/);

  g.AgentService.setStatus('AGT-CANVA', null, 'LIMITED', '月間上限');
  assert.ok(g.NotificationService.list().some((n) => n.notification_type === 'AGENT_UNAVAILABLE'));
  assert.strictEqual(g.AgentService.list().find((x) => x.agent_id === 'AGT-CANVA').usable, false);
  g.AgentService.setStatus('AGT-CANVA', null, 'OK');
  assert.ok(g.NotificationService.list().some((n) => n.notification_type === 'AGENT_RECOVERED'));

  const t = g.TaskService.create({ project_id: prj.project_id, task_name: 'A', assigned_agent_id: 'AGT-MUSE' });
  g.TaskService.changeStatus(t.task_id, 'READY');
  g.TaskService.changeStatus(t.task_id, 'ASSIGNED');
  assert.strictEqual(g.AgentService.list().find((x) => x.agent_id === 'AGT-MUSE').active_task_count, 1);
  assert.strictEqual(g.AgentService.get('AGT-MUSE').queue.length, 1);
});

test('権限：未登録ユーザーは拒否、VIEWER は閲覧のみ、EDITOR は登録可・承認不可', () => {
  const owner = setupWorld();
  const { mocks, g } = owner;
  // 同じ環境で利用者だけを切り替える
  g.SettingsService.update('ALLOWED_USERS', 'viewer@example.com:VIEWER, editor@example.com:EDITOR');
  const asUser = (email) => { g.Session.getActiveUser = () => ({ getEmail: () => email }); };
  asUser('stranger@example.com');
  assert.throws(() => g.ProjectService.create({ project_name: 'x' }), (e) => e.code === 'FORBIDDEN');
  asUser('viewer@example.com');
  assert.throws(() => g.ProjectService.create({ project_name: 'x' }), (e) => e.code === 'FORBIDDEN');
  asUser('editor@example.com');
  const p = g.ProjectService.create({ project_name: '編集者の案件' });
  const r = g.ProjectService.requestDelete(p.project_id);
  assert.throws(() => g.ApprovalService.approve(r.approval_id), (e) => e.code === 'FORBIDDEN');
  assert.throws(() => g.SettingsService.update('MAX_RETRY_COUNT', '5'), (e) => e.code === 'FORBIDDEN');
  asUser('');
  assert.throws(() => g.ProjectService.create({ project_name: 'x' }), /Googleアカウントを確認できません/);
  assert.ok(mocks);
});

test('設定：既知キーの検証、変更不可キー、監査ログ', () => {
  const { g } = bootstrap();
  assert.strictEqual(g.SettingsService.update('QUEUE_CHECK_INTERVAL_MIN', '10').setting_value, '10');
  assert.throws(() => g.SettingsService.update('QUEUE_CHECK_INTERVAL_MIN', '7'), /不正/);
  assert.throws(() => g.SettingsService.update('DAILY_SUMMARY_HOUR', '24'), /23 以下/);
  assert.throws(() => g.SettingsService.update('MAX_RETRY_COUNT', '1.5'), /整数/);
  assert.throws(() => g.SettingsService.update('BACKUP_FOLDER_ID', 'x'), /変更できません/);
  assert.strictEqual(g.SettingsService.getNumber('QUEUE_CHECK_INTERVAL_MIN'), 10);
  assert.ok(g.Repository.get().findAll('AuditLogs').some((a) => a.entity_type === 'Settings' && a.entity_id === 'QUEUE_CHECK_INTERVAL_MIN'));
});

test('通知：重複防止・既読化／タスク削除は論理削除で依存も外れる', () => {
  const { g, prj } = setupWorld();
  assert.ok(g.NotificationService.createOnce('OVERDUE', 'x', { task_id: 'T1' }));
  assert.strictEqual(g.NotificationService.createOnce('OVERDUE', 'x', { task_id: 'T1' }), null);
  const n = g.NotificationService.list({ unreadOnly: true });
  g.NotificationService.markRead(n.map((x) => x.notification_id).join(','));
  assert.strictEqual(g.NotificationService.unreadCount(), 0);

  const a = g.TaskService.create({ project_id: prj.project_id, task_name: 'A' });
  const b = g.TaskService.create({ project_id: prj.project_id, task_name: 'B', dependency_task_ids: a.task_id });
  g.TaskService.remove(a.task_id);
  assert.strictEqual(g.TaskService.list().length, 1);
  assert.strictEqual(g.Repository.get().findAll('Dependencies')[0].status, 'REMOVED');
  assert.ok(g.TaskService.get(b.task_id));
});
