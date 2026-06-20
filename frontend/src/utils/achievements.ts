/** H42-H43: 每日学习目标 + 打卡 + 成就徽章系统 */

// ── 每日打卡 ──────────────────────────────────────────────

interface DailyRecord {
  date: string;        // YYYY-MM-DD
  studyMinutes: number;
  quizCompleted: number;
  resourcesRead: number;
}

const DAILY_KEY = 'daily_goals';

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 获取今日学习记录 */
export function getTodayRecord(): DailyRecord {
  try {
    const records: DailyRecord[] = JSON.parse(localStorage.getItem(DAILY_KEY) || '[]');
    const today = getToday();
    return records.find((r) => r.date === today) || { date: today, studyMinutes: 0, quizCompleted: 0, resourcesRead: 0 };
  } catch { return { date: getToday(), studyMinutes: 0, quizCompleted: 0, resourcesRead: 0 }; }
}

/** 更新今日学习记录 */
export function updateTodayRecord(partial: Partial<DailyRecord>): void {
  try {
    const records: DailyRecord[] = JSON.parse(localStorage.getItem(DAILY_KEY) || '[]');
    const today = getToday();
    const existing = records.find((r) => r.date === today);
    if (existing) {
      Object.assign(existing, partial);
    } else {
      records.push({ date: today, studyMinutes: 0, quizCompleted: 0, resourcesRead: 0, ...partial });
    }
    // 只保留最近 30 天
    const trimmed = records.slice(-30);
    localStorage.setItem(DAILY_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

/** 获取连续学习天数 */
export function getStreak(): number {
  try {
    const records: DailyRecord[] = JSON.parse(localStorage.getItem(DAILY_KEY) || '[]');
    if (records.length === 0) return 0;

    // 按日期降序排列
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const today = getToday();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // 从今天或昨天开始计算连续天数
    if (sorted[0].date !== today && sorted[0].date !== yesterday) return 0;

    let streak = 0;
    let checkDate = sorted[0].date === today ? new Date() : new Date(Date.now() - 86400000);

    for (let i = 0; i < 365; i++) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      const record = sorted.find((r) => r.date === dateStr);
      if (record && (record.studyMinutes > 0 || record.quizCompleted > 0 || record.resourcesRead > 0)) {
        streak++;
        checkDate = new Date(checkDate.getTime() - 86400000);
      } else {
        break;
      }
    }
    return streak;
  } catch { return 0; }
}

// ── 成就徽章 ──────────────────────────────────────────────

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: () => boolean;
}

const ACHIEVEMENTS_KEY = 'unlocked_achievements';

/** 所有成就定义 */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_login', name: '初来乍到', description: '首次登录系统', icon: '🎓', condition: () => true },
  { id: 'first_chat', name: '破冰之旅', description: '完成第一次对话', icon: '💬', condition: () => false },
  { id: 'first_quiz', name: '学以致用', description: '完成第一次练习', icon: '✏️', condition: () => {
    try { return (JSON.parse(localStorage.getItem('wrong-answers') || '[]').length > 0 || getTodayRecord().quizCompleted > 0); } catch { return false; }
  }},
  { id: 'streak_3', name: '三天打鱼', description: '连续学习 3 天', icon: '🔥', condition: () => getStreak() >= 3 },
  { id: 'streak_7', name: '一周坚持', description: '连续学习 7 天', icon: '💪', condition: () => getStreak() >= 7 },
  { id: 'streak_30', name: '月度学霸', description: '连续学习 30 天', icon: '🏆', condition: () => getStreak() >= 30 },
  { id: 'quiz_10', name: '刷题达人', description: '累计完成 10 次练习', icon: '📝', condition: () => {
    try { const r: DailyRecord[] = JSON.parse(localStorage.getItem(DAILY_KEY) || '[]'); return r.reduce((s, d) => s + d.quizCompleted, 0) >= 10; } catch { return false; }
  }},
  { id: 'resources_5', name: '知识探索者', description: '阅读 5 篇以上资源', icon: '📚', condition: () => {
    try { const r: DailyRecord[] = JSON.parse(localStorage.getItem(DAILY_KEY) || '[]'); return r.reduce((s, d) => s + d.resourcesRead, 0) >= 5; } catch { return false; }
  }},
];

/** 获取已解锁的成就 ID 列表 */
export function getUnlockedAchievements(): string[] {
  try { return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || '[]'); } catch { return []; }
}

/** 检查并解锁新成就，返回新解锁的成就列表 */
export function checkAchievements(): Achievement[] {
  const unlocked = getUnlockedAchievements();
  const newlyUnlocked: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (!unlocked.includes(achievement.id) && achievement.condition()) {
      unlocked.push(achievement.id);
      newlyUnlocked.push(achievement);
    }
  }

  if (newlyUnlocked.length > 0) {
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
  }
  return newlyUnlocked;
}
