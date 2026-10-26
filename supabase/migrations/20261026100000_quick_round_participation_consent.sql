BEGIN;

CREATE TABLE public.quick_round_participation_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.golf_rounds(id) ON DELETE CASCADE,
  round_player_id uuid NOT NULL UNIQUE REFERENCES public.round_players(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(round_id, invited_user_id)
);
CREATE INDEX quick_round_invitee_status ON public.quick_round_participation_invitations(invited_user_id,status,created_at DESC);
ALTER TABLE public.quick_round_participation_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quick_round_participation_invitations FROM PUBLIC,anon,authenticated;

-- Existing UUID-linked participations predate consent. Keep their history visible.
INSERT INTO public.quick_round_participation_invitations(round_id,round_player_id,invited_user_id,invited_by,status,responded_at)
SELECT rp.round_id,rp.id,rp.user_id,r.user_id,'accepted',coalesce(r.completed_at,r.updated_at,r.created_at)
FROM public.round_players rp JOIN public.golf_rounds r ON r.id=rp.round_id
WHERE r.group_id IS NULL AND rp.user_id IS NOT NULL AND rp.user_id<>r.user_id
ON CONFLICT DO NOTHING;

CREATE FUNCTION public.add_registered_quick_round_player(p_round uuid,p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.golf_rounds; p public.user_profiles; rp public.round_players; v_slope numeric:=113; v_hcp9 numeric;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN RAISE EXCEPTION 'No tienes permiso para añadir jugadores' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.golf_rounds WHERE id=p_round FOR UPDATE;
 IF r.id IS NULL OR r.group_id IS NOT NULL OR r.user_id<>auth.uid() OR r.status<>'active' THEN RAISE EXCEPTION 'Solo el creador puede añadir jugadores a una partida rápida activa' USING ERRCODE='42501'; END IF;
 IF p_user=auth.uid() THEN RAISE EXCEPTION 'Usa Añadirme a la partida'; END IF;
 SELECT * INTO p FROM public.user_profiles WHERE user_id=p_user;
 IF p.id IS NULL THEN RAISE EXCEPTION 'La cuenta ya no está disponible'; END IF;
 IF EXISTS(SELECT 1 FROM public.quick_round_participation_invitations WHERE round_id=p_round AND invited_user_id=p_user) OR
    EXISTS(SELECT 1 FROM public.round_players WHERE round_id=p_round AND user_id=p_user) THEN RAISE EXCEPTION 'Este jugador ya está añadido o invitado'; END IF;
 IF r.use_slope THEN
  SELECT CASE WHEN r.num_holes=18 THEN t.slope_18 WHEN r.holes_range='10-18' THEN t.slope_9_ii ELSE t.slope_9_i END INTO v_slope FROM public.tees t WHERE t.id=r.tee_id;
  v_slope:=coalesce(r.manual_slope,v_slope,113);
 END IF;
 v_hcp9:=round((coalesce(p.exact_handicap,0)/2)::numeric,1);
 INSERT INTO public.round_players(round_id,user_id,name,exact_handicap,exact_handicap_18,playing_handicap)
 VALUES(p_round,NULL,coalesce(nullif(p.nick,''),nullif(p.display_name,''),'Jugador'),v_hcp9,v_hcp9,
        round((CASE WHEN r.num_holes=18 THEN coalesce(p.exact_handicap,0) ELSE v_hcp9 END)*v_slope/113)) RETURNING * INTO rp;
 INSERT INTO public.quick_round_participation_invitations(round_id,round_player_id,invited_user_id,invited_by)
 VALUES(p_round,rp.id,p_user,auth.uid());
 RETURN to_jsonb(rp)||jsonb_build_object('participation_status','pending');
END $$;

CREATE FUNCTION public.list_my_quick_round_invitations() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(i)||jsonb_build_object(
   'inviter_nick',coalesce(nullif(p.nick,''),nullif(p.display_name,''),'Otro jugador'),
   'course_name',coalesce(c.name,'Campo de golf'),'played_at',r.created_at)
 FROM public.quick_round_participation_invitations i
 JOIN public.golf_rounds r ON r.id=i.round_id
 LEFT JOIN public.user_profiles p ON p.user_id=i.invited_by
 LEFT JOIN public.golf_courses c ON c.id=r.course_id
 WHERE i.invited_user_id=auth.uid() AND i.status='pending'
 ORDER BY i.created_at DESC
$$;

CREATE FUNCTION public.respond_quick_round_invitation(p_invitation uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.quick_round_participation_invitations;
BEGIN
 IF auth.uid() IS NULL OR public.is_app_user_read_only() OR p_status NOT IN ('accepted','rejected') THEN RAISE EXCEPTION 'Respuesta no válida' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.quick_round_participation_invitations WHERE id=p_invitation FOR UPDATE;
 IF i.id IS NULL OR i.invited_user_id<>auth.uid() OR i.status<>'pending' THEN RAISE EXCEPTION 'La invitación ya no está disponible' USING ERRCODE='42501'; END IF;
 UPDATE public.quick_round_participation_invitations SET status=p_status,responded_at=now() WHERE id=i.id;
 IF p_status='accepted' THEN
  PERFORM set_config('app.quick_round_consent','on',true);
  UPDATE public.round_players SET user_id=auth.uid() WHERE id=i.round_player_id AND round_id=i.round_id AND user_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'La participación ya no está disponible'; END IF;
 END IF;
END $$;

CREATE FUNCTION public.count_my_quick_round_invitations() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT count(*) FROM public.quick_round_participation_invitations WHERE invited_user_id=auth.uid() AND status='pending'
$$;

CREATE FUNCTION public.list_my_quick_rounds(p_statuses text[]) RETURNS SETOF public.golf_rounds
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT r.* FROM public.golf_rounds r
 WHERE r.group_id IS NULL AND r.admin_withdrawn_at IS NULL AND r.status=ANY(p_statuses)
 AND (r.user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.round_players rp WHERE rp.round_id=r.id AND rp.user_id=auth.uid()))
 ORDER BY r.created_at DESC
$$;

CREATE FUNCTION public.guard_quick_round_player_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.user_id IS DISTINCT FROM OLD.user_id AND EXISTS(SELECT 1 FROM public.golf_rounds r WHERE r.id=OLD.round_id AND r.group_id IS NULL)
    AND current_setting('app.quick_round_consent',true)<>'on' AND current_setting('app.account_deletion',true)<>'on' THEN
  RAISE EXCEPTION 'La cuenta vinculada solo puede aceptar su participación' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_quick_round_player_identity BEFORE UPDATE OF user_id ON public.round_players FOR EACH ROW EXECUTE FUNCTION public.guard_quick_round_player_identity();

REVOKE ALL ON FUNCTION public.add_registered_quick_round_player(uuid,uuid),public.list_my_quick_round_invitations(),public.respond_quick_round_invitation(uuid,text),public.count_my_quick_round_invitations(),public.list_my_quick_rounds(text[]),public.guard_quick_round_player_identity() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_registered_quick_round_player(uuid,uuid),public.list_my_quick_round_invitations(),public.respond_quick_round_invitation(uuid,text),public.count_my_quick_round_invitations(),public.list_my_quick_rounds(text[]) TO authenticated;

COMMIT;
