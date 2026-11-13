// @mine — step 6: each workflow action triggers its own email, and only its own.
// The notifier itself is recorded instead of sent (see tests/notifications.test.cjs
// for its own behaviour: recipients, wording, and the mailbox being optional).
const { test } = require('node:test');
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

const workflow = load('src/lib/project-validation-workflow.ts');
const reminders = load('src/lib/validation-reminders.ts', { '@/lib/project-validation-workflow': workflow });
const project = { id: 'p', projectName: 'Road', actualCompletionDate: '2025-12-11', annualValidationEntries: [{ year: 2026, dueDate: '2026-11-11', result: 'Pending', remarks: '' }] };
test('calendar reminder opens exactly 30 days before the anniversary', () => {
  assert.equal(reminders.pendingValidationReminders([project], [], new Date('2026-11-10')).length, 0);
  assert.equal(reminders.pendingValidationReminders([project], [], new Date('2026-11-11')).length, 1);
});
test('sent reminder dedupes by project/year, including duplicate project inputs', () => {
  const now = new Date('2026-11-11');
  assert.equal(reminders.pendingValidationReminders([project, project], [], now).length, 1);
  const log = { action: reminders.VALIDATION_REMINDER_ACTION, details: reminders.reminderDetails('p', 2026, 'Old name') };
  assert.equal(reminders.pendingValidationReminders([project], [log], now).length, 0);
  assert.equal(reminders.pendingValidationReminders([project], [{ ...log, details: reminders.reminderDetails('p', 2025, 'Road') }], now).length, 1);
});
test('archived, undated and already decided projects get no reminder', () => {
  const now = new Date('2026-11-11');
  for (const candidate of [{ ...project, archivedAt: '2026-01-01' }, { ...project, actualCompletionDate: '' }, ...['Validated', 'Return for Revision'].map(result => ({ ...project, annualValidationEntries: [{ ...project.annualValidationEntries[0], result }] }))]) {
    assert.equal(reminders.pendingValidationReminders([candidate], [], now).length, 0);
  }
});
test('assignment requires the latest decision to be Validated', () => {
  assert.equal(workflow.hasPassedValidation({ validationResult: 'Validated' }), true);
  const prior = { year: 2025, result: 'Validated' };
  for (const result of ['Pending', 'Return for Revision']) assert.equal(workflow.hasPassedValidation({ validationResult: 'Validated', annualValidationEntries: [prior, { year: 2026, result }] }), false);
});

function routeHarness({ historyFails = false, sent = 0 } = {}) {
  let markers = []; let sends = 0;
  const route = load('src/app/api/validation-reminders/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
    '@/lib/api': { requireAuth: async () => null, unauthorized: () => ({ status: 401 }), forbidden: () => ({ status: 403 }) },
    '@/lib/supabase': { createAdminClient: () => ({}) },
    '@/lib/retention': { cronAuthorized: headers => headers.get('authorization') === 'Bearer test' },
    '@/lib/validation-reminders': { ...reminders, pendingValidationReminders: (_p, logs) => logs.length ? [] : [{ id: 'p', year: 2026, name: 'Road' }] },
    '@/lib/notifications': { automaticNote: x => x, notifyWorkflow: async () => { sends++; return { sent }; } },
    '@/lib/supabase-data': {
      listRoads: async () => [project],
      listValidationReminderLogs: async () => { if (historyFails) throw Error('unavailable'); return markers; },
      recordValidationReminder: async (_db, details) => { markers.push({ action: reminders.VALIDATION_REMINDER_ACTION, details }); },
    },
  });
  const req = authorization => ({ headers: { get: name => name === 'authorization' ? authorization : '1' } });
  return { route, req, count: () => sends, markers: () => markers };
}
test('spoofed cron header is not authorization', async () => {
  const h = routeHarness();
  assert.equal((await h.route.GET(h.req(''))).status, 401);
  assert.equal(h.count(), 0);
});
test('successful reminder is marked and not resent on sequential runs', async () => {
  const h = routeHarness({ sent: 1 });
  assert.equal((await h.route.GET(h.req('Bearer test'))).status, 200);
  await h.route.GET(h.req('Bearer test'));
  assert.equal(h.count(), 1);
  assert.equal(h.markers().length, 1);
});
test('unconfigured mail remains retryable; unreadable history stops sending', async () => {
  const h = routeHarness();
  await h.route.GET(h.req('Bearer test'));
  assert.equal(h.markers().length, 0);
  const failed = routeHarness({ historyFails: true });
  assert.equal((await failed.route.GET(failed.req('Bearer test'))).status, 500);
  assert.equal(failed.count(), 0);
});
