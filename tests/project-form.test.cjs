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
global.fetch = async (url, options) => {
  uploadCalls.push({ url, options });
  return url === '/api/local-road/attachment-upload'
    ? { ok: true, json: async () => ({ signedUrl: 'https://storage.example.test/signed', path: 'project-uploads/test/uuid.pdf', type: 'application/pdf' }) }
    : { ok: true };
};
const { LocalRoadForm } = loadTs('src/app/components/LocalRoadForm.tsx', {
  './ui/textarea': { AutoGrowTextarea: props => React.createElement('textarea', props) },
  '@/lib/project-form-validation': validation,
  '@/lib/attachment-validation': attachmentValidation,
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
    'Contractor Name': 'Company', 'Contractor Address': 'Address', 'Contact Information': '123', 'PCAD License No.': 'ABC',
    'Source of Funds': 'Municipal', 'Appropriation': '1234.56', 'Contracted Amount': '1000.25', 'Adjust Project Cost': '999.99',
    'Completion Date': '2026-02-01', 'Completion Percentage': '100', 'Turnover and Acceptance Date': '2026-02-02',
  })) await change(name, value);
}

test('currency and date helpers preserve decimals and require a four-digit year', () => {
  assert.equal(validation.formatProjectCurrency('1234567.89'), '1,234,567.89');
  assert.equal(validation.formatProjectCurrency('1234.'), '1,234.');
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
  assert.equal(saved.adjustProjectCost, '999.99'); assert.equal(saved.dateStarted, '2026-01-01');
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
  for (const input of inputs) { assert.equal(input.min, '1000-01-01'); assert.equal(input.max, '9999-12-31'); }
  assert.doesNotMatch(container.textContent, /No\. of Extensions \*/);
});

test('each editable project field blocks submission when empty', async () => {
  let saved; await act(async () => root.render(null)); await render(value => { saved = value; });
  await fill(); await file();
  const names = ['Project / Program / Activity Name', 'Project Category', 'Project Description', 'Location', 'Date Started', 'Target Completion Date', 'Actual Completion Date', 'Road Network ID No.', 'Barangay', 'Components', 'Description', 'Contractor Name', 'Contractor Address', 'Contact Information', 'PCAD License No.', 'Source of Funds', 'Appropriation', 'Contracted Amount', 'Adjust Project Cost', 'Completion Date', 'Completion Percentage', 'Turnover and Acceptance Date'];
  for (const name of names) {
    const old = field(name).value;
    await change(name, ''); await submit();
    assert.equal(field(name).validationMessage, 'Please fill out this field.', name);
    assert.doesNotMatch(container.textContent, /Complete all required fields/);
    assert.equal(saved, undefined, name);
    await change(name, old);
  }
});

test('rejects incomplete currency, out-of-range percentage, and non-four-digit date', async () => {
  let saved; await act(async () => root.render(null)); await render(value => { saved = value; });
  await fill(); await file();
  await change('Appropriation', '1000.'); await submit();
  assert.equal(field('Appropriation').validationMessage, 'Enter a valid amount.');
  await change('Appropriation', '1000.50');
  await change('Completion Percentage', '101'); await submit();
  assert.equal(field('Completion Percentage').validity.rangeOverflow, true);
  await change('Completion Percentage', '100');
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
