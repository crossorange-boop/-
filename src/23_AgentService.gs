/**
 * 23_AgentService.gs
 * AIエージェント管理。エージェントは削除せず enabled=FALSE で停止する（履歴保持のため）。
 */

var AgentService = (function () {
  var ACTIVE_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'APPROVAL', 'WAITING'];

  function normalize(input, isCreate) {
    var out = {};
    if (isCreate || input.agent_name !== undefined) out.agent_name = Util.validate('AI名', input.agent_name, { required: true, maxLength: 100 });
    if (input.provider !== undefined) out.provider = Util.validate('提供元', input.provider, { maxLength: 100 });
    if (input.role !== undefined) out.role = Util.validate('担当業務', input.role, { maxLength: 500 });
    if (input.capabilities !== undefined) out.capabilities = Util.splitList(input.capabilities).map(function (c) {
      var v = c.toLowerCase();
      if (!/^[a-z0-9_]{1,40}$/.test(v)) throw new Util.ValidationError('能力は半角英小文字・数字・_ で入力してください: ' + c);
      return v;
    }).join(',');
    if (isCreate || input.connection_type !== undefined) out.connection_type = Util.validate('接続方式', input.connection_type || 'MANUAL_QUEUE', { type: 'enum', values: Config.CONNECTION_TYPE });
    if (isCreate || input.availability !== undefined) out.availability = Util.validate('稼働状態', input.availability || 'AVAILABLE', { type: 'enum', values: Config.AGENT_AVAILABILITY });
    if (isCreate || input.usage_limit_status !== undefined) out.usage_limit_status = Util.validate('利用制限', input.usage_limit_status || 'OK', { type: 'enum', values: Config.USAGE_LIMIT_STATUS });
    if (isCreate || input.enabled !== undefined) out.enabled = input.enabled === undefined ? true : Util.toBool(input.enabled);
    if (input.notes !== undefined) out.notes = Util.validate('メモ', input.notes, { maxLength: 2000 });
    if (isCreate || input.priority !== undefined) out.priority = Util.validate('優先度', input.priority === undefined || input.priority === '' ? 5 : input.priority, { type: 'number', min: 1 });
    if (isCreate || input.max_concurrent_tasks !== undefined) out.max_concurrent_tasks = Util.validate('同時担当上限', input.max_concurrent_tasks === undefined || input.max_concurrent_tasks === '' ? 5 : input.max_concurrent_tasks, { type: 'number', min: 1 });
    return out;
  }

  /** 今すぐ新しいタスクを担当できる状態か */
  function isUsable(agent) {
    return Util.toBool(agent.enabled) && agent.availability === 'AVAILABLE' &&
      (agent.usage_limit_status === 'OK' || agent.usage_limit_status === 'NEAR_LIMIT' || agent.usage_limit_status === '');
  }

  function unusableReason(agent) {
    if (!agent) return '担当AIが登録されていません';
    if (!Util.toBool(agent.enabled)) return agent.agent_name + ' は停止中（無効）です';
    if (agent.availability !== 'AVAILABLE') return agent.agent_name + ' は ' + agent.availability + ' です';
    if (!isUsable(agent)) return agent.agent_name + ' は利用制限中（' + agent.usage_limit_status + '）です';
    return '';
  }

  function activeTaskCounts() {
    var counts = {};
    Repository.get().findAll('Tasks').forEach(function (t) {
      if (t.assigned_agent_id && ACTIVE_STATUSES.indexOf(t.status) >= 0) counts[t.assigned_agent_id] = (counts[t.assigned_agent_id] || 0) + 1;
    });
    return counts;
  }

  function list() {
    var counts = activeTaskCounts();
    return Repository.get().findAll('Agents').map(function (a) {
      a.active_task_count = counts[a.agent_id] || 0;
      a.usable = isUsable(a);
      return a;
    });
  }

  function get(agentId) {
    var repo = Repository.get();
    var a = repo.findById('Agents', agentId);
    if (!a) throw new Util.AppError('NOT_FOUND', 'AIエージェントが見つかりません');
    a.usable = isUsable(a);
    a.active_task_count = activeTaskCounts()[agentId] || 0;
    a.executions = repo.findAll('ExecutionLogs').filter(function (e) { return e.agent_id === agentId; }).slice(-50).reverse();
    a.queue = TaskService.list({ agent_id: agentId, status: 'ASSIGNED,IN_PROGRESS,WAITING,REVIEW' });
    return a;
  }

  function create(input) {
    Auth.require('EDITOR');
    input = input || {};
    var rec = normalize(input, true);
    if (input.agent_id) {
      if (!/^AGT-[A-Z0-9-]{2,40}$/.test(input.agent_id)) throw new Util.ValidationError('AI ID は「AGT-英大文字・数字・-」で入力してください');
      rec.agent_id = input.agent_id;
    }
    rec.last_status_changed_at = Util.nowIso();
    return Repository.get().withLock(function () {
      var saved = Repository.get().insert('Agents', rec);
      AuditService.record('CREATE', 'Agents', saved.agent_id, null, saved);
      return saved;
    });
  }

  function update(agentId, input, expectedVersion) {
    Auth.require('EDITOR');
    var patch = normalize(input || {}, false);
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var before = repo.findById('Agents', agentId);
      if (!before) throw new Util.AppError('NOT_FOUND', 'AIエージェントが見つかりません');
      var statusChanged = ['availability', 'usage_limit_status', 'enabled'].some(function (k) {
        return patch[k] !== undefined && String(patch[k] === true ? 'TRUE' : patch[k] === false ? 'FALSE' : patch[k]) !== before[k];
      });
      if (statusChanged) patch.last_status_changed_at = Util.nowIso();
      var res = repo.update('Agents', agentId, patch, { expectedVersion: expectedVersion });
      AuditService.record('UPDATE', 'Agents', agentId, res.before, res.after);
      if (statusChanged) {
        var was = isUsable(res.before), now = isUsable(res.after);
        if (was && !now) {
          NotificationService.create('AGENT_UNAVAILABLE', unusableReason(res.after) + '。担当タスクは利用待ち（WAITING）として保持されます。', { severity: 'WARN' });
        } else if (!was && now) {
          NotificationService.create('AGENT_RECOVERED', res.after.agent_name + ' が利用可能になりました。利用待ちのタスクは次回の定期処理で再開候補に戻ります。', { severity: 'INFO' });
        }
      }
      return res.after;
    });
  }

  /** 稼働状態・利用制限だけを変更する（スマホからの素早い切替用） */
  function setStatus(agentId, availability, usageLimitStatus, notes) {
    var input = {};
    if (availability) input.availability = availability;
    if (usageLimitStatus) input.usage_limit_status = usageLimitStatus;
    if (notes !== undefined && notes !== null) input.notes = notes;
    return update(agentId, input);
  }

  return {
    list: list, get: get, create: create, update: update, setStatus: setStatus,
    isUsable: isUsable, unusableReason: unusableReason, activeTaskCounts: activeTaskCounts, ACTIVE_STATUSES: ACTIVE_STATUSES
  };
})();
