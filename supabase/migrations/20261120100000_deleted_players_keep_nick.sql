-- Un jugador que se da de baja conserva su nick en grupos, partidas y estadísticas,
-- marcado con «☠ » delante. La app lo muestra en gris con una calavera. El nick queda libre.
BEGIN;

-- Nombre con el que aparece en el historial un jugador dado de baja.
CREATE OR REPLACE FUNCTION public.deleted_player_name(p_nick text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT '☠ ' || coalesce(nullif(trim(p_nick),''),'Jugador eliminado');
$$;

CREATE OR REPLACE FUNCTION public.delete_account_data_before_player_retirement(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result jsonb;
  old_nick text;
  player_ids uuid[];
  round_player_ids uuid[];
  anonymous_name text;
BEGIN
  SELECT coalesce(nullif(trim(nick),''),nullif(trim(display_name),''))
  INTO old_nick FROM public.user_profiles WHERE user_id=p_user;
  SELECT array_agg(id) INTO player_ids FROM public.players WHERE auth_user_id=p_user;
  SELECT array_agg(id) INTO round_player_ids
  FROM public.round_players
  WHERE user_id=p_user OR player_id=ANY(coalesce(player_ids,'{}'));

  -- Se conserva el nick, marcado con la calavera, para que el historial siga legible.
  anonymous_name := public.deleted_player_name(old_nick);
  result:=public.delete_account_data_legacy(p_user);

  -- La función anterior mantiene la integridad de grupos y resultados. Antes
  -- de confirmar la transacción el nick queda libre y el historial lo muestra como dado de baja.
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
END $function$
;

-- Bajas anteriores: su nick ya no se puede recuperar; se marcan igual.
SELECT set_config('app.account_deletion','on',true);
SELECT set_config('app.nick_rename','on',true);
UPDATE public.players SET name='☠ Jugador eliminado' WHERE name='Jugador eliminado';
UPDATE public.round_players SET name='☠ Jugador eliminado' WHERE name='Jugador eliminado';
UPDATE public.daily_rankings SET player_name='☠ Jugador eliminado' WHERE player_name='Jugador eliminado';
UPDATE public.handicap_adjustments SET player_name='☠ Jugador eliminado' WHERE player_name='Jugador eliminado';
UPDATE public.archived_rounds ar SET
  final_ranking=(SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_name'='Jugador eliminado' THEN jsonb_set(e,'{player_name}',to_jsonb('☠ Jugador eliminado'::text)) ELSE e END ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(ar.final_ranking,'[]')) WITH ORDINALITY x(e,ord)),
  player_stats=(SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_name'='Jugador eliminado' THEN jsonb_set(e,'{player_name}',to_jsonb('☠ Jugador eliminado'::text)) ELSE e END ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(ar.player_stats,'[]')) WITH ORDINALITY x(e,ord)),
  hole_scores=(SELECT coalesce(jsonb_agg(CASE WHEN e->>'player_name'='Jugador eliminado' THEN jsonb_set(e,'{player_name}',to_jsonb('☠ Jugador eliminado'::text)) ELSE e END ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(ar.hole_scores,'[]')) WITH ORDINALITY x(e,ord))
WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ar.final_ranking,'[]')||coalesce(ar.player_stats,'[]')||coalesce(ar.hole_scores,'[]')) e WHERE e->>'player_name'='Jugador eliminado');
SELECT set_config('app.nick_rename','off',true);
SELECT set_config('app.account_deletion','off',true);

REVOKE ALL ON FUNCTION public.deleted_player_name(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.delete_account_data_before_player_retirement(uuid) FROM PUBLIC,anon,authenticated;

COMMIT;
