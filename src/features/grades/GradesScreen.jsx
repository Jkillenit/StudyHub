/** `onOpenCourse(id, { tab: "grades" })` opens that course on its grades tab. */
export function GradesScreen({ userCourses, onOpenCourse }) {
  return (
    <section className="sh-panel sh-hub-block sh-grades-screen">
      <h2 className="sh-hud-title">GRADES</h2>
      <p className="sh-hub-empty-hint">Your grades will show here.</p>
    </section>
  );
}
