<!-- @mine — created 2026-11-09. Custom Supabase Auth email templates for Mabini MEO.
     Paste into: Supabase Dashboard → Authentication → Email Templates.
     Variables available: {{ .ConfirmationURL }}, {{ .Email }}, {{ .SiteURL }}, {{ .Token }} -->

# 📧 Email Templates — Mabini MEO (WBLRMS)

## 1. Reset Password (the one the system actually sends)

**Subject:**
```
Reset your Mabini MEO (WBLRMS) password
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
        <!-- Header -->
        <tr><td style="background-color:#1e3a5f;padding:28px 40px;text-align:center;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">MUNICIPAL ENGINEERING OFFICE</p>
          <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Municipality of Mabini, Batangas</p>
          <p style="margin:2px 0 0;color:#93c5fd;font-size:11px;">Local Road Management System (WBLRMS)</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px 8px;">
          <p style="margin:0 0 16px;color:#0f172a;font-size:18px;font-weight:bold;">Reset your password</p>
          <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">
            Hello,</p>
          <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">
            We received a request to reset the password for your Mabini MEO account
            (<strong>{{ .Email }}</strong>). Click the button below to choose a new password.</p>
        </td></tr>
        <tr><td align="center" style="padding:8px 40px 8px;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 36px;border-radius:6px;">Reset Password</a>
        </td></tr>
        <tr><td style="padding:16px 40px 8px;">
          <p style="margin:0 0 8px;color:#475569;font-size:13px;line-height:1.6;">
            This link will expire in <strong>1 hour</strong> and can only be used once.</p>
          <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.6;">
            If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="margin:0 0 16px;font-size:12px;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#2563eb;">{{ .ConfirmationURL }}</a></p>
          <p style="margin:0 0 24px;color:#475569;font-size:13px;line-height:1.6;">
            If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
            Municipal Engineering Office · Mabini, Batangas<br>
            This is an automated message from the Local Road Management System. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 2. Other templates (optional — subjects + note)

The system currently only triggers the reset email (signup is disabled). If you want
consistency, update the subjects of the built-in templates to:

| Template | Suggested subject |
|---|---|
| Confirm sign up | `Confirm your Mabini MEO (WBLRMS) account` |
| Invite user | `You've been invited to Mabini MEO (WBLRMS)` |
| Magic link | `Your Mabini MEO (WBLRMS) sign-in link` |
| Change email address | `Confirm your new email address — Mabini MEO` |
| Password changed (notification) | `Your Mabini MEO password was changed` |

For their bodies, you can reuse the same header/footer shell above and swap the
middle text + button label, keeping the `{{ .ConfirmationURL }}` link.

---

## 3. The six workflow emails (built — `src/lib/notifications.ts`)

Sent by the system itself through the office mailbox (nodemailer, SMTP). They are **off** until
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` are set in the hosting
environment; until then every workflow keeps working and simply sends nothing.

All six share one shell — the same office header, a bold **Notification**, the paragraph below,
the project name as the headline, and the same footer:

> Good day!
>
> The project details have been successfully submitted, updated, or recorded in the system. Kindly review the details and take the necessary action.
>
> **[Project name]**
>
> Office of the Municipal Engineer · Mabini, Batangas
> This is an automated message. Please do not reply to this email.

| # | Sent when | From → To | Subject |
|---|---|---|---|
| 1 | Encoder creates a project | Encoder → every active Validator | `[Project] – For Validation` |
| 2 | Validator returns it for revision | Validator → every active Encoder | `[Project] – For Revision` |
| 3 | Encoder saves a returned project with changes | Encoder → every active Validator | `[Project] – Project Information Updated` |
| 4 | Validator approves it | Validator → every active Head Engineer | `[Project] – Validated` |
| 5 | Head Engineer assigns an inspector | Head Engineer → that Inspector | `[Project] – Inspector Assigned` |
| 6 | Inspector saves an inspection | Inspector → every active Encoder | `[Project] – Inspection Recorded` |

Notes that decide behaviour:

- **`[Project]` is the project name**, not the word "Project".
- One message per recipient, so no address is shown to anybody else.
- **The Head Engineer is never copied on emails 1–3** (answer 6). Email 4 goes to the Head Engineer because that is its purpose.
- Clearing an inspector sends no email; an ordinary edit of a project that was never returned sends no email.
- Inactive accounts are skipped; a failing mailbox is logged and never blocks or fails the action that triggered it.
