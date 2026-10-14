const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const eur3 = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 3, maximumFractionDigits: 4 });
const num = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("pt-PT", { style: "percent", maximumFractionDigits: 1 });

export const euros = (n: number) => eur.format(Number.isFinite(n) ? n : 0);
export const eurosFino = (n: number) => eur3.format(Number.isFinite(n) ? n : 0);
export const numero = (n: number) => num.format(Number.isFinite(n) ? n : 0);
export const percent = (n: number) => pct.format(Number.isFinite(n) ? n : 0);

export function horasMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function dataPt(iso: string): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
