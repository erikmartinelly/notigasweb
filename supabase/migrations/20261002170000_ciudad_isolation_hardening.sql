-- Auditoría y endurecimiento de aislamiento por ciudad (usuarios y recolectores)
CREATE OR REPLACE FUNCTION public.auth_user_city()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS 
  SELECT COALESCE(NULLIF(lower(trim(p.ciudad)), ''), '')
    FROM public.profiles p
   WHERE p.id = auth.uid()::uuid
;

DROP POLICY IF EXISTS pedidos_select_strict ON public.pedidos;
DROP POLICY IF EXISTS pedidos_select_drivers_contacto ON public.pedidos;
DROP POLICY IF EXISTS pedidos_select_requested_driver ON public.pedidos;
DROP POLICY IF EXISTS pedidos_select_city_scoped ON public.pedidos;

CREATE POLICY pedidos_select_strict
  ON public.pedidos
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_email()
    OR user_id = (auth.uid())::text
    OR driver_id = (auth.uid())::text
    OR requested_driver_id = (auth.uid())::text
    OR private.can_view_order_contact(id)
    OR (
      public.auth_user_city() <> ''
      AND lower(COALESCE(ciudad,'')) = public.auth_user_city()
    )
  );

DROP VIEW IF EXISTS public.pedidos_publicos;
CREATE VIEW public.pedidos_publicos AS
SELECT
  id,
  user_id,
  categoria,
  titulo,
  descripcion,
  cantidad,
  direccion,
  telefono,
  estado,
  driver_id,
  ciudad,
  barrio_otb,
  latitude,
  longitude,
  visto,
  created_at,
  updated_at,
  subestado
FROM public.pedidos p
WHERE
  auth.uid() IS NULL
     OR public.is_admin_email()
     OR lower(COALESCE(p.ciudad,'')) = public.auth_user_city()
     OR p.user_id = (auth.uid())::text
     OR p.driver_id = (auth.uid())::text;