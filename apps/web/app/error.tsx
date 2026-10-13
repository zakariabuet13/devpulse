"use client";

// Next 16 passes `retry` (not `reset`).
export default function Error({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
      <h2 className="text-lg font-semibold text-red-900">Something went wrong</h2>
      <p className="mt-2 text-sm text-red-800">{error.message}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-5 h-9 rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-900"
      >
        Try again
      </button>
    </div>
  );
}
