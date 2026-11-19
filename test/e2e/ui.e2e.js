/**
 * 画面の結合テスト（ブラウザ操作）。プレビューサーバーを起動して実行する。
 *   node test/e2e/ui.e2e.js [スクリーンショット出力先]
 */
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const PORT = 8790;
const BASE = 'http://localhost:' + PORT;
const outDir = process.argv[2] || null;

async function main() {
  const server = spawn('node', [path.join(__dirname, '../../tools/preview-server.js'), String(PORT)], { stdio: 'pipe' });
  await new Promise((res) => server.stdout.once('data', res));
  const browser = await chromium.launch();
  const errors = [];
  const results = [];
  const step = async (name, fn) => { await fn(); results.push('ok - ' + name); };
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const shot = async (name) => { if (outDir) await page.screenshot({ path: path.join(outDir, name + '.png'), fullPage: true }); };

    await step('ダッシュボード：今日のレポート（朝は保存済み、昼はプレビュー作成）', async () => {
      await page.goto(BASE + '/#/dashboard');
      await page.waitForSelector('#report-card');
      await page.click('[data-report-tab="morning"]');
      await page.waitForSelector('#report-body .report-text:has-text("【朝の当日タスク一覧】")');
      await page.click('[data-report-tab="midday"]');
      await page.waitForSelector('#report-body:has-text("まだ作成されていません")');
      await page.click('#btn-report-preview');
      await page.waitForSelector('#report-body .report-text:has-text("【昼の中間経過】")');
      assert.ok(await page.isVisible('#report-body:has-text("午後に優先して進めるタスク")'));
      await shot('dashboard-report-pc');
    });

    await step('プロジェクト一覧が表示される', async () => {
      await page.goto(BASE + '/#/projects');
      await page.waitForSelector('text=コーポレートサイト刷新');
      await shot('projects-pc');
    });

    await step('プロジェクトを登録し詳細へ移動', async () => {
      await page.click('#btn-new-project');
      await page.fill('#f_project_name', 'E2Eテスト案件');
      await page.fill('#f_goal', '画面から登録できること');
      await page.selectOption('#f_priority', 'HIGH');
      await page.fill('#f_deadline', '2030-12-31');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('h1:has-text("E2Eテスト案件")');
    });
    const projectUrl = page.url();

    await step('必須項目未入力はエラー表示', async () => {
      await page.click('text=タスク追加');
      await page.waitForSelector('.modal');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.modal [data-error]:has-text("必須項目")');
      await page.click('.modal [data-cancel]');
    });

    await step('タスクAを登録（担当AI指定）', async () => {
      await page.goto(projectUrl);
      await page.click('text=タスク追加');
      await page.waitForSelector('#f_task_name');
      await page.fill('#f_task_name', 'E2E 設計');
      await page.selectOption('#f_assigned_agent_id', 'AGT-CLAUDE-CODE');
      await page.fill('#f_instruction', 'GASで実装すること');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('h1:has-text("E2E 設計")');
    });
    const taskAUrl = page.url();

    await step('タスクBを依存付きで登録し、前提未完了では着手できない', async () => {
      await page.goto(BASE + '/#/tasks');
      await page.waitForSelector('#btn-new-task');
      await page.click('#btn-new-task');
      await page.waitForSelector('#f_task_name');
      const projectValue = await page.$eval('#f_project_id', (s) => Array.from(s.options).find((o) => o.text === 'E2Eテスト案件').value);
      await page.selectOption('#f_project_id', projectValue);
      await page.fill('#f_task_name', 'E2E 実装');
      await page.selectOption('#f_assigned_agent_id', 'AGT-CLAUDE-CODE');
      const depValue = await page.$eval('#f_dependency_task_ids', (s) => Array.from(s.options).find((o) => o.text.startsWith('E2E 設計')).value);
      await page.selectOption('#f_dependency_task_ids', [depValue]);
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('h1:has-text("E2E 実装")');
      await page.waitForSelector('text=先に完了が必要');
      assert.ok(await page.isVisible('.card a:has-text("E2E 設計")'));
      await page.click('[data-status="READY"]');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.modal [data-error]:has-text("前提タスクが完了していません")');
      await page.click('.modal [data-cancel]');
      await shot('task-detail-pc');
    });

    await step('理由必須の状態変更（WAITING）は理由なしだと止まる', async () => {
      await page.goto(taskAUrl);
      await page.waitForSelector('[data-status="WAITING"]');
      await page.click('[data-status="WAITING"]');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.modal [data-error]:has-text("必須項目")');
      await page.click('.modal [data-cancel]');
    });

    await step('タスクAを作業中まで進め、成果物登録で成果物確認中へ', async () => {
      for (const s of ['READY', 'ASSIGNED', 'IN_PROGRESS']) {
        await page.click('[data-status="' + s + '"]');
        await page.click('.modal button[type=submit]');
        await page.waitForSelector('.toast:has-text("状態を変更しました")');
        await page.waitForSelector('[data-status]');
      }
      await page.click('#btn-deliverable');
      await page.fill('#f_file_name', '設計書.pdf');
      await page.fill('#f_file_url', 'https://drive.google.com/file/d/e2e');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.card .chip:has-text("成果物確認中")');
      await page.waitForSelector('text=設計書.pdf');
    });

    await step('成果物・承認画面で成果物を承認するとタスク完了、後続が着手可能に', async () => {
      await page.goto(BASE + '/#/approvals');
      await page.waitForSelector('text=確認待ちの成果物');
      await shot('approvals-pc');
      await page.click('[data-dok][data-name="設計書.pdf"]');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.toast:has-text("承認しました")');
      await page.goto(taskAUrl);
      await page.waitForSelector('.card .chip:has-text("完了")');
    });

    await step('承認待ち（人間の承認）を承認できる', async () => {
      await page.goto(BASE + '/#/approvals');
      await page.waitForSelector('[data-approve]');
      const before = await page.$$eval('[data-approve]', (b) => b.length);
      await page.click('[data-approve] >> nth=0');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.toast:has-text("承認しました")');
      await page.waitForTimeout(300);
      const after = await page.$$eval('[data-approve]', (b) => b.length);
      assert.strictEqual(after, before - 1);
    });

    await step('タスク一覧の絞り込み（期限超過のみ）', async () => {
      await page.goto(BASE + '/#/tasks');
      await page.waitForSelector('#task-filter');
      await page.check('#task-filter input[name=overdue]');
      await page.waitForFunction(() => location.hash.includes('overdue=1'));
      // 再描画後の一覧が表示されるまで待つ（件数表示で判定）
      await page.waitForFunction(() => /^\d+件$/.test((document.querySelector('.card.section > .muted:last-child') || {}).textContent || '') && !document.querySelector('.loading'));
      await page.waitForTimeout(300);
      const n = await page.$$eval('table.data tbody tr', (r) => r.length);
      assert.strictEqual(n, 2);
      const names = await page.$$eval('table.data tbody tr td:first-child a', (a) => a.map((x) => x.textContent).sort());
      assert.deepStrictEqual(names, ['キャンペーンバナー', 'トップページのデザイン案'].sort());
      await shot('tasks-pc');
    });

    await step('スケジュール画面：期限超過グループと後続への影響', async () => {
      await page.goto(BASE + '/#/schedule');
      await page.waitForSelector('.date-group.critical');
      assert.ok(await page.isVisible('text=後続への影響 1件'));
      await shot('schedule-pc');
    });

    await step('AIエージェントを追加できる（能力は小文字に正規化）', async () => {
      await page.goto(BASE + '/#/agents');
      await page.waitForSelector('#btn-new-agent');
      await shot('agents-pc');
      await page.click('#btn-new-agent');
      await page.fill('#f_agent_id', 'AGT-OLLAMA');
      await page.fill('#f_agent_name', 'Ollama（ローカル）');
      await page.selectOption('#f_connection_type', 'LOCAL_LLM');
      await page.fill('#f_capabilities', 'Summary, classification');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('h1:has-text("Ollama（ローカル）")');
      assert.ok(await page.isVisible('td:has-text("summary, classification")'));
    });

    await step('不正なAI IDはフォーム内にエラー表示', async () => {
      await page.goto(BASE + '/#/agents');
      await page.click('#btn-new-agent');
      await page.fill('#f_agent_id', 'bad id');
      await page.fill('#f_agent_name', 'x');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.modal [data-error]:has-text("AI ID")');
      await page.click('.modal [data-cancel]');
    });

    await step('AIを利用制限中にすると状態表示と通知が変わり、戻すと復旧通知', async () => {
      await page.click('[data-status-agent="AGT-MUSE"]');
      await page.selectOption('#f_usage_limit_status', 'LIMITED');
      await page.fill('#f_notes', '月間上限');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.toast:has-text("状態を更新しました")');
      await page.waitForSelector('.card:has-text("Muse") .chip.warn:has-text("利用制限中")');
      await page.goto(BASE + '/#/notifications');
      await page.waitForSelector('text=Muse は利用制限中（LIMITED）です');
      await page.goto(BASE + '/#/agents?id=AGT-MUSE');
      await page.waitForSelector('#btn-status');
      await shot('agent-detail-pc');
      await page.click('#btn-status');
      await page.selectOption('#f_usage_limit_status', 'OK');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.chip.good:has-text("利用可能")');
      await page.goto(BASE + '/#/notifications');
      await page.waitForSelector('text=Muse が利用可能になりました');
    });

    await step('AIを無効にすると一覧で停止中表示', async () => {
      await page.goto(BASE + '/#/agents');
      await page.click('[data-status-agent="AGT-OLLAMA"]');
      await page.uncheck('.modal input[name=enabled]');
      await page.click('.modal button[type=submit]');
      await page.waitForSelector('.card:has-text("Ollama") .chip:has-text("停止中（無効）")');
    });

    await step('作業待ちキュー：今すぐ振り分け → AI別に表示 → 指示書表示 → 着手', async () => {
      await page.goto(BASE + '/#/queue');
      await page.waitForSelector('#btn-run-queue');
      await page.click('#btn-run-queue');
      await page.waitForSelector('.toast:has-text("振り分け完了")');
      await page.waitForSelector('#lane-AGT-RULE-ENGINE li:has-text("問い合わせメールの分類ルール")');
      await page.waitForSelector('text=前回の自動振り分け');
      await shot('queue-pc');
      await page.click('#lane-AGT-RULE-ENGINE [data-show]');
      const text = await page.$eval('#instruction-text', (t) => t.value);
      assert.ok(text.includes('【作業依頼】問い合わせメールの分類ルール'));
      await page.click('.modal [data-cancel]');
      await page.click('#lane-AGT-RULE-ENGINE [data-start]');
      await page.waitForSelector('.toast:has-text("作業中にしました")');
      await page.waitForSelector('#lane-AGT-RULE-ENGINE .chip:has-text("作業中")');
      // Canva は利用制限中なので、Canva 担当の割当済みタスクは利用待ちになっている
      await page.goto(BASE + '/#/queue?agent=AGT-CANVA');
      await page.waitForSelector('#lane-AGT-CANVA');
      assert.ok(await page.isVisible('#lane-AGT-CANVA .chip:has-text("外部AIの利用待ち")'));
    });

    await step('スマホ幅で各画面が横にはみ出さない', async () => {
      const ctx = await browser.newContext({ ...devices['iPhone 13'] });
      const m = await ctx.newPage();
      m.on('pageerror', (e) => errors.push('mobile: ' + e.message));
      for (const r of ['dashboard', 'projects', 'tasks', 'schedule', 'approvals', 'agents', 'agents?id=AGT-CANVA', 'queue']) {
        await m.goto(BASE + '/#/' + r);
        await m.waitForSelector('.content .card');
        await m.waitForTimeout(200);
        const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, r + ' overflow ' + overflow);
        // カードの中身がカードの外にはみ出していないか
        const spill = await m.evaluate(() => Array.from(document.querySelectorAll('.content .card')).filter((c) => c.scrollWidth > c.clientWidth + 1 && !c.querySelector('.table-wrap')).length);
        assert.strictEqual(spill, 0, r + ' のカード内容がはみ出しています');
        if (outDir) await m.screenshot({ path: path.join(outDir, r.replace(/[?=]/g, '_') + '-mobile.png'), fullPage: false });
      }
      await m.goto(BASE + '/#/tasks');
      await m.waitForSelector('#btn-new-task');
      await m.click('#btn-new-task');
      await m.waitForSelector('.modal #f_task_name');
      if (outDir) await m.screenshot({ path: path.join(outDir, 'task-form-mobile.png') });
      await ctx.close();
    });

    assert.deepStrictEqual(errors, [], 'ブラウザでエラー: ' + errors.join(' / '));
    results.push('ok - ブラウザのエラーなし');
    console.log(results.join('\n'));
    console.log('# e2e pass ' + results.length);
  } catch (e) {
    console.log(results.join('\n'));
    console.error('not ok - ' + e.message);
    try { const pg = browser.contexts()[0].pages()[0]; console.error('modal error:', await pg.$eval('.modal [data-error]', (x) => x.textContent).catch(() => '(none)'), 'url:', pg.url()); } catch (ignore) {}
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
}
main();
