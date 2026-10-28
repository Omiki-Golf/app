import { WriteButton } from '../context/ReadOnlyContext';
import React, { useState } from 'react';
import { GolfHole } from '../types';
import { golfService } from '../services/golfService';
import { ChevronUp, ChevronDown, CheckCircle, AlertCircle } from 'lucide-react';

interface HoleConfigurationProps {
  holes: GolfHole[];
  onHolesUpdated: (holes: GolfHole[]) => void;
  onClose: () => void;
  editable: boolean;
}

export const HoleConfiguration: React.FC<HoleConfigurationProps> = ({
  holes,
  onHolesUpdated,
  onClose,
  editable,
}) => {
  const [editingHoles, setEditingHoles] = useState<Record<string, number>>(
    holes.reduce((acc, hole) => ({ ...acc, [hole.id]: hole.stroke_index }), {})
  );
  const [editingPars, setEditingPars] = useState<Record<string, number>>(
    holes.reduce((acc, hole) => ({ ...acc, [hole.id]: hole.par }), {})
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleStrokeIndexChange = (holeId: string, delta: number) => {
    const current = editingHoles[holeId];
    const newValue = Math.max(1, Math.min(18, current + delta));
    setEditingHoles({ ...editingHoles, [holeId]: newValue });
  };

  const handleParChange = (holeId: string, delta: number) => {
    const current = editingPars[holeId];
    const newValue = Math.max(3, Math.min(6, current + delta));
    setEditingPars({ ...editingPars, [holeId]: newValue });
  };

  const handleSave = async () => {
    if (!editable) return;

    try {
      setSaving(true);
      setSuccess(false);

      const updates = holes
        .filter((hole) =>
          editingHoles[hole.id] !== hole.stroke_index ||
          editingPars[hole.id] !== hole.par
        )
        .map((hole) => {
          const updateData: { par?: number; stroke_index?: number } = {};
          if (editingPars[hole.id] !== hole.par) {
            updateData.par = editingPars[hole.id];
          }
          if (editingHoles[hole.id] !== hole.stroke_index) {
            updateData.stroke_index = editingHoles[hole.id];
          }
          return golfService.updateHole(hole.id, updateData);
        });

      await Promise.all(updates);

      const updatedHoles = holes.map((hole) => ({
        ...hole,
        par: editingPars[hole.id],
        stroke_index: editingHoles[hole.id],
      }));

      onHolesUpdated(updatedHoles as GolfHole[]);
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      console.error('Error saving hole configuration:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = holes.some((hole) =>
    editingHoles[hole.id] !== hole.stroke_index ||
    editingPars[hole.id] !== hole.par
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg shadow-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-accent-deep p-6 sticky top-0">
          <h2 className="text-2xl font-bold text-white">Configuración de Hoyos</h2>
          <p className="text-on-deep text-sm mt-1">
            {editable ? 'Edita el Par y Stroke Index de cada hoyo' : 'Vista de configuración'}
          </p>
        </div>

        <div className="p-6">
          {success && (
            <div className="mb-4 bg-accent-soft border-l-4 border-accent p-4 rounded flex items-start gap-3">
              <CheckCircle className="text-accent-ink flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-title">Cambios guardados</p>
                <p className="text-sm text-accent-ink">La configuración de hoyos ha sido actualizada</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {holes.map((hole) => (
              <div
                key={hole.id}
                className="border-2 border-line rounded-lg p-4 bg-card-2 hover:border-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-accent-soft flex items-center justify-center">
                      <span className="font-bold text-title text-lg">
                        {hole.hole_number}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-ink">Hoyo {hole.hole_number}</p>
                      <p className="text-sm text-ink-3">Par {editingPars[hole.id]}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-ink-2 mb-2">
                      Par
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleParChange(hole.id, -1)}
                        disabled={!editable}
                        className="p-1.5 bg-neutral hover:bg-neutral-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                      >
                        <ChevronDown size={18} />
                      </button>

                      <input
                        type="number"
                        min="3"
                        max="6"
                        value={editingPars[hole.id]}
                        onChange={(e) => {
                          const val = Math.max(3, Math.min(6, parseInt(e.target.value) || 3));
                          setEditingPars({ ...editingPars, [hole.id]: val });
                        }}
                        disabled={!editable}
                        className="w-16 text-center font-bold text-lg px-2 py-2 border-2 border-accent rounded-lg focus:outline-none disabled:bg-gray-100"
                      />

                      <button
                        onClick={() => handleParChange(hole.id, 1)}
                        disabled={!editable}
                        className="p-1.5 bg-neutral hover:bg-neutral-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                      >
                        <ChevronUp size={18} />
                      </button>
                    </div>

                    {editingPars[hole.id] !== hole.par && (
                      <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                        <AlertCircle size={14} />
                        Cambio pendiente
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-ink-2 mb-2">
                      Stroke Index (HCP)
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleStrokeIndexChange(hole.id, -1)}
                        disabled={!editable}
                        className="p-1.5 bg-neutral hover:bg-neutral-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                      >
                        <ChevronDown size={18} />
                      </button>

                      <input
                        type="number"
                        min="1"
                        max="18"
                        value={editingHoles[hole.id]}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(18, parseInt(e.target.value) || 1));
                          setEditingHoles({ ...editingHoles, [hole.id]: val });
                        }}
                        disabled={!editable}
                        className="w-16 text-center font-bold text-lg px-2 py-2 border-2 border-accent rounded-lg focus:outline-none disabled:bg-gray-100"
                      />

                      <button
                        onClick={() => handleStrokeIndexChange(hole.id, 1)}
                        disabled={!editable}
                        className="p-1.5 bg-neutral hover:bg-neutral-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                      >
                        <ChevronUp size={18} />
                      </button>
                    </div>

                    {editingHoles[hole.id] !== hole.stroke_index && (
                      <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                        <AlertCircle size={14} />
                        Cambio pendiente
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {editable && (
            <div className="flex gap-3 mt-8 pt-6 border-t">
              <button
                onClick={onClose}
                className="flex-1 bg-neutral-hover hover:bg-gray-400 text-ink font-bold py-3 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <WriteButton
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-on-accent font-bold py-3 rounded-lg transition-colors"
              >
                {saving ? 'Guardando...' : hasChanges ? 'Guardar Cambios' : 'Sin cambios'}
              </WriteButton>
            </div>
          )}

          {!editable && (
            <div className="mt-8 pt-6 border-t">
              <button
                onClick={onClose}
                className="w-full bg-accent hover:bg-accent-hover text-on-accent font-bold py-3 rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
