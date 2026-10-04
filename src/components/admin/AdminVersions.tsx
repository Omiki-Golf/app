import { CheckCircle2, History, Rocket, Sparkles, Wrench } from 'lucide-react';
import { APP_VERSION, RELEASES, type ReleaseChangeType } from '../../data/releaseNotes';

const changeStyles: Record<ReleaseChangeType, { label: string; icon: typeof Sparkles; classes: string }> = {
  new: { label: 'Novedad', icon: Sparkles, classes: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  improved: { label: 'Mejora', icon: Rocket, classes: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  fixed: { label: 'Corrección', icon: Wrench, classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
};

const releaseDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-ES', {
  day: 'numeric', month: 'long', year: 'numeric',
});

export function AdminVersions() {
  return (
    <section aria-labelledby="versions-title" className="space-y-5">
      <div className="rounded-2xl border border-accent-ring bg-accent-soft p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-accent-ink">Versión instalada</p>
            <h2 id="versions-title" className="mt-1 text-3xl font-black text-ink">Omiki Golf v{APP_VERSION}</h2>
          </div>
          <CheckCircle2 className="text-accent-ink" size={34} aria-hidden="true" />
        </div>
        <p className="mt-3 text-sm text-ink-2">Historial de publicaciones, novedades, mejoras y correcciones de la aplicación.</p>
      </div>

      <div className="relative space-y-4 before:absolute before:bottom-6 before:left-5 before:top-6 before:w-px before:bg-line sm:before:left-7">
        {RELEASES.map((release, index) => (
          <article key={release.version} className="relative rounded-2xl border border-line bg-card p-5 pl-12 shadow-soft sm:pl-16">
            <div className={`absolute left-2.5 top-5 flex h-10 w-10 items-center justify-center rounded-full border-4 border-card sm:left-2 ${index === 0 ? 'bg-accent text-on-accent' : 'bg-card-2 text-ink-3'}`}>
              <History size={18} aria-hidden="true" />
            </div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-ink">v{release.version}</h3>
                  {index === 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-on-accent">Actual</span>}
                </div>
                <p className="font-semibold text-ink-2">{release.title}</p>
              </div>
              <time dateTime={release.date} className="text-xs text-ink-3">{releaseDate(release.date)}</time>
            </div>
            <p className="mt-2 text-sm text-ink-3">{release.summary}</p>
            <ul className="mt-4 space-y-3">
              {release.changes.map((change, changeIndex) => {
                const style = changeStyles[change.type];
                const Icon = style.icon;
                return (
                  <li key={`${change.type}-${changeIndex}`} className="flex items-start gap-3 text-sm text-ink-2">
                    <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${style.classes}`}>
                      <Icon size={11} aria-hidden="true" />{style.label}
                    </span>
                    <span className="pt-0.5">{change.text}</span>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
