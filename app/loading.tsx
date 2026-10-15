export default function Loading() {
  return (
    <div
      className="loading-layout"
      role="status"
      aria-label="Loading workspace"
    >
      <div className="skeleton sidebar-skeleton" />
      <div>
        <div className="skeleton header-skeleton" />
        <div className="skeleton dashboard-skeleton" />
      </div>
    </div>
  );
}
