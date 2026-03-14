interface ResultViewProps {
  originalUrl: string;
  resultUrl: string;
  onDownload: () => void;
  onReset: () => void;
}

export default function ResultView({
  originalUrl,
  resultUrl,
  onDownload,
  onReset,
}: ResultViewProps) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500 text-center">Original</h3>
          <div className="bg-gray-100 rounded-lg p-4 flex items-center justify-center min-h-[240px]">
            <img
              src={originalUrl}
              alt="Original image"
              className="max-h-72 rounded"
            />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500 text-center">Background Removed</h3>
          <div
            className="rounded-lg p-4 flex items-center justify-center min-h-[240px]"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }}
          >
            <img
              src={resultUrl}
              alt="Background removed result"
              className="max-h-72 rounded"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <button
          onClick={onDownload}
          className="px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Download PNG
        </button>
        <button
          onClick={onReset}
          className="px-8 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Try Another Image
        </button>
      </div>
    </div>
  );
}
