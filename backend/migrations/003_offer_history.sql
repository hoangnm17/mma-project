DECLARE @name sysname;
SELECT TOP 1 @name=k.name FROM sys.key_constraints k WHERE k.parent_object_id=OBJECT_ID('CleaningOffers') AND k.type='UQ';
IF @name IS NOT NULL EXEC('ALTER TABLE CleaningOffers DROP CONSTRAINT '+@name);
CREATE UNIQUE INDEX UX_Offer_version_round ON CleaningOffers(taskId,cleanerId,taskVersion,round);
