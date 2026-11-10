-- Adopta esta Navidad: precio de cada regalo (para sumar el donativo sugerido)
-- y la marca de "Navidad adoptada", que el equipo pone a mano cuando llega el donativo en Zeffy.

ALTER TABLE gifts ADD COLUMN price_cents INTEGER;
ALTER TABLE children ADD COLUMN adopted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE children ADD COLUMN adopted_at TEXT;
ALTER TABLE children ADD COLUMN adopted_by TEXT;
