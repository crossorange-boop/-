/**
 * AI統合管制システム v0.1.2（まとめファイル・自動生成：直接編集しないでください）
 * 元のソース：src/*.gs（32ファイル） 生成元コミット：e2d707a
 * 導入方法：docs/06_ブラウザだけで導入.md
 */
// ===== 00_Config.gs =====
/**
 * 00_Config.gs
 * システム全体の定数・シート定義・列挙値。
 * ビジネスロジックは持たない（定義のみ）。
 */

var Config = (function () {
  /** システムのバージョン */
  var VERSION = '0.1.2';

  /** スクリプトプロパティのキー（値はコード・シートに書かない） */
  var PROP_KEYS = {
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    BACKUP_FOLDER_ID: 'BACKUP_FOLDER_ID',
    OWNER_EMAIL: 'OWNER_EMAIL'
  };

  /** タスク状態 */
  var TASK_STATUS = {
    BACKLOG: 'BACKLOG',
    READY: 'READY',
    ASSIGNED: 'ASSIGNED',
    IN_PROGRESS: 'IN_PROGRESS',
    WAITING: 'WAITING',
    BLOCKED: 'BLOCKED',
    REVIEW: 'REVIEW',
    APPROVAL: 'APPROVAL',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED'
  };

  /** 状態の日本語表示 */
  var TASK_STATUS_LABEL = {
    BACKLOG: '未着手',
    READY: '実行可能',
    ASSIGNED: '担当割当済み',
    IN_PROGRESS: '作業中',
    WAITING: '外部AIの利用待ち',
    BLOCKED: '前提タスク待ち',
    REVIEW: '成果物確認中',
    APPROVAL: '人間の承認待ち',
    COMPLETED: '完了',
    FAILED: '失敗',
    CANCELLED: 'キャンセル'
  };

  /** 終了状態（自動処理の対象外） */
  var TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'];

  /**
   * 状態名のゆれ（シートを直接編集した・他ツールで書き込んだ場合など）→ 正式な状態名。
   * 例：DONE／完了 → COMPLETED。読み込み時とセットアップ時にこの表で揃える。
   */
  var TASK_STATUS_ALIASES = {
    DONE: 'COMPLETED', COMPLETE: 'COMPLETED', FINISHED: 'COMPLETED', '完了': 'COMPLETED', '済': 'COMPLETED', '完了済み': 'COMPLETED',
    CANCELED: 'CANCELLED', CANCEL: 'CANCELLED', '中止': 'CANCELLED', 'キャンセル': 'CANCELLED'
  };

  /** 状態名を正式名に揃える（正式名・不明な値はそのまま返す） */
  function normalizeTaskStatus(value) {
    var v = String(value === null || value === undefined ? '' : value).trim();
    if (!v) return v;
    if (TASK_STATUS_LABEL.hasOwnProperty(v)) return v;
    var upper = v.toUpperCase().replace(/[\s-]+/g, '_');
    if (TASK_STATUS_LABEL.hasOwnProperty(upper)) return upper;
    if (TASK_STATUS_ALIASES.hasOwnProperty(upper)) return TASK_STATUS_ALIASES[upper];
    if (TASK_STATUS_ALIASES.hasOwnProperty(v)) return TASK_STATUS_ALIASES[v];
    return v;
  }

  var PROJECT_STATUS = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
  var PRIORITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  /** 優先度の並び順（小さいほど先） */
  var PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

  var AGENT_AVAILABILITY = ['AVAILABLE', 'BUSY', 'UNAVAILABLE', 'MAINTENANCE'];
  var USAGE_LIMIT_STATUS = ['OK', 'NEAR_LIMIT', 'LIMITED', 'ERROR'];
  var CONNECTION_TYPE = ['INTERNAL', 'MANUAL_QUEUE', 'N8N_WEBHOOK', 'OFFICIAL_API', 'LOCAL_LLM'];

  var REVIEW_STATUS = ['PENDING', 'APPROVED', 'REJECTED'];
  var APPROVAL_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
  var DEPENDENCY_TYPE = ['FS', 'SS', 'FF'];
  var DEPENDENCY_STATUS = ['ACTIVE', 'SATISFIED', 'REMOVED'];
  var EXECUTION_RESULT = ['SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED'];
  var NOTIFICATION_SEVERITY = ['INFO', 'WARN', 'CRITICAL'];
  var ROLES = ['OWNER', 'EDITOR', 'VIEWER'];

  /**
   * シート定義。
   * columns の先頭は指示書で指定された列、後半は設計書3.2の追加列。
   * 列はヘッダー名で参照するため、シート上で列を並べ替えても動作する。
   */
  var SHEETS = {
    Projects: {
      idColumn: 'project_id', idPrefix: 'PRJ',
      columns: ['project_id', 'project_name', 'description', 'priority', 'start_date', 'deadline',
        'status', 'created_at', 'updated_at',
        'goal', 'is_deleted', 'row_version']
    },
    Tasks: {
      idColumn: 'task_id', idPrefix: 'TSK',
      columns: ['task_id', 'project_id', 'parent_task_id', 'task_name', 'description', 'assigned_agent_id',
        'priority', 'status', 'start_date', 'deadline', 'estimated_hours', 'actual_hours',
        'dependency_task_ids', 'retry_count', 'created_at', 'updated_at',
        'category', 'required_capability', 'instruction', 'reference_urls', 'waiting_reason',
        'lock_token', 'locked_until', 'is_deleted', 'row_version']
    },
    Agents: {
      idColumn: 'agent_id', idPrefix: 'AGT',
      columns: ['agent_id', 'agent_name', 'provider', 'role', 'capabilities', 'connection_type',
        'availability', 'usage_limit_status', 'enabled', 'notes',
        'priority', 'max_concurrent_tasks', 'last_status_changed_at', 'row_version']
    },
    Deliverables: {
      idColumn: 'deliverable_id', idPrefix: 'DLV',
      columns: ['deliverable_id', 'task_id', 'file_name', 'file_url', 'version', 'submitted_by',
        'submitted_at', 'review_status', 'review_comment',
        'is_deleted']
    },
    Dependencies: {
      idColumn: 'dependency_id', idPrefix: 'DEP',
      columns: ['dependency_id', 'predecessor_task_id', 'successor_task_id', 'dependency_type', 'status']
    },
    ExecutionLogs: {
      idColumn: 'execution_id', idPrefix: 'EXE',
      columns: ['execution_id', 'task_id', 'agent_id', 'execution_type', 'start_time', 'end_time',
        'result', 'error_message', 'retry_count',
        'triggered_by']
    },
    Approvals: {
      idColumn: 'approval_id', idPrefix: 'APR',
      columns: ['approval_id', 'task_id', 'action_type', 'approval_status', 'requested_at', 'approved_at',
        'approver', 'comment',
        'target_type', 'target_id', 'payload_json']
    },
    Settings: {
      idColumn: 'setting_key', idPrefix: null,
      columns: ['setting_key', 'setting_value', 'description']
    },
    Notifications: {
      idColumn: 'notification_id', idPrefix: 'NTF',
      columns: ['notification_id', 'task_id', 'notification_type', 'message', 'created_at', 'read_status',
        'severity']
    },
    AuditLogs: {
      idColumn: 'audit_id', idPrefix: 'AUD',
      columns: ['audit_id', 'timestamp', 'user', 'action', 'entity_type', 'entity_id', 'before_json', 'after_json']
    },
    AssignmentRules: {
      idColumn: 'rule_id', idPrefix: 'RUL',
      columns: ['rule_id', 'priority', 'match_field', 'keyword_pattern', 'category',
        'required_capability', 'preferred_agent_id', 'enabled']
    }
  };

  /** Settings シートの初期値（セットアップ時、未登録のキーのみ追加する） */
  var DEFAULT_SETTINGS = [
    ['QUEUE_CHECK_INTERVAL_MIN', '5', 'タスクキュー確認間隔（分）。1/5/10/15/30 のいずれか'],
    ['DEADLINE_CHECK_INTERVAL_MIN', '15', '期限・進捗確認間隔（分）。1/5/10/15/30 のいずれか'],
    ['DAILY_PLAN_HOUR', '7', '毎朝の当日タスク一覧作成時刻（時）'],
    ['MIDDAY_CHECK_HOUR', '13', '昼の中間経過レポート作成時刻（時）'],
    ['DAILY_SUMMARY_HOUR', '17', '毎夕の進捗集計時刻（時）'],
    ['BACKUP_HOUR', '3', '毎日のバックアップ時刻（時）'],
    ['DEADLINE_WARNING_HOURS', '48', '「期限が近い」とみなす残り時間（時間）'],
    ['MAX_RETRY_COUNT', '3', '自動再投入の上限回数。超えたら FAILED とし通知'],
    ['JOB_TIME_BUDGET_SEC', '240', '1回の定期処理の上限秒数（GAS上限6分より手前で打ち切り）'],
    ['TASK_LOCK_MINUTES', '10', 'タスク単位ロックの有効時間（分）'],
    ['BACKUP_RETENTION_COUNT', '14', 'バックアップ保持世代数'],
    ['APPROVAL_REQUIRED_ACTIONS', 'SEND_EMAIL,PUBLISH,ORDER,PAYMENT,DELETE_PROJECT,BULK_DELETE', '人間の承認が必須の操作'],
    ['ALLOWED_USERS', '', '追加利用者。「メール:ROLE」をカンマ区切り（ROLE=EDITOR/VIEWER）。空ならオーナーのみ']
  ];

  /** 初期登録エージェント */
  var DEFAULT_AGENTS = [
    { agent_id: 'AGT-CLAUDE-CODE', agent_name: 'Claude Code', provider: 'Anthropic', role: 'システム開発',
      capabilities: 'development,coding,testing,gas', connection_type: 'MANUAL_QUEUE', priority: 1, max_concurrent_tasks: 5 },
    { agent_id: 'AGT-MUSE', agent_name: 'Muse', provider: 'Muse', role: 'Instagram・SNS',
      capabilities: 'sns,instagram,caption,posting_plan', connection_type: 'MANUAL_QUEUE', priority: 1, max_concurrent_tasks: 5 },
    { agent_id: 'AGT-CANVA', agent_name: 'Canva', provider: 'Canva', role: 'デザイン・資料制作',
      capabilities: 'design,slides,banner,document_design', connection_type: 'MANUAL_QUEUE', priority: 1, max_concurrent_tasks: 5 },
    { agent_id: 'AGT-RULE-ENGINE', agent_name: 'Local / Rule Engine', provider: 'Internal', role: '分類・定型判断・タスク管理',
      capabilities: 'classification,routing,scheduling', connection_type: 'INTERNAL', priority: 1, max_concurrent_tasks: 50 }
  ];

  /** 初期の割り振りルール（keyword_pattern は正規表現。大文字小文字を区別しない） */
  var DEFAULT_RULES = [
    { rule_id: 'RUL-DEV', priority: 10, match_field: 'task_name,description,category',
      keyword_pattern: '開発|プログラム|コード|GAS|Apps ?Script|バグ|実装|システム', category: 'development',
      required_capability: 'development', preferred_agent_id: 'AGT-CLAUDE-CODE' },
    { rule_id: 'RUL-SNS', priority: 20, match_field: 'task_name,description,category',
      keyword_pattern: 'Instagram|インスタ|SNS|投稿|リール|ストーリーズ', category: 'sns',
      required_capability: 'sns', preferred_agent_id: 'AGT-MUSE' },
    { rule_id: 'RUL-DESIGN', priority: 30, match_field: 'task_name,description,category',
      keyword_pattern: 'デザイン|バナー|資料|スライド|チラシ|ポスター', category: 'design',
      required_capability: 'design', preferred_agent_id: 'AGT-CANVA' },
    { rule_id: 'RUL-CLASSIFY', priority: 90, match_field: 'task_name,description,category',
      keyword_pattern: '分類|整理|定型|集計|振り分け', category: 'classification',
      required_capability: 'classification', preferred_agent_id: 'AGT-RULE-ENGINE' }
  ];

  return {
    VERSION: VERSION,
    PROP_KEYS: PROP_KEYS,
    TASK_STATUS: TASK_STATUS,
    TASK_STATUS_LABEL: TASK_STATUS_LABEL,
    TERMINAL_STATUSES: TERMINAL_STATUSES,
    TASK_STATUS_ALIASES: TASK_STATUS_ALIASES,
    normalizeTaskStatus: normalizeTaskStatus,
    PROJECT_STATUS: PROJECT_STATUS,
    PRIORITY: PRIORITY,
    PRIORITY_ORDER: PRIORITY_ORDER,
    AGENT_AVAILABILITY: AGENT_AVAILABILITY,
    USAGE_LIMIT_STATUS: USAGE_LIMIT_STATUS,
    CONNECTION_TYPE: CONNECTION_TYPE,
    REVIEW_STATUS: REVIEW_STATUS,
    APPROVAL_STATUS: APPROVAL_STATUS,
    DEPENDENCY_TYPE: DEPENDENCY_TYPE,
    DEPENDENCY_STATUS: DEPENDENCY_STATUS,
    EXECUTION_RESULT: EXECUTION_RESULT,
    NOTIFICATION_SEVERITY: NOTIFICATION_SEVERITY,
    ROLES: ROLES,
    SHEETS: SHEETS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_AGENTS: DEFAULT_AGENTS,
    DEFAULT_RULES: DEFAULT_RULES
  };
})();

// ===== 01_Util.gs =====
/**
 * 01_Util.gs
 * 環境（GAS / Node テスト）に依存しない汎用関数。
 */

var Util = (function () {
  var JST_OFFSET_MS = 9 * 60 * 60 * 1000; // 日本は夏時間なし

  /** 日付を ISO 8601（+09:00）文字列にする */
  function toIso(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return new Date(d.getTime() + JST_OFFSET_MS).toISOString().replace(/\.\d{3}Z$/, '+09:00');
  }

  /** 現在時刻の ISO 文字列 */
  function nowIso() {
    return toIso(new Date());
  }

  /** 文字列・Date を Date に変換。空や不正値は null */
  function parseDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    var s = String(value).trim();
    // 日付のみ（yyyy-MM-dd）は日本時間の 23:59:59 とみなす（期限用途）
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T23:59:59+09:00';
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /** 日本時間の yyyyMMddHHmmss */
  function compactTimestamp(date) {
    return toIso(date || new Date()).slice(0, 19).replace(/[-T:]/g, '');
  }

  /** ランダムな英数字（大文字） */
  function randomToken(length) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  /** 例：TSK-20261117083000-K7QD */
  function generateId(prefix) {
    return prefix + '-' + compactTimestamp() + '-' + randomToken(4);
  }

  /** カンマ区切り文字列 → 配列（空要素除去・前後空白除去） */
  function splitList(value) {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.map(function (v) { return String(v).trim(); }).filter(Boolean);
    return String(value).split(',').map(function (v) { return v.trim(); }).filter(Boolean);
  }

  /** 配列 → カンマ区切り文字列 */
  function joinList(list) {
    return splitList(list).join(',');
  }

  /** シート上の真偽値表現を boolean に */
  function toBool(value) {
    if (value === true || value === false) return value;
    var s = String(value === null || value === undefined ? '' : value).trim().toUpperCase();
    return s === 'TRUE' || s === '1' || s === 'YES';
  }

  /** HTML エスケープ（XSS 対策） */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * アプリケーションエラー。code で種類を区別し、画面にはメッセージだけを返す。
   * code: VALIDATION / NOT_FOUND / CONFLICT / FORBIDDEN / LOCK_TIMEOUT / INVALID_STATE
   */
  function AppError(code, message) {
    this.name = 'AppError';
    this.code = code;
    this.message = message;
    this.stack = new Error(message).stack;
  }
  AppError.prototype = Object.create(Error.prototype);
  AppError.prototype.constructor = AppError;

  /** 入力検証エラー（AppError の VALIDATION） */
  function ValidationError(message) {
    AppError.call(this, 'VALIDATION', message);
    this.name = 'ValidationError';
  }
  ValidationError.prototype = Object.create(AppError.prototype);
  ValidationError.prototype.constructor = ValidationError;

  /**
   * 値の検証。rules: { required, type: 'string'|'number'|'date'|'enum'|'url', maxLength, values }
   * 問題なければ正規化した値を返す。
   */
  function validate(fieldName, value, rules) {
    rules = rules || {};
    var empty = value === null || value === undefined || String(value).trim() === '';
    if (empty) {
      if (rules.required) throw new ValidationError(fieldName + ' は必須です');
      return '';
    }
    switch (rules.type) {
      case 'number': {
        var n = Number(value);
        if (!isFinite(n)) throw new ValidationError(fieldName + ' は数値で入力してください');
        if (rules.min !== undefined && n < rules.min) throw new ValidationError(fieldName + ' は ' + rules.min + ' 以上にしてください');
        return n;
      }
      case 'date': {
        var d = parseDate(value);
        if (!d) throw new ValidationError(fieldName + ' の日付形式が正しくありません');
        return /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim()) ? String(value).trim() : toIso(d);
      }
      case 'enum': {
        var v = String(value).trim();
        if (rules.values.indexOf(v) === -1) throw new ValidationError(fieldName + ' の値が不正です: ' + v);
        return v;
      }
      case 'url': {
        var u = String(value).trim();
        if (!/^https:\/\/[^\s]+$/.test(u)) throw new ValidationError(fieldName + ' は https:// で始まるURLにしてください');
        return u;
      }
      default: {
        var str = String(value).trim();
        var max = rules.maxLength || 5000;
        if (str.length > max) throw new ValidationError(fieldName + ' は ' + max + ' 文字以内にしてください');
        return str;
      }
    }
  }

  return {
    toIso: toIso,
    nowIso: nowIso,
    parseDate: parseDate,
    compactTimestamp: compactTimestamp,
    randomToken: randomToken,
    generateId: generateId,
    splitList: splitList,
    joinList: joinList,
    toBool: toBool,
    escapeHtml: escapeHtml,
    AppError: AppError,
    ValidationError: ValidationError,
    validate: validate
  };
})();

// ===== 10_Repository.gs =====
/**
 * 10_Repository.gs
 * データアクセスの共通インターフェース。
 *
 * サービス層は必ず Repository.get() 経由でデータを扱い、Google Sheets を直接触らない。
 * 将来 PostgreSQL 等へ移行する場合は、同じメソッドを持つ実装を作り Repository.use() で差し替える。
 *
 * 実装が備えるべきメソッド：
 *   findAll(table, options)            options.includeDeleted: 論理削除済みも含める
 *   findById(table, id, options)       見つからなければ null
 *   findWhere(table, predicate, options)
 *   insert(table, record)              → 保存後のレコード（ID・作成日時等を補完）
 *   update(table, id, patch, options)  options.expectedVersion: 楽観ロック → { before, after }
 *   updateMany(table, changes)         changes: [{ id, patch }] → [{ before, after }]
 *   softDelete(table, id)              → { before, after }
 *   withLock(fn, timeoutMs)            排他制御の中で fn を実行
 *   tryWithLock(fn)                    ロックが取れなければ fn を実行せず { locked: false }
 *   resetCache()
 */

var Repository = (function () {
  var REQUIRED_METHODS = ['findAll', 'findById', 'findWhere', 'insert', 'update', 'updateMany',
    'softDelete', 'withLock', 'tryWithLock', 'resetCache'];
  var impl = null;

  function validateImplementation(candidate) {
    var missing = REQUIRED_METHODS.filter(function (m) { return typeof candidate[m] !== 'function'; });
    if (missing.length) throw new Error('Repository 実装に不足しているメソッド: ' + missing.join(', '));
    return true;
  }

  /** 現在の実装を返す（既定は SheetsRepository） */
  function get() {
    return impl || SheetsRepository;
  }

  /** 実装を差し替える（テストや DB 移行時） */
  function use(candidate) {
    validateImplementation(candidate);
    impl = candidate;
  }

  return { REQUIRED_METHODS: REQUIRED_METHODS, get: get, use: use, validateImplementation: validateImplementation };
})();

// ===== 11_SheetsRepository.gs =====
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

// ===== 20_AuditService.gs =====
/**
 * 20_AuditService.gs
 * 変更・削除履歴（AuditLogs）と実行履歴（ExecutionLogs）の記録。
 * 監査ログは追記のみで、更新・削除しない。
 */

var AuditService = (function () {
  var MAX_JSON = 40000; // セル上限（50,000文字）より手前で切り詰める

  function toJson(obj) {
    if (obj === null || obj === undefined) return '';
    var s = JSON.stringify(obj);
    return s.length > MAX_JSON ? s.slice(0, MAX_JSON) + '…(truncated)' : s;
  }

  /** action: CREATE / UPDATE / DELETE / RESTORE / STATUS_CHANGE / APPROVE / REJECT / SETUP など */
  function record(action, entityType, entityId, before, after) {
    return Repository.get().insert('AuditLogs', {
      timestamp: Util.nowIso(), user: Auth.actorName(), action: action,
      entity_type: entityType, entity_id: entityId, before_json: toJson(before), after_json: toJson(after)
    });
  }

  /** 実行履歴の開始を記録し、終了時に呼ぶ finish 関数を返す */
  function startExecution(params) {
    var rec = Repository.get().insert('ExecutionLogs', {
      task_id: params.task_id || '', agent_id: params.agent_id || '', execution_type: params.execution_type,
      start_time: Util.nowIso(), end_time: '', result: '', error_message: '',
      retry_count: params.retry_count || 0, triggered_by: params.triggered_by || Auth.actorName()
    });
    return function finish(result, errorMessage) {
      return Repository.get().update('ExecutionLogs', rec.execution_id, {
        end_time: Util.nowIso(), result: result, error_message: errorMessage ? String(errorMessage).slice(0, 2000) : ''
      }).after;
    };
  }

  /** 開始と終了を同時に記録（短い処理用） */
  function logExecution(params) {
    return Repository.get().insert('ExecutionLogs', {
      task_id: params.task_id || '', agent_id: params.agent_id || '', execution_type: params.execution_type,
      start_time: params.start_time || Util.nowIso(), end_time: Util.nowIso(), result: params.result || 'SUCCESS',
      error_message: params.error_message ? String(params.error_message).slice(0, 2000) : '',
      retry_count: params.retry_count || 0, triggered_by: params.triggered_by || Auth.actorName()
    });
  }

  var NAME_FIELDS = { Projects: 'project_name', Tasks: 'task_name', Agents: 'agent_name', Deliverables: 'file_name', Task: 'task_name' };
  var NAME_TABLES = { Projects: 'Projects', Tasks: 'Tasks', Agents: 'Agents', Deliverables: 'Deliverables', Task: 'Tasks' };

  /** 監査対象の表示名（削除済みも含めて引く） */
  function entityName(entityType, entityId) {
    var table = NAME_TABLES[entityType];
    if (!table || !entityId) return '';
    var rec = Repository.get().findById(table, entityId, { includeDeleted: true });
    return rec ? rec[NAME_FIELDS[entityType]] || '' : '';
  }

  function recentActivity(limit) {
    var repo = Repository.get();
    var audits = repo.findAll('AuditLogs').map(function (a, i) {
      var to = '';
      if (a.action === 'STATUS_CHANGE') {
        try { to = JSON.parse(a.after_json).status || ''; } catch (e) { to = ''; }
      }
      return { kind: 'AUDIT', seq: i, time: a.timestamp, user: a.user, action: a.action, entity_type: a.entity_type,
        entity_id: a.entity_id, to_status: to };
    });
    var execs = repo.findAll('ExecutionLogs').map(function (e, i) {
      return { kind: 'EXECUTION', seq: i, time: e.start_time, user: e.triggered_by, action: e.execution_type, entity_type: 'Task',
        entity_id: e.task_id, result: e.result, error_message: e.error_message };
    });
    // 新しい順。同じ秒の記録は記録順の逆（後に記録したものが上）
    return audits.concat(execs)
      .sort(function (a, b) { return a.time < b.time ? 1 : a.time > b.time ? -1 : b.seq - a.seq; })
      .slice(0, limit || 20)
      .map(function (a) { a.entity_name = entityName(a.entity_type, a.entity_id); return a; });
  }

  return { entityName: entityName, record: record, startExecution: startExecution, logExecution: logExecution, recentActivity: recentActivity };
})();

// ===== 21_ProjectService.gs =====
/**
 * 21_ProjectService.gs
 * プロジェクト管理。削除は承認制（APPROVAL_REQUIRED_ACTIONS に DELETE_PROJECT がある場合）。
 */

var ProjectService = (function () {
  function normalize(input, isCreate) {
    var out = {};
    if (isCreate || input.project_name !== undefined) out.project_name = Util.validate('プロジェクト名', input.project_name, { required: true, maxLength: 200 });
    if (input.description !== undefined) out.description = Util.validate('説明', input.description, { maxLength: 5000 });
    if (input.goal !== undefined) out.goal = Util.validate('目標', input.goal, { maxLength: 2000 });
    if (isCreate || input.priority !== undefined) out.priority = Util.validate('優先度', input.priority || 'MEDIUM', { type: 'enum', values: Config.PRIORITY });
    if (isCreate || input.status !== undefined) out.status = Util.validate('状態', input.status || 'PLANNING', { type: 'enum', values: Config.PROJECT_STATUS });
    if (input.start_date !== undefined) out.start_date = Util.validate('開始日', input.start_date, { type: 'date' });
    if (input.deadline !== undefined) out.deadline = Util.validate('期限', input.deadline, { type: 'date' });
    return out;
  }

  function checkDates(rec) {
    var s = Util.parseDate(rec.start_date), d = Util.parseDate(rec.deadline);
    if (s && d && d < s) throw new Util.ValidationError('期限は開始日以降にしてください');
  }

  function stats(projectId, tasks, now) {
    var own = tasks.filter(function (t) { return t.project_id === projectId; });
    var active = own.filter(function (t) { return t.status !== 'CANCELLED'; });
    var done = active.filter(function (t) { return t.status === 'COMPLETED'; }).length;
    var overdue = active.filter(function (t) { return TaskService.isOverdue(t, now); }).length;
    return {
      task_count: active.length, completed_count: done, overdue_count: overdue,
      progress: active.length ? Math.round(done / active.length * 100) : 0
    };
  }

  function list() {
    var repo = Repository.get();
    var tasks = repo.findAll('Tasks');
    var now = new Date();
    return repo.findAll('Projects').map(function (p) {
      var s = stats(p.project_id, tasks, now);
      Object.keys(s).forEach(function (k) { p[k] = s[k]; });
      p.is_overdue = !!(Util.parseDate(p.deadline) && Util.parseDate(p.deadline) < now && ['COMPLETED', 'CANCELLED'].indexOf(p.status) < 0);
      return p;
    }).sort(function (a, b) {
      return (Config.PRIORITY_ORDER[a.priority] || 9) - (Config.PRIORITY_ORDER[b.priority] || 9) || (a.deadline || '9') .localeCompare(b.deadline || '9');
    });
  }

  function get(projectId) {
    var repo = Repository.get();
    var p = repo.findById('Projects', projectId);
    if (!p) throw new Util.AppError('NOT_FOUND', 'プロジェクトが見つかりません');
    var s = stats(projectId, repo.findAll('Tasks'), new Date());
    Object.keys(s).forEach(function (k) { p[k] = s[k]; });
    p.tasks = TaskService.list({ project_id: projectId });
    return p;
  }

  function create(input) {
    Auth.require('EDITOR');
    var rec = normalize(input || {}, true);
    checkDates(rec);
    return Repository.get().withLock(function () {
      var saved = Repository.get().insert('Projects', rec);
      AuditService.record('CREATE', 'Projects', saved.project_id, null, saved);
      return saved;
    });
  }

  function update(projectId, input, expectedVersion) {
    Auth.require('EDITOR');
    var patch = normalize(input || {}, false);
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var current = repo.findById('Projects', projectId);
      if (!current) throw new Util.AppError('NOT_FOUND', 'プロジェクトが見つかりません');
      var merged = {};
      Object.keys(current).forEach(function (k) { merged[k] = current[k]; });
      Object.keys(patch).forEach(function (k) { merged[k] = patch[k]; });
      checkDates(merged);
      var res = repo.update('Projects', projectId, patch, { expectedVersion: expectedVersion });
      AuditService.record('UPDATE', 'Projects', projectId, res.before, res.after);
      return res.after;
    });
  }

  /** 削除依頼。承認必須なら承認依頼を作成し、そうでなければ即時に論理削除する */
  function requestDelete(projectId, comment) {
    Auth.require('EDITOR');
    return Repository.get().withLock(function () {
      var p = Repository.get().findById('Projects', projectId);
      if (!p) throw new Util.AppError('NOT_FOUND', 'プロジェクトが見つかりません');
      if (ApprovalService.requiresApproval('DELETE_PROJECT')) {
        var apr = ApprovalService.request({
          action_type: 'DELETE_PROJECT', target_type: 'Projects', target_id: projectId,
          comment: comment || '', payload: { project_name: p.project_name }
        });
        return { status: 'APPROVAL_REQUESTED', approval_id: apr.approval_id };
      }
      deleteNow(projectId);
      return { status: 'DELETED' };
    });
  }

  /** 論理削除（プロジェクトと配下タスク）。承認処理から呼ばれる */
  function deleteNow(projectId) {
    var repo = Repository.get();
    var res = repo.softDelete('Projects', projectId);
    AuditService.record('DELETE', 'Projects', projectId, res.before, res.after);
    repo.findAll('Tasks').filter(function (t) { return t.project_id === projectId; }).forEach(function (t) {
      TaskService._deleteNow(t.task_id);
    });
    return res.after;
  }

  /** 論理削除したプロジェクトの復元（オーナーのみ）。同時に削除された配下タスクも復元する */
  function restore(projectId) {
    Auth.require('OWNER');
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var p = repo.findById('Projects', projectId, { includeDeleted: true });
      if (!p || !Util.toBool(p.is_deleted)) throw new Util.AppError('NOT_FOUND', '削除済みのプロジェクトが見つかりません');
      var res = repo.update('Projects', projectId, { is_deleted: false });
      AuditService.record('RESTORE', 'Projects', projectId, res.before, res.after);
      // プロジェクト削除と同じ時刻（同じ処理）で削除されたタスクだけを戻す
      var deletedAt = String(res.before.updated_at).slice(0, 16);
      var restored = 0;
      repo.findAll('Tasks', { includeDeleted: true }).forEach(function (t) {
        if (t.project_id === projectId && Util.toBool(t.is_deleted) && String(t.updated_at).slice(0, 16) === deletedAt) {
          var r = repo.update('Tasks', t.task_id, { is_deleted: false });
          AuditService.record('RESTORE', 'Tasks', t.task_id, r.before, r.after);
          restored++;
        }
      });
      res.after.restored_tasks = restored;
      return res.after;
    });
  }

  /** 削除済み一覧（プロジェクト・タスク） */
  function trash() {
    var repo = Repository.get();
    var names = {};
    repo.findAll('Projects', { includeDeleted: true }).forEach(function (p) { names[p.project_id] = p.project_name; });
    return {
      projects: repo.findAll('Projects', { includeDeleted: true }).filter(function (p) { return Util.toBool(p.is_deleted); }),
      tasks: repo.findAll('Tasks', { includeDeleted: true }).filter(function (t) { return Util.toBool(t.is_deleted); })
        .map(function (t) { t.project_name = names[t.project_id] || ''; return t; })
    };
  }

  return { list: list, get: get, create: create, update: update, requestDelete: requestDelete, restore: restore, trash: trash, _deleteNow: deleteNow };
})();

// ===== 22_TaskService.gs =====
/**
 * 22_TaskService.gs
 * タスク管理。状態変更は必ず StateMachine を通す。
 */

var TaskService = (function () {
  // 状態名は文字列で直接扱う（ファイルの読み込み順に依存しないため Config を読み込み時に参照しない）

  function normalize(input, isCreate) {
    var out = {};
    if (isCreate || input.task_name !== undefined) out.task_name = Util.validate('タスク名', input.task_name, { required: true, maxLength: 200 });
    if (isCreate || input.project_id !== undefined) out.project_id = Util.validate('プロジェクト', input.project_id, { required: true, maxLength: 100 });
    if (input.parent_task_id !== undefined) out.parent_task_id = Util.validate('親タスク', input.parent_task_id, { maxLength: 100 });
    if (input.description !== undefined) out.description = Util.validate('説明', input.description, { maxLength: 10000 });
    if (input.assigned_agent_id !== undefined) out.assigned_agent_id = Util.validate('担当AI', input.assigned_agent_id, { maxLength: 100 });
    if (isCreate || input.priority !== undefined) out.priority = Util.validate('優先度', input.priority || 'MEDIUM', { type: 'enum', values: Config.PRIORITY });
    if (input.start_date !== undefined) out.start_date = Util.validate('開始予定', input.start_date, { type: 'date' });
    if (input.deadline !== undefined) out.deadline = Util.validate('期限', input.deadline, { type: 'date' });
    if (input.estimated_hours !== undefined) out.estimated_hours = Util.validate('見積時間', input.estimated_hours, { type: 'number', min: 0 });
    if (input.actual_hours !== undefined) out.actual_hours = Util.validate('実績時間', input.actual_hours, { type: 'number', min: 0 });
    if (input.category !== undefined) out.category = Util.validate('カテゴリ', input.category, { maxLength: 100 });
    if (input.required_capability !== undefined) out.required_capability = Util.validate('必要な能力', input.required_capability, { maxLength: 100 });
    if (input.instruction !== undefined) out.instruction = Util.validate('指示書', input.instruction, { maxLength: 40000 });
    if (input.reference_urls !== undefined) {
      out.reference_urls = Util.splitList(input.reference_urls).map(function (u) { return Util.validate('資料URL', u, { type: 'url' }); }).join(',');
    }
    return out;
  }

  function checkReferences(rec, selfId) {
    var repo = Repository.get();
    if (rec.project_id && !repo.findById('Projects', rec.project_id)) throw new Util.ValidationError('プロジェクトが存在しません');
    if (rec.parent_task_id) {
      if (rec.parent_task_id === selfId) throw new Util.ValidationError('自分自身を親タスクにはできません');
      if (!repo.findById('Tasks', rec.parent_task_id)) throw new Util.ValidationError('親タスクが存在しません');
    }
    if (rec.assigned_agent_id && !repo.findById('Agents', rec.assigned_agent_id)) throw new Util.ValidationError('担当AIが存在しません');
    var s = Util.parseDate(rec.start_date), d = Util.parseDate(rec.deadline);
    if (s && d && d < s) throw new Util.ValidationError('期限は開始予定以降にしてください');
  }

  function isOverdue(task, now) {
    var d = Util.parseDate(task.deadline);
    return !!d && d < (now || new Date()) && !StateMachine.isTerminal(task.status);
  }

  function decorate(t, now) {
    t.status_label = Config.TASK_STATUS_LABEL[t.status] || t.status;
    t.is_overdue = isOverdue(t, now);
    return t;
  }

  /** filter: { project_id, status, agent_id, overdue, includeTerminal } */
  function list(filter) {
    filter = filter || {};
    var now = new Date();
    var statuses = Util.splitList(filter.status);
    return Repository.get().findAll('Tasks')
      .filter(function (t) {
        if (filter.project_id && t.project_id !== filter.project_id) return false;
        if (filter.agent_id && t.assigned_agent_id !== filter.agent_id) return false;
        if (statuses.length && statuses.indexOf(t.status) < 0) return false;
        if (filter.overdue && !isOverdue(t, now)) return false;
        return true;
      })
      .map(function (t) { return decorate(t, now); })
      .sort(function (a, b) {
        return (Config.PRIORITY_ORDER[a.priority] || 9) - (Config.PRIORITY_ORDER[b.priority] || 9) ||
          (a.deadline || '9').localeCompare(b.deadline || '9');
      });
  }

  function get(taskId) {
    var repo = Repository.get();
    var t = repo.findById('Tasks', taskId);
    if (!t) throw new Util.AppError('NOT_FOUND', 'タスクが見つかりません');
    var deps = repo.findAll('Dependencies');
    var brief = function (id) {
      var x = repo.findById('Tasks', id);
      return x ? { task_id: x.task_id, task_name: x.task_name, status: x.status, deadline: x.deadline } : { task_id: id, task_name: '(削除済み)', status: '' };
    };
    decorate(t, new Date());
    t.predecessors = DependencyGraph.predecessorsOf(taskId, deps).map(brief);
    t.successors = DependencyGraph.successorsOf(taskId, deps).map(brief);
    t.deliverables = repo.findAll('Deliverables').filter(function (d) { return d.task_id === taskId; });
    t.executions = repo.findAll('ExecutionLogs').filter(function (e) { return e.task_id === taskId; }).slice(-50).reverse();
    t.approvals = repo.findAll('Approvals').filter(function (a) { return a.task_id === taskId; });
    t.next_statuses = StateMachine.nextStatuses(t.status, 'USER');
    t.max_retry_count = SettingsService.getNumber('MAX_RETRY_COUNT', 3);
    return t;
  }

  /** 依存関係の置き換え（Dependencies シートが正、Tasks.dependency_task_ids は表示用） */
  function setDependencies(taskId, predecessorIds) {
    var repo = Repository.get();
    var ids = Util.splitList(predecessorIds).filter(function (v, i, a) { return a.indexOf(v) === i; });
    ids.forEach(function (pid) {
      if (pid === taskId) throw new Util.ValidationError('自分自身を依存タスクにはできません');
      if (!repo.findById('Tasks', pid)) throw new Util.ValidationError('依存タスクが存在しません: ' + pid);
    });
    var all = repo.findAll('Dependencies').filter(function (d) { return d.status !== 'REMOVED'; });
    var current = all.filter(function (d) { return d.successor_task_id === taskId; });
    var others = all.filter(function (d) { return d.successor_task_id !== taskId; });
    var newEdges = ids.map(function (pid) { return { predecessor_task_id: pid, successor_task_id: taskId }; });
    if (DependencyGraph.createsCycle(others, newEdges)) {
      throw new Util.ValidationError('依存関係が循環します（A→B→A のような設定はできません）');
    }
    var removes = current.filter(function (d) { return ids.indexOf(d.predecessor_task_id) < 0; });
    if (removes.length) repo.updateMany('Dependencies', removes.map(function (d) { return { id: d.dependency_id, patch: { status: 'REMOVED' } }; }));
    ids.forEach(function (pid) {
      if (!current.some(function (d) { return d.predecessor_task_id === pid; })) {
        var pred = repo.findById('Tasks', pid);
        repo.insert('Dependencies', {
          predecessor_task_id: pid, successor_task_id: taskId, dependency_type: 'FS',
          status: pred && pred.status === 'COMPLETED' ? 'SATISFIED' : 'ACTIVE'
        });
      }
    });
    return ids.join(',');
  }

  function create(input) {
    Auth.require('EDITOR');
    input = input || {};
    var rec = normalize(input, true);
    return Repository.get().withLock(function () {
      checkReferences(rec, null);
      rec.status = 'BACKLOG';
      rec.retry_count = 0;
      rec.actual_hours = rec.actual_hours === undefined ? '' : rec.actual_hours;
      var repo = Repository.get();
      var saved = repo.insert('Tasks', rec);
      if (input.dependency_task_ids) {
        var deps = setDependencies(saved.task_id, input.dependency_task_ids);
        saved = repo.update('Tasks', saved.task_id, { dependency_task_ids: deps }).after;
      }
      AuditService.record('CREATE', 'Tasks', saved.task_id, null, saved);
      return saved;
    });
  }

  function update(taskId, input, expectedVersion) {
    Auth.require('EDITOR');
    input = input || {};
    if (input.status !== undefined) throw new Util.ValidationError('状態の変更は「状態変更」から行ってください');
    var patch = normalize(input, false);
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var current = repo.findById('Tasks', taskId);
      if (!current) throw new Util.AppError('NOT_FOUND', 'タスクが見つかりません');
      var merged = {};
      Object.keys(current).forEach(function (k) { merged[k] = current[k]; });
      Object.keys(patch).forEach(function (k) { merged[k] = patch[k]; });
      checkReferences(merged, taskId);
      if (input.dependency_task_ids !== undefined) patch.dependency_task_ids = setDependencies(taskId, input.dependency_task_ids);
      var res = repo.update('Tasks', taskId, patch, { expectedVersion: expectedVersion });
      AuditService.record('UPDATE', 'Tasks', taskId, res.before, res.after);
      return res.after;
    });
  }

  /**
   * 状態遷移の本体（権限チェック・ロックは呼び出し側の責任）。
   * options: { actor, reason, extraPatch, expectedVersion }
   */
  function transition(taskId, to, options) {
    options = options || {};
    var actor = options.actor || 'USER';
    var repo = Repository.get();
    var task = repo.findById('Tasks', taskId);
    if (!task) throw new Util.AppError('NOT_FOUND', 'タスクが見つかりません');
    StateMachine.assertTransition(task.status, to, actor, options.reason);

    if (['READY', 'ASSIGNED', 'IN_PROGRESS'].indexOf(to) >= 0) {
      var taskMap = {};
      repo.findAll('Tasks').forEach(function (t) { taskMap[t.task_id] = t; });
      var sat = DependencyGraph.predecessorsSatisfied(taskId, repo.findAll('Dependencies'), taskMap);
      if (!sat.satisfied) {
        throw new Util.AppError('INVALID_STATE', '前提タスクが完了していません: ' + sat.pending.join(', '));
      }
    }
    if ((to === 'ASSIGNED' || to === 'IN_PROGRESS') && !task.assigned_agent_id && !(options.extraPatch || {}).assigned_agent_id) {
      throw new Util.ValidationError('担当AIを設定してください');
    }

    var patch = { status: to, lock_token: '', locked_until: '' };
    patch.waiting_reason = ['WAITING', 'BLOCKED', 'FAILED', 'CANCELLED'].indexOf(to) >= 0 ? String(options.reason || '') : '';
    Object.keys(options.extraPatch || {}).forEach(function (k) { patch[k] = options.extraPatch[k]; });
    var res = repo.update('Tasks', taskId, patch, { expectedVersion: options.expectedVersion });

    if (to === 'COMPLETED') {
      var satisfied = repo.findAll('Dependencies').filter(function (d) { return d.predecessor_task_id === taskId && d.status === 'ACTIVE'; });
      if (satisfied.length) repo.updateMany('Dependencies', satisfied.map(function (d) { return { id: d.dependency_id, patch: { status: 'SATISFIED' } }; }));
    }
    if (to === 'APPROVAL') {
      var pending = repo.findAll('Approvals').some(function (a) { return a.task_id === taskId && a.approval_status === 'PENDING'; });
      if (!pending) {
        ApprovalService.request({ action_type: 'TASK_COMPLETION', target_type: 'Tasks', target_id: taskId, task_id: taskId,
          comment: options.reason || '', payload: { task_name: task.task_name } });
      }
    }
    AuditService.record('STATUS_CHANGE', 'Tasks', taskId, { status: res.before.status }, { status: to, reason: options.reason || '', actor: actor });
    return res.after;
  }

  /** 画面からの状態変更 */
  function changeStatus(taskId, to, reason, expectedVersion) {
    Auth.require('EDITOR');
    return Repository.get().withLock(function () {
      return transition(taskId, to, { actor: 'USER', reason: reason, expectedVersion: expectedVersion });
    });
  }

  function deleteNow(taskId) {
    var repo = Repository.get();
    var res = repo.softDelete('Tasks', taskId);
    var deps = repo.findAll('Dependencies').filter(function (d) {
      return d.status !== 'REMOVED' && (d.predecessor_task_id === taskId || d.successor_task_id === taskId);
    });
    if (deps.length) repo.updateMany('Dependencies', deps.map(function (d) { return { id: d.dependency_id, patch: { status: 'REMOVED' } }; }));
    AuditService.record('DELETE', 'Tasks', taskId, res.before, res.after);
    return res.after;
  }

  /** タスクの論理削除（行は残り、監査ログに記録） */
  function remove(taskId) {
    Auth.require('EDITOR');
    return Repository.get().withLock(function () {
      if (!Repository.get().findById('Tasks', taskId)) throw new Util.AppError('NOT_FOUND', 'タスクが見つかりません');
      return deleteNow(taskId);
    });
  }

  /**
   * 失敗したタスクの再実行（FAILED → READY、再実行回数を加算）。
   * 上限（MAX_RETRY_COUNT）に達している場合はオーナーのみ force で実行できる。
   */
  function retry(taskId, reason, force) {
    var user = Auth.require('EDITOR');
    return Repository.get().withLock(function () {
      var t = Repository.get().findById('Tasks', taskId);
      if (!t) throw new Util.AppError('NOT_FOUND', 'タスクが見つかりません');
      if (t.status !== 'FAILED') throw new Util.AppError('INVALID_STATE', '再実行できるのは「失敗」のタスクだけです');
      var max = SettingsService.getNumber('MAX_RETRY_COUNT', 3);
      var count = Number(t.retry_count) || 0;
      if (count >= max && !(force && user.role === 'OWNER')) {
        throw new Util.AppError('INVALID_STATE', '再実行の上限（' + max + '回）に達しています。内容を見直してからオーナーが「上限を超えて再実行」してください');
      }
      var after = transition(taskId, 'READY', { actor: 'USER', reason: '再実行（' + (count + 1) + '回目）' + (reason ? '：' + reason : ''),
        extraPatch: { retry_count: count + 1 } });
      AuditService.logExecution({ task_id: taskId, agent_id: t.assigned_agent_id, execution_type: 'MANUAL_RETRY', result: 'SUCCESS',
        error_message: reason || '', retry_count: count + 1 });
      return after;
    });
  }

  /** 論理削除したタスクの復元（オーナーのみ）。依存関係は復元しない */
  function restore(taskId) {
    Auth.require('OWNER');
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var t = repo.findById('Tasks', taskId, { includeDeleted: true });
      if (!t || !Util.toBool(t.is_deleted)) throw new Util.AppError('NOT_FOUND', '削除済みのタスクが見つかりません');
      if (!repo.findById('Projects', t.project_id)) throw new Util.AppError('INVALID_STATE', '所属プロジェクトが削除されています。先にプロジェクトを復元してください');
      var res = repo.update('Tasks', taskId, { is_deleted: false });
      AuditService.record('RESTORE', 'Tasks', taskId, res.before, res.after);
      return res.after;
    });
  }

  return {
    retry: retry, restore: restore,
    list: list, get: get, create: create, update: update, changeStatus: changeStatus, remove: remove,
    isOverdue: isOverdue, _transition: transition, _deleteNow: deleteNow, _setDependencies: setDependencies
  };
})();

// ===== 23_AgentService.gs =====
/**
 * 23_AgentService.gs
 * AIエージェント管理。エージェントは削除せず enabled=FALSE で停止する（履歴保持のため）。
 */

var AgentService = (function () {
  var ACTIVE_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'APPROVAL', 'WAITING'];

  function normalize(input, isCreate) {
    var out = {};
    if (isCreate || input.agent_name !== undefined) out.agent_name = Util.validate('AI名', input.agent_name, { required: true, maxLength: 100 });
    if (input.provider !== undefined) out.provider = Util.validate('提供元', input.provider, { maxLength: 100 });
    if (input.role !== undefined) out.role = Util.validate('担当業務', input.role, { maxLength: 500 });
    if (input.capabilities !== undefined) out.capabilities = Util.splitList(input.capabilities).map(function (c) {
      var v = c.toLowerCase();
      if (!/^[a-z0-9_]{1,40}$/.test(v)) throw new Util.ValidationError('能力は半角英小文字・数字・_ で入力してください: ' + c);
      return v;
    }).join(',');
    if (isCreate || input.connection_type !== undefined) out.connection_type = Util.validate('接続方式', input.connection_type || 'MANUAL_QUEUE', { type: 'enum', values: Config.CONNECTION_TYPE });
    if (isCreate || input.availability !== undefined) out.availability = Util.validate('稼働状態', input.availability || 'AVAILABLE', { type: 'enum', values: Config.AGENT_AVAILABILITY });
    if (isCreate || input.usage_limit_status !== undefined) out.usage_limit_status = Util.validate('利用制限', input.usage_limit_status || 'OK', { type: 'enum', values: Config.USAGE_LIMIT_STATUS });
    if (isCreate || input.enabled !== undefined) out.enabled = input.enabled === undefined ? true : Util.toBool(input.enabled);
    if (input.notes !== undefined) out.notes = Util.validate('メモ', input.notes, { maxLength: 2000 });
    if (isCreate || input.priority !== undefined) out.priority = Util.validate('優先度', input.priority === undefined || input.priority === '' ? 5 : input.priority, { type: 'number', min: 1 });
    if (isCreate || input.max_concurrent_tasks !== undefined) out.max_concurrent_tasks = Util.validate('同時担当上限', input.max_concurrent_tasks === undefined || input.max_concurrent_tasks === '' ? 5 : input.max_concurrent_tasks, { type: 'number', min: 1 });
    return out;
  }

  /** 今すぐ新しいタスクを担当できる状態か */
  function isUsable(agent) {
    return Util.toBool(agent.enabled) && agent.availability === 'AVAILABLE' &&
      (agent.usage_limit_status === 'OK' || agent.usage_limit_status === 'NEAR_LIMIT' || agent.usage_limit_status === '');
  }

  function unusableReason(agent) {
    if (!agent) return '担当AIが登録されていません';
    if (!Util.toBool(agent.enabled)) return agent.agent_name + ' は停止中（無効）です';
    if (agent.availability !== 'AVAILABLE') return agent.agent_name + ' は ' + agent.availability + ' です';
    if (!isUsable(agent)) return agent.agent_name + ' は利用制限中（' + agent.usage_limit_status + '）です';
    return '';
  }

  function activeTaskCounts() {
    var counts = {};
    Repository.get().findAll('Tasks').forEach(function (t) {
      if (t.assigned_agent_id && ACTIVE_STATUSES.indexOf(t.status) >= 0) counts[t.assigned_agent_id] = (counts[t.assigned_agent_id] || 0) + 1;
    });
    return counts;
  }

  function list() {
    var counts = activeTaskCounts();
    return Repository.get().findAll('Agents').map(function (a) {
      a.active_task_count = counts[a.agent_id] || 0;
      a.usable = isUsable(a);
      return a;
    });
  }

  function get(agentId) {
    var repo = Repository.get();
    var a = repo.findById('Agents', agentId);
    if (!a) throw new Util.AppError('NOT_FOUND', 'AIエージェントが見つかりません');
    a.usable = isUsable(a);
    a.active_task_count = activeTaskCounts()[agentId] || 0;
    a.executions = repo.findAll('ExecutionLogs').filter(function (e) { return e.agent_id === agentId; }).slice(-50).reverse();
    a.queue = TaskService.list({ agent_id: agentId, status: 'ASSIGNED,IN_PROGRESS,WAITING,REVIEW' });
    return a;
  }

  function create(input) {
    Auth.require('EDITOR');
    input = input || {};
    var rec = normalize(input, true);
    if (input.agent_id) {
      if (!/^AGT-[A-Z0-9-]{2,40}$/.test(input.agent_id)) throw new Util.ValidationError('AI ID は「AGT-英大文字・数字・-」で入力してください');
      rec.agent_id = input.agent_id;
    }
    rec.last_status_changed_at = Util.nowIso();
    return Repository.get().withLock(function () {
      var saved = Repository.get().insert('Agents', rec);
      AuditService.record('CREATE', 'Agents', saved.agent_id, null, saved);
      return saved;
    });
  }

  function update(agentId, input, expectedVersion) {
    Auth.require('EDITOR');
    var patch = normalize(input || {}, false);
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var before = repo.findById('Agents', agentId);
      if (!before) throw new Util.AppError('NOT_FOUND', 'AIエージェントが見つかりません');
      var statusChanged = ['availability', 'usage_limit_status', 'enabled'].some(function (k) {
        return patch[k] !== undefined && String(patch[k] === true ? 'TRUE' : patch[k] === false ? 'FALSE' : patch[k]) !== before[k];
      });
      if (statusChanged) patch.last_status_changed_at = Util.nowIso();
      var res = repo.update('Agents', agentId, patch, { expectedVersion: expectedVersion });
      AuditService.record('UPDATE', 'Agents', agentId, res.before, res.after);
      if (statusChanged) {
        var was = isUsable(res.before), now = isUsable(res.after);
        if (was && !now) {
          NotificationService.create('AGENT_UNAVAILABLE', unusableReason(res.after) + '。担当タスクは利用待ち（WAITING）として保持されます。', { severity: 'WARN' });
        } else if (!was && now) {
          NotificationService.create('AGENT_RECOVERED', res.after.agent_name + ' が利用可能になりました。利用待ちのタスクは次回の定期処理で再開候補に戻ります。', { severity: 'INFO' });
        }
      }
      return res.after;
    });
  }

  /** 稼働状態・利用制限だけを変更する（スマホからの素早い切替用） */
  function setStatus(agentId, availability, usageLimitStatus, notes) {
    var input = {};
    if (availability) input.availability = availability;
    if (usageLimitStatus) input.usage_limit_status = usageLimitStatus;
    if (notes !== undefined && notes !== null) input.notes = notes;
    return update(agentId, input);
  }

  return {
    list: list, get: get, create: create, update: update, setStatus: setStatus,
    isUsable: isUsable, unusableReason: unusableReason, activeTaskCounts: activeTaskCounts, ACTIVE_STATUSES: ACTIVE_STATUSES
  };
})();

// ===== 24_DeliverableService.gs =====
/**
 * 24_DeliverableService.gs
 * 成果物管理。ファイル本体は Google Drive に置き、ここではリンクと版を管理する。
 */

var DeliverableService = (function () {
  // 状態名は文字列で直接扱う（ファイルの読み込み順に依存しないため Config を読み込み時に参照しない）

  function list(filter) {
    filter = filter || {};
    var repo = Repository.get();
    var taskNames = {};
    repo.findAll('Tasks').forEach(function (t) { taskNames[t.task_id] = t.task_name; });
    return repo.findAll('Deliverables')
      .filter(function (d) {
        if (filter.task_id && d.task_id !== filter.task_id) return false;
        if (filter.review_status && d.review_status !== filter.review_status) return false;
        return true;
      })
      .map(function (d) { d.task_name = taskNames[d.task_id] || '(削除済みタスク)'; return d; })
      .sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0; });
  }

  /** 成果物登録。同じタスク・同じファイル名なら版を自動で上げる。作業中のタスクは成果物確認中へ進める */
  function register(input) {
    Auth.require('EDITOR');
    input = input || {};
    var taskId = Util.validate('タスク', input.task_id, { required: true, maxLength: 100 });
    var fileName = Util.validate('ファイル名', input.file_name, { required: true, maxLength: 300 });
    var fileUrl = Util.validate('URL', input.file_url, { required: true, type: 'url' });
    var submittedBy = Util.validate('提出者', input.submitted_by || '', { maxLength: 100 });
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var task = repo.findById('Tasks', taskId);
      if (!task) throw new Util.ValidationError('タスクが存在しません');
      var version = repo.findAll('Deliverables', { includeDeleted: true })
        .filter(function (d) { return d.task_id === taskId && d.file_name === fileName; })
        .reduce(function (m, d) { return Math.max(m, Number(d.version) || 0); }, 0) + 1;
      var saved = repo.insert('Deliverables', {
        task_id: taskId, file_name: fileName, file_url: fileUrl, version: version,
        submitted_by: submittedBy || task.assigned_agent_id || Auth.actorName(),
        submitted_at: Util.nowIso(), review_status: 'PENDING', review_comment: ''
      });
      AuditService.record('CREATE', 'Deliverables', saved.deliverable_id, null, saved);
      if (task.status === 'IN_PROGRESS') {
        TaskService._transition(taskId, 'REVIEW', { actor: 'USER', reason: '成果物提出: ' + fileName + ' v' + version });
      }
      return saved;
    });
  }

  /**
   * 成果物の確認。
   * 承認：タスクが成果物確認中なら、未処理の承認依頼があれば承認待ちへ、なければ完了へ。
   * 差し戻し：タスクを作業中に戻す（コメント必須）。
   */
  function review(deliverableId, decision, comment) {
    Auth.require('EDITOR');
    decision = Util.validate('判定', decision, { type: 'enum', values: ['APPROVED', 'REJECTED'] });
    comment = Util.validate('コメント', comment, { required: decision === 'REJECTED', maxLength: 2000 });
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var d = repo.findById('Deliverables', deliverableId);
      if (!d) throw new Util.AppError('NOT_FOUND', '成果物が見つかりません');
      if (d.review_status !== 'PENDING') throw new Util.AppError('INVALID_STATE', 'この成果物は確認済みです');
      var res = repo.update('Deliverables', deliverableId, { review_status: decision, review_comment: comment });
      AuditService.record(decision === 'APPROVED' ? 'APPROVE' : 'REJECT', 'Deliverables', deliverableId, res.before, res.after);

      var task = repo.findById('Tasks', d.task_id);
      if (task && task.status === 'REVIEW') {
        if (decision === 'REJECTED') {
          TaskService._transition(task.task_id, 'IN_PROGRESS', { actor: 'USER', reason: '差し戻し: ' + comment });
        } else {
          var stillPending = repo.findAll('Deliverables').some(function (x) { return x.task_id === task.task_id && x.review_status === 'PENDING'; });
          if (!stillPending) {
            var needsApproval = repo.findAll('Approvals').some(function (a) { return a.task_id === task.task_id && a.approval_status === 'PENDING'; });
            TaskService._transition(task.task_id, needsApproval ? 'APPROVAL' : 'COMPLETED', { actor: 'USER', reason: '成果物承認' });
          }
        }
      }
      return res.after;
    });
  }

  return { list: list, register: register, review: review };
})();

// ===== 25_ApprovalService.gs =====
/**
 * 25_ApprovalService.gs
 * 人間の承認が必要な操作の管理。承認は OWNER のみ可能。
 *
 * 承認後に自動実行する処理は HANDLERS に登録する。
 * Phase 1 では外部送信（メール・公開・発注・支払い）を自動実行しない。
 * それらは「承認の記録」のみ行い、実際の操作は人間が行う。
 */

var ApprovalService = (function () {
  // 状態名は文字列で直接扱う（ファイルの読み込み順に依存しないため Config を読み込み時に参照しない）

  var HANDLERS = {
    DELETE_PROJECT: function (apr) { ProjectService._deleteNow(apr.target_id); },
    TASK_COMPLETION: function () { /* タスクの完了処理は approve 内で共通に行う */ }
  };

  var ACTION_LABELS = {
    DELETE_PROJECT: 'プロジェクト削除', TASK_COMPLETION: 'タスク完了承認', SEND_EMAIL: 'メール送信',
    PUBLISH: '外部公開', ORDER: '発注', PAYMENT: '支払い', BULK_DELETE: '一括削除'
  };

  function requiresApproval(actionType) {
    return SettingsService.getList('APPROVAL_REQUIRED_ACTIONS').indexOf(actionType) >= 0;
  }

  /** 承認依頼の作成（ロックは呼び出し側） */
  function request(params) {
    var actionType = Util.validate('操作種別', params.action_type, { required: true, maxLength: 50 });
    var saved = Repository.get().insert('Approvals', {
      task_id: params.task_id || '', action_type: actionType, approval_status: 'PENDING',
      requested_at: Util.nowIso(), approved_at: '', approver: '', comment: params.comment || '',
      target_type: params.target_type || '', target_id: params.target_id || '',
      payload_json: params.payload ? JSON.stringify(params.payload) : ''
    });
    NotificationService.create('APPROVAL_REQUESTED',
      '承認依頼：' + (ACTION_LABELS[actionType] || actionType) + '（' + (params.target_id || params.task_id || '') + '）',
      { task_id: params.task_id || '', severity: 'WARN' });
    AuditService.record('CREATE', 'Approvals', saved.approval_id, null, saved);
    return saved;
  }

  /** 画面から任意の承認依頼を作成（例：メール送信の許可を事前に取る） */
  function create(input) {
    Auth.require('EDITOR');
    input = input || {};
    return Repository.get().withLock(function () {
      if (input.task_id && !Repository.get().findById('Tasks', input.task_id)) throw new Util.ValidationError('タスクが存在しません');
      return request({
        action_type: input.action_type, task_id: input.task_id, target_type: input.target_type,
        target_id: input.target_id, comment: Util.validate('コメント', input.comment, { maxLength: 2000 })
      });
    });
  }

  function list(filter) {
    filter = filter || {};
    var repo = Repository.get();
    return repo.findAll('Approvals')
      .filter(function (a) { return !filter.status || a.approval_status === filter.status; })
      .map(function (a) {
        a.action_label = ACTION_LABELS[a.action_type] || a.action_type;
        var t = a.task_id ? repo.findById('Tasks', a.task_id) : null;
        a.task_name = t ? t.task_name : '';
        return a;
      })
      .sort(function (a, b) { return a.requested_at < b.requested_at ? 1 : a.requested_at > b.requested_at ? -1 : 0; });
  }

  function pendingCount() {
    return Repository.get().findAll('Approvals').filter(function (a) { return a.approval_status === 'PENDING'; }).length;
  }

  function loadPending(approvalId) {
    var a = Repository.get().findById('Approvals', approvalId);
    if (!a) throw new Util.AppError('NOT_FOUND', '承認依頼が見つかりません');
    if (a.approval_status !== 'PENDING') throw new Util.AppError('INVALID_STATE', 'この承認依頼は処理済みです');
    return a;
  }

  function approve(approvalId, comment) {
    var user = Auth.require('OWNER');
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var a = loadPending(approvalId);
      // 先に実処理を行い、失敗したら承認済みにしない
      if (HANDLERS[a.action_type]) HANDLERS[a.action_type](a);
      var res = repo.update('Approvals', approvalId, {
        approval_status: 'APPROVED', approved_at: Util.nowIso(), approver: user.email,
        comment: comment ? (a.comment ? a.comment + '\n' : '') + '[承認] ' + comment : a.comment
      });
      AuditService.record('APPROVE', 'Approvals', approvalId, res.before, res.after);

      if (a.task_id) {
        var task = repo.findById('Tasks', a.task_id);
        var others = repo.findAll('Approvals').some(function (x) { return x.task_id === a.task_id && x.approval_status === 'PENDING'; });
        if (task && task.status === 'APPROVAL' && !others) {
          TaskService._transition(a.task_id, 'COMPLETED', { actor: 'APPROVAL', reason: '承認: ' + (comment || '') });
        }
      }
      return res.after;
    });
  }

  function reject(approvalId, comment) {
    var user = Auth.require('OWNER');
    comment = Util.validate('差し戻し理由', comment, { required: true, maxLength: 2000 });
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var a = loadPending(approvalId);
      var res = repo.update('Approvals', approvalId, {
        approval_status: 'REJECTED', approved_at: Util.nowIso(), approver: user.email,
        comment: (a.comment ? a.comment + '\n' : '') + '[差し戻し] ' + comment
      });
      AuditService.record('REJECT', 'Approvals', approvalId, res.before, res.after);
      if (a.task_id) {
        var task = repo.findById('Tasks', a.task_id);
        if (task && task.status === 'APPROVAL') {
          TaskService._transition(a.task_id, 'IN_PROGRESS', { actor: 'USER', reason: '承認差し戻し: ' + comment });
        }
      }
      return res.after;
    });
  }

  return {
    requiresApproval: requiresApproval, request: request, create: create, list: list,
    pendingCount: pendingCount, approve: approve, reject: reject, ACTION_LABELS: ACTION_LABELS
  };
})();

// ===== 26_NotificationService.gs =====
/**
 * 26_NotificationService.gs
 * 画面内通知。Phase 1 ではメール等の外部送信は行わない（外部送信は承認制の対象）。
 */

var NotificationService = (function () {
  /**
   * notification_type 例：DEADLINE_SOON / OVERDUE / WAITING / RECOVERED / FAILED / NEEDS_CLASSIFICATION /
   *   APPROVAL_REQUESTED / DAILY_PLAN / DAILY_SUMMARY / RESCHEDULE_PROPOSAL / SYSTEM
   */
  function create(type, message, options) {
    options = options || {};
    return Repository.get().insert('Notifications', {
      task_id: options.task_id || '', notification_type: type, message: String(message).slice(0, 5000),
      created_at: Util.nowIso(), read_status: 'UNREAD', severity: options.severity || 'INFO'
    });
  }

  /** 同じ種類・同じタスクの未読通知が既にあれば作らない（定期処理での通知の重複を防ぐ） */
  function createOnce(type, message, options) {
    options = options || {};
    var exists = Repository.get().findAll('Notifications').some(function (n) {
      return n.notification_type === type && n.task_id === (options.task_id || '') && n.read_status === 'UNREAD';
    });
    return exists ? null : create(type, message, options);
  }

  function list(options) {
    options = options || {};
    return Repository.get().findAll('Notifications')
      .filter(function (n) { return !options.unreadOnly || n.read_status === 'UNREAD'; })
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0; })
      .slice(0, options.limit || 100);
  }

  function markRead(ids) {
    Auth.require('VIEWER');
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var targets = Util.splitList(ids).filter(function (id) { return repo.findById('Notifications', id); });
      repo.updateMany('Notifications', targets.map(function (id) { return { id: id, patch: { read_status: 'READ' } }; }));
      return targets.length;
    });
  }

  function unreadCount() {
    return Repository.get().findAll('Notifications').filter(function (n) { return n.read_status === 'UNREAD'; }).length;
  }

  return { create: create, createOnce: createOnce, list: list, markRead: markRead, unreadCount: unreadCount };
})();

// ===== 27_ScheduleService.gs =====
/**
 * 27_ScheduleService.gs
 * スケジュール表示用の集計（読み取り専用）。
 *
 * 各項目に calendar（title/start/end/source_id）を持たせ、
 * 将来の Google Calendar 双方向同期（Phase 2）でそのまま使える形にしている。
 */

var ScheduleService = (function () {
  /** filter: { project_id, agent_id, include_completed } */
  function timeline(filter) {
    filter = filter || {};
    var repo = Repository.get();
    var now = new Date();
    var warnHours = SettingsService.getNumber('DEADLINE_WARNING_HOURS', 48);
    var soon = new Date(now.getTime() + warnHours * 3600 * 1000);
    var deps = repo.findAll('Dependencies');
    var all = repo.findAll('Tasks');
    var taskMap = {};
    all.forEach(function (t) { taskMap[t.task_id] = t; });
    var projectNames = {}, agentNames = {};
    repo.findAll('Projects').forEach(function (p) { projectNames[p.project_id] = p.project_name; });
    repo.findAll('Agents').forEach(function (a) { agentNames[a.agent_id] = a.agent_name; });

    var items = all.filter(function (t) {
      if (t.status === 'CANCELLED') return false;
      if (!filter.include_completed && t.status === 'COMPLETED') return false;
      if (filter.project_id && t.project_id !== filter.project_id) return false;
      if (filter.agent_id && t.assigned_agent_id !== filter.agent_id) return false;
      return true;
    }).map(function (t) {
      var deadline = Util.parseDate(t.deadline);
      var overdue = TaskService.isOverdue(t, now);
      var preds = DependencyGraph.predecessorsOf(t.task_id, deps).map(function (id) {
        var p = taskMap[id];
        return { task_id: id, task_name: p ? p.task_name : '(削除済み)', status: p ? p.status : '',
          is_overdue: p ? TaskService.isOverdue(p, now) : false };
      });
      var succIds = DependencyGraph.allSuccessorsOf(t.task_id, deps).filter(function (id) {
        return taskMap[id] && !StateMachine.isTerminal(taskMap[id].status);
      });
      return {
        task_id: t.task_id, task_name: t.task_name, project_id: t.project_id, project_name: projectNames[t.project_id] || '',
        status: t.status, status_label: Config.TASK_STATUS_LABEL[t.status], priority: t.priority,
        assigned_agent_id: t.assigned_agent_id, agent_name: agentNames[t.assigned_agent_id] || '',
        start_date: t.start_date, deadline: t.deadline,
        is_overdue: overdue,
        due_soon: !overdue && !!deadline && deadline <= soon && !StateMachine.isTerminal(t.status),
        predecessors: preds,
        delayed_by_predecessor: preds.some(function (p) { return p.is_overdue; }),
        impacted_successors: overdue ? succIds.map(function (id) { return { task_id: id, task_name: taskMap[id].task_name }; }) : [],
        calendar: { source_id: t.task_id, title: t.task_name, start: t.start_date || t.deadline, end: t.deadline }
      };
    }).sort(function (a, b) {
      return (a.deadline || '9999').localeCompare(b.deadline || '9999') ||
        (Config.PRIORITY_ORDER[a.priority] || 9) - (Config.PRIORITY_ORDER[b.priority] || 9);
    });

    return { today: Util.toIso(now).slice(0, 10), deadline_warning_hours: warnHours, items: items };
  }

  return { timeline: timeline };
})();

// ===== 28_SettingsService.gs =====
/**
 * 28_SettingsService.gs
 * Settings シートの読み書き。秘密情報は扱わない（PropertiesService を使う）。
 */

var SettingsService = (function () {
  var VALID_INTERVALS = ['1', '5', '10', '15', '30'];

  /** 既知キーの検証ルール */
  var RULES = {
    QUEUE_CHECK_INTERVAL_MIN: { type: 'enum', values: VALID_INTERVALS },
    DEADLINE_CHECK_INTERVAL_MIN: { type: 'enum', values: VALID_INTERVALS },
    DAILY_PLAN_HOUR: { type: 'number', min: 0, max: 23, integer: true },
    MIDDAY_CHECK_HOUR: { type: 'number', min: 0, max: 23, integer: true },
    DAILY_SUMMARY_HOUR: { type: 'number', min: 0, max: 23, integer: true },
    BACKUP_HOUR: { type: 'number', min: 0, max: 23, integer: true },
    DEADLINE_WARNING_HOURS: { type: 'number', min: 1, max: 720 },
    MAX_RETRY_COUNT: { type: 'number', min: 0, max: 20, integer: true },
    JOB_TIME_BUDGET_SEC: { type: 'number', min: 30, max: 330 },
    TASK_LOCK_MINUTES: { type: 'number', min: 1, max: 120 },
    BACKUP_RETENTION_COUNT: { type: 'number', min: 1, max: 365, integer: true }
  };

  /** 利用者が画面から変更できないキー */
  var READONLY_KEYS = ['BACKUP_FOLDER_ID'];

  function get(key, defaultValue) {
    try {
      var row = Repository.get().findById('Settings', key);
      if (row && row.setting_value !== '') return row.setting_value;
    } catch (e) {
      if (!(e && e.code === 'NOT_CONFIGURED')) throw e;
    }
    var def = Config.DEFAULT_SETTINGS.filter(function (s) { return s[0] === key; })[0];
    if (def && def[1] !== '') return def[1];
    return defaultValue === undefined ? '' : defaultValue;
  }

  function getNumber(key, defaultValue) {
    var n = Number(get(key, defaultValue));
    return isFinite(n) ? n : defaultValue;
  }

  function getList(key) {
    return Util.splitList(get(key, ''));
  }

  function list() {
    return Repository.get().findAll('Settings').map(function (s) {
      return { setting_key: s.setting_key, setting_value: s.setting_value, description: s.description,
        readonly: READONLY_KEYS.indexOf(s.setting_key) >= 0 };
    });
  }

  function normalize(key, value) {
    var rule = RULES[key];
    if (!rule) return Util.validate(key, value, { maxLength: 2000 });
    if (rule.type === 'enum') return Util.validate(key, String(value), rule);
    var n = Util.validate(key, value, { type: 'number', required: true, min: rule.min });
    if (n > rule.max) throw new Util.ValidationError(key + ' は ' + rule.max + ' 以下にしてください');
    if (rule.integer && Math.floor(n) !== n) throw new Util.ValidationError(key + ' は整数にしてください');
    return String(n);
  }

  function update(key, value) {
    Auth.require('OWNER');
    if (READONLY_KEYS.indexOf(key) >= 0) throw new Util.AppError('FORBIDDEN', key + ' は変更できません');
    var normalized = normalize(key, value);
    return Repository.get().withLock(function () {
      var repo = Repository.get();
      var res;
      if (repo.findById('Settings', key)) {
        res = repo.update('Settings', key, { setting_value: normalized });
      } else {
        res = { before: null, after: repo.insert('Settings', { setting_key: key, setting_value: normalized, description: '' }) };
      }
      AuditService.record('UPDATE', 'Settings', key, res.before, res.after);
      return res.after;
    });
  }

  return { get: get, getNumber: getNumber, getList: getList, list: list, update: update, normalize: normalize, VALID_INTERVALS: VALID_INTERVALS };
})();

// ===== 29_DashboardService.gs =====
/**
 * 29_DashboardService.gs
 * 総合ダッシュボードの集計（読み取り専用）。
 */

var DashboardService = (function () {
  /** 画面の4分類（指示書：未着手・進行中・完了・保留） */
  var GROUPS = [
    { key: 'NOT_STARTED', label: '未着手', statuses: ['BACKLOG', 'READY'] },
    { key: 'IN_PROGRESS', label: '進行中', statuses: ['ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'APPROVAL'] },
    { key: 'ON_HOLD', label: '保留', statuses: ['WAITING', 'BLOCKED', 'FAILED'] },
    { key: 'COMPLETED', label: '完了', statuses: ['COMPLETED'] }
  ];

  function summary() {
    var repo = Repository.get();
    var now = new Date();
    var warnHours = SettingsService.getNumber('DEADLINE_WARNING_HOURS', 48);
    var projects = repo.findAll('Projects');
    var tasks = repo.findAll('Tasks').filter(function (t) { return t.status !== 'CANCELLED'; });
    var projectNames = {};
    projects.forEach(function (p) { projectNames[p.project_id] = p.project_name; });

    var byStatus = {};
    Object.keys(Config.TASK_STATUS).forEach(function (s) { byStatus[s] = 0; });
    tasks.forEach(function (t) { if (byStatus[t.status] !== undefined) byStatus[t.status]++; });

    var groups = GROUPS.map(function (g) {
      return { key: g.key, label: g.label, statuses: g.statuses,
        count: g.statuses.reduce(function (n, s) { return n + byStatus[s]; }, 0) };
    });

    var brief = function (t) {
      return { task_id: t.task_id, task_name: t.task_name, status: t.status,
        status_label: Config.TASK_STATUS_LABEL[t.status], deadline: t.deadline,
        project_name: projectNames[t.project_id] || '', assigned_agent_id: t.assigned_agent_id, priority: t.priority };
    };
    var byDeadline = function (a, b) { return (a.deadline || '').localeCompare(b.deadline || ''); };

    var overdue = tasks.filter(function (t) { return TaskService.isOverdue(t, now); }).sort(byDeadline).map(brief);
    var soonLimit = new Date(now.getTime() + warnHours * 3600 * 1000);
    var dueSoon = tasks.filter(function (t) {
      var d = Util.parseDate(t.deadline);
      return d && d >= now && d <= soonLimit && !StateMachine.isTerminal(t.status);
    }).sort(byDeadline).map(brief);

    var counts = AgentService.activeTaskCounts();
    var agents = repo.findAll('Agents').map(function (a) {
      return { agent_id: a.agent_id, agent_name: a.agent_name, active_task_count: counts[a.agent_id] || 0,
        usable: AgentService.isUsable(a), availability: a.availability, usage_limit_status: a.usage_limit_status,
        enabled: Util.toBool(a.enabled) };
    });
    var unassigned = tasks.filter(function (t) { return !t.assigned_agent_id && !StateMachine.isTerminal(t.status); }).length;

    return {
      generated_at: Util.nowIso(),
      project_count: projects.length,
      active_project_count: projects.filter(function (p) { return p.status === 'ACTIVE'; }).length,
      task_count: tasks.length,
      groups: groups,
      by_status: byStatus,
      overdue_count: overdue.length,
      overdue: overdue.slice(0, 10),
      due_soon: dueSoon.slice(0, 10),
      deadline_warning_hours: warnHours,
      agents: agents,
      unassigned_count: unassigned,
      pending_approval_count: ApprovalService.pendingCount(),
      unread_notification_count: NotificationService.unreadCount(),
      recent_activity: AuditService.recentActivity(10)
    };
  }

  return { summary: summary, GROUPS: GROUPS };
})();

// ===== 30_StateMachine.gs =====
/**
 * 30_StateMachine.gs
 * タスク状態の遷移ルール（純粋関数・シートに依存しない）。
 * 表に無い遷移はすべて拒否する。
 *
 * actor：
 *   USER     … 画面からの人間の操作
 *   SYSTEM   … 定期処理（自動管理エンジン）
 *   APPROVAL … 承認処理（ApprovalService）経由
 */

var StateMachine = (function () {
  // 状態名は文字列で直接扱う（ファイルの読み込み順に依存しないため Config を読み込み時に参照しない）

  var TRANSITIONS = {};
  TRANSITIONS['BACKLOG'] = ['READY', 'ASSIGNED', 'BLOCKED', 'WAITING', 'CANCELLED'];
  TRANSITIONS['READY'] = ['ASSIGNED', 'BLOCKED', 'WAITING', 'BACKLOG', 'CANCELLED'];
  TRANSITIONS['ASSIGNED'] = ['IN_PROGRESS', 'READY', 'WAITING', 'BLOCKED', 'FAILED', 'CANCELLED'];
  TRANSITIONS['IN_PROGRESS'] = ['REVIEW', 'WAITING', 'BLOCKED', 'FAILED', 'ASSIGNED', 'CANCELLED'];
  TRANSITIONS['WAITING'] = ['READY', 'ASSIGNED', 'IN_PROGRESS', 'CANCELLED'];
  TRANSITIONS['BLOCKED'] = ['READY', 'BACKLOG', 'CANCELLED'];
  TRANSITIONS['REVIEW'] = ['APPROVAL', 'COMPLETED', 'IN_PROGRESS', 'FAILED', 'CANCELLED'];
  TRANSITIONS['APPROVAL'] = ['COMPLETED', 'IN_PROGRESS', 'CANCELLED'];
  TRANSITIONS['FAILED'] = ['READY', 'BACKLOG', 'CANCELLED'];
  TRANSITIONS['COMPLETED'] = [];
  TRANSITIONS['CANCELLED'] = ['BACKLOG']; // 復元（人間のみ）

  /** 定期処理が自動で行ってよい遷移先 */
  var SYSTEM_TARGETS = ['READY', 'ASSIGNED', 'WAITING', 'BLOCKED', 'FAILED', 'BACKLOG'];

  /** 理由の入力が必要な遷移先 */
  var REASON_REQUIRED = ['CANCELLED', 'FAILED', 'WAITING'];

  function check(from, to, actor) {
    actor = actor || 'USER';
    if (!TRANSITIONS.hasOwnProperty(from)) return { ok: false, reason: '不明な状態です: ' + from };
    if (!TRANSITIONS.hasOwnProperty(to)) return { ok: false, reason: '不明な状態です: ' + to };
    if (from === to) return { ok: false, reason: '状態が変わりません' };
    if (TRANSITIONS[from].indexOf(to) === -1) {
      return { ok: false, reason: label(from) + ' から ' + label(to) + ' へは変更できません' };
    }
    if (actor === 'SYSTEM' && SYSTEM_TARGETS.indexOf(to) === -1) {
      return { ok: false, reason: '自動処理では ' + label(to) + ' に変更できません' };
    }
    if (from === 'APPROVAL' && to === 'COMPLETED' && actor !== 'APPROVAL') {
      return { ok: false, reason: '承認待ちのタスクは承認画面から承認してください' };
    }
    if (to === 'CANCELLED' && actor !== 'USER') {
      return { ok: false, reason: 'キャンセルは人間の操作でのみ行えます' };
    }
    if (from === 'CANCELLED' && actor !== 'USER') {
      return { ok: false, reason: 'キャンセルの取り消しは人間の操作でのみ行えます' };
    }
    return { ok: true };
  }

  function assertTransition(from, to, actor, reason) {
    var r = check(from, to, actor);
    if (!r.ok) throw new Util.AppError('INVALID_STATE', r.reason);
    if (REASON_REQUIRED.indexOf(to) >= 0 && !String(reason || '').trim()) {
      throw new Util.ValidationError(label(to) + ' にする理由を入力してください');
    }
    return true;
  }

  /** 画面に表示する「次に選べる状態」 */
  function nextStatuses(from, actor) {
    return (TRANSITIONS[from] || []).filter(function (to) { return check(from, to, actor || 'USER').ok; });
  }

  function isTerminal(status) {
    return Config.TERMINAL_STATUSES.indexOf(status) >= 0;
  }

  function label(status) {
    return (Config.TASK_STATUS_LABEL[status] || status) + '(' + status + ')';
  }

  return {
    TRANSITIONS: TRANSITIONS, SYSTEM_TARGETS: SYSTEM_TARGETS, REASON_REQUIRED: REASON_REQUIRED,
    check: check, assertTransition: assertTransition, nextStatuses: nextStatuses, isTerminal: isTerminal
  };
})();

// ===== 31_AssignmentEngine.gs =====
/**
 * 31_AssignmentEngine.gs
 * ルールベースの分類と担当AIの選定（純粋関数・シートに依存しない）。
 *
 * 外部AIへの自動API呼び出しは行わない（Phase 1）。
 * 選定は「人の指定 > 割り振りルールの推奨AI > 能力が一致するAI」の順で、
 * 稼働状態・利用制限・同時担当上限・AIの優先度・現在の担当件数を考慮する。
 */

var AssignmentEngine = (function () {
  var DEFAULT_FIELDS = ['task_name', 'description', 'category'];

  function compileRules(rules) {
    return (rules || [])
      .filter(function (r) { return Util.toBool(r.enabled) && r.keyword_pattern; })
      .map(function (r) {
        var re = null;
        try { re = new RegExp(r.keyword_pattern, 'i'); } catch (e) { re = null; }
        return { rule: r, re: re, fields: Util.splitList(r.match_field).length ? Util.splitList(r.match_field) : DEFAULT_FIELDS };
      })
      .filter(function (c) { return c.re; })
      .sort(function (a, b) { return (Number(a.rule.priority) || 999) - (Number(b.rule.priority) || 999); });
  }

  /**
   * 分類。人が category / required_capability を入力済みならそれを優先する。
   * 戻り値：{ category, required_capability, preferred_agent_id, rule_id, source: 'MANUAL'|'RULE'|'AGENT'|null }
   */
  function classify(task, rules) {
    if (task.required_capability) {
      return { category: task.category || task.required_capability, required_capability: task.required_capability,
        preferred_agent_id: '', rule_id: '', source: 'MANUAL' };
    }
    var compiled = compileRules(rules);
    for (var i = 0; i < compiled.length; i++) {
      var c = compiled[i];
      var text = c.fields.map(function (f) { return task[f] || ''; }).join('\n');
      if (c.re.test(text)) {
        return { category: task.category || c.rule.category, required_capability: c.rule.required_capability,
          preferred_agent_id: c.rule.preferred_agent_id || '', rule_id: c.rule.rule_id, source: 'RULE' };
      }
    }
    if (task.assigned_agent_id) {
      // ルールに一致しなくても、人が担当AIを指定していれば分類済みとして扱う
      return { category: task.category || '', required_capability: '', preferred_agent_id: task.assigned_agent_id, rule_id: '', source: 'AGENT' };
    }
    return { category: '', required_capability: '', preferred_agent_id: '', rule_id: '', source: null };
  }

  function hasCapability(agent, capability) {
    if (!capability) return true;
    return Util.splitList(agent.capabilities).map(function (c) { return c.toLowerCase(); }).indexOf(String(capability).toLowerCase()) >= 0;
  }

  /**
   * 担当AIの選定。
   * counts: { agent_id: 現在の担当件数 }
   * 戻り値：
   *   { decision: 'ASSIGN', agent_id, reason }
   *   { decision: 'WAIT', agent_id, reason }       … 候補はいるが全員利用不可（候補を記録して待つ）
   *   { decision: 'HOLD', agent_id, reason }       … 利用可能だが同時担当上限に達している（READYのまま）
   *   { decision: 'NO_CANDIDATE', reason }         … 能力の合うAIがいない
   */
  function selectAgent(task, classification, agents, counts) {
    counts = counts || {};
    var byId = {};
    agents.forEach(function (a) { byId[a.agent_id] = a; });
    var load = function (a) { return counts[a.agent_id] || 0; };
    var capacity = function (a) { return Number(a.max_concurrent_tasks) || 5; };
    var hasRoom = function (a) { return load(a) < capacity(a); };

    // 1. 人が担当AIを指定している場合はそのAIに固定する
    if (task.assigned_agent_id) {
      var fixed = byId[task.assigned_agent_id];
      if (!fixed) return { decision: 'NO_CANDIDATE', reason: '指定された担当AI（' + task.assigned_agent_id + '）が登録されていません' };
      if (!AgentService.isUsable(fixed)) return { decision: 'WAIT', agent_id: fixed.agent_id, reason: AgentService.unusableReason(fixed) };
      if (!hasRoom(fixed)) return { decision: 'HOLD', agent_id: fixed.agent_id, reason: fixed.agent_name + ' は同時担当上限（' + capacity(fixed) + '件）に達しています' };
      return { decision: 'ASSIGN', agent_id: fixed.agent_id, reason: '指定された担当AI' };
    }

    // 2. 能力が一致する有効なAIを候補にする（推奨AIは能力に関係なく候補に入れる）
    var preferred = classification.preferred_agent_id;
    var candidates = agents.filter(function (a) {
      return Util.toBool(a.enabled) && (a.agent_id === preferred || (classification.required_capability && hasCapability(a, classification.required_capability)));
    });
    if (!candidates.length) {
      return { decision: 'NO_CANDIDATE', reason: classification.required_capability
        ? '能力「' + classification.required_capability + '」を持つ有効なAIがいません'
        : '分類できません（割り振りルールに一致しません）' };
    }

    var score = function (a) {
      return [
        AgentService.isUsable(a) ? 0 : 1,
        hasRoom(a) ? 0 : 1,
        a.agent_id === preferred ? 0 : 1,
        Number(a.priority) || 5,
        load(a)
      ];
    };
    candidates.sort(function (a, b) {
      var sa = score(a), sb = score(b);
      for (var i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
      return a.agent_id < b.agent_id ? -1 : 1;
    });
    var best = candidates[0];
    if (!AgentService.isUsable(best)) {
      var target = byId[preferred] && candidates.indexOf(byId[preferred]) >= 0 ? byId[preferred] : best;
      return { decision: 'WAIT', agent_id: target.agent_id, reason: '候補のAIがすべて利用できません（' + AgentService.unusableReason(target) + '）' };
    }
    if (!hasRoom(best)) {
      return { decision: 'HOLD', agent_id: best.agent_id, reason: '候補のAIがすべて同時担当上限に達しています' };
    }
    return { decision: 'ASSIGN', agent_id: best.agent_id,
      reason: best.agent_id === preferred ? 'ルールの推奨AI' : '能力「' + classification.required_capability + '」が一致' };
  }

  /** 処理順：優先度 → 期限（近い順・未設定は最後）→ 登録順 */
  function sortQueue(tasks) {
    return tasks.slice().sort(function (a, b) {
      return (Config.PRIORITY_ORDER[a.priority] !== undefined ? Config.PRIORITY_ORDER[a.priority] : 9) -
        (Config.PRIORITY_ORDER[b.priority] !== undefined ? Config.PRIORITY_ORDER[b.priority] : 9) ||
        (a.deadline || '9999').localeCompare(b.deadline || '9999') ||
        (a.created_at || '').localeCompare(b.created_at || '');
    });
  }

  return { classify: classify, selectAgent: selectAgent, sortQueue: sortQueue, hasCapability: hasCapability };
})();

// ===== 32_QueueEngine.gs =====
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

// ===== 33_DeadlineEngine.gs =====
/**
 * 33_DeadlineEngine.gs
 * 期限・進捗確認（定期処理：15分間隔）。
 *
 * - 期限が近いタスク（DEADLINE_WARNING_HOURS 以内）を検出して通知
 * - 期限超過を検出して通知
 * - 期限超過タスクの後続タスクへの影響を確認し、スケジュールの再調整案を作成
 *   （再調整案は通知として提示するだけで、自動ではタスクの日付を書き換えない）
 * 同じタスクの同じ種類の通知は、未読のうちは重複して作らない。
 */

var DeadlineEngine = (function () {
  var DAY = 86400000;

  function ymd(date) { return Util.toIso(date).slice(0, 10); }

  /**
   * 再調整案：期限超過日数ぶん、後続タスクの開始予定・期限を後ろにずらす案（純粋関数）
   * 戻り値：[{ task_id, task_name, current_deadline, proposed_deadline, current_start, proposed_start }]
   */
  function proposeReschedule(overdueTask, successors, now) {
    var deadline = Util.parseDate(overdueTask.deadline);
    if (!deadline) return [];
    // 少なくとも1日、超過日数（切り上げ）だけずらす
    var shiftDays = Math.max(1, Math.ceil((now.getTime() - deadline.getTime()) / DAY));
    return successors.map(function (t) {
      var d = Util.parseDate(t.deadline), s = Util.parseDate(t.start_date);
      return {
        task_id: t.task_id, task_name: t.task_name, shift_days: shiftDays,
        current_deadline: t.deadline || '', proposed_deadline: d ? ymd(new Date(d.getTime() + shiftDays * DAY)) : '',
        current_start: t.start_date || '', proposed_start: s ? ymd(new Date(s.getTime() + shiftDays * DAY)) : ''
      };
    });
  }

  function run(options) {
    options = options || {};
    var triggeredBy = options.triggered_by || 'SYSTEM';
    var outcome = Repository.get().tryWithLock(function () {
      return Auth.runAsSystem(function () { return process(triggeredBy); });
    });
    if (!outcome.locked) return { skipped: true, reason: '前回の処理が実行中のためスキップしました' };
    return outcome.result;
  }

  function process(triggeredBy) {
    var repo = Repository.get();
    var now = new Date();
    var startIso = Util.nowIso();
    var warnHours = SettingsService.getNumber('DEADLINE_WARNING_HOURS', 48);
    var soonLimit = new Date(now.getTime() + warnHours * 3600000);
    var all = repo.findAll('Tasks');
    var byId = {};
    all.forEach(function (t) { byId[t.task_id] = t; });
    var deps = repo.findAll('Dependencies');
    var summary = { due_soon: 0, overdue: 0, impacted: 0, proposals: 0, notified: 0, errors: 0 };

    all.filter(function (t) { return !StateMachine.isTerminal(t.status); }).forEach(function (t) {
      try {
        var d = Util.parseDate(t.deadline);
        if (!d) return;
        if (d < now) {
          summary.overdue++;
          if (NotificationService.createOnce('OVERDUE', '期限超過：「' + t.task_name + '」（期限 ' + t.deadline.slice(0, 16).replace('T', ' ') + '・' + (Config.TASK_STATUS_LABEL[t.status] || t.status) + '）',
            { task_id: t.task_id, severity: 'CRITICAL' })) summary.notified++;

          var successors = DependencyGraph.allSuccessorsOf(t.task_id, deps)
            .map(function (id) { return byId[id]; })
            .filter(function (s) { return s && !StateMachine.isTerminal(s.status); });
          if (successors.length) {
            summary.impacted += successors.length;
            var plan = proposeReschedule(t, successors, now);
            var lines = plan.map(function (p) {
              return '・' + p.task_name + '：期限 ' + (p.current_deadline ? p.current_deadline.slice(0, 10) + ' → ' + p.proposed_deadline : '未設定') +
                (p.current_start ? '／開始 ' + p.current_start.slice(0, 10) + ' → ' + p.proposed_start : '');
            });
            if (NotificationService.createOnce('RESCHEDULE_PROPOSAL',
              '再調整案：「' + t.task_name + '」の期限超過により後続 ' + successors.length + '件に影響があります。' + plan[0].shift_days + '日ずらす案：\n' + lines.join('\n') +
              '\n（自動では変更しません。採用する場合は各タスクの期限を編集してください）',
              { task_id: t.task_id, severity: 'WARN' })) { summary.proposals++; summary.notified++; }
          }
        } else if (d <= soonLimit) {
          summary.due_soon++;
          if (NotificationService.createOnce('DEADLINE_SOON', '期限間近：「' + t.task_name + '」（期限 ' + t.deadline.slice(0, 16).replace('T', ' ') + '・' + (Config.TASK_STATUS_LABEL[t.status] || t.status) + '）',
            { task_id: t.task_id, severity: 'WARN' })) summary.notified++;
        }
      } catch (e) {
        summary.errors++;
        AuditService.logExecution({ task_id: t.task_id, execution_type: 'DEADLINE_CHECK', result: 'FAILED', error_message: e && e.message ? e.message : String(e), triggered_by: triggeredBy });
      }
    });

    if (summary.notified || summary.errors) {
      repo.insert('ExecutionLogs', {
        task_id: '', agent_id: 'AGT-RULE-ENGINE', execution_type: 'DEADLINE_CHECK', start_time: startIso, end_time: Util.nowIso(),
        result: summary.errors ? 'PARTIAL' : 'SUCCESS',
        error_message: '期限超過' + summary.overdue + '・期限間近' + summary.due_soon + '・後続影響' + summary.impacted + '・再調整案' + summary.proposals + '・新規通知' + summary.notified,
        retry_count: 0, triggered_by: triggeredBy
      });
    }
    return summary;
  }

  return { run: run, proposeReschedule: proposeReschedule };
})();

// ===== 35_DependencyGraph.gs =====
/**
 * 35_DependencyGraph.gs
 * タスク依存関係の計算（純粋関数・シートに依存しない）。
 * edges: [{ predecessor_task_id, successor_task_id }]
 */

var DependencyGraph = (function () {
  function activeEdges(dependencies) {
    return (dependencies || []).filter(function (d) { return d.status !== 'REMOVED'; });
  }

  function adjacency(edges) {
    var adj = {};
    edges.forEach(function (e) {
      (adj[e.predecessor_task_id] = adj[e.predecessor_task_id] || []).push(e.successor_task_id);
    });
    return adj;
  }

  /** 新しい辺を加えたときに循環が生じるか */
  function createsCycle(edges, newEdges) {
    var all = activeEdges(edges).concat(newEdges || []);
    var adj = adjacency(all);
    var WHITE = 0, GRAY = 1, BLACK = 2;
    var color = {};
    var nodes = {};
    all.forEach(function (e) { nodes[e.predecessor_task_id] = true; nodes[e.successor_task_id] = true; });

    function visit(n) {
      color[n] = GRAY;
      var next = adj[n] || [];
      for (var i = 0; i < next.length; i++) {
        var c = color[next[i]] || WHITE;
        if (c === GRAY) return true;
        if (c === WHITE && visit(next[i])) return true;
      }
      color[n] = BLACK;
      return false;
    }
    var keys = Object.keys(nodes);
    for (var i = 0; i < keys.length; i++) {
      if ((color[keys[i]] || WHITE) === WHITE && visit(keys[i])) return true;
    }
    return false;
  }

  /** 直接の前提タスクID */
  function predecessorsOf(taskId, dependencies) {
    return activeEdges(dependencies)
      .filter(function (d) { return d.successor_task_id === taskId; })
      .map(function (d) { return d.predecessor_task_id; });
  }

  /** 直接の後続タスクID */
  function successorsOf(taskId, dependencies) {
    return activeEdges(dependencies)
      .filter(function (d) { return d.predecessor_task_id === taskId; })
      .map(function (d) { return d.successor_task_id; });
  }

  /** 影響を受ける全後続タスクID（多段） */
  function allSuccessorsOf(taskId, dependencies) {
    var adj = adjacency(activeEdges(dependencies));
    var seen = {}, out = [], stack = (adj[taskId] || []).slice();
    while (stack.length) {
      var n = stack.pop();
      if (seen[n]) continue;
      seen[n] = true; out.push(n);
      (adj[n] || []).forEach(function (m) { stack.push(m); });
    }
    return out;
  }

  /**
   * 前提タスクがすべて完了しているか。
   * 削除済み（見つからない）・キャンセル済みの前提は「満たされた」とみなす。
   */
  function predecessorsSatisfied(taskId, dependencies, taskMap) {
    var pending = predecessorsOf(taskId, dependencies).filter(function (pid) {
      var p = taskMap[pid];
      return p && p.status !== 'COMPLETED' && p.status !== 'CANCELLED';
    });
    return { satisfied: pending.length === 0, pending: pending };
  }

  return {
    createsCycle: createsCycle, predecessorsOf: predecessorsOf, successorsOf: successorsOf,
    allSuccessorsOf: allSuccessorsOf, predecessorsSatisfied: predecessorsSatisfied
  };
})();

// ===== 37_WorkQueueService.gs =====
/**
 * 37_WorkQueueService.gs
 * 担当AI別の作業待ちキュー（外部AIと直接連携できない間の運用）。
 * 画面から指示書と必要資料をまとめて確認・コピーし、各AIに手渡しする。
 */

var WorkQueueService = (function () {
  // 状態名は文字列で直接扱う（ファイルの読み込み順に依存しないため Config を読み込み時に参照しない）
  var QUEUE_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'WAITING', 'REVIEW'];

  /** 各AIへ貼り付ける指示書テキスト */
  function buildInstructionText(task, projectName, predecessors) {
    var lines = [];
    lines.push('【作業依頼】' + task.task_name);
    if (projectName) lines.push('プロジェクト：' + projectName);
    if (task.deadline) lines.push('期限：' + String(task.deadline).slice(0, 16).replace('T', ' '));
    if (task.priority) lines.push('優先度：' + task.priority);
    lines.push('');
    if (task.description) { lines.push('■ 概要'); lines.push(task.description); lines.push(''); }
    lines.push('■ 指示');
    lines.push(task.instruction || '（指示書が未入力です。管理画面で入力してください）');
    var refs = Util.splitList(task.reference_urls);
    if (refs.length) { lines.push(''); lines.push('■ 参考資料'); refs.forEach(function (u) { lines.push('- ' + u); }); }
    if (predecessors && predecessors.length) {
      lines.push(''); lines.push('■ 前提となる完了済みタスク');
      predecessors.forEach(function (p) { lines.push('- ' + p); });
    }
    lines.push('');
    lines.push('■ 納品');
    lines.push('成果物は Google Drive に保存し、共有リンクを管理画面のタスク（ID: ' + task.task_id + '）に登録してください。');
    return lines.join('\n');
  }

  function byAgent() {
    var repo = Repository.get();
    var now = new Date();
    var projectNames = {};
    repo.findAll('Projects').forEach(function (p) { projectNames[p.project_id] = p.project_name; });
    var all = repo.findAll('Tasks');
    var names = {};
    all.forEach(function (t) { names[t.task_id] = t.task_name; });
    var deps = repo.findAll('Dependencies');
    var tasks = AssignmentEngine.sortQueue(all.filter(function (t) { return QUEUE_STATUSES.indexOf(t.status) >= 0 && t.assigned_agent_id; }));

    var lanes = repo.findAll('Agents').map(function (a) {
      var own = tasks.filter(function (t) { return t.assigned_agent_id === a.agent_id; }).map(function (t) {
        var preds = DependencyGraph.predecessorsOf(t.task_id, deps).map(function (id) { return names[id] || id; });
        return {
          task_id: t.task_id, task_name: t.task_name, project_name: projectNames[t.project_id] || '', status: t.status,
          status_label: Config.TASK_STATUS_LABEL[t.status], priority: t.priority, deadline: t.deadline,
          is_overdue: TaskService.isOverdue(t, now), waiting_reason: t.waiting_reason, row_version: t.row_version,
          has_instruction: !!t.instruction, reference_urls: Util.splitList(t.reference_urls),
          description: t.description, instruction: t.instruction, predecessors: preds, agent_name: a.agent_name,
          instruction_text: buildInstructionText(t, projectNames[t.project_id], preds)
        };
      });
      return {
        agent_id: a.agent_id, agent_name: a.agent_name, connection_type: a.connection_type, usable: AgentService.isUsable(a),
        enabled: Util.toBool(a.enabled), unusable_reason: AgentService.unusableReason(a),
        max_concurrent_tasks: a.max_concurrent_tasks, tasks: own,
        counts: {
          assigned: own.filter(function (t) { return t.status === 'ASSIGNED'; }).length,
          in_progress: own.filter(function (t) { return t.status === 'IN_PROGRESS'; }).length,
          waiting: own.filter(function (t) { return t.status === 'WAITING'; }).length,
          review: own.filter(function (t) { return t.status === 'REVIEW'; }).length
        }
      };
    });
    var lastRun = repo.findAll('ExecutionLogs').filter(function (e) { return e.execution_type === 'QUEUE_CHECK'; }).slice(-1)[0] || null;
    return {
      lanes: lanes,
      unassigned_backlog: all.filter(function (t) { return ['BACKLOG', 'READY'].indexOf(t.status) >= 0; }).length,
      last_run: lastRun ? { time: lastRun.end_time || lastRun.start_time, result: lastRun.result, summary: lastRun.error_message } : null
    };
  }

  /** 画面の「今すぐ振り分け」 */
  function runNow() {
    var user = Auth.require('EDITOR');
    return QueueEngine.run({ triggered_by: user.email });
  }

  return { byAgent: byAgent, buildInstructionText: buildInstructionText, runNow: runNow };
})();

// ===== 38_ReportService.gs =====
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

// ===== 39_RuleService.gs =====
/**
 * 39_RuleService.gs
 * 割り振りルール（AssignmentRules）の管理。コードを変えずに画面から編集できる。
 * ルールは削除せず enabled=FALSE で無効化する（履歴保持のため）。
 */

var RuleService = (function () {
  var MATCH_FIELDS = ['task_name', 'description', 'category', 'instruction'];

  function normalize(input, isCreate) {
    var out = {};
    if (isCreate || input.keyword_pattern !== undefined) {
      out.keyword_pattern = Util.validate('キーワード', input.keyword_pattern, { required: true, maxLength: 500 });
      try { new RegExp(out.keyword_pattern, 'i'); } catch (e) {
        throw new Util.ValidationError('キーワードの書き方が正しくありません（「|」で区切って複数指定できます）');
      }
    }
    if (isCreate || input.priority !== undefined) out.priority = Util.validate('優先順位', input.priority === undefined || input.priority === '' ? 50 : input.priority, { type: 'number', min: 1 });
    if (isCreate || input.match_field !== undefined) {
      var fields = Util.splitList(input.match_field || 'task_name,description,category');
      fields.forEach(function (f) { if (MATCH_FIELDS.indexOf(f) < 0) throw new Util.ValidationError('照合する項目が不正です: ' + f); });
      out.match_field = fields.join(',');
    }
    if (isCreate || input.required_capability !== undefined) {
      var cap = String(input.required_capability || '').trim().toLowerCase();
      if (!/^[a-z0-9_]{1,40}$/.test(cap)) throw new Util.ValidationError('必要な能力は半角英小文字・数字・_ で入力してください');
      out.required_capability = cap;
    }
    if (isCreate || input.category !== undefined) out.category = Util.validate('カテゴリ', input.category || out.required_capability, { maxLength: 100 });
    if (input.preferred_agent_id !== undefined) {
      out.preferred_agent_id = Util.validate('推奨AI', input.preferred_agent_id, { maxLength: 100 });
      if (out.preferred_agent_id && !Repository.get().findById('Agents', out.preferred_agent_id)) throw new Util.ValidationError('推奨AIが存在しません');
    }
    if (isCreate || input.enabled !== undefined) out.enabled = input.enabled === undefined ? true : Util.toBool(input.enabled);
    return out;
  }

  function list() {
    var names = {};
    Repository.get().findAll('Agents').forEach(function (a) { names[a.agent_id] = a.agent_name; });
    return Repository.get().findAll('AssignmentRules').map(function (r) {
      r.preferred_agent_name = names[r.preferred_agent_id] || '';
      return r;
    }).sort(function (a, b) { return (Number(a.priority) || 999) - (Number(b.priority) || 999); });
  }

  function create(input) {
    Auth.require('OWNER');
    var rec = normalize(input || {}, true);
    return Repository.get().withLock(function () {
      var saved = Repository.get().insert('AssignmentRules', rec);
      AuditService.record('CREATE', 'AssignmentRules', saved.rule_id, null, saved);
      return saved;
    });
  }

  function update(ruleId, input) {
    Auth.require('OWNER');
    var patch = normalize(input || {}, false);
    return Repository.get().withLock(function () {
      if (!Repository.get().findById('AssignmentRules', ruleId)) throw new Util.AppError('NOT_FOUND', 'ルールが見つかりません');
      var res = Repository.get().update('AssignmentRules', ruleId, patch);
      AuditService.record('UPDATE', 'AssignmentRules', ruleId, res.before, res.after);
      return res.after;
    });
  }

  /** 試し判定：入力したタスク名・説明がどのルールに当たり、どのAIに割り振られるか */
  function test(input) {
    input = input || {};
    var repo = Repository.get();
    var task = { task_name: String(input.task_name || ''), description: String(input.description || ''), category: '', priority: 'MEDIUM' };
    var c = AssignmentEngine.classify(task, repo.findAll('AssignmentRules'));
    var d = c.source ? AssignmentEngine.selectAgent(task, c, repo.findAll('Agents'), AgentService.activeTaskCounts()) : null;
    var agent = d && d.agent_id ? repo.findById('Agents', d.agent_id) : null;
    return { classification: c, decision: d, agent_name: agent ? agent.agent_name : '' };
  }

  return { list: list, create: create, update: update, test: test, MATCH_FIELDS: MATCH_FIELDS };
})();

// ===== 40_AgentAdapter.gs =====
/**
 * 40_AgentAdapter.gs
 * 外部AI接続アダプターの共通インターフェース。
 *
 * 統括機能（振り分け・状態管理）は特定のAIに依存せず、AIとのやり取りだけをアダプターに任せる。
 * アダプターは connection_type ごとに登録し、次のメソッドを持つ：
 *   dispatch(task, agent) → { mode: 'QUEUED' | 'SENT', message }
 *     QUEUED：作業待ちキューに置くだけ（人が指示書を各AIに手渡しする）
 *     SENT  ：公式API等で送信済み（Phase 2 以降）
 *
 * Phase 1 は MANUAL_QUEUE / INTERNAL のみ。いずれも外部へは何も送信しない。
 * Phase 2 で n8n・公式API・ローカルAI 用のアダプターを register() で追加する。
 * 認証情報は PropertiesService に保存し、コードやシートには書かないこと。
 */

var AgentAdapter = (function () {
  var registry = {};

  var ManualQueueAdapter = {
    dispatch: function (task, agent) {
      return { mode: 'QUEUED', message: agent.agent_name + ' の作業待ちキューに追加しました' };
    }
  };

  function register(connectionType, adapter) {
    if (!adapter || typeof adapter.dispatch !== 'function') throw new Error('アダプターには dispatch(task, agent) が必要です');
    registry[connectionType] = adapter;
  }

  /** 未登録の接続方式は手動キューとして扱う（外部送信はしない） */
  function get(connectionType) {
    return registry[connectionType] || ManualQueueAdapter;
  }

  register('MANUAL_QUEUE', ManualQueueAdapter);
  register('INTERNAL', ManualQueueAdapter);

  return { register: register, get: get, ManualQueueAdapter: ManualQueueAdapter };
})();

// ===== 50_Jobs.gs =====
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

// ===== 51_Triggers.gs =====
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

// ===== 52_Backup.gs =====
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

// ===== 53_SystemService.gs =====
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

// ===== 60_Auth.gs =====
/**
 * 60_Auth.gs
 * 利用者の識別と権限（ロール）チェック。
 *
 * ロール：OWNER（全操作）> EDITOR（登録・編集）> VIEWER（閲覧のみ）
 * - OWNER：セットアップを実行したアカウント（スクリプトプロパティ OWNER_EMAIL）
 * - EDITOR / VIEWER：Settings の ALLOWED_USERS に「メール:ROLE」で登録
 * - 定期処理（トリガー）は runAsSystem で SYSTEM として実行する
 */

var Auth = (function () {
  var RANK = { VIEWER: 1, EDITOR: 2, OWNER: 3 };
  var systemDepth = 0;

  function parseAllowedUsers(value) {
    var map = {};
    Util.splitList(value).forEach(function (entry) {
      var parts = entry.split(':');
      var email = String(parts[0] || '').trim().toLowerCase();
      var role = String(parts[1] || 'VIEWER').trim().toUpperCase();
      if (email && (role === 'EDITOR' || role === 'VIEWER')) map[email] = role;
    });
    return map;
  }

  function currentUser() {
    if (systemDepth > 0) return { email: 'SYSTEM', role: 'OWNER', isSystem: true };
    var email = '';
    try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { email = ''; }
    var owner = String(PropertiesService.getScriptProperties().getProperty(Config.PROP_KEYS.OWNER_EMAIL) || '').toLowerCase();
    var role = null;
    if (email && owner && email === owner) {
      role = 'OWNER';
    } else if (email) {
      role = parseAllowedUsers(SettingsService.get('ALLOWED_USERS', ''))[email] || null;
    }
    return { email: email, role: role, isSystem: false };
  }

  /** 指定ロール以上でなければ FORBIDDEN */
  function require(minRole) {
    var user = currentUser();
    if (!user.role || RANK[user.role] < RANK[minRole]) {
      throw new Util.AppError('FORBIDDEN', user.email
        ? 'この操作の権限がありません（' + user.email + '）'
        : 'Googleアカウントを確認できません。管理者に利用許可を依頼してください');
    }
    return user;
  }

  /** 定期処理など、システム権限で実行する */
  function runAsSystem(fn) {
    systemDepth++;
    try { return fn(); } finally { systemDepth--; }
  }

  /** 監査ログ等に記録する実行者名 */
  function actorName() {
    var u = currentUser();
    return u.email || 'UNKNOWN';
  }

  return { currentUser: currentUser, require: require, runAsSystem: runAsSystem, actorName: actorName, parseAllowedUsers: parseAllowedUsers };
})();

// ===== 70_Api.gs =====
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
    'system.selfCheck': { role: 'OWNER', fn: function () { return SelfCheck.run(); } },

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

// ===== 80_Setup.gs =====
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

  /** タスクの状態名のゆれ（DONE・完了など）をシート上でも正式名に書き換える。件数を返す */
  function normalizeTaskStatuses(ss, report) {
    var sheet = ss.getSheetByName('Tasks');
    if (!sheet || sheet.getLastRow() < 2) return;
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    var col = headers.indexOf('status');
    if (col < 0) return;
    var range = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1);
    var values = range.getValues();
    var changed = 0;
    var out = values.map(function (r) {
      var before = r[0] === null || r[0] === undefined ? '' : String(r[0]);
      var after = Config.normalizeTaskStatus(before);
      if (after !== before) { changed++; report.statusesNormalized[before] = (report.statusesNormalized[before] || 0) + 1; }
      return [after];
    });
    if (changed) range.setValues(out);
  }

  function run() {
    var report = {
      spreadsheetCreated: false, spreadsheetUrl: '', sheetsCreated: [], columnsAdded: {}, extraColumnsKept: {},
      settingsAdded: [], agentsAdded: [], rulesAdded: [], backupFolderCreated: false, ownerEmail: '',
      statusesNormalized: {}
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
      normalizeTaskStatuses(ss, report);

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
          settingsAdded: report.settingsAdded, agentsAdded: report.agentsAdded, rulesAdded: report.rulesAdded,
          statusesNormalized: report.statusesNormalized
        })
      });
      return report;
    });
  }

  return { run: run, DB_NAME: DB_NAME, BACKUP_FOLDER_NAME: BACKUP_FOLDER_NAME };
})();

/** Apps Script エディタから実行する入口 */
function setupSystem() {
  // 2回目以降はオーナーのみ実行可能（google.script.run から他の利用者が呼べないようにする）
  if (PropertiesService.getScriptProperties().getProperty(Config.PROP_KEYS.OWNER_EMAIL)) Auth.require('OWNER');
  var report = Setup.run();
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

// ===== 90_WebApp.gs =====
/**
 * 90_WebApp.gs
 * Webアプリの入口。HTML は src/ui 配下（UI はビジネスロジックを持たない）。
 */

function doGet() {
  try {
    Auth.require('VIEWER');
  } catch (e) {
    var msg = e && e.code === 'FORBIDDEN' ? e.message : 'システムの準備ができていません。管理者にお問い合わせください';
    return HtmlService.createHtmlOutput(
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<div style="font-family:sans-serif;padding:24px;max-width:520px;margin:auto">' +
      '<h2>AI統合管制システム</h2><p>' + Util.escapeHtml(msg) + '</p></div>'
    ).setTitle('AI統合管制システム');
  }
  return HtmlService.createTemplateFromFile('ui/index').evaluate()
    .setTitle('AI統合管制システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** HTML テンプレートから部品ファイルを読み込む（<?!= include('ui/styles') ?>） */
function include(name) {
  if (!/^ui\/[a-z0-9_\/-]+$/.test(String(name))) throw new Error('不正なファイル名です');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ===== 99_Tests.gs =====
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
