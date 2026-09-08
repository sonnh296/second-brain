/** Guest background image only — sits behind the page content. */
export function GuestAmbient() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/guest-aurora.png"
        alt=""
        className="h-full w-full object-cover"
        decoding="async"
      />
    </div>
  )
}
