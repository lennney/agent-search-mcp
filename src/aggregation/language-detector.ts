export type DetectedLanguage = 'zh' | 'en' | 'ja' | 'ko' | 'auto';

export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.trim().length === 0) return 'auto';

  let cjk = 0;
  let hiragana = 0;
  let katakana = 0;
  let hangul = 0;
  let latin = 0;

  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (!code) continue;
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) cjk++;
    else if (code >= 0x3040 && code <= 0x309f) hiragana++;
    else if (code >= 0x30a0 && code <= 0x30ff) katakana++;
    else if (code >= 0xac00 && code <= 0xd7af) hangul++;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin++;
  }

  const total = text.length;

  if (cjk > 0 && latin > 0 && cjk / total < 0.5 && latin / total < 0.7) return 'auto';
  if (hangul / total > 0.3) return 'ko';
  if ((hiragana + katakana) / total > 0.2) return 'ja';
  if (cjk / total > 0.15) return 'zh';
  if (latin / total > 0.5) return 'en';

  return 'auto';
}
