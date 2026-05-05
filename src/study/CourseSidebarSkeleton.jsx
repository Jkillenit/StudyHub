/** UI-010 — placeholder matching built-in sidebar chapter list */

const TITLE_WIDTHS = ["85%", "70%", "90%", "60%", "80%", "75%"];

export function CourseSidebarSkeleton() {
  return (
    <div className="sh-course-sidebar-skel">
      <div className="sh-course-sidebar-skel-head">
        <div className="sh-skeleton sh-course-sidebar-skel-micro" />
        <div className="sh-skeleton sh-skeleton--raised sh-course-sidebar-skel-name" />
        <div className="sh-skeleton sh-course-sidebar-skel-sub" />
      </div>
      <div className="sh-skeleton sh-course-sidebar-skel-filter" />
      <div className="sh-course-sidebar-skel-rows">
        {TITLE_WIDTHS.map((w, i) => (
          <div key={i}>
            {i === 3 ? <div className="sh-skeleton sh-course-sidebar-skel-divider" /> : null}
            <div className="sh-course-sidebar-skel-row">
              <div className="sh-skeleton sh-skeleton--raised sh-course-sidebar-skel-ch" />
              <div className="sh-skeleton sh-course-sidebar-skel-title" style={{ width: w }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
