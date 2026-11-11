# 毎日の潜航通知の設定手順

自分で決めた時刻の 5 分前に「今日の海」を知らせるプッシュ通知の設定。
鍵が未設定のあいだは、今までの「潜航の開始を通知する」ボタンがそのまま動く。

## 仕組み

```
Supabase の pg_cron（毎時 :25 と :55）
  → https://minasoko.vercel.app/api/push/send を呼ぶ（合言葉付き）
    → 5 分後に潜航時刻を迎える人を due_push_subscriptions() で探す
    → その時刻の海と天気を入れて web-push で送る
      → 端末の Service Worker（public/sw.js）が通知を表示する
```

## 1. 鍵を作る（手元の PC で 1 回だけ）

```bash
npx web-push generate-vapid-keys
```

表示された Public Key と Private Key を控える。送信用の合言葉も作る。

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. テーブルを作る

Supabase の SQL Editor で `supabase/migrations/20261111_push_reminders.sql` を実行する。
環境変数より先に行う（先に環境変数を入れると、テーブルが無い状態で登録が始まってエラーになる）。

## 3. Vercel の環境変数に登録する

Vercel のプロジェクト → Settings → Environment Variables に追加し、Production（試すなら Preview も）を選ぶ。

| 名前 | 値 |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 手順 1 の Public Key |
| `VAPID_PRIVATE_KEY` | 手順 1 の Private Key |
| `PUSH_CRON_SECRET` | 手順 1 の合言葉 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API の `service_role`（secret）キー |

`SUPABASE_SERVICE_ROLE_KEY` と `VAPID_PRIVATE_KEY` は管理用の鍵なので、名前に `NEXT_PUBLIC_` を付けない（付けるとブラウザに公開される）。
追加したら Deployments から Redeploy する（`NEXT_PUBLIC_` の値はビルド時に埋め込まれるため）。

## 4. 定期実行を登録する

Supabase の SQL Editor で、`ここに合言葉` を手順 1 の合言葉に置き換えて実行する。

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 合言葉は Vault に入れておき、SQL には直接書かない
select vault.create_secret('ここに合言葉', 'push_cron_secret');

-- 毎時 :25 と :55 に、5 分後の潜航の通知を送る（同じ名前で実行し直すと上書きされる）
select cron.schedule(
  'minasoko-push-reminders',
  '25,55 * * * *',
  $$
  select net.http_post(
    url := 'https://minasoko.vercel.app/api/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
```

動いているかの確認：

```sql
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
select status_code, content, created from net._http_response order by created desc limit 5;
```

`content` に `{"ok":true,...}` が返っていれば届いている。`401` なら合言葉が Vercel と Vault で違う。

## 5. 試す

1. iPhone では Safari で開き、共有 →「ホーム画面に追加」。追加したアイコンから開く（Safari のままでは通知を受け取れない）
2. 潜航画面の「毎日 21:00 の潜航を知らせる」を押して許可する
3. 「試しに送る」を押して、通知が届くか確かめる

## 止めるとき

```sql
select cron.unschedule('minasoko-push-reminders');
```
