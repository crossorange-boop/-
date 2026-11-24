/**
 * 38_ReportService.gs
 * 定時レポート（画面内通知として保存）。外部へのメール送信は行わない（承認制の対象のため）。
 *
 *   朝（DAILY_PLAN_HOUR、初期 7時）       … 当日のタスク一覧
 *   昼（MIDDAY_CHECK_HOUR、初期 13時）    … 中間経過（午前の進み具合と午後に優先すべきタスク）
 *   夕（DAILY_SUMMARY_HOUR、初期 17時）   … 進捗集計
 */

var ReportService = (function () {
  // 状態名は文字列で直接扱う（ファイルの読み込み順に依存しないため Config を読み込み時に参照しない）
  var TYPES = { morning: 'DAILY_PLAN', midday: 'MIDDAY_CHECK', evening: 'DAILY_SUMMARY' };
  var TITLES = { morning: '朝の当日タスク一覧', midday: '昼の中間経過', evening: '夕方の進捗集計' };
  var MAX_ITEMS = 15;

  function ymd(date) { return Util.toIso(date).slice(0, 10); }
  function hm(iso) { return String(iso || '').slice(11, 16); }
  function dateLabel(iso) {
    var m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return '';
    return Number(m[1]) + '/' + Number(m[2]) + (m[3] && !(m[3] === '23' && m[4] === '59') ? ' ' + m[3] + ':' + m[4] : '');
  }

  /** レポート作成に必要なデータをまとめて読み込む */
  function context(now) {
    var repo = Repository.get();
    var today = ymd(now);
    var tomorrow = ymd(new Date(now.getTime() + 86400000));
    var projects = repo.findAll('Projects');
    var projectNames = {}, agentNames = {};
    projects.forEach(function (p) { projectNames[p.project_id] = p.project_name; });
    repo.findAll('Agents').forEach(function (a) { agentNames[a.agent_id] = a.agent_name; });
    var tasks = repo.findAll('Tasks').filter(function (t) { return t.status !== 'CANCELLED'; });
    var byId = {};
    tasks.forEach(function (t) { byId[t.task_id] = t; });

    // 今日の状態変更（監査ログから）
    var changesToday = repo.findAll('AuditLogs').filter(function (a) {
      return a.action === 'STATUS_CHANGE' && String(a.timestamp).slice(0, 10) === today;
    }).map(function (a) {
      var after = {};
      try { after = JSON.parse(a.after_json || '{}'); } catch (e) { after = {}; }
      return { task_id: a.entity_id, to: after.status, time: a.timestamp, actor: after.actor };
    });
    var completedTodayIds = {};
    changesToday.forEach(function (c) { if (c.to === 'COMPLETED' && byId[c.task_id] && byId[c.task_id].status === 'COMPLETED') completedTodayIds[c.task_id] = c.time; });

    var open = tasks.filter(function (t) { return !StateMachine.isTerminal(t.status); });
    var label = function (t) {
      return t.task_name + '（' + (projectNames[t.project_id] || '-') + '／' + (agentNames[t.assigned_agent_id] || '担当未設定') + '）';
    };
    return {
      now: now, today: today, tomorrow: tomorrow, projects: projects, tasks: tasks, open: open, byId: byId,
      projectNames: projectNames, agentNames: agentNames, label: label, changesToday: changesToday,
      completedToday: Object.keys(completedTodayIds).map(function (id) { return { task: byId[id], time: completedTodayIds[id] }; })
        .sort(function (a, b) { return a.time < b.time ? -1 : 1; }),
      overdue: AssignmentEngine.sortQueue(open.filter(function (t) { return TaskService.isOverdue(t, now); })),
      dueToday: AssignmentEngine.sortQueue(open.filter(function (t) { return String(t.deadline).slice(0, 10) === today && !TaskService.isOverdue(t, now); })),
      dueTomorrow: AssignmentEngine.sortQueue(open.filter(function (t) { return String(t.deadline).slice(0, 10) === tomorrow; })),
      startingToday: open.filter(function (t) { return String(t.start_date).slice(0, 10) === today; }),
      inProgress: AssignmentEngine.sortQueue(open.filter(function (t) { return t.status === 'IN_PROGRESS'; })),
      assigned: AssignmentEngine.sortQueue(open.filter(function (t) { return t.status === 'ASSIGNED'; })),
      waiting: open.filter(function (t) { return t.status === 'WAITING'; }),
      blocked: open.filter(function (t) { return t.status === 'BLOCKED'; }),
      review: open.filter(function (t) { return t.status === 'REVIEW'; }),
      failed: open.filter(function (t) { return t.status === 'FAILED'; }),
      pendingApprovals: ApprovalService.pendingCount()
    };
  }

  function section(heading, tasks, fmt, emptyText) {
    var items = tasks.slice(0, MAX_ITEMS).map(fmt);
    if (tasks.length > MAX_ITEMS) items.push('ほか ' + (tasks.length - MAX_ITEMS) + '件');
    return { heading: heading + '（' + tasks.length + '件）', items: items.length ? items : [emptyText || 'なし'] };
  }

  function toText(report) {
    var lines = ['【' + report.title + '】' + report.date_label];
    if (report.headline) lines.push(report.headline);
    report.sections.forEach(function (s) {
      lines.push('');
      lines.push('■ ' + s.heading);
      s.items.forEach(function (i) { lines.push('・' + i); });
    });
    return lines.join('\n');
  }

  function buildMorning(c) {
    var withDeadline = function (t) { return c.label(t) + (t.deadline ? ' 期限 ' + dateLabel(t.deadline) : ''); };
    return {
      kind: 'morning', title: TITLES.morning, date_label: c.today,
      headline: '今日が期限 ' + c.dueToday.length + '件・期限超過 ' + c.overdue.length + '件・作業中 ' + c.inProgress.length + '件・承認待ち ' + c.pendingApprovals + '件',
      sections: [
        section('期限超過（最優先で対応）', c.overdue, withDeadline),
        section('今日が期限', c.dueToday, withDeadline),
        section('今日開始予定', c.startingToday, c.label),
        section('作業中', c.inProgress, withDeadline),
        section('担当割当済み（未着手）', c.assigned, withDeadline),
        section('利用待ち・前提待ち', c.waiting.concat(c.blocked), function (t) { return c.label(t) + '：' + String(t.waiting_reason || '').replace('[自動] ', ''); }),
        { heading: '承認待ち', items: [c.pendingApprovals + '件' + (c.pendingApprovals ? '（成果物・承認画面で確認してください）' : '')] }
      ]
    };
  }

  function buildMidday(c) {
    var changedCount = c.changesToday.length;
    var remainingToday = c.overdue.concat(c.dueToday);
    // 午後に優先すべきタスク：期限超過・今日期限・作業中を優先度→期限順に
    var seen = {};
    var focus = AssignmentEngine.sortQueue(remainingToday.concat(c.inProgress).filter(function (t) {
      if (seen[t.task_id]) return false; seen[t.task_id] = true; return true;
    })).slice(0, 5);
    var stuck = c.waiting.concat(c.blocked, c.failed);
    return {
      kind: 'midday', title: TITLES.midday, date_label: c.today + ' ' + hm(Util.toIso(c.now)) + ' 時点',
      headline: '本日完了 ' + c.completedToday.length + '件・本日の状態変更 ' + changedCount + '件・今日期限の残り ' + c.dueToday.length + '件・期限超過 ' + c.overdue.length + '件',
      sections: [
        section('本日完了したタスク', c.completedToday, function (x) { return c.label(x.task) + ' ' + hm(x.time) + ' 完了'; }, 'まだありません'),
        section('今日が期限で未完了', c.dueToday, function (t) { return c.label(t) + '：' + (Config.TASK_STATUS_LABEL[t.status] || t.status); }),
        section('期限超過', c.overdue, function (t) { return c.label(t) + ' 期限 ' + dateLabel(t.deadline); }),
        section('午後に優先して進めるタスク', focus, function (t) {
          return c.label(t) + '：' + (Config.TASK_STATUS_LABEL[t.status] || t.status) + (t.deadline ? '・期限 ' + dateLabel(t.deadline) : '');
        }),
        section('止まっているタスク（利用待ち・前提待ち・失敗）', stuck, function (t) {
          return c.label(t) + '：' + (Config.TASK_STATUS_LABEL[t.status] || t.status) + (t.waiting_reason ? '（' + String(t.waiting_reason).replace('[自動] ', '') + '）' : '');
        }),
        section('成果物確認中', c.review, c.label),
        { heading: '承認待ち', items: [c.pendingApprovals + '件'] }
      ]
    };
  }

  function buildEvening(c) {
    var active = c.projects.filter(function (p) { return p.status === 'ACTIVE' || p.status === 'PLANNING'; });
    var projectLines = active.map(function (p) {
      var own = c.tasks.filter(function (t) { return t.project_id === p.project_id; });
      var done = own.filter(function (t) { return t.status === 'COMPLETED'; }).length;
      var over = own.filter(function (t) { return TaskService.isOverdue(t, c.now); }).length;
      var doneToday = c.completedToday.filter(function (x) { return x.task.project_id === p.project_id; }).length;
      return p.project_name + '：進捗 ' + (own.length ? Math.round(done / own.length * 100) : 0) + '%（' + done + '/' + own.length + '）' +
        (doneToday ? '・本日完了 ' + doneToday : '') + (over ? '・期限超過 ' + over : '');
    });
    var createdToday = c.tasks.filter(function (t) { return String(t.created_at).slice(0, 10) === c.today; });
    var errorsToday = Repository.get().findAll('ExecutionLogs').filter(function (e) {
      return e.result === 'FAILED' && String(e.start_time).slice(0, 10) === c.today;
    });
    var dueTodayOpen = AssignmentEngine.sortQueue(c.open.filter(function (t) { return String(t.deadline).slice(0, 10) === c.today; }));
    var withDeadline = function (t) { return c.label(t) + (t.deadline ? ' 期限 ' + dateLabel(t.deadline) : ''); };
    return {
      kind: 'evening', title: TITLES.evening, date_label: c.today,
      headline: '本日完了 ' + c.completedToday.length + '件・新規 ' + createdToday.length + '件・今日期限で未完了 ' + dueTodayOpen.length + '件・期限超過 ' + c.overdue.length + '件・明日期限 ' + c.dueTomorrow.length + '件',
      sections: [
        section('本日完了したタスク', c.completedToday, function (x) { return c.label(x.task) + ' ' + hm(x.time); }, 'なし'),
        { heading: 'プロジェクト別進捗（' + active.length + '件）', items: projectLines.length ? projectLines : ['なし'] },
        // 日付だけの期限はその日の 23:59 までが期限のため、夕方の時点ではまだ「期限超過」に入らない。
        // 今日が期限で未完了のものは、期限超過かどうかに関係なく数える。
        section('今日が期限なのに未完了', dueTodayOpen, withDeadline),
        section('期限超過（全体）', c.overdue, withDeadline),
        section('明日が期限', c.dueTomorrow, withDeadline),
        section('止まっているタスク', c.waiting.concat(c.blocked, c.failed), function (t) {
          return c.label(t) + '：' + (Config.TASK_STATUS_LABEL[t.status] || t.status);
        }),
        { heading: '自動処理のエラー（本日）', items: [errorsToday.length + '件' + (errorsToday.length ? '（設定・ログ画面で確認してください）' : '')] },
        { heading: '承認待ち', items: [c.pendingApprovals + '件'] }
      ]
    };
  }

  var BUILDERS = { morning: buildMorning, midday: buildMidday, evening: buildEvening };

  /** レポートを作成（save=true なら通知として保存） */
  function generate(kind, options) {
    options = options || {};
    if (!BUILDERS[kind]) throw new Util.ValidationError('不明なレポート種別です: ' + kind);
    var report = BUILDERS[kind](context(options.now || new Date()));
    report.text = toText(report);
    report.generated_at = Util.nowIso();
    if (options.save) {
      var saved = NotificationService.create(TYPES[kind], report.text, { severity: 'INFO' });
      report.notification_id = saved.notification_id;
    }
    return report;
  }

  /** 各レポートの最新（保存済み）を返す */
  function latest() {
    var all = Repository.get().findAll('Notifications');
    var out = {};
    Object.keys(TYPES).forEach(function (kind) {
      var list = all.filter(function (n) { return n.notification_type === TYPES[kind]; });
      var last = list[list.length - 1];
      out[kind] = last ? { title: TITLES[kind], created_at: last.created_at, text: last.message, notification_id: last.notification_id, read_status: last.read_status } : null;
    });
    return out;
  }

  return { generate: generate, latest: latest, TYPES: TYPES, TITLES: TITLES };
})();
