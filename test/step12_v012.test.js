const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');

const DAY = 86400000;
const jstDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY + 9 * 3600000).toISOString().slice(0, 10);

function world() {
  const env = bootstrap();
  const { g } = env;
  const prj = g.ProjectService.create({ project_name: 'Lifora', status: 'ACTIVE' });
  const T = (d) => g.TaskService.create(Object.assign({ project_id: prj.project_id }, d));
  return { ...env, prj, T, repo: g.Repository.get() };
}

/** シートの status 列を直接書き換える（他ツールで書き込まれた状態を再現） */
function writeRawStatus(ss, taskId, value) {
  const sheet = ss().getSheetByName('Tasks');
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const col = values[0].indexOf('status');
  const idCol = values[0].indexOf('task_id');
  const row = values.findIndex((r) => r[idCol] === taskId);
  sheet.getRange(row + 1, col + 1, 1, 1).setValues([[value]]);
}

test('状態名のゆれ（純粋関数）：DONE・完了などは COMPLETED、正式名・不明値はそのまま', () => {
  const { g } = bootstrap({ setup: false });
  const n = g.Config.normalizeTaskStatus;
  assert.strictEqual(n('DONE'), 'COMPLETED');
  assert.strictEqual(n('done'), 'COMPLETED');
  assert.strictEqual(n(' 完了 '), 'COMPLETED');
  assert.strictEqual(n('Canceled'), 'CANCELLED');
  assert.strictEqual(n('in progress'), 'IN_PROGRESS');
  assert.strictEqual(n('ASSIGNED'), 'ASSIGNED');
  assert.strictEqual(n('???'), '???');
  assert.strictEqual(n(''), '');
});

test('DONE と書かれたタスクは完了として扱い、期限超過に数えない。setupSystem でシートも COMPLETED に揃う', () => {
  const { g, T, repo, ss } = world();
  const done = T({ task_name: 'チラシ確定', deadline: jstDate(-1) });
  const open = T({ task_name: '置き場所を決める', deadline: jstDate(-1) });
  writeRawStatus(ss, done.task_id, 'DONE');
  repo.resetCache();

  assert.strictEqual(repo.findById('Tasks', done.task_id).status, 'COMPLETED');
  const overdue = g.TaskService.list({ overdue: true }).map((t) => t.task_name);
  assert.deepStrictEqual(overdue, ['置き場所を決める']);
  assert.strictEqual(g.DeadlineEngine.run().overdue, 1);

  const report = g.Setup.run();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(report.statusesNormalized)), { DONE: 1 });
  const sheet = ss().getSheetByName('Tasks');
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const col = values[0].indexOf('status');
  assert.ok(values.slice(1).every((r) => r[col] !== 'DONE'));
  // 2回目は書き換え対象なし
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.Setup.run().statusesNormalized)), {});
  assert.ok(open);
});

test('夕方の進捗集計：今日が期限で未完了のものは、23:59 前でも数える', () => {
  const { g, T } = world();
  T({ task_name: '今日期限のLifora', deadline: jstDate(0) });
  const r = g.ReportService.generate('evening');
  const sec = Object.fromEntries(r.sections.map((s) => [s.heading.replace(/（\d+件）$/, ''), Array.from(s.items)]));
  assert.deepStrictEqual(sec['今日が期限なのに未完了'].map((x) => x.split('（')[0]), ['今日期限のLifora']);
  assert.match(r.headline, /今日期限で未完了 1件/);
});
