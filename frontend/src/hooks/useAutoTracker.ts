import { useEffect, useRef } from 'react';
import { recordBehavior } from '../services/api';

// 跨页面累计：全局维护今日总学习分钟和上次记录时间
let globalAccumulatedMinutes = 0;
let globalSessionStart = Date.now();
let globalLastRecordedDate = 0;

function getTodayKey(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function flushMinutes(source: string) {
  const now = Date.now();
  const sessionMinutes = Math.round((now - globalSessionStart) / 60000);
  globalSessionStart = now;
  if (sessionMinutes < 1) return;

  globalAccumulatedMinutes += sessionMinutes;
  const today = getTodayKey();

  // 每天只记录一次累计总时长（避免重复写入 DB）
  if (globalLastRecordedDate === today && source !== 'unmount') return;
  globalLastRecordedDate = today;

  recordBehavior({
    study_time_minutes: globalAccumulatedMinutes,
    resource_type: source,
  }).catch(() => {});
}

/** #21: 跨页面累计学习时长，每天只记录一次总时长到后端 */
export function useAutoTracker(active = true) {
  useEffect(() => {
    if (!active) return;
    globalSessionStart = Date.now();

    const onVisibility = () => {
      if (document.hidden) flushMinutes('visibility');
    };
    const onUnload = () => flushMinutes('unload');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      flushMinutes('unmount');
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [active]);
}

/** #22: 滚动到底部时记录实际阅读时长（而非硬编码 5 分钟） */
export function useScrollTracker(
  containerRef: React.RefObject<HTMLElement | null>,
  resourceId: number | null,
) {
  const recorded = useRef(false);
  const scrollStart = useRef(Date.now());

  useEffect(() => {
    if (!containerRef.current || !resourceId) return;
    recorded.current = false;
    scrollStart.current = Date.now();

    const el = containerRef.current;
    const onScroll = () => {
      if (recorded.current) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        recorded.current = true;
        const actualMinutes = Math.max(1, Math.round((Date.now() - scrollStart.current) / 60000));
        recordBehavior({
          study_time_minutes: actualMinutes,
          resource_type: 'read_complete',
        }).catch(() => {});
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [resourceId]);
}
