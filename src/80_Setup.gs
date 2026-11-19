/**
 * 80_Setup.gs
 * 初回セットアップ（何度実行しても安全）。
 *
 * - データベース用スプレッドシートが無ければ新規作成、あれば開く
 * - 不足しているシートを作成、既存シートには不足している列だけを末尾に追加
 *   （既存の列・データの削除・並べ替え・上書きは一切しない）
 * - 初期設定・初期エージェント・初期割り振りルールは「未登録のものだけ」追加
 * - バックアップ用 Drive フォルダを作成
 *
 * Apps Script エディタで setupSystem を選んで実行する。
 */

var Setup = (function () {
  var DB_NAME = 'AI統合管制システム_DB';
  var BACKUP_FOLDER_NAME = 'AI統合管制システム_バックアップ';

  function openOrCreateSpreadsheet(props, report) {
    var id = props.getProperty(Config.PROP_KEYS.SPREADSHEET_ID);
    if (id) {
      try {
        return { ss: SpreadsheetApp.openById(id), created: false };
      } catch (e) {
        // 既存IDが開けない場合に新規作成すると、データが分裂するため停止する
        throw new Error('登録済みのデータベース（' + id + '）を開けません。削除・権限変更されていないか確認してください。' +
          '意図的に作り直す場合のみ、スクリプトプロパティ SPREADSHEET_ID を削除してから再実行してください。');
      }
    }
    var ss = SpreadsheetApp.create(DB_NAME);
    if (ss.setSpreadsheetTimeZone) ss.setSpreadsheetTimeZone('Asia/Tokyo');
    props.setProperty(Config.PROP_KEYS.SPREADSHEET_ID, ss.getId());
    report.spreadsheetCreated = true;
    return { ss: ss, created: true };
  }

  function styleHeader(sheet, numCols) {
    sheet.getRange(1, 1, 1, numCols).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  /** シートを作成、または不足列を追加する */
  function ensureSheet(ss, name, def, report) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      report.sheetsCreated.push(name);
    }
    var lastCol = sheet.getLastColumn();
    var existing = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); })
      : [];
    // 末尾の空ヘッダーは無視して、その後ろに追加する
    while (existing.length && existing[existing.length - 1] === '') existing.pop();

    var missing = def.columns.filter(function (c) { return existing.indexOf(c) === -1; });
    if (missing.length) {
      sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
      if (existing.length) report.columnsAdded[name] = missing;
    }
    var extra = existing.filter(function (h) { return h && def.columns.indexOf(h) === -1; });
    if (extra.length) report.extraColumnsKept[name] = extra;

    var total = existing.length + missing.length;
    styleHeader(sheet, total);
    // 文字列として保存し、自動の日付・数値変換を防ぐ
    sheet.getRange(1, 1, sheet.getMaxRows(), total).setNumberFormat('@');
    return sheet;
  }

  function removeDefaultSheet(ss) {
    ['シート1', 'Sheet1'].forEach(function (n) {
      var s = ss.getSheetByName(n);
      if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
    });
  }

  function ensureBackupFolder(props, report) {
    var id = props.getProperty(Config.PROP_KEYS.BACKUP_FOLDER_ID);
    if (id) {
      try { DriveApp.getFolderById(id); return id; } catch (e) { /* 開けなければ作り直す（データは失われない） */ }
    }
    var folder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
    props.setProperty(Config.PROP_KEYS.BACKUP_FOLDER_ID, folder.getId());
    report.backupFolderCreated = true;
    return folder.getId();
  }

  function seedDefaults(report, backupFolderId) {
    var repo = Repository.get();
    var now = Util.nowIso();

    Config.DEFAULT_SETTINGS.forEach(function (s) {
      if (!repo.findById('Settings', s[0])) {
        repo.insert('Settings', { setting_key: s[0], setting_value: s[1], description: s[2] });
        report.settingsAdded.push(s[0]);
      }
    });
    if (!repo.findById('Settings', 'BACKUP_FOLDER_ID')) {
      repo.insert('Settings', { setting_key: 'BACKUP_FOLDER_ID', setting_value: backupFolderId, description: 'バックアップ先 Drive フォルダID（自動設定）' });
      report.settingsAdded.push('BACKUP_FOLDER_ID');
    }

    Config.DEFAULT_AGENTS.forEach(function (a) {
      if (!repo.findById('Agents', a.agent_id, { includeDeleted: true })) {
        repo.insert('Agents', {
          agent_id: a.agent_id, agent_name: a.agent_name, provider: a.provider, role: a.role,
          capabilities: a.capabilities, connection_type: a.connection_type,
          availability: 'AVAILABLE', usage_limit_status: 'OK', enabled: true, notes: '',
          priority: a.priority, max_concurrent_tasks: a.max_concurrent_tasks, last_status_changed_at: now
        });
        report.agentsAdded.push(a.agent_id);
      }
    });

    Config.DEFAULT_RULES.forEach(function (r) {
      if (!repo.findById('AssignmentRules', r.rule_id)) {
        var rec = {};
        Object.keys(r).forEach(function (k) { rec[k] = r[k]; });
        rec.enabled = true;
        repo.insert('AssignmentRules', rec);
        report.rulesAdded.push(r.rule_id);
      }
    });
  }

  function run() {
    var report = {
      spreadsheetCreated: false, spreadsheetUrl: '', sheetsCreated: [], columnsAdded: {}, extraColumnsKept: {},
      settingsAdded: [], agentsAdded: [], rulesAdded: [], backupFolderCreated: false, ownerEmail: ''
    };
    var props = PropertiesService.getScriptProperties();

    return Repository.get().withLock(function () {
      var opened = openOrCreateSpreadsheet(props, report);
      var ss = opened.ss;
      report.spreadsheetUrl = ss.getUrl();

      Object.keys(Config.SHEETS).forEach(function (name) {
        ensureSheet(ss, name, Config.SHEETS[name], report);
      });
      if (opened.created) removeDefaultSheet(ss);

      if (!props.getProperty(Config.PROP_KEYS.OWNER_EMAIL)) {
        props.setProperty(Config.PROP_KEYS.OWNER_EMAIL, Session.getEffectiveUser().getEmail());
      }
      report.ownerEmail = props.getProperty(Config.PROP_KEYS.OWNER_EMAIL);

      var backupFolderId = ensureBackupFolder(props, report);

      Repository.get().resetCache();
      seedDefaults(report, backupFolderId);

      Repository.get().insert('AuditLogs', {
        timestamp: Util.nowIso(), user: report.ownerEmail, action: 'SETUP', entity_type: 'System', entity_id: Config.VERSION,
        before_json: '', after_json: JSON.stringify({
          sheetsCreated: report.sheetsCreated, columnsAdded: report.columnsAdded,
          settingsAdded: report.settingsAdded, agentsAdded: report.agentsAdded, rulesAdded: report.rulesAdded
        })
      });
      return report;
    });
  }

  return { run: run, DB_NAME: DB_NAME, BACKUP_FOLDER_NAME: BACKUP_FOLDER_NAME };
})();

/** Apps Script エディタから実行する入口 */
function setupSystem() {
  var report = Setup.run();
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
