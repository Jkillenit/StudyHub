import { sortJobs } from "../viewModels.js";

export function JobsList({ jobs, onCancel }) {
  const list = sortJobs(jobs);
  return (
    <section className="remote-section">
      <h2 className="remote-section-title">Jobs</h2>
      {list.length === 0 ? (
        <p className="remote-empty">No jobs yet</p>
      ) : (
        <div className="remote-jobs">
          {list.map((job) => (
            <article key={job.id} className="remote-job">
              <div className="remote-job-top">
                <span className="remote-job-type">{job.type}</span>
                <span className="remote-job-status" data-status={job.status}>
                  {job.status}
                  {typeof job.progress === "number" && job.status === "running"
                    ? ` ${job.progress}%`
                    : ""}
                </span>
              </div>
              {job.summary ? <p className="remote-item-meta">{job.summary}</p> : null}
              {job.error ? (
                <p className="remote-item-meta" style={{ color: "var(--sh-danger)" }}>
                  {job.error}
                </p>
              ) : null}
              {job.status === "running" ? (
                <div className="remote-progress" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }} />
                </div>
              ) : null}
              {job.status === "queued" || job.status === "running" ? (
                <button
                  type="button"
                  className="remote-btn remote-btn-ghost"
                  onClick={() => onCancel?.(job.id)}
                >
                  Cancel
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
