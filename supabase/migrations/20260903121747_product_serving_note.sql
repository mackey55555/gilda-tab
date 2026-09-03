-- 営業画面で使用量（45ml / ロック60ml など）をその場で確認できるようにするための列。
-- 商品名に入れるとボタンが窮屈になり、明細や CSV にも出てしまうので別列にする。
--
-- 追加のみ。既存の値には触れない。

alter table public.products add column serving_note text;

comment on column public.products.serving_note is
  '1 杯あたりの使用量メモ。営業画面のヒント表示にだけ使う。';
