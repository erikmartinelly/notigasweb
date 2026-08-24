-- =============================================================================
-- MIGRACIÓN 092: SEPARAR ANUNCIOS PUBLICITARIOS DE AVISOS COMUNITARIOS
-- =============================================================================
-- anuncios_globales: publicidad administrada y persistente.
-- avisos: publicaciones comunitarias con ciclo de vida propio (48 horas).

BEGIN;

-- Retirar primero la restricción histórica, que todavía solo acepta "avisos".
ALTER TABLE public.anuncios_globales
  DROP CONSTRAINT IF EXISTS anuncios_globales_posicion_check;
ALTER TABLE public.anuncios_globales
  DROP CONSTRAINT IF EXISTS chk_anuncios_posicion;

-- La posición histórica "avisos" significaba "anuncio dentro del muro".
-- Se renombra para que nunca se confunda con la tabla public.avisos.
UPDATE public.anuncios_globales
SET posicion = 'muro_avisos'
WHERE LOWER(TRIM(COALESCE(posicion, ''))) = 'avisos';

ALTER TABLE public.anuncios_globales
  ADD CONSTRAINT anuncios_globales_posicion_check
  CHECK (posicion IN ('mapa', 'repartidores', 'muro_avisos'));

COMMENT ON TABLE public.anuncios_globales IS
  'Anuncios publicitarios administrados. Son persistentes y no pertenecen al ciclo de purga de Avisos Gratis.';
COMMENT ON COLUMN public.anuncios_globales.posicion IS
  'Ubicación publicitaria: mapa, repartidores o muro_avisos. muro_avisos no es una fila de public.avisos.';
COMMENT ON TABLE public.avisos IS
  'Avisos comunitarios creados por usuarios. Son distintos de la publicidad y conservan su ciclo de vida de 48 horas.';

CREATE OR REPLACE FUNCTION public.rpc_save_local_ad(
    p_titulo text,
    p_descripcion text,
    p_url text,
    p_image_url text,
    p_ciudad text,
    p_activo boolean DEFAULT true,
    p_posicion text DEFAULT 'mapa'::text,
    p_admin_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_ad_id uuid;
    v_norm_ciudad text;
    v_norm_pos text;
    v_clean_url text;
BEGIN
    IF NOT public.is_admin_email_for(p_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere cuenta administradora activa');
    END IF;

    v_norm_ciudad := LOWER(TRIM(COALESCE(p_ciudad, 'global')));
    IF v_norm_ciudad IN ('', 'todas', 'todos', 'all', 'todas las ciudades', 'todas_las_ciudades', 'nacional') THEN
        v_norm_ciudad := 'global';
    END IF;

    v_norm_pos := LOWER(TRIM(COALESCE(p_posicion, 'mapa')));
    IF v_norm_pos = 'avisos' THEN
        v_norm_pos := 'muro_avisos';
    END IF;
    IF v_norm_pos NOT IN ('mapa', 'repartidores', 'muro_avisos') THEN
        v_norm_pos := 'mapa';
    END IF;

    v_clean_url := NULLIF(TRIM(p_url), '');

    INSERT INTO public.anuncios_globales (
        titulo, descripcion, url, image_url, ciudad, posicion, activo, created_at
    )
    VALUES (
        COALESCE(NULLIF(TRIM(p_titulo), ''), 'Auspiciador Oficial NOTIGAS'),
        COALESCE(NULLIF(TRIM(p_descripcion), ''), 'Propaganda Local - ' || UPPER(v_norm_pos)),
        v_clean_url,
        CASE WHEN p_image_url = '__REMOVE__' THEN NULL ELSE NULLIF(TRIM(p_image_url), '') END,
        v_norm_ciudad,
        v_norm_pos,
        COALESCE(p_activo, true),
        now()
    )
    ON CONFLICT (LOWER(TRIM(COALESCE(ciudad, 'global'))), LOWER(TRIM(COALESCE(posicion, 'mapa'))))
    DO UPDATE SET
        titulo = EXCLUDED.titulo,
        descripcion = EXCLUDED.descripcion,
        url = EXCLUDED.url,
        image_url = CASE
            WHEN p_image_url = '__REMOVE__' THEN NULL
            WHEN p_image_url IS NOT NULL AND TRIM(p_image_url) <> '' THEN p_image_url
            ELSE public.anuncios_globales.image_url
        END,
        activo = EXCLUDED.activo,
        created_at = now()
    RETURNING id INTO v_ad_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_ad_id,
        'ciudad', v_norm_ciudad,
        'posicion', v_norm_pos
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) TO authenticated, service_role;

-- El bucket es público para lectura, pero solo una sesión administradora puede
-- subir, reemplazar o borrar material publicitario.
DROP POLICY IF EXISTS "Insercion anuncios-media para admin" ON storage.objects;
DROP POLICY IF EXISTS "Eliminacion anuncios-media para admin" ON storage.objects;
DROP POLICY IF EXISTS "Lectura publica anuncios-media" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_delete" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_read" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_admin_delete" ON storage.objects;

CREATE POLICY "storage_anuncios_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'anuncios-media');

CREATE POLICY "storage_anuncios_admin_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'anuncios-media' AND public.is_admin_email());

CREATE POLICY "storage_anuncios_admin_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'anuncios-media' AND public.is_admin_email())
WITH CHECK (bucket_id = 'anuncios-media' AND public.is_admin_email());

CREATE POLICY "storage_anuncios_admin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'anuncios-media' AND public.is_admin_email());

NOTIFY pgrst, 'reload schema';

COMMIT;
