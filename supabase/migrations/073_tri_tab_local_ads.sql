-- =============================================================================
-- 073_tri_tab_local_ads.sql
-- Propaganda Local Independiente para las 3 Pestañas (Mapa, Repartidores, Avisos)
-- =============================================================================

BEGIN;

-- 1. Añadir columna 'posicion' para clasificar la propaganda por pestaña
ALTER TABLE public.anuncios_globales 
ADD COLUMN IF NOT EXISTS posicion TEXT NOT NULL DEFAULT 'mapa';

-- 2. Asegurar restricción de validación para las 3 posiciones válidas
ALTER TABLE public.anuncios_globales 
DROP CONSTRAINT IF EXISTS chk_anuncios_posicion;

ALTER TABLE public.anuncios_globales 
ADD CONSTRAINT chk_anuncios_posicion 
CHECK (posicion IN ('mapa', 'repartidores', 'avisos'));

-- 3. Crear índice compuesto para búsquedas ultra-rápidas por ciudad y pestaña
CREATE INDEX IF NOT EXISTS idx_anuncios_ciudad_posicion 
ON public.anuncios_globales (ciudad, posicion, activo);

-- 4. Permisos y RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anuncios_globales TO authenticated;
GRANT SELECT ON public.anuncios_globales TO anon;
ALTER TABLE public.anuncios_globales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anuncios_globales' AND policyname = 'Anuncios Public SELECT') THEN
        DROP POLICY "Anuncios Public SELECT" ON public.anuncios_globales;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anuncios_globales' AND policyname = 'Anuncios Admin ALL') THEN
        DROP POLICY "Anuncios Admin ALL" ON public.anuncios_globales;
    END IF;
END $$;

CREATE POLICY "Anuncios Public SELECT" 
ON public.anuncios_globales 
FOR SELECT 
TO public 
USING (true);

CREATE POLICY "Anuncios Admin ALL" 
ON public.anuncios_globales 
FOR ALL 
TO authenticated 
USING (public.is_admin_email()) 
WITH CHECK (public.is_admin_email());

-- 5. Actualizar función RPC para guardar propaganda local por pestaña
CREATE OR REPLACE FUNCTION public.rpc_save_local_ad(
    p_titulo TEXT,
    p_descripcion TEXT,
    p_url TEXT,
    p_image_url TEXT,
    p_ciudad TEXT,
    p_activo BOOLEAN DEFAULT true,
    p_posicion TEXT DEFAULT 'mapa'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
    v_norm_pos := LOWER(TRIM(COALESCE(p_posicion, 'mapa')));
    IF v_norm_pos NOT IN ('mapa', 'repartidores', 'avisos') THEN
        v_norm_pos := 'mapa';
    END IF;

    SELECT id INTO v_existing_id
    FROM public.anuncios_globales
    WHERE ciudad = v_norm_ciudad AND posicion = v_norm_pos
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        UPDATE public.anuncios_globales
        SET titulo = COALESCE(NULLIF(TRIM(p_titulo), ''), 'Auspiciador Oficial NOTIGAS'),
            descripcion = COALESCE(p_descripcion, 'Propaganda Local'),
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
        INSERT INTO public.anuncios_globales (titulo, descripcion, url, image_url, ciudad, posicion, activo, created_at)
        VALUES (
            COALESCE(NULLIF(TRIM(p_titulo), ''), 'Auspiciador Oficial NOTIGAS'),
            COALESCE(p_descripcion, 'Propaganda Local'),
            NULLIF(TRIM(p_url), ''),
            CASE WHEN p_image_url = '__REMOVE__' THEN NULL ELSE NULLIF(TRIM(p_image_url), '') END,
            v_norm_ciudad,
            v_norm_pos,
            COALESCE(p_activo, true),
            now()
        )
        RETURNING id INTO v_ad_id;
    END IF;

    -- Fijar configuración a modo local
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
$$;

GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

-- Registrar migración
INSERT INTO supabase_migrations.schema_migrations(version, name) 
VALUES ('073', 'tri_tab_local_ads') 
ON CONFLICT (version) DO NOTHING;

COMMIT;
