/** H44: 间隔重复提醒 — 基于遗忘曲线的复习调度 */

export interface ReviewItem {
  id: string;           // 唯一标识（章节+知识点）
  topic: string;        // 显示名称
  chapter: string;      // 所属章节
  nextReview: number;   // 下次复习时间戳（ms）
  interval: number;     // 当前间隔（天）
  easeFactor: number;   // 难度因子（初始 2.5）
  reviewCount: number;  // 已复习次数
  createdAt: number;    // 创建时间
}

const STORAGE_KEY = 'spaced_repetition_items';

/** 从 localStorage 加载所有复习项 */
export function loadReviewItems(): ReviewItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

/** 保存复习项到 localStorage */
function saveReviewItems(items: ReviewItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * 添加新的复习计划（做错题/学完章节后调用）
 * @param topic 知识点名称
 * @param chapter 所属章节
 * @param quality 初始掌握度 0-5（0=完全不会，5=完全掌握）
 */
export function scheduleReview(topic: string, chapter: string, quality: number = 1): void {
  const items = loadReviewItems();
  const id = `${chapter}:${topic}`;

  // 去重：如果已有该项，更新而非重复添加
  const existing = items.find((item) => item.id === id);
  if (existing) {
    // 重新计算间隔
    const updated = calculateNextReview(existing, quality);
    Object.assign(existing, updated);
    saveReviewItems(items);
    return;
  }

  // 新项：根据初始掌握度设定首次复习间隔
  const initialInterval = quality >= 4 ? 4 : quality >= 3 ? 2 : quality >= 2 ? 1 : 0.5;
  const newItem: ReviewItem = {
    id,
    topic,
    chapter,
    nextReview: Date.now() + initialInterval * 24 * 60 * 60 * 1000,
    interval: initialInterval,
    easeFactor: 2.5,
    reviewCount: 0,
    createdAt: Date.now(),
  };

  items.push(newItem);
  saveReviewItems(items);
}

/**
 * SM-2 算法变体：计算下次复习时间
 * @param item 当前复习项
 * @param quality 本次复习掌握度 0-5
 */
export function calculateNextReview(item: ReviewItem, quality: number): Partial<ReviewItem> {
  let { easeFactor, interval, reviewCount } = item;

  // 调整难度因子（SM-2 公式）
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  if (quality < 3) {
    // 掌握度低：重置间隔，明天再复习
    interval = 1;
    reviewCount = 0;
  } else {
    // 掌握度足够：延长间隔
    reviewCount++;
    if (reviewCount === 1) {
      interval = 1;
    } else if (reviewCount === 2) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }

  // 上限 180 天
  interval = Math.min(interval, 180);

  return {
    interval,
    easeFactor,
    reviewCount,
    nextReview: Date.now() + interval * 24 * 60 * 60 * 1000,
  };
}

/** 获取今天待复习的项 */
export function getDueReviews(): ReviewItem[] {
  const items = loadReviewItems();
  const now = Date.now();
  return items
    .filter((item) => item.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview);
}

/** 标记已复习并更新调度 */
export function markReviewed(id: string, quality: number): void {
  const items = loadReviewItems();
  const item = items.find((i) => i.id === id);
  if (!item) return;

  const updated = calculateNextReview(item, quality);
  Object.assign(item, updated);
  saveReviewItems(items);
}

/** 删除复习项 */
export function removeReviewItem(id: string): void {
  const items = loadReviewItems().filter((i) => i.id !== id);
  saveReviewItems(items);
}
