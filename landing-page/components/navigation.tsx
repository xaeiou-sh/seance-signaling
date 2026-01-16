import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { Download, User } from "lucide-react";
import { Button } from "./ui/button";
import { downloadButtonStyle, getStartedButtonStyle } from "@/components/buttons/ButtonStyles";
import { posthog } from "@/lib/posthog";
import { useAuth } from "@/lib/auth-context";

export const Navigation = () => {
  const { isAuthenticated, user, login, logout } = useAuth();

  const handleSignInClick = () => {
    posthog.capture('sign_in_clicked', {
      location: 'navigation',
    });
    login();
  };

  const handleGetStartedClick = () => {
    posthog.capture('get_started_clicked', {
      location: 'navigation',
    });
    login();
  };

  const handleLogoutClick = () => {
    posthog.capture('logout_clicked', {
      location: 'navigation',
    });
    logout();
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
          {isAuthenticated ? (
            <>
              {/* Authenticated State */}
              <Button
                variant="ghost"
                onClick={handleLogoutClick}
                className="hidden lg:inline-flex text-mist transition-colors duration-300 hover:bg-secondary hover:text-neon"
              >
                <User className="h-4 w-4" />
                <span className="hidden xl:inline">{user?.email}</span>
              </Button>
              <Link to="/dashboard">
                <Button className={clsx(getStartedButtonStyle)}>
                  Dashboard
                </Button>
              </Link>
            </>
          ) : (
            <>
              {/* Unauthenticated State */}
              <Button
                variant="ghost"
                onClick={handleSignInClick}
                className="hidden lg:inline-flex text-mist transition-colors duration-300 hover:bg-secondary hover:text-flame"
              >
                Sign In
              </Button>
              <Button onClick={handleGetStartedClick} className={clsx(getStartedButtonStyle)}>
                Get Started
              </Button>
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
