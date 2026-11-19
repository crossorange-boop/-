/**
 * 51_Triggers.gs
 * 時間主導型トリガーの登録・再設定・状態確認。
 *
 * 間隔・時刻は Settings シートの値に従う（変更後は install() で再設定）。
 * 日次トリガーは Google の仕様で指定時刻から最大±15分程度ずれて実行される。
 * 無料枠への配慮：処理ごとに実行時間の上限を設け、1日の実行回数と推定実行時間を status() で確認できる。
 */

var Triggers = (function () {
  var DEFS = [
    { handler: 'jobQueueCheck', label: 'タスクキュー確認（自動振り分け）', kind: 'minutes', key: 'QUEUE_CHECK_INTERVAL_MIN' },
    { handler: 'jobDeadlineCheck', label: '期限・進捗確認', kind: 'minutes', key: 'DEADLINE_CHECK_INTERVAL_MIN' },
    { handler: 'jobDailyPlan', label: '朝の当日タスク一覧', kind: 'daily', key: 'DAILY_PLAN_HOUR' },
    { handler: 'jobMiddayCheck', label: '昼の中間経過', kind: 'daily', key: 'MIDDAY_CHECK_HOUR' },
    { handler: 'jobDailySummary', label: '夕方の進捗集計', kind: 'daily', key: 'DAILY_SUMMARY_HOUR' },
    { handler: 'jobBackup', label: 'バックアップ', kind: 'daily', key: 'BACKUP_HOUR' }
  ];
  var HANDLERS = DEFS.map(function (d) { return d.handler; });
  /** トリガーの再設定が必要になる設定キー */
  var TRIGGER_KEYS = DEFS.map(function (d) { return d.key; });

  function ours() {
    return ScriptApp.getProjectTriggers().filter(function (t) { return HANDLERS.indexOf(t.getHandlerFunction()) >= 0; });
  }

  function scheduleText(def) {
    var v = SettingsService.get(def.key);
    return def.kind === 'minutes' ? v + '分ごと' : '毎日 ' + v + '時台';
  }

  /** 既存のトリガー（本システム分のみ）を削除して、設定どおりに作り直す */
  function install() {
    Auth.require('OWNER');
    return Repository.get().withLock(function () {
      var removed = 0;
      ours().forEach(function (t) { ScriptApp.deleteTrigger(t); removed++; });
      var created = DEFS.map(function (def) {
        var b = ScriptApp.newTrigger(def.handler).timeBased();
        if (def.kind === 'minutes') {
          var m = Number(SettingsService.get(def.key));
          if (SettingsService.VALID_INTERVALS.indexOf(String(m)) < 0) throw new Util.ValidationError(def.key + ' は 1/5/10/15/30 のいずれかにしてください');
          b.everyMinutes(m).create();
        } else {
          b.everyDays(1).atHour(SettingsService.getNumber(def.key)).inTimezone('Asia/Tokyo').create();
        }
        return { handler: def.handler, label: def.label, schedule: scheduleText(def) };
      });
      AuditService.record('UPDATE', 'System', 'TRIGGERS', { removed: removed }, { created: created });
      return { removed: removed, created: created };
    });
  }

  /** トリガーをすべて停止（メンテナンス時など） */
  function uninstall() {
    Auth.require('OWNER');
    return Repository.get().withLock(function () {
      var n = 0;
      ours().forEach(function (t) { ScriptApp.deleteTrigger(t); n++; });
      AuditService.record('DELETE', 'System', 'TRIGGERS', { count: n }, null);
      return { removed: n };
    });
  }

  /** 状態：登録済みか、前回の実行、1日の実行回数の目安 */
  function status() {
    var installed = {};
    ours().forEach(function (t) { installed[t.getHandlerFunction()] = (installed[t.getHandlerFunction()] || 0) + 1; });
    var logs = Repository.get().findAll('ExecutionLogs');
    var TYPE_BY_HANDLER = { jobQueueCheck: 'QUEUE_CHECK', jobDeadlineCheck: 'DEADLINE_CHECK', jobDailyPlan: 'REPORT_MORNING',
      jobMiddayCheck: 'REPORT_MIDDAY', jobDailySummary: 'REPORT_EVENING', jobBackup: 'BACKUP' };
    var runsPerDay = 0;
    var items = DEFS.map(function (def) {
      var perDay = def.kind === 'minutes' ? Math.floor(1440 / (Number(SettingsService.get(def.key)) || 5)) : 1;
      runsPerDay += perDay;
      var type = TYPE_BY_HANDLER[def.handler];
      var last = logs.filter(function (l) { return l.execution_type === type; }).slice(-1)[0];
      return {
        handler: def.handler, label: def.label, schedule: scheduleText(def), installed: !!installed[def.handler],
        duplicated: (installed[def.handler] || 0) > 1, runs_per_day: perDay,
        last_run: last ? { time: last.end_time || last.start_time, result: last.result, message: last.error_message } : null
      };
    });
    return {
      items: items, runs_per_day: runsPerDay,
      // Google Workspace のトリガー実行時間の上限（1日6時間）に対する目安。1回平均10秒と仮定
      estimated_minutes_per_day: Math.round(runsPerDay * 10 / 60),
      all_installed: items.every(function (i) { return i.installed; })
    };
  }

  return { DEFS: DEFS, TRIGGER_KEYS: TRIGGER_KEYS, install: install, uninstall: uninstall, status: status };
})();

/** Apps Script エディタから実行する入口（初回のトリガー登録） */
function setupTriggers() {
  var r = Triggers.install();
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
