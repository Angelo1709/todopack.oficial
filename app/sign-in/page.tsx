import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { safeRedirectPath } from "@/lib/redirect-path"
import { AuthForm } from "@/components/auth-form"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const next = safeRedirectPath((await searchParams).next)
  const user = await getSessionUser()
  if (user) redirect(next)
  return <AuthForm mode="sign-in" next={next} />
}
