// Mirrors the signals.json the Python backend writes.

interface BaseSignal {
  ticker: string;
  who: string;
  headline: string;
  score: number;
  reasons: string[];
  trade_date: string | null;
  disclosed: string;
  url: string;
  // Price move since the trade/award (absent when no price was found)
  price_then?: number;
  price_now?: number;
  price_date?: string;
  change_pct?: number;
}

export interface ContractSignal extends BaseSignal {
  kind: "contract";
  company: string;
  value: number;
  agency: string;
  sub_agency: string;
  description: string;
  source: string; // "DoD announcement" | "USAspending"
  award_id?: string | null;
  congress_before?: number;
  market_cap?: number;
  award_pct?: number; // award as % of company market value
}

export interface InsiderSignal extends BaseSignal {
  kind: "insider";
  company: string;
  role_label?: string;
  shares: number;
  avg_price: number | null;
  value: number;
  shares_before: number | null;
  shares_after: number | null;
  is_10b5_1: boolean;
}

export interface CongressSignal extends BaseSignal {
  kind: "congress";
  chamber?: "House" | "Senate";
  district: string;
  type: string; // Purchase | Sale | Sale (partial) | Exchange
  owner: string;
  asset_type: string;
  amount_low: number;
  amount_high: number | null;
  lag_days?: number;
}

export type Signal = ContractSignal | InsiderSignal | CongressSignal;

export interface Feed {
  generated: string;
  demo: boolean;
  contracts?: ContractSignal[];
  insiders: InsiderSignal[];
  congress: CongressSignal[];
  review: { member: string; url: string }[];
}
