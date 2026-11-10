const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod); mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(code, filename); return mod.exports;
}
const workflow = load('src/lib/project-validation-workflow.ts');
const at = day => new Date(day + 'T12:00:00Z');
const base = { actualCompletionDate: '2025-06-01', validationResult: 'Validated' };
const entry = (year, result = 'Pending', remarks = '') => ({ year, result, remarks, dueDate: `${year}-05-02` });
test('initial and annual tasks open exactly 30 days before actual completion and its anniversaries', () => {
  const initial = { actualCompletionDate: '2025-06-01' };
  assert.equal(workflow.validationTask(initial, at('2025-05-01')), null);
  assert.ok(workflow.validationTask(initial, at('2025-05-02')));
  const annual = { ...base, annualValidationEntries: [entry(2026)] };
  assert.equal(workflow.validationTask(annual, at('2026-05-01')), null);
  assert.equal(workflow.validationTask(annual, at('2026-05-02')).year, 2026);
  assert.equal(workflow.validationTask({ ...annual, actualCompletionDate: '2025-07-01' }, at('2026-05-02')), null);
  assert.equal(workflow.validationTask({ ...annual, actualCompletionDate: '2025-02-30' }, at('2026-05-02')), null);
});
test('returns stay actionable, pending years do not hide revision and oldest backlog is addressed first', () => {
  const project = { ...base, annualValidationEntries: [entry(2026, 'Return for Revision', 'Fix drainage'), entry(2027)] };
  assert.deepEqual(workflow.latestValidation(project), { year: 2026, result: 'Return for Revision', remarks: 'Fix drainage', resubmittedAt: undefined });
  assert.equal(workflow.validationTask(project, at('2027-06-01')).year, 2026);
  project.annualValidationEntries[0] = entry(2026, 'Validated', 'Done');
  assert.equal(workflow.latestValidation(project).result, 'Validated');
  assert.equal(workflow.validationTask(project, at('2027-06-01')).year, 2027);
  project.validationResult = 'Return for Revision'; project.validationRemarks = 'Initial corrections';
  assert.equal(workflow.validationTask(project, at('2027-06-01')).year, undefined);
  assert.equal(workflow.latestValidation(project).remarks, 'Initial corrections');
});
test('encoder sees the revision badge immediately before Edit, but not after validation', () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const Component = load('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity() {} }, '@/lib/project-save-delay': load('src/lib/project-save-delay.ts'), '@/lib/project-validation-workflow': workflow,
    '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
  }).LocalRoadList;
  const project = { id: 'p', name: 'Road', type: 'Road', location: 'Town', dateBuilt: '', condition: 'Good', ...base, annualValidationEntries: [entry(2026, 'Return for Revision', 'Fix')] };
  const render = (p, role) => renderToStaticMarkup(React.createElement(Component, { data: [p], userRole: role, currentUser: 'Test', onAdd() {}, onEdit() {}, onDelete() {} }));
  const html = render(project, 'Staff - Encoder');
  assert.match(html, />For Revision<\/span><button[^>]*aria-label="Edit Road"/);
  assert.doesNotMatch(render(project, 'Head Engineer'), />For Revision<\/span>/);
  assert.doesNotMatch(render({ ...project, annualValidationEntries: [entry(2026, 'Validated', 'Done')] }, 'Staff - Encoder'), />For Revision<\/span>/);
});

test('validator can only update the currently due task and encoder cannot submit validation', async () => {
  let role = 'validator', project = { id: 'p', name: 'Road', actualCompletionDate: '2000-01-01', revisionWorkflowAvailable: true }, calls = [];
  const res = (status, body = {}) => ({ status, body });
  const route = load('src/app/api/local-road/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/project-validation-workflow': workflow,
    '@/lib/api': { requireAuth: async () => ({ profile: { roleDb: role, username: 'Tester' }, db: 'user', admin: 'admin', userId: 'u' }), forbidden: () => res(403), unauthorized: () => res(401), withRefresh: r => r },
    '@/lib/supabase-data': {
      listRoads: async () => [project], addActivityLog: async () => {},
      saveInitialValidation: async (...args) => { calls.push(args); project = { ...project, validationResult: args[2], validationRemarks: args[3] }; },
      saveAnnualValidation: async (...args) => { calls.push(args); },
      markValidationResubmitted: async (...args) => { calls.push(['resubmit', ...args]); return true; },
      saveRoad: async (_db, rec) => { calls.push(['edit', rec]); return rec; },
    },
  });
  const patch = body => route.PATCH({ json: async () => body });
  assert.equal((await patch({ id: 'p', validationResult: 'Return for Revision', validationRemarks: 'Please fix' })).status, 200);
  assert.deepEqual(calls[0], ['admin', 'p', 'Return for Revision', 'Please fix', 'u', true]);
  role = 'encoder'; assert.equal((await patch({ id: 'p', projectName: 'Updated' })).status, 200);
  role = 'validator'; assert.equal((await patch({ id: 'p', validationResult: 'Validated', validationRemarks: 'Done' })).status, 200);
  project = { ...project, annualValidationEntries: [entry(2005)] }; calls = [];
  assert.equal((await patch({ id: 'p', annualValidationYear: 2004, validationResult: 'Validated', validationRemarks: 'Done' })).status, 409);
  assert.equal((await patch({ id: 'p', annualValidationYear: 2005, validationResult: 'Return for Revision', validationRemarks: 'Annual fix' })).status, 200);
  assert.deepEqual(calls[0], ['user', 'p', 2005, 'Return for Revision', 'Annual fix', 'u', false]);
  role = 'encoder'; assert.equal((await patch({ id: 'p', validationResult: 'Validated', validationRemarks: 'No' })).status, 403);
});

test('targeted initial and annual writes only change validation columns and fail on zero rows', async () => {
  const dataModule = load('src/lib/supabase-data.ts', {
    '@/lib/attachment-validation': load('src/lib/attachment-validation.ts'),
    '@/lib/supabase': { ROLE_FROM_DB: {}, ROLE_TO_DB: {} },
  });
  let calls = [], found = true;
  const db = { from: table => {
    const chain = {
      update(value) { calls.push({ table, value, filters: [] }); return chain; },
      eq(key, value) { calls.at(-1).filters.push([key, value]); return chain; },
      is(key, value) { calls.at(-1).filters.push([key, value]); return chain; },
      select() { return chain; },
      maybeSingle: async () => ({ data: found ? { id: 'p' } : null, error: null }),
    }; return chain;
  } };
  await dataModule.saveInitialValidation(db, 'p', 'Return for Revision', ' Fix ');
  assert.deepEqual(calls[0], { table: 'projects', value: { validation_status: 'rejected', validation_remarks: 'Fix' }, filters: [['id', 'p'], ['archived_at', null]] });
  await dataModule.saveAnnualValidation(db, 'p', 2026, 'Validated', ' OK ', 'user');
  assert.deepEqual(calls[1].filters, [['project_id', 'p'], ['year', 2026]]);
  assert.equal(calls[1].value.result, 'approved'); assert.equal(calls[1].value.remarks, 'OK');
  assert.equal('due_date' in calls[1].value, false);
  found = false;
  await assert.rejects(dataModule.saveInitialValidation(db, 'p', 'Validated', 'Done'), /Could not update/);
  await assert.rejects(dataModule.saveAnnualValidation(db, 'p', 2026, 'Validated', 'Done', 'user'), /Could not update/);
});

test('resubmission removes the badge but retains remarks and the task for another validator decision', () => {
  for (const project of [
    { ...base, validationResult: 'Return for Revision', validationRemarks: 'Fix', validationResubmittedAt: '2026-01-01T00:00:00Z' },
    { ...base, annualValidationEntries: [{ ...entry(2026, 'Return for Revision', 'Fix'), resubmittedAt: '2026-01-01T00:00:00Z' }] },
  ]) {
    assert.equal(workflow.hasRevision(project), false);
    assert.equal(workflow.latestValidation(project).remarks, 'Fix');
    assert.ok(workflow.validationTask(project, at('2026-11-10')).resubmittedAt);
  }
});

test('resubmission update uses conditional filters to avoid overwriting a newer validator decision', async () => {
  const dm = load('src/lib/supabase-data.ts', { '@/lib/attachment-validation': load('src/lib/attachment-validation.ts'), '@/lib/supabase': { ROLE_FROM_DB: {}, ROLE_TO_DB: {} } });
  let calls = []; let found = true;
  const db = { from: table => {
    const chain = {
      update(value) { calls.push({ table, value, filters: [] }); return chain; },
      eq(key, value) { calls.at(-1).filters.push([key, value]); return chain; },
      is(key, value) { calls.at(-1).filters.push([key, value]); return chain; },
      select() { return chain; }, maybeSingle: async () => ({ data: found ? { id: 'p' } : null, error: null }),
    }; return chain;
  } };
  assert.equal(await dm.markValidationResubmitted(db, 'p', undefined, '2026-01-01T00:00:00Z', 'Fix'), true);
  assert.equal(calls[0].table, 'projects');
  assert.deepEqual(calls[0].filters.slice(-3), [['validation_remarks', 'Fix'], ['validation_resubmitted_at', null], ['validated_at', '2026-01-01T00:00:00Z']]);
  found = false;
  assert.equal(await dm.markValidationResubmitted(db, 'p', 2026, undefined, 'Fix'), false);
  assert.equal(calls[1].table, 'annual_validation_entries');
  assert.deepEqual(calls[1].filters.slice(-3), [['remarks', 'Fix'], ['resubmitted_at', null], ['validated_at', null]]);
});

test('encoder resubmission is guarded when migration is absent and succeeds when available', async () => {
  let project = { id: 'p', name: 'Road', actualCompletionDate: '2000-01-01', validationResult: 'Return for Revision', validationRemarks: 'Fix' }, writes = 0, marks = 0;
  const res = (status, body = {}) => ({ status, body });
  const route = load('src/app/api/local-road/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/project-validation-workflow': workflow,
    '@/lib/api': { requireAuth: async () => ({ profile: { roleDb: 'encoder', username: 'Tester' }, db: 'user', admin: 'admin', userId: 'u' }), forbidden: () => res(403), unauthorized: () => res(401), withRefresh: r => r },
    '@/lib/supabase-data': {
      listRoads: async () => [project], addActivityLog: async () => {},
      saveRoad: async (_db, rec) => { writes++; project = { ...project, projectName: rec.projectName }; return { ...project }; },
      markValidationResubmitted: async () => { marks++; project = { ...project, validationResubmittedAt: '2026-01-01T00:00:00Z' }; return true; },
    },
  });
  const patch = () => route.PATCH({ json: async () => ({ id: 'p', projectName: 'Updated road' }) });
  assert.equal((await patch()).status, 503); assert.equal(writes, 0);
  project.revisionWorkflowAvailable = true;
  const result = await patch(); assert.equal(result.status, 200); assert.equal(writes, 1); assert.equal(marks, 1);
  assert.equal(result.body.data.projectName, 'Updated road'); assert.equal(workflow.hasRevision(result.body.data), false);
  assert.ok(workflow.validationTask(result.body.data).resubmittedAt);
  await patch(); assert.equal(marks, 1, 'repeated edits do not change the original resubmission');
});

test('validation management renders Updated for a resubmitted initial or annual task', () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const Component = load('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity() {} }, '@/lib/project-save-delay': load('src/lib/project-save-delay.ts'),
    '@/lib/project-validation-workflow': workflow, '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
  }).LocalRoadList;
  const baseRecord = { id: 'p', name: 'Road', type: 'Road', location: 'Town', dateBuilt: '', condition: 'Good', actualCompletionDate: '2000-01-01' };
  for (const decision of [
    { validationResult: 'Return for Revision', validationResubmittedAt: '2026-01-01T00:00:00Z', validationRemarks: 'Fix' },
    { validationResult: 'Validated', annualValidationEntries: [{ ...entry(2005, 'Return for Revision', 'Fix'), resubmittedAt: '2026-01-01T00:00:00Z' }] },
  ]) {
    const html = renderToStaticMarkup(React.createElement(Component, { data: [{ ...baseRecord, ...decision }], userRole: 'Staff - Validator', validationMode: true, currentUser: 'Test', onAdd() {}, onEdit() {}, onDelete() {} }));
    assert.match(html, />Updated(?: · Annual 2005)?<\/span>/);
  }
});
