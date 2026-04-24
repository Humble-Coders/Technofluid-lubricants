type LoadingSpinnerProps = {
  isVisitLoading: boolean;
};

export function LoadingSpinner({ isVisitLoading }: LoadingSpinnerProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-textSecondary">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-sm">
          {isVisitLoading ? "Loading visit…" : "Loading products…"}
        </p>
      </div>
    </div>
  );
}
