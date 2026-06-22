import { useCallback, useRef, useEffect } from 'react';

/**
 * 流式文本缓冲 Hook
 *
 * 解决 SSE 文本一块一块出来不好阅读的问题。
 * 原理：SSE chunk 先进入 buffer，然后以固定速率逐步释放到 store，
 * 形成流畅的逐字显示效果。
 *
 * @param appendToStore - 将文本追加到 store 的回调（即 appendToLast）
 * @param flushInterval - flush 间隔（ms），默认 25ms
 */
export function useStreamBuffer(
  appendToStore: (text: string) => void,
  flushInterval = 25,
) {
  const bufferRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushingRef = useRef(false);

  // 启动 flush 定时器
  const startFlushing = useCallback(() => {
    if (flushingRef.current) return;
    flushingRef.current = true;

    timerRef.current = setInterval(() => {
      const buf = bufferRef.current;
      if (!buf) {
        // buffer 已空，停止 flush
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        flushingRef.current = false;
        return;
      }

      // 每次释放一批字符（按字节估算，中文 ~3字节，英文 ~1字节）
      // 目标每批约 6 字节，确保中文字符完整释放
      let charsToRelease = 0;
      let bytes = 0;
      while (charsToRelease < buf.length && bytes < 6) {
        const charCode = buf.charCodeAt(charsToRelease);
        bytes += charCode > 0x7f ? 3 : 1;
        charsToRelease++;
      }

      if (charsToRelease > 0) {
        const released = buf.slice(0, charsToRelease);
        bufferRef.current = buf.slice(charsToRelease);
        appendToStore(released);
      }
    }, flushInterval);
  }, [appendToStore, flushInterval]);

  // 停止 flush
  const stopFlushing = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    flushingRef.current = false;
  }, []);

  // 添加 chunk 到 buffer
  const pushChunk = useCallback((chunk: string) => {
    bufferRef.current += chunk;
    startFlushing();
  }, [startFlushing]);

  // 强制立即释放 buffer 中所有内容
  const flushAll = useCallback(() => {
    stopFlushing();
    const remaining = bufferRef.current;
    bufferRef.current = '';
    if (remaining) {
      appendToStore(remaining);
    }
  }, [stopFlushing, appendToStore]);

  // 重置
  const reset = useCallback(() => {
    stopFlushing();
    bufferRef.current = '';
  }, [stopFlushing]);

  // 组件卸载时清理
  useEffect(() => {
    return () => stopFlushing();
  }, [stopFlushing]);

  return { pushChunk, flushAll, reset };
}
