ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS groups_active_owner ON public.groups(user_auth_id) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.guard_one_active_owned_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.user_auth_id IS NOT NULL AND NEW.archived_at IS NULL AND EXISTS(
  SELECT 1 FROM public.groups g WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id
 ) THEN RAISE EXCEPTION 'Tu plan incluye un grupo activo. Archívalo antes de crear otro.' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_one_active_owned_group ON public.groups;
CREATE TRIGGER guard_one_active_owned_group BEFORE INSERT OR UPDATE OF user_auth_id,archived_at ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.guard_one_active_owned_group();

CREATE OR REPLACE FUNCTION public.archive_owned_group(p_group uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE archived timestamptz;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'No tienes permiso para archivar grupos' USING ERRCODE='42501'; END IF;
 UPDATE public.groups SET archived_at=coalesce(archived_at,clock_timestamp())
 WHERE id=p_group AND user_auth_id=auth.uid() RETURNING archived_at INTO archived;
 IF archived IS NULL THEN RAISE EXCEPTION 'Solo el propietario puede archivar este grupo' USING ERRCODE='42501'; END IF;
 RETURN archived;
END $$;

CREATE OR REPLACE FUNCTION public.guard_archived_group_round() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.group_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.groups WHERE id=NEW.group_id AND archived_at IS NOT NULL) THEN
  RAISE EXCEPTION 'El grupo está archivado y no admite nuevas partidas' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_archived_group_round ON public.golf_rounds;
CREATE TRIGGER guard_archived_group_round BEFORE INSERT OR UPDATE OF group_id ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_archived_group_round();

CREATE OR REPLACE FUNCTION public.guard_archived_group_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_group uuid;
BEGIN
 target_group:=CASE WHEN TG_OP='DELETE' THEN OLD.group_id ELSE NEW.group_id END;
 IF target_group IS NOT NULL AND EXISTS(SELECT 1 FROM public.groups WHERE id=target_group AND archived_at IS NOT NULL) THEN
  RAISE EXCEPTION 'El grupo está archivado y solo se puede consultar' USING ERRCODE='42501';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['players','group_members','group_invitations','golf_rounds'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS guard_archived_group_write ON public.%I',table_name);
  EXECUTE format('CREATE TRIGGER guard_archived_group_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_archived_group_write()',table_name);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.delete_archived_owned_group(p_group uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.groups; table_name text;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'No tienes permiso para eliminar grupos' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(20261021,130000);
 SELECT * INTO target FROM public.groups WHERE id=p_group FOR UPDATE;
 IF target.id IS NULL OR target.user_auth_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solo el propietario puede eliminar este grupo' USING ERRCODE='42501'; END IF;
 IF target.archived_at IS NULL THEN RAISE EXCEPTION 'Archiva el grupo antes de eliminarlo definitivamente'; END IF;
 -- Application guards protect ordinary edits. FK constraint triggers remain
 -- enabled and perform the complete cascade while these tables are locked.
 FOREACH table_name IN ARRAY ARRAY['players','group_members','group_invitations','golf_rounds','round_players','round_scores','archived_rounds','handicap_adjustments'] LOOP
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER',table_name);
 END LOOP;
 DELETE FROM public.groups WHERE id=p_group;
 FOREACH table_name IN ARRAY ARRAY['handicap_adjustments','archived_rounds','round_scores','round_players','golf_rounds','group_invitations','group_members','players'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER',table_name);
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.archive_owned_group(uuid),public.delete_archived_owned_group(uuid),public.guard_archived_group_round(),public.guard_archived_group_write(),public.guard_one_active_owned_group() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.archive_owned_group(uuid),public.delete_archived_owned_group(uuid) TO authenticated;
