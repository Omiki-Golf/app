-- Ajustes del grupo «Variación de HCP» y «Partidas mínimas para premios».
-- Hasta ahora solo se guardaban en el navegador de quien los marcaba: las columnas no existían
-- y el cálculo de hándicap aplicaba siempre «mitad baja, mitad sube».
BEGIN;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS handicap_variation_mode text NOT NULL DEFAULT 'mitad',
  ADD COLUMN IF NOT EXISTS min_rounds_for_awards integer NOT NULL DEFAULT 0;

ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_handicap_variation_mode_check;
ALTER TABLE public.groups ADD CONSTRAINT groups_handicap_variation_mode_check
  CHECK (handicap_variation_mode IN ('mitad', 'primero_ultimo'));
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_min_rounds_for_awards_check;
ALTER TABLE public.groups ADD CONSTRAINT groups_min_rounds_for_awards_check
  CHECK (min_rounds_for_awards >= 0);

-- Solo el creador o un administrador del grupo cambia estos ajustes.
CREATE OR REPLACE FUNCTION public.save_group_settings(p_group uuid, p_handicap_variation_mode text, p_min_rounds_for_awards integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.can_manage_group_messages(p_group) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar la configuración de este grupo' USING ERRCODE = '42501';
  END IF;
  IF p_handicap_variation_mode NOT IN ('mitad', 'primero_ultimo') THEN
    RAISE EXCEPTION 'Variación de HCP no válida' USING ERRCODE = '22023';
  END IF;
  UPDATE public.groups
  SET handicap_variation_mode = p_handicap_variation_mode,
      min_rounds_for_awards = greatest(0, coalesce(p_min_rounds_for_awards, 0))
  WHERE id = p_group;
END;
$$;
REVOKE ALL ON FUNCTION public.save_group_settings(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_group_settings(uuid, text, integer) TO authenticated;

-- El cálculo al archivar la partida respeta la variación de HCP del grupo.
CREATE OR REPLACE FUNCTION public.apply_handicap_adjustments_for_round(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_round RECORD;
  v_total_players integer;
  v_top_positions integer;
  v_player RECORD;
  v_old_exact numeric;
  v_old_playing numeric;
  v_new_exact numeric;
  v_new_playing numeric;
  v_adjustment numeric;
  v_playing_adj integer;
  v_mode text;
  v_last_index integer;
BEGIN
  SELECT id, group_id, played_at, final_ranking, player_stats, handicap_adjusted
  INTO v_round
  FROM archived_rounds
  WHERE id = p_round_id FOR UPDATE;

  IF NOT FOUND OR v_round.handicap_adjusted THEN RETURN; END IF;
  SELECT final_ranking,player_stats INTO v_round.final_ranking,v_round.player_stats
  FROM public.group_statistics_rounds WHERE id=p_round_id;
  IF NOT FOUND THEN
    UPDATE public.archived_rounds SET handicap_adjusted=true WHERE id=p_round_id;
    RETURN;
  END IF;

  v_total_players := jsonb_array_length(v_round.final_ranking);
  IF v_total_players = 0 THEN RETURN; END IF;
  v_top_positions := FLOOR(v_total_players / 2.0);
  SELECT coalesce(handicap_variation_mode, 'mitad') INTO v_mode FROM public.groups WHERE id = v_round.group_id;
  -- El último de la clasificación de miembros (group_statistics_rounds ya excluye invitados).
  v_last_index := v_total_players;

  FOR v_player IN
    SELECT
      (fr.value->>'position')::integer AS position,
      fr.ranking_index,
      fr.value->>'player_name' AS player_name,
      p.id AS player_id, p.auth_user_id,
      p.exact_handicap_18,
      p.playing_handicap,
      COALESCE((
        SELECT (ps->>'spanish_hands_count')::integer
        FROM jsonb_array_elements(COALESCE(v_round.player_stats, '[]'::jsonb)) ps
        WHERE (ps->>'player_db_id'=p.id::text OR (nullif(ps->>'player_db_id','') IS NULL AND p.auth_user_id IS NULL AND ps->>'player_name'=fr.value->>'player_name'))
        LIMIT 1
      ), 0) AS spanish_hands_count
    FROM (
      SELECT ranking.value,
        row_number() OVER (ORDER BY (ranking.value->>'position')::integer, ranking.ordinality) AS ranking_index
      FROM jsonb_array_elements(v_round.final_ranking) WITH ORDINALITY ranking(value, ordinality)
    ) fr
    JOIN players p ON p.group_id=v_round.group_id AND (p.id::text=fr.value->>'player_db_id' OR (nullif(fr.value->>'player_db_id','') IS NULL AND p.auth_user_id IS NULL AND p.name=fr.value->>'player_name'))
    ORDER BY (fr.value->>'position')::integer
  LOOP
    v_old_exact := v_player.exact_handicap_18;
    v_old_playing := COALESCE(v_player.playing_handicap, v_old_exact);
    v_adjustment := 0;
    v_playing_adj := 0;

    IF v_mode = 'primero_ultimo' THEN
      -- Solo baja el ganador y solo sube el último; los demás no cambian.
      IF v_total_players >= 2 AND v_player.ranking_index = 1 THEN
        v_adjustment := -1;
        v_playing_adj := -1;
      ELSIF v_total_players >= 2 AND v_player.ranking_index = v_last_index THEN
        v_adjustment := 1;
        v_playing_adj := 1;
      END IF;
    ELSIF v_player.position <= v_top_positions THEN
      v_adjustment := -1;
      v_playing_adj := -1;
    ELSIF NOT (v_total_players % 2 = 1 AND v_player.position = v_top_positions + 1) THEN
      v_adjustment := 1;
      v_playing_adj := 1;
    END IF;

    -- Cada Spanish Hands suma un punto, independientemente de la posición.
    v_adjustment := v_adjustment + v_player.spanish_hands_count;
    v_playing_adj := v_playing_adj + v_player.spanish_hands_count;

    v_new_exact := LEAST(12, GREATEST(0, v_old_exact + v_adjustment));
    v_new_playing := LEAST(12, GREATEST(0, v_old_playing + v_playing_adj));
    v_adjustment := v_new_exact - v_old_exact;
    v_playing_adj := v_new_playing - v_old_playing;

    IF v_adjustment != 0 OR v_playing_adj != 0 THEN
      IF v_player.auth_user_id IS NOT NULL THEN
        PERFORM public.require_group_result_writer(v_round.group_id);
        INSERT INTO public.group_write_permits VALUES(txid_current(),v_player.player_id,'player');
        INSERT INTO public.app_admin_audit(actor_user_id,actor_alias,action,target_user_id,details)
        VALUES(auth.uid(),coalesce((SELECT nick FROM public.user_profiles WHERE user_id=auth.uid()),'Jugador del grupo'),'group.member.results',v_player.auth_user_id,
          jsonb_build_object('group_id',v_round.group_id,'archive_id',p_round_id,'before',(v_old_exact*2)::text,'after',(v_new_exact*2)::text));
      END IF;
      UPDATE players SET
        exact_handicap = v_new_exact,
        exact_handicap_18 = v_new_exact,
        playing_handicap = v_new_playing,
        updated_at = now()
      WHERE id = v_player.player_id;

      IF v_player.auth_user_id IS NOT NULL THEN
        INSERT INTO public.group_write_permits VALUES(txid_current(),v_player.player_id,'ledger') ON CONFLICT DO NOTHING;
      END IF;
      INSERT INTO handicap_adjustments (
        group_id, player_id, player_name, adjustment_date,
        ranking_position, hcp_before, hcp_after, adjustment,
        playing_handicap_before, archived_round_id
      ) VALUES (
        v_round.group_id, v_player.player_id, v_player.player_name,
        DATE(v_round.played_at), v_player.position,
        v_old_exact, v_new_exact, v_adjustment,
        v_old_playing, p_round_id
      )
      ON CONFLICT (group_id, player_id, archived_round_id)
      DO UPDATE SET
        ranking_position = EXCLUDED.ranking_position,
        hcp_before = EXCLUDED.hcp_before,
        hcp_after = EXCLUDED.hcp_after,
        adjustment = EXCLUDED.adjustment,
        playing_handicap_before = EXCLUDED.playing_handicap_before,
        created_at = now();
      DELETE FROM public.group_write_permits WHERE tx=txid_current() AND entity=v_player.player_id AND operation='ledger';
    END IF;
  END LOOP;

  UPDATE archived_rounds SET handicap_adjusted = true WHERE id = p_round_id;
END;
$$;

COMMIT;
