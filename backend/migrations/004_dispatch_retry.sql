ALTER TABLE HousekeepingTasks ADD nextDispatchAt datetime2 NOT NULL CONSTRAINT DF_Task_nextDispatch DEFAULT SYSUTCDATETIME();
