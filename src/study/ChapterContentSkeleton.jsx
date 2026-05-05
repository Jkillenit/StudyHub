/** UI-010 — placeholder matching chapter definition-card layout */

function DefCard() {
  return (
    <div className="sh-chapter-skel-card">
      <div className="sh-skeleton sh-skeleton--raised sh-chapter-skel-term" />
      <div className="sh-skeleton sh-chapter-skel-line sh-chapter-skel-line--full" />
      <div className="sh-skeleton sh-chapter-skel-line sh-chapter-skel-line--75" />
    </div>
  );
}

export function ChapterContentSkeleton() {
  return (
    <div className="sh-chapter-skel-root font-sans py-2 px-3">
      <div className="sh-skeleton sh-chapter-skel-section-label" />
      <DefCard />
      <DefCard />
      <DefCard />
      <div className="sh-skeleton sh-chapter-skel-section-label sh-chapter-skel-section-label--second" />
      <DefCard />
      <DefCard />
    </div>
  );
}
