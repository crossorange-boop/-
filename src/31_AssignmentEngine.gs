/**
 * 31_AssignmentEngine.gs
 * ルールベースの分類と担当AIの選定（純粋関数・シートに依存しない）。
 *
 * 外部AIへの自動API呼び出しは行わない（Phase 1）。
 * 選定は「人の指定 > 割り振りルールの推奨AI > 能力が一致するAI」の順で、
 * 稼働状態・利用制限・同時担当上限・AIの優先度・現在の担当件数を考慮する。
 */

var AssignmentEngine = (function () {
  var DEFAULT_FIELDS = ['task_name', 'description', 'category'];

  function compileRules(rules) {
    return (rules || [])
      .filter(function (r) { return Util.toBool(r.enabled) && r.keyword_pattern; })
      .map(function (r) {
        var re = null;
        try { re = new RegExp(r.keyword_pattern, 'i'); } catch (e) { re = null; }
        return { rule: r, re: re, fields: Util.splitList(r.match_field).length ? Util.splitList(r.match_field) : DEFAULT_FIELDS };
      })
      .filter(function (c) { return c.re; })
      .sort(function (a, b) { return (Number(a.rule.priority) || 999) - (Number(b.rule.priority) || 999); });
  }

  /**
   * 分類。人が category / required_capability を入力済みならそれを優先する。
   * 戻り値：{ category, required_capability, preferred_agent_id, rule_id, source: 'MANUAL'|'RULE'|'AGENT'|null }
   */
  function classify(task, rules) {
    if (task.required_capability) {
      return { category: task.category || task.required_capability, required_capability: task.required_capability,
        preferred_agent_id: '', rule_id: '', source: 'MANUAL' };
    }
    var compiled = compileRules(rules);
    for (var i = 0; i < compiled.length; i++) {
      var c = compiled[i];
      var text = c.fields.map(function (f) { return task[f] || ''; }).join('\n');
      if (c.re.test(text)) {
        return { category: task.category || c.rule.category, required_capability: c.rule.required_capability,
          preferred_agent_id: c.rule.preferred_agent_id || '', rule_id: c.rule.rule_id, source: 'RULE' };
      }
    }
    if (task.assigned_agent_id) {
      // ルールに一致しなくても、人が担当AIを指定していれば分類済みとして扱う
      return { category: task.category || '', required_capability: '', preferred_agent_id: task.assigned_agent_id, rule_id: '', source: 'AGENT' };
    }
    return { category: '', required_capability: '', preferred_agent_id: '', rule_id: '', source: null };
  }

  function hasCapability(agent, capability) {
    if (!capability) return true;
    return Util.splitList(agent.capabilities).map(function (c) { return c.toLowerCase(); }).indexOf(String(capability).toLowerCase()) >= 0;
  }

  /**
   * 担当AIの選定。
   * counts: { agent_id: 現在の担当件数 }
   * 戻り値：
   *   { decision: 'ASSIGN', agent_id, reason }
   *   { decision: 'WAIT', agent_id, reason }       … 候補はいるが全員利用不可（候補を記録して待つ）
   *   { decision: 'HOLD', agent_id, reason }       … 利用可能だが同時担当上限に達している（READYのまま）
   *   { decision: 'NO_CANDIDATE', reason }         … 能力の合うAIがいない
   */
  function selectAgent(task, classification, agents, counts) {
    counts = counts || {};
    var byId = {};
    agents.forEach(function (a) { byId[a.agent_id] = a; });
    var load = function (a) { return counts[a.agent_id] || 0; };
    var capacity = function (a) { return Number(a.max_concurrent_tasks) || 5; };
    var hasRoom = function (a) { return load(a) < capacity(a); };

    // 1. 人が担当AIを指定している場合はそのAIに固定する
    if (task.assigned_agent_id) {
      var fixed = byId[task.assigned_agent_id];
      if (!fixed) return { decision: 'NO_CANDIDATE', reason: '指定された担当AI（' + task.assigned_agent_id + '）が登録されていません' };
      if (!AgentService.isUsable(fixed)) return { decision: 'WAIT', agent_id: fixed.agent_id, reason: AgentService.unusableReason(fixed) };
      if (!hasRoom(fixed)) return { decision: 'HOLD', agent_id: fixed.agent_id, reason: fixed.agent_name + ' は同時担当上限（' + capacity(fixed) + '件）に達しています' };
      return { decision: 'ASSIGN', agent_id: fixed.agent_id, reason: '指定された担当AI' };
    }

    // 2. 能力が一致する有効なAIを候補にする（推奨AIは能力に関係なく候補に入れる）
    var preferred = classification.preferred_agent_id;
    var candidates = agents.filter(function (a) {
      return Util.toBool(a.enabled) && (a.agent_id === preferred || (classification.required_capability && hasCapability(a, classification.required_capability)));
    });
    if (!candidates.length) {
      return { decision: 'NO_CANDIDATE', reason: classification.required_capability
        ? '能力「' + classification.required_capability + '」を持つ有効なAIがいません'
        : '分類できません（割り振りルールに一致しません）' };
    }

    var score = function (a) {
      return [
        AgentService.isUsable(a) ? 0 : 1,
        hasRoom(a) ? 0 : 1,
        a.agent_id === preferred ? 0 : 1,
        Number(a.priority) || 5,
        load(a)
      ];
    };
    candidates.sort(function (a, b) {
      var sa = score(a), sb = score(b);
      for (var i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
      return a.agent_id < b.agent_id ? -1 : 1;
    });
    var best = candidates[0];
    if (!AgentService.isUsable(best)) {
      var target = byId[preferred] && candidates.indexOf(byId[preferred]) >= 0 ? byId[preferred] : best;
      return { decision: 'WAIT', agent_id: target.agent_id, reason: '候補のAIがすべて利用できません（' + AgentService.unusableReason(target) + '）' };
    }
    if (!hasRoom(best)) {
      return { decision: 'HOLD', agent_id: best.agent_id, reason: '候補のAIがすべて同時担当上限に達しています' };
    }
    return { decision: 'ASSIGN', agent_id: best.agent_id,
      reason: best.agent_id === preferred ? 'ルールの推奨AI' : '能力「' + classification.required_capability + '」が一致' };
  }

  /** 処理順：優先度 → 期限（近い順・未設定は最後）→ 登録順 */
  function sortQueue(tasks) {
    return tasks.slice().sort(function (a, b) {
      return (Config.PRIORITY_ORDER[a.priority] !== undefined ? Config.PRIORITY_ORDER[a.priority] : 9) -
        (Config.PRIORITY_ORDER[b.priority] !== undefined ? Config.PRIORITY_ORDER[b.priority] : 9) ||
        (a.deadline || '9999').localeCompare(b.deadline || '9999') ||
        (a.created_at || '').localeCompare(b.created_at || '');
    });
  }

  return { classify: classify, selectAgent: selectAgent, sortQueue: sortQueue, hasCapability: hasCapability };
})();
