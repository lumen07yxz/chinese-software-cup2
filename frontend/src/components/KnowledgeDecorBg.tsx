/** 装饰元素背景 — 配合星空基调 */
export default function KnowledgeDecorBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <svg className="absolute top-10 right-10" width="120" height="120" viewBox="0 0 24 24" style={{ opacity: 0.03 }}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="white" strokeWidth="1" fill="none"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="white" strokeWidth="1" fill="none"/>
      </svg>
      <svg className="absolute bottom-10 left-5" width="160" height="120" viewBox="0 0 160 120" style={{ opacity: 0.025 }}>
        {[40, 80, 120].flatMap((x) => [30, 60, 90].map((y) => (
          <g key={`${x}-${y}`}><circle cx={x} cy={y} r="3" fill="white" opacity="0.5"/><line x1={x} y1={y} x2={80} y2={60} stroke="white" strokeWidth="0.5" opacity="0.3"/></g>
        )))}
      </svg>
      <div className="absolute bottom-20 right-16 text-[48px] text-white/5 font-serif italic">&#x222B;</div>
      <div className="absolute top-40 left-8 text-[14px] text-white/5 font-serif">P(y|x) = softmax(W·x + b)</div>
    </div>
  );
}
