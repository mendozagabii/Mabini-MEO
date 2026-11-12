// @mine — task 11 / WORKFLOW-DECISIONS Q2/Q3/Q7: one inspector per project,
// assigned by the Head Engineer. Covers the role filter, the assignment route and
// the read-only inspector list.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(code, filename); return mod.exports;
}

const baseMocks = {
  '@/lib/attachment-validation': load('src/lib/attachment-validation.ts'),
  '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
  '@/lib/supabase': { ROLE_FROM_DB: {}, ROLE_TO_DB: { 'Head Engineer': 'head_engineer', 'Staff - Encoder': 'encoder', 'Staff - Inspector': 'inspector', 'Staff - Validator': 'validator' } },
};

// A profiles table good enough for the two helpers under test: it honours the
// filters and the ordering the real query asks for.
function profileDb(rows) {
  return {
    from(table) {
      assert.equal(table, 'profiles');
      const filters = [];
      const matching = () => rows.filter(row => filters.every(([key, value]) => row[key] === value));
      const chain = {
        select() { return chain; },
        is(key, value) { filters.push([key, value]); return chain; },
        eq(key, value) { filters.push([key, value]); return chain; },
        order(key) {
          return Promise.resolve({ data: matching().sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''))), error: null });
        },
        maybeSingle() { return Promise.resolve({ data: matching()[0] ?? null, error: null }); },
      };
      return chain;
    },
  };
}

test('only active Inspector accounts are offered for assignment', async () => {
  const data = load('src/lib/supabase-data.ts', baseMocks);
  const rows = [
    { id: 'i2', username: 'Maria', role: 'inspector', archived_at: null },
    { id: 'i1', username: 'Juan', role: 'inspector', archived_at: null },
    { id: 'e1', username: 'Ana', role: 'encoder', archived_at: null },
  ];
  const options = await data.listInspectorOptions(profileDb(rows));
  assert.deepEqual(options, [{ id: 'i1', name: 'Juan' }, { id: 'i2', name: 'Maria' }]);

  assert.deepEqual(await data.findInspectorProfile(profileDb(rows), 'i1'), { id: 'i1', name: 'Juan' });
  // an account that is not an inspector can never be assigned
  assert.equal(await data.findInspectorProfile(profileDb(rows), 'e1'), null);
  assert.equal(await data.findInspectorProfile(profileDb(rows), 'missing'), null);
});

function assignmentRoute(state) {
  const res = (status, body = {}) => ({ status, body });
  const auth = { profile: { roleDb: state.roleDb, username: 'Head' }, db: 'user', admin: 'admin', userId: 'u' };
  return load('src/app/api/local-road/inspector-assignment/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/notifications': { notifyWorkflow: async () => ({ sent: 0, recipients: [] }) }, '@/lib/api': {
      requireRole: async (_request, roles) => (roles.includes(state.roleDb) ? { auth } : { denied: res(403) }),
      withRefresh: response => response,
    },
    '@/lib/supabase-data': {
      listRoads: async () => state.projects,
      findInspectorProfile: async (_admin, id) => (state.inspectors.includes(id) ? { id, name: `Inspector ${id}` } : null),
      setProjectInspector: async (_admin, projectId, inspectorId) => { state.writes.push({ projectId, inspectorId }); },
      addActivityLog: async (_admin, entry) => { state.logs.push(entry); },
    },
  });
}

const request = body => ({ json: async () => body });

test('the Head Engineer assigns, reassigns and clears the single project inspector', async () => {
  const state = { roleDb: 'head_engineer', projects: [{ id: 'p', projectName: 'Poblacion Road' }], inspectors: ['i1', 'i2'], writes: [], logs: [] };
  const route = assignmentRoute(state);

  assert.equal((await route.POST(request({ projectId: 'p', inspectorId: 'i1' }))).status, 200);
  assert.deepEqual(state.writes.at(-1), { projectId: 'p', inspectorId: 'i1' });
  assert.equal(state.logs.at(-1).action, 'Inspector Assigned');
  assert.match(state.logs.at(-1).details, /Poblacion Road/);

  // reassignment replaces, it never adds a second inspector
  assert.equal((await route.POST(request({ projectId: 'p', inspectorId: 'i2' }))).status, 200);
  assert.equal(state.writes.length, 2);
  assert.deepEqual(state.writes.at(-1), { projectId: 'p', inspectorId: 'i2' });

  // clearing is allowed, and is logged as such
  assert.equal((await route.POST(request({ projectId: 'p', inspectorId: '' }))).status, 200);
  assert.deepEqual(state.writes.at(-1), { projectId: 'p', inspectorId: null });
  assert.equal(state.logs.at(-1).action, 'Inspector Unassigned');
});

test('assignment is refused for other roles, unknown projects and non-inspector accounts', async () => {
  const state = { roleDb: 'head_engineer', projects: [{ id: 'p', projectName: 'Road' }], inspectors: ['i1'], writes: [], logs: [] };
  const route = assignmentRoute(state);

  const notInspector = await route.POST(request({ projectId: 'p', inspectorId: 'e1' }));
  assert.equal(notInspector.status, 400);
  assert.match(notInspector.body.message, /registered inspector/i);

  const missingProject = await route.POST(request({ projectId: 'nope', inspectorId: 'i1' }));
  assert.equal(missingProject.status, 404);

  const missingProjectId = await route.POST(request({ inspectorId: 'i1' }));
  assert.equal(missingProjectId.status, 400);

  state.roleDb = 'encoder';
  assert.equal((await route.POST(request({ projectId: 'p', inspectorId: 'i1' }))).status, 403);
  state.roleDb = 'validator';
  assert.equal((await route.POST(request({ projectId: 'p', inspectorId: 'i1' }))).status, 403);
  assert.equal(state.writes.length, 0);
});

test('the inspector list is readable by the Head Engineer only', async () => {
  const res = (status, body = {}) => ({ status, body });
  const state = { roleDb: 'head_engineer' };
  const route = load('src/app/api/local-road/inspectors/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/notifications': { notifyWorkflow: async () => ({ sent: 0, recipients: [] }) }, '@/lib/api': {
      requireAuth: async () => ({ profile: { roleDb: state.roleDb, username: 'Head' }, db: 'user', admin: 'admin', userId: 'u' }),
      forbidden: () => res(403), unauthorized: () => res(401), withRefresh: response => response,
    },
    '@/lib/supabase-data': { listInspectorOptions: async () => [{ id: 'i1', name: 'Juan' }] },
  });
  const allowed = await route.GET(request({}));
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body.data, [{ id: 'i1', name: 'Juan' }]);
  for (const roleDb of ['encoder', 'validator', 'inspector']) {
    state.roleDb = roleDb;
    assert.equal((await route.GET(request({}))).status, 403, roleDb);
  }
});

// @mine — step 5 (WORKFLOW-DECISIONS Q8/Q9): the inspector sees and records only
// on the projects assigned to them.
function inspectionRoutes(state) {
  const res = (status, body = {}) => ({ status, body });
  // built per call, so a test can change the signed-in role between requests
  const auth = () => ({ profile: { roleDb: state.roleDb, username: 'Tester' }, db: 'user', admin: 'admin', userId: state.userId });
  return load('src/app/api/inspections/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/inspection-selection': load('src/lib/inspection-selection.ts'),
    '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
    '@/lib/notifications': { notifyWorkflow: async () => ({ sent: 0, recipients: [] }) }, '@/lib/api': {
      requireAuth: async () => auth(),
      requireRole: async (_request, roles) => (roles.includes(state.roleDb) ? { auth: auth() } : { denied: res(403) }),
      forbidden: () => res(403), unauthorized: () => res(401), withRefresh: response => response,
    },
    '@/lib/supabase-data': {
      listInspections: async () => state.inspections,
      listArchivedInspections: async () => [],
      listRoads: async () => state.roads,
      listMaintenance: async () => [], listArchivedMaintenance: async () => [],
      saveInspection: async (_db, payload) => payload,
      saveRoad: async (_db, road) => road,
      addActivityLog: async () => {},
    },
  });
}

test('an inspector is shown only the inspections of the projects assigned to them', async () => {
  const state = {
    roleDb: 'inspector', userId: 'me',
    roads: [{ id: 'a', inspectorId: 'me' }, { id: 'b', inspectorId: 'someone-else' }, { id: 'c', inspectorId: '' }],
    inspections: [{ id: 'ia', localRoadId: 'a', date: '2026-01-01' }, { id: 'ib', localRoadId: 'b', date: '2026-01-02' }, { id: 'ic', localRoadId: 'c', date: '2026-01-03' }],
  };
  const route = inspectionRoutes(state);
  const mine = await route.GET(request({}));
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.data.map(record => record.id), ['ia']);

  // every other role still sees everything
  state.roleDb = 'encoder';
  assert.deepEqual((await route.GET(request({}))).body.data.map(record => record.id), ['ia', 'ib', 'ic']);
});

test('an inspector cannot record an inspection on a project that is not theirs', async () => {
  const state = {
    roleDb: 'inspector', userId: 'me',
    roads: [{ id: 'b', actualCompletionDate: '2020-01-01', inspectorId: 'someone-else' }],
    inspections: [],
  };
  const route = inspectionRoutes(state);
  const labels = load('src/lib/inspection-selection.ts').assessmentComponents;
  const conditionRatings = Object.fromEntries(labels.map(label => [label, label === 'Concrete' ? 'Fair' : 'N/A']));
  const body = {
    localRoadId: 'b', date: '2026-06-01', inspectionType: 'Monitoring and Maintenance Inspection',
    conditionRatings, conditionRemarks: { Concrete: 'Cracks' }, conditionAttachments: { Concrete: [{ stored: true }] },
  };
  const refused = await route.POST(request(body));
  assert.equal(refused.status, 403);
  assert.match(refused.body.message, /not assigned to you/i);

  // once the project is assigned to them, the same request is accepted
  state.roads = [{ id: 'b', actualCompletionDate: '2020-01-01', inspectorId: 'me' }];
  assert.equal((await route.POST(request(body))).status, 200);
});
