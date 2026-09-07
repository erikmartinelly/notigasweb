-- ============================================================================
-- MIGRACIÓN 092: ADAPTACIÓN INTEGRAL DE TABLAS, FUNCIONES Y VISTAS A PERÚ
-- ============================================================================

-- 1. Actualización de valores por defecto en tablas
ALTER TABLE public.profiles ALTER COLUMN ciudad SET DEFAULT 'lima';
ALTER TABLE public.choferes_habilitados ALTER COLUMN ciudad SET DEFAULT 'lima';
ALTER TABLE public.anuncios_globales ALTER COLUMN ciudad SET DEFAULT 'lima';
ALTER TABLE public.pedidos ALTER COLUMN ciudad SET DEFAULT 'lima';
ALTER TABLE public.avisos ALTER COLUMN ciudad SET DEFAULT 'lima';
ALTER TABLE public.rutas_repartidores ALTER COLUMN ciudad SET DEFAULT 'lima';

-- 2. Actualización de funciones de integridad y auth
CREATE OR REPLACE FUNCTION public.guard_profile_field_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  NEW.nombre := LEFT(REGEXP_REPLACE(COALESCE(NEW.nombre, ''), '<[^>]*>', '', 'g'), 120);
  NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, 'lima'))), 80);
  NEW.direccion := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
  NEW.role := COALESCE(NEW.role, 'vecino');

  IF NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90) THEN
    RAISE EXCEPTION 'Latitud inválida';
  END IF;
  IF NEW.longitude IS NOT NULL AND (NEW.longitude < -180 OR NEW.longitude > 180) THEN
    RAISE EXCEPTION 'Longitud inválida';
  END IF;

  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;

  -- Contexto de creación de usuario en Supabase Auth
  IF TG_OP = 'INSERT' AND (auth.uid() IS NULL OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id)) THEN
    IF NEW.role NOT IN ('vecino', 'repartidor') THEN
      NEW.role := 'vecino';
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes modificar el perfil de otra cuenta';
  END IF;

  IF NEW.role NOT IN ('vecino', 'repartidor') THEN
    RAISE EXCEPTION 'No puedes asignarte privilegios de administrador';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'No se puede cambiar el propietario del perfil';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.profiles (
        id,
        nombre,
        ciudad,
        role
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            NEW.raw_user_meta_data ->> 'nombre',
            split_part(COALESCE(NEW.email, ''), '@', 1),
            'Vecino'
        ),
        COALESCE(
            NULLIF(LOWER(TRIM(NEW.raw_user_meta_data ->> 'ciudad')), ''),
            'lima'
        ),
        'vecino'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_crear_aviso_vecinal(
  p_ciudad text DEFAULT 'lima'::text,
  p_barrio text DEFAULT 'Global'::text,
  p_autor text DEFAULT 'Vecino'::text,
  p_tipo text DEFAULT 'aviso'::text,
  p_categoria text DEFAULT 'COMENTARIO'::text,
  p_titulo text DEFAULT ''::text,
  p_descripcion text DEFAULT ''::text,
  p_mensaje text DEFAULT ''::text,
  p_imagen text DEFAULT ''::text,
  p_barrio_otb text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_uid text := auth.uid()::text;
  v_id uuid;
  v_barrio_final text;
  v_ciudad_final text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'success', false, 'error', 'Usuario no autenticado');
  END IF;
  IF is_banned() THEN
    RETURN jsonb_build_object('ok', false, 'success', false, 'error', 'Usuario suspendido');
  END IF;

  v_barrio_final := COALESCE(NULLIF(TRIM(p_barrio_otb), ''), NULLIF(TRIM(p_barrio), ''), 'Global');
  v_ciudad_final := COALESCE(NULLIF(LOWER(TRIM(p_ciudad)), ''), 'lima');

  INSERT INTO public.avisos (
    user_id, ciudad, barrio_otb, autor, tipo, categoria, titulo, descripcion, mensaje, imagen_url, activo, votos, created_at
  )
  VALUES (
    v_uid,
    v_ciudad_final,
    v_barrio_final,
    COALESCE(NULLIF(TRIM(p_autor), ''), 'Vecino de la OTB'),
    COALESCE(NULLIF(TRIM(p_tipo), ''), 'aviso'),
    COALESCE(NULLIF(UPPER(TRIM(p_categoria)), ''), 'COMENTARIO'),
    COALESCE(NULLIF(TRIM(p_titulo), ''), 'Aviso Vecinal'),
    COALESCE(NULLIF(TRIM(p_descripcion), ''), NULLIF(TRIM(p_mensaje), ''), 'Publicación vecinal'),
    COALESCE(NULLIF(TRIM(p_mensaje), ''), NULLIF(TRIM(p_descripcion), ''), ''),
    NULLIF(TRIM(p_imagen), ''),
    true,
    1,
    now()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.votos_registro (user_id, entidad_id, tipo_entidad, valor)
  VALUES (v_uid, v_id, 'aviso', 1)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'success', true, 'id', v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_delivery_category(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN LOWER(TRIM(COALESCE(p_value, ''))) ~ '(gas|glp|garrafa|balon|balón)' THEN 'gas'
    WHEN LOWER(TRIM(COALESCE(p_value, ''))) ~ '(agua|botell)' THEN 'agua'
    ELSE LOWER(TRIM(COALESCE(p_value, '')))
  END
$function$;

-- 3. Vista de rutas con compatibilidad para balones
CREATE OR REPLACE VIEW public.rutas_repartidores_publicas AS
SELECT 
    r.id,
    CASE
        WHEN r.user_id = (SELECT auth.uid()::text) THEN r.user_id
        ELSE NULL::text
    END AS user_id,
    COALESCE(r.distribuidor_nombre, ch.nombre_completo, 'Repartidor NOTIGAS'::text) AS distribuidor_nombre,
    COALESCE(r.categoria, ch.categoria, 'Gas GLP'::text) AS categoria,
    COALESCE(r.titulo, 'En ruta de distribución'::text) AS titulo,
    r.ciudad,
    r.latitude,
    r.longitude,
    COALESCE(r.garrafas_agotadas, false) AS garrafas_agotadas,
    r.last_active,
    COALESCE(NULLIF(TRIM(r.telefono), ''), NULLIF(TRIM(ch.telefono_whatsapp), '')) AS telefono,
    COALESCE(ch.placa, '') AS placa,
    COALESCE(ch.productos, '') AS productos,
    COALESCE(r.garrafas_agotadas, false) AS balones_agotados
FROM public.rutas_repartidores r
LEFT JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= (now() - interval '10 minutes')
  AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = r.user_id
  );

GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

-- 4. Actualización de datos existentes
UPDATE public.profiles 
SET ciudad = 'lima', updated_at = now() 
WHERE LOWER(ciudad) IN ('cochabamba', 'santacruz', 'lapaz', 'elalto', 'sucre', 'tarija', 'oruro', 'potosi', 'trinidad', 'cobija');

UPDATE public.choferes_habilitados 
SET ciudad = 'lima', productos = 'Balones de Gas GLP 10kg' 
WHERE LOWER(ciudad) IN ('cochabamba', 'santacruz', 'lapaz', 'elalto', 'sucre', 'tarija', 'oruro', 'potosi', 'trinidad', 'cobija');

UPDATE public.anuncios_globales 
SET ciudad = 'lima' 
WHERE LOWER(ciudad) IN ('cochabamba', 'santacruz');

UPDATE public.anuncios_nativos_sistema 
SET url_anuncio = 'https://wa.me/51912345678', actualizado_en = now() 
WHERE id = 1;

UPDATE public.pedidos_archivo 
SET ciudad = 'lima' 
WHERE LOWER(ciudad) IN ('cochabamba', 'santacruz', 'lapaz', 'elalto', 'sucre', 'tarija', 'oruro', 'potosi', 'trinidad', 'cobija');
