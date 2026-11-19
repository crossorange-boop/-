/**
 * 35_DependencyGraph.gs
 * タスク依存関係の計算（純粋関数・シートに依存しない）。
 * edges: [{ predecessor_task_id, successor_task_id }]
 */

var DependencyGraph = (function () {
  function activeEdges(dependencies) {
    return (dependencies || []).filter(function (d) { return d.status !== 'REMOVED'; });
  }

  function adjacency(edges) {
    var adj = {};
    edges.forEach(function (e) {
      (adj[e.predecessor_task_id] = adj[e.predecessor_task_id] || []).push(e.successor_task_id);
    });
    return adj;
  }

  /** 新しい辺を加えたときに循環が生じるか */
  function createsCycle(edges, newEdges) {
    var all = activeEdges(edges).concat(newEdges || []);
    var adj = adjacency(all);
    var WHITE = 0, GRAY = 1, BLACK = 2;
    var color = {};
    var nodes = {};
    all.forEach(function (e) { nodes[e.predecessor_task_id] = true; nodes[e.successor_task_id] = true; });

    function visit(n) {
      color[n] = GRAY;
      var next = adj[n] || [];
      for (var i = 0; i < next.length; i++) {
        var c = color[next[i]] || WHITE;
        if (c === GRAY) return true;
        if (c === WHITE && visit(next[i])) return true;
      }
      color[n] = BLACK;
      return false;
    }
    var keys = Object.keys(nodes);
    for (var i = 0; i < keys.length; i++) {
      if ((color[keys[i]] || WHITE) === WHITE && visit(keys[i])) return true;
    }
    return false;
  }

  /** 直接の前提タスクID */
  function predecessorsOf(taskId, dependencies) {
    return activeEdges(dependencies)
      .filter(function (d) { return d.successor_task_id === taskId; })
      .map(function (d) { return d.predecessor_task_id; });
  }

  /** 直接の後続タスクID */
  function successorsOf(taskId, dependencies) {
    return activeEdges(dependencies)
      .filter(function (d) { return d.predecessor_task_id === taskId; })
      .map(function (d) { return d.successor_task_id; });
  }

  /** 影響を受ける全後続タスクID（多段） */
  function allSuccessorsOf(taskId, dependencies) {
    var adj = adjacency(activeEdges(dependencies));
    var seen = {}, out = [], stack = (adj[taskId] || []).slice();
    while (stack.length) {
      var n = stack.pop();
      if (seen[n]) continue;
      seen[n] = true; out.push(n);
      (adj[n] || []).forEach(function (m) { stack.push(m); });
    }
    return out;
  }

  /**
   * 前提タスクがすべて完了しているか。
   * 削除済み（見つからない）・キャンセル済みの前提は「満たされた」とみなす。
   */
  function predecessorsSatisfied(taskId, dependencies, taskMap) {
    var pending = predecessorsOf(taskId, dependencies).filter(function (pid) {
      var p = taskMap[pid];
      return p && p.status !== 'COMPLETED' && p.status !== 'CANCELLED';
    });
    return { satisfied: pending.length === 0, pending: pending };
  }

  return {
    createsCycle: createsCycle, predecessorsOf: predecessorsOf, successorsOf: successorsOf,
    allSuccessorsOf: allSuccessorsOf, predecessorsSatisfied: predecessorsSatisfied
  };
})();
