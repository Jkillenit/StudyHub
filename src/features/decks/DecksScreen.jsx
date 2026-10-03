/** `onOpenCourse(id, { tab: "drill" })` opens that course on its flashcard deck. */
export function DecksScreen({ userCourses, onOpenCourse }) {
  return (
    <section className="sh-panel sh-hub-block sh-decks-screen">
      <h2 className="sh-hud-title">DECKS</h2>
      <p className="sh-hub-empty-hint">Your decks will show here.</p>
    </section>
  );
}
