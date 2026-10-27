import { WriteButton } from '../context/ReadOnlyContext';
import React, { useState, useEffect } from 'react';
import { TrendingUp, X, AlertCircle, Info } from 'lucide-react';
import { golfService } from '../services/golfService';
import { getErrorMessage } from '../utils/errorMessage';

interface HandicapUpdateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface PreviewRow {
  id: string;
  name: string;
  exact_handicap: number;
  exact_handicap_18: number;
  playing_handicap: number;
  new_value: number;
}

export const HandicapUpdateModal: React.FC<HandicapUpdateModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const data = await golfService.getHandicapUpdatePreview();
        if (!cancelled) setPreview(data);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, 'Error cargando preview'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const changedRows = preview.filter(
    (row) =>
      row.exact_handicap !== row.new_value ||
      row.exact_handicap_18 !== row.new_value ||
      row.playing_handicap !== row.new_value
  );

  const hasChanges = changedRows.length > 0;

  const handleUpdate = async () => {
    try {
      setUpdating(true);
      setError('');
      await golfService.applyHandicapUpdate();
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Error actualizando handicaps'));
    } finally {
      setUpdating(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      e.stopPropagation();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-card rounded-lg shadow-card max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3 rounded-full">
              <TrendingUp className="text-blue-600" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink">
                Actualizar Handicaps
              </h2>
              <p className="text-sm text-ink-3">
                Nivelar exact_handicap y exact_handicap_18 con playing_handicap
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-4 hover:text-ink-3 hover:bg-card-2 p-2 rounded-lg transition-colors"
            title="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <p className="text-ink-3 text-lg">Cargando jugadores...</p>
            </div>
          )}

          {!loading && error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {!loading && !error && preview.length === 0 && (
            <div className="text-center py-12">
              <p className="text-ink-3 text-lg">No hay jugadores registrados</p>
            </div>
          )}

          {!loading && !error && preview.length > 0 && !hasChanges && (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto text-accent-ink mb-3" size={32} />
              <p className="text-accent-ink text-lg font-medium">
                Todos los handicaps ya están nivelados. No hay cambios pendientes.
              </p>
            </div>
          )}

          {!loading && !error && hasChanges && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                <Info className="text-blue-600 flex-shrink-0" size={18} />
                <p className="text-sm text-blue-700">
                  {changedRows.length} jugador{changedRows.length !== 1 ? 'es' : ''} con cambios pendientes.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-line-2">
                      <th className="text-left py-3 px-3 font-semibold text-ink-2">
                        Jugador
                      </th>
                      <th className="text-center py-3 px-3 font-semibold text-ink-2">
                        exact_handicap
                      </th>
                      <th className="text-center py-3 px-3 font-semibold text-ink-2">
                        exact_handicap_18
                      </th>
                      <th className="text-center py-3 px-3 font-semibold text-ink-2">
                        playing_handicap
                      </th>
                      <th className="text-center py-3 px-3 font-semibold text-ink-2">
                        Nuevo valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {changedRows.map((row, index) => {
                      const changed =
                        row.exact_handicap !== row.new_value ||
                        row.exact_handicap_18 !== row.new_value ||
                        row.playing_handicap !== row.new_value;
                      return (
                        <tr
                          key={row.id}
                          className={index % 2 === 0 ? 'bg-card' : 'bg-card-2'}
                        >
                          <td className="py-3 px-3 font-medium text-ink">
                            {row.name}
                          </td>
                          <td className="text-center py-3 px-3 text-ink-2">
                            {row.exact_handicap.toFixed(1)}
                          </td>
                          <td className="text-center py-3 px-3 text-ink-2">
                            {row.exact_handicap_18.toFixed(1)}
                          </td>
                          <td className="text-center py-3 px-3 text-ink-2">
                            {row.playing_handicap.toFixed(1)}
                          </td>
                          <td
                            className={`text-center py-3 px-3 font-bold ${
                              changed ? 'text-blue-700' : 'text-ink-4'
                            }`}
                          >
                            {row.new_value.toFixed(1)}
                            {changed && (
                              <span className="ml-1 text-xs text-blue-500">
                                (cambia)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-sm text-ink-3">
                Al pulsar "Actualizar", los tres campos de handicap de cada jugador
                se igualarán al valor de <strong>playing_handicap</strong>.
              </p>
            </>
          )}
        </div>

        {!loading && !error && hasChanges && (
          <div className="flex gap-3 p-6 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              disabled={updating}
              className="flex-1 bg-neutral hover:bg-neutral-hover disabled:opacity-50 text-ink font-semibold py-3 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <WriteButton
              type="button"
              onClick={handleUpdate}
              disabled={updating || !hasChanges}
              className={`flex-1 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                updating || !hasChanges
                  ? 'bg-ink-4 text-gray-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {updating ? 'Actualizando...' : 'Actualizar'}
            </WriteButton>
          </div>
        )}
      </div>
    </div>
  );
};
