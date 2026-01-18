import { zodResolver } from '@hookform/resolvers/zod'
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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'ash@pokestats.app',
      password: 'password'
    }
  })

  const onSubmit = async (data: z.infer<typeof loginSchema>): Promise<void> => {
    await login(data.email, data.password)
    const fallbackPath = data.email.toLowerCase() === 'ash@pokestats.app' ? '/app' : '/dashboard'
    const redirectPath = (location.state as { from?: Location })?.from?.pathname ?? fallbackPath
    navigate(redirectPath, { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:bg-slate-800/60 dark:text-sky-200">
              <LockKeyhole className="h-4 w-4" />
              Login required
            </div>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Access the dashboard and pick up where you left off.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
                {errors.email ? <p className="text-xs text-rose-400">{errors.email.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
                {errors.password ? <p className="text-xs text-rose-400">{errors.password.message}</p> : null}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Demo auth stores a session locally. Replace with OAuth/Clerk later.</p>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Log in
              </Button>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Need an account?{' '}
                <Link to="/signup" className="font-semibold text-sky-700 dark:text-sky-300">
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
