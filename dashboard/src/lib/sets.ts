import type { CardResponse, ExpansionSummary } from '../types'

export function getExpansionIdentifier(expansion: ExpansionSummary): string {
  return expansion.pt_set_id ?? expansion.set_code ?? String(expansion.id)
}

export function getCardSetIdentifier(card: Pick<CardResponse, 'pt_set_id' | 'set_code'>): string | null {
  return card.pt_set_id ?? card.set_code ?? null
}
