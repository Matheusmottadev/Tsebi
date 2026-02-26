type PriceProps = {
  amountCents: number;
  currency?: string;
  locale?: string;
  className?: string;
};

export function Price({ amountCents, currency = "brl", locale = "pt-BR", className }: PriceProps) {
  const safeAmount = Math.max(0, Number(amountCents || 0));
  const value = safeAmount / 100;
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: String(currency || "BRL").toUpperCase(),
  }).format(value);

  return <span className={className}>{formatted}</span>;
}
