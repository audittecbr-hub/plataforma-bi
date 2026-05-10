-- Update the label for Type 14 in 'unidades_type_map' to 'B2C'
-- This ensures the display string in Unidades Reports is formattted as "Tipo 14 - B2C"
UPDATE system_settings 
SET value = jsonb_set(value, '{14}', '"B2C"') 
WHERE key = 'unidades_type_map';
