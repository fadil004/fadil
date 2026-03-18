-- ══════════════════════════════════════════════
-- حاسبة التسعير — Supabase Schema
-- ══════════════════════════════════════════════
-- Run this in: Supabase Dashboard → SQL Editor → New query

-- ── Profiles ──
create table public.profiles (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  emoji text not null default '⚡',
  display_order integer default 0,
  created_at timestamptz default now()
);

-- ── Styles (per profile) ──
create table public.styles (
  id text primary key,
  profile_id text references public.profiles(id) on delete cascade not null,
  name text not null,
  icon text not null default '🎯',
  description text default '',
  is_fixed boolean default false,
  min_per30 numeric default 0,
  max_per30 numeric default 0,
  min_fixed numeric default 0,
  max_fixed numeric default 0,
  display_order integer default 0
);

-- ── Extras (per style) ──
create table public.extras (
  id text primary key,
  style_id text references public.styles(id) on delete cascade not null,
  name text not null,
  icon text not null default '🎨',
  per_unit numeric default 0,
  display_order integer default 0
);

-- ── Team members ──
create table public.team_members (
  id bigint primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  specialties jsonb default '[]',
  links jsonb default '[]',
  rate text default '',
  status text default 'available',
  created_at timestamptz default now()
);

-- ── Project logs ──
create table public.project_logs (
  id bigint primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  client text not null,
  notes text default '',
  profile_name text default '',
  profile_emoji text default '',
  style_name text default '',
  style_icon text default '',
  duration text default '',
  urgency numeric default 0,
  currency text default 'USD',
  price_min numeric default 0,
  price_max numeric default 0,
  extras jsonb default '[]',
  team_members jsonb default '[]',
  date timestamptz,
  completed boolean default false,
  final_received numeric,
  final_team_costs jsonb default '{}',
  created_at timestamptz default now()
);

-- ── User settings ──
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  exchange_rate numeric default 1500,
  updated_at timestamptz default now()
);

-- ══════════════════════════════════════════════
-- Row Level Security (RLS)
-- ══════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.styles enable row level security;
alter table public.extras enable row level security;
alter table public.team_members enable row level security;
alter table public.project_logs enable row level security;
alter table public.user_settings enable row level security;

-- Profiles: each user owns their own
create policy "users own profiles"
  on public.profiles for all
  using (auth.uid() = user_id);

-- Styles: accessible if the parent profile belongs to the user
create policy "users own styles"
  on public.styles for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = styles.profile_id
        and profiles.user_id = auth.uid()
    )
  );

-- Extras: accessible if the parent style's profile belongs to the user
create policy "users own extras"
  on public.extras for all
  using (
    exists (
      select 1 from public.styles
      join public.profiles on profiles.id = styles.profile_id
      where styles.id = extras.style_id
        and profiles.user_id = auth.uid()
    )
  );

-- Team members: each user owns their own
create policy "users own team"
  on public.team_members for all
  using (auth.uid() = user_id);

-- Project logs: each user owns their own
create policy "users own logs"
  on public.project_logs for all
  using (auth.uid() = user_id);

-- User settings: each user owns their own
create policy "users own settings"
  on public.user_settings for all
  using (auth.uid() = user_id);

-- ══════════════════════════════════════════════
-- Enable Realtime (run separately if needed)
-- ══════════════════════════════════════════════
-- alter publication supabase_realtime add table public.profiles;
-- alter publication supabase_realtime add table public.team_members;
-- alter publication supabase_realtime add table public.project_logs;
