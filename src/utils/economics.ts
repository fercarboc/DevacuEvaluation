export type Money = number;

export function toPositiveMoney(v: any): Money {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n);
}

export function clampNonNeg(v: any): Money {
  const n = toPositiveMoney(v);
  return n < 0 ? 0 : n;
}

export function normalizeEconomics(input: {
  economic_impact_gross?: number | null;
  economic_recovered?: number | null;
}) {
  const gross = input.economic_impact_gross == null ? null : clampNonNeg(input.economic_impact_gross);
  const recovered = input.economic_recovered == null ? null : clampNonNeg(input.economic_recovered);

  const net =
    gross == null && recovered == null
      ? null
      : Math.max((gross ?? 0) - (recovered ?? 0), 0);

  return {
    economic_impact_gross: gross,
    economic_recovered: recovered,
    economic_net_loss: net,
  };
}
