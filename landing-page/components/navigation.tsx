import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Download, User } from "lucide-react";
import { Button } from "./ui/button";
import { downloadButtonStyle, getStartedButtonStyle } from "@/components/buttons/ButtonStyles";
import { posthog } from "@/lib/posthog";
// ARCHIVED: Auth disabled
// import { useAuth } from "@/lib/auth-context";

export const Navigation = () => {
  // ARCHIVED: Auth disabled - always show unauthenticated state
  const isAuthenticated = false;
  const user = null as any;

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
          {isAuthenticated ? (
            <>
              {/* Authenticated State */}
              <Link to="/dashboard">
                <Button
                  variant="ghost"
                  className="hidden lg:inline-flex text-mist transition-colors duration-300 hover:bg-secondary hover:text-neon"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden xl:inline">{user?.email}</span>
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button className={clsx(getStartedButtonStyle)}>
                  Dashboard
                </Button>
              </Link>
            </>
          ) : (
            <>
              {/* Unauthenticated State */}
              <Link to="/login">
                <Button
                  variant="ghost"
                  className="hidden lg:inline-flex text-mist transition-colors duration-300 hover:bg-secondary hover:text-flame"
                >
                  Sign In
                </Button>
              </Link>
              <Link to="/signup">
                <Button className={clsx(getStartedButtonStyle)}>
                  Get Started
                </Button>
              </Link>
            </>
          )}
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
