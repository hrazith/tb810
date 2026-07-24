alter table public.tb810_utility_bills
  add column if not exists previous_reading numeric(12,3),
  add column if not exists current_reading numeric(12,3),
  add column if not exists total_consumption numeric(12,3),
  add column if not exists unit_cost numeric(12,4);

update public.tb810_utility_bills
set previous_reading = coalesce(previous_reading, 0),
    current_reading = coalesce(current_reading, 0),
    total_consumption = coalesce(total_consumption, coalesce(current_reading, 0) - coalesce(previous_reading, 0)),
    unit_cost = case
      when coalesce(current_reading, 0) > coalesce(previous_reading, 0)
        then round(amount / nullif(coalesce(current_reading, 0) - coalesce(previous_reading, 0), 0), 4)
      else unit_cost
    end
where previous_reading is null
   or current_reading is null
   or total_consumption is null
   or unit_cost is null;

alter table public.tb810_utility_bills
  alter column previous_reading set not null,
  alter column previous_reading set default 0,
  alter column current_reading set not null,
  alter column current_reading set default 0,
  alter column total_consumption set not null,
  alter column total_consumption set default 0,
  alter column unit_cost set not null,
  alter column unit_cost set default 0;

alter table public.tb810_utility_bills
  add constraint tb810_utility_bills_reading_order_check
    check (current_reading > previous_reading),
  add constraint tb810_utility_bills_total_consumption_check
    check (total_consumption = current_reading - previous_reading),
  add constraint tb810_utility_bills_unit_cost_check
    check (unit_cost = round(amount / nullif(total_consumption, 0), 4));

create or replace function public.tb810_sync_common_water_utility_bill()
returns trigger
language plpgsql
as $$
declare
  v_billing_period_status text;
begin
  if tg_op = 'INSERT' then
    if new.current_reading is null or new.previous_reading is null then
      raise exception 'Current and previous readings are required';
    end if;

    if new.current_reading <= new.previous_reading then
      raise exception 'Current reading must be greater than previous reading';
    end if;

    if new.amount <= 0 then
      raise exception 'Common water bill amount must be positive';
    end if;

    new.total_consumption := new.current_reading - new.previous_reading;
    new.unit_cost := round(new.amount / new.total_consumption, 4);
    return new;
  end if;

  if new.previous_reading is distinct from old.previous_reading then
    raise exception 'Previous reading is read-only';
  end if;

  if new.building_id is distinct from old.building_id then
    raise exception 'Building is read-only';
  end if;

  if new.utility_type_id is distinct from old.utility_type_id then
    raise exception 'Utility type is read-only';
  end if;

  select status
    into v_billing_period_status
  from public.tb810_billing_periods
  where id = coalesce(new.billing_period_id, old.billing_period_id);

  if v_billing_period_status = 'closed' then
    raise exception 'Common water bills are locked';
  end if;

  if new.current_reading is null or new.amount is null then
    raise exception 'Current reading and amount are required';
  end if;

  if new.current_reading < old.previous_reading then
    raise exception 'Current reading must be greater than or equal to previous reading';
  end if;

  new.previous_reading := old.previous_reading;
  new.total_consumption := new.current_reading - old.previous_reading;
  new.unit_cost := round(new.amount / new.total_consumption, 4);

  return new;
end;
$$;

drop trigger if exists tb810_utility_bills_sync_common_water on public.tb810_utility_bills;
create trigger tb810_utility_bills_sync_common_water
before insert or update on public.tb810_utility_bills
for each row execute function public.tb810_sync_common_water_utility_bill();

create or replace function public.tb810_block_common_water_bill_changes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Common water bills are immutable';
  end if;

  raise exception 'Common water bills are immutable';
end;
$$;

drop trigger if exists tb810_utility_bills_block_delete on public.tb810_utility_bills;
create trigger tb810_utility_bills_block_delete
before delete on public.tb810_utility_bills
for each row execute function public.tb810_block_common_water_bill_changes();
