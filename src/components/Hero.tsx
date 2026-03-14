interface HeroProps {
  onUploadClick: () => void;
}

export default function Hero({ onUploadClick }: HeroProps) {
  return (
    <section className="text-center py-16 px-4 bg-gradient-to-b from-indigo-50 to-white">
      <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
        Image Background Remover
      </h1>
      <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
        Remove background from any image in seconds. Upload your image and
        download a transparent PNG instantly.
      </p>
      <button
        onClick={onUploadClick}
        className="px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-lg transition-colors text-lg cursor-pointer"
      >
        Upload Image
      </button>
    </section>
  );
}
