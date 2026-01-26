import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom'
import { z } from 'zod'
import { Loader2, LockKeyhole } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useAuth } from '../providers/auth'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})

export function LoginPage(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [authError, setAuthError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema)
  })

  const onSubmit = async (data: z.infer<typeof loginSchema>): Promise<void> => {
    setAuthError(null)
    try {
      await login(data.email, data.password)
      const fallbackPath = '/sets'
      const redirectPath = (location.state as { from?: Location })?.from?.pathname ?? fallbackPath
      navigate(redirectPath, { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to log in'
      setAuthError(message)
      setError('password', { message })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-amber-50 px-4 py-12 text-slate-900">
      <div className="w-full max-w-md">
        <Card className="border-2 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
          <CardHeader className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Pokestats Market Lab</p>
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border-2 border-slate-900 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[3px_3px_0px_#0f172a]">
              <LockKeyhole className="h-4 w-4" />
              Login required
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-black text-slate-900">Welcome back</CardTitle>
              <CardDescription className="text-sm text-slate-600">
                Access the dashboard and pick up where you left off.
              </CardDescription>
            </div>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="border-2 border-slate-900 shadow-[3px_3px_0px_#0f172a]"
                  {...register('email')}
                />
                {errors.email ? <p className="text-xs text-rose-600">{errors.email.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="border-2 border-slate-900 shadow-[3px_3px_0px_#0f172a]"
                  {...register('password')}
                />
                {errors.password ? <p className="text-xs text-rose-600">{errors.password.message}</p> : null}
              </div>
              {authError ? <p className="text-xs font-semibold text-rose-600">{authError}</p> : null}
              <p className="text-xs text-slate-500">
                Credentials are validated against configured access rules. Contact an administrator if you need access.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full border-2 border-slate-900 bg-amber-200 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[4px_4px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Log in
              </Button>
              <p className="text-sm text-slate-600">
                Need an account?{' '}
                <Link to="/signup" className="font-semibold text-slate-900 underline decoration-2 decoration-sky-300">
                  Sign up
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
