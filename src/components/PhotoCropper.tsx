import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cropToAvatarDataUrl } from '../utils/profilePhoto';

interface PhotoCropperProps {
  /** URL local (object URL) de la imagen elegida. */
  source: string;
  onCancel: () => void;
  onCropped: (dataUrl: string) => void;
}

const VIEWPORT = 260;
const MAX_ZOOM = 4;

/**
 * Recorte de la foto de perfil: la imagen cubre un marco circular; se encuadra arrastrando
 * y se amplía con el deslizador. El resultado es un cuadrado de 256×256.
 */
export function PhotoCropper({ source, onCancel, onCropped }: PhotoCropperProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');

  // Escala con la que la imagen cubre justo el marco a zoom 1.
  const baseScale = natural ? VIEWPORT / Math.min(natural.width, natural.height) : 1;
  const scale = baseScale * zoom;
  const shownWidth = natural ? natural.width * scale : VIEWPORT;
  const shownHeight = natural ? natural.height * scale : VIEWPORT;

  const clamp = (x: number, y: number, width = shownWidth, height = shownHeight) => ({
    x: Math.min(0, Math.max(VIEWPORT - width, x)),
    y: Math.min(0, Math.max(VIEWPORT - height, y)),
  });

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      const base = VIEWPORT / Math.min(size.width, size.height);
      setNatural(size);
      setZoom(1);
      // Centrada al abrir.
      setOffset({ x: (VIEWPORT - size.width * base) / 2, y: (VIEWPORT - size.height * base) / 2 });
    };
    image.onerror = () => setError('No se ha podido abrir la imagen. Prueba con otra foto.');
    image.src = source;
  }, [source]);

  const changeZoom = (nextZoom: number) => {
    if (!natural) return;
    // Amplía respecto al centro del marco.
    const center = VIEWPORT / 2;
    const ratio = nextZoom / zoom;
    const width = natural.width * baseScale * nextZoom;
    const height = natural.height * baseScale * nextZoom;
    setOffset(clamp(center - (center - offset.x) * ratio, center - (center - offset.y) * ratio, width, height));
    setZoom(nextZoom);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setOffset(clamp(current.originX + event.clientX - current.startX, current.originY + event.clientY - current.startY));
  };
  const onPointerUp = () => { drag.current = null; };

  const confirm = () => {
    if (!imageRef.current || !natural) return;
    try {
      const size = VIEWPORT / scale;
      onCropped(cropToAvatarDataUrl(imageRef.current, { x: -offset.x / scale, y: -offset.y / scale, size }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se ha podido recortar la foto.');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="photo-cropper-title">
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-card text-center">
        <h2 id="photo-cropper-title" className="text-lg font-bold text-ink">Ajusta tu foto</h2>
        <p className="mt-1 text-sm text-ink-3">Arrastra para encuadrar y usa el deslizador para acercar.</p>

        <div
          className="relative mx-auto mt-4 overflow-hidden rounded-full bg-card-2 touch-none select-none cursor-grab active:cursor-grabbing ring-4 ring-accent-ring"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {natural && (
            <img
              src={source}
              alt=""
              draggable={false}
              className="absolute max-w-none pointer-events-none"
              style={{ left: offset.x, top: offset.y, width: shownWidth, height: shownHeight }}
            />
          )}
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm text-ink-2">
          <span className="shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!natural}
            onChange={(event) => changeZoom(Number(event.target.value))}
            className="w-full accent-emerald-600"
            aria-label="Zoom de la foto"
          />
        </label>

        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg bg-neutral py-2.5 font-semibold text-ink hover:bg-neutral-hover">
            Cancelar
          </button>
          <button type="button" onClick={confirm} disabled={!natural} className="rounded-lg bg-accent py-2.5 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
            Usar foto
          </button>
        </div>
      </div>
    </div>
  );
}
