/**
 * 53_SystemService.gs
 * ログの検索とシステムの状態確認（設定・ログ画面用）。
 */

var SystemService = (function () {
  var CELL_LIMIT = 10000000; // Google スプレッドシート1ファイルのセル上限

  function newestFirst(list, key) {
    return list.map(function (x, i) { x._i = i; return x; })
      .sort(function (a, b) { return a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : b._i - a._i; })
      .map(function (x) { delete x._i; return x; });
  }

  /** 実行履歴の検索。filter: { result, execution_type, task_id, agent_id, date, limit } */
  function executions(filter) {
    filter = filter || {};
    var limit = Math.min(Number(filter.limit) || 100, 500);
    var list = Repository.get().findAll('ExecutionLogs').filter(function (e) {
      if (filter.result && e.result !== filter.result) return false;
      if (filter.execution_type && e.execution_type !== filter.execution_type) return false;
      if (filter.task_id && e.task_id !== filter.task_id) return false;
      if (filter.agent_id && e.agent_id !== filter.agent_id) return false;
      if (filter.date && String(e.start_time).slice(0, 10) !== filter.date) return false;
      return true;
    });
    var total = list.length;
    var items = newestFirst(list, 'start_time').slice(0, limit).map(function (e) {
      e.task_name = e.task_id ? AuditService.entityName('Tasks', e.task_id) : '';
      return e;
    });
    return { total: total, items: items };
  }

  /** 変更履歴の検索。filter: { entity_type, action, entity_id, user, date, limit } */
  function audits(filter) {
    filter = filter || {};
    var limit = Math.min(Number(filter.limit) || 100, 500);
    var list = Repository.get().findAll('AuditLogs').filter(function (a) {
      if (filter.entity_type && a.entity_type !== filter.entity_type) return false;
      if (filter.action && a.action !== filter.action) return false;
      if (filter.entity_id && a.entity_id !== filter.entity_id) return false;
      if (filter.user && String(a.user).toLowerCase().indexOf(String(filter.user).toLowerCase()) < 0) return false;
      if (filter.date && String(a.timestamp).slice(0, 10) !== filter.date) return false;
      return true;
    });
    var total = list.length;
    var items = newestFirst(list, 'timestamp').slice(0, limit).map(function (a) {
      a.entity_name = AuditService.entityName(a.entity_type, a.entity_id);
      return a;
    });
    return { total: total, items: items };
  }

  /** システムの状態：データ量、直近24時間のエラー、データベースの場所 */
  function health() {
    var repo = Repository.get();
    var sheets = Object.keys(Config.SHEETS).map(function (name) {
      var rows = repo.findAll(name, { includeDeleted: true }).length;
      return { name: name, rows: rows, cells: (rows + 1) * Config.SHEETS[name].columns.length };
    });
    var totalCells = sheets.reduce(function (n, s) { return n + s.cells; }, 0);
    var since = Util.toIso(new Date(Date.now() - 86400000));
    var errors = repo.findAll('ExecutionLogs').filter(function (e) { return e.result === 'FAILED' && e.start_time >= since; });
    var props = PropertiesService.getScriptProperties();
    var ssId = props.getProperty(Config.PROP_KEYS.SPREADSHEET_ID);
    var folderId = props.getProperty(Config.PROP_KEYS.BACKUP_FOLDER_ID);
    var lastBackup = repo.findAll('ExecutionLogs').filter(function (e) { return e.execution_type === 'BACKUP' && e.result === 'SUCCESS'; }).slice(-1)[0];
    return {
      version: Config.VERSION,
      spreadsheet_url: ssId ? 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit' : '',
      backup_folder_url: folderId ? 'https://drive.google.com/drive/folders/' + folderId : '',
      last_backup: lastBackup ? lastBackup.end_time : '',
      sheets: sheets,
      total_cells: totalCells,
      cell_usage_percent: Math.round(totalCells / CELL_LIMIT * 1000) / 10,
      errors_24h: errors.length,
      owner_email: props.getProperty(Config.PROP_KEYS.OWNER_EMAIL) || ''
    };
  }

  return { executions: executions, audits: audits, health: health };
})();
