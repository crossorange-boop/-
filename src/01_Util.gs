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
