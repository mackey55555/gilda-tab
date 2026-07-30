let counter = 0;

/**
 * 楽観的更新中の行を識別するためのローカル ID。
 *
 * crypto.randomUUID() は secure context（HTTPS / localhost）でしか使えず、
 * 実機確認で http://192.168.x.x を開くと undefined になるため自前で採番する。
 * DB には保存せず 1 セッション内でしか使わないので、この程度の一意性で足りる。
 */
export function createLocalId(prefix = "temp"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
