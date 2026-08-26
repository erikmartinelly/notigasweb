-- 20260825200000_fix_delete_ad_rpc.sql
-- Fix rpc_delete_local_ad to reference the correct table (anuncios_globales)

CREATE OR REPLACE FUNCTION public.rpc_delete_local_ad(
    p_ad_id uuid,
    p_admin_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS 
BEGIN
    IF NOT public.is_admin_email_for(p_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere cuenta administradora activa');
    END IF;

    DELETE FROM public.anuncios_globales
    WHERE id = p_ad_id;

    RETURN jsonb_build_object('success', true, 'id', p_ad_id);
END;
;
