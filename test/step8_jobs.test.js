const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');

const DAY = 86400000;
const jstDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY + 9 * 3600000).toISOString().slice(0, 10);

function world() {
  const env = bootstrap();
  const { g } = env;
  const prj = g.ProjectService.create({ project_name: '冬キャンペーン', status: 'ACTIVE' });
  const T = (d) => g.TaskService.create(Object.assign({ project_id: prj.project_id }, d));
  const repo = g.Repository.get();
  return { ...env, prj, T, repo };
}

// ---- 期限確認 ----
test('期限確認：期限間近・期限超過を通知し、後続への影響と再調整案を作る（自動では日付を変えない）', () => {
  const { g, T, repo } = world();
  const late = T({ task_name: 'デザイン', deadline: jstDate(-3), assigned_agent_id: 'AGT-CANVA' });
  const next = T({ task_name: '投稿', deadline: jstDate(5), start_date: jstDate(2), dependency_task_ids: late.task_id });
  const soon = T({ task_name: '原稿', deadline: jstDate(1) });
  T({ task_name: '来月', deadline: jstDate(30) });
  const r = g.DeadlineEngine.run();
  assert.strictEqual(r.overdue, 1);
  assert.strictEqual(r.due_soon, 1);
  assert.strictEqual(r.impacted, 1);
  assert.strictEqual(r.proposals, 1);
  const n = g.NotificationService.list();
  assert.ok(n.some((x) => x.notification_type === 'OVERDUE' && x.task_id === late.task_id && x.severity === 'CRITICAL'));
  assert.ok(n.some((x) => x.notification_type === 'DEADLINE_SOON' && x.task_id === soon.task_id));
  const prop = n.find((x) => x.notification_type === 'RESCHEDULE_PROPOSAL');
  assert.ok(prop.message.includes('投稿：期限 ' + jstDate(5) + ' → ' + jstDate(8)), prop.message);
  assert.ok(prop.message.includes('開始 ' + jstDate(2) + ' → ' + jstDate(5)));
  assert.strictEqual(repo.findById('Tasks', next.task_id).deadline, jstDate(5), '自動で書き換えない');
  assert.ok(repo.findAll('ExecutionLogs').some((l) => l.execution_type === 'DEADLINE_CHECK'));
  // 2回目は未読の同じ通知を重複させない
  const before = g.NotificationService.list().length;
  const r2 = g.DeadlineEngine.run();
  assert.strictEqual(r2.notified, 0);
  assert.strictEqual(g.NotificationService.list().length, before);
});

test('再調整案（純粋関数）：超過日数ぶん後続をずらす。最低1日', () => {
  const { g } = world();
  const now = new Date('2026-11-20T10:00:00+09:00');
  const p = g.DeadlineEngine.proposeReschedule({ deadline: '2026-11-19' }, [{ task_id: 'B', task_name: 'B', deadline: '2026-11-25', start_date: '' }], now);
  assert.strictEqual(p[0].shift_days, 1);
  assert.strictEqual(p[0].proposed_deadline, '2026-11-26');
  assert.strictEqual(p[0].proposed_start, '');
  const p2 = g.DeadlineEngine.proposeReschedule({ deadline: '2026-11-15' }, [{ task_id: 'B', task_name: 'B', deadline: '2026-11-25' }], now);
  assert.strictEqual(p2[0].shift_days, 5);
});

// ---- 定時レポート ----
test('朝のレポート：期限超過・今日期限・作業中・待機・承認待ち', () => {
  const { g, T } = world();
  T({ task_name: '超過タスク', deadline: jstDate(-1) });
  T({ task_name: '今日期限タスク', deadline: jstDate(0) });
  const w = T({ task_name: '待機タスク', assigned_agent_id: 'AGT-MUSE' });
  g.TaskService.changeStatus(w.task_id, 'WAITING', '素材待ち');
  const r = g.ReportService.generate('morning');
  assert.strictEqual(r.title, '朝の当日タスク一覧');
  assert.match(r.headline, /今日が期限 1件・期限超過 1件/);
  assert.ok(r.text.includes('超過タスク'));
  assert.ok(r.text.includes('今日期限タスク'));
  assert.ok(r.text.includes('待機タスク（冬キャンペーン／Muse）：素材待ち'));
});

test('昼の中間経過：本日完了・今日期限の残り・午後の優先タスク・止まっているタスク', () => {
  const { g, T } = world();
  const done = T({ task_name: '午前に完了', assigned_agent_id: 'AGT-MUSE' });
  for (const s of ['READY', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']) g.TaskService.changeStatus(done.task_id, s);
  T({ task_name: '今日期限の残り', deadline: jstDate(0), priority: 'HIGH' });
  T({ task_name: '昨日期限', deadline: jstDate(-1), priority: 'CRITICAL' });
  const ip = T({ task_name: '作業中のもの', assigned_agent_id: 'AGT-CLAUDE-CODE', priority: 'LOW' });
  for (const s of ['READY', 'ASSIGNED', 'IN_PROGRESS']) g.TaskService.changeStatus(ip.task_id, s);
  const b = T({ task_name: '前提待ち', dependency_task_ids: ip.task_id });
  g.TaskService.changeStatus(b.task_id, 'BLOCKED');
  T({ task_name: '来週', deadline: jstDate(7) });

  const r = g.ReportService.generate('midday', { save: true });
  assert.strictEqual(r.title, '昼の中間経過');
  assert.match(r.date_label, /時点$/);
  assert.match(r.headline, /本日完了 1件/);
  const sec = Object.fromEntries(r.sections.map((s) => [s.heading.replace(/（\d+件）$/, ''), Array.from(s.items)]));
  assert.ok(sec['本日完了したタスク'][0].startsWith('午前に完了'));
  assert.deepStrictEqual(sec['今日が期限で未完了'].map((x) => x.split('（')[0]), ['今日期限の残り']);
  // 午後の優先：最優先(期限超過) → 高(今日期限) → 低(作業中)
  assert.deepStrictEqual(sec['午後に優先して進めるタスク'].map((x) => x.split('（')[0]), ['昨日期限', '今日期限の残り', '作業中のもの']);
  assert.ok(sec['止まっているタスク（利用待ち・前提待ち・失敗）'][0].startsWith('前提待ち'));
  assert.ok(!r.text.includes('来週'));
  // 保存されて最新レポートとして取得できる
  const latest = g.api('reports.latest').data;
  assert.strictEqual(latest.midday.text, r.text);
  assert.strictEqual(latest.morning, null);
});

test('夕方の進捗集計：プロジェクト別進捗・明日期限・自動処理エラー', () => {
  const { g, T, repo } = world();
  const a = T({ task_name: 'A', assigned_agent_id: 'AGT-MUSE' });
  for (const s of ['READY', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']) g.TaskService.changeStatus(a.task_id, s);
  T({ task_name: '明日期限のB', deadline: jstDate(1) });
  repo.withLock(() => repo.insert('ExecutionLogs', { execution_type: 'QUEUE_CHECK', start_time: g.Util.nowIso(), result: 'FAILED', error_message: 'x' }));
  const r = g.ReportService.generate('evening');
  assert.ok(r.text.includes('冬キャンペーン：進捗 50%（1/2）・本日完了 1'), r.text);
  assert.ok(r.text.includes('明日期限のB'));
  assert.ok(r.text.includes('自動処理のエラー（本日）\n・1件'));
  assert.throws(() => g.ReportService.generate('night'), /不明なレポート種別/);
});

// ---- 定期処理の入口 ----
test('定期処理：各ジョブが動作し、レポートは通知として保存、実行履歴が残る', () => {
  const { g, T, repo } = world();
  T({ task_name: 'Instagram 投稿', deadline: jstDate(0) });
  assert.strictEqual(g.jobQueueCheck().assigned, 1);
  assert.ok(g.jobDeadlineCheck().due_soon >= 1);
  assert.strictEqual(g.jobDailyPlan().ok, true);
  assert.strictEqual(g.jobMiddayCheck().ok, true);
  assert.strictEqual(g.jobDailySummary().ok, true);
  assert.ok(g.jobBackup().name.startsWith('AI統合管制システム_DB_backup_'));
  const types = repo.findAll('Notifications').map((n) => n.notification_type);
  for (const t of ['DAILY_PLAN', 'MIDDAY_CHECK', 'DAILY_SUMMARY']) assert.ok(types.includes(t), t);
  const execTypes = repo.findAll('ExecutionLogs').map((l) => l.execution_type);
  for (const t of ['QUEUE_CHECK', 'REPORT_MORNING', 'REPORT_MIDDAY', 'REPORT_EVENING', 'BACKUP']) assert.ok(execTypes.includes(t), t);
});

test('定期処理：失敗しても例外を投げず、実行履歴とCRITICAL通知を残す', () => {
  const { g, repo } = world();
  g.ReportService.generate = () => { throw new Error('模擬障害'); };
  const orig = console.error; console.error = () => {};
  const r = g.jobMiddayCheck();
  console.error = orig;
  assert.strictEqual(r.ok, false);
  assert.ok(repo.findAll('ExecutionLogs').some((l) => l.execution_type === 'REPORT_MIDDAY' && l.result === 'FAILED' && l.error_message === '模擬障害'));
  assert.ok(g.NotificationService.list().some((n) => n.notification_type === 'JOB_FAILED_REPORT_MIDDAY' && n.severity === 'CRITICAL'));
});

test('定期処理：オーナー以外が画面から呼んでも実行されない', () => {
  const { g } = world();
  g.Session.getActiveUser = () => ({ getEmail: () => 'editor@example.com' });
  assert.throws(() => g.jobBackup(), (e) => e.code === 'FORBIDDEN');
  g.Session.getActiveUser = () => ({ getEmail: () => '' }); // トリガー実行（利用者情報なし）は許可
  assert.ok(g.jobDailyPlan().ok);
});

// ---- トリガー ----
test('トリガー登録：6種類を設定どおりに作成（朝7時・昼13時・夕17時・3時）、再実行しても重複しない', () => {
  const { g, mocks } = world();
  const r = g.setupTriggers();
  assert.strictEqual(r.created.length, 6);
  const trig = mocks.state.triggers;
  const by = Object.fromEntries(trig.map((t) => [t.handler, t]));
  assert.deepStrictEqual([by.jobQueueCheck.type, by.jobQueueCheck.value], ['minutes', 5]);
  assert.deepStrictEqual([by.jobDeadlineCheck.type, by.jobDeadlineCheck.value], ['minutes', 15]);
  assert.strictEqual(by.jobDailyPlan.hour, 7);
  assert.strictEqual(by.jobMiddayCheck.hour, 13);
  assert.strictEqual(by.jobDailySummary.hour, 17);
  assert.strictEqual(by.jobBackup.hour, 3);
  assert.ok(trig.every((t) => t.type === 'minutes' || t.tz === 'Asia/Tokyo'));
  g.setupTriggers();
  assert.strictEqual(mocks.state.triggers.length, 6);
  const st = g.api('triggers.status').data;
  assert.strictEqual(st.all_installed, true);
  assert.strictEqual(st.runs_per_day, 288 + 96 + 4);
});

test('トリガー：設定画面で時刻を変えると自動で再設定、間隔は 1/5/10/15/30 のみ', () => {
  const { g, mocks } = world();
  g.setupTriggers();
  const r = g.api('settings.update', { key: 'MIDDAY_CHECK_HOUR', value: '12' });
  assert.strictEqual(r.data.triggers_reinstalled, true);
  assert.strictEqual(mocks.state.triggers.find((t) => t.handler === 'jobMiddayCheck').hour, 12);
  assert.strictEqual(g.api('settings.update', { key: 'QUEUE_CHECK_INTERVAL_MIN', value: '7' }).error.code, 'VALIDATION');
  g.api('settings.update', { key: 'QUEUE_CHECK_INTERVAL_MIN', value: '10' });
  assert.strictEqual(mocks.state.triggers.find((t) => t.handler === 'jobQueueCheck').value, 10);
  assert.strictEqual(mocks.state.triggers.length, 6);
  assert.strictEqual(g.api('triggers.uninstall').data.removed, 6);
  assert.strictEqual(mocks.state.triggers.length, 0);
});

test('トリガー：オーナー以外は登録・確認できない', () => {
  const { g } = world();
  g.SettingsService.update('ALLOWED_USERS', 'editor@example.com:EDITOR');
  g.Session.getActiveUser = () => ({ getEmail: () => 'editor@example.com' });
  assert.strictEqual(g.api('triggers.install').error.code, 'FORBIDDEN');
  assert.throws(() => g.setupTriggers(), (e) => e.code === 'FORBIDDEN');
});

// ---- バックアップ ----
test('バックアップ：Drive フォルダに複製し、保持世代数を超えた分はゴミ箱へ（完全削除しない）', () => {
  const { g, mocks } = world();
  g.SettingsService.update('BACKUP_RETENTION_COUNT', '2');
  g.api('backup.runNow'); g.api('backup.runNow');
  const r = g.api('backup.runNow').data;
  assert.strictEqual(r.trashed, 1);
  assert.strictEqual(r.kept, 2);
  const folder = mocks.state.files[mocks.state.props.BACKUP_FOLDER_ID];
  assert.strictEqual(folder.children.length, 3);
  assert.strictEqual(folder.children.filter((f) => f.trashed).length, 1);
  assert.strictEqual(folder.children.find((f) => f.trashed), folder.children[0], '最も古いものをゴミ箱へ');
});

test('既存環境のセットアップ再実行で、新しい設定（昼13時）が追加される', () => {
  const { g, repo } = world();
  repo.withLock(() => {
    const sheet = g.SheetsRepository._getSpreadsheet().getSheetByName('Settings');
    sheet.data = sheet.data.filter((r) => r[0] !== 'MIDDAY_CHECK_HOUR');
  });
  repo.resetCache();
  assert.strictEqual(repo.findById('Settings', 'MIDDAY_CHECK_HOUR'), null);
  const report = g.Setup.run();
  assert.deepStrictEqual(Array.from(report.settingsAdded), ['MIDDAY_CHECK_HOUR']);
  assert.strictEqual(repo.findById('Settings', 'MIDDAY_CHECK_HOUR').setting_value, '13');
});
