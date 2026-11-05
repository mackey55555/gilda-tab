/**
 * インボイスの登録番号（T + 法人番号 13 桁）を検証する。
 *
 * 法人番号の先頭 1 桁は残り 12 桁から計算するチェックデジットなので、打ち間違いの大半はここで見つかる
 * （実際に先頭の 1 桁違いを入力しかけたことがある）。DB 側は形式（^T[0-9]{13}$）だけを見ている。
 */
export function validateRegistrationNumber(value: string): string | null {
  if (!/^T\d{13}$/.test(value)) {
    return "登録番号は T に続けて 13 桁の数字で入力してください";
  }

  const digits = value.slice(1);
  const base = digits.slice(1);

  // 国税庁の計算式: 下の桁から数えて奇数桁 ×1・偶数桁 ×2 の和を 9 で割った余りを 9 から引く
  let sum = 0;
  Array.from(base)
    .reverse()
    .forEach((digit, index) => {
      sum += Number(digit) * (index % 2 === 0 ? 1 : 2);
    });
  const expected = 9 - (sum % 9);

  if (Number(digits[0]) !== expected) {
    return "登録番号が正しくありません（チェックデジットが一致しません）";
  }

  return null;
}
