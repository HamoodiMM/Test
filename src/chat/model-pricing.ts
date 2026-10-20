// Paid-tier prices in USD per 1 million tokens (Google AI pricing page, October 2026).
// Output prices include thinking tokens. A fallback model can be cheaper or more expensive
// than the main one, so the cost of each reply is calculated with the model that wrote it.
export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

const KNOWN_PRICES: Record<string, ModelPrice> = {
  'gemini-3.5-flash-lite': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  'gemini-3-flash-preview': { inputPerMillion: 0.5, outputPerMillion: 3.0 },
  'gemini-3.6-flash': { inputPerMillion: 0.75, outputPerMillion: 3.75 }, // doubles on 2027-01-01
  'gemini-3.8-flash': { inputPerMillion: 0.75, outputPerMillion: 3.75 }, // doubles on 2027-01-01
};

// Models not in the table use the prices from .env (GEMINI_*_PRICE_PER_MILLION)
export function priceFor(model: string, fallback: ModelPrice): ModelPrice {
  return KNOWN_PRICES[model] ?? fallback;
}
