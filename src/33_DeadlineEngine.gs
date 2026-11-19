/**
 * 33_DeadlineEngine.gs
 * 期限・進捗確認（定期処理：15分間隔）。
 *
 * - 期限が近いタスク（DEADLINE_WARNING_HOURS 以内）を検出して通知
 * - 期限超過を検出して通知
 * - 期限超過タスクの後続タスクへの影響を確認し、スケジュールの再調整案を作成
 *   （再調整案は通知として提示するだけで、自動ではタスクの日付を書き換えない）
 * 同じタスクの同じ種類の通知は、未読のうちは重複して作らない。
 */

var DeadlineEngine = (function () {
  var DAY = 86400000;

  function ymd(date) { return Util.toIso(date).slice(0, 10); }

  /**
   * 再調整案：期限超過日数ぶん、後続タスクの開始予定・期限を後ろにずらす案（純粋関数）
   * 戻り値：[{ task_id, task_name, current_deadline, proposed_deadline, current_start, proposed_start }]
   */
  function proposeReschedule(overdueTask, successors, now) {
    var deadline = Util.parseDate(overdueTask.deadline);
    if (!deadline) return [];
    // 少なくとも1日、超過日数（切り上げ）だけずらす
    var shiftDays = Math.max(1, Math.ceil((now.getTime() - deadline.getTime()) / DAY));
    return successors.map(function (t) {
      var d = Util.parseDate(t.deadline), s = Util.parseDate(t.start_date);
      return {
        task_id: t.task_id, task_name: t.task_name, shift_days: shiftDays,
        current_deadline: t.deadline || '', proposed_deadline: d ? ymd(new Date(d.getTime() + shiftDays * DAY)) : '',
        current_start: t.start_date || '', proposed_start: s ? ymd(new Date(s.getTime() + shiftDays * DAY)) : ''
      };
    });
  }

  function run(options) {
    options = options || {};
    var triggeredBy = options.triggered_by || 'SYSTEM';
    var outcome = Repository.get().tryWithLock(function () {
      return Auth.runAsSystem(function () { return process(triggeredBy); });
    });
    if (!outcome.locked) return { skipped: true, reason: '前回の処理が実行中のためスキップしました' };
    return outcome.result;
  }

  function process(triggeredBy) {
    var repo = Repository.get();
    var now = new Date();
    var startIso = Util.nowIso();
    var warnHours = SettingsService.getNumber('DEADLINE_WARNING_HOURS', 48);
    var soonLimit = new Date(now.getTime() + warnHours * 3600000);
    var all = repo.findAll('Tasks');
    var byId = {};
    all.forEach(function (t) { byId[t.task_id] = t; });
    var deps = repo.findAll('Dependencies');
    var summary = { due_soon: 0, overdue: 0, impacted: 0, proposals: 0, notified: 0, errors: 0 };

    all.filter(function (t) { return !StateMachine.isTerminal(t.status); }).forEach(function (t) {
      try {
        var d = Util.parseDate(t.deadline);
        if (!d) return;
        if (d < now) {
          summary.overdue++;
          if (NotificationService.createOnce('OVERDUE', '期限超過：「' + t.task_name + '」（期限 ' + t.deadline.slice(0, 16).replace('T', ' ') + '・' + (Config.TASK_STATUS_LABEL[t.status] || t.status) + '）',
            { task_id: t.task_id, severity: 'CRITICAL' })) summary.notified++;

          var successors = DependencyGraph.allSuccessorsOf(t.task_id, deps)
            .map(function (id) { return byId[id]; })
            .filter(function (s) { return s && !StateMachine.isTerminal(s.status); });
          if (successors.length) {
            summary.impacted += successors.length;
            var plan = proposeReschedule(t, successors, now);
            var lines = plan.map(function (p) {
              return '・' + p.task_name + '：期限 ' + (p.current_deadline ? p.current_deadline.slice(0, 10) + ' → ' + p.proposed_deadline : '未設定') +
                (p.current_start ? '／開始 ' + p.current_start.slice(0, 10) + ' → ' + p.proposed_start : '');
            });
            if (NotificationService.createOnce('RESCHEDULE_PROPOSAL',
              '再調整案：「' + t.task_name + '」の期限超過により後続 ' + successors.length + '件に影響があります。' + plan[0].shift_days + '日ずらす案：\n' + lines.join('\n') +
              '\n（自動では変更しません。採用する場合は各タスクの期限を編集してください）',
              { task_id: t.task_id, severity: 'WARN' })) { summary.proposals++; summary.notified++; }
          }
        } else if (d <= soonLimit) {
          summary.due_soon++;
          if (NotificationService.createOnce('DEADLINE_SOON', '期限間近：「' + t.task_name + '」（期限 ' + t.deadline.slice(0, 16).replace('T', ' ') + '・' + (Config.TASK_STATUS_LABEL[t.status] || t.status) + '）',
            { task_id: t.task_id, severity: 'WARN' })) summary.notified++;
        }
      } catch (e) {
        summary.errors++;
        AuditService.logExecution({ task_id: t.task_id, execution_type: 'DEADLINE_CHECK', result: 'FAILED', error_message: e && e.message ? e.message : String(e), triggered_by: triggeredBy });
      }
    });

    if (summary.notified || summary.errors) {
      repo.insert('ExecutionLogs', {
        task_id: '', agent_id: 'AGT-RULE-ENGINE', execution_type: 'DEADLINE_CHECK', start_time: startIso, end_time: Util.nowIso(),
        result: summary.errors ? 'PARTIAL' : 'SUCCESS',
        error_message: '期限超過' + summary.overdue + '・期限間近' + summary.due_soon + '・後続影響' + summary.impacted + '・再調整案' + summary.proposals + '・新規通知' + summary.notified,
        retry_count: 0, triggered_by: triggeredBy
      });
    }
    return summary;
  }

  return { run: run, proposeReschedule: proposeReschedule };
})();
