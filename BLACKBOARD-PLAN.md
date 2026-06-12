# Blackboard Upgrade Plan — Context Graph as Coordination Medium

Goal: turn the context graph from a passive store into the coordination layer
agents use instead of talking to each other. Agents = stateless functions that
read/write nodes. Workflow = status transitions. Orchestration = schema, not an LLM.

## Principles (do not deviate)
1. Agents NEVER message each other. All coordination through node reads/writes.
2. Every write is signed (`created_by`) — human writes are ground truth.
3. Workflow lives in status transitions; each agent is allowed specific transitions only.
4. Humans (Priya, cofounder via Telegram) are agents too — they own judgment transitions.
5. No orchestrator agent until a manual routing decision becomes painful.

## Phase 1 — Schema migration (Supabase SQL editor)
Add to `nodes`:
- `created_by text default 'priya'` — agent name or human
- `confidence real default 1.0` — 1.0 human, lower for agent hypotheses
- `source_url text` — provenance for scouted data
- `claimed_by text`, `claimed_until timestamptz` — work leases
- `last_verified timestamptz default now()` — freshness

New table `transitions` — the permission map / state machine:
- `node_type text, from_status text, to_status text, allowed_agent text`
- Seeded for: task lifecycle + lead pipeline (new → qualified → approved → contacted → replied → won/lost)

File: `migrations/001_blackboard.sql`

## Phase 2 — MCP Worker upgrades (aethr-mcp)
New endpoints, all enforcing the transitions table:
- `POST /claim` — body {id, agent, minutes} → sets claimed_by/claimed_until if unclaimed or lease expired
- `POST /transition` — body {id, agent, to_status} → checks transitions table, applies if allowed, 403 if not
- `POST /webhook/node-change` — receiver for Postgres trigger; on lead → qualified, pushes Telegram approval message
- `/add-node` now requires `created_by`; defaults confidence by source

Worker env additions: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (wrangler secrets).

## Phase 3 — Postgres trigger → Worker (event-driven, kills polling)
- Enable `pg_net` extension
- Trigger on `nodes` UPDATE/INSERT where status changed → `net.http_post` to
  `https://aethr-mcp.aethr-spaces.workers.dev/webhook/node-change`
- File: `migrations/002_trigger.sql`

## Phase 4 — App updates (aethr-agent)
- Telegram route: all writes include `created_by: 'priya'` (via telegram), confidence 1.0
- complete/park go through worker `/transition` instead of direct Supabase update
  (so permissions are enforced in ONE place)

## Phase 5 — First worker agent on top: Job Scout (separate task, after 1–4 verified)
- Cron Worker: searches target-company job posts → writes `lead` nodes
  (graph: priya-personal, type: lead, status: new, created_by: 'job-scout', confidence: 0.6)
- Qualifier: new → qualified + drafts outreach → trigger pushes Telegram approval

## Verification checklist
- [ ] Migration runs clean; existing nodes get defaults
- [ ] /transition rejects a disallowed transition (e.g. scout trying approved)
- [ ] /claim prevents double-claim, allows after lease expiry
- [ ] Updating a node status in SQL editor fires Telegram message via trigger
- [ ] Telegram "done with X" still works end-to-end through /transition
