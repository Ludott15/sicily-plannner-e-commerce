// Regola della nota sulle alternative: voti contrari almeno pari alla metà dei membri attuali del
// gruppo (i voti di chi è uscito non contano). Pura: usata dal componente e dallo scoring di gruppo.
export function shouldSuggestAlternatives(against: number, members: number): boolean {
  return members > 0 && against * 2 >= members;
}
