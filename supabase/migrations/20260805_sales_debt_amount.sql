-- Migration: partial payment ("debt") tracking for regular product sales
-- 2026-08-05
--
-- Adds partial-payment tracking to `sales` for regular product sales sold
-- without a full payment (client takes the item, owes the rest). Workshop
-- keeps its own separate prepayment mechanism on `service_orders` — this
-- migration does not touch it.
--
-- Additive only. Does NOT touch sales.status or its existing values
-- ('pending' | 'paid' | 'cancelled' | 'refunded' | 'partially_refunded') —
-- a sale stays status='paid' even with debt_amount > 0: the amount actually
-- collected at sale time (paid_cash/paid_kaspi/...) was partial, the rest
-- is tracked here instead of overloading `status`.
--
-- debt_amount         — original amount still owed at sale time (0 = no
--                        debt). Never mutated after creation — mirrors
--                        service_orders.original_prepayment, so reporting
--                        stays correct even after the debt is settled.
-- debt_paid_at         — timestamp the debt was settled (NULL = still
--                        owed). Same role as service_orders.remaining_paid_at
--                        — cash-session/report queries filter by this to
--                        attribute the settlement to the day it actually
--                        happened, not the original sale's day.
-- debt_payment_method  — how the debt was settled: 'cash' or 'kaspi'.
--                        Mirrors service_orders.remaining_payment_method —
--                        deliberately the same 2-option manual-entry choice,
--                        not the full 5-way sales.payment_method.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS debt_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debt_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS debt_payment_method text
    CHECK (debt_payment_method IS NULL OR debt_payment_method IN ('cash', 'kaspi'));

COMMENT ON COLUMN public.sales.debt_amount IS 'Original amount owed at sale time for partial-payment sales; 0 = no debt. Not mutated after creation.';
COMMENT ON COLUMN public.sales.debt_paid_at IS 'When the debt was settled; NULL while still owed.';
COMMENT ON COLUMN public.sales.debt_payment_method IS 'How the debt was settled: cash or kaspi (manual entry, mirrors service_orders.remaining_payment_method).';

-- Cash-session/report queries filter "settled within [date_from, date_to]"
-- the same way they already do for service_orders.remaining_paid_at.
CREATE INDEX IF NOT EXISTS idx_sales_debt_paid_at
  ON public.sales (debt_paid_at)
  WHERE debt_paid_at IS NOT NULL;
