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
test('every validation opens 30 days before its anniversary, including the first', () => {
  const project = { actualCompletionDate: '2026-11-11', annualValidationEntries: [entry(2027)] };
  for (const day of ['2026-10-12', '2026-11-11', '2027-10-11']) assert.equal(workflow.validationTask(project, at(day)), null, day);
  assert.equal(workflow.validationTask(project, at('2027-10-12')).year, 2027);
  const example = { actualCompletionDate: '2025-11-11', annualValidationEntries: [entry(2026)] };
  assert.equal(workflow.validationTask(example, at('2026-10-11')), null);
  assert.equal(workflow.validationTask(example, at('2026-10-12')).year, 2026);
  const later = { actualCompletionDate: '2025-11-11', annualValidationEntries: [entry(2026, 'Validated'), entry(2027)] };
  assert.equal(workflow.validationTask(later, at('2027-10-11')), null);
  assert.equal(workflow.validationTask(later, at('2027-10-12')).year, 2027);
  const january = { actualCompletionDate: '2026-01-01', annualValidationEntries: [entry(2027)] };
  assert.equal(workflow.validationTask(january, at('2026-12-01')), null);
  assert.equal(workflow.validationTask(january, at('2026-12-02')).year, 2027);
  assert.equal(workflow.validationTask({ ...project, actualCompletionDate: '2025-02-30' }, at('2027-10-12')), null);
  assert.equal(workflow.validationTask({ ...project, actualCompletionDate: undefined }, at('2027-10-12')), null);
  assert.equal(workflow.validationTask({ ...project, annualValidationEntries: [] }, at('2027-10-12')), null);
});
test('annual returns remain actionable and oldest annual backlog is addressed first regardless of legacy initial status', () => {
  const project = { ...base, validationResult: 'Return for Revision', validationRemarks: 'Legacy', annualValidationEntries: [entry(2026, 'Return for Revision', 'Fix drainage'), entry(2027)] };
  assert.deepEqual(workflow.latestValidation(project), { year: 2026, result: 'Return for Revision', remarks: 'Fix drainage' });
  assert.equal(workflow.validationTask(project, at('2027-06-01')).year, 2026);
  project.annualValidationEntries[0] = entry(2026, 'Validated', 'Done');
  assert.equal(workflow.latestValidation(project).result, 'Validated');
  assert.equal(workflow.validationTask(project, at('2027-06-01')).year, 2027);
  assert.equal(workflow.latestValidation({ ...project, annualValidationEntries: [] }).result, undefined);
});
test('encoder sees the revision badge immediately before Edit, but not after validation', () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const Component = load('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity() {} }, '@/lib/project-validation-workflow': workflow,
    '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
  }).LocalRoadList;
  const project = { id: 'p', name: 'Road', type: 'Road', location: 'Town', dateBuilt: '', condition: 'Good', ...base, annualValidationEntries: [entry(2026, 'Return for Revision', 'Fix')] };
  const render = (p, role) => renderToStaticMarkup(React.createElement(Component, { data: [p], userRole: role, currentUser: 'Test', onAdd() {}, onEdit() {}, onDelete() {} }));
  const html = render(project, 'Staff - Encoder');
  assert.match(html, />For Revision<\/span><button[^>]*aria-label="Edit Road"/);
  assert.doesNotMatch(render(project, 'Head Engineer'), />For Revision<\/span>/);
  assert.doesNotMatch(render({ ...project, annualValidationEntries: [entry(2026, 'Validated', 'Done')] }, 'Staff - Encoder'), />For Revision<\/span>/);
  assert.doesNotMatch(render({ ...project, annualValidationEntries: [entry(2026, 'Pending', 'Fix')] }, 'Staff - Encoder'), />For Revision<\/span>/);
  assert.doesNotMatch(render({ ...project, validationResult: undefined, validationRemarks: 'Fix', annualValidationEntries: [] }, 'Staff - Encoder'), />For Revision<\/span>/);
});

test('validator can only update a currently due annual task, never an initial decision', async () => {
  let role = 'validator', project = { id: 'p', name: 'Road', actualCompletionDate: '2000-01-01', annualValidationEntries: [entry(2005)] }, calls = [];
  const res = (status, body = {}) => ({ status, body });
  const route = load('src/app/api/local-road/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/project-validation-workflow': workflow,
    '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
    '@/lib/notifications': { notifyWorkflow: async () => ({ sent: 0, recipients: [] }), actionNote: () => '', automaticNote: () => '' }, '@/lib/api': { requireAuth: async () => ({ profile: { roleDb: role, username: 'Tester' }, db: 'user', admin: 'admin', userId: 'u' }), forbidden: () => res(403), unauthorized: () => res(401), withRefresh: r => r },
    '@/lib/supabase-data': {
      listRoads: async () => [project], addActivityLog: async () => {},
      saveAnnualValidation: async (...args) => { calls.push(args); },
      saveRoad: async (_db, rec) => rec,
    },
  });
  const patch = body => route.PATCH({ json: async () => body });
  assert.equal((await patch({ id: 'p', validationResult: 'Return for Revision', validationRemarks: 'Fix' })).status, 409);
  assert.equal((await patch({ id: 'p', annualValidationYear: 2004, validationResult: 'Validated', validationRemarks: 'Done' })).status, 409);
  assert.equal((await patch({ id: 'p', annualValidationYear: 2005, validationResult: 'Return for Revision', validationRemarks: 'Annual fix' })).status, 200);
  assert.deepEqual(calls[0], ['user', 'p', 2005, 'Return for Revision', 'Annual fix', 'u']);
  role = 'encoder'; assert.equal((await patch({ id: 'p', annualValidationYear: 2005, validationResult: 'Validated', validationRemarks: 'No' })).status, 403);
});

test('annual validation writes only validation columns and fails on zero rows', async () => {
  const dm = load('src/lib/supabase-data.ts', { '@/lib/attachment-validation': load('src/lib/attachment-validation.ts'), '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'), '@/lib/supabase': { ROLE_FROM_DB: {}, ROLE_TO_DB: {} } });
  let calls = [], found = true;
  const db = { from: table => {
    const chain = {
      update(value) { calls.push({ table, value, filters: [] }); return chain; },
      eq(key, value) { calls.at(-1).filters.push([key, value]); return chain; },
      select() { return chain; }, maybeSingle: async () => ({ data: found ? { id: 'p' } : null, error: null }),
    }; return chain;
  } };
  await dm.saveAnnualValidation(db, 'p', 2026, 'Validated', ' OK ', 'user');
  assert.deepEqual(calls[0].filters, [['project_id', 'p'], ['year', 2026]]);
  assert.equal(calls[0].value.result, 'approved'); assert.equal(calls[0].value.remarks, 'OK');
  assert.equal('due_date' in calls[0].value, false);
  found = false; await assert.rejects(dm.saveAnnualValidation(db, 'p', 2026, 'Validated', 'Done', 'user'), /Could not update/);
});

test('only annual returns are requeued, and never before the first anniversary window', () => {
  const initial = { ...base, validationResult: 'Return for Revision', validationRemarks: 'Legacy', annualValidationEntries: [] };
  assert.equal(workflow.validationTask(initial, at('2026-06-01')), null);
  assert.deepEqual(workflow.latestValidation(initial), {});
  const annual = { ...base, annualValidationEntries: [entry(2026, 'Pending', 'Fix drainage')] };
  assert.equal(workflow.validationTask(annual, at('2026-05-01')), null);
  assert.equal(workflow.latestValidation(annual).result, 'Pending');
  assert.equal(workflow.validationTask(annual, at('2026-05-02')).year, 2026);
});

test('requeue conditionally updates only the returned annual decision', async () => {
  const dm = load('src/lib/supabase-data.ts', { '@/lib/attachment-validation': load('src/lib/attachment-validation.ts'), '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'), '@/lib/supabase': { ROLE_FROM_DB: {}, ROLE_TO_DB: {} } });
  let calls = [], found = true;
  const db = { from: table => {
    const chain = {
      update(value) { calls.push({ table, value, filters: [] }); return chain; },
      eq(key, value) { calls.at(-1).filters.push([key, value]); return chain; },
      is(key, value) { calls.at(-1).filters.push([key, value]); return chain; },
      select() { return chain; }, maybeSingle: async () => ({ data: found ? { id: 'p' } : null, error: null }),
    }; return chain;
  } };
  assert.equal(await dm.requeueReturnedValidation(db, 'p', 2026, '2026-01-01T00:00:00Z', 'Fix'), true);
  assert.equal(calls[0].table, 'annual_validation_entries');
  assert.deepEqual(calls[0].value, { result: 'pending' });
  assert.deepEqual(calls[0].filters.slice(-3), [['result', 'rejected'], ['remarks', 'Fix'], ['validated_at', '2026-01-01T00:00:00Z']]);
  found = false; assert.equal(await dm.requeueReturnedValidation(db, 'p', 2026, undefined, 'Fix'), false);
});

test('successful encoder edits requeue only returned decisions; partial edits and races are reported', async () => {
  const res = (status, body = {}) => ({ status, body });
  for (const annual of [true]) {
    let project = { id: 'p', name: 'Road', actualCompletionDate: '2000-01-01', validationResult: annual ? 'Validated' : 'Return for Revision', validationRemarks: annual ? 'OK' : 'Fix',
      ...(annual ? { annualValidationEntries: [entry(2005, 'Return for Revision', 'Fix')] } : {}) };
    let requeues = 0, partial = false, conflict = false;
    const route = load('src/app/api/local-road/route.ts', {
      'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
      '@/lib/project-validation-workflow': workflow,
      '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
    '@/lib/notifications': { notifyWorkflow: async () => ({ sent: 0, recipients: [] }), actionNote: () => '', automaticNote: () => '' }, '@/lib/api': { requireAuth: async () => ({ profile: { roleDb: 'encoder', username: 'Tester' }, db: 'user', admin: 'admin', userId: 'u' }), forbidden: () => res(403), unauthorized: () => res(401), withRefresh: r => r },
      '@/lib/supabase-data': {
        listRoads: async () => [project], addActivityLog: async () => {},
        saveRoad: async (_db, rec) => ({ ...rec, ...(partial ? { attachmentWarning: 'Attachment failed' } : {}) }),
        requeueReturnedValidation: async (db, id, year, timestamp, remarks) => {
          requeues++; assert.equal(db, 'admin'); assert.equal(id, 'p'); assert.equal(year, annual ? 2005 : undefined); assert.equal(remarks, 'Fix');
          if (conflict) return false;
          project = annual ? { ...project, annualValidationEntries: [entry(2005, 'Pending', 'Fix')] } : { ...project, validationResult: undefined };
          return true;
        },
      },
    });
    const patch = () => route.PATCH({ json: async () => ({ id: 'p', projectName: 'New name' }) });
    partial = true; let result = await patch(); assert.equal(result.body.data.attachmentWarning, 'Attachment failed'); assert.equal(requeues, 0);
    partial = false; conflict = true; result = await patch(); assert.match(result.body.data.attachmentWarning, /saved.*could not be confirmed/i);
    conflict = false; result = await patch(); assert.equal(result.status, 200);
    assert.equal(workflow.latestValidation(result.body.data).result, 'Pending');
    assert.equal(workflow.latestValidation(result.body.data).remarks, 'Fix');
    assert.notEqual(workflow.latestValidation(result.body.data).result, 'Return for Revision');
  }
});


test('an encoder edit requeues every outstanding returned decision', async () => {
  let project = { id: 'p', name: 'Road', actualCompletionDate: '2000-01-01', validationResult: 'Return for Revision', validationRemarks: 'Initial', annualValidationEntries: [entry(2005, 'Return for Revision', 'Annual')] };
  const years = [];
  const route = load('src/app/api/local-road/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status || 200, body }) } },
    '@/lib/project-validation-workflow': workflow,
    '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
    '@/lib/notifications': { notifyWorkflow: async () => ({ sent: 0, recipients: [] }), actionNote: () => '', automaticNote: () => '' }, '@/lib/api': { requireAuth: async () => ({ profile: { roleDb: 'encoder', username: 'Tester' }, db: 'user', admin: 'admin', userId: 'u' }), forbidden: () => ({ status: 403 }), unauthorized: () => ({ status: 401 }), withRefresh: r => r },
    '@/lib/supabase-data': {
      listRoads: async () => [project], addActivityLog: async () => {}, saveRoad: async (_db, rec) => rec,
      requeueReturnedValidation: async (_db, _id, year) => { years.push(year); if (year === undefined) project = { ...project, validationResult: undefined }; else project = { ...project, annualValidationEntries: [entry(year, 'Pending', 'Annual')] }; return true; },
    },
  });
  const result = await route.PATCH({ json: async () => ({ id: 'p', projectName: 'Edited' }) });
  assert.equal(result.status, 200); assert.deepEqual(years, [2005]);
  assert.notEqual(workflow.latestValidation(result.body.data).result, 'Return for Revision');
});

// @mine — exercise the real annual entry generator without contacting Supabase.
// The validation opens 30 days before the anniversary; the scheduled inspection
// only appears on its own date, one day later (WORKFLOW-DECISIONS Q15/Q16).
test('the annual entry opens 30 days before the anniversary and its inspection 29 days before', async () => {
  const dm = load('src/lib/supabase-data.ts', { '@/lib/attachment-validation': load('src/lib/attachment-validation.ts'), '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'), '@/lib/supabase': { ROLE_FROM_DB: {}, ROLE_TO_DB: {} } });
  const RealDate = global.Date;
  for (const [completion, day, expected, followUpDate] of [
    ['2026-11-11', '2026-10-11', null, null],
    ['2026-11-11', '2027-10-11', null, null],
    ['2026-11-11', '2027-10-12', [2027, '2027-10-12'], null],
    ['2026-11-11', '2027-10-13', [2027, '2027-10-12'], '2027-10-13'],
    ['2026-01-01', '2026-12-01', null, null],
    ['2026-01-01', '2026-12-02', [2027, '2026-12-02'], null],
    ['2026-01-01', '2026-12-03', [2027, '2026-12-02'], '2026-12-03'],
  ]) {
    let writes = [];
    class MockDate extends RealDate { constructor(...args) { super(...(args.length ? args : [`${day}T12:00:00Z`])); } static now() { return new RealDate(`${day}T12:00:00Z`).getTime(); } }
    const db = { from(table) {
      const chain = { select() { return chain; }, is() { return chain; }, not() { return chain; }, eq() { return chain; },
        upsert(value) { writes.push({ table, value }); return Promise.resolve({ error: null }); },
        insert(value) { writes.push({ table, value }); return Promise.resolve({ error: null }); },
        then(resolve, reject) { return Promise.resolve({ data: table === 'projects' ? [{ id: 'p', actual_completion_date: completion }] : [], error: null }).then(resolve, reject); },
      }; return chain;
    } };
    try { global.Date = MockDate; await dm.ensureAnnualFollowUps(db); } finally { global.Date = RealDate; }
    const entryWrite = writes.find(w => w.table === 'annual_validation_entries');
    const inspectionWrite = writes.find(w => w.table === 'inspections');
    if (!expected) { assert.equal(entryWrite, undefined, `${completion} on ${day}`); assert.equal(inspectionWrite, undefined, `${completion} on ${day}`); }
    else {
      assert.ok(entryWrite, `${completion} on ${day}`);
      assert.equal(entryWrite.value.year, expected[0]);
      assert.equal(entryWrite.value.due_date, expected[1]);
      if (!followUpDate) assert.equal(inspectionWrite, undefined, `${completion} on ${day}`);
      else { assert.ok(inspectionWrite, `${completion} on ${day}`); assert.equal(inspectionWrite.value.inspection_date, followUpDate); }
    }
  }
});

// @mine — the encoder-side gates decided in WORKFLOW-DECISIONS Q4/B3 and Q5.
function loadProjectRoute(projectRef) {
  const res = (status, body = {}) => ({ status, body });
  const auth = { profile: { roleDb: 'encoder', username: 'Tester' }, db: 'user', admin: 'admin', userId: 'u' };
  return load('src/app/api/local-road/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/project-validation-workflow': workflow,
    '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
    '@/lib/notifications': { notifyWorkflow: async () => ({ sent: 0, recipients: [] }), actionNote: () => '', automaticNote: () => '' }, '@/lib/api': { requireAuth: async () => auth, requireRole: async () => ({ auth }), forbidden: () => res(403), unauthorized: () => res(401), withRefresh: r => r },
    '@/lib/supabase-data': {
      listRoads: async () => [projectRef()], addActivityLog: async () => {},
      saveRoad: async (_db, rec) => ({ ...rec }), requeueReturnedValidation: async () => true,
    },
  });
}

test('a validated project is locked to the encoder until the next annual validation opens', async () => {
  let project = { id: 'p', name: 'Road', projectName: 'Road', actualCompletionDate: '2000-01-01',
    annualValidationEntries: [entry(2026, 'Validated', 'OK')] };
  const route = loadProjectRoute(() => project);
  const locked = await route.PATCH({ json: async () => ({ id: 'p', projectName: 'Road renamed' }) });
  assert.equal(locked.status, 409);
  assert.match(locked.body.message, /validated for 2026/i);
  assert.match(locked.body.message, /next annual validation/i);

  // The next cycle opens with a newer entry, whichever its result, and the lock lifts.
  project = { ...project, annualValidationEntries: [entry(2026, 'Validated', 'OK'), entry(2027)] };
  assert.equal((await route.PATCH({ json: async () => ({ id: 'p', projectName: 'Road renamed' }) })).status, 200);
});

test('a returned project cannot go back to the validator unchanged', async () => {
  const project = { id: 'p', name: 'Road', projectName: 'Poblacion Road', contractAmount: '1000',
    actualCompletionDate: '2000-01-01', annualValidationEntries: [entry(2026, 'Return for Revision', 'Fix drainage')] };
  const route = loadProjectRoute(() => project);

  const unchanged = await route.PATCH({ json: async () => ({ id: 'p', projectName: 'Poblacion Road', contractAmount: '1000' }) });
  assert.equal(unchanged.status, 400);
  assert.match(unchanged.body.message, /change at least one project detail/i);

  // Spacing and number formatting are not real changes.
  const cosmetic = await route.PATCH({ json: async () => ({ id: 'p', projectName: '  Poblacion Road ', contractAmount: 1000 }) });
  assert.equal(cosmetic.status, 400);

  assert.equal((await route.PATCH({ json: async () => ({ id: 'p', projectName: 'Poblacion Road Extension' }) })).status, 200);
});


test('returned project ignores derived aliases and currency formatting but accepts real financial/location corrections', async () => {
  const project = { id: 'p', name: 'Road', projectName: 'Road', dateBuilt: '2020-01-01', actualCompletionDate: '2020-12-01', location: 'A', locations: ['A'], contractedAmount: '1000.00', annualValidationEntries: [entry(2026, 'Return for Revision', 'Fix')] };
  const route = loadProjectRoute(() => project);
  const patch = body => route.PATCH({ json: async () => ({ id: 'p', ...body }) });
  assert.equal((await patch({ dateStarted: '2020-01-01', completionDate: '2020-12-01', roadName: 'Road', contractedAmount: '1,000', locations: [' A '] })).status, 400);
  assert.equal((await patch({ contractedAmount: '2000' })).status, 200);
  assert.equal((await patch({ locations: ['A', 'B'] })).status, 200);
});
