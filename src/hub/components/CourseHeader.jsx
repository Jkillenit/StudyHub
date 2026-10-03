import CourseMenu from "./CourseMenu.jsx";

export default function CourseHeader({ crumb, title, titleNode, tag, tabs = [], activeTab, onTab, tabsExtra, masteryPct, menu }) {
  const [strong, rest] = crumb || [];
  const pct = masteryPct == null ? null : Math.max(0, Math.min(100, Math.round(masteryPct)));

  return (
    <header className="sh-course-head">
      {strong || rest ? (
        <div className="sh-course-crumb">
          {strong ? <span className="sh-course-crumb-strong">{strong}</span> : null}
          {strong && rest ? <span className="sh-course-crumb-sep"> / </span> : null}
          {rest ? <span>{rest}</span> : null}
        </div>
      ) : null}
      <div className="sh-course-title-row">
        <h1 className="sh-course-title">{titleNode ?? title}</h1>
        {tag ? <span className="sh-course-tag">{tag}</span> : null}
        {menu?.length ? <CourseMenu items={menu} /> : null}
      </div>
      {tabs.length ? (
        <div className="sh-tab-row" data-tour-id="course-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`sh-tab${activeTab === t.id ? " active" : ""}`}
              disabled={t.disabled}
              onClick={() => onTab?.(t.id)}
            >
              {t.label}
              {t.dot ? <span className="sh-tab-dot" aria-hidden /> : null}
            </button>
          ))}
          {tabsExtra}
        </div>
      ) : null}
      {pct == null ? null : (
        <div className="sh-mastery" data-tour-id="course-context">
          <span className="sh-mastery-label">Mastery</span>
          <span className="sh-mastery-track">
            <span className="sh-mastery-fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="sh-mastery-value">{pct}%</span>
        </div>
      )}
    </header>
  );
}
