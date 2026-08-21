-- ==============================================================================
-- MIGRACIÓN 086: UPSERT ATÓMICO Y DEDUPLICACIÓN DE ANUNCIOS_GLOBALES
-- 1. Deduplicar registros históricos en public.anuncios_globales
-- 2. Asegurar índice UNIQUE limpio sobre (LOWER(TRIM(ciudad)), LOWER(TRIM(COALESCE(posicion, 'mapa'))))
-- 3. Redefinir rpc_save_local_ad como un INSERT ... ON CONFLICT DO UPDATE 100% atómico
-- ==============================================================================

-- 1. Limpieza y Deduplicación preventiva de registros históricos
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER(
           PARTITION BY LOWER(TRIM(ciudad)), LOWER(TRIM(COALESCE(posicion, 'mapa')))
           ORDER BY created_at DESC, id DESC
         ) as rn
  FROM public.anuncios_globales
)
DELETE FROM public.anuncios_globales
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Asegurar índice UNIQUE limpio
DROP INDEX IF EXISTS public.idx_anuncios_globales_ciudad_posicion;
CREATE UNIQUE INDEX idx_anuncios_globales_ciudad_posicion 
ON public.anuncios_globales (LOWER(TRIM(ciudad)), LOWER(TRIM(COALESCE(posicion, 'mapa'))));

-- 3. Redefinir rpc_save_local_ad con UPSERT Atómico
CREATE OR REPLACE FUNCTION public.rpc_save_local_ad(
    p_titulo text,
    p_descripcion text,
    p_url text,
    p_image_url text,
    p_ciudad text,
    p_activo boolean DEFAULT true,
    p_posicion text DEFAULT 'mapa'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_ad_id UUID;
    v_norm_ciudad TEXT;
    v_norm_pos TEXT;
BEGIN
    IF NOT public.is_admin_email() THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere cuenta administradora');
    END IF;

    v_norm_ciudad := LOWER(TRIM(COALESCE(p_ciudad, 'global')));
    IF v_norm_ciudad IN ('', 'todas', 'todos', 'all', 'todas las ciudades', 'todas_las_ciudades', 'nacional') THEN
        v_norm_ciudad := 'global';
    END IF;

    v_norm_pos := LOWER(TRIM(COALESCE(p_posicion, 'mapa')));
    IF v_norm_pos NOT IN ('mapa', 'repartidores', 'avisos') THEN
        v_norm_pos := 'mapa';
    END IF;

    INSERT INTO public.anuncios_globales (
        titulo,
        descripcion,
        url,
        image_url,
        ciudad,
        posicion,
        activo,
        created_at
    )
    VALUES (
        COALESCE(NULLIF(TRIM(p_titulo), ''), 'Auspiciador Oficial NOTIGAS'),
        COALESCE(p_descripcion, 'Propaganda Local - ' || UPPER(v_norm_pos)),
        NULLIF(TRIM(p_url), ''),
        CASE WHEN p_image_url = '__REMOVE__' THEN NULL ELSE NULLIF(TRIM(p_image_url), '') END,
        v_norm_ciudad,
        v_norm_pos,
        COALESCE(p_activo, true),
        now()
    )
    ON CONFLICT (LOWER(TRIM(ciudad)), LOWER(TRIM(COALESCE(posicion, 'mapa'))))
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

GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text) TO authenticated;
