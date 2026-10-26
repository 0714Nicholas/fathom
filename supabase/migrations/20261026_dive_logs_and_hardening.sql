-- Fathom: 潜航ログ・週間統計・crystal_karma の保護
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する（何度実行しても壊れないように書いてある）

-- ---------------------------------------------------------------------------
-- 1. 潜航ログ
--    1 回の潜航ごとに 1 行。書き込みは /api/dive-log からのみ（anon キーで insert）。
--    読み取りは直接させず、集計関数 dive_stats() だけを公開する。
-- ---------------------------------------------------------------------------
create table if not exists public.dive_logs (
  id uuid primary key,
  seed text not null check (char_length(seed) between 3 and 64),
  mode text not null check (mode in ('scheduled', 'meditate', 'focus', 'sleep')),
  port text check (char_length(port) <= 64),
  slot_start timestamptz,
  started_at timestamptz not null,
  duration_ms integer not null check (duration_ms between 0 and 3 * 60 * 60 * 1000),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists dive_logs_started_at_idx on public.dive_logs (started_at);
create index if not exists dive_logs_seed_idx on public.dive_logs (seed);

alter table public.dive_logs enable row level security;

drop policy if exists "anon can insert dive logs" on public.dive_logs;
create policy "anon can insert dive logs"
  on public.dive_logs for insert
  to anon
  with check (
    started_at > now() - interval '4 hours'
    and started_at <= now() + interval '5 minutes'
  );
-- select / update / delete のポリシーは作らない（= 誰も直接読めない・書き換えられない）

-- ---------------------------------------------------------------------------
-- 2. 週間統計（ランディングの「今週 N人が潜りました」用）
-- ---------------------------------------------------------------------------
create or replace function public.dive_stats()
returns table (divers_7d bigint, dives_7d bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(distinct seed) as divers_7d,
    count(*) as dives_7d
  from public.dive_logs
  where started_at > now() - interval '7 days'
    and duration_ms >= 60 * 1000;
$$;

revoke all on function public.dive_stats() from public;
grant execute on function public.dive_stats() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. crystal_karma の保護
--    座標（seed）を知っていれば復帰できる設計なので、行そのものは守れない。
--    代わりに「累計を減らす」「一度に大きく増やす」更新を弾いて、荒らしを防ぐ。
--    アプリは 10 秒ごとに潜行時間を足しているので、1 回の更新で 2 分以上は増えない。
-- ---------------------------------------------------------------------------
create or replace function public.guard_crystal_karma()
returns trigger
language plpgsql
as $$
begin
  if new.seed is distinct from old.seed then
    raise exception 'seed cannot be changed';
  end if;
  if coalesce(new.total_age_ms, 0) < coalesce(old.total_age_ms, 0)
     or coalesce(new.total_age_ms, 0) - coalesce(old.total_age_ms, 0) > 120000 then
    raise exception 'invalid total_age_ms change';
  end if;
  if coalesce(new.total_releases, 0) < coalesce(old.total_releases, 0)
     or coalesce(new.total_releases, 0) - coalesce(old.total_releases, 0) > 5 then
    raise exception 'invalid total_releases change';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.crystal_karma') is not null then
    drop trigger if exists guard_crystal_karma on public.crystal_karma;
    create trigger guard_crystal_karma
      before update on public.crystal_karma
      for each row execute function public.guard_crystal_karma();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. 確認用：今のテーブルごとの RLS とポリシー（実行して結果を見るだけ）
-- ---------------------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public';
