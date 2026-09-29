-- Run as schema owner before deploying TS-11.1. Safe to reapply.
-- Pause settlement writers for the atomic historical rebuild and trigger install.
BEGIN;
LOCK TABLE holding_movements, holdings IN ACCESS EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS tg_holding_movement_projection ON holding_movements;

-- Keep the read projection in the same transaction as each settlement movement.
-- The zero-row upsert and UPDATE serialize writers on (account_id, instrument_id),
-- including concurrent first purchases. Negative balances fail the entire movement.
CREATE OR REPLACE FUNCTION apply_holding_change(
    p_account UUID, p_instrument UUID, p_quantity BIGINT,
    p_cost NUMERIC, p_updated_at TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO holdings(account_id, instrument_id, quantity, avg_cost, updated_at)
    VALUES (p_account, p_instrument, 0, 0, p_updated_at)
    ON CONFLICT (account_id, instrument_id) DO NOTHING;

    UPDATE holdings
    SET avg_cost = CASE
            WHEN quantity + p_quantity = 0 THEN 0
            WHEN p_quantity > 0 THEN
                (quantity::NUMERIC * avg_cost + p_quantity::NUMERIC * p_cost)
                    / (quantity + p_quantity)
            ELSE avg_cost
        END,
        quantity = quantity + p_quantity,
        updated_at = GREATEST(updated_at, p_updated_at)
    WHERE account_id = p_account AND instrument_id = p_instrument;
END;
$$;

CREATE OR REPLACE FUNCTION project_holding_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM apply_holding_change(NEW.account_id, NEW.instrument_id,
        NEW.quantity_change, NEW.cost_basis, clock_timestamp());
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_holding_movement_projection
AFTER INSERT ON holding_movements
FOR EACH ROW EXECUTE FUNCTION project_holding_movement();

-- Rebuild only ledger-backed positions; retain opening positions with no ledger.
-- The ledger must contain the full history for each rebuilt position.
-- Invalid histories (e.g. a sell without an opening buy) abort the migration.
UPDATE holdings h SET quantity = 0, avg_cost = 0
WHERE EXISTS (
    SELECT 1 FROM holding_movements m
    WHERE m.account_id = h.account_id AND m.instrument_id = h.instrument_id
);

DO $$
DECLARE
    movement RECORD;
BEGIN
    FOR movement IN
        SELECT m.* FROM holding_movements m
        JOIN fills f ON f.fill_id = m.fill_id
        ORDER BY m.account_id, m.instrument_id, m.created_at, f.filled_at, m.movement_id
    LOOP
        PERFORM apply_holding_change(movement.account_id, movement.instrument_id,
            movement.quantity_change, movement.cost_basis, movement.created_at);
    END LOOP;
END;
$$;
COMMIT;

