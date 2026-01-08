import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle, Info } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { useAuth } from '../providers/auth'

const settingsSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  subscriptionStatus: z.union([z.literal('active'), z.literal('inactive'), z.literal('trialing')])
})

const passwordSchema = z
  .object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  })

export function SettingsPage(): JSX.Element {
  const { user, updateSubscription } = useAuth()
  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      subscriptionStatus: user?.subscriptionStatus ?? 'inactive'
    }
  })
  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  })

  const onSubmit = (data: z.infer<typeof settingsSchema>): void => {
    updateSubscription(data.subscriptionStatus)
    form.reset(data)
  }

  const onPasswordSubmit = (_data: z.infer<typeof passwordSchema>): void => {
    passwordForm.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settings</p>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Profile</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Update mock user info and preview subscription toggles.</p>
      </div>
        <Badge
          variant={
            user?.subscriptionStatus === 'active'
              ? 'success'
              : user?.subscriptionStatus === 'trialing'
                ? 'secondary'
                : 'warning'
          }
        >
          {user?.subscriptionStatus ?? 'inactive'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Values are stored locally. Replace with a real auth provider later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...form.register('name')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register('email')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subscriptionStatus">Subscription</Label>
              <Controller
                control={form.control}
                name="subscriptionStatus"
                render={({ field }) => (
                  <Select value={field.value} onChange={(event) => field.onChange(event.target.value)}>
                    <option value="active">Active (demo)</option>
                    <option value="trialing">Trial (14 days)</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                )}
              />
              <p className="text-xs text-slate-400">Use this to simulate Stripe webhook state changes or trial periods.</p>
            </div>

            <Button type="submit">Save settings</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Use a strong password with at least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input id="currentPassword" type="password" {...passwordForm.register('currentPassword')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input id="newPassword" type="password" {...passwordForm.register('newPassword')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" type="password" {...passwordForm.register('confirmPassword')} />
            </div>
            <Button type="submit" variant="secondary">Update password</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-300" />
            Security reminders
          </CardTitle>
          <CardDescription>When ready, replace this mock layer with production auth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-sky-300" />
            <p>Stripe subscription verification should happen server-side using signed webhooks.</p>
          </div>
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-sky-300" />
            <p>Replace localStorage auth with JWT/OAuth and guard the Express routes.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
