/**
 * 32_QueueEngine.gs
 * タスクキュー確認（自動振り分け）。定期処理（5分間隔）と画面の「今すぐ振り分け」から呼ばれる。
 *
 * 1回の処理の流れ：
 *   ① 前提タスクの確認：未完了なら BLOCKED、完了したら BACKLOG に戻して再判定
 *   ② 障害対応：担当AIが使えなくなった ASSIGNED は WAITING へ（タスクは削除しない）
 *   ③ 復旧対応：担当AIが使えるようになった WAITING は READY へ戻す
 *   ④ 分類：BACKLOG を割り振りルールで分類し READY へ（分類できなければ通知して BACKLOG のまま）
 *   ⑤ 割り振り：READY を優先度・期限順に担当AIへ割り当て ASSIGNED へ
 *      （候補が全員利用不可なら WAITING、上限なら READY のまま）
 *
 * 重複実行防止：スクリプトロック（tryWithLock）で同時実行を防ぎ、
 *   タスク単位では locked_until が未来のタスク（外部処理中）を対象外にする。
 * 障害の局所化：1件の失敗は記録して次のタスクへ進む。
 */

var QueueEngine = (function () {
  // 状態名は文字列で直接扱う（ファイルの読み込み順に依存しないため Config を読み込み時に参照しない）
  var SYSTEM_WAIT_PREFIX = '[自動] ';

  function isLocked(task, now) {
    var until = Util.parseDate(task.locked_until);
    return !!(task.lock_token && until && until > now);
  }

  /** タスク単位のロック取得（Phase 2 のアダプターが外部処理中に使用） */
  function acquireTaskLock(taskId, minutes) {
    var repo = Repository.get();
    var t = repo.findById('Tasks', taskId);
    if (!t) throw new Util.AppError('NOT_FOUND', 'タスクが見つかりません');
    if (isLocked(t, new Date())) return null;
    var token = Util.randomToken(12);
    var until = new Date(Date.now() + (minutes || SettingsService.getNumber('TASK_LOCK_MINUTES', 10)) * 60000);
    repo.update('Tasks', taskId, { lock_token: token, locked_until: Util.toIso(until) });
    return token;
  }

  function releaseTaskLock(taskId, token) {
    var repo = Repository.get();
    var t = repo.findById('Tasks', taskId);
    if (t && t.lock_token === token) repo.update('Tasks', taskId, { lock_token: '', locked_until: '' });
  }

  function run(options) {
    options = options || {};
    var triggeredBy = options.triggered_by || 'SYSTEM';
    var budgetMs = (options.time_budget_sec || SettingsService.getNumber('JOB_TIME_BUDGET_SEC', 240)) * 1000;
    var startedAt = Date.now();

    var outcome = Repository.get().tryWithLock(function () {
      return Auth.runAsSystem(function () { return process(triggeredBy, startedAt, budgetMs); });
    });
    if (!outcome.locked) {
      return { skipped: true, reason: '前回の処理が実行中のためスキップしました' };
    }
    return outcome.result;
  }

  function process(triggeredBy, startedAt, budgetMs) {
    var repo = Repository.get();
    var now = new Date();
    var summary = { blocked: 0, unblocked: 0, waiting: 0, recovered: 0, classified: 0, assigned: 0, held: 0,
      needs_classification: 0, errors: 0, timed_out: false, details: [] };
    var startIso = Util.nowIso();
    var outOfTime = function () {
      if (Date.now() - startedAt > budgetMs) { summary.timed_out = true; return true; }
      return false;
    };
    var rules = repo.findAll('AssignmentRules');
    var agentsById = {};
    var agents = repo.findAll('Agents');
    agents.forEach(function (a) { agentsById[a.agent_id] = a; });
    var counts = AgentService.activeTaskCounts();

    var move = function (task, to, reason, extraPatch, logType, agentId) {
      TaskService._transition(task.task_id, to, { actor: 'SYSTEM', reason: reason, extraPatch: extraPatch });
      AuditService.logExecution({ task_id: task.task_id, agent_id: agentId || task.assigned_agent_id || '',
        execution_type: logType, result: to === 'WAITING' ? 'SKIPPED' : 'SUCCESS',
        error_message: reason || '', retry_count: task.retry_count, triggered_by: triggeredBy });
      summary.details.push({ task_id: task.task_id, task_name: task.task_name, to: to, reason: reason || '' });
    };
    var safely = function (task, fn) {
      try { fn(); } catch (e) {
        summary.errors++;
        AuditService.logExecution({ task_id: task.task_id, agent_id: task.assigned_agent_id || '', execution_type: 'QUEUE_CHECK',
          result: 'FAILED', error_message: e && e.message ? e.message : String(e), triggered_by: triggeredBy });
      }
    };
    var fresh = function () {
      return repo.findAll('Tasks').filter(function (t) { return !StateMachine.isTerminal(t.status) && !isLocked(t, now); });
    };
    var taskMap = function () {
      var m = {};
      repo.findAll('Tasks', { includeDeleted: true }).forEach(function (t) { m[t.task_id] = t; });
      return m;
    };

    // ⓪ 自動再投入：自動処理で失敗したタスクを上限回数まで READY に戻す（人が失敗にしたものは対象外）
    var maxRetry = SettingsService.getNumber('MAX_RETRY_COUNT', 3);
    fresh().forEach(function (t) {
      if (outOfTime() || t.status !== 'FAILED') return;
      if (String(t.waiting_reason || '').indexOf(SYSTEM_WAIT_PREFIX) !== 0) return;
      var count = Number(t.retry_count) || 0;
      if (count >= maxRetry) return;
      safely(t, function () {
        move(t, 'READY', '自動再投入（' + (count + 1) + '/' + maxRetry + '回目）', { retry_count: count + 1 }, 'AUTO_RETRY');
        summary.retried = (summary.retried || 0) + 1;
      });
    });

    // ① 前提タスクの確認
    var deps = repo.findAll('Dependencies');
    var map = taskMap();
    fresh().forEach(function (t) {
      if (outOfTime()) return;
      if (['BACKLOG', 'READY', 'BLOCKED'].indexOf(t.status) < 0) return;
      var sat = DependencyGraph.predecessorsSatisfied(t.task_id, deps, map);
      if (!sat.satisfied && t.status !== 'BLOCKED') {
        safely(t, function () {
          var names = sat.pending.map(function (id) { return map[id] ? map[id].task_name : id; }).join('、');
          move(t, 'BLOCKED', SYSTEM_WAIT_PREFIX + '前提タスク待ち：' + names, null, 'AUTO_BLOCK');
          summary.blocked++;
        });
      } else if (sat.satisfied && t.status === 'BLOCKED') {
        safely(t, function () { move(t, 'BACKLOG', '前提タスクが完了しました', null, 'AUTO_UNBLOCK'); summary.unblocked++; });
      }
    });

    // ② 障害対応：担当AIが使えなくなった割当済みタスクは WAITING へ
    fresh().forEach(function (t) {
      if (outOfTime() || t.status !== 'ASSIGNED') return;
      var agent = agentsById[t.assigned_agent_id];
      if (agent && AgentService.isUsable(agent)) return;
      safely(t, function () {
        move(t, 'WAITING', SYSTEM_WAIT_PREFIX + AgentService.unusableReason(agent), null, 'AUTO_WAIT');
        summary.waiting++;
      });
    });
    // 作業中のタスクは状態を変えず、担当AIの停止を通知する（作業内容を失わないため）
    fresh().forEach(function (t) {
      if (t.status !== 'IN_PROGRESS') return;
      var agent = agentsById[t.assigned_agent_id];
      if (agent && !AgentService.isUsable(agent)) {
        NotificationService.createOnce('AGENT_UNAVAILABLE_IN_PROGRESS',
          '作業中の「' + t.task_name + '」の担当AIが利用できません（' + AgentService.unusableReason(agent) + '）。必要に応じて「外部AIの利用待ち」に変更してください。',
          { task_id: t.task_id, severity: 'WARN' });
      }
    });

    // ③ 復旧対応：WAITING のうち担当AIが使えるようになったものを READY へ
    fresh().forEach(function (t) {
      if (outOfTime() || t.status !== 'WAITING') return;
      var agent = agentsById[t.assigned_agent_id];
      // 人が手動で WAITING にしたタスク（理由が自動でないもの）は人が戻す
      if (String(t.waiting_reason || '').indexOf(SYSTEM_WAIT_PREFIX) !== 0) return;
      if (!agent || !AgentService.isUsable(agent)) return;
      safely(t, function () {
        move(t, 'READY', agent.agent_name + ' が利用可能になったため再開候補に戻しました', null, 'AUTO_RECOVER');
        summary.recovered++;
      });
    });

    // ④ 分類：BACKLOG → READY
    fresh().forEach(function (t) {
      if (outOfTime() || t.status !== 'BACKLOG') return;
      var c = AssignmentEngine.classify(t, rules);
      if (!c.source) {
        summary.needs_classification++;
        NotificationService.createOnce('NEEDS_CLASSIFICATION',
          '「' + t.task_name + '」を自動分類できませんでした。担当AIまたはカテゴリ・必要な能力を設定してください。', { task_id: t.task_id, severity: 'INFO' });
        return;
      }
      safely(t, function () {
        move(t, 'READY', c.rule_id ? 'ルール ' + c.rule_id + ' で分類' : '担当AI指定済み',
          { category: c.category, required_capability: c.required_capability }, 'AUTO_CLASSIFY');
        summary.classified++;
      });
    });

    // ⑤ 割り振り：READY → ASSIGNED / WAITING
    AssignmentEngine.sortQueue(fresh().filter(function (t) { return t.status === 'READY'; })).forEach(function (t) {
      if (outOfTime()) return;
      safely(t, function () {
        var c = AssignmentEngine.classify(t, rules);
        var d = AssignmentEngine.selectAgent(t, c, agents, counts);
        if (d.decision === 'ASSIGN') {
          var agent = agentsById[d.agent_id];
          move(t, 'ASSIGNED', d.reason, { assigned_agent_id: d.agent_id }, 'AUTO_ASSIGN', d.agent_id);
          counts[d.agent_id] = (counts[d.agent_id] || 0) + 1;
          AgentAdapter.get(agent.connection_type).dispatch(repo.findById('Tasks', t.task_id), agent);
          summary.assigned++;
        } else if (d.decision === 'WAIT') {
          move(t, 'WAITING', SYSTEM_WAIT_PREFIX + d.reason, { assigned_agent_id: d.agent_id }, 'AUTO_WAIT', d.agent_id);
          summary.waiting++;
        } else if (d.decision === 'HOLD') {
          summary.held++;
        } else {
          summary.needs_classification++;
          NotificationService.createOnce('NEEDS_CLASSIFICATION', '「' + t.task_name + '」の担当候補がいません：' + d.reason, { task_id: t.task_id, severity: 'WARN' });
        }
      });
    });

    var changed = (summary.retried || 0) + summary.blocked + summary.unblocked + summary.waiting + summary.recovered + summary.classified + summary.assigned;
    if (changed || summary.errors || summary.timed_out) {
      repo.insert('ExecutionLogs', {
        task_id: '', agent_id: 'AGT-RULE-ENGINE', execution_type: 'QUEUE_CHECK', start_time: startIso, end_time: Util.nowIso(),
        result: summary.errors ? 'PARTIAL' : summary.timed_out ? 'PARTIAL' : 'SUCCESS',
        error_message: (summary.retried ? '再投入' + summary.retried + '・' : '') + '割当' + summary.assigned + '・分類' + summary.classified + '・待機' + summary.waiting + '・復旧' + summary.recovered +
          '・前提待ち' + summary.blocked + '・解除' + summary.unblocked + (summary.errors ? '・エラー' + summary.errors : '') + (summary.timed_out ? '・時間切れ（次回継続）' : ''),
        retry_count: 0, triggered_by: triggeredBy
      });
    }
    if (summary.recovered) {
      NotificationService.create('RECOVERED', summary.recovered + '件のタスクを再開候補に戻しました（担当AIの復旧）', { severity: 'INFO' });
    }
    summary.details = summary.details.slice(0, 50);
    return summary;
  }

  /**
   * 外部実行の失敗を記録する（Phase 2 のアダプターから呼ぶ）。
   * タスクは FAILED（自動）になり、上限内なら次回の振り分けで自動再投入される。上限に達したら重大通知。
   */
  function reportFailure(taskId, message) {
    return Auth.runAsSystem(function () {
      return Repository.get().withLock(function () {
        var repo = Repository.get();
        var t = repo.findById('Tasks', taskId);
        if (!t) throw new Util.AppError('NOT_FOUND', 'タスクが見つかりません');
        var after = TaskService._transition(taskId, 'FAILED', { actor: 'SYSTEM', reason: SYSTEM_WAIT_PREFIX + (message || '外部処理の失敗') });
        AuditService.logExecution({ task_id: taskId, agent_id: t.assigned_agent_id, execution_type: 'EXTERNAL_EXECUTION', result: 'FAILED',
          error_message: message || '', retry_count: t.retry_count, triggered_by: 'SYSTEM' });
        var max = SettingsService.getNumber('MAX_RETRY_COUNT', 3);
        if ((Number(t.retry_count) || 0) >= max) {
          NotificationService.create('FAILED', '「' + t.task_name + '」が再実行の上限（' + max + '回）に達しました。内容を確認してください：' + (message || ''),
            { task_id: taskId, severity: 'CRITICAL' });
        }
        return after;
      });
    });
  }

  return { run: run, reportFailure: reportFailure, acquireTaskLock: acquireTaskLock, releaseTaskLock: releaseTaskLock, isLocked: isLocked, SYSTEM_WAIT_PREFIX: SYSTEM_WAIT_PREFIX };
})();
