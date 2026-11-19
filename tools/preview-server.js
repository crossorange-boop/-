/**
 * ローカルプレビュー用サーバー（開発専用・GASには反映しない）。
 * src/*.gs を模擬GAS環境で実行し、google.script.run の代わりに HTTP で api() を呼ぶ。
 *   node tools/preview-server.js [port] [--empty] [--bundle]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadGas, loadBundle } = require('../test/gas-loader');
const { createGasMocks } = require('../test/gas-mocks');
const { seedDemo } = require('./demo-data');

const port = Number(process.argv[2]) || 8787;
const mocks = createGasMocks();
// --bundle：ブラウザ導入用のまとめファイル（dist/）で動かす
const useBundle = process.argv.includes('--bundle');
const g = useBundle ? loadBundle(mocks.globals) : loadGas(mocks.globals);
g.Setup.run();
if (!process.argv.includes('--empty')) seedDemo(g);

const SRC = path.join(__dirname, '..', 'src');
function renderTemplate(name) {
  const html = fs.readFileSync(path.join(SRC, name + '.html'), 'utf8');
  return html.replace(/<\?!=\s*include\('([^']+)'\)\s*\?>/g, (_, n) => renderTemplate(n));
}
const SHIM = `<script>
window.google = { script: { run: (function () {
  function runner(ok, ng) {
    return {
      withSuccessHandler: function (f) { return runner(f, ng); },
      withFailureHandler: function (f) { return runner(ok, f); },
      api: function (action, payload) {
        fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action, payload: payload }) })
          .then(function (r) { return r.json(); }).then(function (d) { ok && ok(d); }).catch(function (e) { ng && ng(e); });
      }
    };
  }
  return runner(null, null);
})() } };
</script>`;

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { action, payload } = JSON.parse(body || '{}');
      const out = g.api(action, payload);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  const page = useBundle ? fs.readFileSync(path.join(__dirname, '..', 'dist', 'ui_index.html'), 'utf8') : renderTemplate('ui/index');
  const html = page.replace('<head>', '<head>' + SHIM);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(port, () => console.log('preview: http://localhost:' + port));
