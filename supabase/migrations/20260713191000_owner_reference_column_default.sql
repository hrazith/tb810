alter table public.tb810_owners
  alter column owner_reference set default public.tb810_generate_owner_reference();

drop trigger if exists tb810_owners_protect_owner_reference on public.tb810_owners;

create trigger tb810_owners_protect_owner_reference
before update on public.tb810_owners
for each row execute function public.tb810_protect_owner_reference();
