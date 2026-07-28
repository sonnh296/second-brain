import { GuestMoon } from "@/components/auth/guest-moon";

export function GuestAmbient() {
  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden bg-[#e6e9ef]"
      aria-hidden
    >
      {/* Distant moons — behind waves */}
      <div className="pointer-events-none absolute inset-0">
        <GuestMoon
          variant="crescent"
          className="guest-moon guest-moon-a absolute left-[6%] top-[8%] h-14 w-14 text-slate-400/25 blur-[0.5px]"
        />
        <GuestMoon
          variant="full"
          className="guest-moon guest-moon-b absolute right-[10%] top-[6%] h-20 w-20 text-slate-500/20 blur-[1px]"
        />
        <GuestMoon
          variant="gibbous"
          className="guest-moon guest-moon-c absolute left-[38%] top-[4%] h-10 w-10 text-slate-400/18 blur-[0.5px]"
        />
        <GuestMoon
          variant="full"
          className="guest-moon guest-moon-d absolute right-[28%] top-[18%] h-8 w-8 text-slate-400/14 blur-[0.5px]"
        />
        <GuestMoon
          variant="crescent"
          className="guest-moon guest-moon-e absolute left-[72%] top-[22%] h-11 w-11 text-violet-300/20 blur-[1px] scale-x-[-1]"
        />
        <GuestMoon
          variant="full"
          className="guest-moon guest-moon-f absolute left-[14%] top-[32%] h-6 w-6 text-slate-400/12 blur-[0.5px]"
        />
      </div>

      <div className="guest-grid absolute inset-[-14%] opacity-45" />

      <div className="pointer-events-none absolute inset-0">
        <svg
          className="guest-wave-layer absolute inset-0 h-full w-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <linearGradient id="guest-fill-a" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(100,116,139,0.28)" />
              <stop offset="50%" stopColor="rgba(100,116,139,0.16)" />
              <stop offset="100%" stopColor="rgba(100,116,139,0.24)" />
            </linearGradient>
            <linearGradient id="guest-fill-b" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(139,92,246,0.18)" />
              <stop offset="100%" stopColor="rgba(100,116,139,0.14)" />
            </linearGradient>
          </defs>

          <path
            className="guest-wave-fill guest-wave-fill-a"
            fill="url(#guest-fill-a)"
            d="M-120 520 C 80 380, 220 620, 420 480 C 620 340, 780 580, 980 440 C 1180 300, 1320 520, 1560 400 L 1560 920 L -120 920 Z"
          />
          <path
            className="guest-wave-fill guest-wave-fill-b"
            fill="url(#guest-fill-b)"
            d="M-80 680 C 160 560, 340 760, 560 620 C 780 480, 960 720, 1180 580 C 1340 470, 1480 640, 1640 540 L 1640 920 L -80 920 Z"
          />

          <path
            className="guest-wave guest-wave-a"
            d="M-100 180 C 60 40, 180 320, 340 140 C 500 -20, 640 280, 820 120 C 1000 -30, 1160 260, 1340 100 C 1480 -10, 1580 180, 1680 140"
            stroke="rgba(15,23,42,0.22)"
            strokeWidth="1.6"
          />
          <path
            className="guest-wave guest-wave-b"
            d="M-80 380 C 120 520, 280 240, 460 420 C 640 600, 800 280, 1000 460 C 1180 640, 1340 320, 1520 500 C 1620 580, 1680 420, 1720 480"
            stroke="rgba(15,23,42,0.18)"
            strokeWidth="1.45"
          />
          <path
            className="guest-wave guest-wave-c"
            d="M-60 560 C 100 420, 260 700, 440 540 C 620 380, 780 680, 980 520 C 1160 360, 1300 640, 1480 480 C 1580 400, 1660 580, 1740 520"
            stroke="rgba(15,23,42,0.16)"
            strokeWidth="1.4"
          />
          <path
            className="guest-wave guest-wave-d"
            d="M-120 260 C 40 400, 200 120, 380 300 C 560 480, 720 160, 920 340 C 1100 500, 1260 200, 1440 380 C 1540 460, 1620 280, 1700 340"
            stroke="rgba(71,85,105,0.28)"
            strokeWidth="1.2"
            strokeDasharray="5 9"
          />
          <path
            className="guest-wave guest-wave-e"
            d="M-40 720 C 180 600, 320 820, 520 680 C 720 540, 880 800, 1080 660 C 1260 530, 1400 760, 1580 620"
            stroke="rgba(15,23,42,0.14)"
            strokeWidth="1.3"
          />
        </svg>
      </div>

      <div className="absolute -left-32 top-[6%]">
        <div className="guest-blob guest-blob-a h-96 w-96 bg-linear-to-br from-slate-400/55 via-slate-300/45 to-transparent blur-3xl" />
      </div>
      <div className="absolute right-[-12%] top-[14%]">
        <div className="guest-blob guest-blob-b h-[30rem] w-[30rem] bg-linear-to-tr from-violet-300/45 via-slate-300/50 to-transparent blur-3xl" />
      </div>
      <div className="absolute bottom-[-16%] left-[22%]">
        <div className="guest-blob guest-blob-c h-[26rem] w-[26rem] bg-linear-to-t from-sky-200/50 via-slate-300/40 to-transparent blur-3xl" />
      </div>

      <div className="absolute left-[18%] top-[24%]">
        <div className="guest-drift guest-drift-a h-2.5 w-2.5 rounded-full bg-foreground/32 shadow-[0_0_16px_rgba(15,23,42,0.24)]" />
      </div>
      <div className="absolute right-[22%] top-[20%]">
        <div className="guest-drift guest-drift-b h-2 w-2 rounded-full bg-foreground/34 shadow-[0_0_14px_rgba(15,23,42,0.22)]" />
      </div>
      <div className="absolute left-[48%] bottom-[28%]">
        <div className="guest-drift guest-drift-c h-3 w-3 rounded-full bg-foreground/26 shadow-[0_0_18px_rgba(15,23,42,0.20)]" />
      </div>

      <div className="absolute left-[8%] top-[52%]">
        <svg
          className="guest-swoosh guest-swoosh-a h-16 w-28"
          viewBox="0 0 120 70"
          fill="none"
        >
          <path
            d="M4 38 C 22 8, 48 62, 68 28 C 88 -4, 108 48, 128 22 C 142 4, 152 18, 162 30"
            stroke="rgba(15,23,42,0.26)"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="absolute right-[8%] bottom-[20%]">
        <svg
          className="guest-swoosh guest-swoosh-b h-20 w-36"
          viewBox="0 0 140 80"
          fill="none"
        >
          <path
            d="M4 48 C 30 12, 54 72, 82 38 C 108 6, 128 58, 152 30 C 168 12, 178 26, 188 40"
            stroke="rgba(15,23,42,0.22)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#e6e9ef_72%)]" />
    </div>
  );
}
