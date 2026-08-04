alter table public.tb810_owners
  add column if not exists legacy_owner_code text;

alter table public.tb810_owners
  add constraint tb810_owners_legacy_owner_code_key unique (legacy_owner_code);

create index if not exists tb810_owners_legacy_owner_code_idx
  on public.tb810_owners (legacy_owner_code);
