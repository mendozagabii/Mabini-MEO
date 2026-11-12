const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const path = require('node:path');
const filename = path.resolve('src/lib/maintenance-schedule.ts');
const m = new Module(filename, module);
m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, filename);
const {maintenanceStartDate, effectiveMaintenanceStatus, philippinesToday} = m.exports;
test('start is seven calendar days after inspection, crossing months, leap days and years', () => {
  assert.equal(maintenanceStartDate('2024-02-25'), '2024-03-03');
  assert.equal(maintenanceStartDate('2026-12-28'), '2027-01-04');
  for (const date of ['', '2026-02-30', 'bad', '9999-12-31']) assert.equal(maintenanceStartDate(date), null);
});
test('only scheduled maintenance transitions automatically, using Philippine calendar dates', () => {
  assert.equal(effectiveMaintenanceStatus('Scheduled', '2026-01-01', '2026-01-07'), 'Scheduled');
  assert.equal(effectiveMaintenanceStatus('Scheduled', '2026-01-01', '2026-01-08'), 'In Progress');
  assert.equal(effectiveMaintenanceStatus('Scheduled', '2026-01-01', '2026-02-01'), 'In Progress');
  for (const status of ['Deferred', 'Completed', 'In Progress']) assert.equal(effectiveMaintenanceStatus(status, '2026-01-01', '2026-02-01'), status);
  assert.equal(philippinesToday(new Date('2026-01-07T16:00:00Z')), '2026-01-08');
});

test('reading linked maintenance derives the start and current status without writing existing records', async () => {
  function load(file, mocks = {}) {
    const name = path.resolve(file); const mod = new Module(name, module); mod.filename = name; mod.paths = Module._nodeModulePaths(path.dirname(name));
    const original = mod.require.bind(mod); mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
    mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,name); return mod.exports;
  }
  const data = load('src/lib/supabase-data.ts', {'@/lib/maintenance-schedule':m.exports, '@/lib/attachment-validation':load('src/lib/attachment-validation.ts'), '@/lib/supabase':{ROLE_FROM_DB:{},ROLE_TO_DB:{}}});
  const rows = [
    {id:'a',project_id:'p',inspection_id:'i',inspection_date:'',inspections:{inspection_date:'2020-01-01'},scheduled_date:'2030-01-01',status:'scheduled'},
    {id:'b',project_id:'q',inspection_id:'j',inspections:{inspection_date:'2099-01-01'},scheduled_date:'2026-01-01',status:'scheduled'},
    {id:'c',project_id:'r',inspection_id:null,scheduled_date:'2020-01-01',status:'scheduled'},
    {id:'d',project_id:'s',inspection_id:'k',inspections:{inspection_date:'2020-01-01'},scheduled_date:'2020-01-08',status:'deferred'},
  ];
  const query = { select() {return this}, order() {return this}, is() {return this}, then(resolve) {return Promise.resolve({data:rows, error:null}).then(resolve)} };
  const db = {from:() => query};
  const records = await data.listMaintenance(db);
  assert.equal(records[0].scheduledDate,'2020-01-08'); assert.equal(records[0].status,'In Progress');
  assert.equal(records[1].scheduledDate,'2099-01-08'); assert.equal(records[1].status,'Scheduled');
  assert.equal(records[2].status,'Scheduled'); assert.equal(records[3].status,'Deferred');
});
