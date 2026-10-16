CREATE TABLE "ExpenseReview" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "reviewRequired" BOOLEAN NOT NULL,
  "notes" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "reviewerName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseReview_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT expense_review_notes CHECK (length(trim(notes)) BETWEEN 5 AND 4000)
);
CREATE INDEX "ExpenseReview_expenseId_createdAt_idx" ON "ExpenseReview"("expenseId", "createdAt");
CREATE TRIGGER immutable_expense_review BEFORE UPDATE OR DELETE ON "ExpenseReview" FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE OR REPLACE FUNCTION protect_expense() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'reversedAt'-'nextDate'-'reviewRequired') IS DISTINCT FROM (to_jsonb(OLD)-'reversedAt'-'nextDate'-'reviewRequired') THEN RAISE EXCEPTION 'Posted expense is immutable'; END IF; RETURN NEW;
END $$;
