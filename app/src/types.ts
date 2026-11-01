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
  district: string;
  type: string; // Purchase | Sale | Sale (partial) | Exchange
  owner: string;
  asset_type: string;
  amount_low: number;
  amount_high: number | null;
  lag_days?: number;
}

export type Signal = InsiderSignal | CongressSignal;

export interface Feed {
  generated: string;
  demo: boolean;
  insiders: InsiderSignal[];
  congress: CongressSignal[];
  review: { member: string; url: string }[];
}
