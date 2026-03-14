import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Image Processing</h2>
            <p>
              Your uploaded images are processed in real-time and are <strong>not stored</strong> on
              our servers. Once the background removal is complete and the result is returned to your
              browser, the image data is discarded.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Third-Party Services</h2>
            <p>
              We use <strong>remove.bg</strong> as our background removal service. Your image is
              sent to remove.bg for processing. Please refer to{" "}
              <a
                href="https://www.remove.bg/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-primary)] hover:underline"
              >
                remove.bg&apos;s privacy policy
              </a>{" "}
              for details on how they handle uploaded images.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Collection</h2>
            <p>
              We do not collect personal information, require registration, or use cookies for
              tracking. No database is used to store any user data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
            <p>
              If you have any questions about this privacy policy, please reach out to us via our
              website.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
