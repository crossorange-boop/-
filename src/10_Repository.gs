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
