const test = require('node:test');
const assert = require('node:assert');
const { bootstrap } = require('./helpers');
const { seedDemo } = require('../tools/demo-data');

test('スケジュール：期限順、期限超過の後続への影響、前提遅延、カレンダー連携用データ', () => {
  const { g } = bootstrap();
  seedDemo(g);
  const r = g.api('schedule.timeline', { filter: {} }).data;
  assert.match(r.today, /^\d{4}-\d{2}-\d{2}$/);
  const withDeadline = r.items.filter((i) => i.deadline).map((i) => i.deadline);
  assert.deepStrictEqual(withDeadline, [...withDeadline].sort());
  assert.ok(r.items.every((i) => i.status !== 'COMPLETED' && i.status !== 'CANCELLED'));
  const design = r.items.find((i) => i.task_name === 'トップページのデザイン案');
  assert.strictEqual(design.is_overdue, true);
  assert.deepStrictEqual(Array.from(design.impacted_successors, (s) => s.task_name), ['公開前チェック']);
  const check = r.items.find((i) => i.task_name === '公開前チェック');
  assert.strictEqual(check.delayed_by_predecessor, true);
  assert.strictEqual(check.calendar.source_id, check.task_id);
  assert.strictEqual(check.calendar.end, check.deadline);
  const withDone = g.api('schedule.timeline', { filter: { include_completed: true } }).data;
  assert.ok(withDone.items.some((i) => i.status === 'COMPLETED'));
  const onlyMuse = g.api('schedule.timeline', { filter: { agent_id: 'AGT-MUSE' } }).data;
  assert.ok(onlyMuse.items.length > 0 && onlyMuse.items.every((i) => i.assigned_agent_id === 'AGT-MUSE'));
});
