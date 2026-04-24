type PageHeaderProps = {
  isEditing: boolean;
  firmName?: string;
};

export function PageHeader({ isEditing, firmName }: PageHeaderProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-textSecondary">
            {isEditing ? "Edit Visit" : "Log Visit"}
          </p>
          <h1 className="text-lg font-semibold text-textPrimary">
            {isEditing ? (firmName ?? "Loading visit") : "New visit log"}
          </h1>
        </div>
        <span className="ml-auto rounded-full bg-page px-3 py-1 text-xs font-medium text-textSecondary">
          {isEditing ? "Update an existing record" : "Create a new record"}
        </span>
      </div>
    </div>
  );
}
