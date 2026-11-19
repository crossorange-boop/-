/**
 * 52_Backup.gs
 * データベース（スプレッドシート）の定期バックアップ。
 * Drive のバックアップフォルダに複製し、保持世代数を超えた古いものはゴミ箱へ移す
 * （ゴミ箱からは約30日間復元できる。完全削除はしない）。
 */

var Backup = (function () {
  var PREFIX = 'AI統合管制システム_DB_backup_';

  function run(options) {
    options = options || {};
    var props = PropertiesService.getScriptProperties();
    var ssId = props.getProperty(Config.PROP_KEYS.SPREADSHEET_ID);
    var folderId = props.getProperty(Config.PROP_KEYS.BACKUP_FOLDER_ID);
    if (!ssId || !folderId) throw new Util.AppError('NOT_CONFIGURED', 'セットアップが未完了のためバックアップできません');
    var retention = SettingsService.getNumber('BACKUP_RETENTION_COUNT', 14);
    var start = Util.nowIso();

    SpreadsheetApp.flush();
    var folder = DriveApp.getFolderById(folderId);
    var name = PREFIX + Util.compactTimestamp().slice(0, 12);
    var copy = DriveApp.getFileById(ssId).makeCopy(name, folder);

    // 保持世代数を超えた古いバックアップをゴミ箱へ
    var files = [];
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (String(f.getName()).indexOf(PREFIX) === 0) files.push(f);
    }
    files.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
    var trashed = 0;
    files.slice(retention).forEach(function (f) { f.setTrashed(true); trashed++; });

    Repository.get().insert('ExecutionLogs', {
      task_id: '', agent_id: '', execution_type: 'BACKUP', start_time: start, end_time: Util.nowIso(), result: 'SUCCESS',
      error_message: name + '（保持 ' + Math.min(files.length, retention) + '世代・ゴミ箱へ ' + trashed + '件）',
      retry_count: 0, triggered_by: options.triggered_by || 'SYSTEM'
    });
    return { file_id: copy.getId(), name: name, kept: Math.min(files.length, retention), trashed: trashed };
  }

  return { run: run, PREFIX: PREFIX };
})();
