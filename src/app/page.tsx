import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeading } from "@/components/ui/SectionHeading";

export default function Home() {
  const services = [
    {
      title: "Electrician",
      icon: "⚡",
      desc: "Fan, light, wiring and electrical repairs",
    },
    {
      title: "Plumber",
      icon: "🔧",
      desc: "Pipe leakage, taps and plumbing solutions",
    },
    {
      title: "Water Purifier",
      icon: "💧",
      desc: "RO service and purifier maintenance",
    },
    {
      title: "Carpenter",
      icon: "🪚",
      desc: "Furniture repair and wood work",
    },
  ];

  const benefits = [
    {
      title: "Verified Workers",
      desc: "Trusted professionals for your home",
      icon: "✓",
    },
    {
      title: "Quick Response",
      desc: "Fast booking through WhatsApp",
      icon: "⚡",
    },
    {
      title: "Transparent Pricing",
      desc: "No hidden charges",
      icon: "₹",
    },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-homigo-bg">

      {/* Hero */}
      <section className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-homigo-primary via-homigo-secondary to-homigo-primary px-4 py-8 text-center sm:px-6 sm:py-10 md:py-12 lg:max-h-[48vh]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.12),transparent_60%)]" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-homigo-accent/10 blur-3xl sm:-right-24 sm:-top-24 sm:h-72 sm:w-72" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-white/5 blur-3xl sm:-bottom-24 sm:-left-24 sm:h-64 sm:w-64" />

        <PageContainer className="relative max-w-4xl">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
            Homigo
          </h1>

          <p className="mt-3 text-base font-medium leading-snug text-white/95 sm:mt-4 sm:text-lg md:text-xl">
            Trusted Home Services At Your Doorstep
          </p>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-blue-100/90 sm:text-base">
            Book verified professionals instantly through WhatsApp
          </p>

          <a
            href="#"
            className="group mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-homigo-accent px-6 py-3 text-sm font-bold text-white shadow-lg shadow-homigo-accent/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#16a34a] hover:shadow-xl hover:shadow-homigo-accent/30 sm:mt-6 sm:px-8 sm:py-3.5 sm:text-base md:mt-8 md:px-10 md:py-4 md:text-lg"
          >
            WhatsApp Booking
            <span className="transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </a>
        </PageContainer>
      </section>


      {/* Services */}
      <section className="py-8 sm:py-10 md:py-12 lg:py-14">
        <PageContainer>
          <SectionHeading title="Our Services" />

          <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2 sm:gap-5 md:gap-6 lg:mt-10 lg:grid-cols-4">
            {services.map((service) => (
              <div
                key={service.title}
                className="group rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-homigo-accent/20 hover:shadow-lg hover:shadow-slate-200/80 sm:p-6 md:p-8"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-2xl transition-colors duration-300 group-hover:bg-homigo-accent/10 sm:h-14 sm:w-14 sm:text-3xl">
                  {service.icon}
                </div>

                <h3 className="mt-3 text-lg font-bold text-homigo-primary sm:mt-4 sm:text-xl">
                  {service.title}
                </h3>

                <p className="mt-1.5 text-sm leading-relaxed text-slate-500 sm:mt-2">
                  {service.desc}
                </p>
              </div>
            ))}
          </div>
        </PageContainer>
      </section>


      {/* Why Choose Homigo */}
      <section className="bg-white py-12 sm:py-16 md:py-20 lg:py-24 xl:py-28">
        <PageContainer>
          <SectionHeading title="Why Choose Homigo?" />

          <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-6 md:gap-8 lg:mt-16 lg:grid-cols-3">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="group rounded-2xl border border-slate-100 bg-homigo-bg p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-homigo-secondary/20 hover:shadow-lg hover:shadow-slate-200/80 sm:p-8 md:p-10"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-homigo-secondary/10 text-lg font-bold text-homigo-secondary transition-all duration-300 group-hover:bg-homigo-secondary group-hover:text-white sm:h-14 sm:w-14 sm:text-xl">
                  {benefit.icon}
                </div>

                <h3 className="mt-4 text-lg font-bold text-homigo-primary sm:mt-6 sm:text-xl">
                  {benefit.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:mt-3 sm:text-base">
                  {benefit.desc}
                </p>
              </div>
            ))}
          </div>
        </PageContainer>
      </section>


      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-r from-homigo-primary to-homigo-secondary px-4 py-12 text-center sm:px-6 sm:py-16 md:py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(34,197,94,0.1),transparent_70%)]" />

        <PageContainer className="relative max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            Need a Service Today?
          </h2>

          <p className="mt-3 text-base text-blue-100/90 sm:mt-4 sm:text-lg">
            Homigo is ready to help.
          </p>

          <button
            type="button"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-bold text-homigo-secondary shadow-lg shadow-black/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-xl sm:mt-8 sm:px-10 sm:py-4 sm:text-base"
          >
            Book Now
          </button>
        </PageContainer>
      </section>

    </main>
  );
}
