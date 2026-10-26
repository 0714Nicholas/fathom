# 検証用の数字（Supabase の SQL Editor で実行）

事前に `supabase/migrations/20261026_dive_logs_and_hardening.sql` を一度実行しておく。

## 1 日ごとの潜航数と人数
```sql
select date_trunc('day', started_at at time zone 'Asia/Tokyo') as day,
       count(*) as dives,
       count(distinct seed) as divers,
       round(avg(duration_ms) / 60000.0, 1) as avg_minutes
from dive_logs
where duration_ms >= 60000
group by 1 order by 1 desc;
```

## 最後まで潜った割合（モード別）
```sql
select mode,
       count(*) as dives,
       round(100.0 * avg(case when completed then 1 else 0 end), 1) as completed_pct
from dive_logs
where started_at > now() - interval '14 days' and duration_ms >= 60000
group by mode order by dives desc;
```

## 10 分以上潜った人
```sql
select count(distinct seed) as divers_10min
from dive_logs
where started_at > now() - interval '7 days' and duration_ms >= 10 * 60000;
```

## また来た人（別の日にも潜った人）
```sql
with days as (
  select seed, count(distinct date_trunc('day', started_at at time zone 'Asia/Tokyo')) as active_days
  from dive_logs
  where started_at > now() - interval '14 days' and duration_ms >= 60000
  group by seed
)
select count(*) filter (where active_days >= 2) as returning_divers,
       count(*) as all_divers,
       round(100.0 * count(*) filter (where active_days >= 2) / nullif(count(*), 0), 1) as returning_pct
from days;
```

## 定時潜航の時間帯ごとの人数（いつ人が集まるか）
```sql
select to_char(slot_start at time zone 'Asia/Tokyo', 'HH24:MI') as slot,
       count(distinct seed) as divers
from dive_logs
where mode = 'scheduled' and slot_start > now() - interval '14 days'
group by 1 order by divers desc;
```
