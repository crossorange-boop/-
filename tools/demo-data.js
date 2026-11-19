/** プレビュー・画面確認用のサンプルデータ（本番には投入しない） */
function iso(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

function seedDemo(g) {
  const P = g.ProjectService, T = g.TaskService;
  const web = P.create({ project_name: 'コーポレートサイト刷新', priority: 'HIGH', status: 'ACTIVE', start_date: iso(-20), deadline: iso(25), goal: '年内に新サイト公開' });
  const sns = P.create({ project_name: 'Instagram 冬季キャンペーン', priority: 'MEDIUM', status: 'ACTIVE', start_date: iso(-7), deadline: iso(14) });
  const sys = P.create({ project_name: 'AI統合管制システム Phase 1', priority: 'CRITICAL', status: 'ACTIVE', start_date: iso(-3), deadline: iso(40) });
  P.create({ project_name: '展示会資料', priority: 'LOW', status: 'PLANNING', deadline: iso(60) });

  const mk = (project, name, agent, statuses, extra = {}) => {
    const t = T.create(Object.assign({ project_id: project.project_id, task_name: name, assigned_agent_id: agent }, extra));
    statuses.forEach((s) => T.changeStatus(t.task_id, s, s === 'WAITING' ? 'Canva 月間上限に到達' : ''));
    return t;
  };
  const design = mk(web, 'トップページのデザイン案', 'AGT-CANVA', ['READY', 'ASSIGNED', 'IN_PROGRESS'], { deadline: iso(-2), priority: 'HIGH' });
  mk(web, 'サイト構成とGASフォーム実装', 'AGT-CLAUDE-CODE', ['READY', 'ASSIGNED', 'IN_PROGRESS'], { deadline: iso(1), priority: 'HIGH' });
  mk(web, '会社案内PDFの作成', 'AGT-CANVA', ['READY', 'ASSIGNED', 'WAITING'], { deadline: iso(5) });
  mk(web, '公開前チェック', '', [], { deadline: iso(24), dependency_task_ids: design.task_id });
  mk(sns, '投稿カレンダー作成', 'AGT-MUSE', ['READY', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED'], { deadline: iso(-5) });
  mk(sns, 'リール用キャプション10本', 'AGT-MUSE', ['READY', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'APPROVAL'], { deadline: iso(2) });
  mk(sns, 'キャンペーンバナー', 'AGT-CANVA', ['READY'], { deadline: iso(-1), priority: 'CRITICAL' });
  mk(sys, 'データ構造の設計', 'AGT-CLAUDE-CODE', ['READY', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']);
  mk(sys, '自動振り分けエンジン', 'AGT-CLAUDE-CODE', ['READY', 'ASSIGNED'], { deadline: iso(10) });
  mk(sys, '問い合わせメールの分類ルール', 'AGT-RULE-ENGINE', [], { deadline: iso(12) });
  g.AgentService.setStatus('AGT-CANVA', null, 'LIMITED', '月間の生成上限に到達（12/1 リセット）');
}

module.exports = { seedDemo };
