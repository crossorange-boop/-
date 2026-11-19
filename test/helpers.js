const { loadGas } = require('./gas-loader');
const { createGasMocks } = require('./gas-mocks');

/** 模擬GAS環境で全ソースを読み込み、必要ならセットアップまで済ませる */
function bootstrap({ setup = true, mockOptions = {} } = {}) {
  const mocks = createGasMocks(mockOptions);
  const g = loadGas(mocks.globals);
  let report = null;
  if (setup) report = g.Setup.run();
  const ss = () => mocks.state.spreadsheets[mocks.state.props.SPREADSHEET_ID];
  return { g, mocks, report, ss };
}

module.exports = { bootstrap };
