/**
 * 22_TaskService.gs
 * タスク管理。状態変更は必ず StateMachine を通す。
 */

var TaskService = (function () {
  var S = Config.TASK_STATUS;

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
          status: pred && pred.status === S.COMPLETED ? 'SATISFIED' : 'ACTIVE'
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
      rec.status = S.BACKLOG;
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

    if ([S.READY, S.ASSIGNED, S.IN_PROGRESS].indexOf(to) >= 0) {
      var taskMap = {};
      repo.findAll('Tasks').forEach(function (t) { taskMap[t.task_id] = t; });
      var sat = DependencyGraph.predecessorsSatisfied(taskId, repo.findAll('Dependencies'), taskMap);
      if (!sat.satisfied) {
        throw new Util.AppError('INVALID_STATE', '前提タスクが完了していません: ' + sat.pending.join(', '));
      }
    }
    if ((to === S.ASSIGNED || to === S.IN_PROGRESS) && !task.assigned_agent_id && !(options.extraPatch || {}).assigned_agent_id) {
      throw new Util.ValidationError('担当AIを設定してください');
    }

    var patch = { status: to, lock_token: '', locked_until: '' };
    patch.waiting_reason = [S.WAITING, S.BLOCKED, S.FAILED, S.CANCELLED].indexOf(to) >= 0 ? String(options.reason || '') : '';
    Object.keys(options.extraPatch || {}).forEach(function (k) { patch[k] = options.extraPatch[k]; });
    var res = repo.update('Tasks', taskId, patch, { expectedVersion: options.expectedVersion });

    if (to === S.COMPLETED) {
      var satisfied = repo.findAll('Dependencies').filter(function (d) { return d.predecessor_task_id === taskId && d.status === 'ACTIVE'; });
      if (satisfied.length) repo.updateMany('Dependencies', satisfied.map(function (d) { return { id: d.dependency_id, patch: { status: 'SATISFIED' } }; }));
    }
    if (to === S.APPROVAL) {
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

  return {
    list: list, get: get, create: create, update: update, changeStatus: changeStatus, remove: remove,
    isOverdue: isOverdue, _transition: transition, _deleteNow: deleteNow, _setDependencies: setDependencies
  };
})();
