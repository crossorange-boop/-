/**
 * 00_Config.gs
 * システム全体の定数・シート定義・列挙値。
 * ビジネスロジックは持たない（定義のみ）。
 */

var Config = (function () {
  /** システムのバージョン */
  var VERSION = '0.1.1';

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
