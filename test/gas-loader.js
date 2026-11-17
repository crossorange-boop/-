/**
 * src/*.gs を Node の vm コンテキストに読み込み、GAS と同じ「グローバル共有」状態を再現する。
 * GAS 固有サービス（SpreadsheetApp 等）は extraGlobals でモックを渡す。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGas(extraGlobals = {}, files = null) {
  const srcDir = path.join(__dirname, '..', 'src');
  const targets = files || fs.readdirSync(srcDir).filter((f) => f.endsWith('.gs')).sort();
  const context = vm.createContext({ console, Date, Math, JSON, ...extraGlobals });
  for (const f of targets) {
    const code = fs.readFileSync(path.join(srcDir, f), 'utf8');
    vm.runInContext(code, context, { filename: f });
  }
  return context;
}

module.exports = { loadGas };
