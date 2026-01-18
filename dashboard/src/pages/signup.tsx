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
    <div className="flex min-h-screen items-center justify-center bg-amber-50 px-4 py-12 text-slate-900">
      <div className="w-full max-w-md">
        <Card className="border-2 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
          <CardHeader className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Pokestats Market Lab</p>
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border-2 border-slate-900 bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[3px_3px_0px_#0f172a]">
              <UserPlus className="h-4 w-4" />
              Create account
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-black text-slate-900">Start your trial</CardTitle>
              <CardDescription className="text-sm text-slate-600">
                Spin up a mock account, add card details, and unlock a 14-day trial.
              </CardDescription>
            </div>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Name
                </Label>
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="Ash Ketchum"
                  className="border-2 border-slate-900 shadow-[3px_3px_0px_#0f172a]"
                  {...register('name')}
                />
                {errors.name ? <p className="text-xs text-rose-600">{errors.name.message}</p> : null}
              </div>
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
                  autoComplete="new-password"
                  className="border-2 border-slate-900 shadow-[3px_3px_0px_#0f172a]"
                  {...register('password')}
                />
                {errors.password ? <p className="text-xs text-rose-600">{errors.password.message}</p> : null}
              </div>
              <p className="text-xs text-slate-500">This is mock auth. Replace with a real identity provider later.</p>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full border-2 border-slate-900 bg-emerald-200 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[4px_4px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create account
              </Button>
              <p className="text-sm text-slate-600">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-slate-900 underline decoration-2 decoration-emerald-300">
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
