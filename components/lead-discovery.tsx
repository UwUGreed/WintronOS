"use client";
import { useRef, useState, type FormEvent } from "react";
import { Search, ExternalLink } from "lucide-react";
import { Card, Empty, api } from "./ui";
import { IntegrationStatus } from "./integration-status";
import type { LeadResult, LeadSearch } from "@/lib/integration-types";

export function LeadDiscovery({
  configured,
  write,
  onReview,
  openProspect,
  prospects,
}: {
  configured: boolean;
  write: boolean;
  onReview: (result: LeadResult) => void;
  openProspect: (id: string) => void;
  prospects: { id: string; sourceUrl: string }[];
}) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [result, setResult] = useState<LeadSearch | null>(null);
  const [criteria, setCriteria] = useState({ query: "", location: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function search(page: number, input = { query, location }) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await api<LeadSearch>("integrations/leads/search", {
        ...input,
        page,
      });
      setResult(response);
      setCriteria(input);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void search(0);
  }
  return (
    <Card
      title="Discover businesses"
      icon={<Search size={18} />}
      action={
        !configured ? (
          <IntegrationStatus state="SETUP_REQUIRED" />
        ) : (
          <span className="muted">Brave Search</span>
        )
      }
    >
      <div className="integration-body">
        <p>
          Search public websites, review the sources, then choose which
          businesses to save. Results may include directories and articles; they
          are not prequalified leads.
        </p>
        {!configured && (
          <p className="notice">
            Lead search is implemented but needs a Brave Search API key.{" "}
            <a href="/?module=settings&section=integrations">
              View integration setup
            </a>
            . Manual prospect research below is available now.
          </p>
        )}
        {!write && (
          <p className="notice">
            Owners and staff can run provider searches. Your account has
            read-only access.
          </p>
        )}
        <form onSubmit={submit} className="lead-search-form">
          <label>
            <span>Search terms</span>
            <input
              required
              minLength={2}
              maxLength={400}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. independent dental practices"
              disabled={!configured || !write || busy}
            />
          </label>
          <label>
            <span>Search location</span>
            <input
              maxLength={100}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Charleston, SC"
              disabled={!configured || !write || busy}
            />
          </label>
          <button className="button" disabled={!configured || !write || busy}>
            {busy ? "Searching…" : "Search businesses"}
          </button>
        </form>
        <p className="muted small-text">
          Each search or page uses your provider quota. Searches run only when
          you request them. Nothing is saved or contacted automatically.
        </p>
        {error && (
          <p className="error-message" role="alert">
            {error}
            {result ? " Previous results remain below." : ""}
          </p>
        )}
        {result && (
          <div aria-busy={busy}>
            <p role="status">
              {result.results.length} sources for “{result.query}” · Page{" "}
              {result.page + 1} · Retrieved{" "}
              {new Date(result.searchedAt).toLocaleString()} ·{" "}
              {result.remainingToday} searches left today
            </p>
            {result.results.length ? (
              <div className="lead-results">
                {result.results
                  .map((entry) => ({
                    ...entry,
                    existingProspectId:
                      prospects.find((p) => p.sourceUrl === entry.url)?.id ||
                      entry.existingProspectId,
                  }))
                  .map((item) => (
                    <article className="lead-result" key={item.url}>
                      <div>
                        <h3>{item.title}</h3>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.url} <ExternalLink size={12} />
                        </a>
                        <p>
                          {item.description ||
                            "No excerpt returned. Open the source to research this business."}
                        </p>
                        <small className="muted">
                          Search excerpt · not verified business facts
                        </small>
                      </div>
                      {item.existingProspectId ? (
                        <button
                          className="button secondary small"
                          onClick={() => openProspect(item.existingProspectId!)}
                        >
                          Open saved prospect
                        </button>
                      ) : (
                        <button
                          className="button secondary small"
                          onClick={() => onReview(item)}
                        >
                          Review & save prospect
                        </button>
                      )}
                    </article>
                  ))}
              </div>
            ) : (
              <Empty
                title="No matching sources"
                description="Try a different business type or a broader location. No prospects were created."
              />
            )}
            <div className="button-row">
              <button
                className="button secondary small"
                disabled={busy || result.page === 0}
                onClick={() => void search(result.page - 1, criteria)}
              >
                Previous results
              </button>
              <button
                className="button secondary small"
                disabled={busy || !result.more}
                onClick={() => void search(result.page + 1, criteria)}
              >
                Next results
              </button>
            </div>
            <p className="muted small-text">
              Results supplied by Brave Search. Open each source to confirm the
              business and record your own observations.
            </p>
          </div>
        )}
        <div className="integration-inline">
          <IntegrationStatus state="UNDER_DEVELOPMENT" />{" "}
          <span className="muted small-text">
            Automatic email, phone, and contact enrichment
          </span>
        </div>
      </div>
    </Card>
  );
}
