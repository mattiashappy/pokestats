export type RegisteredUser = {
  name: string
  email: string
  subscriptionStatus: 'trialing' | 'active' | 'inactive'
  billingPlan: 'monthly' | 'annual' | 'none'
  trialEndsAt?: string
  lastPaymentAt?: string
  collection: {
    name: string
    totalCards: number
    uniqueCards: number
    estimatedValue: number
    lastUpdated: string
  }
}

// Admin login is stored in config vars; this list represents registered customer accounts only.
export const registeredUsers: RegisteredUser[] = [
  {
    name: 'Misty Williams',
    email: 'misty@cerulean.io',
    subscriptionStatus: 'active',
    billingPlan: 'monthly',
    lastPaymentAt: '2024-08-12T09:00:00.000Z',
    collection: {
      name: 'Cerulean Vault',
      totalCards: 382,
      uniqueCards: 241,
      estimatedValue: 1840,
      lastUpdated: '2024-08-15T15:30:00.000Z'
    }
  },
  {
    name: 'Brock Sanders',
    email: 'brock@pewterlabs.com',
    subscriptionStatus: 'active',
    billingPlan: 'annual',
    lastPaymentAt: '2024-08-01T12:00:00.000Z',
    collection: {
      name: 'Pewter Archive',
      totalCards: 925,
      uniqueCards: 610,
      estimatedValue: 4625,
      lastUpdated: '2024-08-13T18:15:00.000Z'
    }
  },
  {
    name: 'Erika Tanaka',
    email: 'erika@celadon.green',
    subscriptionStatus: 'trialing',
    billingPlan: 'monthly',
    trialEndsAt: '2024-08-27T08:00:00.000Z',
    collection: {
      name: 'Celadon Collection',
      totalCards: 146,
      uniqueCards: 98,
      estimatedValue: 640,
      lastUpdated: '2024-08-15T10:45:00.000Z'
    }
  },
  {
    name: 'Lt. Surge',
    email: 'surge@vermilion.energy',
    subscriptionStatus: 'inactive',
    billingPlan: 'none',
    collection: {
      name: 'Vermilion Binder',
      totalCards: 32,
      uniqueCards: 26,
      estimatedValue: 120,
      lastUpdated: '2024-08-05T17:10:00.000Z'
    }
  },
  {
    name: 'Sabrina Park',
    email: 'sabrina@saffron.ai',
    subscriptionStatus: 'trialing',
    billingPlan: 'monthly',
    trialEndsAt: '2024-08-24T08:00:00.000Z',
    collection: {
      name: 'Saffron Stash',
      totalCards: 214,
      uniqueCards: 171,
      estimatedValue: 980,
      lastUpdated: '2024-08-14T21:40:00.000Z'
    }
  }
]
