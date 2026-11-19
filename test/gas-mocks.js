/**
 * GAS サービスのインメモリ模擬実装（テスト専用）。
 * 本システムが使う範囲のメソッドだけを再現する。
 */

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = (this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    if (values.length !== this.numRows || values.some((l) => l.length !== this.numCols)) {
      throw new Error(`setValues: サイズ不一致 ${values.length}x${values[0] && values[0].length} vs ${this.numRows}x${this.numCols}`);
    }
    this.sheet.writes++;
    values.forEach((line, r) => line.forEach((v, c) => {
      const rr = this.row - 1 + r;
      while (this.sheet.data.length <= rr) this.sheet.data.push([]);
      this.sheet.data[rr][this.col - 1 + c] = v;
    }));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
}

class MockSheet {
  constructor(name) { this.name = name; this.data = []; this.frozenRows = 0; this.writes = 0; this.reads = 0; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) {
      if ((this.data[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1;
    }
    return 0;
  }
  getLastColumn() { return this.data.reduce((m, l) => Math.max(m, (l || []).length), 0); }
  getMaxRows() { return Math.max(1000, this.data.length); }
  getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getRange(row, col, numRows = 1, numCols = 1) {
    if (row < 1 || col < 1 || numRows < 1 || numCols < 1) throw new Error(`getRange: 不正な範囲 ${row},${col},${numRows},${numCols}`);
    this.reads++;
    return new MockRange(this, row, col, numRows, numCols);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  setFrozenRows(n) { this.frozenRows = n; return this; }
  autoResizeColumns() { return this; }
  insertColumnsAfter() { return this; }
}

class MockSpreadsheet {
  constructor(name, id) { this.name = name; this.id = id; this.sheets = [new MockSheet('シート1')]; }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  getSheets() { return this.sheets.slice(); }
  insertSheet(n) {
    if (this.getSheetByName(n)) throw new Error('同名シートあり: ' + n);
    const s = new MockSheet(n); this.sheets.push(s); return s;
  }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
  setSpreadsheetTimeZone(tz) { this.tz = tz; }
}

function createGasMocks(options = {}) {
  const spreadsheets = {};
  const files = {};
  let seq = 0;
  const props = { ...(options.properties || {}) };
  const userEmail = options.userEmail === undefined ? 'owner@example.com' : options.userEmail;
  const lockState = { held: false, acquired: 0, failNext: false };
  const triggers = [];

  const SpreadsheetApp = {
    create(name) { const id = 'ss' + (++seq); const ss = new MockSpreadsheet(name, id); spreadsheets[id] = ss; files[id] = { id, name, trashed: false }; return ss; },
    openById(id) { if (!spreadsheets[id]) throw new Error('Spreadsheet not found: ' + id); return spreadsheets[id]; },
    flush() {}
  };

  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
        getProperties: () => ({ ...props })
      };
    }
  };

  const LockService = {
    getScriptLock() {
      return {
        tryLock() { if (lockState.failNext) { lockState.failNext = false; return false; } lockState.held = true; lockState.acquired++; return true; },
        waitLock() { if (lockState.failNext) { lockState.failNext = false; throw new Error('Lock timeout'); } lockState.held = true; lockState.acquired++; },
        releaseLock() { lockState.held = false; },
        hasLock() { return lockState.held; }
      };
    }
  };

  function makeFolder(name, id) {
    const folder = {
      id, name, children: [],
      getId: () => id, getName: () => name, getUrl: () => 'https://drive.google.com/drive/folders/' + id,
      getFiles() {
        const list = folder.children.filter((f) => !f.trashed); let i = 0;
        return { hasNext: () => i < list.length, next: () => list[i++] };
      }
    };
    files[id] = folder;
    return folder;
  }

  const DriveApp = {
    createFolder(name) { return makeFolder(name, 'folder' + (++seq)); },
    getFolderById(id) { if (!files[id] || !files[id].getFiles) throw new Error('Folder not found: ' + id); return files[id]; },
    getFileById(id) {
      if (!files[id]) throw new Error('File not found: ' + id);
      const meta = files[id];
      return {
        getId: () => id, getName: () => meta.name,
        makeCopy(name, folder) {
          const cid = 'copy' + (++seq);
          const created = new Date(Date.now() + seq);
          const f = { id: cid, name, trashed: false, created,
            getId: () => cid, getName: () => name, getDateCreated: () => created,
            setTrashed(v) { f.trashed = v; } };
          files[cid] = f; folder.children.push(f); return f;
        }
      };
    }
  };

  const Session = {
    getActiveUser: () => ({ getEmail: () => userEmail }),
    getEffectiveUser: () => ({ getEmail: () => options.effectiveEmail || 'owner@example.com' })
  };

  function TriggerBuilder(handler) {
    const t = { handler, type: null, id: 'trg' + (++seq) };
    const b = {
      timeBased: () => b,
      everyMinutes: (n) => { t.type = 'minutes'; t.value = n; return b; },
      everyHours: (n) => { t.type = 'hours'; t.value = n; return b; },
      everyDays: (n) => { t.type = 'days'; t.value = n; return b; },
      atHour: (h) => { t.hour = h; return b; },
      nearMinute: (m) => { t.minute = m; return b; },
      inTimezone: (tz) => { t.tz = tz; return b; },
      create: () => {
        const trig = { ...t, getHandlerFunction: () => t.handler, getUniqueId: () => t.id };
        triggers.push(trig); return trig;
      }
    };
    return b;
  }

  const ScriptApp = {
    newTrigger: (h) => TriggerBuilder(h),
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); }
  };

  const Logger = { log: () => {} };

  return {
    globals: { SpreadsheetApp, PropertiesService, LockService, DriveApp, Session, ScriptApp, Logger },
    state: { spreadsheets, files, props, lockState, triggers }
  };
}

module.exports = { createGasMocks };
