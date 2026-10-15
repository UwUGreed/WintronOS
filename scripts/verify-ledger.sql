DO $$ BEGIN
 IF EXISTS(SELECT e.id FROM "JournalEntry" e LEFT JOIN "JournalLine" l ON l."entryId"=e.id GROUP BY e.id HAVING COALESCE(SUM(l.debit),0)<>COALESCE(SUM(l.credit),0) OR COALESCE(SUM(l.debit),0)<=0 OR COUNT(l.id)<2) THEN
 RAISE EXCEPTION 'Journal invariants failed'; END IF;
 IF EXISTS(SELECT 1 FROM "Invoice" WHERE total<>subtotal-discount+tax) THEN RAISE EXCEPTION 'Invoice totals failed'; END IF;
END $$;
SELECT 'Ledger and invoice verification passed' AS result;
