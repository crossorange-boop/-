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
