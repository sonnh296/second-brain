'use client'

import { useEffect, useState } from 'react'

type Offset = { x: number; y: number }

function ParallaxWrap({
  offset,
  factor,
  className,
  children,
}: Readonly<{
  offset: Offset
  factor: number
  className?: string
  children?: React.ReactNode
}>) {
  return (
    <div
      className={className}
      style={{
        transform: `translate3d(${offset.x * factor}px, ${offset.y * factor}px, 0)`,
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  )
}

export function GuestAmbient() {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const [pointer, setPointer] = useState({ x: 50, y: 40 })
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = globalThis.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)

    function onMove(e: MouseEvent) {
      if (mq.matches) return
      const nx = e.clientX / globalThis.innerWidth
      const ny = e.clientY / globalThis.innerHeight
      setOffset({
        x: (nx - 0.5) * 42,
        y: (ny - 0.5) * 42,
      })
      setPointer({ x: nx * 100, y: ny * 100 })
    }

    globalThis.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      mq.removeEventListener('change', onChange)
      globalThis.removeEventListener('mousemove', onMove)
    }
  }, [])

  const parallax = reducedMotion ? { x: 0, y: 0 } : offset

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#f4f5f7]" aria-hidden>
      {/* Soft grid under waves */}
      <ParallaxWrap
        offset={parallax}
        factor={0.15}
        className="guest-grid absolute inset-[-14%] opacity-30"
      />

      {/* Cursor spotlight */}
      <div
        className="guest-spotlight pointer-events-none absolute inset-0"
        style={
          {
            '--spot-x': `${pointer.x}%`,
            '--spot-y': `${pointer.y}%`,
          } as React.CSSProperties
        }
      />

      {/* Flowing SVG ribbons */}
      <ParallaxWrap
        offset={parallax}
        factor={0.35}
        className="pointer-events-none absolute inset-0"
      >
        <svg
          className="guest-wave-layer absolute inset-0 h-full w-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <path
            className="guest-wave guest-wave-a"
            d="M-80 220 C 180 120, 360 340, 560 250 S 920 90, 1180 210 S 1480 360, 1600 280"
            stroke="rgba(15,23,42,0.10)"
            strokeWidth="1.4"
          />
          <path
            className="guest-wave guest-wave-b"
            d="M-60 420 C 220 510, 420 280, 640 390 S 980 560, 1220 430 S 1500 300, 1620 380"
            stroke="rgba(15,23,42,0.08)"
            strokeWidth="1.2"
          />
          <path
            className="guest-wave guest-wave-c"
            d="M-40 640 C 240 560, 460 760, 700 650 S 1040 520, 1280 640 S 1520 780, 1640 700"
            stroke="rgba(15,23,42,0.07)"
            strokeWidth="1.25"
          />
          <path
            className="guest-wave guest-wave-d"
            d="M-100 160 C 140 260, 380 40, 620 150 S 980 280, 1240 140 S 1500 40, 1680 120"
            stroke="rgba(100,116,139,0.12)"
            strokeWidth="1"
            strokeDasharray="6 10"
          />
        </svg>
      </ParallaxWrap>

      {/* Organic blobs */}
      <ParallaxWrap offset={parallax} factor={0.65} className="absolute -left-32 top-[6%]">
        <div className="guest-blob guest-blob-a h-96 w-96 bg-linear-to-br from-slate-300/65 via-slate-200/35 to-transparent blur-3xl" />
      </ParallaxWrap>
      <ParallaxWrap offset={parallax} factor={-0.5} className="absolute right-[-12%] top-[14%]">
        <div className="guest-blob guest-blob-b h-[30rem] w-[30rem] bg-linear-to-tr from-violet-200/30 via-slate-200/40 to-transparent blur-3xl" />
      </ParallaxWrap>
      <ParallaxWrap offset={parallax} factor={0.4} className="absolute bottom-[-16%] left-[22%]">
        <div className="guest-blob guest-blob-c h-[26rem] w-[26rem] bg-linear-to-t from-sky-100/40 via-slate-200/30 to-transparent blur-3xl" />
      </ParallaxWrap>

      {/* Soft nodes drifting on curves */}
      <ParallaxWrap offset={parallax} factor={1} className="absolute left-[18%] top-[24%]">
        <div className="guest-drift guest-drift-a h-2.5 w-2.5 rounded-full bg-foreground/20 shadow-[0_0_16px_rgba(15,23,42,0.16)]" />
      </ParallaxWrap>
      <ParallaxWrap offset={parallax} factor={-0.85} className="absolute right-[22%] top-[20%]">
        <div className="guest-drift guest-drift-b h-2 w-2 rounded-full bg-foreground/22 shadow-[0_0_14px_rgba(15,23,42,0.14)]" />
      </ParallaxWrap>
      <ParallaxWrap offset={parallax} factor={0.7} className="absolute left-[48%] bottom-[28%]">
        <div className="guest-drift guest-drift-c h-3 w-3 rounded-full bg-foreground/14 shadow-[0_0_18px_rgba(15,23,42,0.12)]" />
      </ParallaxWrap>

      {/* Small swoosh accents */}
      <ParallaxWrap offset={parallax} factor={0.55} className="absolute left-[8%] top-[52%]">
        <svg className="guest-swoosh guest-swoosh-a h-16 w-28" viewBox="0 0 120 70" fill="none">
          <path
            d="M8 42 C 28 18, 52 58, 72 34 S 108 12, 116 28"
            stroke="rgba(15,23,42,0.14)"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </ParallaxWrap>
      <ParallaxWrap offset={parallax} factor={-0.45} className="absolute right-[8%] bottom-[20%]">
        <svg className="guest-swoosh guest-swoosh-b h-20 w-36" viewBox="0 0 140 80" fill="none">
          <path
            d="M6 50 C 34 18, 58 70, 86 40 S 126 18, 136 36"
            stroke="rgba(15,23,42,0.12)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </ParallaxWrap>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#f4f5f7_78%)]" />
    </div>
  )
}
