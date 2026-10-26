BEGIN;

CREATE OR REPLACE FUNCTION public.guard_guest_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players; r public.golf_rounds; v_slope numeric;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.is_guest THEN
   SELECT * INTO r FROM public.golf_rounds WHERE id=OLD.round_id;
   IF r.group_id IS NULL THEN SELECT group_id INTO r.group_id FROM public.players WHERE id=OLD.player_id; END IF;
   PERFORM public.require_group_result_writer(r.group_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' THEN
   IF (NEW.is_guest,NEW.round_id,NEW.player_id) IS DISTINCT FROM (OLD.is_guest,OLD.round_id,OLD.player_id) THEN
     RAISE EXCEPTION 'La condición y la identidad de la participación son inmutables';
   END IF;
   IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT (
     (current_setting('app.account_deletion',true)='on' AND NEW.user_id IS NULL)
     OR (
       current_setting('app.quick_round_consent',true)='on'
       AND NOT OLD.is_guest AND NOT NEW.is_guest
       AND NEW.user_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.quick_round_participation_invitations i
         JOIN public.golf_rounds gr ON gr.id=i.round_id
         WHERE i.round_player_id=OLD.id
           AND i.invited_user_id=NEW.user_id
           AND i.status='accepted'
           AND gr.group_id IS NULL
       )
     )
   ) THEN
     RAISE EXCEPTION 'La condición y la identidad de la participación son inmutables';
   END IF;
   RETURN NEW;
 END IF;
 SELECT * INTO r FROM public.golf_rounds WHERE id=NEW.round_id FOR UPDATE;
 IF r.group_id IS NULL THEN NEW.is_guest:=false; RETURN NEW; END IF;
 SELECT * INTO p FROM public.players WHERE id=NEW.player_id FOR SHARE;
 IF p.id IS NULL OR p.group_id IS DISTINCT FROM r.group_id THEN RAISE EXCEPTION 'El jugador no pertenece a este grupo'; END IF;
 IF p.is_guest THEN
   PERFORM public.require_group_result_writer(r.group_id);
   IF r.status<>'active' THEN RAISE EXCEPTION 'La partida no está disponible en este grupo'; END IF;
   IF EXISTS(SELECT 1 FROM public.round_players WHERE round_id=r.id AND player_id=p.id) THEN RAISE EXCEPTION 'El jugador ya está en la partida'; END IF;
   IF EXISTS(SELECT 1 FROM public.round_players rp JOIN public.golf_rounds gr ON gr.id=rp.round_id WHERE rp.player_id=p.id AND gr.status='active' AND gr.id<>r.id AND gr.group_id=r.group_id) THEN
     RAISE EXCEPTION 'El jugador está en otra partida activa';
   END IF;
   IF (SELECT count(*) FROM public.round_players WHERE round_id=r.id)>=(CASE r.game_mode WHEN 'match' THEN 2 WHEN 'sindicato' THEN 3 ELSE 4 END) THEN
     RAISE EXCEPTION 'La modalidad no admite más jugadores';
   END IF;
 END IF;
 NEW.is_guest:=p.is_guest;
 IF p.auth_user_id IS NULL THEN
   SELECT CASE WHEN r.num_holes=18 THEN t.slope_18 WHEN r.holes_range='10-18' THEN t.slope_9_ii ELSE t.slope_9_i END INTO v_slope FROM public.tees t WHERE t.id=r.tee_id;
   v_slope:=CASE WHEN r.use_slope THEN coalesce(r.manual_slope,v_slope,113) ELSE 113 END;
   NEW.name:=p.name;
   NEW.user_id:=NULL;
   NEW.exact_handicap:=p.exact_handicap; NEW.exact_handicap_18:=p.exact_handicap;
   NEW.playing_handicap:=round(p.exact_handicap*(CASE WHEN r.num_holes=18 THEN 2 ELSE 1 END)*v_slope/113);
 END IF;
 RETURN NEW;
END $$;

COMMIT;
