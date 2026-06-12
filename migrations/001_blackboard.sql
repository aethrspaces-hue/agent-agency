-- Phase 1: Blackboard upgrade — provenance, claims, freshness, transitions
-- Run in Supabase SQL editor.

-- 1. Provenance + coordination columns on nodes
alter table nodes add column if not exists created_by text not null default 'priya';
alter table nodes add column if not exists confidence real not null default 1.0;
alter table nodes add column if not exists source_url text;
alter table nodes add column if not exists claimed_by text;
alter table nodes add column if not exists claimed_until timestamptz;
alter table nodes add column if not exists last_verified timestamptz not null default now();

-- 2. Transition permission table — THE state machine / orchestrator
create table if not exists transitions (
  id bigint generated always as identity primary key,
  node_type text not null,
  from_status text not null,
  to_status text not null,
  allowed_agent text not null  -- agent name, or 'priya' / 'human' for judgment steps
);

-- avoid duplicate rules on re-run
create unique index if not exists transitions_unique
  on transitions (node_type, from_status, to_status, allowed_agent);

-- 3. Seed: task lifecycle (humans + telegram agent manage tasks)
insert into transitions (node_type, from_status, to_status, allowed_agent) values
  ('task', 'active',  'completed', 'priya'),
  ('task', 'active',  'parked',    'priya'),
  ('task', 'parked',  'active',    'priya'),
  ('task', 'active',  'completed', 'telegram-agent'),
  ('task', 'active',  'parked',    'telegram-agent'),
  ('task', 'parked',  'active',    'telegram-agent')
on conflict do nothing;

-- 4. Seed: lead pipeline (scout creates, qualifier qualifies, ONLY human approves)
insert into transitions (node_type, from_status, to_status, allowed_agent) values
  ('lead', 'new',       'qualified', 'qualifier'),
  ('lead', 'new',       'rejected',  'qualifier'),
  ('lead', 'qualified', 'approved',  'priya'),
  ('lead', 'qualified', 'rejected',  'priya'),
  ('lead', 'approved',  'contacted', 'priya'),
  ('lead', 'contacted', 'replied',   'priya'),
  ('lead', 'contacted', 'followup_due', 'chaser'),
  ('lead', 'followup_due', 'contacted', 'priya'),
  ('lead', 'replied',   'won',       'priya'),
  ('lead', 'replied',   'lost',      'priya')
on conflict do nothing;

-- 5. Janitor: anyone stale gets re-verified by the janitor agent or human
insert into transitions (node_type, from_status, to_status, allowed_agent) values
  ('task', 'active', 'stale', 'janitor'),
  ('task', 'stale',  'active', 'priya'),
  ('task', 'stale',  'parked', 'priya')
on conflict do nothing;
