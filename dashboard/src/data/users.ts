export type RegisteredUser = {
  name: string
  email: string
  subscription: 'trialing' | 'active' | 'inactive'
  seats: number
  role: 'admin' | 'member'
  billingPlan: 'comped' | 'standard'
}

export const registeredUsers: RegisteredUser[] = [
  {
    name: 'Ash Ketchum',
    email: 'ash@pokestats.app',
    subscription: 'active',
    seats: 1,
    role: 'admin',
    billingPlan: 'comped'
  }
]
