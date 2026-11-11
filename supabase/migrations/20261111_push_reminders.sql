-- Minasoko: 毎日の潜航を知らせるプッシュ通知
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する（何度実行しても壊れないように書いてある）
-- 定期実行（pg_cron）の登録は docs/push-setup.md の手順 4 で別に行う

-- ---------------------------------------------------------------------------
-- 1. 通知先
--    書き込み・読み取りは Vercel の API（service_role の鍵）からのみ。
--    ポリシーを作らないので、ブラウザの anon キーからは読めない・書けない。
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  seed text check (seed is null or char_length(seed) between 3 and 64),
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  -- その人のタイムゾーンでの時刻（0 = 0:00、1260 = 21:00）。潜航は :00 と :30 だけなので 30 分刻み
  remind_minute smallint not null check (remind_minute between 0 and 1410 and remind_minute % 30 = 0),
  weekdays_only boolean not null default false,
  -- 同じ日に二重に送らないため（その人のタイムゾーンでの日付）
  last_sent_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_remind_minute_idx on public.push_subscriptions (remind_minute);

alter table public.push_subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- 2. その潜航の時刻に知らせる人を探す
--    p_slot は潜航の開始時刻（UTC）。タイムゾーンごとに現地の時刻と曜日に直して比べる。
-- ---------------------------------------------------------------------------
create or replace function public.due_push_subscriptions(p_slot timestamptz)
returns setof public.push_subscriptions
language sql
stable
set search_path = public
as $$
  select s.*
  from public.push_subscriptions s
  where s.time_zone in (select name from pg_timezone_names)
    and s.remind_minute = (
      extract(hour from p_slot at time zone s.time_zone)::int * 60
      + extract(minute from p_slot at time zone s.time_zone)::int
    )
    and (not s.weekdays_only or extract(isodow from p_slot at time zone s.time_zone) between 1 and 5)
    and (s.last_sent_on is null or s.last_sent_on < (p_slot at time zone s.time_zone)::date);
$$;

revoke all on function public.due_push_subscriptions(timestamptz) from public, anon, authenticated;
grant execute on function public.due_push_subscriptions(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 3. 通知から開いた潜航を数えるための列（効果の測定用）
-- ---------------------------------------------------------------------------
alter table public.dive_logs add column if not exists source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dive_logs_source_check') then
    alter table public.dive_logs
      add constraint dive_logs_source_check check (source is null or source in ('push'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. 確認用（実行して結果を見るだけ）
-- ---------------------------------------------------------------------------
-- 登録数と時刻の分布
-- select remind_minute / 60 as hour, remind_minute % 60 as minute, count(*) from push_subscriptions group by 1, 2 order by 1, 2;
-- 通知から開いた潜航
-- select date_trunc('day', started_at at time zone 'Asia/Tokyo') as day, count(*) filter (where source = 'push') as from_push, count(*) as all_dives
-- from dive_logs where duration_ms >= 60000 group by 1 order by 1 desc;
