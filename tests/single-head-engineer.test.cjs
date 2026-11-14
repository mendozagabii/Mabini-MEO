const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path'); const Module=require('node:module'); const ts=require('typescript');
let writes=0;let existingHead=true;
const profile={email:'staff@example.test',role:'encoder'};
const admin={from:()=>({select:()=>{let field='';return {eq:(key)=>{field=key;return {is:()=>({neq:()=>({limit:async()=>({data:existingHead?[{id:'head'}]:[],error:null})}),limit:async()=>({data:existingHead?[{id:'head'}]:[],error:null}),maybeSingle:async()=>({data:profile,error:null})}),maybeSingle:async()=>({data:field==='id'?{role:'head_engineer'}:null,error:null})};}}},update:()=>{writes++;return {eq:async()=>({error:null,count:1})};}}),auth:{admin:{createUser:async()=>{writes++;return {data:{user:{id:'new'}}};},updateUserById:async()=>{writes++;return {error:null};}}}};
const mocks={'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status||200})}},'@/lib/api':{requireRole:async()=>({auth:{admin,userId:'head',profile:{username:'head'}}}),withRefresh:x=>x},'@/lib/supabase-data':{},'@/lib/supabase':{toDbRole:role=>role==='Head Engineer'?'head_engineer':'encoder'}};
const filename=path.resolve(__dirname,'../src/app/api/auth/status/route.ts');const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));const orig=mod.require.bind(mod);mod.require=n=>Object.hasOwn(mocks,n)?mocks[n]:orig(n);mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);
const request=body=>({json:async()=>body});
test('existing head blocks creating, promoting, and restoring another head before writing',async()=>{
 writes=0;existingHead=true;
 const created=await mod.exports.POST(request({name:'New',email:'new@example.test',password:'12345678',role:'Head Engineer',status:'Active'}));assert.equal(created.status,409);assert.match(created.body.message,/Only one/);
 const edited=await mod.exports.PATCH(request({id:'staff',name:'Staff',email:'staff@example.test',username:'staff',role:'Head Engineer',status:'Active',password:''}));assert.equal(edited.status,409);assert.match(edited.body.message,/Only one/);
 const restored=await mod.exports.PUT(request({userId:'old',action:'restore'}));assert.equal(restored.status,409);assert.match(restored.body.message,/Only one/);assert.equal(writes,0);
});
