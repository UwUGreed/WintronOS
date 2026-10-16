"use client";
import { useState } from "react";
import { Modal, Badge, api, currency, dateLabel } from "./ui";
import { DocumentLink } from "./document-preview";
import type { Expense } from "@/lib/client-types";

export function ExpenseReviewDialog({
  expense,
  owner,
  onClose,
  onSaved,
}: {
  expense: Expense;
  owner: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canReview = owner && !expense.reversedAt;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`expenses/${expense.id}/review`, {
        notes,
        reviewRequired: !expense.reviewRequired,
      });
      setNotes("");
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Review expense"
      description={`${expense.vendor} · ${currency(expense.amount)} · ${dateLabel(expense.date)}`}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body expense-review-body">
          <div className="expense-review-summary">
            <div>
              <strong>{expense.description}</strong>
              <p className="muted">{expense.category}</p>
            </div>
            <Badge
              value={
                expense.reversedAt
                  ? "VOID"
                  : expense.reviewRequired
                    ? "REVIEW_REQUIRED"
                    : expense.reviews.length
                      ? "REVIEWED"
                      : "RECORDED"
              }
            />
          </div>
          <p className="muted">
            Check the receipt, amount, business purpose and category. Marking
            reviewed records your check and clears the review flag. It does not
            change the ledger or determine tax deductibility.
          </p>
          {expense.notes ? (
            <p>
              <strong>Expense notes:</strong> {String(expense.notes)}
            </p>
          ) : null}
          <section aria-label="Receipts" className="expense-review-receipts">
            <h3>Receipts</h3>
            {expense.documents.length ? (
              expense.documents.map((d) => (
                <DocumentLink key={d.id} document={d} />
              ))
            ) : (
              <p className="muted">
                No receipt attached. You can upload one from the expense list.
              </p>
            )}
          </section>
          {canReview ? (
            <label>
              <span>
                {expense.reviewRequired
                  ? "Review notes"
                  : "Reason to reopen review"}
              </span>
              <textarea
                aria-label={
                  expense.reviewRequired
                    ? "Review notes"
                    : "Reason to reopen review"
                }
                required
                minLength={5}
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  expense.reviewRequired
                    ? "What did you check, and what was the outcome?"
                    : "What needs another look?"
                }
              />
            </label>
          ) : (
            <p className="muted">
              {expense.reversedAt
                ? "This expense was reversed. Its review history remains available."
                : "An owner can mark this expense reviewed or reopen its review."}
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <section
            className="expense-review-history"
            aria-label="Review history"
          >
            <h3>Review history</h3>
            {expense.reviews.length ? (
              expense.reviews.map((review) => (
                <article key={review.id}>
                  <div>
                    <Badge
                      value={
                        review.reviewRequired ? "REVIEW_REQUIRED" : "REVIEWED"
                      }
                    />
                    <small className="muted">
                      {review.reviewerName} ·{" "}
                      {new Date(review.createdAt).toLocaleString("en-US", {
                        timeZone: "America/New_York",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      ET
                    </small>
                  </div>
                  <p>{review.notes}</p>
                </article>
              ))
            ) : (
              <p className="muted">No reviews recorded yet.</p>
            )}
          </section>
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
          {canReview && (
            <button
              className="button"
              disabled={busy || notes.trim().length < 5}
            >
              {busy
                ? "Saving…"
                : expense.reviewRequired
                  ? "Mark reviewed"
                  : "Reopen review"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
