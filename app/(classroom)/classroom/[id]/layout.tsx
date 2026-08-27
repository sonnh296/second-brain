import { ClassroomWorkspace } from '@/components/classroom/classroom-workspace'

export default async function ClassroomIdLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ClassroomWorkspace classId={id}>{children}</ClassroomWorkspace>
}
