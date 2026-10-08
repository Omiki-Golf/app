export const LOCAL_AI_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_LOCAL_AI === 'true';
export const LOCAL_AI_MODEL = import.meta.env.VITE_LOCAL_AI_MODEL || 'llama3.2';
