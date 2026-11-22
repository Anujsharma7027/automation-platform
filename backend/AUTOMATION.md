# Taskvyn automation engine

A universal, Zapier-style integration engine. Google apps (Gmail, Sheets, Calendar,
Drive, Forms) are the first plugins; any other app plugs into the same contracts.

## The five systems

| System | Where | What it does |
| --- | --- | --- |
| OAuth | `src/connections` | Connects any number of accounts per user. Tokens are AES-256-GCM encrypted, refreshed on the server, never sent to clients. One Google login covers all Google apps via incremental scopes. |
| Integration | `src/engine/core`, `src/engine/apps` | `AppDefinition` describes an app: auth, triggers, actions, input fields, dynamic dropdowns. `GET /integrations` returns the catalog. |
| Trigger | `WorkflowEngine.pollWorkflow` | A BullMQ job scheduler polls each active workflow. New items are de-duplicated (seen-id window + unique index), oldest first. Items that existed before activation are not replayed. |
| Action | `StepRunner.runAction` + app `run()` | Resolves `{{trigger.x}}` / `{{steps.<id>.x}}` mappings, validates/coerces input, calls the app API. |
| Execution | `WorkflowEngine.executeRun` | Runs steps in order. Each step result is stored, so retries resume after the last successful step. Temporary errors retry with exponential backoff (5 attempts); permanent errors fail the run; revoked access turns the workflow off. |

## Adding a new app

1. Create `src/engine/apps/<vendor>/<app>.app.ts` exporting an `AppDefinition`.
2. If it uses a new OAuth provider, implement `OAuthProvider` in `src/connections/providers`
   and add it to `OAUTH_PROVIDERS` in `connections.module.ts`.
3. Add the app to `INSTALLED_APPS` in `src/engine/apps/index.ts`.

Throw `TransientIntegrationError`, `RateLimitError`, `PermanentIntegrationError` or
`AuthRequiredError` so the engine knows whether to retry. Use `authorizedRequest` for HTTP.

## API

- `POST /connections/:provider/connect` `{ apps: ["gmail"] }` → OAuth URL. `GET /connections?app=gmail`.
- `GET /integrations`, `POST /integrations/:app/options/:loader`, `POST /integrations/:app/triggers/:trigger/test`.
- `GET|POST /workflows`, `GET|PATCH|DELETE /workflows/:id`, `POST /workflows/:id/activate|pause|run`, `GET /workflows/:id/runs[/:runId]`.

## Production notes

- Run `PROCESS_ROLE=api` and `PROCESS_ROLE=worker` as separate processes and scale them independently.
- Use managed MongoDB (replica set) and Redis with persistence (`appendonly yes`, `maxmemory-policy noeviction`).
- Google restricted scopes (Gmail, Drive) require Google OAuth app verification (and a security assessment) before public launch.
- Run `npm run migrate:connections` after deploys to create indexes.
