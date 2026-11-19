/**
 * 37_WorkQueueService.gs
 * 担当AI別の作業待ちキュー（外部AIと直接連携できない間の運用）。
 * 画面から指示書と必要資料をまとめて確認・コピーし、各AIに手渡しする。
 */

var WorkQueueService = (function () {
  var S = Config.TASK_STATUS;
  var QUEUE_STATUSES = [S.ASSIGNED, S.IN_PROGRESS, S.WAITING, S.REVIEW];

  /** 各AIへ貼り付ける指示書テキスト */
  function buildInstructionText(task, projectName, predecessors) {
    var lines = [];
    lines.push('【作業依頼】' + task.task_name);
    if (projectName) lines.push('プロジェクト：' + projectName);
    if (task.deadline) lines.push('期限：' + String(task.deadline).slice(0, 16).replace('T', ' '));
    if (task.priority) lines.push('優先度：' + task.priority);
    lines.push('');
    if (task.description) { lines.push('■ 概要'); lines.push(task.description); lines.push(''); }
    lines.push('■ 指示');
    lines.push(task.instruction || '（指示書が未入力です。管理画面で入力してください）');
    var refs = Util.splitList(task.reference_urls);
    if (refs.length) { lines.push(''); lines.push('■ 参考資料'); refs.forEach(function (u) { lines.push('- ' + u); }); }
    if (predecessors && predecessors.length) {
      lines.push(''); lines.push('■ 前提となる完了済みタスク');
      predecessors.forEach(function (p) { lines.push('- ' + p); });
    }
    lines.push('');
    lines.push('■ 納品');
    lines.push('成果物は Google Drive に保存し、共有リンクを管理画面のタスク（ID: ' + task.task_id + '）に登録してください。');
    return lines.join('\n');
  }

  function byAgent() {
    var repo = Repository.get();
    var now = new Date();
    var projectNames = {};
    repo.findAll('Projects').forEach(function (p) { projectNames[p.project_id] = p.project_name; });
    var all = repo.findAll('Tasks');
    var names = {};
    all.forEach(function (t) { names[t.task_id] = t.task_name; });
    var deps = repo.findAll('Dependencies');
    var tasks = AssignmentEngine.sortQueue(all.filter(function (t) { return QUEUE_STATUSES.indexOf(t.status) >= 0 && t.assigned_agent_id; }));

    var lanes = repo.findAll('Agents').map(function (a) {
      var own = tasks.filter(function (t) { return t.assigned_agent_id === a.agent_id; }).map(function (t) {
        var preds = DependencyGraph.predecessorsOf(t.task_id, deps).map(function (id) { return names[id] || id; });
        return {
          task_id: t.task_id, task_name: t.task_name, project_name: projectNames[t.project_id] || '', status: t.status,
          status_label: Config.TASK_STATUS_LABEL[t.status], priority: t.priority, deadline: t.deadline,
          is_overdue: TaskService.isOverdue(t, now), waiting_reason: t.waiting_reason, row_version: t.row_version,
          has_instruction: !!t.instruction, reference_urls: Util.splitList(t.reference_urls),
          instruction_text: buildInstructionText(t, projectNames[t.project_id], preds)
        };
      });
      return {
        agent_id: a.agent_id, agent_name: a.agent_name, connection_type: a.connection_type, usable: AgentService.isUsable(a),
        enabled: Util.toBool(a.enabled), unusable_reason: AgentService.unusableReason(a),
        max_concurrent_tasks: a.max_concurrent_tasks, tasks: own,
        counts: {
          assigned: own.filter(function (t) { return t.status === S.ASSIGNED; }).length,
          in_progress: own.filter(function (t) { return t.status === S.IN_PROGRESS; }).length,
          waiting: own.filter(function (t) { return t.status === S.WAITING; }).length,
          review: own.filter(function (t) { return t.status === S.REVIEW; }).length
        }
      };
    });
    var lastRun = repo.findAll('ExecutionLogs').filter(function (e) { return e.execution_type === 'QUEUE_CHECK'; }).slice(-1)[0] || null;
    return {
      lanes: lanes,
      unassigned_backlog: all.filter(function (t) { return [S.BACKLOG, S.READY].indexOf(t.status) >= 0; }).length,
      last_run: lastRun ? { time: lastRun.end_time || lastRun.start_time, result: lastRun.result, summary: lastRun.error_message } : null
    };
  }

  /** 画面の「今すぐ振り分け」 */
  function runNow() {
    var user = Auth.require('EDITOR');
    return QueueEngine.run({ triggered_by: user.email });
  }

  return { byAgent: byAgent, buildInstructionText: buildInstructionText, runNow: runNow };
})();
