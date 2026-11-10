// Exercises the real form in a DOM with an isolated select and no database.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, File: dom.window.File, FileReader: dom.window.FileReader, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
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
const selectMocks = {
  Select: ({ value, onValueChange }) => React.createElement('select', { 'aria-label': 'Project category', 'data-field': 'Project Category', value, onChange: e => onValueChange(e.target.value) },
    ['', 'National Road', 'Other Specify'].map(value => React.createElement('option', { key: value, value }, value))),
  SelectContent: () => null, SelectItem: () => null, SelectTrigger: () => null, SelectValue: () => null,
};
const { LocalRoadForm } = loadTs('src/app/components/LocalRoadForm.tsx', {
  './ui/textarea': { AutoGrowTextarea: props => React.createElement('textarea', props) },
  './ui/select': selectMocks,
  '@/lib/project-form-validation': validation,
});
const container = document.getElementById('root');
const root = createRoot(container);
after(() => { act(() => root.unmount()); dom.window.close(); });
const render = async onSave => act(async () => root.render(React.createElement(LocalRoadForm, { onSave, onClose() {} })));
const field = name => container.querySelector(`[data-field="${name}"]`);
async function change(name, value) {
  const el = field(name); assert.ok(el, `missing field ${name}`);
  await act(async () => {
    const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event(el instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function submit() { await act(async () => container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }
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
  assert.match(container.textContent, /Select a project category before submitting/);
  assert.match(container.textContent, /Turnover Attachment/);
  assert.equal(saved, undefined);
  await change('Project Category', 'National Road'); await submit();
  assert.match(container.textContent, /Turnover Attachment/);
  await file();
  await act(async () => { await submit(); await new Promise(resolve => setTimeout(resolve, 30)); });
  assert.ok(saved); assert.equal(saved.noOfExtensions, '');
  assert.equal(saved.appropriation, '1234.56'); assert.equal(saved.contractedAmount, '1000.25');
  assert.equal(saved.adjustProjectCost, '999.99'); assert.equal(saved.dateStarted, '2026-01-01');
  assert.equal(saved.attachments[0].category, 'Turnover Certificate');
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
    assert.match(container.textContent, /Complete all required fields/);
    assert.ok(container.textContent.includes(name), `${name} should be named`);
    assert.equal(saved, undefined, name);
    await change(name, old);
  }
});

test('rejects incomplete currency, out-of-range percentage, and non-four-digit date', async () => {
  let saved; await act(async () => root.render(null)); await render(value => { saved = value; });
  await fill(); await file();
  await change('Appropriation', '1000.'); await submit();
  assert.match(container.textContent, /Enter a valid amount for Appropriation/);
  await change('Appropriation', '1000.50');
  await change('Completion Percentage', '101'); await submit();
  assert.match(container.textContent, /Please correct the highlighted field/);
  await change('Completion Percentage', '100');
  await change('Date Started', '10000-01-01'); await submit();
  assert.match(container.textContent, /Date Started must have a four-digit year/);
  assert.equal(saved, undefined);
});

test('Other Specify requires a custom category and remains editable when cleared', async () => {
  await act(async () => root.render(null)); await render(() => {}); await fill(); await file();
  await change('Project Category', 'Other Specify'); await submit();
  assert.match(container.textContent, /Enter a category when Other Specify is selected/);
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
  assert.match(container.textContent, /Enter a category when Other Specify is selected/);
});
