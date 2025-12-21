export type FormatNumberOptions = Intl.NumberFormatOptions;

export const formatNumber = (
  value: number | bigint | null | undefined,
  options?: FormatNumberOptions
): string => {
  if (value === null || value === undefined) {
    return "—";
  }

  const numericValue = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return new Intl.NumberFormat(undefined, options).format(numericValue);
};
