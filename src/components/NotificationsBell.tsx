import { MessageInbox } from './MessageInbox';
import { GroupMessages } from './messages/GroupMessages';
import { messageService } from '../services/messageService';
import { WriteButton } from '../context/ReadOnlyContext';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, X, Users, Clock, Trophy, Flag, Hand } from 'lucide-react';
import { userService } from '../services/userService';
import { GroupInvitation } from '../types';
import type { ActivityEvent, ActivityScope } from '../services/messageService';
import { useTranslation } from 'react-i18next';

interface NotificationsBellProps {
  userId: string | null;
  onBack: () => void;
  onInvitationResolved: () => void;
  activityScope: ActivityScope;
}

export const NotificationsBell: React.FC<NotificationsBellProps> = ({ userId, onBack, onInvitationResolved, activityScope }) => {
  const { t } = useTranslation();
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [managesGroups, setManagesGroups] = useState(false);
  const [showGroupMessages, setShowGroupMessages] = useState(false);
  const [invitationError, setInvitationError] = useState('');
  const [responseError, setResponseError] = useState('');
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityError, setActivityError] = useState('');
  const invitationRequest = useRef(0);
  const responseRunning = useRef(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onBack(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onBack]);

  useEffect(() => {
    let live = true;
    const loadActivity = async () => {
      try {
        const data = await messageService.activity(activityScope, userId, true);
        if (live) { setActivity(data.events); setActivityError(''); onInvitationResolved(); }
      } catch { if (live) setActivityError(t('activity.loadError')); }
    };
    void loadActivity();
    const timer = window.setInterval(() => void loadActivity(), 30000);
    return () => { live = false; window.clearInterval(timer); };
  }, [activityScope.roundId, activityScope.groupId, activityScope.accessCode, userId, onInvitationResolved, t]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const check = async () => {
      try { const groups = await messageService.groups('', true); if (active) setManagesGroups(groups.length > 0); }
      catch { if (active) setManagesGroups(false); }
    };
    void check(); const timer = window.setInterval(() => void check(), 30000); const focus = () => void check(); window.addEventListener('focus', focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [userId]);

  const load = useCallback(async () => {
    const request = ++invitationRequest.current;
    try {
      const data = userId ? await userService.getPendingInvitations(userId) : [];
      if (request === invitationRequest.current) { setInvitations(data); setInvitationError(''); }
    } catch {
      if (request === invitationRequest.current) setInvitationError('No se pudieron cargar las invitaciones. Pulsa Actualizar invitaciones para reintentarlo.');
    } finally {
      if (request === invitationRequest.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load(); const tick = () => void load(); const timer = window.setInterval(tick, 30000); window.addEventListener('focus', tick);
    return () => {
      // A request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      invitationRequest.current++;
      window.clearInterval(timer); window.removeEventListener('focus', tick);
    };
  }, [load]);

  const handleRespond = async (invitationId: string, status: 'accepted' | 'rejected') => {
    if (responseRunning.current) return;
    responseRunning.current = true;
    setResponding(invitationId);
    setResponseError('');
    try {
      await userService.respondToInvitation(invitationId, status);
      invitationRequest.current++;
      setLoading(false);
      setInvitations(current => current.filter(i => i.id !== invitationId));
      onInvitationResolved();
    } catch {
      setResponseError('No se pudo guardar la respuesta. Actualiza las invitaciones y vuelve a intentarlo.');
    } finally {
      responseRunning.current = false;
      setResponding(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/45 sm:flex sm:justify-end" role="dialog" aria-modal="true" aria-label={t('activity.panelTitle')} onMouseDown={(event) => { if (event.target === event.currentTarget) onBack(); }}>
      <div className="h-full w-full overflow-y-auto bg-app px-4 py-6 shadow-2xl transition-colors sm:max-w-xl">
        <button type="button" onClick={onBack} className="mb-6 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink shadow-soft" aria-label={t('common.close')} title={t('common.close')}><X size={22} /></button>

        <div className="flex items-center gap-3 mb-6">
          <Bell size={24} className="text-ink-2" />
          <h1 className="text-2xl font-bold text-ink">Notificaciones</h1>
        </div>

        {(activityScope.roundId || activityScope.groupId) && <section className="mb-7 space-y-3 text-ink">
          <h2 className="font-bold text-lg">{t('activity.title')}</h2>
          {activityError && <p role="alert" className="text-red-600">{activityError}</p>}
          {!activityError && activity.length === 0 && <p className="text-sm text-ink-3">{t('activity.empty')}</p>}
          {activity.map((event) => {
            const Icon = event.event_type === 'hole_in_one' ? Trophy : event.event_type === 'no_paso_rojas' ? Flag : Hand;
            return <article key={event.id} className="flex gap-3 rounded-xl border border-line bg-card p-4">
              <Icon className="mt-0.5 shrink-0 text-accent-ink" size={20} />
              <div><p className="font-semibold">{event.player_name} · {t(`activity.events.${event.event_type}`)} · {t('activity.hole', { number: event.hole_number })}</p><p className="text-xs text-ink-3">{new Date(event.created_at).toLocaleString()}</p></div>
            </article>;
          })}
        </section>}

        {showGroupMessages && userId ? <GroupMessages onBack={() => setShowGroupMessages(false)} /> : <>
        {managesGroups && <button className="w-full bg-card border border-line rounded-xl p-3 text-ink mb-5" onClick={() => setShowGroupMessages(true)}>Mensajes de mis grupos</button>}
        <MessageInbox key={userId || 'express'} userId={userId} onRead={onInvitationResolved} />
        {userId && <h2 className="font-bold text-lg text-ink mb-3">Invitaciones a grupos</h2>}
        {userId && <button disabled={responding !== null} className="border border-line rounded-xl p-2 text-ink mb-3" onClick={() => { void load(); onInvitationResolved(); }}>Actualizar invitaciones</button>}
        {invitationError && <p role="alert" className="text-red-600 mb-3">{invitationError}</p>}
        {responseError && <p role="alert" className="text-red-600 mb-3">{responseError}</p>}
        {userId && (loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-line-2 border-t-accent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-ink-3 text-sm">Cargando...</p>
          </div>
        ) : invitations.length === 0 ? (invitationError ? null : (
          <div className="bg-card rounded-2xl shadow-card p-8 text-center">
            <Bell size={32} className="text-ink-4 mx-auto mb-3" />
            <p className="text-ink-3">No tienes invitaciones pendientes</p>
          </div>
        )) : (
          <div className="space-y-3">
            {invitations.map(inv => (
              <div key={inv.id} className="bg-card rounded-2xl shadow-card p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                    <Users size={18} className="text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-ink text-sm">
                      {inv.inviter_profile?.nick || 'Alguien'} te ha invitado
                    </p>
                    <p className="text-sm text-ink-3 mt-0.5">
                      Quieres meterte en el grupo <strong>{inv.group?.name}</strong> donde te han invitado?
                    </p>
                    <p className="text-xs text-ink-4 mt-1 flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <WriteButton
                    onClick={() => handleRespond(inv.id, 'accepted')}
                    disabled={responding !== null}
                    className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Check size={16} />
                    Aceptar
                  </WriteButton>
                  <WriteButton
                    onClick={() => handleRespond(inv.id, 'rejected')}
                    disabled={responding !== null}
                    className="flex-1 flex items-center justify-center gap-2 bg-card-2 hover:bg-neutral-hover text-ink-2 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <X size={16} />
                    Rechazar
                  </WriteButton>
                </div>
              </div>
            ))}
          </div>
        ))}
        </>}
      </div>
    </div>
  );
};
