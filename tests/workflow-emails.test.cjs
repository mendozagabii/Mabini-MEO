// @mine — step 6: each workflow action triggers its own email, and only its own.
// The notifier itself is recorded instead of sent (see tests/notifications.test.cjs
// for its own behaviour: recipients, wording, and the mailbox being optional).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(code, filename);
  return mod.exports;
}

const workflow = load('src/lib/project-validation-workflow.ts');
const formValidation = load('src/lib/project-form-validation.ts');

const res = (status, body = {}) => ({ status, body });
const emails = [];
const notifications = {
  actionNote: () => 'Action by: Tester',
  notifyWorkflow: async (_db, options) => { emails.push(options); return { sent: 0, recipients: [] }; },
};

function baseMocks(state) {
  const auth = { profile: { roleDb: state.roleDb, username: 'Tester' }, db: 'user', admin: 'admin', userId: state.userId || 'u' };
  return {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/api': {
      requireAuth: async () => auth,
      requireRole: async (_request, roles) => (roles.includes(state.roleDb) ? { auth } : { denied: res(403) }),
      forbidden: () => res(403),
      unauthorized: () => res(401),
      withRefresh: (response) => response,
    },
    '@/lib/notifications': notifications,
    '@/lib/project-validation-workflow': workflow,
    '@/lib/project-form-validation': formValidation,
    '@/lib/supabase-data': state.data,
  };
}

const request = (body) => ({ url: 'https://example.test/api', json: async () => body });

const dueProject = {
  id: 'p', projectName: 'Poblacion Road', actualCompletionDate: '2025-11-11',
  annualValidationEntries: [{ year: 2026, result: 'Pending', remarks: '', dueDate: '2026-10-12' }],
};

test('creating a project does not send a calendar reminder', async () => {
  emails.length = 0;
  const state = {
    roleDb: 'encoder',
    data: {
      listRoads: async () => [],
      saveRoad: async (_db, record) => ({ ...record, id: 'p1' }),
      addActivityLog: async () => {},
    },
  };
  const route = load('src/app/api/local-road/route.ts', baseMocks(state));
  const response = await route.POST(request({ projectName: 'Poblacion Road', barangay: 'Poblacion' }));
  assert.equal(response.status, 200);
  assert.deepEqual(emails, []);
});

test('email 2 and email 4 — the validator sends it back, or tells the Head Engineer it is validated', async () => {
  const state = {
    roleDb: 'validator',
    data: {
      listRoads: async () => [dueProject],
      saveAnnualValidation: async () => {},
      addActivityLog: async () => {},
    },
  };
  const route = load('src/app/api/local-road/route.ts', baseMocks(state));

  emails.length = 0;
  const returned = await route.PATCH(request({ id: 'p', validationResult: 'Return for Revision', validationRemarks: 'Fix the drainage', annualValidationYear: 2026 }));
  assert.equal(returned.status, 200);
  assert.deepEqual(emails, [{ note: 'Action by: Tester', kind: 'for-revision', projectName: 'Poblacion Road' }]);

  emails.length = 0;
  const validated = await route.PATCH(request({ id: 'p', validationResult: 'Validated', validationRemarks: 'Complete', annualValidationYear: 2026 }));
  assert.equal(validated.status, 200);
  assert.deepEqual(emails, [{ note: 'Action by: Tester', kind: 'validated', projectName: 'Poblacion Road' }]);
});

test('email 3 — a returned project that comes back with changes tells the validator', async () => {
  const returnedProject = {
    ...dueProject,
    annualValidationEntries: [{ year: 2026, result: 'Return for Revision', remarks: 'Fix the drainage', dueDate: '2026-10-12' }],
  };
  // the saved record really is the one the list returns afterwards
  let stored = { ...returnedProject };
  const state = {
    roleDb: 'encoder',
    data: {
      listRoads: async () => [stored],
      saveRoad: async (_db, record) => { stored = { ...record }; return { ...record }; },
      requeueReturnedValidation: async () => true,
      addActivityLog: async () => {},
    },
  };
  const route = load('src/app/api/local-road/route.ts', baseMocks(state));

  emails.length = 0;
  const saved = await route.PATCH(request({ id: 'p', projectName: 'Poblacion Road Phase 2' }));
  assert.equal(saved.status, 200);
  assert.deepEqual(emails, [{ note: 'Action by: Tester', kind: 'information-updated', projectName: 'Poblacion Road Phase 2' }]);

  // an ordinary edit of a project that was never returned emails nobody
  emails.length = 0;
  stored = { ...dueProject, annualValidationEntries: [{ year: 2026, result: 'Pending', remarks: '', dueDate: '2026-10-12' }] };
  const edit = await route.PATCH(request({ id: 'p', projectName: 'Poblacion Road Phase 3' }));
  assert.equal(edit.status, 200);
  assert.deepEqual(emails, []);
});

test('email 5 — assigning an inspector tells that inspector, and clearing tells nobody', async () => {
  const state = {
    roleDb: 'head_engineer',
    data: {
      listRoads: async () => [{ id: 'p', projectName: 'Poblacion Road', validationResult: 'Validated' }],
      findInspectorProfile: async (_admin, id) => (id === 'i1' ? { id, name: 'Juan' } : null),
      setProjectInspector: async () => {},
      addActivityLog: async () => {},
    },
  };
  const route = load('src/app/api/local-road/inspector-assignment/route.ts', baseMocks(state));

  emails.length = 0;
  assert.equal((await route.POST(request({ projectId: 'p', inspectorId: 'i1' }))).status, 200);
  assert.deepEqual(emails, [{ note: 'Action by: Tester', kind: 'inspector-assigned', projectName: 'Poblacion Road', inspectorId: 'i1' }]);

  emails.length = 0;
  assert.equal((await route.POST(request({ projectId: 'p', inspectorId: '' }))).status, 200);
  assert.deepEqual(emails, []);
});

test('email 6 — a saved inspection tells the encoder the work is recorded', async () => {
  const state = {
    roleDb: 'inspector',
    userId: 'u',
    data: {
      listRoads: async () => [{ id: 'p', projectName: 'Coastal Road', inspectorId: 'u', actualCompletionDate: '2020-01-01' }],
      listInspections: async () => [],
      saveInspection: async () => ({ id: 'i1' }),
      saveRoad: async (_db, record) => ({ ...record }),
      addActivityLog: async () => {},
    },
  };
  const mocks = baseMocks(state);
  mocks['@/lib/inspection-selection'] = {
    validateAssessment: () => true,
    findingsSummary: () => 'All good',
  };
  const route = load('src/app/api/inspections/route.ts', mocks);

  emails.length = 0;
  const created = await route.POST(request({
    localRoadId: 'p', date: '2026-01-01', inspectionType: 'Monitoring and Maintenance Inspection',
    conditionRatings: {}, conditionRemarks: {}, conditionAttachments: {},
  }));
  assert.equal(created.status, 200);
  assert.deepEqual(emails, [{ note: 'Action by: Tester', kind: 'inspection-recorded', projectName: 'Coastal Road' }]);

  // a refused save never emails anybody
  emails.length = 0;
  state.data.saveInspection = async () => { throw new Error('refused'); };
  const failed = await route.POST(request({
    localRoadId: 'p', date: '2026-01-01', inspectionType: 'Monitoring and Maintenance Inspection',
    conditionRatings: {}, conditionRemarks: {}, conditionAttachments: {},
  }));
  assert.equal(failed.status, 500);
  assert.deepEqual(emails, []);
});
