/**
 * A turn the provider stopped on quota before it landed anything. The pool is
 * the cause, not the turn: reported apart from waste, never counted in it.
 */
export interface QuotaStop {
  record: string;
  role: string;
  alias: string;
  slug?: string;
  step: string;
  round: number;
  detail: string;
}
