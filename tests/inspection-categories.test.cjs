// @mine — 2026-11-11: Local Road Condition Assessment categories, per-category remarks
// and attachments. Renders the real InspectionModule in an isolated DOM; no database calls.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
Object.assign(global, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLElement.prototype.scrollTo = function () {};

const React = require('react');
const { act } = require('react-dom/test-utils');
const { createRoot } = require('react-dom/client');

function loadTs(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = m.require.bind(m);
  m.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name));
  m._compile(code, filename);
  return m.exports;
}

const passthrough = (tag) => (props) => React.createElement(tag, { className: props.className, id: props.id, 'aria-label': props['aria-label'] }, props.children);
const mocks = {
  './ui/textarea': {
    AutoGrowTextarea: React.forwardRef((props, ref) => React.createElement('textarea', { ...props, ref })),
  },
  './ui/dialog': {
    Dialog: ({ children }) => React.createElement('div', null, children),
    DialogContent: passthrough('div'),
    DialogDescription: passthrough('p'),
    DialogTitle: passthrough('h2'),
  },
  './ui/select': {
    Select: ({ children }) => React.createElement('div', null, children),
    SelectTrigger: passthrough('button'),
    SelectValue: passthrough('span'),
    SelectContent: ({ children }) => React.createElement('div', null, children),
    SelectItem: passthrough('div'),
  },
  './ConfirmActionDialog': { ConfirmActionDialog: () => null },
  // @mine — task 14: capture what the overview print hands to the print document.
  './PrintDocument': { PrintDocument: props => { printedDocuments.push(props); return null; } },
  '@/lib/activity-log-client': { recordClientActivity: async () => {} },
  '@/lib/attachment-validation': loadTs('src/lib/attachment-validation.ts'),
  '@/lib/project-form-validation': loadTs('src/lib/project-form-validation.ts'),
  '@/lib/inspection-selection': loadTs('src/lib/inspection-selection.ts'),
};

const { inspectionCategories, InspectionModule } = loadTs('src/app/components/InspectionModule.tsx', mocks);

const printedDocuments = [];
const NEW_CATEGORIES = ['Drainage', 'Solar Lights', 'Slope Protection', 'Retaining Wall'];
const LEGACY_RATINGS = {
  Concrete: 'Good', Asphalt: 'Fair', Gravel: 'N/A', Earth: 'N/A',
  Shoulder: 'Good', 'Side Drain': 'Poor', Sidewalk: 'N/A',
};

function renderModule(inspections = [], role = 'Staff - Inspector') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = {
    inspections,
    localRoadList: [{ id: 'road-1', name: 'Poblacion Road', projectName: 'Poblacion Road' }],
    onAddInspection: () => {},
    onEditInspection: async () => true,
    onDeleteInspection: async () => true,
    currentUser: 'gabriel mendoza',
    userRole: role,
  };
  act(() => root.render(React.createElement(InspectionModule, props)));
  return { container, root };
}

function click(element) {
  act(() => {
    element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
}

after(() => {
  dom.window.close();
});

test('the assessment has eleven categories: the original seven plus the four new ones', () => {
  assert.equal(inspectionCategories.length, 11);
  assert.deepEqual(
    inspectionCategories.map((category) => category.label),
    ['Concrete', 'Asphalt', 'Gravel', 'Earth', 'Shoulder', 'Side Drain', 'Sidewalk', ...NEW_CATEGORIES],
  );
  assert.equal(new Set(inspectionCategories.map((category) => category.key)).size, 11);
  assert.deepEqual(
    inspectionCategories.slice(7).map((category) => category.key),
    ['drainage', 'solar_lights', 'slope_protection', 'retaining_wall'],
  );
});

test('every category keeps the five condition ratings with a written field condition', () => {
  for (const category of inspectionCategories) {
    assert.deepEqual(Object.keys(category.details), ['Good', 'Fair', 'Poor', 'Bad', 'N/A'], category.label);
    for (const [rating, description] of Object.entries(category.details)) {
      assert.ok(description && description.trim().length > 20, `${category.label}/${rating} needs a description`);
    }
  }
  const drainage = inspectionCategories.find((category) => category.label === 'Drainage');
  assert.match(drainage.details.Good, /free flow/i);
  assert.match(drainage.details.Bad, /roadway itself serves as the drain/i);
});

const pendingInspection = { id: 'pending', localRoadId: 'road-1', localRoadName: 'Poblacion Road', date: '2026-11-11', conditionRating: 0, remarks: '', inspector: '', conditionRatings: {}, isScheduledAnnualFollowUp: true };
function openPendingForm(container) { click(container.querySelector('[aria-label^="Record inspection"]')); }

test('the inspection form shows a remark box and an attach control under each category', () => {
  const { container, root } = renderModule([pendingInspection]);
  assert.equal([...container.querySelectorAll('button')].some(button => button.textContent.trim() === 'Add Inspection'), false);
  openPendingForm(container);
  assert.equal(container.querySelector('[aria-label="Required inspection attachment"]'), null);
  assert.match(container.textContent, /Monitoring and Maintenance Inspection/);
  assert.doesNotMatch(container.textContent, /Acceptance Inspection/);

  const remarkBoxes = [...container.querySelectorAll('[data-category-remark]')];
  assert.equal(remarkBoxes.length, 11);
  assert.deepEqual(remarkBoxes.map((box) => box.getAttribute('data-category-remark')), inspectionCategories.map((c) => c.label));

  for (const label of inspectionCategories.map((c) => c.label)) {
    const fileInput = container.querySelector(`input[aria-label="Attach files for ${label}"]`);
    assert.ok(fileInput, `${label} should have an attachment picker`);
    assert.equal(fileInput.type, 'file');
    assert.equal(fileInput.multiple, true);
  }

  act(() => root.unmount());
  container.remove();
});

test('remarks stay editable while a category is rated N/A', () => {
  const { container, root } = renderModule([pendingInspection]);
  openPendingForm(container);
  const naRadio = container.querySelector('input[name="condition-Drainage"][value="N/A"]');
  assert.ok(naRadio, 'Drainage should offer the N/A rating');
  act(() => {
    naRadio.checked = true;
    naRadio.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  const remark = container.querySelector('[data-category-remark="Drainage"]');
  assert.equal(remark.disabled, false);
  act(() => root.unmount());
  container.remove();
});

test('submitting without ratings asks for a rating on every category', () => {
  const { container, root } = renderModule([pendingInspection]);
  openPendingForm(container);
  const form = container.querySelector('form');
  act(() => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
  assert.match(container.textContent, /Select a condition rating for every category/);
  act(() => root.unmount());
  container.remove();
});

test('inspection details show stored remarks, attachments and "Not assessed" for missing categories', () => {
  const inspection = {
    id: 'insp-1',
    localRoadId: 'road-1',
    localRoadName: 'Poblacion Road',
    date: '2026-11-11',
    conditionRating: 7,
    remarks: 'Cracked slab near the barangay hall.',
    inspector: 'gabriel mendoza',
    inspectionType: 'Routine',
    validationStatus: 'Pending Validation',
    conditionRatings: LEGACY_RATINGS,
    conditionRemarks: {
      'Side Drain': 'Silted outlet beside the basketball court.',
      Drainage: 'Canal overflows during heavy rain.',
    },
    conditionAttachments: {
      Drainage: [
        { name: 'drainage-overflow.jpg', type: 'image/jpeg', dataUrl: 'https://example.test/drainage.jpg', stored: true },
      ],
    },
  };
  const { container, root } = renderModule([inspection]);
  const card = container.querySelector('[aria-label^="View full inspection"]');
  assert.ok(card, 'inspection card should render');
  click(card);
  const labels = [...container.querySelectorAll('.inspection-detail-dialog span')].filter(el => el.className.includes('font-medium'));
  assert.ok(labels.length); assert.ok(labels.every(el => !el.textContent.trim().endsWith('*')));

  const blocks = [...container.querySelectorAll('[data-category]')];
  assert.equal(blocks.length, 11, 'details should list all eleven categories');
  const drainage = blocks.find((block) => block.getAttribute('data-category') === 'Drainage');
  assert.match(drainage.textContent, /Canal overflows during heavy rain/);
  assert.match(drainage.textContent, /drainage-overflow\.jpg/);
  const sideDrain = blocks.find((block) => block.getAttribute('data-category') === 'Side Drain');
  assert.match(sideDrain.textContent, /Silted outlet beside the basketball court/);
  assert.match(sideDrain.textContent, /Poor/);
  // Categories the legacy record never assessed are labelled, not invented.
  assert.equal((container.textContent.match(/Not assessed/g) || []).length, 4);
  act(() => root.unmount());
  container.remove();
});


test('Inspector can filter inspection records by a valid date and clear it', () => {
  const records = [
    { ...pendingInspection, isScheduledAnnualFollowUp: false, id: 'one', localRoadName: 'Poblacion Road', date: '2026-11-11' },
    { ...pendingInspection, isScheduledAnnualFollowUp: false, id: 'two', localRoadName: 'Poblacion Road', date: '2026-11-12' },
  ];
  const { container, root } = renderModule(records);
  const date = container.querySelector('[aria-label="Filter by inspection date"]');
  assert.equal(date.type, 'date');
  assert.equal(container.querySelector('[aria-label="Filter inspections by status"]'), null);
  const setDate = value => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(date, value);
    date.dispatchEvent(new window.Event('input', { bubbles: true }));
    date.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  setDate('2026-11-11');
  assert.match(container.textContent, /1 record listed/);
  setDate('2026-02-30');
  assert.equal(date.value, '');
  assert.match(container.textContent, /1 record listed/);
  setDate('');
  assert.match(container.textContent, /1 record listed/);
  act(() => root.unmount()); container.remove();
});

test('pending inspection starts with an empty date and generates findings instead of accepting typed findings', () => {
  const { container, root } = renderModule([pendingInspection]);
  openPendingForm(container);
  const date = [...container.querySelectorAll('input[type=date]')].find(input => !input.disabled && !input.readOnly && input.required);
  assert.ok(date);
  assert.equal(date.value, '');
  assert.equal(date.min, '2000-01-01');
  assert.ok(container.querySelector('[aria-label="Inspection findings summary"]'));
  assert.equal(container.querySelector('textarea[placeholder="Enter inspection findings..."]'), null);
  assert.doesNotMatch(container.textContent, /Remarks and attachments under each category are optional/);
  act(() => root.unmount()); container.remove();
});

test('inspection cards use one-line truncation, hide trigger dates and offer the head engineer a date filter', () => {
  const { container, root } = renderModule([{...pendingInspection, date:'2026-11-11', annualFollowUpYear:2027}], 'Head Engineer');
  assert.ok(container.querySelector('[aria-label="Filter by inspection date"]'));
  assert.equal(container.querySelector('[aria-label="Filter inspections by status"]'), null);
  const card = container.querySelector('article');
  assert.ok(card.querySelector('.inspection-road-name').classList.contains('truncate'));
  assert.equal(card.querySelector('.inspection-remarks'), null); // pending follow-ups have no findings row
  assert.doesNotMatch(card.textContent, /2026-11-11|Inspection due by|Edit this entry/);
  act(() => root.unmount()); container.remove();
});

test('inspection overview follows history changes and pending annual cards keep their prompt', async () => {
  const pending={id:'i',localRoadId:'road-1',localRoadName:'Poblacion Road',date:'2027-01-01',annualFollowUpYear:2027,isScheduledAnnualFollowUp:true,conditionRating:0,remarks:'',inspector:''};
  for (const role of ['Head Engineer','Staff - Inspector']) {
    const {container,root}=renderModule([pending],role);
    assert.match(container.textContent,/Provide the necessary inspection details\./);
    assert.match(container.textContent,/Pending/);
    const tabs=()=>[...container.querySelectorAll('[role=tab]')];
    await act(async()=>tabs().find(el=>el.textContent.includes('Overview')).click());
    let table=container.querySelector('table'); assert.deepEqual([...table.querySelectorAll('th')].map(th=>th.textContent).slice(0,4),['Project Name','Inspection Date','Contracted Amount','Findings']);
    // task 14: only the Head Engineer gets the overview print controls, in the header
    if (role === 'Head Engineer') {
      assert.equal(table.querySelectorAll('th').length, 5);
      assert.ok(container.querySelector('button[aria-label="Print inspection overview"]'));
      assert.ok(container.querySelector('select[aria-label="Print inspection overview year"]'));
    } else {
      assert.equal(table.querySelectorAll('th').length, 4);
      assert.equal(container.querySelector('button[aria-label="Print inspection overview"]'), null);
    }
    assert.deepEqual([...table.querySelectorAll('tbody td')].map(td=>td.textContent),['Poblacion Road','','','']);
    await act(async()=>root.render(React.createElement(InspectionModule,{inspections:[{...pending,isScheduledAnnualFollowUp:false,conditionRating:6,conditionRatings:{Concrete:'Fair'},conditionRemarks:{Concrete:'Cracks'}}],localRoadList:[{id:'road-1',name:'Poblacion Road',contractedAmount:'1234567.5'}],onAddInspection(){},onEditInspection(){},onDeleteInspection(){},currentUser:'User',userRole:role})));
    table=container.querySelector('table'); assert.deepEqual([...table.querySelectorAll('tbody td')].map(td=>td.textContent),['Poblacion Road','2027-01-01','Php 1,234,567.50','Cracks.']);
    await act(async()=>tabs().find(el=>el.textContent.includes('Inspection History')).click()); assert.match(container.textContent,/Cracks/);
    act(()=>root.unmount()); container.remove();
  }
});

test('inspection dates earlier than 29 days before the anniversary show the requested native message', async () => {
  const {container,root}=renderModule([pendingInspection]);
  await act(async()=>root.render(React.createElement(InspectionModule,{inspections:[pendingInspection],localRoadList:[{id:'road-1',name:'Poblacion Road',actualCompletionDate:'2025-03-31'}],onAddInspection(){},onEditInspection(){},onDeleteInspection(){},currentUser:'User',userRole:'Staff - Inspector'})));
  openPendingForm(container);
  const input=[...container.querySelectorAll('input[type=date]')].find(el=>!el.readOnly && el.required);
  // 31 March 2026 anniversary − 29 days = 2 March 2026 (was +11 months = 28 February).
  assert.ok(input); assert.equal(input.min,'2026-03-02');
  input.value='2026-03-01'; await act(async()=>input.checkValidity());
  assert.equal(input.validationMessage,'Please fill out valid date.');
  input.value='2026-03-02'; await act(async()=>input.dispatchEvent(new window.Event('input',{bubbles:true})));
  assert.equal(input.validity.valid,true);
  act(()=>root.unmount()); container.remove();
});

test('task 14: the inspection overview prints every record, or a single year', async () => {
  const completed2026 = { id: 'a', localRoadId: 'road-1', localRoadName: 'Poblacion Road', date: '2026-11-11',
    conditionRatings: { Concrete: 'Fair' }, conditionRemarks: { Concrete: 'Cracks' }, inspector: 'User' };
  const completed2027 = { id: 'b', localRoadId: 'road-2', localRoadName: 'Anilao Road', date: '2027-03-04',
    conditionRatings: { Concrete: 'Poor' }, conditionRemarks: { Concrete: 'Potholes' }, inspector: 'User' };
  const pending = { id: 'c', localRoadId: 'road-3', localRoadName: 'Bagalangit Road', date: '2028-01-01',
    annualFollowUpYear: 2028, isScheduledAnnualFollowUp: true, conditionRating: 0, remarks: '', inspector: '' };
  const { container, root } = renderModule([completed2026, completed2027, pending], 'Head Engineer');
  await act(async () => [...container.querySelectorAll('[role=tab]')].find(el => el.textContent.includes('Overview')).click());

  const print = () => container.querySelector('button[aria-label="Print inspection overview"]');
  await act(async () => print().click());
  let sections = printedDocuments.at(-1).sections;
  // the pending follow-up has nothing recorded yet, so it is not printed
  assert.deepEqual(sections.map(section => section.title).sort(), ['Anilao Road', 'Poblacion Road']);
  assert.deepEqual(sections[0].fields.map(field => field.label), ['Date of Inspection', 'Amount Contracted', 'Findings / Remarks']);

  const year = container.querySelector('select[aria-label="Print inspection overview year"]');
  const option = [...year.options].find(item => item.value === '2026');
  assert.ok(option, 'the data years are offered');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(year, '2026');
    year.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await act(async () => print().click());
  sections = printedDocuments.at(-1).sections;
  assert.deepEqual(sections.map(section => section.title), ['Poblacion Road']);
  act(() => root.unmount()); container.remove();
});
