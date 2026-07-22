/**
 * Chinese query optimizer — generates alternative query variants for
 * Chinese-language searches by handling simplified/traditional character
 * conversion, stop-word removal, and punctuation compaction.
 *
 * No external NLP dependencies — pure TypeScript.
 */

// ─── Chinese character detection ────────────────────────────────────────

/**
 * Check whether text contains CJK characters.
 * Covers CJK Unified Ideographs (U+4E00–U+9FFF) and CJK Extension A (U+3400–U+4DBF).
 */
export function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}

// ─── Simplified–Traditional character mapping ───────────────────────────

/** Most common simplified → traditional character pairs. */
const ST_MAP: Record<string, string> = {
  '这': '這', '个': '個', '们': '們', '为': '為', '学': '學',
  '习': '習', '实': '實', '见': '見', '现': '現', '说': '說',
  '话': '話', '语': '語', '读': '讀', '写': '寫', '听': '聽',
  '看': '看', '对': '對', '开': '開', '关': '關', '电': '電',
  '网': '網', '车': '車', '马': '馬', '鱼': '魚', '鸟': '鳥',
  '龙': '龍', '门': '門', '问': '問', '间': '間', '国': '國',
  '图': '圖', '团': '團', '机': '機', '气': '氣', '没': '沒',
  '发': '發', '动': '動', '会': '會', '体': '體', '点': '點',
  '万': '萬', '与': '與', '业': '業', '义': '義', '书': '書',
  '买': '買', '争': '爭', '产': '產', '从': '從', '长': '長',
  '风': '風', '飞': '飛', '饭': '飯', '饮': '飲', '钱': '錢',
  '铁': '鐵', '难': '難', '离': '離', '头': '頭', '题': '題',
  '爱': '愛', '乐': '樂', '声': '聲', '时': '時', '过': '過',
  '后': '後', '来': '來', '里': '裡', '边': '邊', '远': '遠',
  '还': '還', '进': '進', '出': '齣', '面': '麵', '让': '讓',
  '认': '認', '识': '識', '请': '請', '记': '記', '证': '證',
  '试': '試', '调': '調', '论': '論', '该': '該', '谢': '謝',
};

// Build reverse map: traditional → simplified
const TS_MAP: Record<string, string> = {};
for (const [simp, trad] of Object.entries(ST_MAP)) {
  TS_MAP[trad] = simp;
}

// ─── Conversion helpers ─────────────────────────────────────────────────

/**
 * Convert simplified Chinese characters to traditional where a mapping exists.
 * Characters without a mapping pass through unchanged.
 */
export function toTraditional(text: string): string {
  return text.split('').map(c => ST_MAP[c] || c).join('');
}

/**
 * Convert traditional Chinese characters to simplified where a mapping exists.
 * Characters without a mapping pass through unchanged.
 */
export function toSimplified(text: string): string {
  return text.split('').map(c => TS_MAP[c] || c).join('');
}

// ─── Query variant generation ───────────────────────────────────────────

const STOP_WORDS = [
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '这个', '那个',
];

/**
 * Generate alternative Chinese query variants to improve search coverage.
 *
 * Strategies:
 * 1. Simplified → Traditional conversion
 * 2. Traditional → Simplified conversion
 * 3. Remove common stop words for broader matching
 * 4. Strip punctuation / whitespace compaction
 *
 * Returns an empty array for non-Chinese queries.
 * Duplicates are removed.
 */
export function generateChineseVariants(query: string): string[] {
  if (!hasChinese(query)) return [];

  const variants: string[] = [];

  // 1. Simplified → Traditional conversion
  const traditional = toTraditional(query);
  if (traditional !== query) {
    variants.push(traditional);
  }

  // 2. Traditional → Simplified conversion
  const simplified = toSimplified(query);
  if (simplified !== query && !variants.includes(simplified)) {
    variants.push(simplified);
  }

  // 3. Remove common stop words for broader search
  for (const word of STOP_WORDS) {
    const withoutStop = query.replace(new RegExp(word, 'g'), '').trim();
    if (withoutStop && withoutStop !== query && withoutStop.length >= 2) {
      variants.push(withoutStop);
    }
  }

  // 4. If query has spaces/punctuation, try without them
  const compact = query.replace(/[\s，。！？、；：""''（）【】《》\-,.!?;:'"()[\]{}]/g, '');
  if (compact !== query && compact.length >= 2) {
    variants.push(compact);
  }

  return [...new Set(variants)];
}