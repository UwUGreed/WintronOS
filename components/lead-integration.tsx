"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api, Card } from "./ui";
import { IntegrationStatus } from "./integration-status";
import type { LeadStatus } from "@/lib/integration-types";

export function LeadIntegration() {
  const [status, setStatus] = useState<LeadStatus | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    api<LeadStatus>("integrations/leads")
      .then((value) => {
        if (live) {
          setStatus(value);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  return (
    <Card
      title="Lead discovery — Brave Search"
      icon={<Search size={20} />}
      action={
        status ? (
          <IntegrationStatus state={status.state} />
        ) : (
          <span>Loading status…</span>
        )
      }
    >
      <div className="integration-body">
        <p>
          Discover public business websites, review source excerpts, and save
          selected prospects for research.
        </p>
        {error ? (
          <p role="alert" className="error-message">
            {error}{" "}
            <button
              className="text-button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Refresh lead status
            </button>
          </p>
        ) : (
          <p>{status?.detail || "Reading provider configuration…"}</p>
        )}
        <div className="button-row">
          <a className="button secondary" href="/?module=prospecting">
            Open prospect research
          </a>
        </div>
        {status && (
          <dl className="detail-list">
            <dt>Last provider request</dt>
            <dd>
              {status.lastSearchAt
                ? new Date(status.lastSearchAt).toLocaleString()
                : "No completed request for this key"}
            </dd>
            <dt>Daily search usage</dt>
            <dd>
              {status.usedToday} / {status.dailyLimit} requests · resets at
              midnight UTC
            </dd>
          </dl>
        )}
        <details>
          <summary>Search provider setup</summary>
          <p>
            Create a key in your{" "}
            <a
              href="https://api-dashboard.search.brave.com/"
              target="_blank"
              rel="noreferrer"
            >
              Brave Search API account
            </a>
            . Set <code>BRAVE_SEARCH_API_KEY</code> in the private server
            environment and restart the app. Then run a search in Prospecting to
            verify it. Provider usage is billed under your own plan.
          </p>
          <p>
            <code>LEAD_SEARCH_DAILY_LIMIT</code> controls the per-organization
            daily limit (default 100, maximum 1,000). Failed provider attempts
            also count. The API key stays on the server.
          </p>
          <p>
            Search excerpts are shown for review and are not saved as verified
            facts. Automatic contact enrichment remains under development.
          </p>
        </details>
      </div>
    </Card>
  );
}
