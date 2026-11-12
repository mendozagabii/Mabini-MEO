const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const orig = m.require.bind(m); m.require = name => Object.hasOwn(mocks, name) ? mocks[name] : orig(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
  return m.exports;
}
const data = load('src/lib/supabase-data.ts', { '@/lib/attachment-validation': load('src/lib/attachment-validation.ts'), '@/lib/supabase': { ROLE_FROM_DB: {}, ROLE_TO_DB: {} } });
function mockDb(type) {
  let saved;
  const original = { id: 'i', project_id: 'p', inspection_date: '2026-01-01', inspection_type: type, annual_follow_up_year: type === 'follow_up' ? 2026 : null, validation_status: 'pending', inspection_items: [{component:'concrete',rating:'n/a'}] };
  return { get saved() { return saved; }, from(table) {
    let op = 'select';
    const q = { select() { return q; }, eq() { return q; }, in() { return q; }, is() { return q; }, not() { return q; }, order() { return q; }, update(value) { op = 'update'; saved = value; return q; },
      maybeSingle: async () => ({ data: original, error: null }),
      single: async () => ({ data: { ...original, ...saved }, error: null }),
      then(resolve, reject) { return Promise.resolve({ data: op === 'select' ? [] : null, error: null }).then(resolve, reject); },
    }; return q;
  } };
}
test('inspection purpose is saved and round-trips without changing legacy or annual type', async () => {
  for (const kind of ['follow_up', 'type_acceptance', 'routine']) {
    const db = mockDb(kind);
    const updated = await data.saveInspection(db, { id: 'i', date: '2026-01-01', inspectionType: 'Monitoring and Maintenance Inspection', conditionRating: 5, annualFollowUpYear: kind === 'follow_up' ? 2026 : undefined }, 'p', 'user');
    assert.equal(db.saved.inspection_type, kind);
    assert.equal(db.saved.inspection_purpose, 'Monitoring and Maintenance Inspection');
    assert.equal(updated.inspectionType, 'Monitoring and Maintenance Inspection');
    assert.equal(updated.conditionRatings.Concrete, 'N/A');
    if (kind === 'follow_up') assert.equal(updated.annualFollowUpYear, 2026);
  }
});
