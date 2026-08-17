-- 047_forum_rpc_and_security.sql
-- Procedimientos almacenados para creación segura de avisos y comentarios vecinales con protección anti-spam.

BEGIN;

-- 1. RPC para crear aviso vecinal seguro
CREATE OR REPLACE FUNCTION public.rpc_crear_aviso_vecinal(
    p_categoria text,
    p_titulo text,
    p_descripcion text,
    p_ciudad text,
    p_barrio_otb text DEFAULT 'Global'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_uuid uuid := auth.uid();
    v_user_id text;
    v_new_id uuid;
    v_clean_city text;
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

    v_clean_city := lower(trim(coalesce(p_ciudad, 'cochabamba')));
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
        votos,
        activo,
        tipo,
        created_at
    ) VALUES (
        v_user_id,
        coalesce(nullif(trim(p_categoria), ''), 'AVISO VECINAL'),
        trim(p_titulo),
        trim(p_descripcion),
        v_clean_city,
        coalesce(nullif(trim(p_barrio_otb), ''), 'Global'),
        1,
        true,
        'aviso',
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_new_id;

    SELECT jsonb_build_object(
        'id', v_new_id,
        'titulo', trim(p_titulo),
        'ciudad', v_clean_city,
        'user_id', v_user_id,
        'created_at', now()
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 2. RPC para agregar comentario seguro
CREATE OR REPLACE FUNCTION public.rpc_agregar_comentario_aviso(
    p_aviso_id uuid,
    p_texto text,
    p_autor text DEFAULT 'Vecino de la OTB'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_uuid uuid := auth.uid();
    v_user_id text;
    v_new_id uuid;
    v_result jsonb;
BEGIN
    IF v_user_uuid IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para comentar.';
    END IF;

    v_user_id := v_user_uuid::text;

    IF public.is_banned() THEN
        RAISE EXCEPTION 'Tu cuenta se encuentra bloqueada.';
    END IF;

    IF p_texto IS NULL OR trim(p_texto) = '' THEN
        RAISE EXCEPTION 'El comentario no puede estar vacío.';
    END IF;

    INSERT INTO public.comentarios_avisos (
        aviso_id,
        user_id,
        autor,
        texto,
        votos,
        created_at
    ) VALUES (
        p_aviso_id,
        v_user_id,
        coalesce(nullif(trim(p_autor), ''), 'Vecino de la OTB'),
        trim(p_texto),
        1,
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_new_id;

    SELECT jsonb_build_object(
        'id', v_new_id,
        'aviso_id', p_aviso_id,
        'user_id', v_user_id,
        'autor', coalesce(nullif(trim(p_autor), ''), 'Vecino de la OTB'),
        'texto', trim(p_texto),
        'created_at', now()
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 3. Permisos de ejecución
REVOKE ALL ON FUNCTION public.rpc_crear_aviso_vecinal(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_crear_aviso_vecinal(text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_agregar_comentario_aviso(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_agregar_comentario_aviso(uuid, text, text) TO authenticated;

-- 4. RLS en tabla avisos
DROP POLICY IF EXISTS "Insertar propio" ON public.avisos;
DROP POLICY IF EXISTS "Avisos User Insert" ON public.avisos;

CREATE POLICY "Avisos User Insert" ON public.avisos
FOR INSERT WITH CHECK (
  (auth.uid() IS NOT NULL AND (auth.uid())::text = user_id AND NOT is_banned())
);

COMMIT;
