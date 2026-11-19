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
