BEGIN;

-- These triggers run for ordinary Express users too. Checking administrator
-- membership inline avoids requiring anon/authenticated to execute the private
-- administration helper function.
CREATE OR REPLACE FUNCTION public.guard_round_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_is_admin boolean := EXISTS (
    SELECT 1
    FROM public.app_administrators administrator
    WHERE administrator.user_id = auth.uid()
      AND administrator.status = 'active'
  );
BEGIN
  IF NOT actor_is_admin THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.admin_withdrawn_at IS NOT NULL OR NEW.admin_previous_status IS NOT NULL THEN
        RAISE EXCEPTION 'Acceso denegado' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.admin_withdrawn_at IS DISTINCT FROM OLD.admin_withdrawn_at
         OR NEW.admin_previous_status IS DISTINCT FROM OLD.admin_previous_status
         OR OLD.admin_withdrawn_at IS NOT NULL THEN
        RAISE EXCEPTION 'Partida retirada por administración' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_express_round_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor text := coalesce(auth.uid()::text, nullif(current_setting('app.express_finish_actor', true), ''));
  actor_is_admin boolean;
BEGIN
  -- Keep the private admin lookup completely outside deletion/archive paths.
  IF OLD.group_id IS NULL AND OLD.status = 'active' AND NEW.status = 'completed' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.app_administrators administrator
      WHERE administrator.user_id = auth.uid()
        AND administrator.status = 'active'
    ) INTO actor_is_admin;

    IF NOT actor_is_admin
       AND actor IS DISTINCT FROM OLD.user_id
       AND actor IS DISTINCT FROM OLD.responsible_user_id THEN
      RAISE EXCEPTION 'Solo el creador o el responsable puede finalizar la partida Express';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_round_admin_fields(), public.guard_express_round_completion()
FROM PUBLIC, anon, authenticated;

COMMIT;
