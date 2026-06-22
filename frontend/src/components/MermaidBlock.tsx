import { useCallback, useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let mermaidInitialized = false;
const renderCache = new Map<string, string>();

function ensureMermaidInit() {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        primaryColor: '#F5F0EB',
        primaryTextColor: '#2D4A3E',
        primaryBorderColor: '#C77D43',
        lineColor: '#8B8580',
        fontSize: '14px',
      },
    });
    mermaidInitialized = true;
  }
}

/** 清洗 mermaid 渲染输出中的 NaN 坐标属性（mermaid 已知 bug） */
function sanitizeSvg(svg: string): string {
  return svg.replace(/ [a-zA-Z]+="NaN"/g, '');
}

/** 验证是否是有效的 mermaid 语法 */
function isValidMermaid(code: string): boolean {
  const t = code.trim();
  // 必须用已知的 mermaid 图类型开头
  const validTypes = ['graph ', 'flowchart ', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
    'erDiagram', 'gantt', 'pie ', 'gitgraph', 'timeline', 'mindmap', 'journey',
    'quadrantChart', 'xyChart', 'block', 'requirementDiagram', 'c4context', 'c4container',
    'c4component', 'c4dynamic', 'c4deployment'];
  return validTypes.some(type => t.startsWith(type));
}

/** 从 markdown 文档中提取 mermaid 代码块 */
export function extractMermaidBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```mermaid\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const code = match[1].trim();
    if (code && isValidMermaid(code)) {
      blocks.push(code);
    }
  }
  return blocks;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const SCALE_STEP = 1.2;

export default function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const trimmedCode = code.trim();
  const valid = isValidMermaid(trimmedCode);

  // ── zoom / pan / drag handlers ──────────────────────────────
  // Wheel 必须用原生事件 { passive: false }，React onWheel 是 passive 的无法 preventDefault
  useEffect(() => {
    const el = svgWrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setScale(prev => {
        const next = e.deltaY < 0 ? prev * SCALE_STEP : prev / SCALE_STEP;
        return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => setScale(s => Math.min(MAX_SCALE, s * SCALE_STEP)), []);
  const zoomOut = useCallback(() => setScale(s => Math.max(MIN_SCALE, s / SCALE_STEP)), []);

  // ── mermaid rendering ───────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !trimmedCode || !valid) {
      if (!valid && trimmedCode) {
        setError('不支持此 mermaid 图类型');
      }
      return;
    }

    ensureMermaidInit();
    setError(null);

    if (renderCache.has(trimmedCode)) {
      containerRef.current.innerHTML = renderCache.get(trimmedCode)!;
      return;
    }

    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    mermaid.render(id, trimmedCode).then(({ svg }) => {
      const clean = sanitizeSvg(svg);
      renderCache.set(trimmedCode, clean);
      if (containerRef.current) {
        containerRef.current.innerHTML = clean;
      }
    }).catch(() => {
      if (!renderCache.has(trimmedCode)) {
        renderCache.set(trimmedCode, '__error__');
      }
    });
  }, [trimmedCode, valid]);

  // ── render ──────────────────────────────────────────────────
  if (error || !valid) {
    return null;
  }

  const hasTransform = scale !== 1 || offset.x !== 0 || offset.y !== 0;

  return (
    <div className="my-2 relative group">
      {/* toolbar — visible on hover */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1
                      bg-white/90 backdrop-blur-sm border border-border rounded-lg px-1 py-0.5
                      shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200
                      dark:bg-zinc-800/90 dark:border-zinc-600">
        <button onClick={zoomOut} title="缩小"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 text-sm font-mono select-none">
          −
        </button>
        <span className="text-xs text-muted min-w-[3rem] text-center font-mono select-none">
          {Math.round(scale * 100)}%
        </span>
        <button onClick={zoomIn} title="放大"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 text-sm font-mono select-none">
          +
        </button>
        {hasTransform && (
          <button onClick={resetView} title="重置视图"
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 text-xs select-none">
            ↺
          </button>
        )}
      </div>

      {/* hint text */}
      <div className="absolute bottom-2 right-2 z-10 text-[11px] text-muted/60
                      opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none pointer-events-none">
        滚轮缩放 · 拖拽平移 · 双击重置
      </div>

      {/* svg viewport */}
      <div
        ref={svgWrapperRef}
        className="mermaid-block overflow-hidden"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={resetView}
      >
        <div
          ref={containerRef}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      </div>
    </div>
  );
}
