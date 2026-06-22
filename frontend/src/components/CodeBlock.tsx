import { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import MermaidBlock from './MermaidBlock';

export default function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const match = /language-(\w+)/.exec(className || '');
  const codeStr = String(children).replace(/\n$/, '');
  const isMermaid = match && match[1] === 'mermaid';

  // hooks 必须无条件调用，不能放在 early return 之后
  useEffect(() => {
    if (ref.current && !isMermaid) Prism.highlightElement(ref.current);
  }, [codeStr, isMermaid]);

  if (isMermaid) return <MermaidBlock code={codeStr} />;

  return <code ref={ref} className={className}>{children}</code>;
}
