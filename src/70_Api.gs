/**
 * 70_Api.gs
 * 画面（google.script.run）からの唯一の入口。
 *
 * 画面は api(action, payload) だけを呼ぶ。action ごとに必要ロールを定義し、
 * 例外は画面に安全なメッセージだけを返す（内部情報やスタックトレースは返さない）。
 * 戻り値：{ ok: true, data } または { ok: false, error: { code, message } }
 */

var Api = (function () {
  var p = function (payload, key) { return payload ? payload[key] : undefined; };

  /** action → { role, fn(payload) } */
  var ROUTES = {
    bootstrap: { role: 'VIEWER', fn: function () { return bootstrapData(); } },
    'dashboard.summary': { role: 'VIEWER', fn: function () { return DashboardService.summary(); } },

    'projects.list': { role: 'VIEWER', fn: function () { return ProjectService.list(); } },
    'projects.get': { role: 'VIEWER', fn: function (x) { return ProjectService.get(p(x, 'project_id')); } },
    'projects.create': { role: 'EDITOR', fn: function (x) { return ProjectService.create(p(x, 'data')); } },
    'projects.update': { role: 'EDITOR', fn: function (x) { return ProjectService.update(p(x, 'project_id'), p(x, 'data'), p(x, 'row_version')); } },
    'projects.requestDelete': { role: 'EDITOR', fn: function (x) { return ProjectService.requestDelete(p(x, 'project_id'), p(x, 'comment')); } },

    'tasks.list': { role: 'VIEWER', fn: function (x) { return TaskService.list(p(x, 'filter')); } },
    'tasks.get': { role: 'VIEWER', fn: function (x) { return TaskService.get(p(x, 'task_id')); } },
    'tasks.create': { role: 'EDITOR', fn: function (x) { return TaskService.create(p(x, 'data')); } },
    'tasks.update': { role: 'EDITOR', fn: function (x) { return TaskService.update(p(x, 'task_id'), p(x, 'data'), p(x, 'row_version')); } },
    'tasks.changeStatus': { role: 'EDITOR', fn: function (x) { return TaskService.changeStatus(p(x, 'task_id'), p(x, 'status'), p(x, 'reason'), p(x, 'row_version')); } },
    'tasks.remove': { role: 'EDITOR', fn: function (x) { return TaskService.remove(p(x, 'task_id')); } },
    'tasks.retry': { role: 'EDITOR', fn: function (x) { return TaskService.retry(p(x, 'task_id'), p(x, 'reason'), !!p(x, 'force')); } },
    'tasks.restore': { role: 'OWNER', fn: function (x) { return TaskService.restore(p(x, 'task_id')); } },
    'projects.restore': { role: 'OWNER', fn: function (x) { return ProjectService.restore(p(x, 'project_id')); } },
    'trash.list': { role: 'OWNER', fn: function () { return ProjectService.trash(); } },

    'rules.list': { role: 'VIEWER', fn: function () { return RuleService.list(); } },
    'rules.create': { role: 'OWNER', fn: function (x) { return RuleService.create(p(x, 'data')); } },
    'rules.update': { role: 'OWNER', fn: function (x) { return RuleService.update(p(x, 'rule_id'), p(x, 'data')); } },
    'rules.test': { role: 'VIEWER', fn: function (x) { return RuleService.test(p(x, 'data')); } },

    'logs.executions': { role: 'VIEWER', fn: function (x) { return SystemService.executions(p(x, 'filter')); } },
    'logs.audits': { role: 'VIEWER', fn: function (x) { return SystemService.audits(p(x, 'filter')); } },
    'system.health': { role: 'OWNER', fn: function () { return SystemService.health(); } },

    'queue.byAgent': { role: 'VIEWER', fn: function () { return WorkQueueService.byAgent(); } },
    'queue.runNow': { role: 'EDITOR', fn: function () { return WorkQueueService.runNow(); } },
    'schedule.timeline': { role: 'VIEWER', fn: function (x) { return ScheduleService.timeline(p(x, 'filter')); } },

    'agents.list': { role: 'VIEWER', fn: function () { return AgentService.list(); } },
    'agents.get': { role: 'VIEWER', fn: function (x) { return AgentService.get(p(x, 'agent_id')); } },
    'agents.create': { role: 'EDITOR', fn: function (x) { return AgentService.create(p(x, 'data')); } },
    'agents.update': { role: 'EDITOR', fn: function (x) { return AgentService.update(p(x, 'agent_id'), p(x, 'data'), p(x, 'row_version')); } },
    'agents.setStatus': { role: 'EDITOR', fn: function (x) { return AgentService.setStatus(p(x, 'agent_id'), p(x, 'availability'), p(x, 'usage_limit_status'), p(x, 'notes')); } },

    'deliverables.list': { role: 'VIEWER', fn: function (x) { return DeliverableService.list(p(x, 'filter')); } },
    'deliverables.register': { role: 'EDITOR', fn: function (x) { return DeliverableService.register(p(x, 'data')); } },
    'deliverables.review': { role: 'EDITOR', fn: function (x) { return DeliverableService.review(p(x, 'deliverable_id'), p(x, 'decision'), p(x, 'comment')); } },

    'approvals.list': { role: 'VIEWER', fn: function (x) { return ApprovalService.list(p(x, 'filter')); } },
    'approvals.create': { role: 'EDITOR', fn: function (x) { return ApprovalService.create(p(x, 'data')); } },
    'approvals.approve': { role: 'OWNER', fn: function (x) { return ApprovalService.approve(p(x, 'approval_id'), p(x, 'comment')); } },
    'approvals.reject': { role: 'OWNER', fn: function (x) { return ApprovalService.reject(p(x, 'approval_id'), p(x, 'comment')); } },

    'notifications.list': { role: 'VIEWER', fn: function (x) { return NotificationService.list(x || {}); } },
    'notifications.markRead': { role: 'VIEWER', fn: function (x) { return NotificationService.markRead(p(x, 'ids')); } },

    'settings.list': { role: 'OWNER', fn: function () { return SettingsService.list(); } },
    'settings.update': { role: 'OWNER', fn: function (x) {
      var saved = SettingsService.update(p(x, 'key'), p(x, 'value'));
      // 実行間隔・時刻を変えたら、登録済みのトリガーを設定どおりに作り直す
      if (Triggers.TRIGGER_KEYS.indexOf(p(x, 'key')) >= 0 && Triggers.status().items.some(function (i) { return i.installed; })) {
        saved.triggers_reinstalled = true;
        Triggers.install();
      }
      return saved;
    } },

    'reports.latest': { role: 'VIEWER', fn: function () { return ReportService.latest(); } },
    'reports.preview': { role: 'VIEWER', fn: function (x) { return ReportService.generate(p(x, 'kind')); } },
    'reports.generate': { role: 'OWNER', fn: function (x) {
      return Repository.get().withLock(function () { return ReportService.generate(p(x, 'kind'), { save: true }); });
    } },
    'deadline.runNow': { role: 'EDITOR', fn: function () { return DeadlineEngine.run({ triggered_by: Auth.actorName() }); } },
    'triggers.status': { role: 'OWNER', fn: function () { return Triggers.status(); } },
    'triggers.install': { role: 'OWNER', fn: function () { return Triggers.install(); } },
    'triggers.uninstall': { role: 'OWNER', fn: function () { return Triggers.uninstall(); } },
    'backup.runNow': { role: 'OWNER', fn: function () {
      var who = Auth.actorName();
      return Repository.get().withLock(function () { return Backup.run({ triggered_by: who }); });
    } },
    'logs.activity': { role: 'VIEWER', fn: function (x) { return AuditService.recentActivity(Math.min(Number(p(x, 'limit')) || 50, 500)); } }
  };

  function bootstrapData() {
    var user = Auth.currentUser();
    return {
      version: Config.VERSION,
      user: { email: user.email, role: user.role },
      enums: {
        task_status: Object.keys(Config.TASK_STATUS),
        task_status_label: Config.TASK_STATUS_LABEL,
        project_status: Config.PROJECT_STATUS,
        priority: Config.PRIORITY,
        agent_availability: Config.AGENT_AVAILABILITY,
        usage_limit_status: Config.USAGE_LIMIT_STATUS,
        connection_type: Config.CONNECTION_TYPE,
        approval_actions: ApprovalService.ACTION_LABELS,
        transitions: StateMachine.TRANSITIONS,
        reason_required: StateMachine.REASON_REQUIRED
      },
      dashboard_groups: DashboardService.GROUPS
    };
  }

  /** 想定外のエラーは内容を記録し、画面には一般的なメッセージだけを返す */
  function toSafeError(e) {
    if (e && e.code && typeof e.message === 'string') return { code: e.code, message: e.message };
    try { console.error(e && e.stack ? e.stack : e); } catch (ignore) { /* noop */ }
    return { code: 'INTERNAL', message: 'システムエラーが発生しました。時間をおいて再度お試しください' };
  }

  function handle(action, payload) {
    try {
      var route = ROUTES.hasOwnProperty(action) ? ROUTES[action] : null;
      if (!route) throw new Util.AppError('NOT_FOUND', '不明な操作です');
      if (payload !== undefined && payload !== null && typeof payload !== 'object') throw new Util.ValidationError('不正な入力です');
      Auth.require(route.role);
      Repository.get().resetCache();
      return { ok: true, data: route.fn(payload || {}) };
    } catch (e) {
      return { ok: false, error: toSafeError(e) };
    }
  }

  return { handle: handle, ROUTES: ROUTES };
})();

/** google.script.run から呼ばれる唯一の公開関数 */
function api(action, payload) {
  return Api.handle(action, payload);
}
