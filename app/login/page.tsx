"use client";
import { useState, type FormEvent } from "react";
import { ShieldCheck, ArrowRight, KeyRound } from "lucide-react";
import { Logo } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfa, setMfa] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mfa) {
        const r = recovery
          ? await authClient.twoFactor.verifyBackupCode({ code })
          : await authClient.twoFactor.verifyTotp({ code });
        if (r.error) throw new Error(r.error.message);
        window.location.assign("/");
      } else {
        const r = await authClient.signIn.email({ email, password });
        if (r.error) throw new Error(r.error.message);
        if (r.data && "twoFactorRedirect" in r.data && r.data.twoFactorRedirect)
          setMfa(true);
        else window.location.assign("/");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-brand">
        <Logo />
      </div>
      <div className="login-card">
        <div className="login-symbol">
          <KeyRound size={26} />
        </div>
        <span className="eyebrow">YOUR BUSINESS. ONE WORKSPACE.</span>
        <h1>{mfa ? "Verify your identity" : "Welcome to Wintron OS"}</h1>
        <p>
          {mfa
            ? "Enter your authenticator code to continue."
            : "Sign in to your private business workspace."}
        </p>
        <form onSubmit={submit}>
          {mfa ? (
            <label>
              <span>{recovery ? "Recovery code" : "Authenticator code"}</span>
              <input
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
          ) : (
            <>
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@your-company.com"
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Please wait…" : mfa ? "Verify and sign in" : "Sign in"}
            <ArrowRight size={17} />
          </button>
          {mfa && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setRecovery(!recovery);
                setCode("");
              }}
            >
              {recovery ? "Use authenticator" : "Use a recovery code"}
            </button>
          )}
        </form>
        <div className="login-help">
          <ShieldCheck size={16} />
          <span>
            Authorized staff only. Accounts are provisioned by your
            administrator.
          </span>
        </div>
      </div>
      <p className="login-footer">
        Wintron Technologies LLC <span>·</span> South Carolina
      </p>
    </main>
  );
}
