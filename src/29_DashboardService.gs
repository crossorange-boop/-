/**
 * 29_DashboardService.gs
 * 総合ダッシュボードの集計（読み取り専用）。
 */

var DashboardService = (function () {
  /** 画面の4分類（指示書：未着手・進行中・完了・保留） */
  var GROUPS = [
    { key: 'NOT_STARTED', label: '未着手', statuses: ['BACKLOG', 'READY'] },
    { key: 'IN_PROGRESS', label: '進行中', statuses: ['ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'APPROVAL'] },
    { key: 'ON_HOLD', label: '保留', statuses: ['WAITING', 'BLOCKED', 'FAILED'] },
    { key: 'COMPLETED', label: '完了', statuses: ['COMPLETED'] }
  ];

  function summary() {
    var repo = Repository.get();
    var now = new Date();
    var warnHours = SettingsService.getNumber('DEADLINE_WARNING_HOURS', 48);
    var projects = repo.findAll('Projects');
    var tasks = repo.findAll('Tasks').filter(function (t) { return t.status !== 'CANCELLED'; });
    var projectNames = {};
    projects.forEach(function (p) { projectNames[p.project_id] = p.project_name; });

    var byStatus = {};
    Object.keys(Config.TASK_STATUS).forEach(function (s) { byStatus[s] = 0; });
    tasks.forEach(function (t) { if (byStatus[t.status] !== undefined) byStatus[t.status]++; });

    var groups = GROUPS.map(function (g) {
      return { key: g.key, label: g.label, statuses: g.statuses,
        count: g.statuses.reduce(function (n, s) { return n + byStatus[s]; }, 0) };
    });

    var brief = function (t) {
      return { task_id: t.task_id, task_name: t.task_name, status: t.status,
        status_label: Config.TASK_STATUS_LABEL[t.status], deadline: t.deadline,
        project_name: projectNames[t.project_id] || '', assigned_agent_id: t.assigned_agent_id, priority: t.priority };
    };
    var byDeadline = function (a, b) { return (a.deadline || '').localeCompare(b.deadline || ''); };

    var overdue = tasks.filter(function (t) { return TaskService.isOverdue(t, now); }).sort(byDeadline).map(brief);
    var soonLimit = new Date(now.getTime() + warnHours * 3600 * 1000);
    var dueSoon = tasks.filter(function (t) {
      var d = Util.parseDate(t.deadline);
      return d && d >= now && d <= soonLimit && !StateMachine.isTerminal(t.status);
    }).sort(byDeadline).map(brief);

    var counts = AgentService.activeTaskCounts();
    var agents = repo.findAll('Agents').map(function (a) {
      return { agent_id: a.agent_id, agent_name: a.agent_name, active_task_count: counts[a.agent_id] || 0,
        usable: AgentService.isUsable(a), availability: a.availability, usage_limit_status: a.usage_limit_status,
        enabled: Util.toBool(a.enabled) };
    });
    var unassigned = tasks.filter(function (t) { return !t.assigned_agent_id && !StateMachine.isTerminal(t.status); }).length;

    return {
      generated_at: Util.nowIso(),
      project_count: projects.length,
      active_project_count: projects.filter(function (p) { return p.status === 'ACTIVE'; }).length,
      task_count: tasks.length,
      groups: groups,
      by_status: byStatus,
      overdue_count: overdue.length,
      overdue: overdue.slice(0, 10),
      due_soon: dueSoon.slice(0, 10),
      deadline_warning_hours: warnHours,
      agents: agents,
      unassigned_count: unassigned,
      pending_approval_count: ApprovalService.pendingCount(),
      unread_notification_count: NotificationService.unreadCount(),
      recent_activity: AuditService.recentActivity(10)
    };
  }

  return { summary: summary, GROUPS: GROUPS };
})();
