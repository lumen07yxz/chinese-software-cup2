import { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import MermaidBlock from './MermaidBlock';

export default function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const match = /language-(\w+)/.exec(className || '');
  const codeStr = String(children).replace(/\n$/, '');

  if (match && match[1] === 'mermaid') return <MermaidBlock code={codeStr} />;

  useEffect(() => { if (ref.current) Prism.highlightElement(ref.current); }, [codeStr]);

  return <code ref={ref} className={className}>{children}</code>;
}
