/**
 * 11_SheetsRepository.gs
 * Repository の Google Sheets 実装。
 *
 * - 列はヘッダー名で参照する（列の並べ替え・追加に強い）
 * - 1回の実行内ではシートを1度だけ読み込みキャッシュする（API呼び出し削減）
 * - 書き込みは LockService の排他制御下で行う（呼び出し側で withLock を使う）
 * - データは物理削除しない（softDelete は is_deleted を TRUE にする）
 * - 値はすべて文字列で保存する（シートの自動型変換による日付ずれを防ぐ）
 */

var SheetsRepository = (function () {
  var cache = {};
  var spreadsheet = null;
  var lockDepth = 0;

  function getSpreadsheet() {
    if (spreadsheet) return spreadsheet;
    var id = PropertiesService.getScriptProperties().getProperty(Config.PROP_KEYS.SPREADSHEET_ID);
    if (!id) throw new Util.AppError('NOT_CONFIGURED', 'データベースが未作成です。セットアップ（setupSystem）を実行してください');
    spreadsheet = SpreadsheetApp.openById(id);
    return spreadsheet;
  }

  function getDefinition(table) {
    var def = Config.SHEETS[table];
    if (!def) throw new Error('未定義のテーブル: ' + table);
    return def;
  }

  /** シート上の値 → 保存形式の文字列 */
  function toCell(value) {
    if (value === null || value === undefined) return '';
    if (value === true) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value instanceof Date) return Util.toIso(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /** シートの値 → アプリで扱う値（Date は ISO 文字列に、それ以外は文字列に統一） */
  function fromCell(value) {
    if (value instanceof Date) return Util.toIso(value);
    if (value === null || value === undefined) return '';
    return String(value);
  }

  /** テーブル読み込み（キャッシュ付き） */
  function load(table) {
    if (cache[table]) return cache[table];
    getDefinition(table);
    var sheet = getSpreadsheet().getSheetByName(table);
    if (!sheet) throw new Util.AppError('NOT_CONFIGURED', 'シート「' + table + '」がありません。セットアップを実行してください');
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 1 || lastCol < 1) throw new Util.AppError('NOT_CONFIGURED', 'シート「' + table + '」にヘッダーがありません');
    var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = values[0].map(function (h) { return String(h).trim(); });
    var index = {};
    headers.forEach(function (h, i) { if (h) index[h] = i; });
    var rows = values.slice(1).map(function (r) { return r.map(fromCell); });
    // タスクの状態名のゆれ（DONE・完了など）は読み込み時に正式名へ揃える
    if (table === 'Tasks' && index.status !== undefined) {
      rows.forEach(function (r) { r[index.status] = Config.normalizeTaskStatus(r[index.status]); });
    }
    cache[table] = { sheet: sheet, headers: headers, index: index, rows: rows };
    return cache[table];
  }

  function rowToObject(t, row) {
    var obj = {};
    t.headers.forEach(function (h, i) { if (h) obj[h] = row[i] === undefined ? '' : row[i]; });
    return obj;
  }

  function isDeleted(t, row) {
    return t.index.is_deleted !== undefined && Util.toBool(row[t.index.is_deleted]);
  }

  function isEmptyRow(row) {
    return row.every(function (v) { return v === '' || v === null || v === undefined; });
  }

  function findRowIndex(table, id) {
    var t = load(table);
    var col = t.index[getDefinition(table).idColumn];
    var key = String(id);
    for (var i = 0; i < t.rows.length; i++) {
      if (t.rows[i][col] === key) return i;
    }
    return -1;
  }

  function findAll(table, options) {
    options = options || {};
    var t = load(table);
    return t.rows
      .filter(function (r) { return !isEmptyRow(r) && (options.includeDeleted || !isDeleted(t, r)); })
      .map(function (r) { return rowToObject(t, r); });
  }

  function findById(table, id, options) {
    options = options || {};
    if (id === null || id === undefined || id === '') return null;
    var i = findRowIndex(table, id);
    if (i < 0) return null;
    var t = load(table);
    if (!options.includeDeleted && isDeleted(t, t.rows[i])) return null;
    return rowToObject(t, t.rows[i]);
  }

  function findWhere(table, predicate, options) {
    return findAll(table, options).filter(predicate);
  }

  /** 1行をシートへ書き込む（i は rows の添字） */
  function writeRow(t, i) {
    var row = t.rows[i];
    t.sheet.getRange(i + 2, 1, 1, t.headers.length).setValues([row.slice(0, t.headers.length)]);
  }

  function insert(table, record) {
    var def = getDefinition(table);
    var t = load(table);
    var rec = {};
    Object.keys(record || {}).forEach(function (k) { rec[k] = record[k]; });
    if (!rec[def.idColumn]) {
      if (!def.idPrefix) throw new Util.ValidationError(def.idColumn + ' は必須です');
      rec[def.idColumn] = Util.generateId(def.idPrefix);
    }
    if (findRowIndex(table, rec[def.idColumn]) >= 0) {
      throw new Util.AppError('CONFLICT', table + ' に同じID（' + rec[def.idColumn] + '）が既に存在します');
    }
    var now = Util.nowIso();
    if (t.index.created_at !== undefined && !rec.created_at) rec.created_at = now;
    if (t.index.updated_at !== undefined) rec.updated_at = now;
    if (t.index.is_deleted !== undefined) rec.is_deleted = false;
    if (t.index.row_version !== undefined) rec.row_version = 1;

    var row = t.headers.map(function (h) { return h && rec[h] !== undefined ? toCell(rec[h]) : ''; });
    t.rows.push(row);
    writeRow(t, t.rows.length - 1);
    return rowToObject(t, row);
  }

  /** パッチを行に適用（ID・作成日時は変更不可）。変更がなければ false */
  function applyPatch(table, t, i, patch, options) {
    options = options || {};
    var def = getDefinition(table);
    var row = t.rows[i];
    if (options.expectedVersion !== undefined && options.expectedVersion !== null && options.expectedVersion !== ''
      && t.index.row_version !== undefined && String(row[t.index.row_version]) !== String(options.expectedVersion)) {
      throw new Util.AppError('CONFLICT', '他の操作で更新されています。画面を再読み込みしてからやり直してください');
    }
    var changed = false;
    Object.keys(patch || {}).forEach(function (k) {
      if (k === def.idColumn || k === 'created_at' || k === 'row_version' || t.index[k] === undefined) return;
      var v = toCell(patch[k]);
      if (row[t.index[k]] !== v) { row[t.index[k]] = v; changed = true; }
    });
    if (!changed) return false;
    if (t.index.updated_at !== undefined) row[t.index.updated_at] = Util.nowIso();
    if (t.index.row_version !== undefined) row[t.index.row_version] = String((Number(row[t.index.row_version]) || 0) + 1);
    return true;
  }

  function update(table, id, patch, options) {
    var i = findRowIndex(table, id);
    if (i < 0) throw new Util.AppError('NOT_FOUND', table + ' に ' + id + ' が見つかりません');
    var t = load(table);
    var before = rowToObject(t, t.rows[i]);
    if (applyPatch(table, t, i, patch, options)) writeRow(t, i);
    return { before: before, after: rowToObject(t, t.rows[i]) };
  }

  /** 複数行を更新し、変更範囲をまとめて1回で書き込む */
  function updateMany(table, changes) {
    var t = load(table);
    var results = [];
    var minI = Infinity, maxI = -1;
    (changes || []).forEach(function (c) {
      var i = findRowIndex(table, c.id);
      if (i < 0) throw new Util.AppError('NOT_FOUND', table + ' に ' + c.id + ' が見つかりません');
      var before = rowToObject(t, t.rows[i]);
      if (applyPatch(table, t, i, c.patch, c.options)) {
        minI = Math.min(minI, i); maxI = Math.max(maxI, i);
      }
      results.push({ before: before, after: rowToObject(t, t.rows[i]) });
    });
    if (maxI >= 0) {
      var block = t.rows.slice(minI, maxI + 1).map(function (r) {
        var line = r.slice(0, t.headers.length);
        while (line.length < t.headers.length) line.push('');
        return line;
      });
      t.sheet.getRange(minI + 2, 1, block.length, t.headers.length).setValues(block);
    }
    return results;
  }

  function softDelete(table, id) {
    var t = load(table);
    if (t.index.is_deleted === undefined) {
      throw new Util.AppError('INVALID_STATE', table + ' は削除できないデータです（履歴保持のため）');
    }
    return update(table, id, { is_deleted: true });
  }

  /** 排他制御付き実行（入れ子呼び出し可） */
  function withLock(fn, timeoutMs) {
    if (lockDepth > 0) {
      lockDepth++;
      try { return fn(); } finally { lockDepth--; }
    }
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(timeoutMs || 30000);
    } catch (e) {
      throw new Util.AppError('LOCK_TIMEOUT', '他の処理が実行中です。しばらく待ってから再度お試しください');
    }
    lockDepth = 1;
    // 他の実行がシートを更新している可能性があるため、ロック取得時に読み直す
    cache = {};
    try {
      return fn();
    } finally {
      lockDepth = 0;
      SpreadsheetApp.flush();
      lock.releaseLock();
    }
  }

  /** ロックが取れない場合は待たずに諦める（定期処理の重複実行防止用） */
  function tryWithLock(fn) {
    if (lockDepth > 0) return { locked: true, result: withLock(fn) };
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return { locked: false };
    lockDepth = 1;
    cache = {};
    try {
      return { locked: true, result: fn() };
    } finally {
      lockDepth = 0;
      SpreadsheetApp.flush();
      lock.releaseLock();
    }
  }

  function resetCache() {
    cache = {};
    spreadsheet = null;
  }

  return {
    findAll: findAll,
    findById: findById,
    findWhere: findWhere,
    insert: insert,
    update: update,
    updateMany: updateMany,
    softDelete: softDelete,
    withLock: withLock,
    tryWithLock: tryWithLock,
    resetCache: resetCache,
    // セットアップ専用
    _getSpreadsheet: getSpreadsheet
  };
})();
