/**
 * Cutout highlight around a rect. `dim` darkens everything else (tours); without it the
 * ring just pulses (help "show me"), or takes a Stage `tone`: pulse, glow, underline, warn, danger.
 * Never takes pointer events, so the target stays clickable.
 */
export function Spotlight({ rect, dim = true, pad = 6, tone = null }) {
  if (!rect) return dim ? <div className="sc-spot-dim" /> : null;
  const style = {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  const kind = dim ? " sc-spot--dim" : ` sc-spot--ring${tone ? ` sc-spot--${tone}` : ""}`;
  return <div className={`sc-spot${kind}`} style={style} aria-hidden />;
}

/** A small holographic note stuck to the top edge of a rect (Stage `pinNote`). */
export function PinNote({ rect, text }) {
  return (
    <div className="sc-pin" style={{ left: rect.left + rect.width / 2, top: rect.top }} role="note">
      {text}
    </div>
  );
}
