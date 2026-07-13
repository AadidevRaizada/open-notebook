import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { isClerkEnabled } from '@/lib/auth/clerk'

export default function LoginPage() {
  // In Clerk mode the password form is retired; Clerk owns the sign-in flow.
  if (isClerkEnabled) {
    redirect('/sign-in')
  }

  return (
    <ErrorBoundary>
      <LoginForm />
    </ErrorBoundary>
  )
}
