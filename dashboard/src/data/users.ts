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
  },
  {
    name: 'Misty K.',
    email: 'misty@cerulean.io',
    subscription: 'active',
    seats: 8,
    role: 'admin',
    billingPlan: 'standard'
  },
  {
    name: 'Brock S.',
    email: 'brock@pewterlabs.com',
    subscription: 'active',
    seats: 5,
    role: 'member',
    billingPlan: 'standard'
  },
  {
    name: 'Erika T.',
    email: 'erika@celadon.green',
    subscription: 'trialing',
    seats: 3,
    role: 'member',
    billingPlan: 'standard'
  },
  {
    name: 'Lt. Surge',
    email: 'surge@vermilion.energy',
    subscription: 'inactive',
    seats: 2,
    role: 'member',
    billingPlan: 'standard'
  },
  {
    name: 'Sabrina P.',
    email: 'sabrina@saffron.ai',
    subscription: 'active',
    seats: 6,
    role: 'admin',
    billingPlan: 'standard'
  }
  { name: 'Ash Ketchum', email: 'ash@pokestats.app', subscription: 'active', seats: 1, role: 'admin', billingPlan: 'comped' },
  { name: 'Misty K.', email: 'misty@cerulean.io', subscription: 'active', seats: 8, role: 'admin', billingPlan: 'standard' },
  { name: 'Brock S.', email: 'brock@pewterlabs.com', subscription: 'active', seats: 5, role: 'member', billingPlan: 'standard' },
  { name: 'Erika T.', email: 'erika@celadon.green', subscription: 'trialing', seats: 3, role: 'member', billingPlan: 'standard' },
  { name: 'Lt. Surge', email: 'surge@vermilion.energy', subscription: 'inactive', seats: 2, role: 'member', billingPlan: 'standard' },
  { name: 'Sabrina P.', email: 'sabrina@saffron.ai', subscription: 'active', seats: 6, role: 'admin', billingPlan: 'standard' }
}

export const registeredUsers: RegisteredUser[] = [
  { name: 'Misty K.', email: 'misty@cerulean.io', subscription: 'active', seats: 8, role: 'admin' },
  { name: 'Brock S.', email: 'brock@pewterlabs.com', subscription: 'active', seats: 5, role: 'member' },
  { name: 'Erika T.', email: 'erika@celadon.green', subscription: 'trialing', seats: 3, role: 'member' },
  { name: 'Lt. Surge', email: 'surge@vermilion.energy', subscription: 'inactive', seats: 2, role: 'member' },
  { name: 'Sabrina P.', email: 'sabrina@saffron.ai', subscription: 'active', seats: 6, role: 'admin' }
]
