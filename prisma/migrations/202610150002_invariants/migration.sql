ALTER TABLE "Invoice" ADD CONSTRAINT invoice_amounts CHECK ("total" > 0 AND "subtotal" >= 0 AND "discount" >= 0 AND "discount" <= "subtotal" AND "tax" >= 0 AND "total" = "subtotal" - "discount" + "tax");
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_status CHECK (status IN ('DRAFT','ISSUED','VOID'));
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_dates CHECK ("dueDate" >= "issueDate");
ALTER TABLE "InvoiceLine" ADD CONSTRAINT line_amounts CHECK (quantity > 0 AND "unitPrice" >= 0 AND "discountPercent" BETWEEN 0 AND 100 AND "taxPercent" BETWEEN 0 AND 100 AND total = subtotal - discount + tax);
ALTER TABLE "Payment" ADD CONSTRAINT payment_positive CHECK (amount > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT allocation_positive CHECK (amount > 0);
ALTER TABLE "Refund" ADD CONSTRAINT refund_positive CHECK (amount > 0);
ALTER TABLE "Expense" ADD CONSTRAINT expense_positive CHECK (amount > 0);
ALTER TABLE "Owner" ADD CONSTRAINT owner_percentage CHECK (percentage BETWEEN 0 AND 100);
ALTER TABLE "JournalLine" ADD CONSTRAINT line_one_side CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0));
CREATE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; d numeric; c numeric; n integer;
BEGIN
 target := CASE WHEN TG_TABLE_NAME = 'JournalEntry' THEN NEW.id ELSE NEW."entryId" END;
 SELECT COALESCE(SUM(debit),0),COALESCE(SUM(credit),0),COUNT(*) INTO d,c,n FROM "JournalLine" WHERE "entryId"=target;
 IF d <> c OR d <= 0 OR n < 2 THEN RAISE EXCEPTION 'Unbalanced or empty journal %',target; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
CREATE FUNCTION prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable record: use a traceable correction'; END $$;
CREATE TRIGGER immutable_journal BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER immutable_journal_line BEFORE UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER immutable_refund BEFORE UPDATE OR DELETE ON "Refund" FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER immutable_allocation BEFORE UPDATE OR DELETE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER immutable_owner_transaction BEFORE UPDATE OR DELETE ON "OwnerTransaction" FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER immutable_tax_payment BEFORE UPDATE OR DELETE ON "TaxPayment" FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER immutable_tax_configuration BEFORE UPDATE OR DELETE ON "TaxConfiguration" FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE FUNCTION protect_invoice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Invoice deletion is prohibited'; END IF;
 IF OLD.status <> 'DRAFT' AND ((to_jsonb(NEW)-'status'-'voidReason'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'voidReason'-'updatedAt') OR NOT (NEW.status=OLD.status OR (OLD.status='ISSUED' AND NEW.status='VOID' AND length(NEW."voidReason")>=5))) THEN RAISE EXCEPTION 'Issued invoice is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_issued_invoice BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION protect_invoice();
CREATE FUNCTION protect_invoice_line() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target text; BEGIN
 target := CASE WHEN TG_OP='INSERT' THEN NEW."invoiceId" ELSE OLD."invoiceId" END;
 IF EXISTS(SELECT 1 FROM "Invoice" WHERE id=target AND status<>'DRAFT') THEN RAISE EXCEPTION 'Issued invoice lines are immutable'; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM "Invoice" WHERE id=NEW."invoiceId" AND status<>'DRAFT') THEN RAISE EXCEPTION 'Issued invoice lines are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_issued_lines BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceLine" FOR EACH ROW EXECUTE FUNCTION protect_invoice_line();
CREATE FUNCTION protect_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'reconciled') IS DISTINCT FROM (to_jsonb(OLD)-'reconciled') THEN RAISE EXCEPTION 'Payment is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_payment BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION protect_payment();
CREATE INDEX note_search ON "ClientNote" USING GIN (to_tsvector('english', title || ' ' || content));
