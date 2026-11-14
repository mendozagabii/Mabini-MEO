// @mine — step 9: PCAB License No., Completion Percentage and Actual Project Cost are
// exported once, hidden everywhere, and dropped last (WORKFLOW-DECISIONS B6).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
Object.assign(global, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLElement.prototype.scrollTo = function () {};
const React = require('react');
const { act } = require('react-dom/test-utils');
const { createRoot } = require('react-dom/client');
const container = document.getElementById('root');
const root = createRoot(container);
after(() => { act(() => root.unmount()); dom.window.close(); });

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = (name) => name === './FilterControls' ? { DateCalendarButton: () => null, StyledFilterSelect: () => null } : Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(code, filename);
  return mod.exports;
}

const retired = load('src/lib/retired-fields.ts');

test('the CSV names every column and quotes what needs quoting', () => {
  const csv = retired.retiredFieldsCsv([
    { id: 'p1', projectName: 'Poblacion Road', contractorName: 'ABC Builders', pcabLicenseNo: 'PCAB-1234', completionPercentage: '100', adjustedProjectCost: '1250000.5', archived: false },
    { id: 'p2', projectName: 'Dao, Anilao Road', contractorName: 'Del "Sur" Works', pcabLicenseNo: '', completionPercentage: '', adjustedProjectCost: '', archived: true },
  ]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Project ID,Project Name,Contractor,PCAB License No.,Completion Percentage,Actual Project Cost,Archived');
  assert.equal(lines[1], 'p1,Poblacion Road,ABC Builders,PCAB-1234,100,1250000.5,No');
  assert.equal(lines[2], 'p2,"Dao, Anilao Road","Del ""Sur"" Works",,,,Yes');
  assert.equal(lines[3], '');
  assert.equal(csv.endsWith('\r\n'), true);
  assert.equal(retired.retiredFieldsFileName(new Date('2026-11-12T01:02:03Z')), 'retired-project-fields-2026-11-12.csv');
});

test('the export is Head Engineer only and includes archived projects', async () => {
  const res = (status, body = {}) => ({ status, body });
  const logs = [];
  let role = 'head_engineer';
  let fail = false;
  const rows = [
    { id: 'p1', project_name: 'Poblacion Road', completion_percentage: 100, adjusted_project_cost: 1250000.5, archived_at: null, contractors: { name: 'ABC Builders', pcab_license_no: 'PCAB-1234' } },
    { id: 'p2', project_name: 'Dao Road', completion_percentage: null, adjusted_project_cost: null, archived_at: '2026-10-01T00:00:00Z', contractors: null },
  ];
  const query = {
    select: () => query,
    order: async () => (fail ? { data: null, error: new Error('offline') } : { data: rows, error: null }),
  };
  const route = load('src/app/api/local-road/retired-fields-export/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/api': {
      requireRole: async (_request, roles) => (roles.includes(role)
        ? { auth: { profile: { roleDb: role, username: 'Head' }, admin: { from: () => query }, db: {}, userId: 'u' } }
        : { denied: res(403) }),
    },
    '@/lib/supabase-data': { addActivityLog: async (_admin, entry) => { logs.push(entry); } },
    '@/lib/retired-fields': retired,
  });
  const request = { url: 'https://example.test/api/local-road/retired-fields-export' };

  for (const other of ['encoder', 'validator', 'inspector']) {
    role = other;
    assert.equal((await route.GET(request)).status, 403, other);
  }

  role = 'head_engineer';
  const response = await route.GET(request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /text\/csv/);
  assert.match(response.headers.get('Content-Disposition'), /attachment; filename="retired-project-fields-\d{4}-\d{2}-\d{2}\.csv"/);
  const csv = await response.text();
  assert.match(csv, /^Project ID,Project Name,Contractor,PCAB License No\./);
  assert.match(csv, /p1,Poblacion Road,ABC Builders,PCAB-1234,100,1250000\.5,No/);
  assert.match(csv, /p2,Dao Road,,,,,Yes/); // archived projects are kept in the export
  assert.equal(logs.at(-1).action, 'Retired Fields Exported');
  assert.match(logs.at(-1).details, /2 project/);

  fail = true;
  assert.equal((await route.GET(request)).status, 500);
});

const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
const ui = new Proxy({}, { get: () => Dummy });
const listMocks = () => ({
  './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
  '@/lib/activity-log-client': { recordClientActivity: async () => {} },
  '@/lib/project-validation-workflow': load('src/lib/project-validation-workflow.ts'),
  '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
});

const project = {
  id: 'p', name: 'Poblacion Road', projectName: 'Poblacion Road', roadNetworkId: 'RN-1',
  location: 'Sitio Dao\nAnilao East', locations: ['Sitio Dao', 'Anilao East'], barangay: 'Anilao East',
  dateBuilt: '2020-01-01', condition: 'Good',
  // the retired values are still present in the record until the columns are dropped
  pcadLicenseNo: 'PCAB-1234', completionPercentage: '75', adjustProjectCost: '900',
  appropriation: '1000', contractedAmount: '900',
};

test('step 9: the retired fields are gone from the detail view for every role', async () => {
  const { LocalRoadList } = load('src/app/components/LocalRoadList.tsx', listMocks());
  assert.equal(retired.retiredFieldsFileName.length > 0, true);
  for (const userRole of ['Head Engineer', 'Admin', 'Staff - Encoder', 'Staff - Inspector', 'Staff - Validator']) {
    await act(async () => root.render(null));
    await act(async () => root.render(React.createElement(LocalRoadList, { data: [project], currentUser: 'User', userRole, onAdd() {}, onEdit() {}, onDelete() {} })));
    await act(async () => container.querySelector('[aria-label="View details for Poblacion Road"]').click());
    assert.doesNotMatch(container.textContent, /Actual Project Cost/, userRole);
    assert.doesNotMatch(container.textContent, /Completion Percentage/, userRole);
    assert.doesNotMatch(container.textContent, /PCAB License No\./, userRole);
    assert.doesNotMatch(container.textContent, /PCAB-1234/, userRole);
    // what the office kept is still there
    assert.match(container.textContent, /Contracted Amount/);
    await act(async () => root.render(null));
  }
});

test('retired-field export button is absent from normal project management', async () => {
  const { LocalRoadList } = load('src/app/components/LocalRoadList.tsx', listMocks());
  const render = async (userRole) => {
    await act(async () => root.render(null));
    await act(async () => root.render(React.createElement(LocalRoadList, { data: [project], currentUser: 'User', userRole, onAdd() {}, onEdit() {}, onDelete() {} })));
  };
  await render('Head Engineer');
  assert.equal(container.querySelector('[aria-label="Download the retired project fields as CSV"]'), null);
  for (const userRole of ['Admin', 'Staff - Encoder', 'Staff - Validator', 'Staff - Inspector']) {
    await render(userRole);
    assert.equal(container.querySelector('[aria-label="Download the retired project fields as CSV"]'), null, userRole);
  }
  // the validation table is not the place for it either
  await act(async () => root.render(null));
  await act(async () => root.render(React.createElement(LocalRoadList, { data: [project], currentUser: 'User', userRole: 'Head Engineer', validationMode: true, onAdd() {}, onEdit() {}, onDelete() {} })));
  assert.equal(container.querySelector('[aria-label="Download the retired project fields as CSV"]'), null);
  await act(async () => root.render(null));
});

test('step 9: the drop is written down but not applied', () => {
  const file = path.resolve(__dirname, '../supabase/migrations/20261116_drop_retired_project_fields.sql');
  const sql = fs.readFileSync(file, 'utf8');
  for (const column of ['completion_percentage', 'adjusted_project_cost', 'pcab_license_no']) {
    assert.match(sql, new RegExp(`drop column if exists ${column}`), column);
  }
  // the view reads the projects columns, so it is rebuilt without them
  assert.match(sql, /drop view if exists public\.v_project_overview/);
  assert.match(sql, /create view public\.v_project_overview/);
  assert.doesNotMatch(sql, /completion_percentage,|adjusted_project_cost,/); // only references left are the rebuild's absence
  // the file must say it is the last step, after the export
  assert.match(sql, /Do not apply this until/i);
  assert.match(sql, /Retired fields \(CSV\)/);
});
