BEGIN;

-- NOTIGAS - cierre final de escrituras administrativas frente a anonymous sign-ins.
-- Las lecturas públicas de publicidad permanecen abiertas deliberadamente.

DROP POLICY IF EXISTS anuncios_admin_insert ON public.anuncios_globales;
CREATE POLICY anuncios_admin_insert ON public.anuncios_globales
FOR INSERT TO authenticated
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS anuncios_admin_update ON public.anuncios_globales;
CREATE POLICY anuncios_admin_update ON public.anuncios_globales
FOR UPDATE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
)
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS anuncios_admin_delete ON public.anuncios_globales;
CREATE POLICY anuncios_admin_delete ON public.anuncios_globales
FOR DELETE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS anuncios_nativos_insert ON public.anuncios_nativos_sistema;
CREATE POLICY anuncios_nativos_insert ON public.anuncios_nativos_sistema
FOR INSERT TO authenticated
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS anuncios_nativos_update ON public.anuncios_nativos_sistema;
CREATE POLICY anuncios_nativos_update ON public.anuncios_nativos_sistema
FOR UPDATE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
)
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS anuncios_nativos_delete ON public.anuncios_nativos_sistema;
CREATE POLICY anuncios_nativos_delete ON public.anuncios_nativos_sistema
FOR DELETE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS config_publicidad_insert ON public.configuracion_publicidad;
CREATE POLICY config_publicidad_insert ON public.configuracion_publicidad
FOR INSERT TO authenticated
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS config_publicidad_update ON public.configuracion_publicidad;
CREATE POLICY config_publicidad_update ON public.configuracion_publicidad
FOR UPDATE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
)
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS config_publicidad_delete ON public.configuracion_publicidad;
CREATE POLICY config_publicidad_delete ON public.configuracion_publicidad
FOR DELETE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS storage_anuncios_admin_insert ON storage.objects;
CREATE POLICY storage_anuncios_admin_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'anuncios-media'
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS storage_anuncios_admin_update ON storage.objects;
CREATE POLICY storage_anuncios_admin_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'anuncios-media'
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
)
WITH CHECK (
  bucket_id = 'anuncios-media'
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS storage_anuncios_admin_delete ON storage.objects;
CREATE POLICY storage_anuncios_admin_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'anuncios-media'
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

COMMIT;
