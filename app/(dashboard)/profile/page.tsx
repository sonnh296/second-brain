import { redirect } from 'next/navigation'

/** Legacy /profile → Settings account tab */
export default function ProfileRedirectPage() {
  redirect('/settings?tab=account')
}
