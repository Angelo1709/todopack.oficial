-- Horarios iniciales y anticipación confirmados por el usuario. Conserva ajustes existentes.
INSERT INTO settings(key,value) VALUES
 ('deliveryMiddayStart','12:00'),('deliveryMiddayEnd','15:00'),
 ('deliveryNightStart','19:00'),('deliveryNightEnd','22:00'),
 ('deliveryLeadMinutes','60') ON CONFLICT(key) DO NOTHING;
-- Guarda el horario prometido al confirmar: cambios futuros no alteran pedidos anteriores.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_window text;
