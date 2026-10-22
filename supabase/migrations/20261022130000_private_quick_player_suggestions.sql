BEGIN;

CREATE TABLE public.quick_player_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  handicap_18 numeric NOT NULL CHECK(handicap_18 BETWEEN 0 AND 54),
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id,normalized_name)
);

ALTER TABLE public.quick_player_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY quick_player_suggestions_owner_select ON public.quick_player_suggestions FOR SELECT TO authenticated USING(owner_user_id=auth.uid());

INSERT INTO public.quick_player_suggestions(owner_user_id,name,normalized_name,handicap_18,created_at,updated_at)
SELECT DISTINCT ON (owner_id,lower(trim(rp.name))) owner_id,trim(rp.name),lower(trim(rp.name)),least(54,greatest(0,coalesce(rp.exact_handicap_18,rp.exact_handicap,0)*2)),rp.created_at,rp.created_at
FROM public.round_players rp
JOIN public.golf_rounds r ON r.id=rp.round_id
CROSS JOIN LATERAL (
 SELECT coalesce(r.created_by,CASE WHEN coalesce(r.user_id,'')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN r.user_id::uuid END) owner_id
) owner
JOIN auth.users account_owner ON account_owner.id=owner_id
LEFT JOIN public.user_profiles up ON up.user_id=owner_id
WHERE r.group_id IS NULL AND owner_id IS NOT NULL AND nullif(trim(rp.name),'') IS NOT NULL
  AND lower(trim(rp.name)) NOT IN (lower(coalesce(up.nick,'')),lower(coalesce(up.display_name,'')))
ORDER BY owner_id,lower(trim(rp.name)),rp.created_at DESC
ON CONFLICT(owner_user_id,normalized_name) DO NOTHING;

CREATE FUNCTION public.list_my_quick_player_suggestions() RETURNS SETOF public.quick_player_suggestions
LANGUAGE sql SECURITY DEFINER SET search_path='' STABLE AS $$
 SELECT q FROM public.quick_player_suggestions q WHERE q.owner_user_id=auth.uid() AND q.hidden_at IS NULL ORDER BY lower(q.name),q.created_at;
$$;

CREATE FUNCTION public.save_my_quick_player_suggestion(p_name text,p_handicap_18 numeric) RETURNS public.quick_player_suggestions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.quick_player_suggestions; v_name text:=trim(p_name); v_normalized text:=lower(trim(p_name));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión para guardar jugadores' USING ERRCODE='42501'; END IF;
 IF nullif(v_name,'') IS NULL OR length(v_name)>60 THEN RAISE EXCEPTION 'Indica un nombre válido'; END IF;
 IF p_handicap_18 IS NULL OR p_handicap_18<0 OR p_handicap_18>54 OR p_handicap_18::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Indica un hándicap de 18 hoyos entre 0 y 54'; END IF;
 INSERT INTO public.quick_player_suggestions(owner_user_id,name,normalized_name,handicap_18)
 VALUES(auth.uid(),v_name,v_normalized,p_handicap_18)
 ON CONFLICT(owner_user_id,normalized_name) DO UPDATE SET name=excluded.name,handicap_18=excluded.handicap_18,hidden_at=NULL,updated_at=now()
 RETURNING * INTO q;
 RETURN q;
END $$;

CREATE FUNCTION public.hide_my_quick_player_suggestion(p_suggestion uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.quick_player_suggestions SET hidden_at=now(),updated_at=now() WHERE id=p_suggestion AND owner_user_id=auth.uid() AND hidden_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'La sugerencia ya no está disponible'; END IF;
END $$;

REVOKE ALL ON TABLE public.quick_player_suggestions FROM PUBLIC,anon;
GRANT SELECT ON TABLE public.quick_player_suggestions TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_quick_player_suggestions() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_my_quick_player_suggestion(text,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hide_my_quick_player_suggestion(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_quick_player_suggestions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_quick_player_suggestion(text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_my_quick_player_suggestion(uuid) TO authenticated;

COMMIT;
