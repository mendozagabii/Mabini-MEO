// @mine — local UI and route checks with stubbed sessions/data; no database calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function loadTs(relative, mocks) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = m.require.bind(m);
  m.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name);
  m._compile(code, filename);
  return m.exports;
}

const response = (status, body = {}) => ({ status, body });
let role = null;
const auth = () => role ? { profile: { roleDb: role, username: 'test' }, db: {}, admin: {}, userId: 'test' } : null;
const api = {
  requireAuth: async () => auth(),
  requireRole: async (_request, roles) => !role ? { denied: response(401) } : !roles.includes(role) ? { denied: response(403) } : { auth: auth() },
  forbidden: () => response(403), unauthorized: () => response(401), withRefresh: (value) => value,
};
let calls = [];
const data = {
  listRoads: async () => [], listArchivedInspections: async () => [], listInspections: async () => [{ id: 'x', localRoadId: 'road' }],
  archiveRoad: async () => (calls.push('project'), true),
  archiveInspection: async () => (calls.push('inspection'), true),
  archiveMaintenance: async () => (calls.push('maintenance'), true),
  addActivityLog: async () => {},
};
const mocks = { '@/lib/project-form-validation': loadTs('src/lib/project-form-validation.ts', {}), '@/lib/inspection-selection': loadTs('src/lib/inspection-selection.ts', {}), '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts', {}), '@/lib/api': api, '@/lib/supabase-data': data, 'next/server': { NextResponse: { json: (body, init) => response(init?.status ?? 200, body) } } };
const routes = Object.fromEntries(['local-road', 'maintenance', 'inspections'].map((name) => [name, loadTs(`src/app/api/${name}/route.ts`, mocks)]));
function request(body = {}, query = '') { return { url: `https://example.test/api?${query}`, json: async () => body }; }

for (const [moduleName, method, allowed] of [
  ['local-road', 'POST', ['encoder']], ['maintenance', 'POST', ['encoder']], ['maintenance', 'PATCH', ['encoder']],
  ['inspections', 'POST', ['inspector']], ['inspections', 'PUT', ['inspector']],
]) {
  test(`${moduleName} ${method} only permits its staff role`, async () => {
    for (const candidate of [null, 'head_engineer', 'encoder', 'inspector', 'validator']) {
      role = candidate;
      const result = await routes[moduleName][method](request(null));
      assert.equal(result.status, !candidate ? 401 : allowed.includes(candidate) ? 400 : 403, String(candidate));
    }
  });
}
for (const [moduleName, staff, called] of [['local-road', 'encoder', 'project'], ['maintenance', 'encoder', 'maintenance'], ['inspections', 'inspector', 'inspection']]) {
  test(`${moduleName} deletion archives for permitted roles and rejects others`, async () => {
    for (const candidate of ['head_engineer', 'encoder', 'inspector', 'validator']) {
      role = candidate; calls = [];
      const result = await routes[moduleName].DELETE(request({ id: 'x' }, 'id=x'));
      assert.equal(result.status, candidate === 'head_engineer' || candidate === staff ? 200 : 403);
      assert.deepEqual(calls, candidate === 'head_engineer' || candidate === staff ? [called] : []);
    }
    role = staff; calls = [];
    assert.equal((await routes[moduleName].DELETE(request({ id: 'x' }, 'id=x&permanent=true'))).status, 403);
    assert.deepEqual(calls, []);
  });
}
test('Head Engineer cannot create or edit even with valid-looking payloads', async () => {
  role = 'head_engineer';
  for (const [moduleName, method, body] of [
    ['local-road', 'POST', { projectName: 'New project', location: 'Town' }],
    ['local-road', 'PATCH', { id: 'p', projectName: 'Changed' }],
    ['maintenance', 'POST', { localRoadId: 'p', type: 'Routine' }],
    ['maintenance', 'PATCH', { id: 'm', localRoadId: 'p', type: 'Routine', scheduledDate: '2026-01-01', description: 'Changed', cost: 1 }],
    ['inspections', 'POST', { localRoadId: 'p', remarks: 'New' }],
    ['inspections', 'PUT', { id: 'i', localRoadId: 'p', remarks: 'Changed' }],
  ]) {
    assert.equal((await routes[moduleName][method](request(body))).status, 403, `${moduleName} ${method}`);
  }
});

test('Head Engineer deleting an inspection does not call the project-edit path', async () => {
  role = 'head_engineer'; calls = [];
  const originalList = data.listRoads;
  data.listRoads = async () => [{ id: 'road' }];
  data.saveRoad = async () => { calls.push('project-edit'); };
  try {
    assert.equal((await routes.inspections.DELETE(request({}, 'id=x'))).status, 200);
    assert.deepEqual(calls, ['inspection']);
  } finally {
    data.listRoads = originalList;
    delete data.saveRoad;
  }
});

test('validator can only send validation fields; head engineer cannot edit projects', async () => {
  role = 'validator';
  assert.equal((await routes['local-road'].PATCH(request({ id: 'x', validationResult: 'Validated', projectName: 'tampered' }))).status, 403);
  assert.equal((await routes['local-road'].PATCH(request({ id: 'x', validationResult: 'Validated', validationRemarks: 'OK' }))).status, 404);
  role = 'head_engineer';
  assert.equal((await routes['local-road'].PATCH(request({ id: 'x' }))).status, 403);
  role = 'encoder';
  assert.equal((await routes['local-road'].PATCH(request({ id: 'x', validationResult: 'Validated' }))).status, 403);
  assert.equal((await routes['local-road'].POST(request({ validationResult: 'Validated' }))).status, 403);
});

const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
const ui = new Proxy({}, { get: () => Dummy });
const componentMocks = {
  './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
  '@/lib/activity-log-client': { recordClientActivity() {} },
  '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
  '@/lib/project-form-validation': loadTs('src/lib/project-form-validation.ts', {}),
  '@/lib/attachment-validation': loadTs('src/lib/attachment-validation.ts', {}),
  '@/lib/project-form-validation': loadTs('src/lib/project-form-validation.ts', {}),
  '@/lib/inspection-selection': loadTs('src/lib/inspection-selection.ts', {}),
};
const noop = () => {};
const project = { id: 'p', name: 'Road', projectName: 'Road', type: 'Road', location: 'Town', dateBuilt: '', condition: 'Good' };
const maintenance = { id: 'm', localRoadId: 'p', localRoadName: 'Road', type: 'Routine', scheduledDate: '2026-01-01', status: 'Scheduled', cost: 0, description: '' };
const inspection = { id: 'i', localRoadId: 'p', localRoadName: 'Road', date: '2026-01-01', conditionRating: 8, remarks: '', inspector: 'Inspector' };
const cases = [
  ['LocalRoadList', { data: [project], onAdd: noop, onEdit: noop, onDelete: noop }, 'Staff - Encoder', /Add Local Road|Add Project/, /Edit Road/, /Delete Road/],
  ['MaintenanceModule', { maintenanceRecords: [maintenance], localRoadList: [project], inspections: [], onAddMaintenance: noop, onEditMaintenance: noop, onDeleteMaintenance: noop, onUpdateStatus: noop }, 'Staff - Encoder', /Schedule Maintenance/, /Edit maintenance record/, /Delete maintenance record/],
  ['InspectionModule', { inspections: [inspection], localRoadList: [project], onAddInspection: noop, onEditInspection: noop, onDeleteInspection: noop }, 'Staff - Inspector', /Add Inspection/, /Edit inspection/, /Delete inspection/],
];
for (const [name, props, staff, addPattern, editPattern, deletePattern] of cases) {
  test(`${name} renders staff CRUD and head engineer read/delete controls`, () => {
    const Component = loadTs(`src/app/components/${name}.tsx`, componentMocks)[name];
    const render = (userRole) => renderToStaticMarkup(React.createElement(Component, { ...props, userRole, currentUser: 'User' }));
    const staffHtml = render(staff), headHtml = render('Head Engineer');
    if (name === 'InspectionModule') assert.doesNotMatch(staffHtml, addPattern); else assert.match(staffHtml, addPattern); assert.match(staffHtml, editPattern); assert.match(staffHtml, deletePattern);
    assert.doesNotMatch(headHtml, addPattern); assert.doesNotMatch(headHtml, editPattern); assert.match(headHtml, deletePattern);
    // Buttons stay accessible while their visible content is only an icon.
    for (const html of [staffHtml, headHtml]) {
      const deleteButton = html.match(/<button\b[^>]*aria-label="Delete [^"]+"[^>]*>.*?<\/button>/)?.[0];
      assert.ok(deleteButton); assert.match(deleteButton, /hover:text-red-700/);
      assert.doesNotMatch(deleteButton, />\s*Delete\s*<\/button>/);
    }
    const editButton = staffHtml.match(/<button\b[^>]*aria-label="Edit [^"]+"[^>]*>.*?<\/button>/)?.[0];
    assert.ok(editButton); assert.match(editButton, /hover:text-blue-700/);
    assert.doesNotMatch(editButton, />\s*Edit\s*<\/button>/);
  });
}


test('deferred maintenance has an icon-only Continue control', () => {
  const Component = loadTs('src/app/components/MaintenanceModule.tsx', componentMocks).MaintenanceModule;
  const props = { maintenanceRecords: [{ ...maintenance, status: 'Deferred' }], localRoadList: [project], inspections: [], onAddMaintenance: noop, onEditMaintenance: noop, onDeleteMaintenance: noop, onUpdateStatus: noop, userRole: 'Staff - Encoder', currentUser: 'User' };
  const html = renderToStaticMarkup(React.createElement(Component, props));
  const button = html.match(/<button\b[^>]*aria-label="Continue maintenance for Road"[^>]*>.*?<\/button>/)?.[0];
  assert.ok(button); assert.match(button, /hover:text-blue-700/);
  assert.doesNotMatch(button, />\s*Continue\s*<\/button>/);
});

test('inspection cards retain details access without a separate Details button', () => {
  const Component = loadTs('src/app/components/InspectionModule.tsx', componentMocks).InspectionModule;
  const props = { inspections: [inspection], localRoadList: [project], onAddInspection: noop, onEditInspection: noop, onDeleteInspection: noop, userRole: 'Staff - Inspector', currentUser: 'User' };
  const html = renderToStaticMarkup(React.createElement(Component, props));
  assert.match(html, /title="Click to view full inspection details"/);
  assert.doesNotMatch(html, />Details\s*<\/button>/);
});

test('project and inspection APIs reject dates before 2000, invalid dates, and five-digit years', async () => {
  for (const date of ['1999-12-31', '2026-02-30', '10000-01-01']) {
    role = 'encoder';
    assert.equal((await routes['local-road'].POST(request({ dateStarted: date }))).status, 400);
    assert.equal((await routes['local-road'].PATCH(request({ id: 'p', actualCompletionDate: date }))).status, 400);
    role = 'inspector';
    assert.equal((await routes.inspections.POST(request({ localRoadId: 'p', date }))).status, 400);
    assert.equal((await routes.inspections.PUT(request({ id: 'i', localRoadId: 'p', date }))).status, 400);
  }
});

test('maintenance scheduling checks newest completed inspection and rejects already scheduled links', async () => {
  const old = { listRoads: data.listRoads, listInspections: data.listInspections, listMaintenance: data.listMaintenance, listArchivedMaintenance: data.listArchivedMaintenance, saveMaintenance: data.saveMaintenance };
  try {
    role = 'encoder';
    data.listRoads = async () => [{id:'p'}];
    data.listInspections = async () => [{id:'i', localRoadId:'p', date:'2026-01-01', conditionRatings: {Concrete:'Fair'}}];
    data.listMaintenance = async () => [];
    data.listArchivedMaintenance = async () => [];
    data.saveMaintenance = async (_db, payload) => ({...payload, id:'m'});
    const body = {localRoadId:'p', inspectionId:'i', type:'Corrective Type', scheduledDate:'2026-01-01', cost:0, description:'Repair', remarks:'Needs repair'};
    assert.equal((await routes.maintenance.POST(request(body))).status, 200);
    data.listArchivedMaintenance = async () => [{id:'m', inspectionId:'i'}];
    assert.equal((await routes.maintenance.POST(request(body))).status, 409);
    data.listArchivedMaintenance = async () => [];
    data.listInspections = async () => [{id:'i', localRoadId:'p', date:'2026-01-01', conditionRatings:{Concrete:'Good'}}];
    assert.equal((await routes.maintenance.POST(request(body))).status, 409);
  } finally { Object.assign(data, old); }
});

test('completed maintenance cannot be deferred via API', async () => {
  const old = data.listMaintenance;
  try {
    role = 'encoder'; data.listMaintenance = async () => [{id:'m', localRoadId:'p', status:'Completed'}];
    assert.equal((await routes.maintenance.PATCH(request({id:'m', status:'Deferred'}))).status, 409);
  } finally { data.listMaintenance = old; }
});

test('inspector can record a pending follow-up through the role-checked server client', async () => {
  const old = { listRoads:data.listRoads, listInspections:data.listInspections, saveInspection:data.saveInspection, saveRoad:data.saveRoad };
  try {
    role = 'inspector';
    data.listRoads = async () => [{id:'p'}];
    data.listInspections = async () => [{id:'i', localRoadId:'p', annualFollowUpYear:2027}];
    let usedDb, sent;
    data.saveInspection = async (db, payload) => {usedDb=db; sent=payload; return {...payload};};
    data.saveRoad = async (_db, road) => road;
    const labels = loadTs('src/lib/inspection-selection.ts', {}).assessmentComponents;
    const conditionRatings = Object.fromEntries(labels.map(label => [label, label === 'Concrete' ? 'Fair' : 'N/A']));
    const response = await routes.inspections.PUT(request({id:'i',localRoadId:'p', date:'2026-12-15', annualFollowUpYear:9999, inspectionType:'Monitoring and Maintenance Inspection', conditionRatings, conditionRemarks:{Concrete:'Cracks'}, conditionAttachments:{Concrete:[{stored:true}]}}));
    assert.equal(response.status, 200); assert.deepEqual(usedDb, auth().admin); assert.equal(sent.annualFollowUpYear, 2027); assert.equal(sent.remarks, 'Cracks.');
  } finally { Object.assign(data, old); }
});

test('maintenance editing keeps remarks separate from activities', async () => {
  const old = { listMaintenance:data.listMaintenance, listRoads:data.listRoads, saveMaintenance:data.saveMaintenance };
  try {
    role = 'encoder';
    data.listMaintenance = async () => [{id:'m', localRoadId:'p', status:'Scheduled', inspectionId:'i', remarks:'Old'}];
    data.listRoads = async () => [{id:'p'}];
    let saved;
    data.saveMaintenance = async (_db, payload) => (saved=payload);
    const result = await routes.maintenance.PATCH(request({id:'m',localRoadId:'p', type:'Corrective Type', scheduledDate:'2026-02-01', cost:0, description:'Repair', remarks:'Needs traffic signs'}));
    assert.equal(result.status, 200); assert.equal(saved.description, 'Repair'); assert.equal(saved.remarks, 'Needs traffic signs'); assert.equal(saved.inspectionId,'i');
  } finally { Object.assign(data, old); }
});

test('maintenance remarks are required for creation and full edits, but not status-only updates', async () => {
  role = 'encoder';
  assert.equal((await routes.maintenance.POST(request({localRoadId:'p',inspectionId:'i',remarks:'  '}))).status, 400);
  const old = data.listMaintenance;
  try {
    data.listMaintenance = async () => [{id:'m', localRoadId:'p', status:'Scheduled'}];
    assert.equal((await routes.maintenance.PATCH(request({id:'m',localRoadId:'p',type:'Corrective Type',scheduledDate:'2026-01-01',description:'Repair',cost:0,remarks:''}))).status, 400);
  } finally { data.listMaintenance = old; }
});
