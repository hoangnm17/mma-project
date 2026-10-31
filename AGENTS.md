# StayFlow — shared project instructions

This repository has two independently installed packages: backend/ (Express/MongoDB) and frontend/ (Expo/React Native mobile and guest web). Shared contracts and role briefs live in docs/. All paths here are relative to the repository root.

## Read before working

- Read docs/agents/SHARED_API_RULES.md, the task-relevant sections of docs/team-handoff.md, and docs/api-reference-current.md.
- Backend tasks: read backend/AGENTS.md and docs/agents/BE_AGENT.md.
- Frontend tasks: read frontend/AGENTS.md, applicable nested rules, and docs/agents/FE_MOBILE_AGENT.md. Expo-specific rules were preserved in frontend/AGENTS.md.
- For work spanning both, read both roles and coordinate contracts within the requested task. Do not create extra Agents or run the entire backlog just because these files describe two roles.
- Inspect current source and preserve unrelated working-tree changes. Existing API documentation is a dated snapshot, not evidence of the deployed server/APK version.

## Architecture and workflow

- backend/ owns validation, database transactions, permissions, pricing, state transitions, jobs and API tests. frontend/ owns screens, forms, session, query cache, notification client and app builds.
- Current workflow: Admin/Receptionist, HOUR/NIGHT, direct desk housekeeping, FOOD/SPECIAL orders and transactional checkout payments. Cleaner/DAY material is compatibility history.
- Keep docs/api-reference-current.md and docs/stayflow-team.postman_collection.json aligned when changing contracts; finish with the role handoff template.
- Root package.json contains orchestration scripts only. Frontend dependencies/config/env and Expo CLI live in frontend/; backend dependencies/env live in backend/. Do not move secret values into shared docs.
- Node >=22.13 is required. Install both packages with npm run setup from the root, or npm ci in each package; npm ci at the root does not install application dependencies.
- Run Expo/EAS from frontend/; inspect frontend/package.json for the installed SDK and follow frontend/AGENTS.md before changing Expo/EAS/React Native APIs.

## Checks and commands

- From root: npm run dev:backend, npm run dev:frontend, npm run web, npm run export:web, npm run test:ui.
- Run npm run lint and npm run typecheck before declaring completion; run relevant backend unit/integration or UI/export checks for the change. Report what was not verified.
- npm test runs backend unit/HTTP tests. npm run test:integration:local creates an isolated local Mongo replica set, not the configured demo/cloud DB.
- Keep Mongo schema/migration history and data intact. Do not reset/seed an existing deployed database to make an upgrade pass.
- Quick start: README.md, backend/README.md, frontend/README.md and docs/agents/README.md.
