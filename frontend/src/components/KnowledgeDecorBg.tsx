/** 知识相关淡色装饰元素背景 */
export default function KnowledgeDecorBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Textbook icon hint - top right */}
      <svg
        className="absolute top-10 right-10"
        width="120" height="120" viewBox="0 0 24 24"
        style={{ opacity: 0.03 }}
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="#2D4A3E" strokeWidth="1" fill="none"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="#2D4A3E" strokeWidth="1" fill="none"/>
      </svg>

      {/* Neural network lines - bottom left */}
      <svg
        className="absolute bottom-10 left-5"
        width="160" height="120" viewBox="0 0 160 120"
        style={{ opacity: 0.04 }}
      >
        {[40, 80, 120].flatMap((x) =>
          [30, 60, 90].map((y) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="3" fill="#2D4A3E" opacity="0.5"/>
              <line x1={x} y1={y} x2={80} y2={60} stroke="#2D4A3E" strokeWidth="0.5" opacity="0.3"/>
            </g>
          ))
        )}
      </svg>

      {/* Integral sign - bottom right */}
      <svg
        className="absolute bottom-20 right-16"
        width="60" height="80" viewBox="0 0 40 60"
        style={{ opacity: 0.035 }}
      >
        <text x="5" y="50" fontSize="48" fill="#2D4A3E" fontFamily="serif" fontStyle="italic">∫</text>
      </svg>

      {/* Math formula - top left */}
      <svg
        className="absolute top-40 left-8"
        width="200" height="40" viewBox="0 0 200 40"
        style={{ opacity: 0.025 }}
      >
        <text x="0" y="28" fontSize="14" fill="#2D4A3E" fontFamily="serif">
          P(y|x) = softmax(W·x + b)
        </text>
      </svg>
    </div>
  );
}
