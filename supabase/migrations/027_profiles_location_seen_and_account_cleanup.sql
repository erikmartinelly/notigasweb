-- 027_profiles_location_seen_and_account_cleanup.sql

-- ============================================================
-- 1. PERFIL PERSISTENTE
-- Auth = identidad
-- profiles = datos permanentes del usuario
-- choferes_habilitados = datos operativos del repartidor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    nombre text,
    apellido text,
    telefono text,

    role text NOT NULL DEFAULT 'vecino'
        CHECK (role IN ('vecino', 'repartidor', 'admin')),

    ciudad text NOT NULL DEFAULT 'santacruz',

    direccion text,
    latitude double precision,
    longitude double precision,
    barrio_otb text,
    location_updated_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_ciudad
ON public.profiles(ciudad);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles select own or admin" ON public.profiles;

CREATE POLICY "Profiles select own or admin"
ON public.profiles
FOR SELECT
USING (
    auth.uid() = id
    OR is_admin_email()
);

DROP POLICY IF EXISTS "Profiles insert own" ON public.profiles;

CREATE POLICY "Profiles insert own"
ON public.profiles
FOR INSERT
WITH CHECK (
    auth.uid() = id
    AND NOT is_banned()
);

DROP POLICY IF EXISTS "Profiles update own or admin" ON public.profiles;

CREATE POLICY "Profiles update own or admin"
ON public.profiles
FOR UPDATE
USING (
    auth.uid() = id
    OR is_admin_email()
)
WITH CHECK (
    auth.uid() = id
    OR is_admin_email()
);

DROP POLICY IF EXISTS "Profiles delete own or admin" ON public.profiles;

CREATE POLICY "Profiles delete own or admin"
ON public.profiles
FOR DELETE
USING (
    auth.uid() = id
    OR is_admin_email()
);


-- ============================================================
-- 2. CREAR PROFILE AUTOMÁTICAMENTE AL REGISTRAR AUTH USER
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    INSERT INTO public.profiles (
        id,
        nombre,
        ciudad
    )
    VALUES (
        NEW.id,

        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            split_part(COALESCE(NEW.email, ''), '@', 1)
        ),

        COALESCE(
            NULLIF(
                NEW.raw_user_meta_data ->> 'ciudad',
                ''
            ),
            'santacruz'
        )
    )

    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created
ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();


-- ============================================================
-- 3. PEDIDOS VISTOS
--
-- IMPORTANTE:
-- visto NO significa asignado.
-- visto NO cambia estado.
-- visto NO elimina el pedido del grupo.
-- ============================================================

ALTER TABLE public.pedidos
ADD COLUMN IF NOT EXISTS visto boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pedidos_ciudad_categoria_estado_visto
ON public.pedidos(
    ciudad,
    categoria,
    estado,
    visto,
    created_at DESC
);


-- ============================================================
-- 4. MARCAR PEDIDO COMO VISTO
--
-- Solamente un repartidor habilitado de la misma
-- ciudad/categoría puede marcarlo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_mark_order_seen(
    p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE
    v_driver record;
    v_order record;

BEGIN

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;


    SELECT *
    INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = auth.uid()::text
      AND NOT EXISTS (
          SELECT 1
          FROM public.usuarios_baneados b
          WHERE b.user_id = auth.uid()::text
      )
    LIMIT 1;


    IF NOT FOUND THEN
        RAISE EXCEPTION 'Repartidor no habilitado';
    END IF;


    SELECT
        id,
        ciudad,
        categoria,
        estado
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;


    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;


    IF v_order.estado <> 'pendiente' THEN
        RETURN;
    END IF;


    IF
        lower(trim(v_driver.ciudad))
            <> lower(trim(v_order.ciudad))
        OR
        lower(trim(v_driver.categoria))
            <> lower(trim(v_order.categoria))
    THEN
        RAISE EXCEPTION
            'Pedido fuera de la zona o categoría del repartidor';
    END IF;


    UPDATE public.pedidos
    SET visto = true
    WHERE id = p_order_id
      AND estado = 'pendiente';

END;
$$;

GRANT EXECUTE
ON FUNCTION public.rpc_mark_order_seen(uuid)
TO authenticated;


-- ============================================================
-- 5. ELIMINACIÓN COMPLETA DE CUENTA
--
-- Esta función es la autoridad única.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$

DECLARE
    v_user_id uuid := auth.uid();
    v_user_text text;

BEGIN

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION
            'No autorizado. Debes iniciar sesión para eliminar tu cuenta.';
    END IF;

    v_user_text := v_user_id::text;


    DELETE FROM public.votos_registro
    WHERE user_id = v_user_text;


    DELETE FROM public.comentarios_avisos
    WHERE user_id = v_user_text;


    DELETE FROM public.comentarios_avisos
    WHERE aviso_id IN (
        SELECT id
        FROM public.avisos
        WHERE user_id = v_user_text
    );


    DELETE FROM public.avisos
    WHERE user_id = v_user_text;


    DELETE FROM public.pedidos
    WHERE user_id = v_user_text
       OR driver_id = v_user_text;


    DELETE FROM public.rutas_repartidores
    WHERE user_id = v_user_text;


    DELETE FROM public.choferes_habilitados
    WHERE user_id = v_user_text;


    DELETE FROM public.usuarios_baneados
    WHERE user_id = v_user_text;


    DELETE FROM public.denuncias
    WHERE denunciante_id = v_user_text
       OR denunciado_id = v_user_text;


    DELETE FROM public.profiles
    WHERE id = v_user_id;


    DELETE FROM auth.users
    WHERE id = v_user_id;

END;
$$;

GRANT EXECUTE
ON FUNCTION public.delete_user_account()
TO authenticated;
