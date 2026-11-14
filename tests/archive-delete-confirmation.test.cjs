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
mod.require = name => name === './FilterControls' ? { DateCalendarButton: () => null, StyledFilterSelect: ({label,value,onChange,options}) => React.createElement('select', {'aria-label':label,value,onChange:e=>onChange(e.target.value)}, options.map(o=>React.createElement('option',{key:o.value,value:o.value},o.label))) } : name === './ui/select' ? select : name === './ui/dropdown-menu' ? new Proxy({}, {get: () => Dummy}) : name === '@/lib/retention' ? { purgeScheduleLabel: () => 'Deletes on 2026-12-01 (20 days left)' } : orig(name);
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true} }).outputText, filename);
const calls = [];
let testLogs = [];
global.fetch = async (url, options = {}) => {
  calls.push({ url, method: options.method || 'GET' });
  const archived = url.startsWith('/api/local-road') ? [{id:'p',projectName:'Project P'}] : url.startsWith('/api/inspections') ? [{id:'i',projectName:'Project I',date:'2026-01-01'}] : url.startsWith('/api/maintenance') ? [{id:'m',projectName:'Project M',scheduledDate:'2026-02-01'}] : [];
  return { ok: true, json: async () => ({ users: [{userId:'u1',name:'Alice Encoder',email:'a@example.com',username:'alice',role:'Staff - Encoder',status:'Active'},{userId:'u2',name:'Bob Inspector',email:'b@example.com',username:'bob',role:'Staff - Inspector',status:'Inactive'}], archivedUsers: [{userId:'u',name:'Archived User',email:'user@example.com',username:'user',role:'Staff - Encoder',status:'Inactive'}], archived, logs: testLogs, locked: {} }) };
};
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);

test('archived project, inspection and maintenance deletion requires explicit confirmation', async () => {
  await act(async () => root.render(React.createElement(mod.exports.UserManagementModule, { currentUserEmail: 'test@example.com' })));
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Archived (')).click());
  for (const action of ['Restore', 'Delete permanently']) {
    const icon = document.querySelector(`[aria-label="${action} Archived User"]`);
    assert.ok(icon.querySelector('svg')); assert.equal(icon.textContent.trim(), '');
  }
  for (const [filter, label, url] of [['Project (1)', 'Project P', '/api/local-road?id=p&permanent=true'], ['Inspections (1)', 'Project I', '/api/inspections?id=i&permanent=true'], ['Maintenance (1)', 'Project M', '/api/maintenance?permanent=true']]) {
    await act(async () => button(filter).click());
    const remove = document.querySelector(`[aria-label="Delete permanently ${label}"]`);
    const restore = document.querySelector(`[aria-label="Restore ${label}"]`);
    assert.ok(remove.querySelector('svg')); assert.ok(restore.querySelector('svg'));
    assert.equal(remove.textContent.trim(), ''); assert.equal(restore.textContent.trim(), '');
    await act(async () => remove.click());
    assert.match(document.body.textContent, new RegExp(`Permanently delete.*${label}.*cannot be undone`));
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 0);
    await act(async () => button('Cancel').click());
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 0);
    await act(async () => document.querySelector(`[aria-label="Delete permanently ${label}"]`).click());
    await act(async () => button('Delete').click());
    assert.equal(calls.filter(call => call.method === 'DELETE').at(-1).url, url);
    calls.length = 0;
  }
});

test('account role and status filters work together and activity dates use four-digit bounds', async () => {
  await act(async()=>root.render(null));
  await act(async()=>root.render(React.createElement(mod.exports.UserManagementModule,{currentUserEmail:'test@example.com'})));
  const selectRole=document.querySelector('[aria-label="Filter users by role"]');
  const selectStatus=document.querySelector('[aria-label="Filter users by status"]');
  const change=async (el,value)=>act(async()=>{el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await change(selectRole,'Staff - Encoder'); assert.match(document.body.textContent,/Alice Encoder/); assert.doesNotMatch(document.body.textContent,/Bob Inspector/);
  await change(selectStatus,'Inactive'); assert.doesNotMatch(document.body.textContent,/Alice Encoder/);
  await change(selectRole,'All Roles'); assert.match(document.body.textContent,/Bob Inspector/); assert.doesNotMatch(document.body.textContent,/Alice Encoder/);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Activity Logs')).click());
  const date=document.querySelector('[aria-label="Filter activity logs by date"]'); assert.equal(date.min,'1000-01-01'); assert.equal(date.max,'9999-12-31');
});

test('step 8: the archive screen says when each record is deleted automatically', async () => {
  await act(async () => root.render(null));
  await act(async () => root.render(React.createElement(mod.exports.UserManagementModule, { currentUserEmail: 'test@example.com' })));
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Archived (')).click());
  assert.match(document.body.textContent, /kept for 30 days and then deleted automatically/i);

  for (const filter of ['Project (1)', 'Inspections (1)', 'Maintenance (1)']) {
    await act(async () => button(filter).click());
    assert.match(document.body.textContent, /Deletes/);
    assert.match(document.body.textContent, /Deletes on 2026-12-01 \(20 days left\)/);
  }
  await act(async () => root.render(null));
});


test('activity date filter retains partial input and filters the displayed log date', async () => {
  testLogs=[{id:'l1',user:'alice',action:'Opened record',timestamp:'2026-10-12T23:00:00Z',details:'First'}, {id:'l2',user:'bob',action:'Changed record',timestamp:'2026-10-13T01:00:00Z',details:'Second'}];
  await act(async()=>root.render(null));
  await act(async()=>root.render(React.createElement(mod.exports.UserManagementModule,{currentUserEmail:'test@example.com'})));
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Activity Logs')).click());
  const date=document.querySelector('[aria-label="Filter activity logs by date"]');
  assert.equal(date.hasAttribute('value'),false);
  const setDate=async value=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(date,value);date.dispatchEvent(new window.Event('input',{bubbles:true}));date.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await setDate('2026-10-12'); assert.match(document.body.textContent,/Opened record/); assert.doesNotMatch(document.body.textContent,/Changed record/);
  await setDate(''); assert.match(document.body.textContent,/Opened record/); // incomplete editing does not reset the selection
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Clear').click());
  assert.match(document.body.textContent,/Opened record/); assert.match(document.body.textContent,/Changed record/);
  assert.equal(document.querySelector('[aria-label="Filter by user"]').textContent,'All Users');
  testLogs=[];
});


test('activity log loading never displays example data and reports fetch errors', async () => {
  const originalFetch=global.fetch; let resolveLogs;
  global.fetch=(url,options)=>url==='/api/activity-logs'?new Promise(resolve=>{resolveLogs=resolve;}):originalFetch(url,options);
  await act(async()=>root.render(null));await act(async()=>root.render(React.createElement(mod.exports.UserManagementModule,{currentUserEmail:'test@example.com'})));
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Activity Logs')).click());
  assert.match(document.body.textContent,/Loading activity logs/);assert.doesNotMatch(document.body.textContent,/Created user John Encoder|Updated system settings/);
  await act(async()=>resolveLogs({ok:false,json:async()=>({message:'Logs unavailable'})}));
  assert.match(document.body.textContent,/Logs unavailable/);global.fetch=originalFetch;
});

test('empty archive categories show an icon', async () => {
  const originalFetch=global.fetch;
  global.fetch=async (url,options)=>{const response=await originalFetch(url,options);const payload=await response.json();return {...response,json:async()=>({...payload,archived:[],archivedUsers:[]})};};
  await act(async()=>root.render(null));await act(async()=>root.render(React.createElement(mod.exports.UserManagementModule,{currentUserEmail:'test@example.com'})));
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Archived (')).click());
  for(const [type,text] of [['Project (0)','No archived project records'],['Inspections (0)','No archived inspections'],['Maintenance (0)','No archived maintenance records']]) {
    await act(async()=>button(type).click());const p=[...document.querySelectorAll('p')].find(e=>e.textContent===text);assert.ok(p);assert.ok(p.parentElement.querySelector('svg'));
  }
  global.fetch=originalFetch;
});
