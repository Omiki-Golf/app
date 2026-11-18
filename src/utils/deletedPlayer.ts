/** Marca que lleva delante el nombre de un jugador que se dio de baja (ver deleted_player_name en SQL). */
export const DELETED_PLAYER_MARK = '☠ ';

/** Separa la marca de baja del nick: «☠ Kikeas01» → { deleted: true, nick: 'Kikeas01' }. */
export function parseDeletedPlayer(name?: string | null): { deleted: boolean; nick: string } {
  const value = name ?? '';
  return value.startsWith(DELETED_PLAYER_MARK)
    ? { deleted: true, nick: value.slice(DELETED_PLAYER_MARK.length) }
    : { deleted: false, nick: value };
}
