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
