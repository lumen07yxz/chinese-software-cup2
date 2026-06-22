/**
 * DigitalHumanAvatar — 真实照片头像
 */

import type { DHState } from '../services/digitalHumanService';

interface Props {
  state: DHState;
  audioLevel: number;
  size?: number;
}

export default function DigitalHumanAvatar({ state, audioLevel, size = 220 }: Props) {
  const cx = 120, cy = 108;

  return (
    <div className="relative select-none" style={{ width: size, height: size }}>
      <svg viewBox="0 0 240 240" width={size} height={size}>
        <defs>
          <clipPath id="avatarClip"><circle cx={cx} cy={cy} r="105"/></clipPath>
        </defs>

        {/* 背景圆 */}
        <circle cx={cx} cy={cy} r="112" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2.5"/>

        {/* Speaking 发光 */}
        {state === 'speaking' && (
          <circle cx={cx} cy={cy} r="112" fill="none" stroke="var(--color-amber)" strokeWidth="3"
            className="animate-[dhPulse_1.5s_ease-out_infinite]" opacity="0.6"/>
        )}

        {/* Listening 脉冲 */}
        {state === 'listening' && [0, 1, 2].map(i => (
          <circle key={`p${i}`} cx={cx} cy={cy} r="80" fill="none" stroke="var(--color-amber)"
            strokeWidth="2" className="animate-[dhPulse_2s_ease-out_infinite]"
            style={{ animationDelay: `${i * 0.5}s` }}/>
        ))}

        {/* 照片头像 */}
        <image href="/avatar.png" x="15" y="0" width="210" height="210" clipPath="url(#avatarClip)"
          preserveAspectRatio="xMidYMid slice"
        />

        {/* Thinking 旋转三点 */}
        {state === 'thinking' && (
          <g className="orbit-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
            {[0, 1, 2].map(i => {
              const a = (i * 120) * Math.PI / 180;
              return (
                <circle key={`o${i}`} cx={cx + Math.cos(a) * 116} cy={cy + Math.sin(a) * 116}
                  r="5" fill="var(--color-amber)" opacity="0.8"/>
              );
            })}
          </g>
        )}

        {/* Listening 波形 */}
        {state === 'listening' && (
          <g transform="translate(92, 218)">
            {[0, 1, 2, 3, 4].map(i => (
              <rect key={`w${i}`} x={i * 12} y="0" width="6" rx="3" fill="var(--color-amber)" opacity="0.65">
                <animate attributeName="height" values="6;18;10;22;6" dur="0.7s" repeatCount="indefinite" begin={`${i * 0.14}s`}/>
                <animate attributeName="y" values="0;-6;-4;-11;0" dur="0.7s" repeatCount="indefinite" begin={`${i * 0.14}s`}/>
              </rect>
            ))}
          </g>
        )}

        {/* Speaking 口型波动 */}
        {state === 'speaking' && (
          <circle cx={cx} cy={cy + 108} r="3" fill="var(--color-amber)" opacity="0.7">
            <animate attributeName="r" values="2;5;3;6;2" dur="0.5s" repeatCount="indefinite"/>
          </circle>
        )}
      </svg>

      <style>{`
        @keyframes dhPulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .orbit-spin { animation: spin 2s linear infinite; transform-origin: ${cx}px ${cy}px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
