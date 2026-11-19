/**
 * 39_RuleService.gs
 * 割り振りルール（AssignmentRules）の管理。コードを変えずに画面から編集できる。
 * ルールは削除せず enabled=FALSE で無効化する（履歴保持のため）。
 */

var RuleService = (function () {
  var MATCH_FIELDS = ['task_name', 'description', 'category', 'instruction'];

  function normalize(input, isCreate) {
    var out = {};
    if (isCreate || input.keyword_pattern !== undefined) {
      out.keyword_pattern = Util.validate('キーワード', input.keyword_pattern, { required: true, maxLength: 500 });
      try { new RegExp(out.keyword_pattern, 'i'); } catch (e) {
        throw new Util.ValidationError('キーワードの書き方が正しくありません（「|」で区切って複数指定できます）');
      }
    }
    if (isCreate || input.priority !== undefined) out.priority = Util.validate('優先順位', input.priority === undefined || input.priority === '' ? 50 : input.priority, { type: 'number', min: 1 });
    if (isCreate || input.match_field !== undefined) {
      var fields = Util.splitList(input.match_field || 'task_name,description,category');
      fields.forEach(function (f) { if (MATCH_FIELDS.indexOf(f) < 0) throw new Util.ValidationError('照合する項目が不正です: ' + f); });
      out.match_field = fields.join(',');
    }
    if (isCreate || input.required_capability !== undefined) {
      var cap = String(input.required_capability || '').trim().toLowerCase();
      if (!/^[a-z0-9_]{1,40}$/.test(cap)) throw new Util.ValidationError('必要な能力は半角英小文字・数字・_ で入力してください');
      out.required_capability = cap;
    }
    if (isCreate || input.category !== undefined) out.category = Util.validate('カテゴリ', input.category || out.required_capability, { maxLength: 100 });
    if (input.preferred_agent_id !== undefined) {
      out.preferred_agent_id = Util.validate('推奨AI', input.preferred_agent_id, { maxLength: 100 });
      if (out.preferred_agent_id && !Repository.get().findById('Agents', out.preferred_agent_id)) throw new Util.ValidationError('推奨AIが存在しません');
    }
    if (isCreate || input.enabled !== undefined) out.enabled = input.enabled === undefined ? true : Util.toBool(input.enabled);
    return out;
  }

  function list() {
    var names = {};
    Repository.get().findAll('Agents').forEach(function (a) { names[a.agent_id] = a.agent_name; });
    return Repository.get().findAll('AssignmentRules').map(function (r) {
      r.preferred_agent_name = names[r.preferred_agent_id] || '';
      return r;
    }).sort(function (a, b) { return (Number(a.priority) || 999) - (Number(b.priority) || 999); });
  }

  function create(input) {
    Auth.require('OWNER');
    var rec = normalize(input || {}, true);
    return Repository.get().withLock(function () {
      var saved = Repository.get().insert('AssignmentRules', rec);
      AuditService.record('CREATE', 'AssignmentRules', saved.rule_id, null, saved);
      return saved;
    });
  }

  function update(ruleId, input) {
    Auth.require('OWNER');
    var patch = normalize(input || {}, false);
    return Repository.get().withLock(function () {
      if (!Repository.get().findById('AssignmentRules', ruleId)) throw new Util.AppError('NOT_FOUND', 'ルールが見つかりません');
      var res = Repository.get().update('AssignmentRules', ruleId, patch);
      AuditService.record('UPDATE', 'AssignmentRules', ruleId, res.before, res.after);
      return res.after;
    });
  }

  /** 試し判定：入力したタスク名・説明がどのルールに当たり、どのAIに割り振られるか */
  function test(input) {
    input = input || {};
    var repo = Repository.get();
    var task = { task_name: String(input.task_name || ''), description: String(input.description || ''), category: '', priority: 'MEDIUM' };
    var c = AssignmentEngine.classify(task, repo.findAll('AssignmentRules'));
    var d = c.source ? AssignmentEngine.selectAgent(task, c, repo.findAll('Agents'), AgentService.activeTaskCounts()) : null;
    var agent = d && d.agent_id ? repo.findById('Agents', d.agent_id) : null;
    return { classification: c, decision: d, agent_name: agent ? agent.agent_name : '' };
  }

  return { list: list, create: create, update: update, test: test, MATCH_FIELDS: MATCH_FIELDS };
})();
