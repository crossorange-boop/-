/**
 * 27_ScheduleService.gs
 * スケジュール表示用の集計（読み取り専用）。
 *
 * 各項目に calendar（title/start/end/source_id）を持たせ、
 * 将来の Google Calendar 双方向同期（Phase 2）でそのまま使える形にしている。
 */

var ScheduleService = (function () {
  /** filter: { project_id, agent_id, include_completed } */
  function timeline(filter) {
    filter = filter || {};
    var repo = Repository.get();
    var now = new Date();
    var warnHours = SettingsService.getNumber('DEADLINE_WARNING_HOURS', 48);
    var soon = new Date(now.getTime() + warnHours * 3600 * 1000);
    var deps = repo.findAll('Dependencies');
    var all = repo.findAll('Tasks');
    var taskMap = {};
    all.forEach(function (t) { taskMap[t.task_id] = t; });
    var projectNames = {}, agentNames = {};
    repo.findAll('Projects').forEach(function (p) { projectNames[p.project_id] = p.project_name; });
    repo.findAll('Agents').forEach(function (a) { agentNames[a.agent_id] = a.agent_name; });

    var items = all.filter(function (t) {
      if (t.status === 'CANCELLED') return false;
      if (!filter.include_completed && t.status === 'COMPLETED') return false;
      if (filter.project_id && t.project_id !== filter.project_id) return false;
      if (filter.agent_id && t.assigned_agent_id !== filter.agent_id) return false;
      return true;
    }).map(function (t) {
      var deadline = Util.parseDate(t.deadline);
      var overdue = TaskService.isOverdue(t, now);
      var preds = DependencyGraph.predecessorsOf(t.task_id, deps).map(function (id) {
        var p = taskMap[id];
        return { task_id: id, task_name: p ? p.task_name : '(削除済み)', status: p ? p.status : '',
          is_overdue: p ? TaskService.isOverdue(p, now) : false };
      });
      var succIds = DependencyGraph.allSuccessorsOf(t.task_id, deps).filter(function (id) {
        return taskMap[id] && !StateMachine.isTerminal(taskMap[id].status);
      });
      return {
        task_id: t.task_id, task_name: t.task_name, project_id: t.project_id, project_name: projectNames[t.project_id] || '',
        status: t.status, status_label: Config.TASK_STATUS_LABEL[t.status], priority: t.priority,
        assigned_agent_id: t.assigned_agent_id, agent_name: agentNames[t.assigned_agent_id] || '',
        start_date: t.start_date, deadline: t.deadline,
        is_overdue: overdue,
        due_soon: !overdue && !!deadline && deadline <= soon && !StateMachine.isTerminal(t.status),
        predecessors: preds,
        delayed_by_predecessor: preds.some(function (p) { return p.is_overdue; }),
        impacted_successors: overdue ? succIds.map(function (id) { return { task_id: id, task_name: taskMap[id].task_name }; }) : [],
        calendar: { source_id: t.task_id, title: t.task_name, start: t.start_date || t.deadline, end: t.deadline }
      };
    }).sort(function (a, b) {
      return (a.deadline || '9999').localeCompare(b.deadline || '9999') ||
        (Config.PRIORITY_ORDER[a.priority] || 9) - (Config.PRIORITY_ORDER[b.priority] || 9);
    });

    return { today: Util.toIso(now).slice(0, 10), deadline_warning_hours: warnHours, items: items };
  }

  return { timeline: timeline };
})();
