// 投げ銭（Stripe Payment Link）と、特定商取引法に基づく表記の設定。
// 投げ銭リンクは TIP_URL と LEGAL の必須項目がそろったときだけ表示される（表記なしで販売しないため）。

// Vercel の環境変数 NEXT_PUBLIC_TIP_URL に Stripe の Payment Link（https://buy.stripe.com/...）を入れる
const rawTipUrl = process.env.NEXT_PUBLIC_TIP_URL ?? ''
export const TIP_URL: string | null = rawTipUrl.startsWith('https://') ? rawTipUrl : null

// ここを埋めると /legal に表記ページが出る。空欄のままならページは 404 になる
export const LEGAL = {
  sellerName: '',        // 販売事業者（個人なら氏名）
  representative: '',    // 運営責任者
  email: '',             // 連絡先メールアドレス
  // 個人の場合、住所・電話番号は「請求があれば遅滞なく開示」とする書き方が一般的（消費者庁のガイドラインで要確認）
  address: '請求があった場合、遅滞なく開示いたします。',
  phone: '請求があった場合、遅滞なく開示いたします。',
}

export const LEGAL_READY = Boolean(LEGAL.sellerName && LEGAL.representative && LEGAL.email)

export const TIP_ENABLED = Boolean(TIP_URL && LEGAL_READY)
