const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./gas-loader');

const g = loadGas({}, ['00_Config.gs', '01_Util.gs']);
const { Config, Util } = g;

test('指示書で指定された9シートと追加2シートが定義されている', () => {
  const expected = ['Projects', 'Tasks', 'Agents', 'Deliverables', 'Dependencies', 'ExecutionLogs',
    'Approvals', 'Settings', 'Notifications', 'AuditLogs', 'AssignmentRules'];
  assert.deepStrictEqual(Object.keys(Config.SHEETS), expected);
});

test('指示書の指定列がすべて含まれ、順序も指定どおり先頭にある', () => {
  const spec = {
    Projects: ['project_id', 'project_name', 'description', 'priority', 'start_date', 'deadline', 'status', 'created_at', 'updated_at'],
    Tasks: ['task_id', 'project_id', 'parent_task_id', 'task_name', 'description', 'assigned_agent_id', 'priority', 'status', 'start_date', 'deadline', 'estimated_hours', 'actual_hours', 'dependency_task_ids', 'retry_count', 'created_at', 'updated_at'],
    Agents: ['agent_id', 'agent_name', 'provider', 'role', 'capabilities', 'connection_type', 'availability', 'usage_limit_status', 'enabled', 'notes'],
    Deliverables: ['deliverable_id', 'task_id', 'file_name', 'file_url', 'version', 'submitted_by', 'submitted_at', 'review_status', 'review_comment'],
    Dependencies: ['dependency_id', 'predecessor_task_id', 'successor_task_id', 'dependency_type', 'status'],
    ExecutionLogs: ['execution_id', 'task_id', 'agent_id', 'execution_type', 'start_time', 'end_time', 'result', 'error_message', 'retry_count'],
    Approvals: ['approval_id', 'task_id', 'action_type', 'approval_status', 'requested_at', 'approved_at', 'approver', 'comment'],
    Settings: ['setting_key', 'setting_value', 'description'],
    Notifications: ['notification_id', 'task_id', 'notification_type', 'message', 'created_at', 'read_status']
  };
  for (const [sheet, cols] of Object.entries(spec)) {
    assert.deepStrictEqual(Array.from(Config.SHEETS[sheet].columns.slice(0, cols.length)), cols, sheet);
  }
});

test('各シートで列名の重複がなく、IDの列が先頭', () => {
  for (const [name, def] of Object.entries(Config.SHEETS)) {
    assert.strictEqual(new Set(def.columns).size, def.columns.length, name);
    assert.strictEqual(def.columns[0], def.idColumn, name);
  }
});

test('タスク状態は指示書の11種類', () => {
  assert.deepStrictEqual(Object.keys(Config.TASK_STATUS),
    ['BACKLOG', 'READY', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'REVIEW', 'APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED']);
  for (const s of Object.keys(Config.TASK_STATUS)) assert.ok(Config.TASK_STATUS_LABEL[s], s);
});

test('初期設定：朝7時・昼13時・夕17時・バックアップ3時', () => {
  const s = Object.fromEntries(Config.DEFAULT_SETTINGS.map((r) => [r[0], r[1]]));
  assert.strictEqual(s.DAILY_PLAN_HOUR, '7');
  assert.strictEqual(s.MIDDAY_CHECK_HOUR, '13');
  assert.strictEqual(s.DAILY_SUMMARY_HOUR, '17');
  assert.strictEqual(s.BACKUP_HOUR, '3');
});

test('初期エージェント4件と、割り振りルールの参照先が実在する', () => {
  const ids = Config.DEFAULT_AGENTS.map((a) => a.agent_id);
  assert.strictEqual(ids.length, 4);
  for (const r of Config.DEFAULT_RULES) {
    assert.ok(ids.includes(r.preferred_agent_id), r.rule_id);
    const agent = Config.DEFAULT_AGENTS.find((a) => a.agent_id === r.preferred_agent_id);
    assert.ok(agent.capabilities.split(',').includes(r.required_capability), r.rule_id);
    new RegExp(r.keyword_pattern, 'i'); // 正規表現として有効
  }
});

test('Util: 日時は日本時間 ISO 形式', () => {
  assert.strictEqual(Util.toIso(new Date('2026-11-17T00:00:00Z')), '2026-11-17T09:00:00+09:00');
  assert.strictEqual(Util.parseDate('2026-11-17').toISOString(), '2026-11-17T14:59:59.000Z');
  assert.strictEqual(Util.parseDate(''), null);
  assert.strictEqual(Util.parseDate('abc'), null);
});

test('Util: ID 生成形式と一意性', () => {
  const id = Util.generateId('TSK');
  assert.match(id, /^TSK-\d{14}-[A-Z2-9]{4}$/);
  const many = new Set(Array.from({ length: 500 }, () => Util.generateId('TSK')));
  assert.ok(many.size >= 499);
});

test('Util: リスト・真偽値・HTMLエスケープ', () => {
  assert.deepStrictEqual(Array.from(Util.splitList(' a, b,,c ')), ['a', 'b', 'c']);
  assert.strictEqual(Util.joinList(['a', ' b ']), 'a,b');
  assert.strictEqual(Util.toBool('TRUE'), true);
  assert.strictEqual(Util.toBool(''), false);
  assert.strictEqual(Util.escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
});

test('Util: 入力検証', () => {
  assert.throws(() => Util.validate('名前', '', { required: true }), /必須/);
  assert.strictEqual(Util.validate('時間', '1.5', { type: 'number', min: 0 }), 1.5);
  assert.throws(() => Util.validate('時間', '-1', { type: 'number', min: 0 }), /以上/);
  assert.strictEqual(Util.validate('優先度', 'HIGH', { type: 'enum', values: Config.PRIORITY }), 'HIGH');
  assert.throws(() => Util.validate('優先度', 'X', { type: 'enum', values: Config.PRIORITY }), /不正/);
  assert.throws(() => Util.validate('URL', 'javascript:alert(1)', { type: 'url' }), /https/);
  assert.strictEqual(Util.validate('期限', '2026-12-01', { type: 'date' }), '2026-12-01');
  assert.throws(() => Util.validate('説明', 'x'.repeat(11), { maxLength: 10 }), /以内/);
});
