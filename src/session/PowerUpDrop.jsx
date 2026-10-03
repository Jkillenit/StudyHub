/** One Zombies-pack power-up: square glyph, label, bounce-in then a gentle hop. Only `lead` glows. */
export function PowerUpDrop({ powerUp, index = 0, lead = false }) {
  return (
    <li className="sh-powerup" data-kind={powerUp.id} data-lead={lead || undefined} style={{ "--pu-i": index }}>
      <span className="sh-powerup-icon" aria-hidden="true">
        {powerUp.short}
      </span>
      <span className="sh-powerup-label">{powerUp.label}</span>
    </li>
  );
}
