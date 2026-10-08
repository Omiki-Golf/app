-- Recipients may remove their own deliveries without deleting the source message
-- or affecting any other recipient.

CREATE OR REPLACE FUNCTION public.message_delete(p_kind text, p_recipient uuid, p_delivery uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.app_message_deliveries
  WHERE id = p_delivery AND kind = p_kind AND recipient_id = p_recipient;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensaje no encontrado' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.message_delete_all(p_kind text, p_recipient uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE deleted integer;
BEGIN
  DELETE FROM public.app_message_deliveries
  WHERE kind = p_kind AND recipient_id = p_recipient;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_message_delete(p_delivery uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión' USING ERRCODE = '42501';
  END IF;
  RETURN public.message_delete('user', auth.uid(), p_delivery);
END;
$$;

CREATE OR REPLACE FUNCTION public.my_message_delete_all()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión' USING ERRCODE = '42501';
  END IF;
  RETURN public.message_delete_all('user', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.express_message_delete(
  p_id uuid,
  p_hash text,
  p_delivery uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_message_boxes
    WHERE id = p_id AND secret_hash = p_hash
  ) THEN
    RAISE EXCEPTION 'Buzón no disponible' USING ERRCODE = '42501';
  END IF;
  IF p_delivery IS NULL THEN
    RETURN public.message_delete_all('express', p_id);
  END IF;
  PERFORM public.message_delete('express', p_id, p_delivery);
  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.message_delete(text,uuid,uuid),
  public.message_delete_all(text,uuid),public.my_message_delete(uuid),
  public.my_message_delete_all(),public.express_message_delete(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.my_message_delete(uuid),public.my_message_delete_all()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.express_message_delete(uuid,text,uuid)
  TO service_role;

