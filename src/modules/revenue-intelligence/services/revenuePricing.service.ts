export type PricingOperation = "INCREASE" | "DECREASE" | "SET";
export type PricingAdjustmentType = "PERCENT" | "FIXED";

export type PricingRuleLike = {
  pricingOperation?: PricingOperation | null;
  pricingAdjustmentType?: PricingAdjustmentType | null;
  pricingAdjustmentValue?: number | null;
};

export function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

export function applyPricingRule(
  basePrice: number | null | undefined,
  rule: PricingRuleLike | null | undefined
): number | null {
  if (basePrice == null) return null;

  if (
    !rule ||
    !rule.pricingOperation ||
    !rule.pricingAdjustmentType ||
    rule.pricingAdjustmentValue == null
  ) {
    return roundPrice(basePrice);
  }

  const base = Number(basePrice);
  const value = Number(rule.pricingAdjustmentValue);

  if (Number.isNaN(base) || Number.isNaN(value)) {
    return roundPrice(basePrice);
  }

  if (rule.pricingOperation === "SET") {
    if (rule.pricingAdjustmentType !== "FIXED") {
      return roundPrice(base);
    }
    return roundPrice(value);
  }

  if (rule.pricingAdjustmentType === "PERCENT") {
    const delta = (base * value) / 100;
    return roundPrice(rule.pricingOperation === "INCREASE" ? base + delta : base - delta);
  }

  if (rule.pricingAdjustmentType === "FIXED") {
    return roundPrice(rule.pricingOperation === "INCREASE" ? base + value : base - value);
  }

  return roundPrice(base);
}