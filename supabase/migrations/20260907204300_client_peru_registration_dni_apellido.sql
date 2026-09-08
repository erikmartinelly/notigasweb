-- 095_client_peru_registration_dni_apellido.sql
-- Adición de DNI y aseguramiento de Apellido en public.profiles para clientes de Perú
-- Actualización de triggers de integridad y bootstrap de nuevos usuarios

-- 1. Agregar columna dni a public.profiles si no existe
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dni text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apellido text DEFAULT '';

-- 2. Actualizar función guard_profile_field_integrity()
CREATE OR REPLACE FUNCTION public.guard_profile_field_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $
BEGIN
  NEW.nombre := LEFT(REGEXP_REPLACE(COALESCE(NEW.nombre, ''), '<[^>]*>', '', 'g'), 120);
  NEW.apellido := LEFT(REGEXP_REPLACE(COALESCE(NEW.apellido, ''), '<[^>]*>', '', 'g'), 120);
  NEW.dni := LEFT(REGEXP_REPLACE(COALESCE(NEW.dni, ''), '[^0-9]', '', 'g'), 12);
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
$;

-- 3. Actualizar función handle_new_user_profile() para extraer dni, apellido y teléfono
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $
BEGIN
    INSERT INTO public.profiles (
        id,
        nombre,
        apellido,
        telefono,
        dni,
        ciudad,
        role
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'nombre',
            NEW.raw_user_meta_data ->> 'full_name',
            split_part(COALESCE(NEW.email, ''), '@', 1),
            'Vecino'
        ),
        COALESCE(
            NEW.raw_user_meta_data ->> 'apellido',
            ''
        ),
        COALESCE(
            NEW.raw_user_meta_data ->> 'telefono',
            ''
        ),
        COALESCE(
            NEW.raw_user_meta_data ->> 'dni',
            ''
        ),
        COALESCE(
            NULLIF(LOWER(TRIM(NEW.raw_user_meta_data ->> 'ciudad')), ''),
            'lima'
        ),
        'vecino'
    )
    ON CONFLICT (id) DO UPDATE SET
        nombre = COALESCE(NULLIF(EXCLUDED.nombre, ''), public.profiles.nombre),
        apellido = COALESCE(NULLIF(EXCLUDED.apellido, ''), public.profiles.apellido),
        telefono = COALESCE(NULLIF(EXCLUDED.telefono, ''), public.profiles.telefono),
        dni = COALESCE(NULLIF(EXCLUDED.dni, ''), public.profiles.dni);

    RETURN NEW;
END;
$;
