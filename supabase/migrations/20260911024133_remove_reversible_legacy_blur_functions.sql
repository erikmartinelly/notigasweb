-- Retira el blur determinista basado en UUID. La ubicación pública de pedidos
-- libres se genera ahora mediante order_public_radar con offset aleatorio privado.
drop function if exists public.fn_blur_latitude(uuid,double precision);
drop function if exists public.fn_blur_longitude(uuid,double precision,double precision);
notify pgrst, 'reload schema';
