/** El perfil guarda el HCP de 18; el de 9 se obtiene redondeando hacia arriba. */
export function profileHandicapForHoles(handicap18: number, holes: 9 | 18): number {
  return holes === 9 ? Math.ceil(handicap18 / 2) : Math.round(handicap18);
}

export function personalHandicapChange(previous18: number, value: number, holes: 9 | 18) {
  if (!Number.isInteger(value) || value < 0 || value > (holes === 9 ? 27 : 54)) {
    throw new Error('Introduce un hándicap entero entre 0 y ' + (holes === 9 ? 27 : 54) + '.');
  }
  const previous = profileHandicapForHoles(previous18, holes);
  // Sin edición, conservar un HCP 18 impar al añadirte en una partida de 9.
  const handicap18 = value === previous ? Number(previous18) : holes === 9 ? value * 2 : value;
  const handicap9 = Math.ceil(handicap18 / 2);
  const message = value === previous ? '' : value < previous
    ? `¡Enhorabuena por tu bajada de hándicap! Pasas de ${previous} a ${value}. Tus datos de registro se han actualizado: HCP 9: ${handicap9}, HCP 18: ${handicap18}.`
    : `Vas a jugar más holgado con tu nuevo hándicap: pasas de ${previous} a ${value}. Tus datos de registro se han actualizado: HCP 9: ${handicap9}, HCP 18: ${handicap18}.`;
  return { handicap18, handicap9, message };
}
