# Prueba de IA local

Este directorio solo pertenece a la rama `experiment/local-ai`. La funcionalidad queda desactivada salvo que Vite reciba `VITE_ENABLE_LOCAL_AI=true`; además, `config.ts` exige modo desarrollo, por lo que una compilación de producción no puede activarla accidentalmente.

## Arranque

1. Instalar Ollama y descargar el modelo: `ollama pull llama3.2`.
2. Mantener Ollama abierto.
3. Desde el worktree `project-local-ai`, ejecutar en PowerShell:

   `$env:VITE_ENABLE_LOCAL_AI='true'; node node_modules/vite/bin/vite.js --port 5174 --strictPort`

4. Abrir `http://localhost:5174`.

El proxy de Vite conecta `/local-ai` con `http://127.0.0.1:11434`; ninguna clave ni audio se guarda en Supabase. El análisis de estadísticas sí es completamente local. La primera prueba de dictado usa `SpeechRecognition` del navegador, que en algunos navegadores puede recurrir a un servicio remoto; siempre puede escribirse la orden manualmente.

## Aislamiento

- No hay migraciones.
- No se modifica producción.
- `main` se trabaja desde el directorio `project` habitual.
- La demo se trabaja desde `project-local-ai` y la rama `experiment/local-ai`.
- Para llevar solo una parte a producción se seleccionan commits concretos (`git cherry-pick`) después de revisar la decisión con el socio.
