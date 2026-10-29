-- Archived quick rounds stay read-only, but their verified creator can soft-delete them.
-- Physical deletes remain blocked so the Express quota keeps counting the round.
CREATE OR REPLACE FUNCTION public.guard_verified_round_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=public.verified_round_actor(); admin_op boolean; manager boolean;
BEGIN
  IF public.is_app_user_read_only() THEN RAISE EXCEPTION 'Cuenta en modo solo lectura' USING ERRCODE='42501'; END IF;
  IF current_setting('app.account_deletion',true)='on' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  admin_op:=current_setting('app.verified_admin_round',true)='on' AND EXISTS(
    SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid() AND status='active');
  IF admin_op THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='INSERT' THEN
    IF actor IS NULL OR NEW.user_id IS DISTINCT FROM actor OR NEW.status<>'active' THEN
      RAISE EXCEPTION 'Creador de partida no verificado' USING ERRCODE='42501';
    END IF;
    IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Creador de partida no verificado' USING ERRCODE='42501'; END IF;
    IF NEW.group_id IS NOT NULL AND NOT (auth.uid() IS NOT NULL AND
      (public.is_group_member(NEW.group_id) OR public.can_manage_group_messages(NEW.group_id))) THEN
      RAISE EXCEPTION 'No perteneces a este grupo' USING ERRCODE='42501'; END IF;
    IF auth.uid() IS NULL THEN
      IF NEW.group_id IS NOT NULL THEN RAISE EXCEPTION 'Express no puede crear partidas de grupo' USING ERRCODE='42501'; END IF;
      -- Same lock is acquired by secure claim; count and insertion are serialized.
      PERFORM 1 FROM public.express_owner_credentials WHERE owner_id=actor AND NOT retired FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Identificación Express no disponible' USING ERRCODE='42501'; END IF;
    END IF;
    IF NEW.group_id IS NULL THEN
      IF auth.uid() IS NOT NULL THEN PERFORM 1 FROM auth.users WHERE id=auth.uid() FOR UPDATE; END IF;
      -- Match effectivePlan, including a live Team trial and indefinite paid plans.
      IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_subscriptions s WHERE s.user_id=auth.uid()
        AND s.status='active' AND ((s.team_trial_ends_at IS NOT NULL AND s.team_trial_ends_at>now()) OR
          (s.plan_type IN ('player','team','premium') AND (s.current_period_end IS NULL OR s.current_period_end>now())))) THEN
        IF (SELECT count(*) FROM public.golf_rounds WHERE user_id=actor AND group_id IS NULL AND admin_withdrawn_at IS NULL)>=4 THEN
          RAISE EXCEPTION 'Has alcanzado el límite de 4 partidas Express' USING ERRCODE='42501'; END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF auth.uid() IS NOT NULL AND NEW.user_id=auth.uid()::text AND
      current_setting('app.verified_claim_owner',true)=OLD.user_id THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'El creador de la partida no se puede cambiar' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'El grupo de la partida no se puede cambiar' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'La referencia al creador no se puede cambiar' USING ERRCODE='42501'; END IF;
  manager:=OLD.group_id IS NOT NULL AND public.can_manage_group_messages(OLD.group_id);
  -- Keep established group-manager delete/archive operations; not score editing or completion.
  IF TG_OP='DELETE' AND manager THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND manager AND OLD.status IN ('active','completed') AND NEW.status IN ('deleted','archived')
    AND (to_jsonb(NEW)-ARRAY['status','updated_at'])=(to_jsonb(OLD)-ARRAY['status','updated_at']) THEN RETURN NEW; END IF;
  IF actor IS NULL OR actor IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Solo el creador verificado puede modificar la partida' USING ERRCODE='42501'; END IF;
  -- The creator may remove an archived quick round from their lists; history stays as a soft delete.
  IF TG_OP='UPDATE' AND OLD.group_id IS NULL AND OLD.status='archived' AND NEW.status='deleted' AND OLD.admin_withdrawn_at IS NULL
    AND (to_jsonb(NEW)-ARRAY['status','updated_at'])=(to_jsonb(OLD)-ARRAY['status','updated_at']) THEN RETURN NEW; END IF;
  IF OLD.admin_withdrawn_at IS NOT NULL OR OLD.status NOT IN ('active','completed') THEN RAISE EXCEPTION 'Esta partida está cerrada y solo se puede consultar' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND NOT (NEW.status=OLD.status OR (OLD.status='active' AND NEW.status='completed')
     OR (OLD.status='completed' AND NEW.status='archived') OR NEW.status='deleted') THEN
    RAISE EXCEPTION 'Cambio de estado no permitido' USING ERRCODE='42501';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
