-- ============================================================================
-- M6: Activar ROW LEVEL SECURITY en tablas legacy con policies admin-only
-- que fueron creadas pero nunca enforcement (RLS apagado => policies ignoradas).
--
-- public.repartidores  -> telefono/placa de repartidores (legacy, sensible)
-- public.mensajes_foro -> legacy sin consumidores en la app actual
-- public.publicaciones -> legacy sin consumidores en la app actual
--
-- La app actual lee repartidores a traves de choferes_publicos
-- y rutas_repartidores_publicas (que consumen driver_public_presence),
-- por lo que habilitar RLS en estas tablas no afecta endpoints en produccion.
-- ============================================================================
BEGIN;

ALTER TABLE public.repartidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_foro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicaciones ENABLE ROW LEVEL SECURITY;

-- Acceso SELECT exclusivo para sesiones administradoras reales (idempotente).
REVOKE ALL ON TABLE public.repartidores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.repartidores TO authenticated;
DROP POLICY IF EXISTS repartidores_admin_select ON public.repartidores;
CREATE POLICY repartidores_admin_select
ON public.repartidores
FOR SELECT TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

REVOKE ALL ON TABLE public.mensajes_foro FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mensajes_foro TO authenticated;
DROP POLICY IF EXISTS mensajes_foro_admin_select ON public.mensajes_foro;
CREATE POLICY mensajes_foro_admin_select
ON public.mensajes_foro
FOR SELECT TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

REVOKE ALL ON TABLE public.publicaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.publicaciones TO authenticated;
DROP POLICY IF EXISTS publicaciones_admin_select ON public.publicaciones;
CREATE POLICY publicaciones_admin_select
ON public.publicaciones
FOR SELECT TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

COMMENT ON TABLE public.repartidores IS
  'Legacy: telefono/placa de repartidores. RLS activo con lectura exclusiva de administradores. La app usa choferes_publicos / rutas_repartidores_publicas.';
COMMENT ON TABLE public.mensajes_foro IS
  'Legacy: RLS activo con lectura exclusiva de administradores.';
COMMENT ON TABLE public.publicaciones IS
  'Legacy: RLS activo con lectura exclusiva de administradores.';

NOTIFY pgrst, 'reload schema';

COMMIT;