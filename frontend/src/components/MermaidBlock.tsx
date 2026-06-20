import { useEffect, useRef, useState } from 'react';
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

export default function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmedCode = code.trim();
  const valid = isValidMermaid(trimmedCode);

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
    }).catch((err) => {
      // 只在首次渲染时记错，避免重复刷
      if (!renderCache.has(trimmedCode)) {
        renderCache.set(trimmedCode, '__error__');
        setError(err?.message?.slice(0, 80) || '渲染失败');
      }
    });
  }, [trimmedCode, valid]);

  // 无效或渲染失败的，显示纯文本代码块
  if (error || !valid) {
    return (
      <div className="mermaid-block my-2">
        <pre className="text-left text-[13px] text-gray-600 bg-cream/50 p-3 rounded-lg border border-border overflow-x-auto whitespace-pre-wrap font-mono">
          {trimmedCode}
        </pre>
      </div>
    );
  }

  return <div ref={containerRef} className="mermaid-block my-2" />;
}
