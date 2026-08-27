import { redirect } from 'next/navigation'

/** Backward-compatible alias — home is the service picker. */
export default function HubRedirect() {
  redirect('/home')
}
