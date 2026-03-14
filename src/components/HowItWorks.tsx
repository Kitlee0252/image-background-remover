const steps = [
  { number: "1", title: "Upload your image", description: "Select or drag a photo from your device." },
  { number: "2", title: "Remove the background", description: "Our AI removes the background automatically." },
  { number: "3", title: "Download your PNG", description: "Get a transparent PNG ready to use anywhere." },
];

export default function HowItWorks() {
  return (
    <section className="bg-gray-50 py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.number} className="text-center space-y-3">
              <div className="w-12 h-12 bg-[var(--color-primary)] text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto">
                {step.number}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
              <p className="text-gray-600">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
