/**
 * Cutout highlight around a rect. `dim` darkens everything else (tours); without it the
 * ring just pulses (help "show me"). Never takes pointer events, so the target stays clickable.
 */
export function Spotlight({ rect, dim = true, pad = 6 }) {
  if (!rect) return dim ? <div className="sc-spot-dim" /> : null;
  const style = {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  return <div className={`sc-spot${dim ? " sc-spot--dim" : " sc-spot--ring"}`} style={style} aria-hidden />;
}
