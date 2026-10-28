CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.uid',true),'')::uuid $$;
CREATE TABLE public.app_user_restrictions(user_id uuid PRIMARY KEY,read_only boolean);
CREATE TABLE public.user_subscriptions(user_id uuid PRIMARY KEY,plan_type text,status text,current_period_end timestamptz,team_trial_ends_at timestamptz);
CREATE FUNCTION public.is_app_user_read_only() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT read_only FROM public.app_user_restrictions WHERE user_id=auth.uid()),false) $$;
CREATE TABLE public.app_administrators(user_id uuid PRIMARY KEY,status text,alias text);
CREATE TABLE public.groups(id uuid PRIMARY KEY,user_auth_id uuid,archived_at timestamptz);
CREATE TABLE public.group_members(group_id uuid,user_id uuid,role text);
CREATE FUNCTION public.is_group_member(g uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=g AND user_id=auth.uid()) $$;
CREATE FUNCTION public.can_manage_group_messages(g uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.groups WHERE id=g AND user_auth_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.group_members WHERE group_id=g AND user_id=auth.uid() AND role='admin') $$;
CREATE TABLE public.golf_rounds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text,group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
 course_id uuid,num_holes integer DEFAULT 9,holes_range text,use_slope boolean,tee_id uuid,created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 status text DEFAULT 'active',access_code text DEFAULT 'TEST',admin_withdrawn_at timestamptz,admin_previous_status text,
 completed_at timestamptz,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),decided_result jsonb,decided_at timestamptz);
CREATE TABLE public.round_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid REFERENCES public.golf_rounds(id) ON DELETE CASCADE,
 player_id uuid,user_id uuid,name text DEFAULT 'Jugador',playing_handicap integer DEFAULT 0);
CREATE TABLE public.round_scores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid REFERENCES public.golf_rounds(id) ON DELETE CASCADE,
 player_id uuid REFERENCES public.round_players(id) ON DELETE CASCADE,hole_number integer,gross_strokes integer CHECK(gross_strokes>=0),
 strokes_received integer,net_strokes integer,stableford_points integer,no_paso_rojas boolean DEFAULT false,spanish_hands boolean DEFAULT false,
 abandoned boolean DEFAULT false,mode_points numeric DEFAULT 0,updated_at timestamptz DEFAULT now(),UNIQUE(round_id,player_id,hole_number));
CREATE TABLE public.completed_rounds_summary(id uuid DEFAULT gen_random_uuid(),user_id text);
CREATE TABLE public.app_admin_audit(actor_user_id uuid,actor_alias text,action text,target_user_id uuid,details jsonb);
ALTER TABLE public.golf_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY historical_rounds ON public.golf_rounds FOR ALL TO public USING(true) WITH CHECK(true);
CREATE POLICY historical_players ON public.round_players FOR ALL TO public USING(true) WITH CHECK(true);
CREATE POLICY historical_scores ON public.round_scores FOR ALL TO public USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT ALL ON public.golf_rounds,public.round_players,public.round_scores TO anon,authenticated;
CREATE FUNCTION public.guard_express_round_completion() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
CREATE TRIGGER guard_express_round_completion BEFORE UPDATE OF status ON public.golf_rounds FOR EACH ROW EXECUTE FUNCTION public.guard_express_round_completion();
CREATE FUNCTION public.guard_round_admin_fields() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
CREATE TRIGGER guard_round_admin_fields BEFORE INSERT OR UPDATE ON public.golf_rounds FOR EACH ROW EXECUTE FUNCTION public.guard_round_admin_fields();
CREATE FUNCTION public.admin_get_app_round(r uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT to_jsonb(g) FROM public.golf_rounds g WHERE id=r$$;
INSERT INTO auth.users(id,email_confirmed_at) VALUES
 ('00000000-0000-4000-8000-000000000001',now()),('00000000-0000-4000-8000-000000000002',now()),('00000000-0000-4000-8000-000000000003',now());
INSERT INTO public.app_administrators VALUES('00000000-0000-4000-8000-000000000003','active','admin-test');
INSERT INTO public.groups VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',NULL);
INSERT INTO public.group_members VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','member');
INSERT INTO public.user_subscriptions VALUES('00000000-0000-4000-8000-000000000001','player','active',NULL,NULL);
