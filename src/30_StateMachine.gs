/**
 * 30_StateMachine.gs
 * タスク状態の遷移ルール（純粋関数・シートに依存しない）。
 * 表に無い遷移はすべて拒否する。
 *
 * actor：
 *   USER     … 画面からの人間の操作
 *   SYSTEM   … 定期処理（自動管理エンジン）
 *   APPROVAL … 承認処理（ApprovalService）経由
 */

var StateMachine = (function () {
  var S = Config.TASK_STATUS;

  var TRANSITIONS = {};
  TRANSITIONS[S.BACKLOG] = [S.READY, S.ASSIGNED, S.BLOCKED, S.WAITING, S.CANCELLED];
  TRANSITIONS[S.READY] = [S.ASSIGNED, S.BLOCKED, S.WAITING, S.BACKLOG, S.CANCELLED];
  TRANSITIONS[S.ASSIGNED] = [S.IN_PROGRESS, S.READY, S.WAITING, S.BLOCKED, S.FAILED, S.CANCELLED];
  TRANSITIONS[S.IN_PROGRESS] = [S.REVIEW, S.WAITING, S.BLOCKED, S.FAILED, S.ASSIGNED, S.CANCELLED];
  TRANSITIONS[S.WAITING] = [S.READY, S.ASSIGNED, S.IN_PROGRESS, S.CANCELLED];
  TRANSITIONS[S.BLOCKED] = [S.READY, S.BACKLOG, S.CANCELLED];
  TRANSITIONS[S.REVIEW] = [S.APPROVAL, S.COMPLETED, S.IN_PROGRESS, S.FAILED, S.CANCELLED];
  TRANSITIONS[S.APPROVAL] = [S.COMPLETED, S.IN_PROGRESS, S.CANCELLED];
  TRANSITIONS[S.FAILED] = [S.READY, S.BACKLOG, S.CANCELLED];
  TRANSITIONS[S.COMPLETED] = [];
  TRANSITIONS[S.CANCELLED] = [S.BACKLOG]; // 復元（人間のみ）

  /** 定期処理が自動で行ってよい遷移先 */
  var SYSTEM_TARGETS = [S.READY, S.ASSIGNED, S.WAITING, S.BLOCKED, S.FAILED, S.BACKLOG];

  /** 理由の入力が必要な遷移先 */
  var REASON_REQUIRED = [S.CANCELLED, S.FAILED, S.WAITING];

  function check(from, to, actor) {
    actor = actor || 'USER';
    if (!TRANSITIONS.hasOwnProperty(from)) return { ok: false, reason: '不明な状態です: ' + from };
    if (!TRANSITIONS.hasOwnProperty(to)) return { ok: false, reason: '不明な状態です: ' + to };
    if (from === to) return { ok: false, reason: '状態が変わりません' };
    if (TRANSITIONS[from].indexOf(to) === -1) {
      return { ok: false, reason: label(from) + ' から ' + label(to) + ' へは変更できません' };
    }
    if (actor === 'SYSTEM' && SYSTEM_TARGETS.indexOf(to) === -1) {
      return { ok: false, reason: '自動処理では ' + label(to) + ' に変更できません' };
    }
    if (from === S.APPROVAL && to === S.COMPLETED && actor !== 'APPROVAL') {
      return { ok: false, reason: '承認待ちのタスクは承認画面から承認してください' };
    }
    if (to === S.CANCELLED && actor !== 'USER') {
      return { ok: false, reason: 'キャンセルは人間の操作でのみ行えます' };
    }
    if (from === S.CANCELLED && actor !== 'USER') {
      return { ok: false, reason: 'キャンセルの取り消しは人間の操作でのみ行えます' };
    }
    return { ok: true };
  }

  function assertTransition(from, to, actor, reason) {
    var r = check(from, to, actor);
    if (!r.ok) throw new Util.AppError('INVALID_STATE', r.reason);
    if (REASON_REQUIRED.indexOf(to) >= 0 && !String(reason || '').trim()) {
      throw new Util.ValidationError(label(to) + ' にする理由を入力してください');
    }
    return true;
  }

  /** 画面に表示する「次に選べる状態」 */
  function nextStatuses(from, actor) {
    return (TRANSITIONS[from] || []).filter(function (to) { return check(from, to, actor || 'USER').ok; });
  }

  function isTerminal(status) {
    return Config.TERMINAL_STATUSES.indexOf(status) >= 0;
  }

  function label(status) {
    return (Config.TASK_STATUS_LABEL[status] || status) + '(' + status + ')';
  }

  return {
    TRANSITIONS: TRANSITIONS, SYSTEM_TARGETS: SYSTEM_TARGETS, REASON_REQUIRED: REASON_REQUIRED,
    check: check, assertTransition: assertTransition, nextStatuses: nextStatuses, isTerminal: isTerminal
  };
})();
