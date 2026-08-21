-- ==============================================================================
-- MIGRACIÓN 074: PERSISTENCIA ROBUSTA DE PROPAGANDAS LOCALES (MAPA, REPARTIDORES, AVISOS)
-- ==============================================================================

-- 1. Eliminar la sobrecarga obsoleta de 6 parámetros para evitar colisiones
DROP FUNCTION IF EXISTS public.rpc_save_local_ad(text, text, text, text, text, boolean);

-- 2. Índice único para garantizar que cada ciudad tenga exactamente 1 anuncio por posición
CREATE UNIQUE INDEX IF NOT EXISTS idx_anuncios_globales_ciudad_posicion
ON public.anuncios_globales (LOWER(TRIM(ciudad)), LOWER(TRIM(COALESCE(posicion, 'mapa'))));

-- 3. Función RPC definitiva para guardar anuncios por ciudad y posición
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
AS $function$
DECLARE
    v_ad_id UUID;
    v_norm_ciudad TEXT;
    v_norm_pos TEXT;
    v_existing_id UUID;
BEGIN
    IF NOT public.is_admin_email() THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere cuenta administradora');
    END IF;

    v_norm_ciudad := LOWER(TRIM(COALESCE(p_ciudad, 'cochabamba')));
    IF v_norm_ciudad = '' THEN
        v_norm_ciudad := 'cochabamba';
    END IF;

    v_norm_pos := LOWER(TRIM(COALESCE(p_posicion, 'mapa')));
    IF v_norm_pos NOT IN ('mapa', 'repartidores', 'avisos') THEN
        v_norm_pos := 'mapa';
    END IF;

    -- Buscar si ya existe anuncio para esta ciudad y posición específica
    SELECT id INTO v_existing_id
    FROM public.anuncios_globales
    WHERE LOWER(TRIM(ciudad)) = v_norm_ciudad
      AND LOWER(TRIM(COALESCE(posicion, 'mapa'))) = v_norm_pos
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        UPDATE public.anuncios_globales
        SET titulo = COALESCE(NULLIF(TRIM(p_titulo), ''), 'Auspiciador Oficial NOTIGAS'),
            descripcion = COALESCE(p_descripcion, 'Propaganda Local - ' || UPPER(v_norm_pos)),
            url = NULLIF(TRIM(p_url), ''),
            image_url = CASE 
                WHEN p_image_url = '__REMOVE__' THEN NULL
                WHEN p_image_url IS NOT NULL AND TRIM(p_image_url) <> '' THEN p_image_url
                ELSE image_url 
            END,
            activo = COALESCE(p_activo, true),
            posicion = v_norm_pos,
            created_at = now()
        WHERE id = v_existing_id
        RETURNING id INTO v_ad_id;
    ELSE
        INSERT INTO public.anuncios_globales (
            titulo, descripcion, url, image_url, ciudad, posicion, activo, created_at
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
        RETURNING id INTO v_ad_id;
    END IF;

    -- Garantizar que el modo de publicidad global permanezca en local
    UPDATE public.configuracion_publicidad
    SET modo = 'local',
        updated_at = now()
    WHERE id = 1;

    RETURN jsonb_build_object(
        'success', true, 
        'ad_id', v_ad_id, 
        'ciudad', v_norm_ciudad,
        'posicion', v_norm_pos,
        'titulo', p_titulo,
        'url', p_url
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text) TO anon;
