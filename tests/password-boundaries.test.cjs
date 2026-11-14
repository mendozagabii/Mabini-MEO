const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative, mocks) {
  const filename = path.resolve(__dirname, '..', relative);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const orig = mod.require.bind(mod); mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : orig(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, filename);
  return mod.exports;
}
const response = { NextResponse: { json: (body, init) => ({body, status:init?.status || 200}) } };
const request = body => ({ json: async () => body });
let written = [];
const admin = {
  from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data:null})})}), update: () => ({eq: () => ({select: () => ({single: async () => ({data:{},error:null})})})})}),
  auth: { admin: {createUser: async ({password}) => {written.push(password); return {data:{user:{id:'u'}}};}, updateUserById: async (_id,{password}) => {written.push(password); return {error:null};} } },
};
const api = {requireRole:async()=>({auth:{admin,userId:'head',profile:{username:'head'}}}),withRefresh:x=>x};
const supabase = {toDbRole:()=> 'encoder',createAnonClient:()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}})}}),createAdminClient:()=>admin};
const account = load('src/app/api/auth/status/route.ts', {'next/server':response,'@/lib/api':api,'@/lib/supabase':supabase,'@/lib/supabase-data':{addActivityLog:async()=>{},mapProfile:()=>({})}});
const reset = load('src/app/api/auth/reset-password/route.ts', {'next/server':response,'@/lib/supabase':supabase});

test('new accounts and reset links enforce 8 through 64 characters on the server', async () => {
  for (const length of [7,8,64,65]) {
    written=[];
    const password='a'.repeat(length);
    const created=await account.POST(request({name:'Alice',email:'a@example.test',role:'Staff - Encoder',status:'Active',password}));
    assert.equal(created.status, length >= 8 && length <=64 ? 201 : 400);
    if (created.status===400) assert.match(created.body.message,/between 8 and 64/);
    assert.equal(written.length,created.status===201 ? 1 : 0);
    written=[];
    const result=await reset.POST(request({token:'valid',password}));
    assert.equal(result.status,length >=8 && length <=64 ? 200 : 400);
    if (result.status===400) assert.match(result.body.message,/between 8 and 64/);
    assert.equal(written.length,result.status===200 ? 1 : 0);
  }
});

test('editing an account rejects a password outside the limits', async () => {
  for (const length of [7,65]) {
    written=[];
    const result=await account.PATCH(request({id:'u',name:'Alice',username:'alice',email:'a@example.test',role:'Staff - Encoder',status:'Active',password:'x'.repeat(length)}));
    assert.equal(result.status,400); assert.match(result.body.message,/between 8 and 64/); assert.equal(written.length,0);
  }
});
