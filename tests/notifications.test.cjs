// @mine — step 6: the six workflow emails (WORKFLOW-REVIEW §5) and their recipients.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = m.require.bind(m);
  m.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name);
  m._compile(code, filename);
  return m.exports;
}

const notifications = loadTs('src/lib/notifications.ts');

const profiles = [
  { id: 'v1', email: 'validator@example.test', role: 'validator', status: 'active' },
  { id: 'e1', email: 'encoder@example.test', role: 'encoder', status: 'active' },
  { id: 'e2', email: 'encoder2@example.test', role: 'encoder', status: 'active' },
  { id: 'e3', email: 'retired@example.test', role: 'encoder', status: 'inactive' },
  { id: 'h1', email: 'head@example.test', role: 'head_engineer', status: 'active' },
  { id: 'i1', email: 'inspector@example.test', role: 'inspector', status: 'active' },
  { id: 'n1', email: '', role: 'encoder', status: 'active' },
];

// The slice of the Supabase client the notifier uses.
const makeDb = (rows = profiles) => ({
  from: () => ({
    select: () => ({
      in: async (_column, roles) => ({ data: rows.filter((row) => roles.includes(row.role)), error: null }),
      eq: (column, value) => ({
        maybeSingle: async () => ({ data: rows.find((row) => row[column] === value) ?? null, error: null }),
      }),
    }),
  }),
});

const sent = [];
notifications.__setNotificationSender(async (mail) => { sent.push(mail); });

afterEach(() => {
  sent.length = 0;
  notifications.__setNotificationSender(async (mail) => { sent.push(mail); });
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) delete process.env[key];
});

test('each of the six emails has its own headline under the project name', () => {
  assert.equal(notifications.notificationSubject('Poblacion Road', 'for-validation'), '[Poblacion Road] – For Validation');
  assert.equal(notifications.notificationSubject('Poblacion Road', 'for-revision'), '[Poblacion Road] – For Revision');
  assert.equal(notifications.notificationSubject('Poblacion Road', 'information-updated'), '[Poblacion Road] – Project Information Updated');
  assert.equal(notifications.notificationSubject('Poblacion Road', 'validated'), '[Poblacion Road] – Validated');
  assert.equal(notifications.notificationSubject('Poblacion Road', 'inspector-assigned'), '[Poblacion Road] – Inspector Assigned');
  assert.equal(notifications.notificationSubject('Poblacion Road', 'inspection-recorded'), '[Poblacion Road] – Inspection Recorded');
  assert.equal(Object.keys(notifications.WORKFLOW_EMAIL_HEADLINES).length, 6);
});

test('every email carries the same paragraph, headline and footer', () => {
  const text = notifications.notificationText('Poblacion Road');
  assert.match(text, /^Good day!/);
  assert.match(text, /The project details have been successfully submitted, updated, or recorded in the system\. Kindly review the details and take the necessary action\./);
  assert.match(text, /Poblacion Road/);
  assert.match(text, /Office of the Municipal Engineer · Mabini, Batangas/);
  assert.match(text, /This is an automated message\. Please do not reply to this email\./);
  const html = notifications.notificationHtml('Poblacion <Road>');
  assert.match(html, /OFFICE OF THE MUNICIPAL ENGINEER/);
  assert.doesNotMatch(html, /MUNICIPAL ENGINEERING OFFICE|Mabini MEO|Local Road Management System|WBLRMS/i);
  assert.doesNotMatch(text, /Mabini MEO|Local Road Management System|WBLRMS/i);
  assert.match(html, /Email Notification/);
  assert.match(html, /Poblacion &lt;Road&gt;/);
  assert.doesNotMatch(html, /<Road>/);
});

test('the mailbox settings stay optional and read from the hosting environment', () => {
  assert.equal(notifications.mailSettings({}), null);
  assert.equal(notifications.mailSettings({ SMTP_HOST: 'smtp.example.test', SMTP_USER: 'office@example.test' }), null);
  const partial = notifications.mailSettings({ SMTP_HOST: 'smtp.example.test', SMTP_USER: 'office@example.test', SMTP_PASS: 'x' });
  assert.equal(partial.port, 587);
  assert.equal(partial.secure, false);
  assert.equal(partial.from, 'office@example.test');
  const implicit = notifications.mailSettings({ SMTP_HOST: 'smtp.example.test', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'ome@example.test' });
  assert.equal(implicit.secure, true);
  assert.equal(implicit.from, 'ome@example.test');
});

test('emails 1-4 reach the right role, never the Head Engineer on 1-3', async () => {
  const db = makeDb();
  const forValidation = await notifications.notifyWorkflow(db, { kind: 'for-validation', projectName: 'Poblacion Road' });
  assert.deepEqual(forValidation.recipients, ['validator@example.test']);
  assert.equal(forValidation.sent, 1);

  const updated = await notifications.notifyWorkflow(db, { kind: 'information-updated', projectName: 'Poblacion Road' });
  assert.deepEqual(updated.recipients, ['validator@example.test']);

  const revision = await notifications.notifyWorkflow(db, { kind: 'for-revision', projectName: 'Poblacion Road' });
  // both active encoders with an address; never the inactive account or the Head Engineer
  assert.deepEqual(revision.recipients.sort(), ['encoder2@example.test', 'encoder@example.test']);

  const recorded = await notifications.notifyWorkflow(db, { kind: 'inspection-recorded', projectName: 'Poblacion Road' });
  assert.deepEqual(recorded.recipients.sort(), ['encoder2@example.test', 'encoder@example.test']);

  const validated = await notifications.notifyWorkflow(db, { kind: 'validated', projectName: 'Poblacion Road' });
  assert.deepEqual(validated.recipients, ['head@example.test']);

  // one message per address, so nobody sees anybody else's address
  assert.equal(sent.length, 1 + 1 + 2 + 2 + 1);
  for (const mail of sent) {
    assert.equal(typeof mail.to, 'string');
    assert.doesNotMatch(mail.to, /,/);
    assert.match(mail.subject, /^\[Poblacion Road\] – /);
    assert.match(mail.text, /Poblacion Road/);
  }
});

test('email 5 goes to the assigned inspector only, and clearing sends nothing', async () => {
  const db = makeDb();
  const assigned = await notifications.notifyWorkflow(db, { kind: 'inspector-assigned', projectName: 'Poblacion Road', inspectorId: 'i1' });
  assert.deepEqual(assigned.recipients, ['inspector@example.test']);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /– Inspector Assigned$/);

  sent.length = 0;
  const cleared = await notifications.notifyWorkflow(db, { kind: 'inspector-assigned', projectName: 'Poblacion Road' });
  assert.deepEqual(cleared, { sent: 0, recipients: [], skipped: 'no-recipients' });
  assert.equal(sent.length, 0);
});

test('without a mailbox, or without a project or recipients, nothing is sent and nothing throws', async () => {
  const db = makeDb();
  assert.deepEqual(await notifications.notifyWorkflow(db, { kind: 'for-validation', projectName: '  ' }),
    { sent: 0, recipients: [], skipped: 'no-project' });

  notifications.__setNotificationSender(null);
  assert.deepEqual(await notifications.notifyWorkflow(db, { kind: 'for-validation', projectName: 'Poblacion Road' }),
    { sent: 0, recipients: [], skipped: 'not-configured' });

  notifications.__setNotificationSender(async (mail) => { sent.push(mail); });
  assert.deepEqual(await notifications.notifyWorkflow(makeDb([{ id: 'x', email: 'x@example.test', role: 'encoder', status: 'inactive' }]),
    { kind: 'for-revision', projectName: 'Poblacion Road' }),
  { sent: 0, recipients: [], skipped: 'no-recipients' });

  // a refused message is logged, counted as unsent, and never reaches the request
  notifications.__setNotificationSender(async () => { throw new Error('mailbox refused'); });
  const refused = await notifications.notifyWorkflow(db, { kind: 'validated', projectName: 'Poblacion Road' });
  assert.equal(refused.sent, 0);
  assert.deepEqual(refused.recipients, ['head@example.test']);

  // a database that fails to answer is the same: no throw, nothing sent
  notifications.__setNotificationSender(async (mail) => { sent.push(mail); });
  const brokenDb = { from: () => ({ select: () => ({ in: async () => { throw new Error('offline'); } }) }) };
  assert.deepEqual(await notifications.notifyWorkflow(brokenDb, { kind: 'validated', projectName: 'Poblacion Road' }),
    { sent: 0, recipients: [] });
  assert.equal(sent.length, 0);
});


test('the documented password reset template uses the requested office name', () => {
  const template = fs.readFileSync(path.resolve(__dirname, '../docs/EMAIL-TEMPLATES.md'), 'utf8');
  assert.match(template, /Reset your Office of the Municipal Engineer password/);
  assert.match(template, /OFFICE OF THE MUNICIPAL ENGINEER/);
  assert.doesNotMatch(template, /Mabini MEO|MUNICIPAL ENGINEERING OFFICE|Local Road Management System|WBLRMS/i);
  assert.match(template, /{{ \.ConfirmationURL }}/);
});
