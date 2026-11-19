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
