/**
 * 50_Jobs.gs
 * 時間主導型トリガーから呼ばれる定期処理の入口。
 * Google のサーバー上で実行されるため、PC を閉じていても動作する。
 *
 * どの処理も：
 *   - オーナー以外が google.script.run から呼んだ場合は拒否
 *   - システム権限（SYSTEM）で実行し、例外は実行履歴に記録して重大通知を作る
 *   - 1つの処理の失敗が他の処理に影響しない（トリガーは処理ごとに独立）
 */

var Jobs = (function () {
  /** トリガー実行（実行者＝オーナー、または利用者情報なし）以外からの呼び出しを拒否 */
  function guard() {
    var email = '';
    try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { email = ''; }
    var owner = String(PropertiesService.getScriptProperties().getProperty(Config.PROP_KEYS.OWNER_EMAIL) || '').toLowerCase();
    if (email && owner && email !== owner) throw new Util.AppError('FORBIDDEN', '定期処理はオーナーのみ実行できます');
  }

  function execute(name, fn) {
    guard();
    var start = Util.nowIso();
    try {
      Repository.get().resetCache();
      return Auth.runAsSystem(fn);
    } catch (e) {
      var msg = e && e.message ? e.message : String(e);
      try {
        Auth.runAsSystem(function () {
          Repository.get().withLock(function () {
            Repository.get().insert('ExecutionLogs', {
              task_id: '', agent_id: '', execution_type: name, start_time: start, end_time: Util.nowIso(),
              result: 'FAILED', error_message: msg.slice(0, 2000), retry_count: 0, triggered_by: 'SYSTEM'
            });
            NotificationService.createOnce('JOB_FAILED_' + name, '定期処理「' + name + '」でエラーが発生しました：' + msg, { severity: 'CRITICAL' });
          });
        });
      } catch (ignore) { /* 記録にも失敗した場合は Apps Script の実行ログに残る */ }
      console.error(name + ' failed: ' + msg);
      return { ok: false, error: msg };
    }
  }

  /** 定時レポート：作成して保存 */
  function report(kind) {
    return Repository.get().withLock(function () {
      var r = ReportService.generate(kind, { save: true });
      AuditService.logExecution({ execution_type: 'REPORT_' + kind.toUpperCase(), result: 'SUCCESS', error_message: r.headline, triggered_by: 'SYSTEM' });
      return { ok: true, headline: r.headline };
    });
  }

  return {
    guard: guard,
    queueCheck: function () { return execute('QUEUE_CHECK', function () { return QueueEngine.run(); }); },
    deadlineCheck: function () { return execute('DEADLINE_CHECK', function () { return DeadlineEngine.run(); }); },
    dailyPlan: function () { return execute('REPORT_MORNING', function () { return report('morning'); }); },
    middayCheck: function () { return execute('REPORT_MIDDAY', function () { return report('midday'); }); },
    dailySummary: function () { return execute('REPORT_EVENING', function () { return report('evening'); }); },
    backup: function () { return execute('BACKUP', function () { return Repository.get().withLock(function () { return Backup.run(); }); }); }
  };
})();

// ---- トリガーから呼ばれる関数（名前を変えるとトリガーが動かなくなるため変更しないこと） ----
function jobQueueCheck() { return Jobs.queueCheck(); }
function jobDeadlineCheck() { return Jobs.deadlineCheck(); }
function jobDailyPlan() { return Jobs.dailyPlan(); }
function jobMiddayCheck() { return Jobs.middayCheck(); }
function jobDailySummary() { return Jobs.dailySummary(); }
function jobBackup() { return Jobs.backup(); }
