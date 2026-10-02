/** Nova's resting lane, bottom right. The companion layer fits her into `[data-nova-home]` and stands her on `[data-nova-floor]`. */
export function NovaLane() {
  return (
    <div className="sh-nova-lane" data-nova-home aria-hidden="true">
      <div className="sh-nova-lane-floor" data-nova-floor />
    </div>
  );
}
