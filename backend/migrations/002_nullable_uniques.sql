-- SQL Server UNIQUE treats NULL as a value. Optional links need filtered indexes.
DECLARE @drop nvarchar(max)='';
SELECT @drop=@drop+'ALTER TABLE '+QUOTENAME(OBJECT_SCHEMA_NAME(k.parent_object_id))+'.'+QUOTENAME(OBJECT_NAME(k.parent_object_id))+' DROP CONSTRAINT '+QUOTENAME(k.name)+';'
FROM sys.key_constraints k JOIN sys.index_columns ic ON ic.object_id=k.parent_object_id AND ic.index_id=k.unique_index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE k.type='UQ' AND ((OBJECT_NAME(k.parent_object_id)='Stays' AND c.name='bookingId') OR (OBJECT_NAME(k.parent_object_id)='StayServiceItems' AND c.name='taskId') OR (OBJECT_NAME(k.parent_object_id)='CleaningAssignments' AND c.name='offerId'));
EXEC sp_executesql @drop;
CREATE UNIQUE INDEX UX_Stays_booking ON Stays(bookingId) WHERE bookingId IS NOT NULL;
CREATE UNIQUE INDEX UX_ServiceItems_task ON StayServiceItems(taskId) WHERE taskId IS NOT NULL;
CREATE UNIQUE INDEX UX_Assignment_offer ON CleaningAssignments(offerId) WHERE offerId IS NOT NULL;
CREATE TABLE ReceiptReturns(id varchar(36) PRIMARY KEY,receiptId varchar(36) NOT NULL REFERENCES Receipts(id),amount int NOT NULL CHECK(amount>0),reason nvarchar(500) NOT NULL,actorId varchar(36) NOT NULL REFERENCES Users(id),createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
