BEGIN;

ALTER TABLE public.votos_registro
  ADD COLUMN IF NOT EXISTS valor smallint;
UPDATE public.votos_registro SET valor = 1 WHERE valor IS NULL;
ALTER TABLE public.votos_registro
  ALTER COLUMN valor SET DEFAULT 1,
  ALTER COLUMN valor SET NOT NULL;
ALTER TABLE public.votos_registro DROP CONSTRAINT IF EXISTS votos_registro_valor_check;
ALTER TABLE public.votos_registro
  ADD CONSTRAINT votos_registro_valor_check CHECK (valor IN (-1, 1));

DELETE FROM public.votos_registro vr
WHERE (vr.tipo_entidad = 'aviso' AND NOT EXISTS (SELECT 1 FROM public.avisos a WHERE a.id = vr.entidad_id))
   OR (vr.tipo_entidad = 'comentario' AND NOT EXISTS (SELECT 1 FROM public.comentarios_avisos c WHERE c.id = vr.entidad_id));

CREATE OR REPLACE FUNCTION private.sync_forum_vote_ledger_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NULLIF(BTRIM(NEW.user_id), '') IS NOT NULL THEN
      INSERT INTO public.votos_registro(user_id, entidad_id, tipo_entidad, valor)
      VALUES (NEW.user_id, NEW.id, TG_ARGV[0], 1)
      ON CONFLICT (user_id, entidad_id) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  DELETE FROM public.votos_registro
  WHERE entidad_id = OLD.id AND tipo_entidad = TG_ARGV[0];
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_forum_vote_ledger_internal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_aviso_votes_insert ON public.avisos;
CREATE TRIGGER trg_sync_aviso_votes_insert
AFTER INSERT ON public.avisos
FOR EACH ROW EXECUTE FUNCTION private.sync_forum_vote_ledger_internal('aviso');
DROP TRIGGER IF EXISTS trg_sync_aviso_votes_delete ON public.avisos;
CREATE TRIGGER trg_sync_aviso_votes_delete
AFTER DELETE ON public.avisos
FOR EACH ROW EXECUTE FUNCTION private.sync_forum_vote_ledger_internal('aviso');

DROP TRIGGER IF EXISTS trg_sync_comentario_votes_insert ON public.comentarios_avisos;
CREATE TRIGGER trg_sync_comentario_votes_insert
AFTER INSERT ON public.comentarios_avisos
FOR EACH ROW EXECUTE FUNCTION private.sync_forum_vote_ledger_internal('comentario');
DROP TRIGGER IF EXISTS trg_sync_comentario_votes_delete ON public.comentarios_avisos;
CREATE TRIGGER trg_sync_comentario_votes_delete
AFTER DELETE ON public.comentarios_avisos
FOR EACH ROW EXECUTE FUNCTION private.sync_forum_vote_ledger_internal('comentario');

CREATE OR REPLACE FUNCTION public.incrementar_votos_aviso(aviso_id uuid, incremento integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_user_id text := auth.uid()::text;
  v_new smallint := CASE WHEN incremento > 0 THEN 1 ELSE -1 END;
  v_old smallint;
  v_score integer;
BEGIN
  IF v_user_id IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF incremento = 0 THEN RAISE EXCEPTION 'Voto inválido'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Usuario suspendido'; END IF;

  PERFORM 1 FROM public.avisos WHERE id = aviso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aviso no encontrado'; END IF;

  SELECT valor INTO v_old FROM public.votos_registro
  WHERE user_id = v_user_id AND entidad_id = aviso_id AND tipo_entidad = 'aviso'
  FOR UPDATE;

  IF FOUND THEN
    IF v_old = v_new THEN RETURN; END IF;
    UPDATE public.votos_registro SET valor = v_new, created_at = now()
    WHERE user_id = v_user_id AND entidad_id = aviso_id AND tipo_entidad = 'aviso';
  ELSE
    INSERT INTO public.votos_registro(user_id, entidad_id, tipo_entidad, valor)
    VALUES (v_user_id, aviso_id, 'aviso', v_new);
  END IF;

  SELECT GREATEST(0, COALESCE(SUM(valor), 0))::integer INTO v_score
  FROM public.votos_registro WHERE entidad_id = aviso_id AND tipo_entidad = 'aviso';
  UPDATE public.avisos SET votos = v_score WHERE id = aviso_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.incrementar_votos_comentario(comentario_id uuid, incremento integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_user_id text := auth.uid()::text;
  v_new smallint := CASE WHEN incremento > 0 THEN 1 ELSE -1 END;
  v_old smallint;
  v_score integer;
BEGIN
  IF v_user_id IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF incremento = 0 THEN RAISE EXCEPTION 'Voto inválido'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Usuario suspendido'; END IF;

  PERFORM 1 FROM public.comentarios_avisos WHERE id = comentario_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comentario no encontrado'; END IF;

  SELECT valor INTO v_old FROM public.votos_registro
  WHERE user_id = v_user_id AND entidad_id = comentario_id AND tipo_entidad = 'comentario'
  FOR UPDATE;

  IF FOUND THEN
    IF v_old = v_new THEN RETURN; END IF;
    UPDATE public.votos_registro SET valor = v_new, created_at = now()
    WHERE user_id = v_user_id AND entidad_id = comentario_id AND tipo_entidad = 'comentario';
  ELSE
    INSERT INTO public.votos_registro(user_id, entidad_id, tipo_entidad, valor)
    VALUES (v_user_id, comentario_id, 'comentario', v_new);
  END IF;

  SELECT GREATEST(0, COALESCE(SUM(valor), 0))::integer INTO v_score
  FROM public.votos_registro WHERE entidad_id = comentario_id AND tipo_entidad = 'comentario';
  UPDATE public.comentarios_avisos SET votos = v_score WHERE id = comentario_id;
END;
$$;

REVOKE ALL ON FUNCTION public.incrementar_votos_aviso(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.incrementar_votos_comentario(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_aviso(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_comentario(uuid, integer) TO authenticated, service_role;

COMMIT;
