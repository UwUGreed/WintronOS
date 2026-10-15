ALTER TABLE "Payment" ADD COLUMN "paymentAccount" TEXT NOT NULL DEFAULT '1000';
ALTER TABLE "Expense" ADD COLUMN "paymentAccount" TEXT NOT NULL DEFAULT '1000';
CREATE FUNCTION protect_expense() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'reversedAt'-'nextDate') IS DISTINCT FROM (to_jsonb(OLD)-'reversedAt'-'nextDate') THEN RAISE EXCEPTION 'Posted expense is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_expense BEFORE UPDATE OR DELETE ON "Expense" FOR EACH ROW EXECUTE FUNCTION protect_expense();
