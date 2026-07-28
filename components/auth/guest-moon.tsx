/** Ethereal distant moons for the guest/login background. */

type MoonProps = {
  readonly className?: string;
  readonly variant?: "full" | "crescent" | "gibbous";
};

export function GuestMoon({ className, variant = "full" }: MoonProps) {
  if (variant === "crescent") {
    return (
      <svg
        className={className}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden
      >
        <path
          d="M44 8a28 28 0 1 0 0 48 22 22 0 0 1 0-48z"
          fill="currentColor"
          opacity="0.9"
        />
        <circle cx="38" cy="22" r="2" fill="currentColor" opacity="0.25" />
        <circle cx="34" cy="34" r="1.5" fill="currentColor" opacity="0.2" />
      </svg>
    );
  }

  if (variant === "gibbous") {
    return (
      <svg
        className={className}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden
      >
        <circle cx="32" cy="32" r="26" fill="currentColor" opacity="0.85" />
        <ellipse cx="22" cy="32" rx="10" ry="22" fill="#e6e9ef" opacity="0.55" />
        <circle cx="40" cy="24" r="2.5" fill="currentColor" opacity="0.15" />
        <circle cx="44" cy="38" r="1.8" fill="currentColor" opacity="0.12" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
    >
      <circle cx="32" cy="32" r="26" fill="currentColor" opacity="0.88" />
      <circle cx="24" cy="26" r="3" fill="currentColor" opacity="0.12" />
      <circle cx="38" cy="30" r="2" fill="currentColor" opacity="0.1" />
      <circle cx="30" cy="40" r="2.5" fill="currentColor" opacity="0.11" />
      <circle cx="42" cy="42" r="1.5" fill="currentColor" opacity="0.09" />
    </svg>
  );
}
