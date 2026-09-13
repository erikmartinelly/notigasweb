-- Recovered from the applied Supabase migration history to restore Git/remote parity.
ALTER POLICY anuncios_admin_insert ON public.anuncios_globales
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY anuncios_admin_update ON public.anuncios_globales
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
)
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY anuncios_admin_delete ON public.anuncios_globales
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY anuncios_nativos_insert ON public.anuncios_nativos_sistema
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY anuncios_nativos_update ON public.anuncios_nativos_sistema
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
)
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY anuncios_nativos_delete ON public.anuncios_nativos_sistema
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY config_publicidad_insert ON public.configuracion_publicidad
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY config_publicidad_update ON public.configuracion_publicidad
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
)
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY config_publicidad_delete ON public.configuracion_publicidad
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY denuncias_select ON public.denuncias
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY denuncias_update ON public.denuncias
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
)
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY denuncias_delete ON public.denuncias
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY reportes_spam_select ON public.reportes_spam
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY reportes_spam_update ON public.reportes_spam
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
)
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY reportes_spam_delete ON public.reportes_spam
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY "Pedidos Borrar admin" ON public.pedidos
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY repartidores_admin_select ON public.repartidores
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY mensajes_foro_admin_select ON public.mensajes_foro
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY publicaciones_admin_select ON public.publicaciones
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT public.is_admin_email())
);

ALTER POLICY avisos_insert ON public.avisos
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT auth.uid()) IS NOT NULL
  AND (SELECT auth.uid())::text = user_id
  AND NOT (SELECT public.is_banned())
);

ALTER POLICY avisos_update ON public.avisos
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND ((SELECT auth.uid())::text = user_id OR (SELECT public.is_admin_email()))
)
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND ((SELECT auth.uid())::text = user_id OR (SELECT public.is_admin_email()))
);

ALTER POLICY avisos_delete ON public.avisos
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND ((SELECT auth.uid())::text = user_id OR (SELECT public.is_admin_email()))
);

ALTER POLICY comentarios_insert ON public.comentarios_avisos
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT auth.uid()) IS NOT NULL
  AND (SELECT auth.uid())::text = user_id
  AND NOT (SELECT public.is_banned())
);

ALTER POLICY comentarios_update ON public.comentarios_avisos
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND ((SELECT auth.uid())::text = user_id OR (SELECT public.is_admin_email()))
)
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND ((SELECT auth.uid())::text = user_id OR (SELECT public.is_admin_email()))
);

ALTER POLICY comentarios_delete ON public.comentarios_avisos
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND ((SELECT auth.uid())::text = user_id OR (SELECT public.is_admin_email()))
);

ALTER POLICY order_public_radar_registered_read ON public.order_public_radar
USING (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND private.can_view_order_radar(order_id)
);
