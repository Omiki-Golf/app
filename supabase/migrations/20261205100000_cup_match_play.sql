-- Temporada Simultánea · Copa Match Play (primera fase).
-- Ediciones, inscritos, cruces, partidos y auditoría en un ámbito propio. La Copa nunca
-- escribe en hándicaps, archived_rounds, rankings, estadísticas ni premios del grupo:
-- sus partidas son golf_rounds de Match Play enlazadas a un cruce que no se pueden archivar.
-- Todo el acceso pasa por funciones SECURITY DEFINER; las tablas no tienen permisos directos.
BEGIN;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
CREATE TABLE public.cup_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number > 0),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','registration','draw_ready','active','paused','finished','cancelled')),
  created_by uuid NOT NULL,
  draw_method text CHECK (draw_method IN ('random','ranking','handicap','manual')),
  best_of smallint NOT NULL DEFAULT 1 CHECK (best_of IN (1,3)),
  final_best_of smallint NOT NULL DEFAULT 1 CHECK (final_best_of IN (1,3)),
  third_place boolean NOT NULL DEFAULT false,
  round_days smallint CHECK (round_days BETWEEN 1 AND 90),
  registration_deadline timestamptz,
  -- Sorteo preparado: plazas del cuadro en orden (NULL = pase directo).
  draw_slots uuid[],
  champion_entrant_id uuid,
  published_at timestamptz,
  finished_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, number)
);
-- Como máximo una edición abierta por grupo, también con solicitudes simultáneas.
CREATE UNIQUE INDEX cup_editions_one_open ON public.cup_editions(group_id)
  WHERE status NOT IN ('finished','cancelled');

CREATE TABLE public.cup_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_key uuid NOT NULL UNIQUE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  purchased_by uuid NOT NULL,
  amount_paid numeric(6,2) NOT NULL DEFAULT 14.99,
  payment_method text NOT NULL DEFAULT 'test',
  status text NOT NULL DEFAULT 'completed' CHECK (status = 'completed'),
  edition_id uuid NOT NULL UNIQUE REFERENCES public.cup_editions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cup_entrants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.cup_editions(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  -- PJ de 18 hoyos para esta edición; no cambia la ficha del grupo.
  playing_handicap numeric(4,1) NOT NULL CHECK (playing_handicap BETWEEN 0 AND 54),
  is_guest boolean NOT NULL DEFAULT false,
  registration text NOT NULL DEFAULT 'confirmed' CHECK (registration IN ('confirmed','pending','declined')),
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition_id, user_id),
  UNIQUE (edition_id, player_id)
);
CREATE UNIQUE INDEX cup_entrants_unique_name ON public.cup_entrants(edition_id, lower(trim(name)));

CREATE TABLE public.cup_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.cup_editions(id) ON DELETE CASCADE,
  code text NOT NULL,
  round_index smallint NOT NULL CHECK (round_index >= 0),
  position smallint NOT NULL CHECK (position >= 0),
  best_of smallint NOT NULL CHECK (best_of IN (1,3)),
  entrant_a uuid REFERENCES public.cup_entrants(id) DEFERRABLE INITIALLY DEFERRED,
  entrant_b uuid REFERENCES public.cup_entrants(id) DEFERRABLE INITIALLY DEFERRED,
  next_code text,
  next_slot smallint CHECK (next_slot IN (0,1)),
  third_slot smallint CHECK (third_slot IN (0,1)),
  winner_entrant uuid REFERENCES public.cup_entrants(id) DEFERRABLE INITIALLY DEFERRED,
  awarded_entrant uuid REFERENCES public.cup_entrants(id) DEFERRABLE INITIALLY DEFERRED,
  award_note text CHECK (award_note IS NULL OR length(award_note) <= 200),
  deadline timestamptz,
  decided_at timestamptz,
  UNIQUE (edition_id, code)
);

CREATE TABLE public.cup_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.cup_matches(id) ON DELETE CASCADE,
  game_number smallint NOT NULL CHECK (game_number BETWEEN 1 AND 3),
  winner_entrant uuid NOT NULL REFERENCES public.cup_entrants(id) DEFERRABLE INITIALLY DEFERRED,
  score text NOT NULL CHECK (length(trim(score)) BETWEEN 1 AND 40),
  decisive_hole smallint CHECK (decisive_hole IS NULL OR decisive_hole BETWEEN 19 AND 40),
  round_id uuid REFERENCES public.golf_rounds(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'played' CHECK (source IN ('played','corrected')),
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, game_number)
);
CREATE UNIQUE INDEX cup_games_round_unique ON public.cup_games(round_id) WHERE round_id IS NOT NULL;

CREATE TABLE public.cup_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  edition_id uuid NOT NULL REFERENCES public.cup_editions(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.cup_matches(id) ON DELETE SET NULL,
  actor_user_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.golf_rounds
  ADD COLUMN cup_match_id uuid REFERENCES public.cup_matches(id) ON DELETE SET NULL,
  ADD COLUMN cup_game_number smallint CHECK (cup_game_number IS NULL OR cup_game_number BETWEEN 1 AND 3);
CREATE INDEX golf_rounds_cup_match ON public.golf_rounds(cup_match_id) WHERE cup_match_id IS NOT NULL;
ALTER TABLE public.round_players
  ADD COLUMN cup_entrant_id uuid REFERENCES public.cup_entrants(id) ON DELETE SET NULL;

ALTER TABLE public.cup_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cup_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cup_entrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cup_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cup_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cup_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cup_editions, public.cup_purchases, public.cup_entrants, public.cup_matches,
  public.cup_games, public.cup_audit FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guardas sobre las partidas: el enlace a la Copa solo lo pone start_cup_game,
-- y una partida de Copa no se archiva ni cambia de modalidad o de jugadores.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.guard_cup_round_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cup_match_id IS NOT NULL OR NEW.cup_game_number IS NOT NULL THEN
      IF current_setting('app.cup_game_start', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Las partidas de Copa se inician desde la Copa' USING ERRCODE='42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.cup_match_id, NEW.cup_game_number) IS DISTINCT FROM (OLD.cup_match_id, OLD.cup_game_number)
     AND NOT (NEW.cup_match_id IS NULL AND OLD.cup_match_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM public.cup_matches WHERE id = OLD.cup_match_id)) THEN
    RAISE EXCEPTION 'El enlace de una partida de Copa no se puede cambiar' USING ERRCODE='42501';
  END IF;
  IF OLD.cup_match_id IS NOT NULL AND (NEW.game_mode, NEW.num_holes, NEW.holes_range, NEW.group_id)
     IS DISTINCT FROM (OLD.game_mode, OLD.num_holes, OLD.holes_range, OLD.group_id) THEN
    RAISE EXCEPTION 'Una partida de Copa se juega siempre a Match Play y 18 hoyos' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_cup_round_link BEFORE INSERT OR UPDATE ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_cup_round_link();

-- Las partidas de grupo siguen siendo Stableford, salvo las de Copa (Match Play).
CREATE OR REPLACE FUNCTION public.guard_group_round_stableford()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.cup_match_id IS NOT NULL AND NEW.game_mode = 'match' THEN
    RETURN NEW;
  END IF;
  IF NEW.group_id IS NOT NULL AND coalesce(NEW.game_mode, 'stableford') <> 'stableford'
     AND (TG_OP = 'INSERT' OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.game_mode IS DISTINCT FROM OLD.game_mode) THEN
    RAISE EXCEPTION 'Las partidas de grupo se juegan siempre a Stableford' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_group_round_stableford() FROM PUBLIC, anon, authenticated;

-- Misma función que 20261026110000, con la rama de Copa: los dos jugadores los fija el cuadro.
CREATE OR REPLACE FUNCTION public.guard_guest_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players; r public.golf_rounds; v_slope numeric;
BEGIN
 IF TG_OP IN ('INSERT','DELETE') THEN
   SELECT * INTO r FROM public.golf_rounds
   WHERE id = CASE WHEN TG_OP='INSERT' THEN NEW.round_id ELSE OLD.round_id END;
   IF r.cup_match_id IS NOT NULL THEN
     IF TG_OP='INSERT' AND current_setting('app.cup_game_start',true) IS DISTINCT FROM r.id::text THEN
       RAISE EXCEPTION 'Los jugadores de una partida de Copa los fija el cuadro' USING ERRCODE='42501';
     END IF;
     IF TG_OP='DELETE' AND current_setting('app.account_deletion',true) IS DISTINCT FROM 'on' THEN
       RAISE EXCEPTION 'Los jugadores de una partida de Copa los fija el cuadro' USING ERRCODE='42501';
     END IF;
     RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
   END IF;
 END IF;
 -- Solo se suelta el enlace cuando desaparece el inscrito (borrado del grupo en cascada).
 IF TG_OP='UPDATE' AND NEW.cup_entrant_id IS DISTINCT FROM OLD.cup_entrant_id
    AND NOT (NEW.cup_entrant_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.cup_entrants WHERE id=OLD.cup_entrant_id)) THEN
   RAISE EXCEPTION 'La condición y la identidad de la participación son inmutables';
 END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.is_guest AND OLD.cup_entrant_id IS NULL THEN
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

-- Una partida de Copa nunca entra en archived_rounds (ni en hándicaps ni en rankings).
CREATE FUNCTION public.guard_cup_round_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.source_round_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.golf_rounds WHERE id = NEW.source_round_id AND cup_match_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Las partidas de Copa se registran en la Copa y no se archivan en el grupo' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_cup_round_archive_guard BEFORE INSERT OR UPDATE OF source_round_id ON public.archived_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_cup_round_archive();

-- ---------------------------------------------------------------------------
-- Utilidades internas
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cup_capacity(p_group uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN coalesce(max_players, 20) >= 32 THEN 32 ELSE 20 END FROM public.groups WHERE id = p_group
$$;

CREATE FUNCTION public.cup_is_manager(p_group uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(public.can_manage_group_messages(p_group), false) AND NOT public.is_app_user_read_only()
$$;

CREATE FUNCTION public.cup_can_view(p_edition uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cup_editions e
    WHERE e.id = p_edition AND (
      coalesce(public.can_manage_group_messages(e.group_id), false)
      OR coalesce(public.is_group_member(e.group_id), false)
      OR EXISTS (SELECT 1 FROM public.cup_entrants x WHERE x.edition_id = e.id AND x.user_id = auth.uid())
    )
  )
$$;

-- Edición bloqueada para una escritura de gestión (creador o administradores del grupo).
CREATE FUNCTION public.cup_manage_edition(p_edition uuid, p_statuses text[]) RETURNS public.cup_editions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para gestionar la Copa' USING ERRCODE='42501';
  END IF;
  SELECT * INTO e FROM public.cup_editions WHERE id = p_edition FOR UPDATE;
  IF e.id IS NULL OR NOT public.cup_is_manager(e.group_id) THEN
    RAISE EXCEPTION 'Solo el creador o un administrador del grupo pueden gestionar la Copa' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.groups WHERE id = e.group_id AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'El grupo está archivado y solo se puede consultar' USING ERRCODE='42501';
  END IF;
  IF NOT e.status = ANY(p_statuses) THEN
    RAISE EXCEPTION 'La Copa no admite este cambio en su estado actual' USING ERRCODE='55000';
  END IF;
  RETURN e;
END $$;

CREATE FUNCTION public.cup_log(p_edition uuid, p_match uuid, p_action text, p_details jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  INSERT INTO public.cup_audit(edition_id, match_id, actor_user_id, action, details)
  VALUES (p_edition, p_match, auth.uid(), p_action, coalesce(p_details, '{}'::jsonb))
$$;

CREATE FUNCTION public.cup_notify(p_edition uuid, p_title text, p_body text, p_recipients uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_group uuid;
BEGIN
  SELECT group_id INTO v_group FROM public.cup_editions WHERE id = p_edition;
  IF v_group IS NULL OR p_recipients IS NULL OR cardinality(p_recipients) = 0 THEN RETURN; END IF;
  PERFORM public.notify_group_membership_accounts(coalesce(auth.uid(), (SELECT user_auth_id FROM public.groups WHERE id = v_group)),
    v_group, p_title, p_body, p_recipients);
EXCEPTION WHEN OTHERS THEN
  -- Un aviso nunca bloquea la Copa.
  RETURN;
END $$;

-- Ranking actual del grupo (temporada abierta, o todo lo archivado si no hay temporada).
CREATE FUNCTION public.cup_group_ranks(p_group uuid) RETURNS TABLE(player_id uuid, rank integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH season AS (
    SELECT id FROM public.seasons WHERE group_id = p_group AND end_date IS NULL ORDER BY start_date DESC LIMIT 1
  ), entries AS (
    SELECT CASE WHEN fr->>'player_db_id' ~ '^[0-9a-fA-F-]{36}$' THEN (fr->>'player_db_id')::uuid END AS pid,
      CASE WHEN fr->>'points' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (fr->>'points')::numeric ELSE 0 END AS points
    FROM public.archived_rounds a
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.final_ranking) = 'array' THEN a.final_ranking ELSE '[]'::jsonb END) fr
    WHERE a.group_id = p_group
      AND (NOT EXISTS (SELECT 1 FROM season) OR a.season_id = (SELECT id FROM season))
  )
  SELECT pid, (rank() OVER (ORDER BY sum(points) DESC))::integer
  FROM entries WHERE pid IS NOT NULL GROUP BY pid
$$;

CREATE FUNCTION public.cup_round_name(p_round integer, p_total integer) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_total - 1 - p_round
    WHEN 0 THEN 'Final' WHEN 1 THEN 'Semifinales' WHEN 2 THEN 'Cuartos de final'
    WHEN 3 THEN 'Octavos de final' WHEN 4 THEN 'Dieciseisavos de final' ELSE 'Ronda ' || (p_round + 1) END
$$;

-- Motor del cuadro: recalcula de principio a fin jugadores, ganadores, plazos y campeón.
-- Siempre se ejecuta en la misma transacción que el resultado, la corrección o la adjudicación.
CREATE FUNCTION public.cup_refresh(p_edition uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  e public.cup_editions;
  m public.cup_matches;
  f public.cup_matches;
  v_a uuid; v_b uuid; v_winner uuid; v_needed integer;
  v_final public.cup_matches; v_third public.cup_matches;
  v_playable uuid[] := ARRAY[]::uuid[];
  v_total integer; v_name_a text; v_name_b text; v_recipients uuid[]; v_champion text;
BEGIN
  SELECT * INTO e FROM public.cup_editions WHERE id = p_edition FOR UPDATE;
  SELECT max(round_index) + 1 INTO v_total FROM public.cup_matches WHERE edition_id = e.id AND code <> 'third-place';
  FOR m IN
    SELECT * FROM public.cup_matches WHERE edition_id = e.id
    ORDER BY round_index, (code = 'third-place'), position
  LOOP
    v_a := m.entrant_a; v_b := m.entrant_b;
    IF m.code = 'third-place' THEN
      v_a := NULL; v_b := NULL;
      FOR f IN SELECT * FROM public.cup_matches WHERE edition_id = e.id AND third_slot IS NOT NULL LOOP
        IF f.winner_entrant IS NOT NULL AND f.entrant_a IS NOT NULL AND f.entrant_b IS NOT NULL THEN
          IF f.third_slot = 0 THEN v_a := CASE WHEN f.winner_entrant = f.entrant_a THEN f.entrant_b ELSE f.entrant_a END;
          ELSE v_b := CASE WHEN f.winner_entrant = f.entrant_a THEN f.entrant_b ELSE f.entrant_a END; END IF;
        END IF;
      END LOOP;
    ELSIF m.round_index > 0 THEN
      SELECT winner_entrant INTO v_a FROM public.cup_matches WHERE edition_id = e.id AND next_code = m.code AND next_slot = 0;
      SELECT winner_entrant INTO v_b FROM public.cup_matches WHERE edition_id = e.id AND next_code = m.code AND next_slot = 1;
    END IF;

    IF (v_a, v_b) IS DISTINCT FROM (m.entrant_a, m.entrant_b) AND (
      EXISTS (SELECT 1 FROM public.cup_games WHERE match_id = m.id)
      OR EXISTS (SELECT 1 FROM public.golf_rounds WHERE cup_match_id = m.id AND status IN ('active','completed'))
      OR m.awarded_entrant IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'El cambio afecta a un cruce que ya ha empezado' USING ERRCODE='55000';
    END IF;

    v_winner := NULL;
    v_needed := CASE WHEN m.best_of = 1 THEN 1 ELSE 2 END;
    IF m.round_index = 0 AND m.code <> 'third-place' AND (v_a IS NULL) <> (v_b IS NULL) THEN
      v_winner := coalesce(v_a, v_b); -- pase directo
    ELSIF v_a IS NOT NULL AND v_b IS NOT NULL THEN
      IF m.awarded_entrant IN (v_a, v_b) THEN
        v_winner := m.awarded_entrant;
      ELSE
        SELECT g.winner_entrant INTO v_winner FROM public.cup_games g
        WHERE g.match_id = m.id AND g.winner_entrant IN (v_a, v_b)
        GROUP BY g.winner_entrant HAVING count(*) >= v_needed LIMIT 1;
      END IF;
    END IF;

    IF v_a IS NOT NULL AND v_b IS NOT NULL AND v_winner IS NULL
       AND (m.entrant_a IS NULL OR m.entrant_b IS NULL OR m.winner_entrant IS NOT NULL) THEN
      v_playable := v_playable || m.id;
    END IF;

    UPDATE public.cup_matches SET
      entrant_a = v_a, entrant_b = v_b, winner_entrant = v_winner,
      decided_at = CASE WHEN v_winner IS NULL THEN NULL WHEN m.winner_entrant IS NOT DISTINCT FROM v_winner THEN coalesce(m.decided_at, now()) ELSE now() END,
      deadline = CASE
        WHEN v_a IS NULL OR v_b IS NULL THEN NULL
        WHEN m.deadline IS NOT NULL THEN m.deadline
        WHEN e.round_days IS NOT NULL AND v_winner IS NULL THEN now() + make_interval(days => e.round_days)
        ELSE NULL END
    WHERE id = m.id;
  END LOOP;

  SELECT * INTO v_final FROM public.cup_matches WHERE edition_id = e.id AND next_code IS NULL AND code <> 'third-place';
  SELECT * INTO v_third FROM public.cup_matches WHERE edition_id = e.id AND code = 'third-place';
  IF e.status IN ('active','paused','finished') THEN
    IF v_final.winner_entrant IS NOT NULL AND (v_third.id IS NULL OR v_third.winner_entrant IS NOT NULL) THEN
      IF e.status <> 'finished' OR e.champion_entrant_id IS DISTINCT FROM v_final.winner_entrant THEN
        UPDATE public.cup_editions SET status = 'finished', champion_entrant_id = v_final.winner_entrant,
          finished_at = coalesce(finished_at, now()), updated_at = now() WHERE id = e.id;
        SELECT name INTO v_champion FROM public.cup_entrants WHERE id = v_final.winner_entrant;
        SELECT array_agg(user_id) INTO v_recipients FROM public.cup_entrants WHERE edition_id = e.id AND user_id IS NOT NULL;
        PERFORM public.cup_notify(e.id, left(e.name || ': ¡tenemos campeón!', 120),
          v_champion || ' gana la ' || e.name || '. ¡Enhorabuena!', v_recipients);
      END IF;
    ELSIF e.status = 'finished' THEN
      UPDATE public.cup_editions SET status = 'active', champion_entrant_id = NULL, finished_at = NULL, updated_at = now() WHERE id = e.id;
    END IF;
  END IF;

  -- Aviso a los dos jugadores de cada cruce que pasa a estar disponible.
  IF e.status = 'active' THEN
    FOR m IN SELECT * FROM public.cup_matches WHERE id = ANY(v_playable) LOOP
      SELECT name INTO v_name_a FROM public.cup_entrants WHERE id = m.entrant_a;
      SELECT name INTO v_name_b FROM public.cup_entrants WHERE id = m.entrant_b;
      SELECT array_agg(user_id) INTO v_recipients FROM public.cup_entrants WHERE id IN (m.entrant_a, m.entrant_b) AND user_id IS NOT NULL;
      PERFORM public.cup_notify(e.id, left(e.name || ': tienes eliminatoria', 120),
        CASE WHEN m.code = 'third-place' THEN 'Partido por el tercer puesto' ELSE public.cup_round_name(m.round_index, v_total) END
        || ': ' || v_name_a || ' contra ' || v_name_b || '.'
        || CASE WHEN (SELECT deadline FROM public.cup_matches WHERE id = m.id) IS NOT NULL
             THEN ' Fecha límite: ' || to_char((SELECT deadline FROM public.cup_matches WHERE id = m.id) AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY') || '.' ELSE '' END,
        v_recipients);
    END LOOP;
  END IF;
END $$;

-- Comprueba que un cruce y los que dependen de él admiten una corrección.
CREATE FUNCTION public.cup_require_correctable(p_match public.cup_matches) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cup_matches d
    WHERE d.edition_id = p_match.edition_id
      AND ((p_match.next_code IS NOT NULL AND d.code = p_match.next_code)
        OR (p_match.third_slot IS NOT NULL AND d.code = 'third-place'))
      AND (EXISTS (SELECT 1 FROM public.cup_games g WHERE g.match_id = d.id)
        OR EXISTS (SELECT 1 FROM public.golf_rounds r WHERE r.cup_match_id = d.id AND r.status IN ('active','completed','archived'))
        OR d.awarded_entrant IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'No se puede corregir: el siguiente cruce afectado ya ha empezado' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.golf_rounds r WHERE r.cup_match_id = p_match.id AND r.status IN ('active','completed')
             AND NOT EXISTS (SELECT 1 FROM public.cup_games g WHERE g.round_id = r.id)) THEN
    RAISE EXCEPTION 'Hay una partida de esta eliminatoria en juego o pendiente de registrar' USING ERRCODE='55000';
  END IF;
END $$;

-- Una serie no puede tener partidos registrados después de quedar decidida.
CREATE FUNCTION public.cup_require_consistent_series(p_match uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.cup_matches; v_needed integer; v_count integer; v_last integer;
BEGIN
  SELECT * INTO m FROM public.cup_matches WHERE id = p_match;
  v_needed := CASE WHEN m.best_of = 1 THEN 1 ELSE 2 END;
  SELECT count(*), coalesce(max(game_number), 0) INTO v_count, v_last FROM public.cup_games WHERE match_id = m.id;
  IF v_count <> v_last THEN RAISE EXCEPTION 'Los partidos de la serie deben ser consecutivos'; END IF;
  IF EXISTS (
    SELECT 1 FROM generate_series(1, greatest(v_last - 1, 0)) k
    WHERE EXISTS (
      SELECT 1 FROM public.cup_games g WHERE g.match_id = m.id AND g.game_number <= k
      GROUP BY g.winner_entrant HAVING count(*) >= v_needed)
  ) THEN
    RAISE EXCEPTION 'La corrección dejaría un partido registrado después de decidir la serie' USING ERRCODE='55000';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Compra en Pro-Shop: un pago confirmado habilita una sola edición (idempotente).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.purchase_cup_edition(p_group uuid, p_purchase_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  g public.groups; v_purchase public.cup_purchases; v_edition public.cup_editions;
  v_number integer; v_capacity integer;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() OR p_purchase_key IS NULL THEN
    RAISE EXCEPTION 'No tienes permiso para contratar la Copa' USING ERRCODE='42501';
  END IF;
  SELECT * INTO g FROM public.groups WHERE id = p_group FOR UPDATE;
  SELECT * INTO v_purchase FROM public.cup_purchases WHERE purchase_key = p_purchase_key;
  IF v_purchase.id IS NOT NULL THEN
    IF v_purchase.purchased_by IS DISTINCT FROM auth.uid() OR v_purchase.group_id IS DISTINCT FROM p_group THEN
      RAISE EXCEPTION 'Compra no válida' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_build_object('edition_id', v_purchase.edition_id, 'purchase_id', v_purchase.id, 'replayed', true);
  END IF;
  IF g.id IS NULL OR g.user_auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo el propietario del grupo puede contratar la Copa' USING ERRCODE='42501';
  END IF;
  IF g.archived_at IS NOT NULL OR g.group_type IS NOT DISTINCT FROM 'weekend' THEN
    RAISE EXCEPTION 'La Copa es para grupos Team o Premium activos' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_subscriptions s
    WHERE s.user_id = auth.uid() AND s.status = 'active' AND s.plan_type IN ('team','premium')
      AND (s.current_period_end IS NULL OR s.current_period_end > clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'La Copa requiere un plan Team o Premium' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cup_editions WHERE group_id = p_group AND status NOT IN ('finished','cancelled')) THEN
    RAISE EXCEPTION 'Este grupo ya tiene una Copa abierta. Finalízala o cancélala para contratar la siguiente.' USING ERRCODE='23505';
  END IF;

  SELECT coalesce(max(number), 0) + 1 INTO v_number FROM public.cup_editions WHERE group_id = p_group;
  INSERT INTO public.cup_editions(group_id, number, name, created_by)
  VALUES (p_group, v_number, 'Copa Match Play #' || v_number || ' · ' || extract(year FROM now() AT TIME ZONE 'Europe/Madrid')::integer, auth.uid())
  RETURNING * INTO v_edition;
  INSERT INTO public.cup_purchases(purchase_key, group_id, purchased_by, edition_id)
  VALUES (p_purchase_key, p_group, auth.uid(), v_edition.id) RETURNING * INTO v_purchase;

  -- Copia inicial de la plantilla del grupo (los cambios posteriores no tocan el grupo).
  v_capacity := public.cup_capacity(p_group);
  INSERT INTO public.cup_entrants(edition_id, player_id, user_id, name, playing_handicap)
  SELECT v_edition.id, p.id, p.auth_user_id,
    left(CASE WHEN p.auth_user_id IS NULL THEN p.name ELSE coalesce(nullif(u.nick, ''), nullif(u.display_name, ''), p.name) END, 60),
    least(54, greatest(0, round(coalesce(p.exact_handicap, 0) * 2, 1)))
  FROM public.players p
  LEFT JOIN public.user_profiles u ON u.user_id = p.auth_user_id
  WHERE p.group_id = p_group AND NOT coalesce(p.is_guest, false)
    AND (p.auth_user_id IS NULL OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = p_group AND gm.user_id = p.auth_user_id))
  ORDER BY (p.auth_user_id IS NULL), lower(p.name)
  LIMIT v_capacity
  ON CONFLICT DO NOTHING;

  PERFORM public.cup_log(v_edition.id, NULL, 'cup.purchased', jsonb_build_object('purchase_id', v_purchase.id, 'amount', v_purchase.amount_paid, 'method', v_purchase.payment_method));
  RETURN jsonb_build_object('edition_id', v_edition.id, 'purchase_id', v_purchase.id, 'replayed', false);
END $$;

-- ---------------------------------------------------------------------------
-- Configuración e inscritos
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cup_reset_draw(p_edition uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE public.cup_editions SET draw_slots = NULL,
    status = CASE WHEN status = 'draw_ready' THEN 'draft' ELSE status END, updated_at = now()
  WHERE id = p_edition
$$;

CREATE FUNCTION public.update_cup_settings(p_edition uuid, p_settings jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions; v_pre boolean;
BEGIN
  e := public.cup_manage_edition(p_edition, ARRAY['draft','registration','draw_ready','active','paused']);
  v_pre := e.status IN ('draft','registration','draw_ready');
  IF jsonb_typeof(p_settings) <> 'object' THEN RAISE EXCEPTION 'Configuración no válida'; END IF;
  IF NOT v_pre AND (p_settings ?| ARRAY['draw_method','best_of','final_best_of','third_place']) THEN
    RAISE EXCEPTION 'El formato no se puede cambiar con el cuadro publicado' USING ERRCODE='55000';
  END IF;
  IF p_settings ? 'name' THEN
    UPDATE public.cup_editions SET name = left(trim(p_settings->>'name'), 80) WHERE id = e.id;
  END IF;
  IF p_settings ? 'draw_method' THEN
    UPDATE public.cup_editions SET draw_method = nullif(p_settings->>'draw_method', '') WHERE id = e.id;
  END IF;
  IF p_settings ? 'best_of' THEN
    UPDATE public.cup_editions SET best_of = (p_settings->>'best_of')::smallint WHERE id = e.id;
  END IF;
  IF p_settings ? 'final_best_of' THEN
    UPDATE public.cup_editions SET final_best_of = (p_settings->>'final_best_of')::smallint WHERE id = e.id;
  END IF;
  IF p_settings ? 'third_place' THEN
    UPDATE public.cup_editions SET third_place = (p_settings->>'third_place')::boolean WHERE id = e.id;
  END IF;
  IF p_settings ? 'round_days' THEN
    UPDATE public.cup_editions SET round_days = nullif(p_settings->>'round_days', '')::smallint WHERE id = e.id;
  END IF;
  UPDATE public.cup_editions SET updated_at = now() WHERE id = e.id;
  -- Cambiar el formato o el método invalida un sorteo preparado.
  IF v_pre AND (p_settings ?| ARRAY['draw_method','best_of','final_best_of','third_place']) THEN
    PERFORM public.cup_reset_draw(e.id);
  END IF;
  PERFORM public.cup_log(e.id, NULL, 'cup.settings', p_settings);
END $$;

CREATE FUNCTION public.add_cup_entrant(p_edition uuid, p_player uuid, p_user uuid, p_name text, p_handicap numeric) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions; p public.players; v_name text := trim(coalesce(p_name, '')); v_user uuid := p_user;
  v_player uuid := NULL; v_guest boolean := true; v_id uuid; v_registration text := 'confirmed';
BEGIN
  e := public.cup_manage_edition(p_edition, ARRAY['draft','registration','draw_ready']);
  IF p_handicap IS NULL OR p_handicap < 0 OR p_handicap > 54 OR p_handicap::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Indica un PJ de 18 hoyos entre 0 y 54';
  END IF;
  IF (SELECT count(*) FROM public.cup_entrants WHERE edition_id = e.id) >= public.cup_capacity(e.group_id) THEN
    RAISE EXCEPTION 'La Copa ya tiene el máximo de % participantes', public.cup_capacity(e.group_id);
  END IF;
  IF p_player IS NOT NULL THEN
    SELECT * INTO p FROM public.players WHERE id = p_player AND group_id = e.group_id;
    IF p.id IS NULL THEN RAISE EXCEPTION 'El jugador no pertenece al grupo'; END IF;
    v_player := p.id; v_user := p.auth_user_id; v_guest := coalesce(p.is_guest, false);
    IF v_user IS NOT NULL THEN
      SELECT coalesce(nullif(nick, ''), nullif(display_name, ''), p.name) INTO v_name FROM public.user_profiles WHERE user_id = v_user;
    ELSE
      v_name := p.name;
    END IF;
  ELSIF v_user IS NOT NULL THEN
    SELECT coalesce(nullif(nick, ''), nullif(display_name, '')) INTO v_name FROM public.user_profiles WHERE user_id = v_user;
    IF v_name IS NULL THEN RAISE EXCEPTION 'La cuenta no está disponible'; END IF;
    SELECT id INTO v_player FROM public.players WHERE group_id = e.group_id AND auth_user_id = v_user;
    v_guest := NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = e.group_id AND user_id = v_user);
  ELSIF v_name = '' THEN
    RAISE EXCEPTION 'Indica el nombre del invitado';
  END IF;
  IF e.status = 'registration' AND v_user IS NOT NULL THEN v_registration := 'pending'; END IF;
  BEGIN
    INSERT INTO public.cup_entrants(edition_id, player_id, user_id, name, playing_handicap, is_guest, registration)
    VALUES (e.id, v_player, v_user, left(v_name, 60), round(p_handicap, 1), v_guest, v_registration)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ese jugador ya está inscrito en la Copa' USING ERRCODE='23505';
  END;
  PERFORM public.cup_reset_draw(e.id);
  PERFORM public.cup_log(e.id, NULL, 'cup.entrant.added', jsonb_build_object('entrant_id', v_id, 'name', v_name, 'pj', p_handicap, 'guest', v_guest));
  IF v_registration = 'pending' THEN
    PERFORM public.cup_notify(e.id, left('Invitación: ' || e.name, 120),
      'Te han invitado a la ' || e.name || '. Entra en la Copa del grupo para confirmar tu participación.', ARRAY[v_user]);
  END IF;
  RETURN v_id;
END $$;

CREATE FUNCTION public.update_cup_entrant(p_entrant uuid, p_name text, p_handicap numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.cup_entrants; e public.cup_editions;
BEGIN
  SELECT * INTO x FROM public.cup_entrants WHERE id = p_entrant;
  IF x.id IS NULL THEN RAISE EXCEPTION 'Participante no encontrado'; END IF;
  e := public.cup_manage_edition(x.edition_id, ARRAY['draft','registration','draw_ready']);
  IF p_handicap IS NULL OR p_handicap < 0 OR p_handicap > 54 OR p_handicap::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Indica un PJ de 18 hoyos entre 0 y 54';
  END IF;
  BEGIN
    UPDATE public.cup_entrants SET playing_handicap = round(p_handicap, 1),
      name = CASE WHEN user_id IS NULL AND nullif(trim(coalesce(p_name, '')), '') IS NOT NULL THEN left(trim(p_name), 60) ELSE name END
    WHERE id = x.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya hay otro participante con ese nombre' USING ERRCODE='23505';
  END;
  PERFORM public.cup_reset_draw(e.id);
  PERFORM public.cup_log(e.id, NULL, 'cup.entrant.updated', jsonb_build_object('entrant_id', x.id, 'before', x.playing_handicap, 'after', p_handicap));
END $$;

CREATE FUNCTION public.remove_cup_entrant(p_entrant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.cup_entrants; e public.cup_editions;
BEGIN
  SELECT * INTO x FROM public.cup_entrants WHERE id = p_entrant;
  IF x.id IS NULL THEN RAISE EXCEPTION 'Participante no encontrado'; END IF;
  e := public.cup_manage_edition(x.edition_id, ARRAY['draft','registration','draw_ready']);
  DELETE FROM public.cup_entrants WHERE id = x.id;
  PERFORM public.cup_reset_draw(e.id);
  PERFORM public.cup_log(e.id, NULL, 'cup.entrant.removed', jsonb_build_object('entrant_id', x.id, 'name', x.name));
END $$;

-- Inscripciones opcionales: las cuentas confirman su participación hasta la fecha límite.
CREATE FUNCTION public.open_cup_registration(p_edition uuid, p_deadline timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions; v_recipients uuid[];
BEGIN
  e := public.cup_manage_edition(p_edition, ARRAY['draft']);
  IF p_deadline IS NOT NULL AND p_deadline <= now() THEN RAISE EXCEPTION 'La fecha límite debe ser futura'; END IF;
  UPDATE public.cup_editions SET status = 'registration', registration_deadline = p_deadline, draw_slots = NULL, updated_at = now() WHERE id = e.id;
  UPDATE public.cup_entrants SET registration = 'pending' WHERE edition_id = e.id AND user_id IS NOT NULL AND user_id <> auth.uid();
  SELECT array_agg(user_id) INTO v_recipients FROM public.cup_entrants WHERE edition_id = e.id AND registration = 'pending';
  PERFORM public.cup_notify(e.id, left('Invitación: ' || e.name, 120),
    'Te han invitado a la ' || e.name || '. Entra en la Copa del grupo para confirmar tu participación'
    || CASE WHEN p_deadline IS NULL THEN '.' ELSE ' antes del ' || to_char(p_deadline AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY') || '.' END,
    v_recipients);
  PERFORM public.cup_log(e.id, NULL, 'cup.registration.opened', jsonb_build_object('deadline', p_deadline));
END $$;

CREATE FUNCTION public.respond_cup_registration(p_edition uuid, p_accept boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() OR p_accept IS NULL THEN
    RAISE EXCEPTION 'No tienes permiso para responder' USING ERRCODE='42501';
  END IF;
  SELECT * INTO e FROM public.cup_editions WHERE id = p_edition FOR UPDATE;
  IF e.status IS DISTINCT FROM 'registration' THEN RAISE EXCEPTION 'Las inscripciones están cerradas' USING ERRCODE='55000'; END IF;
  IF e.registration_deadline IS NOT NULL AND e.registration_deadline < now() THEN
    RAISE EXCEPTION 'La fecha límite de inscripción ha pasado' USING ERRCODE='55000';
  END IF;
  UPDATE public.cup_entrants SET registration = CASE WHEN p_accept THEN 'confirmed' ELSE 'declined' END
  WHERE edition_id = e.id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'No estás invitado a esta Copa' USING ERRCODE='42501'; END IF;
  PERFORM public.cup_log(e.id, NULL, CASE WHEN p_accept THEN 'cup.registration.accepted' ELSE 'cup.registration.declined' END, '{}'::jsonb);
END $$;

-- ---------------------------------------------------------------------------
-- Sorteo: se prepara, se revisa o se rehace, y se publica.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.save_cup_draw(p_edition uuid, p_method text, p_slots uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions; v_pool uuid[]; v_count integer; v_size integer; i integer; v_capacity integer;
BEGIN
  e := public.cup_manage_edition(p_edition, ARRAY['draft','registration','draw_ready']);
  IF p_method IS NULL OR p_method NOT IN ('random','ranking','handicap','manual') THEN
    RAISE EXCEPTION 'Elige la modalidad de emparejamiento antes de generar el cuadro';
  END IF;
  SELECT array_agg(id) INTO v_pool FROM public.cup_entrants WHERE edition_id = e.id AND registration = 'confirmed';
  v_count := coalesce(cardinality(v_pool), 0);
  v_capacity := public.cup_capacity(e.group_id);
  IF v_count < 4 THEN RAISE EXCEPTION 'La Copa necesita al menos 4 participantes confirmados'; END IF;
  IF v_count > v_capacity THEN RAISE EXCEPTION 'La Copa admite como máximo % participantes', v_capacity; END IF;
  v_size := 1;
  WHILE v_size < v_count LOOP v_size := v_size * 2; END LOOP;
  IF coalesce(cardinality(p_slots), 0) <> v_size THEN RAISE EXCEPTION 'El cuadro debe tener % plazas', v_size; END IF;
  IF (SELECT count(*) FROM unnest(p_slots) s WHERE s IS NOT NULL) <> v_count
     OR (SELECT count(DISTINCT s) FROM unnest(p_slots) s WHERE s IS NOT NULL) <> v_count
     OR EXISTS (SELECT 1 FROM unnest(p_slots) s WHERE s IS NOT NULL AND NOT s = ANY(v_pool)) THEN
    RAISE EXCEPTION 'Cada participante confirmado debe ocupar una sola plaza';
  END IF;
  FOR i IN 0 .. v_size / 2 - 1 LOOP
    IF p_slots[2 * i + 1] IS NULL AND p_slots[2 * i + 2] IS NULL THEN
      RAISE EXCEPTION 'Cada cruce debe tener al menos un jugador';
    END IF;
  END LOOP;
  -- Ranking y PJ quedan fijados con el sorteo y se publican tal cual.
  UPDATE public.cup_entrants x SET rank = r.rank
  FROM (SELECT x2.id, gr.rank FROM public.cup_entrants x2
        LEFT JOIN public.cup_group_ranks(e.group_id) gr ON gr.player_id = x2.player_id AND NOT x2.is_guest
        WHERE x2.edition_id = e.id) r
  WHERE x.id = r.id;
  UPDATE public.cup_editions SET draw_method = p_method, draw_slots = p_slots, status = 'draw_ready', updated_at = now()
  WHERE id = e.id;
  PERFORM public.cup_log(e.id, NULL, 'cup.draw.saved', jsonb_build_object('method', p_method, 'slots', to_jsonb(p_slots)));
END $$;

CREATE FUNCTION public.discard_cup_draw(p_edition uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions;
BEGIN
  e := public.cup_manage_edition(p_edition, ARRAY['draw_ready']);
  PERFORM public.cup_reset_draw(e.id);
  PERFORM public.cup_log(e.id, NULL, 'cup.draw.discarded', '{}'::jsonb);
END $$;

CREATE FUNCTION public.publish_cup_draw(p_edition uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions; v_size integer; v_rounds integer := 0; v_round integer; v_count integer; i integer;
  v_recipients uuid[];
BEGIN
  e := public.cup_manage_edition(p_edition, ARRAY['draw_ready']);
  IF e.draw_slots IS NULL THEN RAISE EXCEPTION 'Genera el cuadro antes de publicarlo'; END IF;
  -- El sorteo debe seguir coincidiendo con los inscritos confirmados.
  IF (SELECT count(*) FROM unnest(e.draw_slots) s WHERE s IS NOT NULL)
     <> (SELECT count(*) FROM public.cup_entrants WHERE edition_id = e.id AND registration = 'confirmed')
     OR EXISTS (SELECT 1 FROM unnest(e.draw_slots) s WHERE s IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.cup_entrants x WHERE x.id = s AND x.edition_id = e.id AND x.registration = 'confirmed')) THEN
    PERFORM public.cup_reset_draw(e.id);
    RAISE EXCEPTION 'Los participantes han cambiado: vuelve a generar el cuadro';
  END IF;
  v_size := cardinality(e.draw_slots);
  WHILE (2 ^ v_rounds)::integer < v_size LOOP v_rounds := v_rounds + 1; END LOOP;
  FOR v_round IN 0 .. v_rounds - 1 LOOP
    v_count := v_size / (2 ^ (v_round + 1))::integer;
    FOR i IN 0 .. v_count - 1 LOOP
      INSERT INTO public.cup_matches(edition_id, code, round_index, position, best_of, entrant_a, entrant_b, next_code, next_slot, third_slot)
      VALUES (e.id, v_round || '-' || i, v_round, i,
        CASE WHEN v_round = v_rounds - 1 THEN e.final_best_of ELSE e.best_of END,
        CASE WHEN v_round = 0 THEN e.draw_slots[2 * i + 1] END,
        CASE WHEN v_round = 0 THEN e.draw_slots[2 * i + 2] END,
        CASE WHEN v_round < v_rounds - 1 THEN (v_round + 1) || '-' || (i / 2) END,
        CASE WHEN v_round < v_rounds - 1 THEN i % 2 END,
        CASE WHEN e.third_place AND v_round = v_rounds - 2 THEN i END);
    END LOOP;
  END LOOP;
  IF e.third_place THEN
    INSERT INTO public.cup_matches(edition_id, code, round_index, position, best_of)
    VALUES (e.id, 'third-place', v_rounds - 1, 1, e.best_of);
  END IF;
  UPDATE public.cup_editions SET status = 'active', published_at = now(), updated_at = now() WHERE id = e.id;
  -- Los que no confirmaron quedan fuera del cuadro.
  DELETE FROM public.cup_entrants WHERE edition_id = e.id AND registration <> 'confirmed';
  PERFORM public.cup_log(e.id, NULL, 'cup.draw.published', jsonb_build_object('slots', to_jsonb(e.draw_slots),
    'entrants', (SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'pj', playing_handicap, 'rank', rank)) FROM public.cup_entrants WHERE edition_id = e.id)));
  SELECT array_agg(user_id) INTO v_recipients FROM public.cup_entrants WHERE edition_id = e.id AND user_id IS NOT NULL;
  PERFORM public.cup_notify(e.id, left(e.name || ': cuadro publicado', 120),
    'Ya está publicado el cuadro de la ' || e.name || '. Entra en la Copa para ver tu eliminatoria.', v_recipients);
  PERFORM public.cup_refresh(e.id);
END $$;

CREATE FUNCTION public.set_cup_status(p_edition uuid, p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions; v_recipients uuid[];
BEGIN
  IF p_status = 'paused' THEN
    e := public.cup_manage_edition(p_edition, ARRAY['active']);
  ELSIF p_status = 'active' THEN
    e := public.cup_manage_edition(p_edition, ARRAY['paused']);
  ELSIF p_status = 'cancelled' THEN
    e := public.cup_manage_edition(p_edition, ARRAY['draft','registration','draw_ready','active','paused']);
  ELSIF p_status = 'draft' THEN
    e := public.cup_manage_edition(p_edition, ARRAY['registration']);
  ELSE
    RAISE EXCEPTION 'Estado no válido';
  END IF;
  UPDATE public.cup_editions SET status = p_status, updated_at = now(),
    cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE cancelled_at END,
    registration_deadline = CASE WHEN p_status = 'draft' THEN NULL ELSE registration_deadline END
  WHERE id = e.id;
  IF p_status = 'draft' THEN
    UPDATE public.cup_entrants SET registration = 'confirmed' WHERE edition_id = e.id AND registration = 'pending';
  END IF;
  PERFORM public.cup_log(e.id, NULL, 'cup.status', jsonb_build_object('before', e.status, 'after', p_status));
  IF p_status = 'cancelled' AND e.status IN ('active','paused') THEN
    SELECT array_agg(user_id) INTO v_recipients FROM public.cup_entrants WHERE edition_id = e.id AND user_id IS NOT NULL;
    PERFORM public.cup_notify(e.id, left(e.name || ': cancelada', 120), 'La ' || e.name || ' se ha cancelado. Lo jugado se conserva en el histórico.', v_recipients);
  END IF;
  IF p_status = 'active' THEN PERFORM public.cup_refresh(e.id); END IF;
END $$;

CREATE FUNCTION public.set_cup_match_deadline(p_match uuid, p_deadline timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.cup_matches; e public.cup_editions;
BEGIN
  SELECT * INTO m FROM public.cup_matches WHERE id = p_match;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Eliminatoria no encontrada'; END IF;
  e := public.cup_manage_edition(m.edition_id, ARRAY['active','paused']);
  UPDATE public.cup_matches SET deadline = p_deadline WHERE id = m.id;
  PERFORM public.cup_log(e.id, m.id, 'cup.match.deadline', jsonb_build_object('before', m.deadline, 'after', p_deadline));
END $$;

-- ---------------------------------------------------------------------------
-- Jugar: abre la tarjeta Match Play con los dos jugadores del cruce.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.start_cup_game(p_match uuid, p_course uuid, p_tee uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.cup_matches; e public.cup_editions; v_round uuid; v_existing public.golf_rounds; v_game integer;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'Inicia sesión para jugar la Copa' USING ERRCODE='42501';
  END IF;
  SELECT * INTO m FROM public.cup_matches WHERE id = p_match FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Eliminatoria no encontrada'; END IF;
  SELECT * INTO e FROM public.cup_editions WHERE id = m.edition_id FOR UPDATE;
  IF NOT (public.cup_is_manager(e.group_id) OR EXISTS (
    SELECT 1 FROM public.cup_entrants WHERE id IN (m.entrant_a, m.entrant_b) AND user_id = auth.uid())) THEN
    RAISE EXCEPTION 'Solo los jugadores de la eliminatoria o un administrador pueden jugarla' USING ERRCODE='42501';
  END IF;
  IF e.status = 'paused' THEN RAISE EXCEPTION 'La Copa está pausada' USING ERRCODE='55000'; END IF;
  IF e.status <> 'active' THEN RAISE EXCEPTION 'La Copa no está activa' USING ERRCODE='55000'; END IF;
  IF m.entrant_a IS NULL OR m.entrant_b IS NULL OR m.winner_entrant IS NOT NULL THEN
    RAISE EXCEPTION 'Esta eliminatoria no está pendiente de jugar' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_existing FROM public.golf_rounds r
  WHERE r.cup_match_id = m.id AND r.status IN ('active','completed')
    AND NOT EXISTS (SELECT 1 FROM public.cup_games g WHERE g.round_id = r.id)
  ORDER BY r.created_at DESC LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'active' THEN RETURN v_existing.id; END IF;
    RAISE EXCEPTION 'Hay una partida finalizada pendiente de registrar' USING ERRCODE='55000', HINT='cup_pending_record';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.golf_courses WHERE id = p_course) THEN RAISE EXCEPTION 'Elige un campo'; END IF;
  IF p_tee IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tees WHERE id = p_tee AND course_id = p_course) THEN
    RAISE EXCEPTION 'El recorrido no pertenece al campo';
  END IF;
  SELECT coalesce(max(game_number), 0) + 1 INTO v_game FROM public.cup_games WHERE match_id = m.id;

  PERFORM set_config('app.cup_game_start', 'on', true);
  INSERT INTO public.golf_rounds(course_id, created_by, user_id, group_id, num_holes, holes_range, use_slope, tee_id,
    game_mode, status, access_code, cup_match_id, cup_game_number)
  VALUES (p_course, NULL, auth.uid()::text, e.group_id, 18, NULL, false, p_tee,
    'match', 'active', (1000 + floor(random() * 9000))::integer::text, m.id, v_game)
  RETURNING id INTO v_round;
  PERFORM set_config('app.cup_game_start', v_round::text, true);
  -- El PJ es el fijado al publicar el cuadro (18 hoyos), sin slope ni cambios en la ficha del grupo.
  INSERT INTO public.round_players(round_id, player_id, user_id, name, exact_handicap, exact_handicap_18, playing_handicap, is_guest, cup_entrant_id)
  SELECT v_round, NULL, x.user_id, x.name, x.playing_handicap / 2, x.playing_handicap / 2, round(x.playing_handicap), x.is_guest, x.id
  FROM public.cup_entrants x
  WHERE x.id IN (m.entrant_a, m.entrant_b)
  ORDER BY (x.id = m.entrant_b);
  PERFORM set_config('app.cup_game_start', '', true);
  PERFORM public.cup_log(e.id, m.id, 'cup.game.started', jsonb_build_object('round_id', v_round, 'game', v_game));
  RETURN v_round;
END $$;

-- Registra el resultado de una partida finalizada y actualiza el cuadro en la misma transacción.
CREATE FUNCTION public.record_cup_round(p_round uuid, p_tiebreak_winner uuid DEFAULT NULL, p_decisive_hole integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.golf_rounds; m public.cup_matches; e public.cup_editions; v_game public.cup_games;
  v_pa numeric; v_pb numeric; v_played integer; v_margin integer; v_remaining integer;
  v_winner uuid; v_score text; v_hole integer := NULL;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para registrar el resultado' USING ERRCODE='42501';
  END IF;
  SELECT * INTO r FROM public.golf_rounds WHERE id = p_round FOR UPDATE;
  IF r.id IS NULL OR r.cup_match_id IS NULL THEN RAISE EXCEPTION 'No es una partida de Copa'; END IF;
  SELECT * INTO m FROM public.cup_matches WHERE id = r.cup_match_id FOR UPDATE;
  SELECT * INTO e FROM public.cup_editions WHERE id = m.edition_id FOR UPDATE;
  SELECT * INTO v_game FROM public.cup_games WHERE round_id = r.id;
  IF v_game.id IS NOT NULL THEN
    RETURN jsonb_build_object('game_id', v_game.id, 'winner', v_game.winner_entrant, 'score', v_game.score, 'replayed', true);
  END IF;
  IF r.user_id IS DISTINCT FROM auth.uid()::text AND NOT public.cup_is_manager(e.group_id) THEN
    RAISE EXCEPTION 'Solo quien apunta la partida o un administrador pueden registrar el resultado' USING ERRCODE='42501';
  END IF;
  IF r.status <> 'completed' THEN RAISE EXCEPTION 'Finaliza la partida antes de registrar el resultado' USING ERRCODE='55000'; END IF;
  IF e.status = 'paused' THEN RAISE EXCEPTION 'La Copa está pausada: no admite nuevos resultados' USING ERRCODE='55000'; END IF;
  IF e.status <> 'active' THEN RAISE EXCEPTION 'La Copa no está activa' USING ERRCODE='55000'; END IF;
  IF m.winner_entrant IS NOT NULL THEN RAISE EXCEPTION 'La eliminatoria ya está resuelta' USING ERRCODE='55000'; END IF;
  IF r.cup_game_number IS DISTINCT FROM (SELECT coalesce(max(game_number), 0) + 1 FROM public.cup_games WHERE match_id = m.id) THEN
    RAISE EXCEPTION 'El número de partido de la serie no coincide' USING ERRCODE='55000';
  END IF;
  IF (SELECT count(*) FROM public.round_players WHERE round_id = r.id AND cup_entrant_id IN (m.entrant_a, m.entrant_b)) <> 2 THEN
    RAISE EXCEPTION 'Los jugadores de la partida no coinciden con la eliminatoria';
  END IF;

  SELECT coalesce(sum(s.mode_points) FILTER (WHERE rp.cup_entrant_id = m.entrant_a), 0),
         coalesce(sum(s.mode_points) FILTER (WHERE rp.cup_entrant_id = m.entrant_b), 0)
  INTO v_pa, v_pb
  FROM public.round_players rp JOIN public.round_scores s ON s.player_id = rp.id AND s.round_id = r.id
  WHERE rp.round_id = r.id;
  SELECT count(*) INTO v_played FROM (
    SELECT s.hole_number FROM public.round_scores s
    WHERE s.round_id = r.id AND (s.abandoned = true OR s.gross_strokes > 0)
    GROUP BY s.hole_number HAVING count(*) = 2) holes;
  v_margin := round(abs(v_pa - v_pb));
  v_remaining := greatest(r.num_holes - v_played, 0);

  -- Decidida: ventaja mayor que los hoyos que quedan (3&2) o ventaja al terminar (2 UP).
  IF v_margin > v_remaining THEN
    v_winner := CASE WHEN v_pa > v_pb THEN m.entrant_a ELSE m.entrant_b END;
    v_score := CASE WHEN v_remaining = 0 THEN v_margin || ' UP' ELSE v_margin || '&' || v_remaining END;
  ELSIF v_remaining = 0 AND v_margin = 0 THEN
    IF p_tiebreak_winner IS NULL OR p_decisive_hole IS NULL THEN
      RAISE EXCEPTION 'Empate tras 18 hoyos: indica quién ganó la muerte súbita y en qué hoyo' USING HINT='cup_tie';
    END IF;
    IF p_tiebreak_winner NOT IN (m.entrant_a, m.entrant_b) OR p_decisive_hole < 19 OR p_decisive_hole > 40 THEN
      RAISE EXCEPTION 'Ganador u hoyo de desempate no válido';
    END IF;
    v_winner := p_tiebreak_winner; v_hole := p_decisive_hole;
    v_score := '1 UP (hoyo ' || p_decisive_hole || ')';
  ELSE
    RAISE EXCEPTION 'La partida aún no está decidida' USING ERRCODE='55000';
  END IF;

  INSERT INTO public.cup_games(match_id, game_number, winner_entrant, score, decisive_hole, round_id, source, recorded_by)
  VALUES (m.id, r.cup_game_number, v_winner, v_score, v_hole, r.id, 'played', auth.uid()) RETURNING * INTO v_game;
  -- Cerrada para siempre: solo consulta, nunca en archived_rounds.
  UPDATE public.golf_rounds SET status = 'archived', updated_at = now() WHERE id = r.id;
  PERFORM public.cup_log(e.id, m.id, 'cup.game.recorded', jsonb_build_object('round_id', r.id, 'game', v_game.game_number,
    'winner', v_winner, 'score', v_score, 'decisive_hole', v_hole));
  PERFORM public.cup_refresh(e.id);
  RETURN jsonb_build_object('game_id', v_game.id, 'winner', v_winner, 'score', v_score, 'replayed', false);
END $$;

-- Corrección de un resultado (creador o administradores), con recálculo y auditoría juntos.
CREATE FUNCTION public.correct_cup_game(p_match uuid, p_game integer, p_winner uuid, p_score text, p_decisive_hole integer DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.cup_matches; e public.cup_editions; g public.cup_games;
BEGIN
  SELECT * INTO m FROM public.cup_matches WHERE id = p_match FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Eliminatoria no encontrada'; END IF;
  e := public.cup_manage_edition(m.edition_id, ARRAY['active','paused','finished']);
  IF p_winner IS NULL OR p_winner NOT IN (m.entrant_a, m.entrant_b) THEN RAISE EXCEPTION 'El ganador debe ser uno de los dos jugadores'; END IF;
  IF nullif(trim(coalesce(p_score, '')), '') IS NULL OR length(trim(p_score)) > 40 THEN RAISE EXCEPTION 'Indica el marcador'; END IF;
  IF p_decisive_hole IS NOT NULL AND (p_decisive_hole < 19 OR p_decisive_hole > 40) THEN RAISE EXCEPTION 'Hoyo de desempate no válido'; END IF;
  SELECT * INTO g FROM public.cup_games WHERE match_id = m.id AND game_number = p_game FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'Ese partido no tiene resultado que corregir'; END IF;
  PERFORM public.cup_require_correctable(m);
  UPDATE public.cup_games SET winner_entrant = p_winner, score = trim(p_score), decisive_hole = p_decisive_hole,
    source = 'corrected', recorded_by = auth.uid(), recorded_at = now()
  WHERE id = g.id;
  PERFORM public.cup_require_consistent_series(m.id);
  PERFORM public.cup_log(e.id, m.id, 'cup.game.corrected', jsonb_build_object('game', p_game,
    'before', jsonb_build_object('winner', g.winner_entrant, 'score', g.score, 'decisive_hole', g.decisive_hole),
    'after', jsonb_build_object('winner', p_winner, 'score', trim(p_score), 'decisive_hole', p_decisive_hole)));
  PERFORM public.cup_refresh(e.id);
END $$;

-- Adjudicación de un cruce que no se disputa (también con la serie empezada).
CREATE FUNCTION public.award_cup_match(p_match uuid, p_winner uuid, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.cup_matches; e public.cup_editions;
BEGIN
  SELECT * INTO m FROM public.cup_matches WHERE id = p_match FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Eliminatoria no encontrada'; END IF;
  e := public.cup_manage_edition(m.edition_id, ARRAY['active','paused']);
  IF m.entrant_a IS NULL OR m.entrant_b IS NULL OR m.winner_entrant IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se adjudica una eliminatoria con dos jugadores y sin ganador' USING ERRCODE='55000';
  END IF;
  IF p_winner IS NULL OR p_winner NOT IN (m.entrant_a, m.entrant_b) THEN RAISE EXCEPTION 'El ganador debe ser uno de los dos jugadores'; END IF;
  IF EXISTS (SELECT 1 FROM public.golf_rounds r WHERE r.cup_match_id = m.id AND r.status IN ('active','completed')
             AND NOT EXISTS (SELECT 1 FROM public.cup_games g WHERE g.round_id = r.id)) THEN
    RAISE EXCEPTION 'Hay una partida de esta eliminatoria en juego o pendiente de registrar' USING ERRCODE='55000';
  END IF;
  UPDATE public.cup_matches SET awarded_entrant = p_winner, award_note = nullif(left(trim(coalesce(p_note, '')), 200), '') WHERE id = m.id;
  PERFORM public.cup_log(e.id, m.id, 'cup.match.awarded', jsonb_build_object('winner', p_winner, 'note', p_note));
  PERFORM public.cup_refresh(e.id);
END $$;

-- ---------------------------------------------------------------------------
-- Lectura
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_cup_edition(p_edition uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.cup_editions; v_manager boolean; v_ranks jsonb;
BEGIN
  SELECT * INTO e FROM public.cup_editions WHERE id = p_edition;
  IF e.id IS NULL OR NOT public.cup_can_view(e.id) THEN RAISE EXCEPTION 'Copa no disponible' USING ERRCODE='42501'; END IF;
  v_manager := public.cup_is_manager(e.group_id) AND e.status NOT IN ('finished','cancelled')
    AND NOT EXISTS (SELECT 1 FROM public.groups WHERE id = e.group_id AND archived_at IS NOT NULL);
  IF v_manager AND e.status IN ('draft','registration','draw_ready') THEN
    SELECT coalesce(jsonb_object_agg(x.id, gr.rank), '{}'::jsonb) INTO v_ranks
    FROM public.cup_entrants x JOIN public.cup_group_ranks(e.group_id) gr ON gr.player_id = x.player_id AND NOT x.is_guest
    WHERE x.edition_id = e.id;
  END IF;
  RETURN jsonb_build_object(
    'edition', to_jsonb(e) - 'created_by',
    'group_name', (SELECT coalesce(nullif(name, ''), group_code) FROM public.groups WHERE id = e.group_id),
    'capacity', public.cup_capacity(e.group_id),
    'can_manage', v_manager,
    'can_correct', public.cup_is_manager(e.group_id) AND e.status IN ('active','paused','finished'),
    'my_entrant_id', (SELECT id FROM public.cup_entrants WHERE edition_id = e.id AND user_id = auth.uid()),
    'current_ranks', coalesce(v_ranks, '{}'::jsonb),
    'entrants', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'name', x.name, 'playing_handicap', x.playing_handicap, 'is_guest', x.is_guest,
        'has_account', x.user_id IS NOT NULL, 'registration', x.registration, 'rank', x.rank, 'player_id', x.player_id,
        'avatar_url', (SELECT avatar_url FROM public.user_profiles WHERE user_id = x.user_id)) ORDER BY lower(x.name))
      FROM public.cup_entrants x WHERE x.edition_id = e.id), '[]'::jsonb),
    'matches', coalesce((SELECT jsonb_agg(to_jsonb(m) - 'edition_id' ORDER BY m.round_index, m.code = 'third-place', m.position)
      FROM public.cup_matches m WHERE m.edition_id = e.id), '[]'::jsonb),
    'games', coalesce((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'match_id', g.match_id, 'game_number', g.game_number,
        'winner_entrant', g.winner_entrant, 'score', g.score, 'decisive_hole', g.decisive_hole, 'round_id', g.round_id,
        'source', g.source, 'recorded_at', g.recorded_at) ORDER BY g.game_number)
      FROM public.cup_games g JOIN public.cup_matches m ON m.id = g.match_id WHERE m.edition_id = e.id), '[]'::jsonb),
    'rounds', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'match_id', r.cup_match_id, 'game_number', r.cup_game_number,
        'status', r.status, 'mine', r.user_id = auth.uid()::text, 'created_at', r.created_at))
      FROM public.golf_rounds r JOIN public.cup_matches m ON m.id = r.cup_match_id
      WHERE m.edition_id = e.id AND r.status IN ('active','completed')
        AND NOT EXISTS (SELECT 1 FROM public.cup_games g WHERE g.round_id = r.id)), '[]'::jsonb)
  );
END $$;

-- Copa de un grupo: edición abierta, ediciones cerradas y si se puede contratar otra.
CREATE FUNCTION public.get_group_cup_overview(p_group uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.groups; v_open public.cup_editions; v_owner boolean; v_paid boolean; v_viewer boolean;
BEGIN
  SELECT * INTO g FROM public.groups WHERE id = p_group;
  IF g.id IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Grupo no disponible' USING ERRCODE='42501'; END IF;
  v_viewer := coalesce(public.can_manage_group_messages(p_group), false) OR coalesce(public.is_group_member(p_group), false)
    OR EXISTS (SELECT 1 FROM public.cup_entrants x JOIN public.cup_editions e ON e.id = x.edition_id WHERE e.group_id = p_group AND x.user_id = auth.uid());
  IF NOT v_viewer THEN RAISE EXCEPTION 'Grupo no disponible' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_open FROM public.cup_editions WHERE group_id = p_group AND status NOT IN ('finished','cancelled');
  v_owner := g.user_auth_id = auth.uid();
  v_paid := EXISTS (SELECT 1 FROM public.user_subscriptions s WHERE s.user_id = auth.uid() AND s.status = 'active'
    AND s.plan_type IN ('team','premium') AND (s.current_period_end IS NULL OR s.current_period_end > clock_timestamp()));
  RETURN jsonb_build_object(
    'is_owner', v_owner,
    'can_purchase', v_owner AND v_paid AND v_open.id IS NULL AND g.archived_at IS NULL AND g.group_type IS DISTINCT FROM 'weekend',
    'next_number', (SELECT coalesce(max(number), 0) + 1 FROM public.cup_editions WHERE group_id = p_group),
    'open', CASE WHEN v_open.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_open.id, 'number', v_open.number, 'name', v_open.name,
      'status', v_open.status,
      'stage', (SELECT CASE WHEN min(m.round_index) IS NULL THEN NULL ELSE public.cup_round_name(min(m.round_index),
          (SELECT max(round_index) + 1 FROM public.cup_matches WHERE edition_id = v_open.id AND code <> 'third-place')) END
        FROM public.cup_matches m WHERE m.edition_id = v_open.id AND m.winner_entrant IS NULL AND m.code <> 'third-place')) END,
    'editions', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'number', e.number, 'name', e.name, 'status', e.status,
        'finished_at', e.finished_at, 'cancelled_at', e.cancelled_at,
        'champion', (SELECT name FROM public.cup_entrants WHERE id = e.champion_entrant_id)) ORDER BY e.number DESC)
      FROM public.cup_editions e WHERE e.group_id = p_group AND e.status IN ('finished','cancelled')), '[]'::jsonb)
  );
END $$;

-- Accesos de Inicio: grupos con Copa abierta para sus gestores y participantes, y si tengo partido pendiente.
CREATE FUNCTION public.list_my_cup_shortcuts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('group_id', e.group_id, 'edition_id', e.id, 'status', e.status, 'name', e.name,
    'group_name', (SELECT coalesce(nullif(g.name, ''), g.group_code) FROM public.groups g WHERE g.id = e.group_id),
    'pending', e.status = 'active' AND EXISTS (
      SELECT 1 FROM public.cup_matches m JOIN public.cup_entrants x ON x.id IN (m.entrant_a, m.entrant_b)
      WHERE m.edition_id = e.id AND x.user_id = auth.uid() AND m.winner_entrant IS NULL
        AND m.entrant_a IS NOT NULL AND m.entrant_b IS NOT NULL),
    'invited', e.status = 'registration' AND EXISTS (
      SELECT 1 FROM public.cup_entrants x WHERE x.edition_id = e.id AND x.user_id = auth.uid() AND x.registration = 'pending'))), '[]'::jsonb)
  FROM public.cup_editions e
  WHERE auth.uid() IS NOT NULL AND e.status NOT IN ('finished','cancelled')
    AND (coalesce(public.can_manage_group_messages(e.group_id), false)
      OR EXISTS (SELECT 1 FROM public.cup_entrants x WHERE x.edition_id = e.id AND x.user_id = auth.uid()))
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.guard_cup_round_link(), public.guard_cup_round_archive(), public.cup_capacity(uuid),
  public.cup_is_manager(uuid), public.cup_can_view(uuid), public.cup_manage_edition(uuid, text[]),
  public.cup_log(uuid, uuid, text, jsonb), public.cup_notify(uuid, text, text, uuid[]), public.cup_group_ranks(uuid),
  public.cup_round_name(integer, integer), public.cup_refresh(uuid), public.cup_require_correctable(public.cup_matches),
  public.cup_require_consistent_series(uuid), public.cup_reset_draw(uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.purchase_cup_edition(uuid, uuid), public.update_cup_settings(uuid, jsonb),
  public.add_cup_entrant(uuid, uuid, uuid, text, numeric), public.update_cup_entrant(uuid, text, numeric),
  public.remove_cup_entrant(uuid), public.open_cup_registration(uuid, timestamptz), public.respond_cup_registration(uuid, boolean),
  public.save_cup_draw(uuid, text, uuid[]), public.discard_cup_draw(uuid), public.publish_cup_draw(uuid),
  public.set_cup_status(uuid, text), public.set_cup_match_deadline(uuid, timestamptz), public.start_cup_game(uuid, uuid, uuid),
  public.record_cup_round(uuid, uuid, integer), public.correct_cup_game(uuid, integer, uuid, text, integer),
  public.award_cup_match(uuid, uuid, text), public.get_cup_edition(uuid), public.get_group_cup_overview(uuid),
  public.list_my_cup_shortcuts()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_cup_edition(uuid, uuid), public.update_cup_settings(uuid, jsonb),
  public.add_cup_entrant(uuid, uuid, uuid, text, numeric), public.update_cup_entrant(uuid, text, numeric),
  public.remove_cup_entrant(uuid), public.open_cup_registration(uuid, timestamptz), public.respond_cup_registration(uuid, boolean),
  public.save_cup_draw(uuid, text, uuid[]), public.discard_cup_draw(uuid), public.publish_cup_draw(uuid),
  public.set_cup_status(uuid, text), public.set_cup_match_deadline(uuid, timestamptz), public.start_cup_game(uuid, uuid, uuid),
  public.record_cup_round(uuid, uuid, integer), public.correct_cup_game(uuid, integer, uuid, text, integer),
  public.award_cup_match(uuid, uuid, text), public.get_cup_edition(uuid), public.get_group_cup_overview(uuid),
  public.list_my_cup_shortcuts()
TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
