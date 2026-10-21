BEGIN;

-- Una ficha sin cuenta dentro de un grupo es un miembro del grupo. La marca
-- is_guest queda reservada para participaciones puntuales ajenas al roster.
ALTER TABLE public.players DISABLE TRIGGER USER;
ALTER TABLE public.round_players DISABLE TRIGGER USER;
UPDATE public.players SET is_guest=false WHERE group_id IS NOT NULL AND auth_user_id IS NULL AND is_guest;
UPDATE public.round_players rp SET is_guest=false
WHERE rp.is_guest AND EXISTS (
 SELECT 1 FROM public.players p WHERE p.id=rp.player_id AND p.group_id IS NOT NULL AND p.auth_user_id IS NULL
);
ALTER TABLE public.round_players ENABLE TRIGGER USER;
ALTER TABLE public.players ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.add_group_guest_player(
  p_group uuid,
  p_name text,
  p_handicap_18 numeric
) RETURNS public.players
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_player public.players; v_handicap_9 numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(20261021,1500);
  PERFORM public.require_group_manager(p_group);
  IF nullif(trim(p_name),'') IS NULL THEN RAISE EXCEPTION 'Indica el nombre del jugador'; END IF;
  IF p_handicap_18 IS NULL OR p_handicap_18<0 OR p_handicap_18>54 OR p_handicap_18::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Indica un hándicap de 18 hoyos entre 0 y 54';
  END IF;
  IF EXISTS(SELECT 1 FROM public.players WHERE group_id=p_group AND lower(name)=lower(trim(p_name))) THEN
    RAISE EXCEPTION 'Ya existe un jugador con ese nombre en el grupo';
  END IF;
  IF (SELECT count(*) FROM public.players WHERE group_id=p_group)>=20 THEN RAISE EXCEPTION 'El grupo ya ha alcanzado el máximo de jugadores'; END IF;
  v_handicap_9:=round(p_handicap_18/2);
  INSERT INTO public.players(group_id,name,exact_handicap,exact_handicap_18,playing_handicap,is_guest)
  VALUES(p_group,trim(p_name),v_handicap_9,v_handicap_9,v_handicap_9,false) RETURNING * INTO v_player;
  RETURN v_player;
END $$;

CREATE OR REPLACE FUNCTION public.invite_group_user_once(p_group uuid,p_user uuid,p_message text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_status text;
BEGIN
 PERFORM pg_advisory_xact_lock(20261021,1700);
 PERFORM public.require_group_manager(p_group);
 SELECT status INTO v_status FROM public.group_invitations WHERE group_id=p_group AND invited_user_id=p_user FOR UPDATE;
 IF v_status IS NOT NULL THEN RETURN v_status; END IF;
 IF EXISTS(SELECT 1 FROM public.group_members WHERE group_id=p_group AND user_id=p_user) THEN RETURN 'accepted'; END IF;
 INSERT INTO public.group_invitations(group_id,invited_user_id,invited_by,status,message)
 VALUES(p_group,p_user,auth.uid(),'pending',p_message);
 RETURN 'pending';
END $$;

REVOKE ALL ON FUNCTION public.invite_group_user_once(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invite_group_user_once(uuid,uuid,text) TO authenticated;

COMMIT;
