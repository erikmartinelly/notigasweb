-- ==============================================================================
-- MIGRACIÓN 083: RPC PARA ACTUALIZAR AVISO VECINAL PROPIO (AUTOR O ADMINISTRADOR)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_actualizar_aviso_propio(
    p_aviso_id uuid,
    p_titulo text,
    p_descripcion text,
    p_categoria text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_uid text := auth.uid()::text;
    v_aviso record;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autenticado');
    END IF;

    IF is_banned() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Usuario suspendido');
    END IF;

    SELECT * INTO v_aviso
    FROM public.avisos
    WHERE id = p_aviso_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Aviso no encontrado');
    END IF;

    IF v_aviso.user_id <> v_uid AND NOT public.is_admin_email() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Solo el autor o administrador puede editar este aviso');
    END IF;

    UPDATE public.avisos
    SET titulo = TRIM(p_titulo),
        descripcion = TRIM(p_descripcion),
        categoria = UPPER(TRIM(p_categoria))
    WHERE id = p_aviso_id;

    RETURN jsonb_build_object('ok', true, 'id', p_aviso_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_actualizar_aviso_propio(uuid, text, text, text) TO authenticated;
