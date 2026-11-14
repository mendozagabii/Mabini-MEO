const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module'); const ts = require('typescript');
const {JSDOM} = require('jsdom'); const dom = new JSDOM('<div id="root"></div>');
Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const React = require('react'); const {act} = require('react-dom/test-utils'); const {createRoot} = require('react-dom/client');
const root = createRoot(document.getElementById('root')); after(()=>{act(()=>root.unmount());dom.window.close();});
const Dummy=({children})=>React.createElement(React.Fragment,null,children);
const mocks={
 './ui/select':{Select:Dummy,SelectTrigger:Dummy,SelectValue:Dummy,SelectContent:Dummy,SelectItem:Dummy},
 './ui/popover':{Popover:Dummy,PopoverTrigger:Dummy,PopoverContent:({children,className})=>React.createElement('div',{className},children)},
 './ui/calendar':{Calendar:({onSelect})=>React.createElement('button',{onClick:()=>onSelect(new Date(2026,10,14))},'Choose date')},
};
const filename=path.resolve(__dirname,'../src/app/components/FilterControls.tsx'); const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));const original=mod.require.bind(mod);mod.require=name=>Object.hasOwn(mocks,name)?mocks[name]:original(name);mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
test('styled calendar selection and clear update the date input and filter together', async()=>{
  const input=document.createElement('input'); input.type='date';let selected='';
  await act(async()=>root.render(React.createElement(mod.exports.DateCalendarButton,{inputRef:{current:input},value:'',onChange:value=>{selected=value;},label:'Choose filter date'})));
  assert.ok(document.querySelector('[aria-label="Choose filter date"]'));assert.ok(document.querySelector('.rounded-\\[18px\\]'));
  await act(async()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Choose date').click());
  assert.equal(input.value,'2026-11-14');assert.equal(selected,'2026-11-14');
  await act(async()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Clear').click());
  assert.equal(input.value,'');assert.equal(selected,'');
});
