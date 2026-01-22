import { Link } from "react-router-dom";
import { Navigation } from "@/components/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import { CursorOverlay } from "@/components/CursorOverlay";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";
import { getStartedButtonStyle } from "@/components/buttons/ButtonStyles";

export default function PleaseSupport() {
  return (
    <div className="min-h-screen bg-void">
      <Navigation />

      <section className="relative overflow-hidden">
        <CursorOverlay />
        <HeroBackground />

        <div className="relative z-10 mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="text-center">
            <h1 className="mb-6 text-3xl font-bold tracking-tight text-pure sm:text-4xl lg:text-5xl">
              Support Seance
            </h1>
            <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-mist sm:text-xl">
              To download Seance, please create an account or sign in.
              Your support helps us build the future of collaborative development.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/signup">
                <Button
                  size="xl"
                  className={clsx(getStartedButtonStyle, "w-full sm:w-auto")}
                >
                  Create Account
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  size="xl"
                  variant="ghost"
                  className="w-full sm:w-auto text-mist transition-colors duration-300 hover:bg-secondary hover:text-flame"
                >
                  Sign In
                </Button>
              </Link>
            </div>

            <div className="mt-16 pt-16 border-t border-phantom">
              <h2 className="mb-4 text-xl font-bold text-neon">
                What you get with an account
              </h2>
              <ul className="mx-auto max-w-lg space-y-2 text-left text-mist">
                <li className="flex items-start gap-2">
                  <span className="text-flame">•</span>
                  <span>Access to desktop app downloads</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-flame">•</span>
                  <span>Subscription management and billing</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-flame">•</span>
                  <span>Priority support and feature requests</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-flame">•</span>
                  <span>Early access to new features</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
