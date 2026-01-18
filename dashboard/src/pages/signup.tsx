import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Loader2, UserPlus } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useAuth } from '../providers/auth'

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})

export function SignupPage(): JSX.Element {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: 'Ash Ketchum',
      email: 'ash@pokestats.app',
      password: 'password'
    }
  })

  const onSubmit = async (data: z.infer<typeof signupSchema>): Promise<void> => {
    await signup(data.name, data.email, data.password)
    const path = data.email.toLowerCase() === 'ash@pokestats.app' ? '/app' : '/dashboard'
    navigate(path, { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:bg-slate-800/60 dark:text-emerald-200">
              <UserPlus className="h-4 w-4" />
              Create account
            </div>
            <CardTitle className="text-2xl">Start your trial</CardTitle>
            <CardDescription>Spin up a mock account, add card details, and unlock a 14-day trial.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" autoComplete="name" placeholder="Ash Ketchum" {...register('name')} />
                {errors.name ? <p className="text-xs text-rose-400">{errors.name.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
                {errors.email ? <p className="text-xs text-rose-400">{errors.email.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
                {errors.password ? <p className="text-xs text-rose-400">{errors.password.message}</p> : null}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">This is mock auth. Replace with a real identity provider later.</p>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create account
              </Button>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-sky-700 dark:text-sky-300">
                  Log in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
