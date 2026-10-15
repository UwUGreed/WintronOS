CREATE OR REPLACE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; d numeric; c numeric; n integer;
BEGIN
 target := CASE WHEN TG_TABLE_NAME = 'JournalEntry' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'entryId' END;
 SELECT COALESCE(SUM(debit),0),COALESCE(SUM(credit),0),COUNT(*) INTO d,c,n FROM "JournalLine" WHERE "entryId"=target;
 IF d <> c OR d <= 0 OR n < 2 THEN RAISE EXCEPTION 'Unbalanced or empty journal %',target; END IF;
 RETURN NULL;
END $$;
