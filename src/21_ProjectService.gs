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
