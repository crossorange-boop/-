/**
 * 90_WebApp.gs
 * Webアプリの入口。HTML は src/ui 配下（UI はビジネスロジックを持たない）。
 */

function doGet() {
  try {
    Auth.require('VIEWER');
  } catch (e) {
    var msg = e && e.code === 'FORBIDDEN' ? e.message : 'システムの準備ができていません。管理者にお問い合わせください';
    return HtmlService.createHtmlOutput(
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<div style="font-family:sans-serif;padding:24px;max-width:520px;margin:auto">' +
      '<h2>AI統合管制システム</h2><p>' + Util.escapeHtml(msg) + '</p></div>'
    ).setTitle('AI統合管制システム');
  }
  return HtmlService.createTemplateFromFile('ui/index').evaluate()
    .setTitle('AI統合管制システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** HTML テンプレートから部品ファイルを読み込む（<?!= include('ui/styles') ?>） */
function include(name) {
  if (!/^ui\/[a-z0-9_\/-]+$/.test(String(name))) throw new Error('不正なファイル名です');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
