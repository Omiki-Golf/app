BEGIN;

-- La baja conserva únicamente resultados anónimos para no alterar las
-- clasificaciones de terceros. El nick se libera inmediatamente y no se
-- almacena en la reserva ni en el historial.
ALTER FUNCTION public.delete_account_data(uuid) RENAME TO delete_account_data_legacy;

CREATE FUNCTION public.delete_account_data(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  result jsonb;
  old_nick text;
  player_ids uuid[];
  round_player_ids uuid[];
  anonymous_name constant text := 'Jugador eliminado';
BEGIN
  SELECT coalesce(nullif(trim(nick),''),nullif(trim(display_name),''))
  INTO old_nick FROM public.user_profiles WHERE user_id=p_user;
  SELECT array_agg(id) INTO player_ids FROM public.players WHERE auth_user_id=p_user;
  SELECT array_agg(id) INTO round_player_ids
  FROM public.round_players
  WHERE user_id=p_user OR player_id=ANY(coalesce(player_ids,'{}'));

  result:=public.delete_account_data_legacy(p_user);

  -- La función anterior mantiene la integridad de grupos y resultados. Antes
  -- de confirmar la transacción se elimina cualquier dato que revele el nick.
  PERFORM set_config('app.account_deletion','on',true);
  PERFORM set_config('app.nick_rename','on',true);
  IF old_nick IS NOT NULL THEN
    DELETE FROM public.reserved_nicks WHERE nick_normalized=lower(trim(old_nick));
  END IF;
  UPDATE public.players SET name=anonymous_name WHERE id=ANY(coalesce(player_ids,'{}'));
  UPDATE public.round_players SET name=anonymous_name WHERE id=ANY(coalesce(round_player_ids,'{}'));
  UPDATE public.archived_rounds ar SET
    final_ranking=(SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_db_id'=ANY(coalesce(player_ids,'{}')::text[]) OR e->>'player_id'=ANY(coalesce(round_player_ids,'{}')::text[]) THEN jsonb_set(e,'{player_name}',to_jsonb(anonymous_name)) ELSE e END ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(ar.final_ranking,'[]')) WITH ORDINALITY x(e,ord)),
    player_stats=(SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_db_id'=ANY(coalesce(player_ids,'{}')::text[]) OR e->>'player_id'=ANY(coalesce(round_player_ids,'{}')::text[]) THEN jsonb_set(e,'{player_name}',to_jsonb(anonymous_name)) ELSE e END ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(ar.player_stats,'[]')) WITH ORDINALITY x(e,ord)),
    hole_scores=(SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_db_id'=ANY(coalesce(player_ids,'{}')::text[]) OR e->>'player_id'=ANY(coalesce(round_player_ids,'{}')::text[]) THEN jsonb_set(e,'{player_name}',to_jsonb(anonymous_name)) ELSE e END ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(ar.hole_scores,'[]')) WITH ORDINALITY x(e,ord))
  WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ar.final_ranking,'[]')||coalesce(ar.player_stats,'[]')||coalesce(ar.hole_scores,'[]')) e
    WHERE e->>'player_db_id'=ANY(coalesce(player_ids,'{}')::text[]) OR e->>'player_id'=ANY(coalesce(round_player_ids,'{}')::text[]));
  UPDATE public.daily_rankings SET player_name=anonymous_name WHERE game_player_id=ANY(coalesce(player_ids,'{}'));
  UPDATE public.handicap_adjustments SET player_name=anonymous_name WHERE player_id=ANY(coalesce(player_ids,'{}'));

  IF old_nick IS NOT NULL THEN
    UPDATE public.app_messages
    SET title=replace(title,old_nick,'El creador'), body=replace(body,old_nick,'El creador')
    WHERE author_id=p_user;
  END IF;
  PERFORM set_config('app.nick_rename','off',true);
  PERFORM set_config('app.account_deletion','off',true);
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.delete_account_data(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.delete_account_data_legacy(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data_legacy(uuid) TO service_role;

COMMIT;
