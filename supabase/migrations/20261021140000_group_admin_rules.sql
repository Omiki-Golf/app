CREATE OR REPLACE FUNCTION public.archive_owned_group(p_group uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE archived timestamptz;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'No tienes permiso para archivar grupos' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.groups g WHERE g.id=p_group AND (g.user_auth_id=auth.uid() OR EXISTS(
  SELECT 1 FROM public.group_members m WHERE m.group_id=g.id AND m.user_id=auth.uid() AND m.role='admin'
 ))) THEN RAISE EXCEPTION 'Solo el propietario o un administrador puede archivar este grupo' USING ERRCODE='42501'; END IF;
 UPDATE public.groups SET archived_at=coalesce(archived_at,clock_timestamp()) WHERE id=p_group RETURNING archived_at INTO archived;
 RETURN archived;
END $$;

CREATE OR REPLACE FUNCTION public.delete_archived_owned_group(p_group uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.groups; table_name text;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'No tienes permiso para eliminar grupos' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(20261021,130000);
 SELECT * INTO target FROM public.groups WHERE id=p_group FOR UPDATE;
 IF target.id IS NULL OR NOT (target.user_auth_id=auth.uid() OR EXISTS(
  SELECT 1 FROM public.group_members m WHERE m.group_id=p_group AND m.user_id=auth.uid() AND m.role='admin'
 )) THEN RAISE EXCEPTION 'Solo el propietario o un administrador puede eliminar este grupo' USING ERRCODE='42501'; END IF;
 IF target.archived_at IS NULL THEN RAISE EXCEPTION 'Archiva el grupo antes de eliminarlo definitivamente'; END IF;
 FOREACH table_name IN ARRAY ARRAY['players','group_members','group_invitations','golf_rounds','round_players','round_scores','archived_rounds','handicap_adjustments'] LOOP
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER',table_name);
 END LOOP;
 DELETE FROM public.groups WHERE id=p_group;
 FOREACH table_name IN ARRAY ARRAY['handicap_adjustments','archived_rounds','round_scores','round_players','golf_rounds','group_invitations','group_members','players'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER',table_name);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_single_delegated_group_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid;
BEGIN
 IF NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW; END IF;
 SELECT user_auth_id INTO owner_id FROM public.groups WHERE id=OLD.group_id;
 IF auth.uid() IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Solo el creador puede cambiar administradores' USING ERRCODE='42501'; END IF;
 IF NEW.user_id=owner_id AND NEW.role<>'admin' THEN RAISE EXCEPTION 'El creador siempre es administrador'; END IF;
 IF NEW.role='admin' AND NEW.user_id<>owner_id AND EXISTS(
  SELECT 1 FROM public.group_members m WHERE m.group_id=NEW.group_id AND m.user_id<>owner_id AND m.user_id<>NEW.user_id AND m.role='admin'
 ) THEN RAISE EXCEPTION 'El grupo solo puede tener un administrador además del creador'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS z_guard_single_delegated_group_admin ON public.group_members;
CREATE TRIGGER z_guard_single_delegated_group_admin BEFORE UPDATE OF role ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.guard_single_delegated_group_admin();
REVOKE ALL ON FUNCTION public.guard_single_delegated_group_admin() FROM PUBLIC,anon,authenticated;
