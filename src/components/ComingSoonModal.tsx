import React from 'react';
import { X, Sparkles, Users, TrendingUp, Trophy, Calendar, Lock } from 'lucide-react';

interface ComingSoonModalProps {
  onClose: () => void;
}

export default function ComingSoonModal({ onClose }: ComingSoonModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-2xl shadow-card max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-xl">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-ink">
                Próximamente...
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-ink-4 hover:text-ink-3 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-5 border-2 border-blue-200">
              <p className="text-lg text-ink-2 leading-relaxed">
                Estamos trabajando a toda máquina para traerte algo increíble.
                Pronto podrás crear tu cuenta y llevar tu experiencia al siguiente nivel.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Lo que viene en camino:
              </h3>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-accent-soft rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-accent-ink" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink">Todos tus grupos, siempre contigo</h4>
                    <p className="text-sm text-ink-3">
                      Accede desde cualquier dispositivo. Móvil, tablet, ordenador... donde sea.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink">Estadísticas completas y permanentes</h4>
                    <p className="text-sm text-ink-3">
                      Histórico de todas tus partidas, tu evolución, comparativas con amigos y mucho más.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink">Gestión total de tus Multipartidetas</h4>
                    <p className="text-sm text-ink-3">
                      Crea y administra múltiples grupos de amigos, cada uno con su propio ranking y estadísticas.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Lock className="w-5 h-5 text-yellow-800" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink">Todo guardado en la nube</h4>
                    <p className="text-sm text-ink-3">
                      Nunca más perderás tus datos. Todo estará guardado de forma segura.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-accent-soft rounded-xl p-5 border-2 border-accent-ring">
              <p className="text-center text-ink-2 font-medium">
                Mientras tanto, disfruta de Omiki Golf sin límites.
                <br />
                <span className="text-accent-ink font-bold">La diversión no espera.</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all font-semibold text-lg shadow-card"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
