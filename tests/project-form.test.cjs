// Exercises the real form and browser constraint validation in an isolated DOM.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLSelectElement: dom.window.HTMLSelectElement, File: dom.window.File, FileReader: dom.window.FileReader, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLElement.prototype.scrollTo = function () {};
const React = require('react');
const { act } = require('react-dom/test-utils');
const { createRoot } = require('react-dom/client');

function loadTs(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = m.require.bind(m);
  m.require = name => Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name);
  m._compile(code, filename); return m.exports;
}
const validation = loadTs('src/lib/project-form-validation.ts');
const attachmentValidation = loadTs('src/lib/attachment-validation.ts');
let uploadCalls = [];
let startDelay = () => Promise.resolve();
global.fetch = async (url, options) => {
  uploadCalls.push({ url, options });
  return url === '/api/local-road/attachment-upload'
    ? { ok: true, json: async () => ({ signedUrl: 'https://storage.example.test/signed', path: 'project-uploads/test/uuid.pdf', type: 'application/pdf' }) }
    : { ok: true };
};
const { LocalRoadForm } = loadTs('src/app/components/LocalRoadForm.tsx', {
  './ui/textarea': { AutoGrowTextarea: props => React.createElement('textarea', props) },
  '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
  '@/lib/project-form-validation': validation,
  '@/lib/attachment-validation': attachmentValidation,
  '@/lib/project-save-delay': { startProjectSaveDelay: () => startDelay() },
});
const container = document.getElementById('root');
const root = createRoot(container);
after(() => { act(() => root.unmount()); dom.window.close(); });
const render = async (onSave, props = {}) => act(async () => root.render(React.createElement(LocalRoadForm, { onSave, onClose() {}, ...props })));
const reset = async () => act(async () => root.render(null));
const field = name => container.querySelector(`[data-field="${name}"]`);
async function change(name, value) {
  const el = field(name); assert.ok(el, `missing field ${name}`);
  await act(async () => {
    const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event(el instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function submit() { await act(async () => container.querySelector('form').requestSubmit()); }
async function file() {
  const el = field('Turnover Attachment');
  Object.defineProperty(el, 'files', { configurable: true, value: [new window.File(['certificate'], 'turnover.pdf', { type: 'application/pdf' })] });
  await act(async () => el.dispatchEvent(new window.Event('change', { bubbles: true })));
}
async function fill() {
  for (const [name, value] of Object.entries({
    'Project / Program / Activity Name': 'Road improvement', 'Project Category': 'National Road', 'Project Description': 'Description',
    'Location': 'Mabini', 'Date Started': '2026-01-01', 'Target Completion Date': '2026-02-01', 'Actual Completion Date': '2026-02-01',
    'Road Network ID No.': '1', 'Barangay': 'Mabini', 'Components': 'Road', 'Description': 'Road works',
    'Contractor Name': 'Company', 'Contractor Address': 'Address', 'Contact Information': '123',
    'Source of Funds': 'Municipal', 'Approved Budget for the Contract (ABC)': '1234.56', 'Contracted Amount': '1000.25',
    'Turnover and Acceptance Date': '2026-02-02',
  })) await change(name, value);
}

test('currency and date helpers preserve decimals and require a four-digit year', () => {
  assert.equal(validation.formatProjectCurrency('1234567.89'), '1,234,567.89');
  assert.equal(validation.formatProjectCurrency('1234.'), '1,234.');
  assert.equal(validation.formatSavedProjectCurrency('1234.50'), '1,234.50');
  assert.equal(validation.formatSavedProjectCurrency('1,234.50'), '1,234.50');
  assert.equal(validation.formatSavedProjectCurrency('0'), '0.00');
  assert.equal(validation.formatSavedProjectCurrency('10000'), '10,000.00');
  assert.equal(validation.formatSavedProjectCurrency('10000.0'), '10,000.00');
  assert.equal(validation.formatSavedProjectCurrency('10000.00'), '10,000.00');
  assert.equal(validation.formatSavedProjectCurrency('10000.125'), '10,000.125');
  assert.equal(validation.formatSavedProjectCurrency(''), '');
  assert.equal(validation.formatSavedProjectCurrency('-1234.50'), '-1234.50');
  assert.equal(validation.isValidProjectCurrency('1,234.56'), true);
  assert.equal(validation.isValidProjectCurrency('1,234.'), false);
  assert.equal(validation.isValidProjectCurrency('1\n2'), false);
  assert.equal(validation.hasFourDigitYear('2026-01-01'), true);
  assert.equal(validation.hasFourDigitYear('999-01-01'), false);
  assert.equal(validation.hasFourDigitYear('10000-01-01'), false);
});

test('missing category and turnover attachment are reported; extensions are optional', async () => {
  let saved; await render(value => { saved = value; }); await fill();
  await change('Project Category', ''); await submit();
  assert.equal(field('Project Category').validationMessage, 'Please fill out this field.');
  assert.doesNotMatch(container.textContent, /Complete all required fields/);
  assert.equal(saved, undefined);
  await change('Project Category', 'National Road'); await submit();
  assert.equal(field('Turnover Attachment').validationMessage, 'Please fill out this field.');
  await file();
  await act(async () => { await submit(); await new Promise(resolve => setTimeout(resolve, 30)); });
  assert.ok(saved); assert.equal(saved.noOfExtensions, '');
  assert.equal(saved.appropriation, '1234.56'); assert.equal(saved.contractedAmount, '1000.25');
  assert.equal(saved.dateStarted, '2026-01-01'); assert.equal(saved.completionDate, saved.actualCompletionDate);
  assert.equal(Object.hasOwn(saved, 'adjustProjectCost'), false);
  for (const key of ['pcadLicenseNo', 'completionPercentage']) assert.equal(Object.hasOwn(saved, key), false);
  assert.equal(saved.attachments[0].category, 'Turnover Certificate');
  assert.equal(saved.attachments[0].staged, true);
  assert.equal(saved.attachments[0].dataUrl, '');
  assert.ok(uploadCalls.some(call => call.url === 'https://storage.example.test/signed' && call.options.method === 'PUT'));
});

test('form has only a turnover attachment and bounds all date inputs', async () => {
  await act(async () => root.render(null));
  await render(() => {});
  const form = container.querySelector('form');
  assert.equal(form.querySelectorAll('input[type=file]:not([class=hidden])').length, 1);
  const inputs = [...form.querySelectorAll('input[type=date]')];
  assert.equal(inputs.length, 5);
  for (const input of inputs) { assert.equal(input.min, '2000-01-01'); assert.equal(input.max, '9999-12-31'); }
  assert.doesNotMatch(container.textContent, /No\. of Extensions \*/);
  for (const name of ['PCAD License No.', 'Completion Percentage']) assert.equal(field(name), null);
  assert.ok(field('Road Network ID No.'));
  const dates = field('Completion Date').parentElement.parentElement;
  assert.match(dates.className, /md:grid-cols-2/);
  assert.equal(dates, field('Turnover and Acceptance Date').parentElement.parentElement);
  assert.equal(dates.children.length, 2);
});

test('each editable project field blocks submission when empty', async () => {
  let saved; await act(async () => root.render(null)); await render(value => { saved = value; });
  await fill(); await file();
  const names = ['Project / Program / Activity Name', 'Project Category', 'Project Description', 'Location', 'Date Started', 'Target Completion Date', 'Actual Completion Date', 'Barangay', 'Components', 'Description', 'Contractor Name', 'Contractor Address', 'Source of Funds', 'Approved Budget for the Contract (ABC)', 'Contracted Amount', 'Turnover and Acceptance Date'];
  for (const name of names) {
    const old = field(name).value;
    await change(name, ''); await submit();
    assert.equal(field(name).validationMessage, 'Please fill out this field.', name);
    assert.doesNotMatch(container.textContent, /Complete all required fields/);
    assert.equal(saved, undefined, name);
    await change(name, old);
  }
});

test('rejects incomplete currency and non-four-digit date', async () => {
  let saved; await act(async () => root.render(null)); await render(value => { saved = value; });
  await fill(); await file();
  await change('Approved Budget for the Contract (ABC)', '1000.'); await submit();
  assert.equal(field('Approved Budget for the Contract (ABC)').validationMessage, 'Enter a valid amount.');
  await change('Approved Budget for the Contract (ABC)', '1000.50');
  await change('Date Started', '10000-01-01'); await submit();
  assert.equal(field('Date Started').validity.rangeOverflow, true);
  assert.equal(saved, undefined);
});

test('Other Specify requires a custom category and remains editable when cleared', async () => {
  await act(async () => root.render(null)); await render(() => {}); await fill(); await file();
  await change('Project Category', 'Other Specify'); await submit();
  assert.equal(container.querySelector('[aria-label="Specify project category"]').validationMessage, 'Please fill out this field.');
  const input = container.querySelector('[aria-label="Specify project category"]');
  assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(input, 'Custom road');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(input, '');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.ok(container.querySelector('[aria-label="Specify project category"]'));
  await submit();
  assert.equal(container.querySelector('[aria-label="Specify project category"]').validationMessage, 'Please fill out this field.');
});

test('whitespace-only required text uses the same native message and clears after typing', async () => {
  await act(async () => root.render(null)); await render(() => {}); await fill(); await file();
  await change('Project Description', '   '); await submit();
  assert.equal(field('Project Description').validationMessage, 'Please fill out this field.');
  await change('Project Description', 'Description');
  assert.equal(field('Project Description').validationMessage, '');
});

test('rejects unsupported, mismatched and oversized files without adding them', async () => {
  await reset(); await render(() => {});
  const input = field('Turnover Attachment');
  for (const file of [new window.File(['x'], 'document.exe', { type: 'application/octet-stream' }), new window.File(['x'], 'photo.png', { type: 'application/pdf' }), new window.File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' })]) {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.match(container.querySelector('[role=alert]').textContent, /PDF, JPG, or PNG|10 MB/);
    assert.doesNotMatch(container.textContent, /Selected Files:/);
  }
  assert.equal(attachmentValidation.attachmentError({ name: 'limit.PDF', type: 'application/pdf', size: 10 * 1024 * 1024 }), null);
  assert.equal(attachmentValidation.attachmentError({ name: 'photo.jpeg', type: 'image/jpeg', size: 100 }), null);
});

test('edit requires an attachment unless an existing turnover certificate is present', async () => {
  const base = { id: 'p1', name: 'Project', type: 'National Road', location: 'Mabini', dateBuilt: '2026-01-01', condition: 'Good' };
  await reset(); await render(() => {}, { item: base, editId: 'p1' });
  assert.equal(field('Turnover Attachment').required, true);
  await reset(); await render(() => {}, { item: { ...base, attachments: [{ name: 'existing.pdf', type: 'application/pdf', category: 'Turnover Certificate', dataUrl: 'signed', storagePath: 'old/path' }] }, editId: 'p1' });
  assert.equal(field('Turnover Attachment').required, false);
  assert.match(container.textContent, /Existing attachment: existing.pdf/);
  assert.doesNotMatch(container.textContent, /Mabini, Batangas Barangay|Dependent on the Location Field/);
});

test('failed storage upload keeps the form open and does not save a project', async () => {
  let saved; await reset(); await render(value => { saved = value; }); await fill(); await file();
  const original = global.fetch;
  global.fetch = async (url, options) => url === '/api/local-road/attachment-upload' ? original(url, options) : { ok: false };
  await submit();
  assert.equal(saved, undefined);
  assert.match(container.querySelector('[role=alert]').textContent, /Could not upload/);
  global.fetch = original;
});

test('edit accepts a new uploaded turnover attachment without removing existing ones', async () => {
  let saved;
  const old = { name: 'old.pdf', type: 'application/pdf', category: 'Turnover Certificate', dataUrl: 'signed', storagePath: 'old/path' };
  const item = { id: 'p1', name: 'Road', type: 'National Road', location: 'Mabini', dateBuilt: '2026-01-01', condition: 'Good', attachments: [old] };
  await reset(); await render(value => { saved = value; }, { item, editId: 'p1' });
  await fill(); await file(); await submit();
  assert.equal(saved.id, 'p1');
  assert.equal(saved.attachments.length, 2);
  assert.equal(saved.attachments[0].storagePath, 'old/path');
  assert.equal(saved.attachments[1].staged, true);
});

test('editing saved monetary values groups commas, preserves decimals and submits numeric strings', async () => {
  let saved;
  const item = {
    id: 'p1', name: 'Road improvement', type: 'National Road', location: 'Mabini', dateBuilt: '2026-01-01', condition: 'Good',
    projectName: 'Road improvement', projectCategory: 'National Road', projectDescription: 'Description', dateStarted: '2026-01-01',
    targetCompletionDate: '2026-02-01', actualCompletionDate: '2026-02-01', roadNetworkId: '1', barangay: 'Mabini', components: 'Road',
    description: 'Road works', contractorName: 'Company', contractorAddress: 'Address', contactInformation: '123', pcadLicenseNo: 'ABC',
    sourceOfFunds: 'Municipal', appropriation: '1234567.89', contractedAmount: '1,000.25', adjustProjectCost: '0.50',
    completionDate: '2026-02-01', completionPercentage: '100', turnoverDate: '2026-02-02',
    attachments: [{ name: 'old.pdf', type: 'application/pdf', category: 'Turnover Certificate', dataUrl: 'signed', storagePath: 'old/path' }],
  };
  await reset(); await render(value => { saved = value; }, { item, editId: 'p1' });
  assert.equal(field('Approved Budget for the Contract (ABC)').value, '1,234,567.89');
  assert.equal(field('Contracted Amount').value, '1,000.25');
  assert.equal(field('Actual Project Cost'), null);
  await submit();
  assert.equal(saved.appropriation, '1234567.89');
  assert.equal(saved.contractedAmount, '1000.25');
  assert.equal(Object.hasOwn(saved, 'adjustProjectCost'), false);
  await change('Approved Budget for the Contract (ABC)', '2,500,010.75');
  await change('Contracted Amount', '1500.08');
  await submit();
  assert.equal(saved.appropriation, '2500010.75');
  assert.equal(saved.contractedAmount, '1500.08');
});

test('currency cursor stays at the edited position after regrouping', async () => {
  await reset(); await render(() => {});
  await change('Approved Budget for the Contract (ABC)', '1234.56');
  const input = field('Approved Budget for the Contract (ABC)');
  input.focus();
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '12345.56');
    input.setSelectionRange(5, 5);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(input.value, '12,345.56');
  assert.equal(input.selectionStart, 6);
});

test('project details and printed financial information group saved values', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  let sections;
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui,
    './PrintDocument': { PrintDocument: props => { sections = props.sections; return null; } },
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
  '@/lib/project-form-validation': validation,
  });
  const item = { id: 'p', name: 'Road', type: 'Road', location: 'Town', dateBuilt: '', condition: 'Good',
    appropriation: '1234567.89', contractedAmount: '1,000.25', adjustProjectCost: '0.50' };
  await reset();
  await act(async () => root.render(React.createElement(LocalRoadList, { data: [item], currentUser: 'User', userRole: 'Staff - Encoder', onAdd() {}, onEdit() {}, onDelete() {} })));
  await act(async () => container.querySelector('[aria-label="View details for Road"]').click());
  assert.match(container.textContent, /Php 1,234,567\.89/);
  assert.match(container.textContent, /Php 1,000\.25/);
  assert.doesNotMatch(container.textContent, /Php 0\.50|Actual Project Cost/);
  const printButton = [...container.querySelectorAll('button')].find(button => /Print/.test(button.textContent));
  assert.ok(printButton); await act(async () => printButton.click());
  const fields = sections.flatMap(section => section.fields);
  assert.equal(fields.find(field => field.label === 'Approved Budget for the Contract (ABC)').value, 'Php 1,234,567.89');
  assert.equal(fields.find(field => field.label === 'Contracted Amount').value, 'Php 1,000.25');
  assert.equal(fields.some(field => field.label === 'Actual Project Cost'), false);
});

test('whole peso values retain .00 in editing, saving, viewing and printing', async () => {
  let saved;
  const item = { id: 'p1', name: 'Road', type: 'National Road', location: 'Mabini', dateBuilt: '2026-01-01', condition: 'Good',
    appropriation: '10000', contractedAmount: '10000.0', adjustProjectCost: '10000.00',
    attachments: [{ name: 'old.pdf', type: 'application/pdf', category: 'Turnover Certificate', dataUrl: 'signed', storagePath: 'old/path' }] };
  await reset(); await render(value => { saved = value; }, { item, editId: 'p1' });
  for (const name of ['Approved Budget for the Contract (ABC)', 'Contracted Amount']) assert.equal(field(name).value, '10,000.00');
  await fill();
  for (const name of ['Approved Budget for the Contract (ABC)', 'Contracted Amount']) await change(name, '10,000.00');
  await submit();
  assert.equal(saved.appropriation, '10000.00'); assert.equal(saved.contractedAmount, '10000.00'); assert.equal(Object.hasOwn(saved, 'adjustProjectCost'), false);
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  let sections;
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui,
    './PrintDocument': { PrintDocument: props => { sections = props.sections; return null; } },
    '@/lib/activity-log-client': { recordClientActivity: async () => {} }, '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
  '@/lib/project-form-validation': validation,
  });
  await reset();
  await act(async () => root.render(React.createElement(LocalRoadList, { data: [item], currentUser: 'User', userRole: 'Staff - Encoder', onAdd() {}, onEdit() {}, onDelete() {} })));
  await act(async () => container.querySelector('[aria-label="View details for Road"]').click());
  assert.equal((container.textContent.match(/Php 10,000\.00/g) || []).length, 2);
  await act(async () => [...container.querySelectorAll('button')].find(button => /Print/.test(button.textContent)).click());
  const fields = sections.flatMap(section => section.fields);
  for (const label of ['Approved Budget for the Contract (ABC)', 'Contracted Amount']) assert.equal(fields.find(field => field.label === label).value, 'Php 10,000.00');
});

for (const editing of [false, true]) {
  test(`${editing ? 'updating' : 'saving'} waits for both progress delay and the actual save`, async () => {
    let releaseDelay, releaseSave, savedCount = 0, closed = 0;
    startDelay = () => new Promise(resolve => { releaseDelay = resolve; });
    const onSave = () => { savedCount++; return new Promise(resolve => { releaseSave = resolve; }); };
    const item = editing ? { id: 'p1', name: 'Road', type: 'National Road', location: 'Mabini', dateBuilt: '2026-01-01', condition: 'Good',
      attachments: [{ name: 'old.pdf', type: 'application/pdf', category: 'Turnover Certificate', dataUrl: 'signed', storagePath: 'old/path' }] } : null;
    try {
      await reset(); await render(onSave, { item, editId: editing ? 'p1' : undefined, onClose: () => { closed++; } });
      await fill(); if (!editing) await file();
      await submit();
      const button = container.querySelector('button[type=submit]');
      assert.equal(savedCount, 1); assert.equal(button.disabled, true);
      assert.match(button.textContent, editing ? /Updating/ : /Saving/);
      assert.equal(container.querySelector('[aria-label="Close form"]').disabled, true);
      await submit(); assert.equal(savedCount, 1);
      if (editing) {
        await act(async () => releaseSave());
        assert.equal(closed, 0); assert.equal(button.disabled, true);
        await act(async () => releaseDelay());
      } else {
        await act(async () => releaseDelay());
        assert.equal(closed, 0); assert.equal(button.disabled, true);
        await act(async () => releaseSave());
      }
      assert.equal(closed, 1);
    } finally { startDelay = () => Promise.resolve(); }
  });
}

test('save failures leave the form open and display the error after the delay', async () => {
  let releaseDelay, closed = 0;
  startDelay = () => new Promise(resolve => { releaseDelay = resolve; });
  try {
    await reset(); await render(async () => { throw new Error('Save failed'); }, { onClose: () => { closed++; } });
    await fill(); await file(); await submit();
    assert.equal(closed, 0); assert.equal(container.querySelector('button[type=submit]').disabled, true);
    await act(async () => releaseDelay());
    assert.equal(closed, 0); assert.equal(container.querySelector('button[type=submit]').disabled, false);
    assert.match(container.querySelector('[role=alert]').textContent, /Save failed/);
  } finally { startDelay = () => Promise.resolve(); }
});

test('validation buttons show Saving... and Submitting... while awaiting the request', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': { AutoGrowTextarea: props => React.createElement('textarea', props) },
    './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
    '@/lib/project-form-validation': validation,
  });
  for (const result of ['Return for Revision', 'Validated']) {
    let finishSave, calls = 0;
    const item = { id: 'p', name: 'Road', type: 'Road', location: 'Town', dateBuilt: '', condition: 'Good', actualCompletionDate: '2000-01-01', annualValidationEntries: [{ year: 2001, result: 'Return for Revision', remarks: 'Fix it', dueDate: '2000-12-02' }] };
    await reset();
    await act(async () => root.render(React.createElement(LocalRoadList, { data: [item], currentUser: 'User', userRole: 'Staff - Validator', validationMode: true, onAdd() {}, onEdit() {}, onDelete() {}, onSaveValidation: () => { calls++; return new Promise(resolve => { finishSave = resolve; }); } })));
    await act(async () => container.querySelector('tr[aria-label]').click());
    if (result === 'Validated') await act(async () => container.querySelector('input[value="Validated"]').click());
    const form = container.querySelector('.validation-entry-form');
    await act(async () => form.requestSubmit());
    const button = form.querySelector('button[type=submit]');
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, result === 'Validated' ? 'Submitting...' : 'Saving...');
    await act(async () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(calls, 1);
    await act(async () => finishSave(false));
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, result === 'Validated' ? 'Submit' : 'Save');
  }
});

// @mine — the requested fields are hidden without removing the road identifier.
test('edit, encoder details and validator form hide the requested fields', async () => {
  const item = { id: 'p', name: 'Road', type: 'Road', location: 'Town', dateBuilt: '2000-01-01', condition: 'Good',
    actualCompletionDate: '2000-01-01', annualValidationEntries: [{ year: 2001, result: 'Pending', remarks: '', dueDate: '2000-12-02' }], roadNetworkId: 'R-1', pcadLicenseNo: 'OLD-LICENSE', completionPercentage: '75' };
  await reset(); await render(() => {}, { item, editId: 'p' });
  assert.equal(field('PCAD License No.'), null);
  assert.equal(field('Completion Percentage'), null);
  assert.ok(field('Road Network ID No.'));
  const dates = field('Completion Date').parentElement.parentElement;
  assert.match(dates.className, /md:grid-cols-2/);
  assert.equal(dates.children.length, 2);

  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
    '@/lib/project-form-validation': validation,
  });
  for (const validationMode of [false, true]) {
    await reset();
    await act(async () => root.render(React.createElement(LocalRoadList, { data: [item], currentUser: 'User', userRole: validationMode ? 'Staff - Validator' : 'Staff - Encoder', validationMode, onAdd() {}, onEdit() {}, onDelete() {} })));
    const button = container.querySelector(validationMode ? '[aria-label="Open validation form for Road"]' : '[aria-label="View details for Road"]');
    assert.ok(button); await act(async () => button.click());
    assert.doesNotMatch(container.textContent, /PCAD License No\.|OLD-LICENSE/);
    assert.match(container.textContent, /Road Network ID No\./);
    assert.doesNotMatch(container.textContent, /Completion Percentage/);
    if (!validationMode) assert.doesNotMatch(container.textContent, /Actual Project Cost/);
  }
});

// @mine — optional fields, derived dates and two-column financial layout.
test('new projects save without optional ID and contact and copy actual completion date', async () => {
  let saved; await reset(); await render(value => { saved = value; });
  await fill(); await file();
  await change('Road Network ID No.', ''); await change('Contact Information', '');
  assert.equal(field('Road Network ID No.').required, false);
  assert.equal(field('Contact Information').required, false);
  assert.equal(field('Completion Date').disabled, true);
  await change('Actual Completion Date', '2027-04-05');
  assert.equal(field('Completion Date').value, '2027-04-05');
  assert.equal(field('Actual Project Cost'), null);
  const row = field('Contracted Amount').parentElement.parentElement.parentElement;
  assert.match(row.className, /md:grid-cols-2/); assert.equal(row.children.length, 2);
  assert.equal(row, field('Approved Budget for the Contract (ABC)').parentElement.parentElement.parentElement);
  await submit();
  assert.ok(saved); assert.equal(saved.roadNetworkId, ''); assert.equal(saved.contactInformation, '');
  assert.equal(saved.actualCompletionDate, '2027-04-05'); assert.equal(saved.completionDate, '2027-04-05');
});

test('editing shows and saves completion date from actual date even when old dates differ', async () => {
  let saved;
  const item = { id: 'p1', name: 'Road', type: 'National Road', location: 'Mabini', dateBuilt: '2026-01-01', condition: 'Good',
    actualCompletionDate: '2026-03-01', completionDate: '2025-01-01',
    attachments: [{ name: 'old.pdf', type: 'application/pdf', category: 'Turnover Certificate', dataUrl: 'signed', storagePath: 'old/path' }] };
  await reset(); await render(value => { saved = value; }, { item, editId: 'p1' });
  assert.equal(field('Completion Date').value, '2026-03-01');
  await fill(); await change('Actual Completion Date', '2028-06-07');
  assert.equal(field('Completion Date').value, '2028-06-07');
  await submit(); assert.equal(saved.completionDate, '2028-06-07');
});

// @mine — role-specific details and head engineer print keep unrelated roles unchanged.
test('head engineer print and validator details hide requested fields and align remaining amounts', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  let sections;
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': { ...ui, Dialog: Dummy, DialogContent: ({children, className}) => React.createElement('div', {className}, children), DialogTitle: Dummy, DialogDescription: Dummy }, './ui/select': ui, './ConfirmActionDialog': ui,
    './PrintDocument': { PrintDocument: props => { sections = props.sections; return null; } },
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
    '@/lib/project-form-validation': validation,
  });
  const item = { id: 'p', name: 'Road', type: 'Road', location: 'Town', dateBuilt: '2000-01-01', condition: 'Good',
    actualCompletionDate: '2000-01-01', annualValidationEntries: [{ year: 2001, result: 'Pending', remarks: '', dueDate: '2000-12-02' }], pcadLicenseNo: 'LIC', adjustProjectCost: '987.50', completionPercentage: '75', appropriation: '1000', contractedAmount: '900' };
  for (const [role, validationMode] of [['Head Engineer', false], ['Staff - Validator', true]]) {
    await reset(); sections = undefined;
    await act(async () => root.render(React.createElement(LocalRoadList, { data: [item], userRole: role, validationMode, currentUser: 'User', onAdd() {}, onEdit() {}, onDelete() {} })));
    await act(async () => container.querySelector(validationMode ? '[aria-label="Open validation form for Road"]' : '[aria-label="View details for Road"]').click());
    const detail = container.querySelector('.project-details-dialog');
    assert.ok(detail);
    assert.doesNotMatch(detail.textContent, /PCAD License No\.|Actual Project Cost|Completion Percentage/);
    const labels = [...detail.querySelectorAll('p')].filter(el => el.className.includes('font-medium'));
    assert.ok(labels.length); assert.ok(labels.every(el => !el.textContent.trim().endsWith('*')));
    const abc = labels.find(el => el.textContent === 'Approved Budget for the Contract (ABC)');
    const contracted = labels.find(el => el.textContent === 'Contracted Amount');
    const row = abc.parentElement.parentElement;
    assert.equal(row, contracted.parentElement.parentElement); assert.match(row.className, /md:grid-cols-2/); assert.equal(row.children.length, 2);
    if (!validationMode) {
      await act(async () => [...detail.querySelectorAll('button')].find(button => /Print/.test(button.textContent)).click());
      const fields = sections.flatMap(section => section.fields);
      for (const name of ['PCAD License No.', 'Actual Project Cost', 'Completion Percentage']) assert.equal(fields.some(field => field.label === name), false);
      assert.equal(fields.find(field => field.label === 'Contracted Amount').width, 'half');
      assert.equal(fields.find(field => field.label === 'Approved Budget for the Contract (ABC)').width, 'half');
    }
  }
});

test('maintenance detail labels have no required markers', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const { MaintenanceModule } = loadTs('src/app/components/MaintenanceModule.tsx', {
    '@/lib/inspection-selection': loadTs('src/lib/inspection-selection.ts'),
    '@/lib/project-form-validation': validation,
    './ui/textarea': ui, './ui/dialog': { ...ui, Dialog: Dummy, DialogContent: ({children, className}) => React.createElement('div', {className}, children), DialogTitle: Dummy, DialogDescription: Dummy }, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
  });
  const road = { id: 'p', name: 'Road', projectName: 'Road', location: 'Town' };
  const maintenance = { id: 'm', localRoadId: 'p', localRoadName: 'Road', type: 'Routine', scheduledDate: '2026-01-01', status: 'Scheduled', cost: 0, description: 'Repair' };
  await reset();
  await act(async () => root.render(React.createElement(MaintenanceModule, { maintenanceRecords: [maintenance], localRoadList: [road], inspections: [], userRole: 'Head Engineer', currentUser: 'User', onAddMaintenance() {}, onEditMaintenance() {}, onDeleteMaintenance() {}, onUpdateStatus() {} })));
  await act(async () => container.querySelector('[aria-label="View maintenance details for Road"]').click());
  const labels = [...container.querySelectorAll('.maintenance-detail-dialog p')].filter(el => el.className.includes('font-medium'));
  assert.ok(labels.length); assert.ok(labels.every(el => !el.textContent.trim().endsWith('*')));
});

test('all printing roles omit legacy fields and leave empty project fields blank', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  let sections;
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': { ...ui, Dialog: Dummy, DialogContent: ({children, className}) => React.createElement('div', {className}, children), DialogTitle: Dummy, DialogDescription: Dummy }, './ui/select': ui, './ConfirmActionDialog': ui,
    './PrintDocument': { PrintDocument: props => { sections = props.sections; return null; } },
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'), '@/lib/project-form-validation': validation,
  });
  const item = { id: 'p', name: 'Road', type: 'Road', location: 'Town', dateBuilt: '2000-01-01', condition: 'Good', noOfExtensions: '0', pcadLicenseNo: 'LIC', adjustProjectCost: '900', completionPercentage: '75' };
  for (const role of ['Admin', 'Head Engineer', 'Staff - Encoder']) {
    await reset(); sections = undefined;
    await act(async () => root.render(React.createElement(LocalRoadList, { data: [item], userRole: role, currentUser: 'User', onAdd() {}, onEdit() {}, onDelete() {} })));
    await act(async () => container.querySelector('[aria-label="View details for Road"]').click());
    const detail = container.querySelector('.project-details-dialog');
    for (const label of ['Road Network ID No.', 'Contact Information', 'No. of Extensions']) {
      const p = [...detail.querySelectorAll('p')].find(el => el.textContent === label);
      assert.equal(p.nextElementSibling.textContent, '', `${role}: ${label}`);
    }
    await act(async () => [...detail.querySelectorAll('button')].find(button => /Print/.test(button.textContent)).click());
    const fields = sections.flatMap(section => section.fields);
    for (const label of ['PCAD License No.', 'Actual Project Cost', 'Completion Percentage']) assert.equal(fields.some(field => field.label === label), false);
    for (const label of ['Road Network ID No.', 'Contact Information', 'No. of Extensions']) assert.ok(!fields.find(field => field.label === label).value);
  }
});

test('validator reopens an updated returned project with an empty remarks input', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': { AutoGrowTextarea: props => React.createElement('textarea', props) },
    './ui/dialog': { ...ui, Dialog: Dummy, DialogContent: ({children, className}) => React.createElement('div', {className}, children), DialogTitle: Dummy, DialogDescription: Dummy }, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'), '@/lib/project-form-validation': validation,
  });
  const item = { id: 'p', name: 'Road', type: 'Road', location: 'Town', dateBuilt: '2000-01-01', condition: 'Good', actualCompletionDate: '2000-01-01', annualValidationEntries: [{ year: 2001, result: 'Pending', remarks: 'Previous revision remarks', dueDate: '2000-12-02' }] };
  await reset();
  await act(async () => root.render(React.createElement(LocalRoadList, { data: [item], userRole: 'Staff - Validator', validationMode: true, currentUser: 'User', onAdd() {}, onEdit() {}, onDelete() {} })));
  await act(async () => container.querySelector('[aria-label="Open validation form for Road"]').click());
  assert.equal(container.querySelector('#validation-remarks').value, '');
  const detail = container.querySelector('.project-details-dialog');
  const label = [...detail.querySelectorAll('p')].find(el => el.textContent === 'Validation Result');
  assert.equal(label.nextElementSibling.textContent, 'Pending Validation');
  assert.match(detail.textContent, /Previous revision remarks/); // History remains visible separately.
});

test('maintenance overview and history use the same live records for encoder and head engineer', async () => {
  const Dummy = ({children}) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, {get: () => Dummy});
  const {MaintenanceModule} = loadTs('src/app/components/MaintenanceModule.tsx', {
    '@/lib/inspection-selection':loadTs('src/lib/inspection-selection.ts'),
    '@/lib/project-form-validation': validation,
    './ui/textarea': {AutoGrowTextarea: props => React.createElement('textarea', props)}, './ui/dialog':ui, './ui/select':ui,
    './ConfirmActionDialog':ui, './PrintDocument':ui, '@/lib/activity-log-client':{recordClientActivity:async()=>{}},
  });
  const road = {id:'p',name:'Road',projectName:'Road'};
  const record = {id:'m',localRoadId:'p',localRoadName:'Road',type:'Corrective Type',scheduledDate:'2026-01-01',status:'Scheduled',cost:0,description:'Repair',remarks:'Initial remark'};
  for (const role of ['Head Engineer','Staff - Encoder']) {
    await reset();
    const props = {localRoadList:[road],inspections:[],userRole:role,currentUser:'User',onAddMaintenance(){},onEditMaintenance(){},onDeleteMaintenance(){},onUpdateStatus(){}};
    await act(async () => root.render(React.createElement(MaintenanceModule, {...props,maintenanceRecords:[record]})));
    assert.ok(container.querySelector('[aria-label="View maintenance details for Road"]'));
    await act(async () => [...container.querySelectorAll('[role=tab]')].find(el=>el.textContent.includes('Overview')).click());
    const table = container.querySelector('table');
    assert.equal(table.querySelector('col').style.width,'33%'); assert.ok(table.className.includes('table-fixed'));
    assert.deepEqual([...table.querySelectorAll('th')].map(th=>th.textContent).slice(0,4),['Project Name','Maintenance Date','Status','Remarks']);
    // task 14: the print controls sit in the header, beside Remarks, for the Head Engineer only
    if (role === 'Head Engineer') {
      assert.equal(table.querySelectorAll('th').length, 5);
      assert.ok(container.querySelector('button[aria-label="Print maintenance overview"]'));
      assert.ok(container.querySelector('select[aria-label="Print maintenance overview year"]'));
    } else {
      assert.equal(table.querySelectorAll('th').length, 4);
      assert.equal(container.querySelector('button[aria-label="Print maintenance overview"]'), null);
    }
    assert.deepEqual([...table.querySelectorAll('tbody td')].map(td=>td.textContent),['Road','','Scheduled','Initial remark']);
    assert.equal(table.querySelector('tbody tr td:last-child').colSpan, role === 'Head Engineer' ? 2 : 1);
    assert.match(table.textContent,/Road/); assert.match(table.textContent,/Scheduled/); assert.match(table.textContent,/Initial remark/);
    for (const status of ['Scheduled','In Progress','Deferred','Completed']) {
      await act(async () => root.render(React.createElement(MaintenanceModule, {...props,maintenanceRecords:[{...record,status,dateStarted:'2026-02-02',completedDate:'2026-03-03',remarks:'Updated remark'}]})));
      assert.deepEqual([...container.querySelectorAll('table tbody td')].map(td=>td.textContent),['Road',status === 'Completed' ? '2026-03-03' : '2026-02-02',status,'Updated remark']);
    }
    await act(async () => [...container.querySelectorAll('[role=tab]')].find(el=>el.textContent.includes('Maintenance History')).click());
    assert.ok(container.querySelector('[aria-label="View maintenance details for Road"]'));
    assert.equal(container.querySelector('[aria-label="Filter maintenance records by status"]'), null);
    const filter = container.querySelector('[aria-label="Filter by maintenance completion date"]');
    await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(filter, '2027-01-01'); filter.dispatchEvent(new window.Event('input', {bubbles:true})); filter.dispatchEvent(new window.Event('change', {bubbles:true})); });
    assert.equal(container.querySelector('[aria-label="View maintenance details for Road"]'), null);
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Clear').click());
    assert.ok(container.querySelector('[aria-label="View maintenance details for Road"]'));
  }
});

test('maintenance completion date field enforces the 2000 lower bound in the browser', async () => {
  const Dummy = ({children}) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, {get: () => Dummy});
  const {MaintenanceModule} = loadTs('src/app/components/MaintenanceModule.tsx', {
    '@/lib/inspection-selection':loadTs('src/lib/inspection-selection.ts'), '@/lib/project-form-validation':validation,
    './ui/textarea':{AutoGrowTextarea: props=>React.createElement('textarea',props)}, './ui/dialog':ui, './ui/select':ui,
    './ConfirmActionDialog':ui, './PrintDocument':ui, '@/lib/activity-log-client':{recordClientActivity:async()=>{}},
  });
  await reset();
  await act(async () => root.render(React.createElement(MaintenanceModule, {maintenanceRecords:[],localRoadList:[],inspections:[],userRole:'Staff - Encoder',currentUser:'User',onAddMaintenance(){},onEditMaintenance(){},onDeleteMaintenance(){},onUpdateStatus(){}})));
  await act(async () => [...container.querySelectorAll('button')].find(b=>b.textContent.includes('Schedule Maintenance')).click());
  const input = document.querySelector('.module-form-panel input[type=date]:not([readonly])');
  assert.equal(input.min,'2000-01-01'); assert.equal(input.max,'9999-12-31'); assert.equal(input.required,false);
  input.value='1999-12-31'; assert.equal(input.validity.rangeUnderflow,true);
  await act(async()=>input.checkValidity()); assert.equal(input.validationMessage, 'Please fill out valid date.');
  input.value='2000-01-01'; await act(async()=>input.dispatchEvent(new window.Event('input',{bubbles:true}))); assert.equal(input.validity.valid,true);
});

test('maintenance project dropdown shows any below-good component and removes scheduled projects', async () => {
  const Dummy = ({children}) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, {get: () => Dummy});
  const select = {Select: Dummy, SelectTrigger: Dummy, SelectValue: () => null, SelectContent: Dummy, SelectItem: ({children, value}) => React.createElement('span', {'data-option':value}, children)};
  const {MaintenanceModule} = loadTs('src/app/components/MaintenanceModule.tsx', {
    '@/lib/inspection-selection':loadTs('src/lib/inspection-selection.ts'), '@/lib/project-form-validation':validation,
    './ui/textarea':{AutoGrowTextarea: props=>React.createElement('textarea',props)}, './ui/dialog':ui, './ui/select':select,
    './ConfirmActionDialog':ui, './PrintDocument':ui, '@/lib/activity-log-client':{recordClientActivity:async()=>{}},
  });
  const roads = ['Fair','Bad','Poor','Good','Pending'].map(name => ({id:name, name:name+' Road', projectName:name+' Road', projectCategory:'Local Road'}));
  const inspections = roads.map(({id}) => ({id:'i'+id,localRoadId:id,date:'2026-01-01',conditionRatings:{Concrete:'Good',Drainage:id==='Pending'?'Fair':id},...(id==='Pending'?{isScheduledAnnualFollowUp:true}:{})}));
  const props = {maintenanceRecords:[],scheduledInspectionIds:[],localRoadList:roads,inspections,userRole:'Staff - Encoder',currentUser:'User',onAddMaintenance(){},onEditMaintenance(){},onDeleteMaintenance(){},onUpdateStatus(){}};
  await reset();
  await act(async () => root.render(React.createElement(MaintenanceModule, props)));
  await act(async () => [...container.querySelectorAll('button')].find(b=>b.textContent.includes('Schedule Maintenance')).click());
  const options = () => [...document.querySelectorAll('[data-option]')].map(e=>e.getAttribute('data-option')).filter(value=>roads.some(road=>road.id===value));
  assert.deepEqual(options(),['Fair','Bad','Poor']);
  assert.deepEqual([...document.querySelectorAll('[data-option]')].filter(e=>roads.some(road=>road.id===e.getAttribute('data-option'))).map(e=>e.textContent.trim()),['Fair Road','Bad Road','Poor Road']);
  await act(async () => root.render(React.createElement(MaintenanceModule, {...props,maintenanceRecords:[{id:'m',inspectionId:'iFair',localRoadId:'Fair',localRoadName:'Fair Road',scheduledDate:'2026-01-01',status:'Scheduled',cost:0,type:'Routine',description:'Repair'}]})));
  assert.deepEqual(options(),['Bad','Poor']);
  await act(async () => root.render(React.createElement(MaintenanceModule, {...props,scheduledInspectionIds:['iBad','iPoor']})));
  assert.deepEqual(options(),['Fair']);
});

test('maintenance edit uses linked inspection date as the minimum for both fields', async () => {
  const Dummy=({children})=>React.createElement(React.Fragment,null,children);
  const ui=new Proxy({}, {get:()=>Dummy});
  const {MaintenanceModule}=loadTs('src/app/components/MaintenanceModule.tsx',{
    '@/lib/inspection-selection':loadTs('src/lib/inspection-selection.ts'),'@/lib/project-form-validation':validation,
    './ui/textarea':{AutoGrowTextarea:props=>React.createElement('textarea',props)},'./ui/dialog':ui,'./ui/select':ui,
    './ConfirmActionDialog':ui,'./PrintDocument':ui,'@/lib/activity-log-client':{recordClientActivity:async()=>{}}
  });
  const props={maintenanceRecords:[{id:'m',localRoadId:'p',localRoadName:'Road',inspectionId:'i',type:'Corrective Maintenance',status:'In Progress',dateStarted:'2026-01-08',scheduledDate:'2026-02-01',description:'Repair',remarks:'Needed',cost:0}],localRoadList:[{id:'p',name:'Road'}],inspections:[{id:'i',localRoadId:'p',date:'2026-01-01'}],userRole:'Staff - Encoder',currentUser:'User',onAddMaintenance(){},onEditMaintenance(){},onDeleteMaintenance(){},onUpdateStatus(){}};
  await reset(); await act(async()=>root.render(React.createElement(MaintenanceModule,props)));
  await act(async()=>container.querySelector('[aria-label="Edit maintenance record for Road"]').click());
  const fields=[...document.querySelectorAll('.module-form-panel input[type=date]')];
  assert.equal(fields.length,2); assert.ok(fields.every(field=>field.min==='2026-01-02'));
  fields[0].value='2026-01-01'; await act(async()=>fields[0].checkValidity());
  assert.equal(fields[0].validationMessage,'Please fill out valid date.');
  fields[1].value='2026-01-01'; await act(async()=>fields[1].checkValidity());
  assert.equal(fields[1].validationMessage,'Please fill out valid date.');
});

test('the validation table names the project and lists show the barangay', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
    '@/lib/project-form-validation': validation,
  });
  const item = { id: 'p', name: 'Road A', projectName: 'Poblacion Road Project', roadName: 'Poblacion Road',
    location: 'Typewritten location', barangay: 'Anilao East', dateBuilt: '2020-01-01', condition: 'Good',
    lastInspection: '', actualCompletionDate: '2025-03-31', validationResult: 'Validated',
    annualValidationEntries: [{ year: 2026, dueDate: '2026-03-01', result: 'Pending', remarks: '' }] };
  const props = { data: [item], currentUser: 'User', onAdd() {}, onEdit() {}, onDelete() {} };

  await reset();
  await act(async () => root.render(React.createElement(LocalRoadList, { ...props, validationMode: true, userRole: 'Staff - Validator' })));
  assert.match(container.textContent, /Project Name/);       // task 16 — column header
  assert.match(container.textContent, /Poblacion Road Project/); // task 16 — the project name
  assert.match(container.querySelector('tbody').textContent, /Anilao East/);
  assert.doesNotMatch(container.querySelector('tbody').textContent, /Typewritten location/);

  await reset();
  await act(async () => root.render(React.createElement(LocalRoadList, { ...props, userRole: 'Staff - Encoder' })));
  assert.match(container.querySelector('article').textContent, /Anilao East/);
  assert.doesNotMatch(container.querySelector('article').textContent, /Typewritten location/);
  await reset();
});

test('a validated project replaces the encoder edit control with a Validated badge', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
    '@/lib/project-form-validation': validation,
  });
  const base = { id: 'p', name: 'Road', projectName: 'Poblacion Road', location: 'Town', barangay: 'Town',
    dateBuilt: '2020-01-01', condition: 'Good', actualCompletionDate: '2025-03-31' };
  const show = async annualValidationEntries => {
    await reset();
    await act(async () => root.render(React.createElement(LocalRoadList, {
      data: [{ ...base, annualValidationEntries }], currentUser: 'User', userRole: 'Staff - Encoder',
      onAdd() {}, onEdit() {}, onDelete() {},
    })));
  };

  await show([{ year: 2026, dueDate: '2026-03-01', result: 'Validated', remarks: 'OK' }]);
  assert.match(container.textContent, /Validated/);
  assert.equal(container.querySelector('[aria-label="Edit Poblacion Road"]'), null);

  await show([{ year: 2026, dueDate: '2026-03-01', result: 'Return for Revision', remarks: 'Fix' }]);
  assert.ok(container.querySelector('[aria-label="Edit Poblacion Road"]'));
  await reset();
});

test('task 11: the Head Engineer project table carries the five columns and an inspector dropdown', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui, './PrintDocument': ui,
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
    '@/lib/project-form-validation': validation,
  });
  const item = { id: 'p', name: 'Road', projectName: 'Poblacion Road', location: 'Anilao East', barangay: 'Anilao East',
    contractedAmount: '1250000', actualCompletionDate: '2025-03-31', dateBuilt: '2020-01-01', condition: 'Good',
    annualValidationEntries: [{ year: 2026, dueDate: '2026-03-01', result: 'Validated', remarks: 'Complete' }] };
  const props = { data: [item], inspectors: [{ id: 'i1', name: 'Juan Dela Cruz' }], onAssignInspector() {}, currentUser: 'User', onAdd() {}, onEdit() {}, onDelete() {} };

  await reset();
  await act(async () => root.render(React.createElement(LocalRoadList, { ...props, userRole: 'Head Engineer' })));
  for (const header of ['Project Name', 'Location', 'Contract Amount', 'Completion Date', 'Inspector']) {
    assert.match(container.textContent, new RegExp(header), header);
  }
  assert.deepEqual([...container.querySelectorAll('colgroup col')].map(col=>col.style.width), ['300px','160px','165px','155px','200px','48px']);
  assert.match(container.textContent, /Php 1,250,000\.00/);
  assert.match(container.textContent, /2025-03-31/);
  const select = container.querySelector('select[aria-label="Assign inspector for Poblacion Road"]');
  assert.ok(select);
  assert.match(select.textContent, /Not Assigned/);
  assert.match(select.textContent, /Juan Dela Cruz/);
  assert.equal(container.querySelector('[aria-label="Delete Poblacion Road"]') !== null, true);
  assert.equal(select.disabled, false);

  // @mine — the officer's flow: a project that is not validated yet cannot be assigned.
  await reset();
  const pendingItem = { ...item, annualValidationEntries: [{ year: 2026, dueDate: '2026-03-01', result: 'Pending', remarks: '' }] };
  await act(async () => root.render(React.createElement(LocalRoadList, { ...props, data: [pendingItem], userRole: 'Head Engineer' })));
  const pendingSelect = container.querySelector('select[aria-label="Assign inspector for Poblacion Road"]');
  assert.ok(pendingSelect);
  assert.equal(pendingSelect.disabled, true);
  assert.match(pendingSelect.textContent, /Awaiting Validation/);

  // task 13: both project lists filter by completion date instead of location
  for (const userRole of ['Head Engineer', 'Staff - Encoder']) {
    await reset();
    await act(async () => root.render(React.createElement(LocalRoadList, { ...props, userRole })));
    assert.ok(container.querySelector('input[aria-label="Filter by project completion date"]'), userRole);
  }
  // validation uses its listed date-built value
  await reset();
  await act(async () => root.render(React.createElement(LocalRoadList, { ...props, userRole: 'Staff - Validator', validationMode: true })));
  assert.ok(container.querySelector('input[aria-label="Filter validation by date"]'));
  await reset();
});

test('task 12: a project records up to five free-text coverage locations', async () => {
  let saved;
  await reset(); await render(value => { saved = value; });
  assert.ok(field('Location'));
  assert.equal(field('Location').placeholder, '');
  assert.doesNotMatch(container.textContent, /One line per location/);
  assert.equal(field('Location 2'), null);
  assert.equal(field('Road Name').tagName, 'TEXTAREA');
  assert.equal(field('Road Name').readOnly, true);
  assert.equal(field('Road Network ID No.').tagName, 'TEXTAREA');
  assert.equal(field('Road Name').parentElement.previousElementSibling.querySelector('[data-field]').dataset.field, 'Road Network ID No.');
  const addButton = () => [...container.querySelectorAll('button')].find(button => /Add location|Five locations/.test(button.textContent));
  assert.equal(addButton().textContent, 'Add location');
  for (let index = 2; index <= 5; index += 1) {
    await act(async () => addButton().click());
    assert.ok(field(`Location ${index}`), `expected line ${index}`);
    assert.equal(field(`Location ${index}`).placeholder, '');
  }
  assert.equal(container.querySelectorAll('input[data-field^="Location"]').length, 5);
  assert.equal(addButton().disabled, true);
  assert.equal(addButton().textContent, 'Five locations is the maximum');
  assert.equal(field('Location 6'), null);

  await fill(); await file();
  await change('Location', '  Sitio Dao, Anilao East, Mabini, Batangas  ');
  await change('Location 2', 'Sitio Balibago');
  assert.equal(field('Road Name').value, '  Sitio Dao, Anilao East, Mabini, Batangas  \nSitio Balibago');
  await change('Location 3', '   ');
  await submit();
  // Blank lines and surrounding padding are dropped, while both full locations are retained.
  assert.deepEqual(saved.locations, ['Sitio Dao, Anilao East, Mabini, Batangas', 'Sitio Balibago']);
  assert.equal(saved.location, 'Sitio Dao, Anilao East, Mabini, Batangas\nSitio Balibago');
  assert.equal(saved.roadName, saved.location);

  // editing a saved project shows every stored line, one per input
  await reset();
  let edited;
  await render(value => { edited = value; }, { item: { id: 'p1', name: 'Road', projectName: 'Road', location: 'Sitio Dao',
    locations: ['Sitio Dao', 'Anilao East, Mabini, Batangas'], dateBuilt: '2020-01-01', condition: 'Good' }, editId: 'p1' });
  assert.equal(field('Location').value, 'Sitio Dao');
  assert.equal(field('Location 2').value, 'Anilao East, Mabini, Batangas');
  assert.equal(field('Road Name').value, 'Sitio Dao\nAnilao East, Mabini, Batangas');
  await fill();
  await change('Location', 'Sitio Grahe, Anilao East');
  await change('Location 2', 'Sitio Dao, Anilao East');
  assert.equal(field('Road Name').value, 'Sitio Grahe, Anilao East\nSitio Dao, Anilao East');
  await file(); await submit();
  assert.deepEqual(edited.locations, ['Sitio Grahe, Anilao East', 'Sitio Dao, Anilao East']);
  assert.equal(edited.location, 'Sitio Grahe, Anilao East\nSitio Dao, Anilao East');
  assert.equal(edited.roadName, edited.location);
  await reset();
});

test('task 12: the project detail shows one box with a line per location', async () => {
  const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
  const ui = new Proxy({}, { get: () => Dummy });
  let sections;
  const { LocalRoadList } = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea': ui, './ui/dialog': ui, './ui/select': ui, './ConfirmActionDialog': ui,
    './PrintDocument': { PrintDocument: props => { sections = props.sections; return null; } },
    '@/lib/activity-log-client': { recordClientActivity: async () => {} },
    '@/lib/project-validation-workflow': loadTs('src/lib/project-validation-workflow.ts'),
    '@/lib/project-form-validation': validation,
  });
  const coverage = ['Sitio Dao', 'Anilao East, Mabini, Batangas'];
  const item = { id: 'p', name: 'Coastal Road', projectName: 'Coastal Road', roadName: 'Coastal Road',
    roadNetworkId: 'RN-12', location: coverage.join('\n'), locations: coverage, barangay: 'Anilao East',
    dateBuilt: '2020-01-01', condition: 'Good' };

  await reset();
  await act(async () => root.render(React.createElement(LocalRoadList, { data: [item], currentUser: 'User', userRole: 'Staff - Encoder', onAdd() {}, onEdit() {}, onDelete() {} })));
  assert.match(container.querySelector('article').textContent, /Anilao East/);
  await act(async () => container.querySelector('[aria-label="View details for Coastal Road"]').click());

  const box = container.querySelector('[data-field="Location"]');
  assert.ok(box, 'the detail view keeps a single location box');
  assert.match(box.className, /whitespace-pre-wrap/);
  assert.equal(box.textContent, coverage.join('\n')); // one line per location

  // Road Network ID No. and Road Name each get their own row
  const rowOf = text => {
    const label = [...container.querySelectorAll('p')].find(node => node.textContent === text);
    assert.ok(label, `missing the ${text} label`);
    return label.parentElement;
  };
  const idRow = rowOf('Road Network ID No.');
  const nameRow = rowOf('Road Name');
  assert.notEqual(idRow, nameRow, 'Road Network ID No. and Road Name are not the same row');
  assert.equal(idRow.parentElement, nameRow.parentElement);
  assert.doesNotMatch(idRow.parentElement.className, /md:grid-cols-2/);
  assert.match(idRow.parentElement.className, /grid-cols-1/);
  assert.equal(nameRow.querySelector('p:last-of-type').textContent, coverage.join('\n')); // the road name shows the same lines

  await act(async () => [...container.querySelectorAll('button')].find(button => /Print/.test(button.textContent)).click());
  const fields = sections.flatMap(section => section.fields);
  assert.equal(fields.find(entry => entry.label === 'Location').value, coverage.join('\n'));
  assert.equal(fields.find(entry => entry.label === 'Location').width, 'full');
  assert.equal(fields.find(entry => entry.label === 'Road Name').value, coverage.join('\n'));
  assert.equal(fields.find(entry => entry.label === 'Road Name').width, 'full');
  assert.equal(fields.find(entry => entry.label === 'Road Network ID No.').width, 'full');
  await reset();
});

test('task 12: the server rejects more than five locations or an overlong line', () => {
  assert.equal(validation.projectLocationsError(['a', 'b']), null);
  assert.equal(validation.projectLocationsError(undefined), null);
  assert.match(validation.projectLocationsError(['1', '2', '3', '4', '5', '6']), /at most 5 locations/);
  assert.match(validation.projectLocationsError(['x'.repeat(501)]), /500 characters or fewer/);
  assert.equal(validation.projectLocationsError(['x'.repeat(500)]), null);
});

test('project and validation search and date filters match the fields shown in each list', async () => {
  const Dummy = ({children}) => React.createElement(React.Fragment,null,children);
  const ui = new Proxy({}, {get:()=>Dummy});
  const {LocalRoadList} = loadTs('src/app/components/LocalRoadList.tsx', {
    './ui/textarea':ui,'./ui/dialog':ui,'./ui/select':ui,'./ConfirmActionDialog':ui,'./PrintDocument':ui,
    '@/lib/activity-log-client':{recordClientActivity:async()=>{}},'@/lib/project-validation-workflow':loadTs('src/lib/project-validation-workflow.ts'),'@/lib/project-form-validation':validation,
  });
  const item={id:'p',name:'Hidden road',projectName:'Visible Project',location:'Hidden sitio',barangay:'Anilao East',dateBuilt:'2024-01-05',actualCompletionDate:'2024-09-10',contractedAmount:'1234',condition:'Good',lastInspection:'2025-01-01',annualValidationEntries:[{year:2025,dueDate:'2025-08-11',result:'Pending',remarks:''}]};
  const props={data:[item],currentUser:'User',onAdd(){},onEdit(){},onDelete(){}};
  const setInput=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));el.dispatchEvent(new window.Event('change',{bubbles:true}));});
  for (const [role,validationMode,dateLabel,visibleDate,otherDate] of [
    ['Staff - Encoder',false,'Filter by project completion date','2024-01-05','2024-09-10'],
    ['Head Engineer',false,'Filter by project completion date','2024-09-10','2024-01-05'],
    ['Staff - Validator',true,'Filter validation by date','2024-01-05','2024-09-10'],
  ]) {
    await reset(); await act(async()=>root.render(React.createElement(LocalRoadList,{...props,userRole:role,validationMode})));
    const date=container.querySelector(`[aria-label="${dateLabel}"]`), search=container.querySelector('input[type=search]');
    assert.ok(date); assert.equal(search.placeholder,'Search...');
    await setInput(date,otherDate); assert.match(container.textContent,/0 records listed/);
    await setInput(date,visibleDate); assert.match(container.textContent,/1 records listed/);
    await setInput(search,'Anilao East'); assert.match(container.textContent,/1 records listed/);
    await setInput(search,'Hidden sitio'); assert.match(container.textContent,/0 records listed/);
    await setInput(search,'Visible Project'); assert.match(container.textContent,/1 records listed/);
  }
  await reset();
});

test('maintenance filters follow visible dates and fields in history and overview', async () => {
  const Dummy=({children})=>React.createElement(React.Fragment,null,children); const ui=new Proxy({}, {get:()=>Dummy});
  const {MaintenanceModule}=loadTs('src/app/components/MaintenanceModule.tsx',{'@/lib/inspection-selection':loadTs('src/lib/inspection-selection.ts'),'@/lib/project-form-validation':validation,'./ui/textarea':ui,'./ui/dialog':ui,'./ui/select':ui,'./ConfirmActionDialog':ui,'./PrintDocument':ui,'@/lib/activity-log-client':{recordClientActivity:async()=>{}}});
  const props={maintenanceRecords:[{id:'m',localRoadId:'p',localRoadName:'Old Road',inspectionId:'i',type:'Routine',scheduledDate:'2026-04-01',dateStarted:'2026-03-01',status:'In Progress',cost:0,description:'Hidden activities',remarks:'Visible overview remark'}],localRoadList:[{id:'p',name:'Road',projectName:'Visible Project',location:'Hidden sitio',barangay:'Anilao East'}],inspections:[{id:'i',localRoadId:'p',date:'2026-02-01'}],onAddMaintenance(){},onEditMaintenance(){},onDeleteMaintenance(){},onUpdateStatus(){},userRole:'Staff - Encoder',currentUser:'User'};
  await reset(); await act(async()=>root.render(React.createElement(MaintenanceModule,props)));
  const date=container.querySelector('[aria-label="Filter by maintenance completion date"]'),search=container.querySelector('input[type=search]');
  const setInput=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));el.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await setInput(date,'2026-03-01'); assert.match(container.textContent,/0 records listed/);
  await setInput(date,'2026-02-01'); assert.match(container.textContent,/1 records listed/);
  await setInput(search,'Anilao East'); assert.match(container.textContent,/1 records listed/);
  await setInput(search,'Hidden activities'); assert.match(container.textContent,/0 records listed/);
  await setInput(search,''); await act(async()=>[...container.querySelectorAll('[role=tab]')].find(el=>el.textContent.includes('Overview')).click());
  assert.match(container.textContent,/0 records listed/);
  await setInput(date,'2026-03-01'); assert.match(container.textContent,/1 records listed/);
  await setInput(search,'overview remark'); assert.match(container.textContent,/1 records listed/);
  await setInput(search,'Anilao East'); assert.match(container.textContent,/0 records listed/);
  await reset();
});

test('maintenance overview year and search filters constrain both table and print', async () => {
  const printed=[]; const Dummy=({children})=>React.createElement(React.Fragment,null,children);const ui=new Proxy({}, {get:()=>Dummy});
  const {MaintenanceModule}=loadTs('src/app/components/MaintenanceModule.tsx',{'@/lib/inspection-selection':loadTs('src/lib/inspection-selection.ts'),'@/lib/project-form-validation':validation,'./ui/textarea':ui,'./ui/dialog':ui,'./ui/select':ui,'./ConfirmActionDialog':ui,'./PrintDocument':{PrintDocument:props=>{printed.push(props);return null;}},'@/lib/activity-log-client':{recordClientActivity:async()=>{}}});
  const records=[{id:'a',localRoadId:'a',localRoadName:'Alpha',dateStarted:'2025-01-01',status:'In Progress',remarks:'Alpha note'},{id:'b',localRoadId:'b',localRoadName:'Beta',dateStarted:'2026-01-01',status:'In Progress',remarks:'Beta note'}];
  await reset();await act(async()=>root.render(React.createElement(MaintenanceModule,{maintenanceRecords:records,localRoadList:[],inspections:[],userRole:'Head Engineer',currentUser:'User',onAddMaintenance(){},onEditMaintenance(){},onDeleteMaintenance(){},onUpdateStatus(){}})));
  await act(async()=>[...container.querySelectorAll('[role=tab]')].find(e=>e.textContent.includes('Overview')).click());
  const year=container.querySelector('[aria-label="Print maintenance overview year"]');
  await act(async()=>{year.value='2026';year.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.deepEqual([...container.querySelectorAll('tbody tr')].map(row=>row.cells[0].textContent),['Beta']);
  assert.ok(container.querySelector('tbody tr td:nth-child(3) span').className.includes('whitespace-nowrap'));
  await act(async()=>container.querySelector('[aria-label="Print maintenance overview"]').click());
  assert.deepEqual(printed.at(-1).sections.map(section=>section.title),['Beta']);
  const search=container.querySelector('input[type=search]');
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(search,'Alpha');search.dispatchEvent(new window.Event('input',{bubbles:true}));});
  assert.match(container.textContent,/0 records listed/);
  await reset();
});


test('returned validation status shows the year in the badge and a bold header', async () => {
  const Dummy=({children})=>React.createElement(React.Fragment,null,children);const ui=new Proxy({}, {get:()=>Dummy});
  const {LocalRoadList}=loadTs('src/app/components/LocalRoadList.tsx',{'./ui/textarea':ui,'./ui/dialog':ui,'./ui/select':ui,'./ConfirmActionDialog':ui,'./PrintDocument':ui,'@/lib/activity-log-client':{recordClientActivity:async()=>{}},'@/lib/project-validation-workflow':loadTs('src/lib/project-validation-workflow.ts'),'@/lib/project-form-validation':validation});
  const item={id:'p',name:'Road',actualCompletionDate:'2020-01-01',annualValidationEntries:[{year:2021,dueDate:'2020-12-01',result:'Return for Revision',remarks:'Fix details'}]};
  await reset();await act(async()=>root.render(React.createElement(LocalRoadList,{data:[item],validationMode:true,userRole:'Staff - Validator',currentUser:'User',onAdd(){},onEdit(){},onDelete(){}})));
  const header=[...container.querySelectorAll('th')].find(th=>th.textContent==='Validation Status');assert.ok(header.className.includes('font-bold'));
  const table=container.querySelector('table');assert.equal(table.querySelectorAll('col')[1].style.width,'290px');assert.ok(table.className.includes('min-w-[1100px]'));
  const cell=container.querySelector('tbody tr').cells[1];assert.equal(cell.children.length,1);assert.equal(cell.children[0].textContent.trim(),'Return for Revision · Annual 2021');assert.ok(cell.children[0].className.includes('rounded-full'));
  await reset();
});

test('AI recommendations render project data in a prioritized table', async () => {
  const {AIPredictionModule}=loadTs('src/app/components/AIPredictionModule.tsx');
  const roads=[{id:'a',name:'Road A',projectName:'Project Alpha',projectCategory:'Local Road'}, {id:'b',name:'Road B',projectName:'Project Beta',projectCategory:'Bridge'}];
  const inspections=roads.map(r=>({localRoadId:r.id,date:'2026-01-01',conditionRatings:{Concrete:'Fair'}}));
  const predictions=roads.map((r,i)=>({localRoadId:r.id,localRoadName:r.name,type:'Wrong category',condition:'Fair',priorityScore:i+1,justification:'Cracks',recommendation:'Repair'}));
  await reset();await act(async()=>root.render(React.createElement(AIPredictionModule,{localRoadData:roads,inspections,predictions,onPredictionsChange(){}})));
  assert.deepEqual([...container.querySelectorAll('th')].map(x=>x.textContent),['Project Name','Category','Condition','AI Justification','Recommended Maintenance Activity']);
  const rows=[...container.querySelectorAll('tbody tr')];assert.equal(rows.length,2);assert.deepEqual([...rows[0].cells].map(x=>x.textContent),['Project Beta','Bridge','Fair','Cracks','Repair']);
  await reset();
});
