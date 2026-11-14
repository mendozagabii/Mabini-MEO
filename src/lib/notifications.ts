// @mine — step 6: the six workflow emails of docs/WORKFLOW-REVIEW.md §5.
//
// Every message is the same shell: the office header, a bold "Notification", one
// short paragraph, one headline (the project name) and the footer. Only the
// recipient and the subject line change, so the office reads one thing, six times.
//
// Sending is off until the mailbox exists: the owner sets SMTP_HOST / SMTP_PORT /
// SMTP_USER / SMTP_PASS / MAIL_FROM in the hosting environment (answers to Q11 and
// Q13). Until then every call answers "not configured" and the request carries on.
// Nothing here may ever throw into the request path.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (table: string) => any };

export type WorkflowEmailKind =
  | 'for-validation'
  | 'for-revision'
  | 'information-updated'
  | 'validated'
  | 'inspector-assigned'
  | 'inspection-recorded';

/** The headline that follows the project name in the subject. */
export const WORKFLOW_EMAIL_HEADLINES: Record<WorkflowEmailKind, string> = {
  'for-validation': 'For Validation',
  'for-revision': 'For Revision',
  'information-updated': 'Project Information Updated',
  validated: 'Validated',
  'inspector-assigned': 'Inspector Assigned',
  'inspection-recorded': 'Inspection Recorded',
};

/**
 * Who receives each email. Emails 1–3 never copy the Head Engineer (answer 6);
 * email 4 goes to the Head Engineer because that is its whole purpose.
 * Email 5 is addressed to the assigned inspector by id, so it has no role entry.
 */
const RECIPIENT_ROLES: Record<Exclude<WorkflowEmailKind, 'inspector-assigned'>, string[]> = {
  'for-validation': ['validator'],
  'information-updated': ['validator'],
  'for-revision': ['encoder'],
  'inspection-recorded': ['encoder'],
  validated: ['head_engineer'],
};

/**
 * @mine — the envelope is always the office mailbox, so the real actor is named at the
 * top of the body (that is also what Gmail shows in the inbox preview). The officer's
 * flow, 2026-11-12.
 */
export type MailActor = { name?: string; role?: string; email?: string };

export function actionNote(actor?: MailActor): string {
  if (!actor) return '';
  const name = String(actor.name ?? '').trim();
  const role = String(actor.role ?? '').trim();
  const email = String(actor.email ?? '').trim();
  const who = role ? `${name} (${role})` : name;
  if (!who) return '';
  return `Action by: ${who}${email ? ` \u00b7 ${email}` : ''}`;
}

/** @mine — the line an automated message shows instead of a person's name. */
export function automaticNote(subject: string): string {
  const text = String(subject ?? '').trim();
  return text ? `Sent automatically \u00b7 ${text}` : 'Sent automatically by the system';
}

const PARAGRAPH =
  'The project details have been successfully submitted, updated, or recorded in the system. Kindly review the details and take the necessary action.';

const FOOTER_LINES = [
  'Office of the Municipal Engineer · Mabini, Batangas',
  'This is an automated message. Please do not reply to this email.',
];

/** The mailbox the office proposed (Q13); the environment overrides it. */
export const DEFAULT_MAIL_FROM = 'omemabinibatangas@gmail.com';

export type MailSettings = { host: string; port: number; secure: boolean; user: string; pass: string; from: string };

/** @mine — the mailbox settings, or null while the owner has not set them yet. */
export function mailSettings(env: Record<string, string | undefined> = process.env): MailSettings | null {
  const host = String(env.SMTP_HOST ?? '').trim();
  const user = String(env.SMTP_USER ?? '').trim();
  const pass = String(env.SMTP_PASS ?? '').trim();
  if (!host || !user || !pass) return null;
  const parsedPort = Number(String(env.SMTP_PORT ?? '').trim());
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 587;
  return {
    host,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: port === 465,
    user,
    pass,
    from: String(env.MAIL_FROM ?? '').trim() || user || DEFAULT_MAIL_FROM,
  };
}

/** @mine — `[Poblacion Road] – For Validation`. */
export function notificationSubject(projectName: string, kind: WorkflowEmailKind): string {
  return `[${String(projectName).trim()}] – ${WORKFLOW_EMAIL_HEADLINES[kind]}`;
}

/** @mine — the plain-text body: who acted, greeting, paragraph, headline, footer. */
export function notificationText(projectName: string, note = ''): string {
  const heading = String(note ?? '').trim();
  return [
    ...(heading ? [heading, ''] : []),
    'Good day!', '', PARAGRAPH, '', String(projectName).trim(), '', ...FOOTER_LINES,
  ].join('\n');
}

/** @mine — the same message in the mail shell the office already sees for a password reset. */
export function notificationHtml(projectName: string, note = ''): string {
  const name = String(projectName).trim()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const heading = String(note ?? '').trim()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const headingRow = heading
    ? `\n          <p style="margin:0 0 16px;color:#64748b;font-size:12px;line-height:1.6;">${heading}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background-color:#1e3a5f;padding:28px 40px;text-align:center;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">OFFICE OF THE MUNICIPAL ENGINEER</p>
          <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Municipality of Mabini, Batangas</p>
        </td></tr>
        <tr><td style="padding:36px 40px 8px;">
          <p style="margin:0 0 16px;color:#0f172a;font-size:18px;font-weight:bold;">Email Notification</p>${headingRow}
          <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">Good day!</p>
          <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">${PARAGRAPH}</p>
          <p style="margin:0 0 8px;color:#0f172a;font-size:16px;font-weight:bold;">${name}</p>
        </td></tr>
        <tr><td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
            Office of the Municipal Engineer · Mabini, Batangas<br>
            This is an automated message. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export type OutgoingMail = { from: string; to: string; subject: string; text: string; html: string };
export type MailSender = (mail: OutgoingMail) => Promise<unknown>;

let senderOverride: MailSender | null = null;
let cachedSender: MailSender | null = null;
let cachedKey = '';

/**
 * @mine — tests point the notifier at a recorder instead of a real mailbox.
 * Pass null to go back to the configured SMTP transport.
 */
export function __setNotificationSender(sender: MailSender | null): void {
  senderOverride = sender;
}

/** @mine — nodemailer is required lazily so route modules stay light to load. */
async function smtpSender(settings: MailSettings): Promise<MailSender> {
  const key = `${settings.host}:${settings.port}:${settings.user}`;
  if (cachedSender && cachedKey === key) return cachedSender;
  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user, pass: settings.pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  cachedSender = (mail) => transport.sendMail(mail);
  cachedKey = key;
  return cachedSender;
}

/** @mine — the address of one staff account, used for the inspector email. */
async function profileEmail(db: Db, id: string): Promise<string[]> {
  const { data, error } = await db.from('profiles').select('email').eq('id', id).maybeSingle();
  if (error) {
    console.error('Could not read the inspector email address.', error);
    return [];
  }
  const email = String(data?.email ?? '').trim();
  return email ? [email] : [];
}

/** @mine — every active account with one of the roles, de-duplicated. */
async function roleEmails(db: Db, roles: string[]): Promise<string[]> {
  const { data, error } = await db.from('profiles').select('email, role, status').in('role', roles);
  if (error) {
    console.error('Could not read the staff email addresses.', error);
    return [];
  }
  // A plain array keeps the order and avoids spreading a Set, which the test
  // harness down-levels to ES5 and would silently empty.
  const recipients: string[] = [];
  for (const row of data ?? []) {
    if (String(row?.status ?? 'active') === 'inactive') continue;
    const email = String(row?.email ?? '').trim();
    if (email && recipients.indexOf(email) === -1) recipients.push(email);
  }
  return recipients;
}

export type NotificationResult = {
  sent: number;
  recipients: string[];
  skipped?: 'not-configured' | 'no-project' | 'no-recipients';
};

/**
 * @mine — send one workflow email. Never throws: a missing mailbox, a missing
 * address or a refused message is logged and reported, never returned to the user.
 */
export async function notifyWorkflow(
  db: Db,
  options: { kind: WorkflowEmailKind; projectName: string; inspectorId?: string; note?: string },
): Promise<NotificationResult> {
  const projectName = String(options.projectName ?? '').trim();
  if (!projectName) return { sent: 0, recipients: [], skipped: 'no-project' };

  const settings = mailSettings();
  if (!settings && !senderOverride) return { sent: 0, recipients: [], skipped: 'not-configured' };

  try {
    const recipients = options.kind === 'inspector-assigned'
      ? (options.inspectorId ? await profileEmail(db, options.inspectorId) : [])
      : await roleEmails(db, RECIPIENT_ROLES[options.kind]);
    if (!recipients.length) return { sent: 0, recipients: [], skipped: 'no-recipients' };

    const sender = senderOverride ?? await smtpSender(settings as MailSettings);
    const subject = notificationSubject(projectName, options.kind);
    const note = String(options.note ?? '').trim();
    const text = notificationText(projectName, note);
    const html = notificationHtml(projectName, note);
    const from = (settings?.from ?? DEFAULT_MAIL_FROM);

    let sent = 0;
    for (const to of recipients) {
      try {
        // One message per address, so no recipient sees another's address.
        await sender({ from, to, subject, text, html });
        sent += 1;
      } catch (error) {
        console.error(`Could not send the "${subject}" email.`, error);
      }
    }
    return { sent, recipients };
  } catch (error) {
    console.error('Workflow email failed.', error);
    return { sent: 0, recipients: [] };
  }
}
