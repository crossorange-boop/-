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
