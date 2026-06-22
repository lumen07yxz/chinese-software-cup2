'use client'

import { useEffect, useRef } from 'react'

interface Star { x: number; y: number; r: number; a: number; s: number; o: number }

export default function SidebarStars({ collapsed }: { collapsed: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<Star[]>([])
  const timeRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const N = collapsed ? 60 : 120

    function resize() {
      const parent = canvas!.parentElement!
      canvas!.width = parent.offsetWidth
      canvas!.height = parent.offsetHeight
    }

    function initStars() {
      const s: Star[] = []
      for (let i = 0; i < N; i++) {
        s.push({
          x: Math.random() * canvas!.width,
          y: Math.random() * canvas!.height,
          r: Math.random() * 1.5 + 0.2,
          a: Math.random() * 0.6 + 0.2,
          s: Math.random() * 0.015 + 0.003,
          o: Math.random() * Math.PI * 2,
        })
      }
      starsRef.current = s
    }

    function draw() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      timeRef.current++
      for (const star of starsRef.current) {
        const alpha = star.a + Math.sin(timeRef.current * star.s + star.o) * 0.3
        const c = Math.max(0.1, Math.min(1, alpha))

        const g = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.r * 3)
        g.addColorStop(0, `rgba(147,197,253,${c})`)
        g.addColorStop(1, 'transparent')

        ctx.beginPath()
        ctx.arc(star.x, star.y, star.r * 3, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()

        ctx.beginPath()
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${c})`
        ctx.fill()
      }
      rafRef.current = requestAnimationFrame(draw)
    }

    resize()
    initStars()
    draw()

    const handleResize = () => { resize(); initStars() }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [collapsed])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.5 }}
    />
  )
}
