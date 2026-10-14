/** Shared formatting utilities */

/** Currency — 0 decimal places (most common: display, tables) */
export const formatEUR = (v: number): string =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** Currency — 2 decimal places (payroll details, exact values) */
export const formatEURExact = (v: number): string =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Currency — nullable, returns '—' for null/undefined */
export const formatEUROrDash = (v: number | null | undefined): string =>
  v != null ? formatEUR(v) : '—'

/**
 * Hours — "8h" or "8,5h" (no trailing zero).
 *
 * Arredonda antes de formatar: somar decimais em vírgula flutuante produz
 * 677.3000000000001, e esse número chegou a aparecer num aviso ao utilizador.
 */
export const formatHours = (h: number): string => {
  const r = Math.round(h * 100) / 100
  return r % 1 === 0 ? `${r}h` : `${r.toFixed(1).replace('.', ',')}h`
}
