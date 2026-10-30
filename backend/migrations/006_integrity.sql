ALTER TABLE StayServiceItems ADD CONSTRAINT FK_ServiceItems_task FOREIGN KEY(taskId) REFERENCES HousekeepingTasks(id);
ALTER TABLE HousekeepingTasks ADD CONSTRAINT CK_Task_checklist CHECK(ISJSON(checklistJson)=1);
ALTER TABLE CleaningOffers ADD CONSTRAINT CK_Offer_score CHECK(ISJSON(scoreBreakdown)=1);
ALTER TABLE CleaningAssignments ADD CONSTRAINT CK_Assignment_checklist CHECK(checklistJson IS NULL OR ISJSON(checklistJson)=1);
