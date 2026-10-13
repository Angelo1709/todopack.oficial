-- Precio final (con IVA, pesos enteros) leído de Gestión. NULL = el origen no informó precio.
ALTER TABLE gestion_stock ADD COLUMN price integer;
