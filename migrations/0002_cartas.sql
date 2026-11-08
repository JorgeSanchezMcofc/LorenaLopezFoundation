-- Carta del niño: el sobre que decoró (frente y, si tiene, la parte de atrás), la carta escaneada
-- (ya revisada, sin datos personales) y su transcripción.
-- Las imágenes viven en R2 junto a la caricatura (public/NINO-001/<uuid>-carta.jpg, -sobre, -sobre-atras),
-- así que borrar el perfil también las borra.

ALTER TABLE children ADD COLUMN letter_key      TEXT;
ALTER TABLE children ADD COLUMN letter_front_key TEXT;
ALTER TABLE children ADD COLUMN letter_back_key  TEXT;
ALTER TABLE children ADD COLUMN letter_text_es  TEXT NOT NULL DEFAULT '';
ALTER TABLE children ADD COLUMN letter_text_en  TEXT NOT NULL DEFAULT '';
