/**
 * A refund is unresolved until the provider has rejected it or the confirmed
 * refund has completed the local financial reversal. These SQL fragments are
 * used inside the same transaction as the affected financial mutation; they
 * never reverse an order or change an existing ledger entry themselves.
 *
 * Keep this module free of payment/finance imports to avoid dependency cycles.
 */
export const digipayRefundHeldOrderIdsSql = `
  SELECT order_id FROM p_digipay_refunds
  WHERE status IN ('requesting','pending','review')
     OR (status='succeeded' AND completed_at IS NULL)
`;

/** Include historical two-lot matches and newer multi-lot allocations. */
export const digipayRefundHeldBinaryCommissionIdsSql = `
  SELECT m.commission_id FROM p_binary_matches m
  WHERE m.void=0 AND m.commission_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM p_binary_lots l
      WHERE l.id IN (m.left_lot,m.right_lot)
        AND l.order_id IN (${digipayRefundHeldOrderIdsSql})
    ) OR EXISTS (
      SELECT 1 FROM p_binary_match_allocations a
      JOIN p_binary_lots l ON l.id=a.lot_id
      WHERE a.match_id=m.id AND l.order_id IN (${digipayRefundHeldOrderIdsSql})
    )
  )
`;

/** Both historical member pools and the current position pools can fund a match. */
export const digipayRefundHeldCardMatchIdsSql = `
  SELECT a.match_id FROM p_card_match_allocations a
  JOIN p_card_lots l ON l.id=a.lot_id
  WHERE l.order_id IN (${digipayRefundHeldOrderIdsSql})
  UNION
  SELECT a.match_id FROM p_card_position_allocations a
  JOIN p_card_position_lots l ON l.id=a.lot_id
  WHERE l.order_id IN (${digipayRefundHeldOrderIdsSql})
`;
