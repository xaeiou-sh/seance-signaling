import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Download } from "lucide-react";
import { Button } from "./ui/button";
import { downloadButtonStyle, getStartedButtonStyle } from "@/components/buttons/ButtonStyles";
import { posthog } from "@/lib/posthog";

export const Navigation = () => {
  const handleSignInClick = () => {
    posthog.capture('sign_in_clicked', {
      location: 'navigation',
    });
  };

  const handleGetStartedClick = () => {
    posthog.capture('get_started_clicked', {
      location: 'navigation',
    });
  };

  const handleDownloadNavClick = () => {
    posthog.capture('download_nav_clicked', {
      location: 'navigation',
    });
  };

  return (
    <nav className="sticky top-0 z-[100] w-full border-b border-border bg-void/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="font-cartridge text-3xl text-pure sm:text-4xl">
            Seance
          </div>
        </Link>

        {/* CTA Buttons */}
        <div className="flex items-center gap-3">
          <a
            href="https://forms.gle/6Br64PFmTZSD4qjd9"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:inline-flex"
            onClick={handleSignInClick}
          >
            <Button
              variant="ghost"
              className="text-mist transition-colors duration-300 hover:bg-secondary hover:text-flame"
            >
              Sign In
            </Button>
          </a>
          <a
            href="https://forms.gle/6Br64PFmTZSD4qjd9"
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleGetStartedClick}
          >
            <Button className={clsx(getStartedButtonStyle)}>
              Get Started
            </Button>
          </a>
          <Link
            to="/download"
            className="hidden sm:inline-flex"
            onClick={handleDownloadNavClick}
          >
            <Button className={clsx(downloadButtonStyle)}>
              <Download className="h-4 w-4" />
              Download
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};
