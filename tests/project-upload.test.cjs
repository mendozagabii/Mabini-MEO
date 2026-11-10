// @mine — isolated auth, Storage and database mocks; no live writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod); mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(code, filename); return mod.exports;
}
const attachment = load('src/lib/attachment-validation.ts');
const USER = '6f974a18-9403-429b-bd71-bf8dd7798599';
const PATH = `project-uploads/${USER}/25d85430-35e7-4bdf-a6b8-4a508da9f914.pdf`;
const staged = { name: 'turnover.pdf', type: 'application/pdf', size: 100, dataUrl: '', category: 'Turnover Certificate', storagePath: PATH, staged: true };

function mockDb(options = {}) {
  const writes = [];
  const db = {
    writes,
    storage: { from: () => ({
      info: async () => options.infoError ? { error: new Error('missing'), data: null } : { data: { size: options.size ?? 100, contentType: options.contentType ?? 'application/pdf' }, error: null },
      download: async () => ({ data: new Blob(['%PDF- test']), error: null }),
      createSignedUploadUrl: async p => ({ data: { path: p, signedUrl: 'https://storage.test/signed' }, error: null }),
    }) },
    from(table) {
      let op = 'select', selected = '', payload;
      const chain = {
        select(value) { selected = value; return chain; },
        insert(value) { op = 'insert'; payload = value; writes.push({ table, op, value }); return chain; },
        update(value) { op = 'update'; payload = value; writes.push({ table, op, value }); return chain; },
        eq() { return chain; }, ilike() { return chain; }, limit() { return Promise.resolve({ data: options.linked ? [{ id: 'existing' }] : [], error: null }); },
        maybeSingle: async () => {
          if (table === 'projects' && op === 'select') return { data: options.edit ? { id: 'project-1', road_id: 'road-1' } : null, error: null };
          if ((table === 'projects' || table === 'roads' || table === 'contractors') && op === 'update') return { data: options.blockUpdate ? null : { id: 'existing' }, error: null };
          return { data: { id: table === 'contractors' ? 'contractor-1' : 1 }, error: null };
        },
        single: async () => {
          if (table === 'projects' && op === 'select' && selected.includes('roads!')) return { data: null, error: new Error('mock join unavailable') };
          return { data: { id: table === 'projects' ? 'project-1' : 'road-1' }, error: null };
        },
        then(resolve, reject) { return Promise.resolve({ data: null, error: table === 'attachments' && options.linkError ? new Error('link denied') : null }).then(resolve, reject); },
      }; return chain;
    },
  };
  return db;
}
const dataModule = load('src/lib/supabase-data.ts', {
  '@/lib/attachment-validation': attachment,
  '@/lib/supabase': { ROLE_FROM_DB: {}, ROLE_TO_DB: {} },
});
const payload = { id: '', projectName: 'Road project', roadName: 'Road', location: 'Town', barangay: 'Town', projectCategory: 'National Road', attachments: [staged] };

test('project create and edit link checked staged files without base64', async () => {
  for (const edit of [false, true]) {
    const db = mockDb({ edit });
    const saved = await dataModule.saveRoad(db, { ...payload, id: edit ? 'project-1' : '' }, USER);
    assert.equal(saved.id, 'project-1');
    const linked = db.writes.find(write => write.table === 'attachments');
    assert.equal(linked.value.storage_path, PATH); assert.equal(linked.value.file_size, 100);
    assert.equal(linked.value.category, 'turnover_certificate');
  }
});

test('unverified, oversized, mismatched, reused or foreign staged files are rejected before project writes', async () => {
  for (const options of [{ infoError: true }, { size: 10 * 1024 * 1024 + 1 }, { contentType: 'image/png' }, { linked: true }]) {
    const db = mockDb(options);
    await assert.rejects(dataModule.saveRoad(db, payload, USER));
    assert.equal(db.writes.length, 0);
  }
  const db = mockDb();
  await assert.rejects(dataModule.saveRoad(db, { ...payload, attachments: [{ ...staged, storagePath: PATH.replace(USER, 'other-user') }] }, USER));
  assert.equal(db.writes.length, 0);
});

test('attachment linking failure returns explicit partial-save warning instead of hiding it', async () => {
  const result = await dataModule.saveRoad(mockDb({ linkError: true }), payload, USER);
  assert.equal(result.id, 'project-1'); assert.match(result.attachmentWarning, /project was saved/i);
});

test('zero-row RLS update cannot report success', async () => {
  await assert.rejects(dataModule.saveRoad(mockDb({ edit: true, blockUpdate: true }), { ...payload, id: 'project-1' }, USER), /Could not update/);
});

test('signed upload endpoint is encoder-only and checks file constraints', async () => {
  let role = 'encoder'; const db = mockDb();
  const route = load('src/app/api/local-road/attachment-upload/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
    '@/lib/attachment-validation': attachment,
    '@/lib/api': { requireRole: async (_request, roles) => roles.includes(role) ? { auth: { db, userId: USER } } : { denied: { status: 403 } }, withRefresh: response => response },
  });
  const request = value => ({ json: async () => value });
  assert.equal((await route.POST(request({ name: 'x.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1 }))).status, 400);
  assert.equal((await route.POST(request({ name: 'x.png', type: 'application/pdf', size: 10 }))).status, 400);
  const result = await route.POST(request({ name: 'x.pdf', type: 'application/pdf', size: 100 }));
  assert.equal(result.status, 200); assert.ok(result.body.path.startsWith(`project-uploads/${USER}/`));
  role = 'head_engineer'; assert.equal((await route.POST(request({}))).status, 403);
});

test('rejects content that does not match the filename before project writes', async () => {
  const db = mockDb();
  db.storage.from = () => ({ info: async () => ({ data: { size: 100, contentType: 'application/pdf' } }), download: async () => ({ data: new Blob(['not a PDF']) }) });
  await assert.rejects(dataModule.saveRoad(db, payload, USER), /content does not match/);
  assert.equal(db.writes.length, 0);
});

test('record refresh rejects failed or malformed module responses instead of clearing saved records', async () => {
  const { loadRecords } = load('src/lib/load-records.ts');
  assert.deepEqual(await loadRecords('/api/local-road', async () => ({ ok: true, json: async () => ({ data: [{ id: 'p' }] }) })), [{ id: 'p' }]);
  await assert.rejects(loadRecords('/api/inspections', async () => ({ ok: false, status: 500 })), /500/);
  await assert.rejects(loadRecords('/api/local-road', async () => ({ ok: true, json: async () => ({ message: 'error' }) })), /Invalid record response/);
});
