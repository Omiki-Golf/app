import {
  body,
  HttpError,
  rateLimit,
  serve,
  uuidValue,
} from "../_shared/admin.ts";
serve(async (req, api) => {
  const input = await body(req);
  if (!["register", "inbox", "open", "delete", "delete_all"].includes(String(input.action)))
    throw new HttpError(400, "Acción no válida.");
  if (typeof input.secret !== "string" || !/^[0-9a-f]{64}$/.test(input.secret))
    throw new HttpError(401, "Buzón no disponible.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input.secret),
  );
  const hash = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  await rateLimit(api.service, `message-box:${hash}`, 100, 60);
  await rateLimit(api.service, "message-box:global", 1000, 60);
  if (input.action === "register") {
    await rateLimit(api.service, "message-box:create-minute", 100, 60);
    await rateLimit(api.service, "message-box:create-hour", 1000, 3600);
    const { data, error } = await api.service.rpc("register_message_box", {
      p_hash: hash,
    });
    if (error) throw new HttpError(503, "No se pudo crear el buzón.");
    return { id: data };
  }
  const id = uuidValue(input.id);
  if (input.action === "delete" || input.action === "delete_all") {
    const { data, error } = await api.service.rpc("express_message_delete", {
      p_id: id,
      p_hash: hash,
      p_delivery: input.action === "delete" ? uuidValue(input.delivery) : null,
    });
    if (error)
      throw new HttpError(error.code === "42501" ? 403 : 503, "No se pudo eliminar el mensaje.");
    return { deleted: data };
  }
  const page = input.page ?? 0;
  if (!Number.isInteger(page) || Number(page) < 0 || Number(page) > 100000)
    throw new HttpError(400, "Página no válida.");
  const { data, error } = await api.service.rpc("express_message_request", {
    p_id: id,
    p_hash: hash,
    p_delivery: input.action === "open" ? uuidValue(input.delivery) : null,
    p_page: page,
  });
  if (error)
    throw new HttpError(
      error.code === "42501" ? 403 : 503,
      "No se pudo acceder al mensaje o al buzón.",
    );
  return data;
});
