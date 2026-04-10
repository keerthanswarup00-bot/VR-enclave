create table if not exists plots (
  id bigserial primary key,
  plot_number text unique not null,
  size_type text not null,
  dimensions text not null,
  area_sqm numeric(10,2) not null,
  status text not null check (status in ('available', 'booked', 'sold')),
  facing text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_plots_status on plots (status);
create index if not exists idx_plots_size_type on plots (size_type);

alter table plots enable row level security;

drop policy if exists "public read plots" on plots;
drop policy if exists "public update plots" on plots;

create policy "public read plots"
on plots
for select
to anon, authenticated
using (true);

create policy "public update plots"
on plots
for update
to anon, authenticated
using (true)
with check (true);
