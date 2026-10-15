"use client";
import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { ShieldCheck, KeyRound, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Card } from "./ui";
export function AccountSecurity() {
  const [enabled, setEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    authClient
      .getSession()
      .then((r) => setEnabled(r.data?.user.twoFactorEnabled || false));
  }, []);
  async function enable(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await authClient.twoFactor.enable({ password });
      if (r.error) throw new Error(r.error.message);
      if (r.data && "totpURI" in r.data) {
        setQr(await QRCode.toDataURL(r.data.totpURI));
        setBackupCodes(r.data.backupCodes);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    setError("");
    const r = await authClient.twoFactor.verifyTotp({ code });
    if (r.error) setError(r.error.message || "Invalid code");
    else {
      setEnabled(true);
      setQr("");
      setMessage(
        "Two-factor authentication enabled. Store the recovery codes securely.",
      );
    }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await authClient.changePassword({
      currentPassword: password,
      newPassword,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (r.error) setError(r.error.message || "Password change failed");
    else {
      setPassword("");
      setNewPassword("");
      setMessage("Password changed and other sessions revoked.");
    }
  }
  return (
    <div className="settings-grid">
      <Card title="Two-factor authentication" icon={<ShieldCheck size={20} />}>
        <p className="muted">
          Protect your account with an authenticator app and recovery codes.
        </p>
        {enabled ? (
          <p className="notice success">TOTP authentication is enabled.</p>
        ) : qr ? (
          <form onSubmit={verify}>
            <img
              src={qr}
              width={180}
              height={180}
              alt="Authenticator enrollment QR code"
            />
            <label>
              <span>Six-digit authenticator code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
              />
            </label>
            <button className="button">Verify and enable</button>
          </form>
        ) : (
          <form onSubmit={enable}>
            <label>
              <span>Current password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button className="button" disabled={busy}>
              Set up authenticator
            </button>
          </form>
        )}
        {backupCodes.length > 0 && (
          <div className="recovery-codes">
            <strong>Save these recovery codes privately</strong>
            <p>
              Each code can be used once. This is your recovery path if you lose
              your authenticator.
            </p>
            <pre>{backupCodes.join("\n")}</pre>
          </div>
        )}
      </Card>
      <Card title="Password & sessions" icon={<KeyRound size={20} />}>
        <form onSubmit={changePassword}>
          <label>
            <span>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label>
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={14}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <button className="button" disabled={busy}>
            Change password
          </button>
        </form>
        <button
          className="button secondary"
          onClick={async () => {
            const r = await authClient.revokeOtherSessions();
            if (r.error)
              setError(r.error.message || "Could not revoke sessions");
            else setMessage("Other sessions revoked.");
          }}
        >
          <LogOut size={16} />
          Sign out other devices
        </button>
      </Card>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
    </div>
  );
}
