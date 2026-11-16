-- Las fichas de cuentas eliminadas se conservan para el historial, pero no
-- vuelven a ofrecerse como jugadores disponibles en partidas nuevas.
BEGIN;

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS retired_at timestamptz;

-- Recupera las bajas ya anonimizadas por delete_account_data.
UPDATE public.players
SET retired_at=coalesce(updated_at,clock_timestamp())
WHERE group_id IS NOT NULL AND auth_user_id IS NULL AND NOT coalesce(is_guest,false)
  AND name='Jugador eliminado' AND retired_at IS NULL;

CREATE OR REPLACE FUNCTION public.list_group_game_players(p_group uuid) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_group_member(p_group) OR public.can_manage_group_messages(p_group)) THEN
  RAISE EXCEPTION 'No perteneces a este grupo' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT to_jsonb(player) || jsonb_build_object(
   'can_manage',coalesce(public.can_manage_group_messages(p_group),false) AND NOT public.is_app_user_read_only(),
   'name',CASE WHEN player.auth_user_id IS NULL THEN player.name ELSE coalesce(profile.nick,profile.display_name,'Cuenta pendiente') END
 )
 FROM public.players player
 LEFT JOIN public.user_profiles profile ON profile.user_id=player.auth_user_id
 WHERE player.group_id=p_group AND player.retired_at IS NULL
   AND (player.auth_user_id IS NULL OR EXISTS(
     SELECT 1 FROM public.group_members member
     WHERE member.group_id=p_group AND member.user_id=player.auth_user_id
   ))
 ORDER BY player.name;
END $$;

-- Defensa del servidor: aunque un cliente antiguo conserve el UUID de la
-- ficha, tampoco puede insertarla directamente en una partida nueva.
CREATE OR REPLACE FUNCTION public.guard_retired_round_player() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.players WHERE id=NEW.player_id AND retired_at IS NOT NULL) THEN
  RAISE EXCEPTION 'El jugador ya no está disponible en este grupo' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a0_guard_retired_round_player ON public.round_players;
CREATE TRIGGER a0_guard_retired_round_player
BEFORE INSERT OR UPDATE OF player_id ON public.round_players
FOR EACH ROW EXECUTE FUNCTION public.guard_retired_round_player();

-- Envuelve la baja actual: primero conserva y anonimiza todo el historial y,
-- después, retira de la plantilla las fichas vinculadas a la cuenta eliminada.
ALTER FUNCTION public.delete_account_data(uuid) RENAME TO delete_account_data_before_player_retirement;
CREATE FUNCTION public.delete_account_data(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; player_ids uuid[];
BEGIN
 SELECT array_agg(id) INTO player_ids FROM public.players WHERE auth_user_id=p_user;
 result:=public.delete_account_data_before_player_retirement(p_user);
 PERFORM set_config('app.account_deletion','on',true);
 UPDATE public.players SET retired_at=clock_timestamp()
 WHERE id=ANY(coalesce(player_ids,ARRAY[]::uuid[]));
 PERFORM set_config('app.account_deletion','off',true);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.list_group_game_players(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_group_game_players(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_retired_round_player() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.delete_account_data(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.delete_account_data_before_player_retirement(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data_before_player_retirement(uuid) TO service_role;

COMMIT;
