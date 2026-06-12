-- Phase 3: Event-driven graph — Postgres trigger fires the Worker on status change.
-- Run in Supabase SQL editor AFTER 001_blackboard.sql.

-- pg_net lets Postgres make HTTP calls (Supabase ships it, just enable)
create extension if not exists pg_net;

create or replace function notify_node_change()
returns trigger as $$
begin
  -- only fire when status actually changed (or new row inserted)
  if (tg_op = 'UPDATE' and new.status is not distinct from old.status) then
    return new;
  end if;

  perform net.http_post(
    url := 'https://aethr-mcp.aethr-spaces.workers.dev/webhook/node-change',
    body := jsonb_build_object(
      'record', to_jsonb(new),
      'old_status', case when tg_op = 'UPDATE' then old.status else null end
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  return new;
end;
$$ language plpgsql;

drop trigger if exists on_node_change on nodes;
create trigger on_node_change
  after insert or update on nodes
  for each row
  execute function notify_node_change();
