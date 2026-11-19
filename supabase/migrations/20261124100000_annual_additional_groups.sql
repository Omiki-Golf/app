-- Grupo Adicional anual, ligado al grupo que ocupa su hueco.
--  * Cada Grupo Adicional es un hueco (additional_group_slots) que vence a los 12 meses
--    de comprarlo, se renueva solo (pago de prueba) salvo que el creador elija «No renovar»,
--    y avisa 15 días antes en la app.
--  * El primer grupo Team/Premium del plan no ocupa hueco; cada grupo más ocupa uno vigente.
--  * Si un Grupo Adicional no se renueva, se archiva solo su grupo. Si el creador archiva o
--    borra ese grupo, el hueco queda libre hasta su vencimiento.
--  * Si el Team vence (más de 24 h sin renovar), se archivan todos sus grupos Team/Premium y
--    se cierran sus Grupos Adicionales. Los Weekend siguen hasta su propia fecha.
--  * La Ampliación de Plantilla es del grupo y sigue con él mientras exista.

BEGIN;

CREATE TABLE IF NOT EXISTS public.additional_group_slots(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES public.pro_shop_purchases(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  expires_at timestamptz NOT NULL,
  renew boolean NOT NULL DEFAULT true,
  renewed_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS additional_group_slots_owner_idx ON public.additional_group_slots(owner_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS additional_group_slots_group_idx ON public.additional_group_slots(group_id);
ALTER TABLE public.additional_group_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS additional_group_slots_select_own ON public.additional_group_slots;
CREATE POLICY additional_group_slots_select_own ON public.additional_group_slots
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.additional_group_slots FROM anon, authenticated;
GRANT SELECT ON public.additional_group_slots TO authenticated;

-- Compras ya hechas: vencen a los 12 meses de la compra y se ligan, en orden, a los grupos
-- Team/Premium activos de su dueño que no son el primero del plan.
INSERT INTO public.additional_group_slots(owner_id, purchase_id, expires_at, created_at)
SELECT owned.user_auth_id, purchase.id, coalesce(purchase.created_at, now()) + interval '1 year', coalesce(purchase.created_at, now())
FROM public.pro_shop_purchases purchase
JOIN public.groups owned ON owned.id = purchase.group_id
WHERE purchase.product_type = 'grupo-adicional' AND purchase.status = 'completed'
  AND owned.user_auth_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.additional_group_slots s WHERE s.purchase_id = purchase.id);

WITH plan_groups AS (
  SELECT g.id, g.user_auth_id,
         row_number() OVER (PARTITION BY g.user_auth_id ORDER BY g.premium_branding IS TRUE DESC, g.created_at, g.id) AS rn
  FROM public.groups g
  WHERE g.archived_at IS NULL AND g.group_type IS DISTINCT FROM 'weekend' AND g.user_auth_id IS NOT NULL
), slots AS (
  SELECT s.id, s.owner_id, row_number() OVER (PARTITION BY s.owner_id ORDER BY s.created_at, s.id) AS rn
  FROM public.additional_group_slots s WHERE s.ended_at IS NULL AND s.group_id IS NULL
)
UPDATE public.additional_group_slots target SET group_id = plan_groups.id
FROM slots JOIN plan_groups ON plan_groups.user_auth_id = slots.owner_id AND plan_groups.rn = slots.rn + 1
WHERE target.id = slots.id;

-- Hueco libre: vigente y sin grupo activo del plan que lo ocupe (o ya ocupado por p_group).
CREATE OR REPLACE FUNCTION public.free_additional_group_slot(p_owner uuid, p_group uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT s.id FROM public.additional_group_slots s
  WHERE s.owner_id = p_owner AND s.ended_at IS NULL AND s.expires_at > clock_timestamp()
    AND (s.group_id IS NULL OR s.group_id = p_group OR NOT EXISTS(
      SELECT 1 FROM public.groups g
      WHERE g.id = s.group_id AND g.archived_at IS NULL AND g.user_auth_id = p_owner
        AND g.group_type IS DISTINCT FROM 'weekend'))
  ORDER BY (s.group_id = p_group) DESC NULLS LAST, s.expires_at DESC, s.id
  LIMIT 1
$$;

-- Grupos activos del plan que no ocupan ningún Grupo Adicional vigente (el «incluido»).
CREATE OR REPLACE FUNCTION public.unslotted_plan_groups(p_owner uuid, p_except uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT count(*)::integer FROM public.groups g
  WHERE g.user_auth_id = p_owner AND g.archived_at IS NULL AND g.id IS DISTINCT FROM p_except
    AND g.group_type IS DISTINCT FROM 'weekend'
    AND NOT EXISTS(
      SELECT 1 FROM public.additional_group_slots s
      WHERE s.group_id = g.id AND s.owner_id = p_owner AND s.ended_at IS NULL AND s.expires_at > clock_timestamp())
$$;
REVOKE ALL ON FUNCTION public.free_additional_group_slot(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.unslotted_plan_groups(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_one_active_owned_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_weekend_until timestamptz;
  v_weekend7 timestamptz;
  v_weekend90 timestamptz;
  v_plan text;
  v_status text;
  v_period_end timestamptz;
  v_trial_end timestamptz;
  v_paid_team boolean := false;
  v_effective_team boolean := false;
  v_slot uuid;
BEGIN
  IF NEW.user_auth_id IS NULL OR NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT plan_type,status,current_period_end,team_trial_ends_at,weekend7_until,weekend90_until
  INTO v_plan,v_status,v_period_end,v_trial_end,v_weekend7,v_weekend90
  FROM public.user_subscriptions WHERE user_id=NEW.user_auth_id;

  IF NEW.group_type='weekend' THEN
    NEW.premium_branding:=false;
    IF TG_OP='INSERT' OR OLD.group_type IS DISTINCT FROM 'weekend' THEN
      IF NEW.weekend_days IS NULL THEN NEW.weekend_days:=7; END IF;
      v_weekend_until:=CASE WHEN NEW.weekend_days=90 THEN v_weekend90 ELSE v_weekend7 END;
      IF v_weekend_until IS NULL OR v_weekend_until<=clock_timestamp() THEN
        RAISE EXCEPTION 'Necesitas un Weekend activo para crear este grupo.';
      END IF;
      -- Cada Weekend da un solo grupo, aunque se haya archivado antes de vencer.
      IF EXISTS(
        SELECT 1 FROM public.groups g
        WHERE g.user_auth_id=NEW.user_auth_id AND g.id<>NEW.id AND g.group_type='weekend'
          AND g.weekend_days=NEW.weekend_days AND g.weekend_mode_until=v_weekend_until
      ) THEN RAISE EXCEPTION 'Este Weekend ya tiene su grupo.'; END IF;
      NEW.weekend_mode_until:=v_weekend_until;
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.groups g
      WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL AND g.id<>NEW.id
        AND g.group_type='weekend' AND g.weekend_days=NEW.weekend_days
        AND g.weekend_mode_until>clock_timestamp()
    ) THEN RAISE EXCEPTION 'Ya tienes un grupo Weekend activo de esa duración.'; END IF;
    RETURN NEW;
  END IF;

  v_paid_team := v_status='active'
    AND v_plan IN ('team','premium')
    AND (v_period_end IS NULL OR v_period_end>clock_timestamp());
  v_effective_team := v_paid_team OR (
    v_status='active' AND v_plan='player' AND v_trial_end>clock_timestamp()
  );
  IF NOT v_effective_team THEN
    RAISE EXCEPTION 'Necesitas un plan Team o Premium para crear un grupo.' USING ERRCODE='42501';
  END IF;

  IF TG_OP='INSERT' THEN
    -- El primer hueco de Premium es rosa. Cualquier hueco comprado después es Team verde.
    NEW.premium_branding := v_paid_team AND v_plan='premium' AND NOT EXISTS(
      SELECT 1 FROM public.groups g
      WHERE g.user_auth_id=NEW.user_auth_id AND g.archived_at IS NULL
        AND g.group_type IS DISTINCT FROM 'weekend' AND g.premium_branding
    );
  END IF;

  -- El grupo incluido en el plan no ocupa hueco. Cada grupo más ocupa un Grupo Adicional vigente.
  IF public.unslotted_plan_groups(NEW.user_auth_id, NEW.id)=0 THEN RETURN NEW; END IF;
  IF v_paid_team THEN v_slot := public.free_additional_group_slot(NEW.user_auth_id, NEW.id); END IF;
  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'Tu plan no dispone de más grupos activos.' USING ERRCODE='23505';
  END IF;
  UPDATE public.additional_group_slots SET group_id=NEW.id, updated_at=now()
  WHERE id=v_slot AND group_id IS DISTINCT FROM NEW.id;
  RETURN NEW;
END $$;

-- Compra de un Grupo Adicional (pago de prueba): un hueco anual que se renueva solo.
CREATE OR REPLACE FUNCTION public.add_additional_group_for_testing()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_anchor uuid; v_count integer; v_purchase uuid;
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para activar ampliaciones' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.user_subscriptions subscription
    WHERE subscription.user_id=auth.uid() AND subscription.status='active'
      AND subscription.plan_type IN ('team','premium')
      AND (subscription.current_period_end IS NULL OR subscription.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Pasa a Team completo para contratar Grupos Adicionales.' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(20261021,140000);
  SELECT g.id INTO v_anchor FROM public.groups g
  WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL
    AND g.group_type IS DISTINCT FROM 'weekend'
  ORDER BY g.premium_branding DESC,g.created_at,g.id LIMIT 1 FOR UPDATE;
  IF v_anchor IS NULL THEN RAISE EXCEPTION 'Crea primero tu Team o Premium.'; END IF;

  SELECT count(*) INTO v_count FROM public.additional_group_slots s
  WHERE s.owner_id=auth.uid() AND s.ended_at IS NULL AND s.expires_at>clock_timestamp();
  IF v_count>=2 THEN
    RAISE EXCEPTION 'Ya tienes tus 2 Grupos Adicionales: tu plan admite 3 grupos.' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
  VALUES(v_anchor,auth.uid(),'grupo-adicional',0,'test','completed') RETURNING id INTO v_purchase;
  INSERT INTO public.additional_group_slots(owner_id,purchase_id,expires_at)
  VALUES(auth.uid(),v_purchase,clock_timestamp()+interval '1 year');
  RETURN v_count+1;
END $$;

-- Pasa un grupo Weekend de 3 meses a Team. Sin hueco libre, contrata un Grupo Adicional.
CREATE OR REPLACE FUNCTION public.convert_weekend_group_to_team(p_group uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_group public.groups%ROWTYPE;
  v_groups integer;
  v_anchor uuid;
  v_purchase uuid;
  v_result text := 'free';
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar este grupo' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_group FROM public.groups WHERE id=p_group FOR UPDATE;
  IF v_group.id IS NULL OR v_group.user_auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo el creador puede pasar este grupo a Team' USING ERRCODE='42501';
  END IF;
  IF v_group.group_type IS DISTINCT FROM 'weekend' OR v_group.weekend_days IS DISTINCT FROM 90
    OR v_group.archived_at IS NOT NULL OR v_group.weekend_mode_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'Solo un grupo Weekend de 3 meses activo puede pasar a Team.';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.user_subscriptions s
    WHERE s.user_id=auth.uid() AND s.status='active' AND s.plan_type IN ('team','premium')
      AND (s.current_period_end IS NULL OR s.current_period_end>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Necesitas un plan Team para pasar este grupo a Team.' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(20261021,140000);
  SELECT count(*) INTO v_groups FROM public.groups g
  WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL AND g.group_type IS DISTINCT FROM 'weekend';
  IF v_groups>=3 THEN
    RAISE EXCEPTION 'Ya tienes tus 3 grupos Team: no puedes pasar este Weekend a Team.' USING ERRCODE='23505';
  END IF;
  IF public.unslotted_plan_groups(auth.uid(), p_group)>0 AND public.free_additional_group_slot(auth.uid(), p_group) IS NULL THEN
    -- Sin hueco libre: se contrata un Grupo Adicional (pago de prueba, como el Pro-Shop).
    SELECT g.id INTO v_anchor FROM public.groups g
    WHERE g.user_auth_id=auth.uid() AND g.archived_at IS NULL AND g.group_type IS DISTINCT FROM 'weekend'
    ORDER BY g.premium_branding DESC,g.created_at,g.id LIMIT 1;
    INSERT INTO public.pro_shop_purchases(group_id,purchased_by,product_type,amount_paid,payment_method,status)
    VALUES(v_anchor,auth.uid(),'grupo-adicional',0,'test','completed') RETURNING id INTO v_purchase;
    INSERT INTO public.additional_group_slots(owner_id,purchase_id,expires_at)
    VALUES(auth.uid(),v_purchase,clock_timestamp()+interval '1 year');
    v_result := 'additional';
  END IF;

  -- El cambio de tipo pasa por guard_one_active_owned_group, que liga el grupo a su hueco.
  UPDATE public.groups SET group_type='team',weekend_mode_until=NULL,weekend_days=NULL,premium_branding=false
  WHERE id=p_group;

  -- Conserva los títulos y ampliaciones que compró como Weekend: es el mismo grupo.
  RETURN v_result;
END $$;

-- «Renovar» o «No renovar» un Grupo Adicional. Solo su dueño.
CREATE OR REPLACE FUNCTION public.set_additional_group_renewal(p_slot uuid, p_renew boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_app_user_read_only() THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar la renovación' USING ERRCODE='42501';
  END IF;
  UPDATE public.additional_group_slots SET renew=coalesce(p_renew,true), updated_at=now()
  WHERE id=p_slot AND owner_id=auth.uid() AND ended_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este Grupo Adicional ya no está activo.' USING ERRCODE='42501';
  END IF;
END $$;

-- Desde cuándo se aplica el archivado por Team vencido: lo que venció antes no se toca.
CREATE TABLE IF NOT EXISTS public.billing_rules(key text PRIMARY KEY, starts_at timestamptz NOT NULL);
ALTER TABLE public.billing_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_rules FROM anon, authenticated;
INSERT INTO public.billing_rules(key, starts_at) VALUES ('archive_groups_on_team_expiry', now())
ON CONFLICT (key) DO NOTHING;

-- Cuándo perdió el acceso a Team (más de 24 h sin plan), o null si lo tiene o no hay datos.
CREATE OR REPLACE FUNCTION public.team_access_ended_at(p_user uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT ended FROM (
    SELECT CASE
      WHEN s.status='active' AND s.plan_type IN ('team','premium')
           AND (s.current_period_end IS NULL OR s.current_period_end > clock_timestamp() - interval '24 hours') THEN NULL
      WHEN s.status='active' AND s.plan_type='player'
           AND s.team_trial_ends_at > clock_timestamp() - interval '24 hours' THEN NULL
      WHEN s.plan_type IN ('team','premium') THEN s.current_period_end
      ELSE s.team_trial_ends_at
    END AS ended
    FROM public.user_subscriptions s WHERE s.user_id = p_user
  ) access
  WHERE ended IS NOT NULL
    AND ended >= (SELECT r.starts_at FROM public.billing_rules r WHERE r.key='archive_groups_on_team_expiry')
    AND NOT EXISTS(SELECT 1 FROM public.app_administrators a WHERE a.user_id = p_user)
$$;
REVOKE ALL ON FUNCTION public.team_access_ended_at(uuid) FROM PUBLIC,anon,authenticated;

-- Archiva un grupo como al hacerlo a mano: primero cancela las invitaciones pendientes.
CREATE OR REPLACE FUNCTION public.archive_group_for_billing(p_group uuid, p_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  DELETE FROM public.group_invitations WHERE group_id=p_group AND status='pending'
    AND EXISTS(SELECT 1 FROM public.groups WHERE id=p_group AND archived_at IS NULL);
  UPDATE public.groups SET archived_at=least(coalesce(p_at,clock_timestamp()),clock_timestamp())
  WHERE id=p_group AND archived_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.archive_group_for_billing(uuid,timestamptz) FROM PUBLIC,anon,authenticated;

-- Tarea periódica: Teams vencidos y Grupos Adicionales que llegan a su fecha.
CREATE OR REPLACE FUNCTION public.process_additional_groups() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  owner record; slot record; v_group uuid; v_paid boolean; v_changes integer := 0;
BEGIN
  IF public.is_app_user_read_only() THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(20261021,140000);

  -- 1. Team vencido: se archivan todos sus grupos Team/Premium y se cierran sus huecos.
  FOR owner IN
    SELECT DISTINCT g.user_auth_id AS id FROM public.groups g
    WHERE g.archived_at IS NULL AND g.group_type IS DISTINCT FROM 'weekend' AND g.user_auth_id IS NOT NULL
      AND public.team_access_ended_at(g.user_auth_id) IS NOT NULL
  LOOP
    FOR v_group IN SELECT id FROM public.groups
      WHERE user_auth_id=owner.id AND archived_at IS NULL AND group_type IS DISTINCT FROM 'weekend' LOOP
      PERFORM public.archive_group_for_billing(v_group, clock_timestamp());
      v_changes := v_changes + 1;
    END LOOP;
    UPDATE public.additional_group_slots SET ended_at=clock_timestamp(), updated_at=now()
    WHERE owner_id=owner.id AND ended_at IS NULL;
  END LOOP;

  -- 2. Grupos Adicionales vencidos: se renuevan (pago de prueba) o se archiva su grupo.
  FOR slot IN
    SELECT * FROM public.additional_group_slots
    WHERE ended_at IS NULL AND expires_at<=clock_timestamp() ORDER BY expires_at FOR UPDATE
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM public.user_subscriptions s
      WHERE s.user_id=slot.owner_id AND s.status='active' AND s.plan_type IN ('team','premium')
        AND (s.current_period_end IS NULL OR s.current_period_end>clock_timestamp())
    ) INTO v_paid;
    IF slot.renew AND v_paid THEN
      UPDATE public.additional_group_slots
      SET expires_at=slot.expires_at + make_interval(years => date_part('year', age(clock_timestamp(), slot.expires_at))::int + 1),
          renewed_at=clock_timestamp(), updated_at=now()
      WHERE id=slot.id;
    ELSE
      IF slot.group_id IS NOT NULL THEN
        PERFORM public.archive_group_for_billing(slot.group_id, slot.expires_at);
      END IF;
      UPDATE public.additional_group_slots SET ended_at=clock_timestamp(), updated_at=now() WHERE id=slot.id;
    END IF;
    v_changes := v_changes + 1;
  END LOOP;
  RETURN v_changes;
END $$;
REVOKE ALL ON FUNCTION public.process_additional_groups() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_additional_groups() TO authenticated;

-- Herederos en la baja: misma regla de huecos que guard_one_active_owned_group.
CREATE OR REPLACE FUNCTION public.account_deletion_heir(p_group uuid, p_leaver uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT m.user_id
  FROM public.group_members m
  JOIN public.groups g ON g.id=m.group_id
  JOIN public.user_subscriptions s ON s.user_id=m.user_id
  WHERE m.group_id=p_group AND m.user_id IS NOT NULL AND m.user_id<>p_leaver
    AND s.status='active' AND s.plan_type IN ('team','premium')
    AND (s.current_period_end IS NULL OR s.current_period_end>clock_timestamp())
    AND CASE WHEN g.group_type='weekend' THEN NOT EXISTS(
          SELECT 1 FROM public.groups o
          WHERE o.user_auth_id=m.user_id AND o.archived_at IS NULL AND o.id<>g.id
            AND o.group_type='weekend' AND o.weekend_days=g.weekend_days
            AND o.weekend_mode_until>clock_timestamp())
        ELSE public.unslotted_plan_groups(m.user_id, g.id)=0
          OR public.free_additional_group_slot(m.user_id, g.id) IS NOT NULL END
  ORDER BY (m.role='admin') DESC, m.joined_at, m.user_id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.account_deletion_heir(uuid,uuid) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.add_additional_group_for_testing() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_additional_group_for_testing() TO authenticated;
REVOKE ALL ON FUNCTION public.convert_weekend_group_to_team(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.convert_weekend_group_to_team(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_additional_group_renewal(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_additional_group_renewal(uuid,boolean) TO authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('process-additional-groups', '*/5 * * * *', 'SELECT public.process_additional_groups()');

COMMIT;
