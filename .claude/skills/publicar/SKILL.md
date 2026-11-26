---
name: publicar
description: Valida, hace commit, sube a GitHub (main) y publica la PWA en el VPS. Usar cuando el usuario diga "publica", "commit y publica", "/publicar" o similar.
---

# Publicar La Partideta / Omiki Golf

Flujo fijo para llevar a producción los cambios del árbol de trabajo. Seguir los pasos en orden y **parar** si alguno falla: informar del error con la salida real y no continuar.

## 1. Estado de partida

- `git branch --show-current` debe ser `main`. Si no, parar y preguntar.
- `git fetch origin` y `git status -sb`. Si `origin/main` va por delante, parar y avisar (no hacer pull/rebase sin permiso; conservar el trabajo del usuario).
- `git status --porcelain` y `git diff --stat`: revisar qué se va a publicar. Si no hay cambios ni commits sin subir, decir que no hay nada que publicar y terminar.
- Comprobar que no se incluyen `.env.local`, `.local/`, `supabase/.temp/`, `docs/` ni otros archivos con credenciales. Si aparece algo así, parar.

## 2. Migraciones de Supabase

- Si el cambio incluye un archivo nuevo en `supabase/migrations/`, ejecutar `npm run db:status`.
- Si hay migraciones pendientes:
  - Mostrar la simulación: `npm run db:migrate -- supabase/migrations/ARCHIVO.sql`.
  - Aplicarla con `--apply` **solo** si el usuario lo pidió explícitamente en este mensaje ("aplica y publica", "aplica la migración"). Si no, parar y preguntar antes de aplicar.
  - La migración debe aplicarse **antes** de publicar el código que depende de ella.
- No usar nunca `supabase db push`, `db reset --linked` ni registrar en bloque migraciones antiguas (ver `AGENTS.md`).

## 3. Validación local (antes del commit)

Ejecutar `npm run check` (typecheck + test:admin + test:workflow + build) y `git diff --check`. Si algo falla, parar, mostrar el error y proponer el arreglo; no hacer commit.

## 4. Commit y push

- `git add` solo de los archivos del cambio (nada de `git add -A` a ciegas si hay archivos no relacionados).
- Mensaje de commit en inglés, una línea de resumen clara en el estilo de los commits recientes (`git log --oneline -5`), más el pie de atribución que indique el sistema.
- `git push origin main`. Nunca `--force`.

## 5. Publicar

- `npm run deploy -- --apply` (ejecutar en segundo plano si se prevé que tarde más de ~2 minutos). El script vuelve a validar, comprueba que HEAD coincide con `origin/main`, actualiza el VPS, reinicia el contenedor `lapartideta-app` y verifica HTTP 200 en los dominios.
- Si falla, informar con la salida y no reintentar a ciegas.

## 6. Resumen final

Indicar en pocas líneas: hash y mensaje del commit, si se aplicó alguna migración, y que la web está publicada (o qué paso falló). No afirmar que funciona en el navegador: eso lo prueba el usuario.
