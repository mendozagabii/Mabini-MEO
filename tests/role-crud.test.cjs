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
const mocks = { '@/lib/project-form-validation': loadTs('src/lib/project-form-validation.ts', {}), '@/lib/inspection-selection': loadTs('src/lib/inspection-selection.ts', {}), '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts', {}), '@/lib/notifications': { notifyWorkflow: async () => ({ sent: 0, recipients: [] }), actionNote: () => '', automaticNote: () => '' }, '@/lib/api': api, '@/lib/supabase-data': data, 'next/server': { NextResponse: { json: (body, init) => response(init?.status ?? 200, body) } } };
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
for (const [moduleName, called, permanentFn] of [['local-road', 'project', 'permanentlyDeleteRoad'], ['maintenance', 'maintenance', 'permanentlyDeleteMaintenance'], ['inspections', 'inspection', 'permanentlyDeleteInspection']]) {
  test(`${moduleName} archiving and permanent deletion are restricted to Head Engineer`, async () => {
    data[permanentFn] = async () => (calls.push('permanent'), true);
    try {
      for (const candidate of [null, 'head_engineer', 'encoder', 'inspector', 'validator']) {
        for (const permanent of [false, true]) {
          role = candidate; calls = [];
          const result = await routes[moduleName].DELETE(request({ id: 'x' }, `id=x${permanent ? '&permanent=true' : ''}`));
          assert.equal(result.status, !candidate ? 401 : candidate === 'head_engineer' ? 200 : 403, `${candidate} permanent=${permanent}`);
          assert.deepEqual(calls, candidate === 'head_engineer' ? [permanent ? 'permanent' : called] : []);
        }
      }
    } finally { delete data[permanentFn]; }
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
  data.listRoads = async () => [{ id: 'road', inspectorId: 'test' }];
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
  ['MaintenanceModule', { maintenanceRecords: [{...maintenance, status:'In Progress'}], localRoadList: [project], inspections: [], onAddMaintenance: noop, onEditMaintenance: noop, onDeleteMaintenance: noop, onUpdateStatus: noop }, 'Staff - Encoder', /Schedule Maintenance/, /Edit maintenance record/, /Delete maintenance record/],
  ['InspectionModule', { inspections: [inspection], localRoadList: [project], onAddInspection: noop, onEditInspection: noop, onDeleteInspection: noop }, 'Staff - Inspector', /Add Inspection/, /Edit inspection/, /Delete inspection/],
];
for (const [name, props, staff, addPattern, editPattern, deletePattern] of cases) {
  test(`${name} renders staff add/edit and head engineer read/delete controls`, () => {
    const Component = loadTs(`src/app/components/${name}.tsx`, componentMocks)[name];
    const render = (userRole) => renderToStaticMarkup(React.createElement(Component, { ...props, userRole, currentUser: 'User' }));
    const staffHtml = render(staff), headHtml = render('Head Engineer');
    if (name === 'InspectionModule') assert.doesNotMatch(staffHtml, addPattern); else assert.match(staffHtml, addPattern); assert.match(staffHtml, editPattern); assert.doesNotMatch(staffHtml, deletePattern);
    assert.doesNotMatch(headHtml, addPattern); assert.doesNotMatch(headHtml, editPattern); assert.match(headHtml, deletePattern);
    for (const role of ['Staff - Encoder', 'Staff - Inspector', 'Staff - Validator', '']) assert.doesNotMatch(render(role), deletePattern);
    // Buttons stay accessible while their visible content is only an icon.
    for (const html of [headHtml, render('Admin')]) {
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
    data.listRoads = async () => [{id:'p',inspectorId:'test'}];
    data.listInspections = async () => [{id:'i', localRoadId:'p', date:'2026-01-01', conditionRatings: {Concrete:'Fair'}}];
    data.listMaintenance = async () => [];
    data.listArchivedMaintenance = async () => [];
    data.saveMaintenance = async (_db, payload) => ({...payload, id:'m'});
    const body = {localRoadId:'p', inspectionId:'i', type:'Corrective Type', scheduledDate:'2026-01-08', cost:0, description:'Repair', remarks:'Needs repair'};
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
    data.listRoads = async () => [{id:'p',actualCompletionDate:'2026-01-01',inspectorId:'test'}];
    data.listInspections = async () => [{id:'i', localRoadId:'p', date:'2026-12-15',annualFollowUpYear:2027}];
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
  const old = { listMaintenance:data.listMaintenance, listRoads:data.listRoads, listInspections:data.listInspections, saveMaintenance:data.saveMaintenance };
  try {
    role = 'encoder';
    data.listMaintenance = async () => [{id:'m', localRoadId:'p', status:'In Progress', inspectionId:'i', remarks:'Old'}];
    data.listRoads = async () => [{id:'p',inspectorId:'test'}];
    data.listInspections = async () => [{id:'i',localRoadId:'p',date:'2025-12-01'}];
    let saved;
    data.saveMaintenance = async (_db, payload) => (saved=payload);
    const result = await routes.maintenance.PATCH(request({id:'m',localRoadId:'p', type:'Corrective Type', dateStarted:'2026-01-01', scheduledDate:'2026-02-01', cost:0, description:'Repair', remarks:'Needs traffic signs'}));
    assert.equal(result.status, 200); assert.equal(saved.description, 'Repair'); assert.equal(saved.remarks, 'Needs traffic signs'); assert.equal(saved.inspectionId,'i');
  } finally { Object.assign(data, old); }
});

test('maintenance remarks are required for full edits', async () => {
  role = 'encoder';
  assert.equal((await routes.maintenance.POST(request({localRoadId:'p',inspectionId:'i',remarks:'  '}))).status, 400);
  const old = data.listMaintenance;
  try {
    data.listMaintenance = async () => [{id:'m', localRoadId:'p', status:'In Progress'}];
    assert.equal((await routes.maintenance.PATCH(request({id:'m',localRoadId:'p',type:'Corrective Type',scheduledDate:'2026-01-01',description:'Repair',cost:0,remarks:''}))).status, 400);
  } finally { data.listMaintenance = old; }
});

test('maintenance completion date rejects years before 2000 and invalid dates on create and edit', async () => {
  role = 'encoder';
  const old = {listRoads:data.listRoads,listInspections:data.listInspections,listArchivedInspections:data.listArchivedInspections,listMaintenance:data.listMaintenance,listArchivedMaintenance:data.listArchivedMaintenance,saveMaintenance:data.saveMaintenance};
  try {
    data.listRoads = async () => [{id:'p',inspectorId:'test'}];
    data.listInspections = async () => [{id:'i',localRoadId:'p',date:'2026-01-01',conditionRatings:{Concrete:'Fair'}}];
    data.listArchivedInspections = async () => []; data.listArchivedMaintenance = async () => [];
    data.listMaintenance = async () => [{id:'m',localRoadId:'p',status:'In Progress'}];
    data.saveMaintenance = async (_db, value) => ({...value,id:'m'});
    const body = {localRoadId:'p',inspectionId:'i',type:'Corrective Type',dateStarted:'2026-01-08',cost:0,description:'Repair',remarks:'Needed'};
    for (const date of ['1999-12-31','2025-02-29','10000-01-01']) {
      assert.equal((await routes.maintenance.POST(request({...body,scheduledDate:date}))).status,400);
      assert.equal((await routes.maintenance.PATCH(request({...body,id:'m',scheduledDate:date}))).status,400);
      assert.equal((await routes.maintenance.PATCH(request({id:'m',status:'Completed',completedDate:date}))).status,400);
    }
    assert.equal((await routes.maintenance.POST(request({...body,scheduledDate:'2026-01-08'}))).status,200);
    assert.equal((await routes.maintenance.PATCH(request({...body,id:'m',scheduledDate:'2000-01-01'}))).status,200);
  } finally {Object.assign(data,old);}
});

test('maintenance scheduling accepts any single fair, bad or poor component and rejects a linked schedule', async () => {
  const old = {listRoads:data.listRoads,listInspections:data.listInspections,listArchivedInspections:data.listArchivedInspections,listMaintenance:data.listMaintenance,listArchivedMaintenance:data.listArchivedMaintenance,saveMaintenance:data.saveMaintenance};
  try {
    role='encoder'; data.listRoads=async()=>[{id:'p',inspectorId:'test'}]; data.listArchivedInspections=async()=>[]; data.listMaintenance=async()=>[]; data.listArchivedMaintenance=async()=>[];
    data.saveMaintenance=async(_db,payload)=>({...payload,id:'m'});
    const body={localRoadId:'p',inspectionId:'i',type:'Corrective Type',scheduledDate:'2026-01-08',cost:0,description:'Repair',remarks:'Required'};
    for (const rating of ['Fair','Bad','Poor']) {
      data.listInspections=async()=>[{id:'i',localRoadId:'p',date:'2026-01-01',conditionRatings:{Concrete:'Good',Drainage:rating}}];
      assert.equal((await routes.maintenance.POST(request(body))).status,200,rating);
      data.listMaintenance=async()=>[{id:'m',inspectionId:'i'}];
      assert.equal((await routes.maintenance.POST(request(body))).status,409,rating);
      data.listMaintenance=async()=>[];
    }
    data.listInspections=async()=>[{id:'i',localRoadId:'p',date:'2026-01-01',conditionRatings:{Concrete:'Good',Drainage:'N/A'}}];
    assert.equal((await routes.maintenance.POST(request(body))).status,409);
  } finally {Object.assign(data,old);}
});

test('maintenance schedule permits empty details, locks edits until start or continue, and requires details before completion', async () => {
  const old={listRoads:data.listRoads,listInspections:data.listInspections,listArchivedInspections:data.listArchivedInspections,listMaintenance:data.listMaintenance,listArchivedMaintenance:data.listArchivedMaintenance,saveMaintenance:data.saveMaintenance};
  try {
    role='encoder'; data.listRoads=async()=>[{id:'p',inspectorId:'test'}]; data.listInspections=async()=>[{id:'i',localRoadId:'p',date:'2026-01-01',conditionRatings:{Concrete:'Fair'}}];
    data.listArchivedInspections=async()=>[]; data.listArchivedMaintenance=async()=>[];
    let current={id:'m',localRoadId:'p',status:'Scheduled',type:'Corrective Type',scheduledDate:'',dateStarted:'',description:'',remarks:''};
    data.listMaintenance=async()=>[current]; data.saveMaintenance=async(_db,payload)=>{current={...payload,id:'m'};return current};
    assert.equal((await routes.maintenance.POST(request({localRoadId:'p',inspectionId:'i',type:'Corrective Type'}))).status,200);
    const edit={id:'m',localRoadId:'p',type:'Corrective Type',dateStarted:'2026-01-08',scheduledDate:'2026-03-01',description:'Repair',remarks:'Needed',cost:0};
    assert.equal((await routes.maintenance.PATCH(request(edit))).status,409);
    assert.equal((await routes.maintenance.PATCH(request({id:'m',status:'In Progress'}))).status,200);
    assert.equal((await routes.maintenance.PATCH(request({id:'m',status:'Completed'}))).status,409);
    assert.equal((await routes.maintenance.PATCH(request({id:'m',status:'Deferred'}))).status,200);
    assert.equal((await routes.maintenance.PATCH(request(edit))).status,409);
    assert.equal((await routes.maintenance.PATCH(request({id:'m',status:'In Progress'}))).status,200);
    assert.equal((await routes.maintenance.PATCH(request(edit))).status,200);
    assert.equal(current.dateStarted,'2026-01-08');
    assert.equal((await routes.maintenance.PATCH(request({id:'m',status:'Completed',completedDate:'2026-03-01'}))).status,200);
  } finally {Object.assign(data,old);}
});

test('maintenance actions are icon-only, edit is gated by status, and unfinished cards hide dates', () => {
  const Component=loadTs('src/app/components/MaintenanceModule.tsx',componentMocks).MaintenanceModule;
  for (const [status, visible, hidden] of [['Scheduled',['Start','Defer'],['Edit','Complete']],['Deferred',['Continue'],['Edit','Complete']],['In Progress',['Edit','Complete','Defer'],['Start','Continue']],['Completed',['Edit'],['Start','Continue','Complete','Defer']]]) {
    const html=renderToStaticMarkup(React.createElement(Component,{maintenanceRecords:[{...maintenance,status,scheduledDate:'2026-05-17'}],localRoadList:[project],inspections:[],onAddMaintenance:noop,onEditMaintenance:noop,onDeleteMaintenance:noop,onUpdateStatus:noop,userRole:'Staff - Encoder',currentUser:'User'}));
    for (const action of visible) assert.match(html,new RegExp(`aria-label="${action} maintenance`));
    for (const action of hidden) assert.doesNotMatch(html,new RegExp(`aria-label="${action} maintenance`));
    if (status !== 'Completed') assert.doesNotMatch(html,/2026-05-17/);
  }
});

test('inspection create and edit are dated no earlier than 29 days before the anniversary', async () => {
  const old={listRoads:data.listRoads,listInspections:data.listInspections,listMaintenance:data.listMaintenance,listArchivedMaintenance:data.listArchivedMaintenance,saveInspection:data.saveInspection,saveRoad:data.saveRoad};
  try {
    role='inspector'; data.listRoads=async()=>[{id:'p',actualCompletionDate:'2025-03-31',inspectorId:'test'}];
    data.listInspections=async()=>[{id:'i',localRoadId:'p',date:'2026-02-28'}];
    data.listMaintenance=async()=>[]; data.listArchivedMaintenance=async()=>[];
    data.saveInspection=async(_db,payload)=>payload; data.saveRoad=async(_db,road)=>road;
    const labels=loadTs('src/lib/inspection-selection.ts',{}).assessmentComponents;
    const conditionRatings=Object.fromEntries(labels.map(label=>[label,label==='Concrete'?'Fair':'N/A']));
    const body={id:'i',localRoadId:'p',inspectionType:'Monitoring and Maintenance Inspection',conditionRatings,conditionRemarks:{Concrete:'Crack'},conditionAttachments:{Concrete:[{stored:true}]}};
    for (const method of ['POST','PUT']) {
      const invalid = await routes.inspections[method](request({...body,date:'2026-03-01'}));
      assert.equal(invalid.status,400); assert.equal(invalid.body.message,'Please fill out valid date.');
      // 31 March 2026 anniversary − 29 days = 2 March 2026, exact days rather than +11 months.
      assert.equal((await routes.inspections[method](request({...body,date:'2026-03-02'}))).status,200);
    }
    data.listRoads=async()=>[{id:'p',inspectorId:'test'}];
    assert.equal((await routes.inspections.PUT(request({...body,date:'2026-03-02'}))).status,400);
  } finally {Object.assign(data,old);}
});

test('maintenance dates use linked inspection plus one day, including archived links, while unlinked records are exempt', async () => {
  const old={listRoads:data.listRoads,listInspections:data.listInspections,listArchivedInspections:data.listArchivedInspections,listMaintenance:data.listMaintenance,listArchivedMaintenance:data.listArchivedMaintenance,saveMaintenance:data.saveMaintenance};
  try {
    role='encoder'; data.listRoads=async()=>[{id:'p',inspectorId:'test'}];
    const inspection={id:'i',localRoadId:'p',date:'2026-01-01',conditionRatings:{Concrete:'Fair'}};
    data.listInspections=async()=>[inspection]; data.listArchivedInspections=async()=>[]; data.listMaintenance=async()=>[]; data.listArchivedMaintenance=async()=>[];
    data.saveMaintenance=async(_db,payload)=>({...payload,id:'m'});
    const body={localRoadId:'p',inspectionId:'i',type:'Corrective Maintenance',description:'Repair',remarks:'Needed',cost:0};
    for (const field of ['dateStarted','scheduledDate']) {
      const invalid = await routes.maintenance.POST(request({...body,[field]:'2026-01-01'}));
      assert.equal(invalid.status,400); assert.equal(invalid.body.message,'Please fill out valid date.');
      assert.equal((await routes.maintenance.POST(request({...body,[field]:'2026-01-02'}))).status,200);
    }
    data.listMaintenance=async()=>[{id:'m',localRoadId:'p',status:'In Progress',inspectionId:'i'}];
    data.listInspections=async()=>[]; data.listArchivedInspections=async()=>[inspection];
    const edit={...body,id:'m',dateStarted:'2026-01-02',scheduledDate:'2026-01-02'};
    assert.equal((await routes.maintenance.PATCH(request({...edit,dateStarted:'2026-01-01'}))).status,400);
    assert.equal((await routes.maintenance.PATCH(request({...edit,scheduledDate:'2026-01-01'}))).status,400);
    assert.equal((await routes.maintenance.PATCH(request(edit))).status,200);
    data.listArchivedInspections=async()=>[];
    assert.equal((await routes.maintenance.PATCH(request(edit))).status,409);
    data.listMaintenance=async()=>[{id:'m',localRoadId:'p',status:'In Progress'}];
    assert.equal((await routes.maintenance.PATCH(request({...edit,dateStarted:'2000-01-01',scheduledDate:'2000-01-01'}))).status,200);
  } finally {Object.assign(data,old);}
});

test('inspection date edits cannot invalidate dates on linked maintenance, including archived records', async () => {
  const old={listRoads:data.listRoads,listInspections:data.listInspections,listMaintenance:data.listMaintenance,listArchivedMaintenance:data.listArchivedMaintenance,saveInspection:data.saveInspection,saveRoad:data.saveRoad};
  try {
    role='inspector'; data.listRoads=async()=>[{id:'p',actualCompletionDate:'2024-01-01',inspectorId:'test'}];
    data.listInspections=async()=>[{id:'i',localRoadId:'p',date:'2025-01-01'}];
    data.listMaintenance=async()=>[]; data.listArchivedMaintenance=async()=>[{inspectionId:'i',dateStarted:'2025-01-08',scheduledDate:'2025-03-01'}];
    data.saveInspection=async(_db,payload)=>payload; data.saveRoad=async(_db,road)=>road;
    const labels=loadTs('src/lib/inspection-selection.ts',{}).assessmentComponents;
    const conditionRatings=Object.fromEntries(labels.map(label=>[label,label==='Concrete'?'Fair':'N/A']));
    const body={id:'i',localRoadId:'p',inspectionType:'Monitoring and Maintenance Inspection',conditionRatings,conditionRemarks:{Concrete:'Crack'},conditionAttachments:{Concrete:[{stored:true}]}};
    assert.equal((await routes.inspections.PUT(request({...body,date:'2025-01-08'}))).status,409);
    assert.equal((await routes.inspections.PUT(request({...body,date:'2025-01-07'}))).status,200);
  } finally {Object.assign(data,old);}
});

test('maintenance cards show the linked inspection date in both positions until completed', () => {
  const Component = loadTs('src/app/components/MaintenanceModule.tsx', componentMocks).MaintenanceModule;
  const linked = {id:'i',localRoadId:'p',date:'2026-02-11'};
  for (const status of ['Scheduled','In Progress','Deferred','Completed']) {
    for (const archived of [false,true]) {
      const record = {...maintenance, status, inspectionId:'i', scheduledDate:'2026-03-01', completedDate:'2026-04-01'};
      const html = renderToStaticMarkup(React.createElement(Component, {maintenanceRecords:[record],localRoadList:[project],inspections:archived?[]:[linked],scheduledArchivedInspections:archived?[linked]:[],onAddMaintenance:noop,onEditMaintenance:noop,onDeleteMaintenance:noop,onUpdateStatus:noop,userRole:'Staff - Encoder',currentUser:'User'}));
      if (status === 'Completed') { assert.match(html,/Completed: 2026-04-01/); assert.equal((html.match(/2026-04-01/g)||[]).length,2); assert.doesNotMatch(html,/Inspection: 2026-02-11/); }
      else { assert.match(html,/Inspection: 2026-02-11/); assert.equal((html.match(/2026-02-11/g)||[]).length,2); assert.doesNotMatch(html,/2026-04-01/); }
    }
  }
  const html = renderToStaticMarkup(React.createElement(Component,{maintenanceRecords:[maintenance],localRoadList:[project],inspections:[],onAddMaintenance:noop,onEditMaintenance:noop,onDeleteMaintenance:noop,onUpdateStatus:noop,userRole:'Staff - Encoder',currentUser:'User'}));
  assert.doesNotMatch(html,/Inspection: /);
});
