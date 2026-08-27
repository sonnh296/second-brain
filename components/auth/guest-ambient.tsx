/** Static guest background — animations temporarily disabled (login jitter). */
export function GuestAmbient() {
  return (
    <div
      className="fixed inset-0 -z-10 bg-[#e6e9ef]"
      aria-hidden
    />
  )
}
