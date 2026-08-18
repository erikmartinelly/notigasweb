-- Migration 058: Fix avisos missing autor column and resolve rpc_crear_aviso_vecinal function overload
BEGIN;

-- 1. Asegurar columna autor en tabla avisos
ALTER TABLE public.avisos ADD COLUMN IF NOT EXISTS autor text DEFAULT 'Vecino de la OTB';

-- 2. Eliminar la versión antigua de 5 parámetros de rpc_crear_aviso_vecinal para evitar sobrecarga ambigua en PostgREST
DROP FUNCTION IF EXISTS public.rpc_crear_aviso_vecinal(text, text, text, text, text);

-- 3. Definir la función canónica de 6 parámetros para rpc_crear_aviso_vecinal
CREATE OR REPLACE FUNCTION public.rpc_crear_aviso_vecinal(
    p_categoria text,
    p_titulo text,
    p_descripcion text,
    p_ciudad text,
    p_barrio_otb text DEFAULT 'Global',
    p_autor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_uuid uuid := auth.uid();
    v_user_id text;
    v_new_id uuid;
    v_clean_city text;
    v_author_name text;
    v_profile_city text;
    v_profile_name text;
    v_is_admin boolean := false;
    v_result jsonb;
BEGIN
    IF v_user_uuid IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para publicar un aviso.';
    END IF;

    v_user_id := v_user_uuid::text;

    IF public.is_banned() THEN
        RAISE EXCEPTION 'Tu cuenta se encuentra bloqueada y no puede publicar.';
    END IF;

    IF p_titulo IS NULL OR trim(p_titulo) = '' THEN
        RAISE EXCEPTION 'El título del aviso no puede estar vacío.';
    END IF;

    IF p_descripcion IS NULL OR trim(p_descripcion) = '' THEN
        RAISE EXCEPTION 'La descripción del aviso no puede estar vacía.';
    END IF;

    v_is_admin := public.is_admin_email();

    -- Si no es admin, la ciudad se restringe a la registrada en su perfil o ficha de repartidor
    IF NOT v_is_admin THEN
        -- 1. Intentar obtener ciudad y nombre desde perfiles (compradores / vecinos)
        SELECT p.ciudad, NULLIF(TRIM(CONCAT_WS(' ', p.nombre, p.apellido)), '')
        INTO v_profile_city, v_profile_name
        FROM public.profiles p
        WHERE p.id = v_user_uuid;

        -- 2. Si no tiene perfil o no tiene ciudad, buscar en choferes_habilitados (repartidores)
        IF v_profile_city IS NULL OR v_profile_city = '' THEN
            SELECT c.ciudad, c.nombre_completo
            INTO v_profile_city, v_profile_name
            FROM public.choferes_habilitados c
            WHERE c.user_id = v_user_id;
        END IF;

        -- Forzar ciudad de registro si existe, o usar p_ciudad sanitizada como respaldo
        v_clean_city := LOWER(TRIM(COALESCE(v_profile_city, p_ciudad, 'cochabamba')));
        v_author_name := COALESCE(NULLIF(TRIM(p_autor), ''), NULLIF(TRIM(v_profile_name), ''), 'Vecino de la OTB');
    ELSE
        -- Administrador todopoderoso: puede publicar en cualquier ciudad elegida
        v_clean_city := LOWER(TRIM(COALESCE(p_ciudad, 'cochabamba')));
        v_author_name := COALESCE(NULLIF(TRIM(p_autor), ''), 'Administración NOTIGAS');
    END IF;

    IF v_clean_city = '' THEN
        v_clean_city := 'cochabamba';
    END IF;

    INSERT INTO public.avisos (
        user_id,
        categoria,
        titulo,
        descripcion,
        ciudad,
        barrio_otb,
        autor,
        votos,
        activo,
        tipo,
        created_at
    ) VALUES (
        v_user_id,
        COALESCE(NULLIF(TRIM(p_categoria), ''), 'AVISO VECINAL'),
        TRIM(p_titulo),
        TRIM(p_descripcion),
        v_clean_city,
        COALESCE(NULLIF(TRIM(p_barrio_otb), ''), 'Global'),
        v_author_name,
        1,
        true,
        'aviso',
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_new_id;

    SELECT jsonb_build_object(
        'id', v_new_id,
        'titulo', TRIM(p_titulo),
        'ciudad', v_clean_city,
        'autor', v_author_name,
        'user_id', v_user_id,
        'created_at', now()
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 4. Permisos
REVOKE ALL ON FUNCTION public.rpc_crear_aviso_vecinal(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_crear_aviso_vecinal(text, text, text, text, text, text) TO authenticated;

-- 5. Trigger de sanitización seguro
CREATE OR REPLACE FUNCTION public.sanitize_html()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.titulo := LEFT(REGEXP_REPLACE(COALESCE(NEW.titulo, ''), '<[^>]*>', '', 'g'), 160);
  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
  IF NEW.mensaje IS NOT NULL THEN
    NEW.mensaje := LEFT(REGEXP_REPLACE(NEW.mensaje, '<[^>]*>', '', 'g'), 2000);
  END IF;
  NEW.categoria := LEFT(REGEXP_REPLACE(COALESCE(NEW.categoria, 'AVISO VECINAL'), '<[^>]*>', '', 'g'), 80);
  IF TG_TABLE_NAME = 'avisos' AND NEW.autor IS NOT NULL THEN
    NEW.autor := LEFT(REGEXP_REPLACE(NEW.autor, '<[^>]*>', '', 'g'), 120);
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Registrar en schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('058', 'fix_avisos_autor_column_and_rpc')
ON CONFLICT (version) DO NOTHING;

COMMIT;
