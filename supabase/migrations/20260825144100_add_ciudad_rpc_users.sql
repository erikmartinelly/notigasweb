DROP FUNCTION IF EXISTS public.rpc_admin_list_users();

CREATE OR REPLACE FUNCTION public.rpc_admin_list_users()
  RETURNS TABLE (
    user_id uuid,
    email text,
    nombre text,
    role text,
    created_at timestamp with time zone,
    is_driver boolean,
    is_banned boolean,
    ciudad text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    IF NOT public.is_admin_email() THEN
      RAISE EXCEPTION 'Acceso denegado: solo administradores';
    END IF;
  
    RETURN QUERY
    SELECT
      u.id,
      u.email::text,
      COALESCE(p.nombre, u.raw_user_meta_data ->> 'full_name', split_part(COALESCE(u.email, ''), '@', 1))::text,
      CASE WHEN ch.user_id IS NOT NULL THEN 'repartidor' ELSE COALESCE(p.role, 'vecino') END::text,
      u.created_at,
      (ch.user_id IS NOT NULL),
      EXISTS (
        SELECT 1 FROM public.usuarios_baneados ub
        WHERE ub.user_id = u.id::text
           OR (ub.email IS NOT NULL AND LOWER(TRIM(ub.email)) = LOWER(TRIM(COALESCE(u.email, ''))))
      ),
      COALESCE(p.ciudad, 'No especificada')::text
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.choferes_habilitados ch ON ch.user_id = u.id::text
    WHERE NOT EXISTS (
      SELECT 1 FROM public.admin_credentials ac
      WHERE LOWER(TRIM(ac.email)) = LOWER(TRIM(COALESCE(u.email, '')))
    )
    ORDER BY u.created_at DESC;
  END;
  $$;
