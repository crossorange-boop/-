/**
 * 20_AuditService.gs
 * 変更・削除履歴（AuditLogs）と実行履歴（ExecutionLogs）の記録。
 * 監査ログは追記のみで、更新・削除しない。
 */

var AuditService = (function () {
  var MAX_JSON = 40000; // セル上限（50,000文字）より手前で切り詰める

  function toJson(obj) {
    if (obj === null || obj === undefined) return '';
    var s = JSON.stringify(obj);
    return s.length > MAX_JSON ? s.slice(0, MAX_JSON) + '…(truncated)' : s;
  }

  /** action: CREATE / UPDATE / DELETE / RESTORE / STATUS_CHANGE / APPROVE / REJECT / SETUP など */
  function record(action, entityType, entityId, before, after) {
    return Repository.get().insert('AuditLogs', {
      timestamp: Util.nowIso(), user: Auth.actorName(), action: action,
      entity_type: entityType, entity_id: entityId, before_json: toJson(before), after_json: toJson(after)
    });
  }

  /** 実行履歴の開始を記録し、終了時に呼ぶ finish 関数を返す */
  function startExecution(params) {
    var rec = Repository.get().insert('ExecutionLogs', {
      task_id: params.task_id || '', agent_id: params.agent_id || '', execution_type: params.execution_type,
      start_time: Util.nowIso(), end_time: '', result: '', error_message: '',
      retry_count: params.retry_count || 0, triggered_by: params.triggered_by || Auth.actorName()
    });
    return function finish(result, errorMessage) {
      return Repository.get().update('ExecutionLogs', rec.execution_id, {
        end_time: Util.nowIso(), result: result, error_message: errorMessage ? String(errorMessage).slice(0, 2000) : ''
      }).after;
    };
  }

  /** 開始と終了を同時に記録（短い処理用） */
  function logExecution(params) {
    return Repository.get().insert('ExecutionLogs', {
      task_id: params.task_id || '', agent_id: params.agent_id || '', execution_type: params.execution_type,
      start_time: params.start_time || Util.nowIso(), end_time: Util.nowIso(), result: params.result || 'SUCCESS',
      error_message: params.error_message ? String(params.error_message).slice(0, 2000) : '',
      retry_count: params.retry_count || 0, triggered_by: params.triggered_by || Auth.actorName()
    });
  }

  function recentActivity(limit) {
    var repo = Repository.get();
    var audits = repo.findAll('AuditLogs').map(function (a) {
      return { kind: 'AUDIT', time: a.timestamp, user: a.user, action: a.action, entity_type: a.entity_type, entity_id: a.entity_id };
    });
    var execs = repo.findAll('ExecutionLogs').map(function (e) {
      return { kind: 'EXECUTION', time: e.start_time, user: e.triggered_by, action: e.execution_type, entity_type: 'Task',
        entity_id: e.task_id, result: e.result, error_message: e.error_message };
    });
    return audits.concat(execs)
      .sort(function (a, b) { return a.time < b.time ? 1 : a.time > b.time ? -1 : 0; })
      .slice(0, limit || 20);
  }

  return { record: record, startExecution: startExecution, logExecution: logExecution, recentActivity: recentActivity };
})();
