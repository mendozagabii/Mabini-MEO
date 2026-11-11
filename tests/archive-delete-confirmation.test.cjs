const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
const React = require('react');
const { act } = require('react-dom/test-utils');
const { createRoot } = require('react-dom/client');
const root = createRoot(document.getElementById('root'));
after(() => { act(() => root.unmount()); dom.window.close(); });
const context = React.createContext(() => {});
const Dummy = ({ children }) => React.createElement(React.Fragment, null, children);
const select = {
  Select: ({ children, onValueChange }) => React.createElement(context.Provider, { value: onValueChange }, children),
  SelectItem: ({ children, value }) => { const change = React.useContext(context); return React.createElement('button', { onClick: () => change(value) }, children); },
  SelectContent: Dummy, SelectTrigger: Dummy, SelectValue: () => null,
};
const filename = path.resolve(__dirname, '../src/app/components/UserManagementModule.tsx');
const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
const orig = mod.require.bind(mod);
mod.require = name => name === './ui/select' ? select : name === './ui/dropdown-menu' ? new Proxy({}, {get: () => Dummy}) : orig(name);
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true} }).outputText, filename);
const calls = [];
global.fetch = async (url, options = {}) => {
  calls.push({ url, method: options.method || 'GET' });
  const archived = url.startsWith('/api/local-road') ? [{id:'p',projectName:'Project P'}] : url.startsWith('/api/inspections') ? [{id:'i',projectName:'Project I',date:'2026-01-01'}] : url.startsWith('/api/maintenance') ? [{id:'m',projectName:'Project M',scheduledDate:'2026-02-01'}] : [];
  return { ok: true, json: async () => ({ users: [], archivedUsers: [], archived, logs: [], locked: {} }) };
};
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);

test('archived project, inspection and maintenance deletion requires explicit confirmation', async () => {
  await act(async () => root.render(React.createElement(mod.exports.UserManagementModule, { currentUserEmail: 'test@example.com' })));
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Archived (')).click());
  for (const [filter, label, url] of [['Project (1)', 'Project P', '/api/local-road?id=p&permanent=true'], ['Inspections (1)', 'Project I', '/api/inspections?id=i&permanent=true'], ['Maintenance (1)', 'Project M', '/api/maintenance?permanent=true']]) {
    await act(async () => button(filter).click());
    await act(async () => button('Delete permanently').click());
    assert.match(document.body.textContent, new RegExp(`Permanently delete.*${label}.*cannot be undone`));
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 0);
    await act(async () => button('Cancel').click());
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 0);
    await act(async () => button('Delete permanently').click());
    await act(async () => button('Delete').click());
    assert.equal(calls.filter(call => call.method === 'DELETE').at(-1).url, url);
    calls.length = 0;
  }
});
