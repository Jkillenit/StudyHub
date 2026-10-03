/** Nova's resting lane, bottom right. The companion layer fits her into `[data-nova-home]` and stands her on `[data-nova-floor]`. */
export function NovaLane({ session = false }) {
  return (
    <div className={`sh-nova-lane${session ? " sh-nova-lane--session" : ""}`} data-nova-home aria-hidden="true">
      <div className="sh-nova-lane-floor" data-nova-floor />
    </div>
  );
}
