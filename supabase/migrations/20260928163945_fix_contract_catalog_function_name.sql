-- ============================================================================
-- Corrige una errata en rpc_public_schema_contract()
-- ----------------------------------------------------------------------------
-- En 20260928163919 la funcion se creo llamando a
--   public.notigas_categorias_activas()
-- que no existe; el nombre real del catalogo vigente es
--   public.notigas_catalogo_categorias()
--
-- plpgsql no resuelve los nombres de funcion al compilar el cuerpo, asi que la
-- migracion se aplico sin quejarse y el error solo se manifesto al ejecutar
-- el contrato. Aqui se restaura la llamada correcta y se comprueba que el
-- contrato responde con las cinco categorias de reciclaje.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_public_schema_contract()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'categorias',            (SELECT jsonb_agg(jsonb_build_object(
                                 'codigo', c.codigo, 'etiqueta', c.etiqueta,
                                 'grupo', c.grupo, 'tipo_solicitud', c.tipo_solicitud)
                                 ORDER BY c.codigo)
                               FROM public.notigas_catalogo_categorias() c),
    'tipos_de_solicitud',    jsonb_build_array('recogida'),
    'suscripciones_recarga', true,
    'version',               '20260927_bolivia_solo_reciclaje_v1'
  ) INTO r;
  RETURN r;
END;
$$;

DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.rpc_public_schema_contract();

  IF (v->>'suscripciones_recarga')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'el contrato publico no declara suscripciones_recarga';
  END IF;

  IF jsonb_array_length(v->'categorias') <> 5 THEN
    RAISE EXCEPTION 'el contrato anuncia % categorias, se esperaban 5',
      jsonb_array_length(v->'categorias');
  END IF;
END $$;
