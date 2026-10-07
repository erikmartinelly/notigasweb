-- CORRECCION: guard_solicitud_otros_insert comparaba profiles.id (uuid) con v_uid (text)
-- y ademas referenciaba profiles.activo, que no existe.
CREATE OR REPLACE FUNCTION public.guard_solicitud_otros_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS 
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF v_uid IS NULL
     OR v_uid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles WHERE id = v_uid::uuid
     ) THEN
    RAISE EXCEPTION 'Cuenta no autorizada para enviar solicitudes';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No se puede registrar una solicitud en nombre de otra cuenta';
  END IF;

  NEW.ciudad  := left(lower(trim(coalesce(NEW.ciudad, 'cochabamba'))), 80);
  NEW.detalle := left(trim(coalesce(NEW.detalle, '')), 200);

  IF char_length(NEW.detalle) < 3 THEN
    RAISE EXCEPTION 'Escribe que te gustaria que recogamos (minimo 3 caracteres)';
  END IF;

  PERFORM public.enforce_action_rate_limit('solicitud_otros', 5, 3600);

  RETURN NEW;
END;
;
