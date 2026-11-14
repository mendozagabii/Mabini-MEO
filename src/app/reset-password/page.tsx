'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import municipalityImage from '../../imports/Municipality of Mabini.jpg';

function ResetPasswordForm() {
  const params = useSearchParams();
  // @mine — Supabase recovery links carry the session in the URL hash
  // (#access_token=...&type=recovery) or a PKCE ?code= instead of ?token=.
  const hashParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.replace(/^#/, '')) : null;
  const token = params.get('token') || hashParams?.get('access_token') || '';
  const code = params.get('code') || '';
  // @mine — when GoTrue rejects a link it redirects here with
  // #error_code=otp_expired&error_description=... and no token; that used to be
  // swallowed, leaving a dead form with no explanation.
  const hashErrorRaw = hashParams?.get('error_description') || hashParams?.get('error_code') || '';
  const hashError = hashErrorRaw ? decodeURIComponent(hashErrorRaw.replace(/\+/g, ' ')) : '';
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const shownError = error || hashError;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 8 || password.length > 64) { setError('Password must be between 8 and 64 characters.'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code, password }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.message || 'Unable to reset password.');
        return;
      }

      setMessage(payload.message);
    } catch {
      setError('Unable to reach the password reset service.');
    } finally {
      setSaving(false);
    }

  };

  return (
    <main className="mabini-login relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8 sm:px-8">
      <div aria-hidden="true" className="mabini-login__photo absolute inset-0" style={{ backgroundImage: `url("${municipalityImage.src}")` }} />
      <div aria-hidden="true" className="mabini-login__overlay absolute inset-0" />
      <div aria-hidden="true" className="mabini-login__glow absolute inset-0" />
      <section className="mabini-login__card relative z-[1] w-full max-w-md overflow-hidden rounded-[28px] border border-white/20 p-8 text-white shadow-[0_24px_64px_rgba(128,128,128,0.15)] sm:p-10">
        <div aria-hidden="true" className="mabini-login__card-shine absolute inset-x-0 top-0 h-32" />
        <div className="relative">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="mt-2 text-sm text-blue-100/75">Choose a new password for your account.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {shownError && <p role="alert" className="rounded-lg bg-red-950/30 p-3 text-sm text-red-100">{shownError}</p>}
          {message && <p role="status" className="rounded-lg bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p>}
          <p id="password-requirements" className="text-sm text-blue-100">Password must be between 8 and 64 characters.</p>
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" aria-describedby="password-requirements" className="h-12 w-full rounded-lg border border-white/80 bg-white px-3 pr-12 text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-300/25" />
            <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-blue-600">
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <button type="submit" disabled={saving || (!token && !code)} className="h-12 w-full rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 font-semibold text-white shadow-lg disabled:opacity-50">
            {saving ? 'Saving...' : 'Reset password'}
          </button>
          {!token && !code && !hashError && (
            <p className="text-xs text-blue-100/70">
              This page needs the link from your e-mail. Open the most recent reset e-mail, or request a new link from the login screen.
            </p>
          )}
        </form>
        </div>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] p-4">Loading...</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
