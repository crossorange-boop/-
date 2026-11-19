/**
 * 99_Tests.gs
 * 導入確認（自己診断）。本番データを書き換えずに、設置状態を点検する。
 * Apps Script エディタで runSelfCheck を実行するか、設定・ログ画面の「システム情報」から実行する。
 *
 * ※ 機能の詳細なテストは、リポジトリの test/（Node 単体テスト・画面の結合テスト）で行う。
 */

var SelfCheck = (function () {
  function item(name, status, detail) { return { name: name, status: status, detail: detail || '' }; }

  function run() {
    Auth.require('OWNER');
    var results = [];
    var props = PropertiesService.getScriptProperties();
    var repo = Repository.get();
    repo.resetCache();

    // 1. スクリプトプロパティ
    var missingProps = [Config.PROP_KEYS.SPREADSHEET_ID, Config.PROP_KEYS.BACKUP_FOLDER_ID, Config.PROP_KEYS.OWNER_EMAIL]
      .filter(function (k) { return !props.getProperty(k); });
    results.push(missingProps.length ? item('初期設定（スクリプトプロパティ）', 'NG', '未設定：' + missingProps.join(', ') + '。setupSystem を実行してください')
      : item('初期設定（スクリプトプロパティ）', 'OK', 'オーナー：' + props.getProperty(Config.PROP_KEYS.OWNER_EMAIL)));
    if (missingProps.length) return summarize(results);

    // 2. シートと列
    var ss = SpreadsheetApp.openById(props.getProperty(Config.PROP_KEYS.SPREADSHEET_ID));
    var sheetProblems = [];
    Object.keys(Config.SHEETS).forEach(function (name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) { sheetProblems.push(name + '（シートなし）'); return; }
      var lastCol = sheet.getLastColumn();
      var headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
      var missing = Config.SHEETS[name].columns.filter(function (c) { return headers.indexOf(c) < 0; });
      if (missing.length) sheetProblems.push(name + '（列不足：' + missing.join(', ') + '）');
    });
    results.push(sheetProblems.length ? item('データベースのシート・列', 'NG', sheetProblems.join(' ／ ') + '。setupSystem を再実行すると不足分だけ追加されます')
      : item('データベースのシート・列', 'OK', Object.keys(Config.SHEETS).length + 'シート'));

    // 3. 設定値
    var missingSettings = Config.DEFAULT_SETTINGS.map(function (s) { return s[0]; })
      .filter(function (k) { return k !== 'ALLOWED_USERS' && !repo.findById('Settings', k); });
    results.push(missingSettings.length ? item('設定値', 'NG', '未登録：' + missingSettings.join(', '))
      : item('設定値', 'OK', '朝' + SettingsService.get('DAILY_PLAN_HOUR') + '時・昼' + SettingsService.get('MIDDAY_CHECK_HOUR') + '時・夕' + SettingsService.get('DAILY_SUMMARY_HOUR') + '時・バックアップ' + SettingsService.get('BACKUP_HOUR') + '時'));

    // 4. AIエージェント
    var agents = repo.findAll('Agents');
    var usable = agents.filter(function (a) { return AgentService.isUsable(a); }).length;
    results.push(agents.length ? item('AIエージェント', usable ? 'OK' : 'WARN', agents.length + '件登録・利用可能 ' + usable + '件')
      : item('AIエージェント', 'NG', '登録がありません'));

    // 5. 割り振りルール
    var rules = repo.findAll('AssignmentRules');
    var broken = rules.filter(function (r) { try { new RegExp(r.keyword_pattern, 'i'); return false; } catch (e) { return true; } });
    var enabledRules = rules.filter(function (r) { return Util.toBool(r.enabled); }).length;
    results.push(broken.length ? item('割り振りルール', 'NG', '書式エラー：' + broken.map(function (r) { return r.rule_id; }).join(', '))
      : item('割り振りルール', enabledRules ? 'OK' : 'WARN', '有効 ' + enabledRules + '件／全 ' + rules.length + '件'));

    // 6. 定期処理
    var st = Triggers.status();
    var notInstalled = st.items.filter(function (i) { return !i.installed; }).map(function (i) { return i.label; });
    var dup = st.items.filter(function (i) { return i.duplicated; }).map(function (i) { return i.label; });
    if (dup.length) results.push(item('定期処理（トリガー）', 'NG', '重複登録：' + dup.join('、') + '。「登録・再設定」で作り直してください'));
    else if (notInstalled.length) results.push(item('定期処理（トリガー）', 'WARN', '未登録：' + notInstalled.join('、') + '。PCを閉じても動かすには setupTriggers を実行してください'));
    else {
      var q = st.items.filter(function (i) { return i.handler === 'jobQueueCheck'; })[0];
      var recent = q.last_run && (Date.now() - Util.parseDate(q.last_run.time).getTime()) < 60 * 60000;
      results.push(item('定期処理（トリガー）', 'OK', '6件登録済み・1日 約' + st.runs_per_day + '回' +
        (q.last_run ? '・前回の自動振り分け ' + q.last_run.time.slice(5, 16).replace('T', ' ') + (recent ? '' : '（1時間以上前：変化がない場合は記録されません）') : '')));
    }

    // 7. 排他制御
    var lockOk = false;
    try { var lock = LockService.getScriptLock(); lockOk = lock.tryLock(5000); if (lockOk) lock.releaseLock(); } catch (e) { lockOk = false; }
    results.push(item('排他制御（LockService）', lockOk ? 'OK' : 'WARN', lockOk ? 'ロックを取得・解放できました' : '他の処理が実行中の可能性があります。時間をおいて再確認してください'));

    // 8. バックアップ
    try {
      var folder = DriveApp.getFolderById(props.getProperty(Config.PROP_KEYS.BACKUP_FOLDER_ID));
      var last = repo.findAll('ExecutionLogs').filter(function (e) { return e.execution_type === 'BACKUP' && e.result === 'SUCCESS'; }).slice(-1)[0];
      results.push(item('バックアップ', last ? 'OK' : 'WARN', 'フォルダ「' + folder.getName() + '」' + (last ? '・最終 ' + last.end_time.slice(0, 16).replace('T', ' ') : '・まだ実行されていません（手動実行で確認できます）')));
    } catch (e) {
      results.push(item('バックアップ', 'NG', 'バックアップフォルダを開けません。setupSystem を再実行してください'));
    }

    return summarize(results);
  }

  function summarize(results) {
    var ng = results.filter(function (r) { return r.status === 'NG'; }).length;
    var warn = results.filter(function (r) { return r.status === 'WARN'; }).length;
    return { checked_at: Util.nowIso(), overall: ng ? 'NG' : warn ? 'WARN' : 'OK', ng: ng, warn: warn, items: results };
  }

  return { run: run };
})();

/** Apps Script エディタから実行する入口 */
function runSelfCheck() {
  var r = SelfCheck.run();
  Logger.log(r.overall + '\n' + r.items.map(function (i) { return '[' + i.status + '] ' + i.name + '：' + i.detail; }).join('\n'));
  return r;
}
