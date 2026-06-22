'use client'

import { useEffect, useRef } from 'react'

interface Star {
  x: number; y: number; r: number
  twinkleSpeed: number; twinkleOffset: number
  baseAlpha: number; hue: number
}

const STAR_COUNT = 200

export default function StarsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<Star[]>([])
  const timeRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function resize() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
    }

    function initStars() {
      const stars: Star[] = []
      for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
          x: Math.random() * canvas!.width,
          y: Math.random() * canvas!.height,
          r: Math.random() * 1.8 + 0.3,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
          twinkleOffset: Math.random() * Math.PI * 2,
          baseAlpha: Math.random() * 0.5 + 0.4,
          hue: Math.random() < 0.1 ? 210 : (Math.random() < 0.05 ? 240 : 30),
        })
      }
      starsRef.current = stars
    }

    function draw() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      timeRef.current++

      for (const s of starsRef.current) {
        const alpha = s.baseAlpha + Math.sin(timeRef.current * s.twinkleSpeed + s.twinkleOffset) * 0.3
        const clamped = Math.max(0.15, Math.min(1, alpha))

        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3)
        if (s.hue === 210) glow.addColorStop(0, `rgba(147,197,253,${clamped})`)
        else if (s.hue === 240) glow.addColorStop(0, `rgba(167,139,250,${clamped * 0.7})`)
        else glow.addColorStop(0, `rgba(253,224,71,${clamped * 0.6})`)
        glow.addColorStop(1, 'transparent')

        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${clamped})`
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    resize()
    initStars()
    draw()
    window.addEventListener('resize', () => { resize(); initStars() })

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas ref={canvasRef} className="fixed top-0 left-0 w-screen h-screen pointer-events-none z-0" />
  )
}
