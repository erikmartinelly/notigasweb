-- ==============================================================================
-- MIGRACIÓN 087: CORRECCIÓN DEFINITIVA DE PERSISTENCIA Y GUARDADO DE ANUNCIOS
-- ==============================================================================

-- 1. Deduplicación preventiva de registros históricos en public.anuncios_globales
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER(
           PARTITION BY LOWER(TRIM(COALESCE(ciudad, 'global'))), LOWER(TRIM(COALESCE(posicion, 'mapa')))
           ORDER BY created_at DESC, id DESC
         ) as rn
  FROM public.anuncios_globales
)
DELETE FROM public.anuncios_globales
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Asegurar índice UNIQUE limpio
DROP INDEX IF EXISTS public.idx_anuncios_globales_ciudad_posicion;
CREATE UNIQUE INDEX idx_anuncios_globales_ciudad_posicion 
ON public.anuncios_globales (LOWER(TRIM(COALESCE(ciudad, 'global'))), LOWER(TRIM(COALESCE(posicion, 'mapa'))));

-- 3. Función is_admin_email ultra robusta y tolerante a tokens/metadata
CREATE OR REPLACE FUNCTION public.is_admin_email(p_email text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_jwt_email text := LOWER(TRIM(COALESCE(
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'email',
    auth.jwt() -> 'app_metadata' ->> 'email',
    ''
  )));
  v_user_id uuid := auth.uid();
  v_user_email text := '';
  v_check_email text := LOWER(TRIM(COALESCE(p_email, '')));
BEGIN
  -- Permiso total a roles administrativos de PostgreSQL / Supabase
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN true;
  END IF;

  -- 1. Validar por email en JWT
  IF v_jwt_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_jwt_email
  ) THEN
    RETURN true;
  END IF;

  -- 2. Validar por UID en auth.users
  IF v_user_id IS NOT NULL THEN
    SELECT LOWER(TRIM(COALESCE(email, raw_user_meta_data->>'email', ''))) INTO v_user_email
    FROM auth.users WHERE id = v_user_id;

    IF v_user_email <> '' AND EXISTS (
      SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_user_email
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- 3. Validar por email administrativo explícito verificado contra admin_credentials
  IF v_check_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_check_email
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 4. Redefinir rpc_save_local_ad con soporte para p_admin_email y UPSERT atómico
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
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_ad_id UUID;
    v_norm_ciudad TEXT;
    v_norm_pos TEXT;
    v_clean_url TEXT;
BEGIN
    IF NOT public.is_admin_email(p_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere cuenta administradora activa');
    END IF;

    v_norm_ciudad := LOWER(TRIM(COALESCE(p_ciudad, 'global')));
    IF v_norm_ciudad IN ('', 'todas', 'todos', 'all', 'todas las ciudades', 'todas_las_ciudades', 'nacional') THEN
        v_norm_ciudad := 'global';
    END IF;

    v_norm_pos := LOWER(TRIM(COALESCE(p_posicion, 'mapa')));
    IF v_norm_pos NOT IN ('mapa', 'repartidores', 'avisos') THEN
        v_norm_pos := 'mapa';
    END IF;

    v_clean_url := NULLIF(TRIM(p_url), '');

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

-- 5. RPC para eliminación segura de anuncios
CREATE OR REPLACE FUNCTION public.rpc_delete_local_ad(
    p_ad_id uuid,
    p_admin_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
    IF NOT public.is_admin_email(p_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere cuenta administradora activa');
    END IF;

    DELETE FROM public.anuncios_globales
    WHERE id = p_ad_id;

    RETURN jsonb_build_object('success', true, 'id', p_ad_id);
END;
$$;

-- 6. Otorgar permisos
GRANT EXECUTE ON FUNCTION public.is_admin_email(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_local_ad(uuid, text) TO anon, authenticated, service_role;

GRANT SELECT ON public.anuncios_globales TO anon, authenticated;
GRANT ALL ON public.anuncios_globales TO authenticated, service_role;
