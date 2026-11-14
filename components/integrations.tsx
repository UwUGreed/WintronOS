"use client";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Card, api } from "./ui";
import { LeadIntegration } from "./lead-integration";
import { IntegrationStatus } from "./integration-status";
import {
  developmentIntegrations,
  type SmtpStatus,
} from "@/lib/integration-types";

export function Integrations() {
  const [smtp, setSmtp] = useState<SmtpStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<SmtpStatus>("integrations/smtp")
      .then((value) => {
        if (live) setSmtp(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (smtp?.state !== "CHECKING" || busy) return;
    let live = true;
    const timer = setTimeout(() => {
      void api<SmtpStatus>("integrations/smtp")
        .then((value) => {
          if (live) setSmtp(value);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 2000);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [smtp, busy]);
  async function check() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setSmtp(await api<SmtpStatus>("integrations/smtp/check", {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="workspace-intro">
        <p>
          Working features show their actual connection status. Unfinished
          integrations are marked Under development.
        </p>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError("");
              void api<SmtpStatus>("integrations/smtp")
                .then(setSmtp)
                .catch((e) => setError(e.message));
            }}
          >
            Refresh status
          </button>
        </div>
      )}
      <Card
        title="Invoice email"
        icon={<Mail size={20} />}
        action={
          smtp ? (
            <IntegrationStatus state={busy ? "CHECKING" : smtp.state} />
          ) : (
            <span>Loading status…</span>
          )
        }
      >
        <div className="integration-body">
          <p>
            Send issued invoices as PDF attachments through your SMTP provider.
          </p>
          <p role="status">
            {smtp?.detail ||
              "Reading server configuration and connection history…"}
          </p>
          {smtp && smtp.issues.length > 0 && (
            <ul>
              {smtp.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={!smtp?.configured || busy || smtp.state === "CHECKING"}
              onClick={check}
            >
              {busy ? "Checking…" : "Check connection"}
            </button>
          </div>
          <p className="muted">
            Checks the server connection and authentication without sending an
            email. A successful check does not guarantee sender approval or
            inbox delivery.
          </p>
          <dl className="detail-list">
            <dt>Last connection check</dt>
            <dd>
              {smtp?.checkedAt
                ? new Date(smtp.checkedAt).toLocaleString()
                : "No completed check for this configuration"}
            </dd>
            <dt>Last invoice accepted by SMTP</dt>
            <dd>
              {smtp?.lastAcceptedAt
                ? new Date(smtp.lastAcceptedAt).toLocaleString()
                : "No successful send recorded"}
            </dd>
          </dl>
          <details>
            <summary>Server setup instructions</summary>
            <p>
              Set these variables in the server’s private environment file,
              restart the app, and check the connection here. Credentials are
              never returned to your browser.
            </p>
            <dl className="detail-list">
              <dt>Server</dt>
              <dd>
                <code>SMTP_HOST</code> and <code>SMTP_PORT</code> (usually 587)
              </dd>
              <dt>Sender</dt>
              <dd>
                <code>SMTP_FROM</code> — a sender approved by your provider
              </dd>
              <dt>Authentication</dt>
              <dd>
                <code>SMTP_USER</code> and <code>SMTP_PASSWORD</code>
              </dd>
              <dt>Encryption</dt>
              <dd>
                <code>SMTP_SECURE=false</code> for required STARTTLS on 587;{" "}
                <code>true</code> for TLS on 465
              </dd>
            </dl>
            <p>
              Downloadable invoice PDFs are available without an email
              connection.
            </p>
          </details>
        </div>
      </Card>
      <LeadIntegration />
      <div className="integration-section">
        <h2>Under development</h2>
        <p>
          These integrations cannot be connected yet. Adding credentials will
          not enable them.
        </p>
      </div>
      <div className="two-columns">
        {developmentIntegrations.map((integration) => (
          <Card
            key={integration.id}
            title={integration.name}
            action={<IntegrationStatus state="UNDER_DEVELOPMENT" />}
          >
            <div className="integration-body">
              <p>{integration.description}</p>
              <p className="muted">{integration.available}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
