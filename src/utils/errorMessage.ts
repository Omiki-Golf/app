export const getErrorMessage = (cause: unknown, fallback: string): string => {
  if (cause instanceof Error && cause.message) return cause.message;
  if (
    typeof cause === 'object'
    && cause !== null
    && 'message' in cause
    && typeof cause.message === 'string'
  ) {
    return cause.message;
  }
  return fallback;
};
