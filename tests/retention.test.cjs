// @mine — step 8: the 30-day archive retention (WORKFLOW-REVIEW Q26 / B5a).
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(code, filename);
  return mod.exports;
}

const retention = load('src/lib/retention.ts');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days, now = new Date('2026-11-11T09:00:00Z')) => new Date(now.getTime() - days * DAY).toISOString();

afterEach(() => {
  for (const key of ['RETENTION_LIVE', 'CRON_SECRET']) delete process.env[key];
});

test('the 30 days are counted from the archive moment, month ends included', () => {
  assert.equal(retention.RETENTION_DAYS, 30);
  assert.equal(retention.retentionCutoff(new Date('2026-11-11T09:00:00Z')).toISOString(), '2026-10-12T09:00:00.000Z');
  // exactly 30 days is due; 29 days is not
  assert.equal(retention.isPurgeDue('2026-10-12T09:00:00.000Z', new Date('2026-11-11T09:00:00Z')), true);
  assert.equal(retention.isPurgeDue('2026-10-12T09:00:01.000Z', new Date('2026-11-11T09:00:00Z')), false);
  // across a month boundary and a short month
  assert.equal(retention.isPurgeDue('2026-01-31T00:00:00.000Z', new Date('2026-03-02T00:00:00.000Z')), true);
  assert.equal(retention.isPurgeDue('2026-01-31T00:00:00.000Z', new Date('2026-03-01T00:00:00.000Z')), false);
  // a record that was never archived is never due
  assert.equal(retention.isPurgeDue(undefined), false);
  assert.equal(retention.isPurgeDue(''), false);
  assert.equal(retention.isPurgeDue('not a date'), false);
  assert.equal(retention.retentionDeadline(null), null);
});

test('the archive screen can say exactly when a record goes', () => {
  const now = new Date('2026-11-11T09:00:00Z');
  assert.equal(retention.purgeDateLabel('2026-11-01T09:00:00.000Z'), '2026-12-01');
  assert.equal(retention.daysUntilPurge('2026-11-01T09:00:00.000Z', now), 20);
  assert.equal(retention.purgeScheduleLabel('2026-11-01T09:00:00.000Z', now), 'Deletes on 2026-12-01 (20 days left)');
  assert.equal(retention.purgeScheduleLabel('2026-11-02T09:00:00.000Z', now), 'Deletes on 2026-12-02 (21 days left)');
  assert.equal(retention.purgeScheduleLabel('2026-10-12T09:00:00.000Z', now), 'Deleted on the next automatic run');
  assert.equal(retention.purgeScheduleLabel('', now), '');
});

test('the live run is opt-in and the scheduled call needs its secret', () => {
  assert.equal(retention.livePurgeEnabled({}), false);
  assert.equal(retention.livePurgeEnabled({ RETENTION_LIVE: '0' }), false);
  assert.equal(retention.livePurgeEnabled({ RETENTION_LIVE: '1' }), true);
  const withBearer = { get: (name) => (name === 'authorization' ? 'Bearer s3cret' : null) };
  assert.equal(retention.cronAuthorized(withBearer, { CRON_SECRET: 's3cret' }), true);
  assert.equal(retention.cronAuthorized(withBearer, { CRON_SECRET: 'other' }), false);
  assert.equal(retention.cronAuthorized(withBearer, {}), false);
});

/* ------------------------------ the data layer ------------------------------ */

const overdue = ago(40);
const fresh = ago(5);

function makeAdmin(state) {
  const tables = state.tables;
  const record = (entry) => state.operations.push(entry);
  const matches = (row, filters) => filters.every(([kind, column, value]) => {
    if (kind === 'not') return row[column] !== null && row[column] !== undefined;
    if (kind === 'lte') return String(row[column]) <= String(value);
    if (kind === 'in') return value.includes(row[column]);
    return true;
  });
  return {
    storage: {
      from: () => ({
        remove: async (paths) => {
          record({ op: 'removeFiles', paths });
          if (state.failStorage) throw new Error('storage refused');
          return { error: null };
        },
      }),
    },
    from(table) {
      const filters = [];
      const chain = {
        operation: null,
        select() { chain.operation = 'select'; return chain; },
        delete(options) { chain.operation = 'delete'; chain.options = options; return chain; },
        not(column) { filters.push(['not', column]); return chain; },
        lte(column, value) { filters.push(['lte', column, value]); return chain; },
        in(column, values) { filters.push(['in', column, values]); return chain; },
        then(resolve, reject) {
          try {
            // emulates a record restored between the report and the deletion
            if (chain.operation === 'delete' && table === 'projects' && state.restoreBeforeDelete?.length) {
              for (const row of tables[table] ?? []) {
                if (state.restoreBeforeDelete.includes(row.id)) row.archived_at = null;
              }
              state.restoreBeforeDelete = [];
            }
            const rows = (tables[table] ?? []).filter((row) => matches(row, filters));
            if (chain.operation === 'delete') {
              tables[table] = (tables[table] ?? []).filter((row) => !rows.includes(row));
              // the database cascades a project's children with it
              if (table === 'projects') {
                const gone = rows.map((row) => row.id);
                for (const child of ['inspections', 'maintenance_records', 'attachments']) {
                  tables[child] = (tables[child] ?? []).filter((row) => !gone.includes(row.project_id));
                }
              }
              record({ op: 'delete', table, ids: rows.map((row) => row.id) });
              return Promise.resolve({ data: null, error: null, count: rows.length }).then(resolve, reject);
            }
            record({ op: 'select', table, filters });
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return chain;
    },
  };
}

function seed(overrides = {}) {
  return {
    operations: [],
    failStorage: false,
    tables: {
      projects: [
        { id: 'p-old', project_name: 'Old Road', archived_at: overdue },
        { id: 'p-new', project_name: 'Fresh Road', archived_at: fresh },
        { id: 'p-live', project_name: 'Live Road', archived_at: null },
      ],
      inspections: [
        { id: 'i-old', inspection_date: '2026-01-01', project_id: 'p-old', archived_at: overdue },
        { id: 'i-child', inspection_date: '2026-02-01', project_id: 'p-old', archived_at: null },
        { id: 'i-new', inspection_date: '2026-03-01', project_id: 'p-new', archived_at: fresh },
      ],
      maintenance_records: [
        { id: 'm-old', scheduled_date: '2026-01-05', maintenance_type: 'routine', project_id: 'p-old', archived_at: overdue },
        { id: 'm-child', scheduled_date: '2026-01-06', maintenance_type: 'routine', project_id: 'p-new', archived_at: null },
      ],
      profiles: [
        { id: 'u-old', full_name: 'Retired Staff', archived_at: overdue },
        { id: 'u-new', full_name: 'Current Staff', archived_at: null },
      ],
      attachments: [
        { id: 'a1', storage_path: 'p-old/certificate.pdf', project_id: 'p-old', inspection_id: null, maintenance_id: null },
        { id: 'a2', storage_path: 'p-old/photo.jpg', project_id: null, inspection_id: 'i-old', maintenance_id: null },
        { id: 'a3', storage_path: 'p-old/child.jpg', project_id: null, inspection_id: 'i-child', maintenance_id: null },
        { id: 'a4', storage_path: 'p-new/keep.pdf', project_id: 'p-new', inspection_id: null, maintenance_id: null },
      ],
      ...overrides,
    },
  };
}

const data = load('src/lib/supabase-data.ts', {
  '@/lib/attachment-validation': load('src/lib/attachment-validation.ts'),
  '@/lib/project-form-validation': load('src/lib/project-form-validation.ts'),
  '@/lib/supabase': { ROLE_FROM_DB: {}, ROLE_TO_DB: {} },
});

test('the report lists only what is past its 30 days, with every file it would take', async () => {
  const state = seed();
  const cutoff = retention.retentionCutoff(new Date('2026-11-11T09:00:00Z')).toISOString();
  const report = await data.collectRetentionReport(makeAdmin(state), cutoff);
  assert.equal(report.cutoff, new Date('2026-10-12T09:00:00Z').toISOString());
  assert.deepEqual(report.projects.map((row) => row.id), ['p-old']);
  assert.deepEqual(report.inspections.map((row) => row.id), ['i-old']);
  assert.deepEqual(report.maintenance.map((row) => row.id), ['m-old']);
  // files of the due project, of its archived inspection and of its live child inspection
  assert.deepEqual(report.files.sort(), ['p-old/certificate.pdf', 'p-old/child.jpg', 'p-old/photo.jpg']);
  // archived accounts are shown but are not part of the deletion
  assert.deepEqual(report.accounts.map((row) => row.id), ['u-old']);
  // and nothing was deleted by a report
  assert.deepEqual(state.operations.filter((entry) => entry.op !== 'select'), []);
  assert.equal(state.tables.projects.length, 3);
});

test('the live run removes the files first, then the records, and leaves the rest alone', async () => {
  const state = seed();
  const cutoff = retention.retentionCutoff(new Date('2026-11-11T09:00:00Z')).toISOString();
  const run = await data.purgeExpiredRecords(makeAdmin(state), cutoff);
  const ops = state.operations.filter((entry) => entry.op !== 'select');

  assert.equal(ops[0].op, 'removeFiles');
  assert.deepEqual(ops[0].paths.sort(), ['p-old/certificate.pdf', 'p-old/child.jpg', 'p-old/photo.jpg']);
  assert.deepEqual(ops.slice(1).map((entry) => entry.table), ['maintenance_records', 'inspections', 'projects']);
  // the archived inspection is deleted explicitly; its live sibling goes with the project
  assert.deepEqual(run.deleted, { projects: 1, inspections: 1, maintenance: 1, files: 3 });

  assert.deepEqual(state.tables.projects.map((row) => row.id).sort(), ['p-live', 'p-new']);
  assert.deepEqual(state.tables.inspections.map((row) => row.id), ['i-new']);
  assert.deepEqual(state.tables.maintenance_records.map((row) => row.id), ['m-child']);
  // accounts are never deleted automatically
  assert.deepEqual(state.tables.profiles.map((row) => row.id).sort(), ['u-new', 'u-old']);
  assert.deepEqual(run.errors, []);
});

test('a record restored just in time survives, and a refused file only warns', async () => {
  const state = seed();
  state.failStorage = true;
  // p-old is restored between the report and the deletion
  state.restoreBeforeDelete = ['p-old'];
  const run = await data.purgeExpiredRecords(makeAdmin(state), retention.retentionCutoff(new Date('2026-11-11T09:00:00Z')).toISOString());
  assert.match(run.errors[0], /stored file/i);
  assert.equal(state.tables.projects.some((row) => row.id === 'p-old'), true); // restored, so kept
  assert.equal(state.tables.maintenance_records.length, 1);
});

/* --------------------------------- the route --------------------------------- */

function routeFor(state, role = 'head_engineer') {
  const res = (status, body = {}) => ({ status, body });
  const auth = { profile: { roleDb: role, username: 'Head' }, db: 'user', admin: makeAdmin(state), userId: 'u' };
  const mocks = {
    'next/server': { NextResponse: { json: (body, init) => res(init?.status || 200, body) } },
    '@/lib/api': {
      requireAuth: async () => auth,
      requireRole: async (_request, roles) => (roles.includes(role) ? { auth } : { denied: res(403) }),
      forbidden: () => res(403),
      unauthorized: () => res(401),
      withRefresh: (response) => response,
    },
    '@/lib/supabase': { createAdminClient: () => makeAdmin(state), ROLE_FROM_DB: {}, ROLE_TO_DB: {} },
    '@/lib/retention': retention,
    '@/lib/supabase-data': data,
  };
  const route = load('src/app/api/retention/route.ts', mocks);
  const request = (headers = {}, body = null) => ({
    url: 'https://example.test/api/retention',
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  });
  return { route, request };
}

test('a person gets the report, never a deletion, and only the Head Engineer gets it at all', async () => {
  const state = seed();
  const { route, request } = routeFor(state);
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.mode, 'report');
  assert.equal(response.body.summary.projects, 1);
  assert.equal(response.body.summary.files, 3);
  assert.equal(state.tables.projects.length, 3);

  const other = routeFor(seed(), 'encoder');
  assert.equal((await other.route.GET(other.request())).status, 403);
});

test('the purge refuses to run until the live switch is on, and always asks for confirmation', async () => {
  const state = seed();
  const { route, request } = routeFor(state);
  assert.equal((await route.POST(request({}, {}))).status, 400);
  const refused = await route.POST(request({}, { confirm: 'purge' }));
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /RETENTION_LIVE/);
  assert.equal(state.tables.projects.length, 3);

  process.env.RETENTION_LIVE = '1';
  const run = await route.POST(request({}, { confirm: 'purge' }));
  assert.equal(run.status, 200);
  assert.deepEqual(run.body.deleted, { projects: 1, inspections: 1, maintenance: 1, files: 3 });
});

test('the scheduled call reports without the secret, and only purges with it', async () => {
  let state = seed();
  let { route, request } = routeFor(state);
  process.env.RETENTION_LIVE = '1';
  const withoutSecret = await route.GET(request({ 'x-vercel-cron': '1' }));
  assert.equal(withoutSecret.body.mode, 'report');
  assert.equal(state.tables.projects.length, 3);

  state = seed();
  ({ route, request } = routeFor(state));
  process.env.CRON_SECRET = 'cron-secret';
  const withSecret = await route.GET(request({ 'x-vercel-cron': '1', authorization: 'Bearer cron-secret' }));
  assert.equal(withSecret.body.mode, 'live');
  assert.equal(withSecret.body.deleted.files, 3);
  assert.equal(state.tables.projects.length, 2);

  // with the switch off, even the scheduled call only reports
  state = seed();
  ({ route, request } = routeFor(state));
  delete process.env.RETENTION_LIVE;
  const off = await route.GET(request({ 'x-vercel-cron': '1', authorization: 'Bearer cron-secret' }));
  assert.equal(off.body.mode, 'report');
  assert.equal(state.tables.projects.length, 3);
});
