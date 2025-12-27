export type RegisteredUser = {
  name: string
  email: string
  subscription: 'trialing' | 'active' | 'inactive'
  seats: number
  role: 'admin' | 'member'
  billingPlan: 'comped' | 'standard'
}

// Seed with only the comped admin account for now; real users will be added later.
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
