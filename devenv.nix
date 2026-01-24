{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:
# ARCHIVED: PostgreSQL + Zitadel auth infrastructure moved to /archive/auth.nix
# let
#   postgresModule = import ./postgres.nix {inherit pkgs lib config;};
# in
{
  dotenv.enable = true;
  # https://devenv.sh/basics/
  # Note: dotenv is handled by secretspec - see devenv.yaml and secretspec.toml
  env.GREET = "devenv";
  # Default environment (local development)
  # Uses .localhost domains with automatic HTTPS via Caddy
  # Backend and frontend use random high ports to avoid conflicts
  env.PORT = "8765"; # Backend Express server
  env.VITE_DEV_PORT = "5928"; # Vite dev server
  env.CADDY_DOMAIN = "backend.dev.localhost";
  env.APP_DOMAIN = "app.dev.localhost";
  env.MARKETING_DOMAIN = "dev.localhost";
  env.AUTH_DOMAIN = "auth.dev.localhost";
  env.DEV_MODE = "true";
  env.VITE_BACKEND_URL = "https://backend.dev.localhost";
  env.BACKEND_URL = "https://backend.dev.localhost"; # Same as VITE_BACKEND_URL for OAuth redirect_uri consistency
  env.VITE_AUTH_DOMAIN = "auth.dev.localhost";

  # Zitadel OIDC configuration
  env.ZITADEL_ISSUER = "https://auth.dev.localhost";
  # Secrets managed by secretspec - see secretspec.toml and .env
  env.ZITADEL_CLIENT_ID = config.secretspec.secrets.ZITADEL_CLIENT_ID or "";
  env.ZITADEL_CLIENT_SECRET = config.secretspec.secrets.ZITADEL_CLIENT_SECRET or "";
  env.VITE_ZITADEL_CLIENT_ID = config.secretspec.secrets.VITE_ZITADEL_CLIENT_ID or "";

  # Stripe payment processing
  env.STRIPE_SECRET_KEY = config.secretspec.secrets.STRIPE_SECRET_KEY or "";
  env.STRIPE_WEBHOOK_SECRET = config.secretspec.secrets.STRIPE_WEBHOOK_SECRET or "";
  env.STRIPE_PRICE_ID = config.secretspec.secrets.STRIPE_PRICE_ID or "";

  # Production profile (just changes the domains, everything else is the same)
  profiles.prod.module = {
    env.CADDY_DOMAIN = "backend.seance.dev";
    env.APP_DOMAIN = "app.seance.dev";
    env.MARKETING_DOMAIN = "seance.dev";
    env.AUTH_DOMAIN = "auth.seance.dev";
    env.DEV_MODE = "false";
    env.VITE_BACKEND_URL = "https://backend.seance.dev";
    env.BACKEND_URL = "https://backend.seance.dev"; # Same as VITE_BACKEND_URL for OAuth redirect_uri consistency
    env.VITE_AUTH_DOMAIN = "auth.seance.dev";

    # Zitadel OIDC configuration (production)
    env.ZITADEL_ISSUER = "https://auth.seance.dev";
    env.ZITADEL_CLIENT_ID = "placeholder-set-after-init";
    env.ZITADEL_CLIENT_SECRET = "placeholder-set-after-init";
    env.VITE_ZITADEL_CLIENT_ID = "placeholder-set-after-init";
  };

  # https://devenv.sh/packages/
  packages = with pkgs; [
    git
    nodejs_22
    caddy
    # ARCHIVED: Auth infrastructure removed
    # zitadel
    # postgresql_17
    # For cloud deploys
    opentofu
    ansible
    # Kubernetes local development
    kind
    kubectl
    tilt
    cdk8s-cli
  ];

  # https://devenv.sh/languages/
  # languages.rust.enable = true;

  # https://devenv.sh/processes/
  processes.signaling-server.exec = ''
    docker rm -f y-webrtc-signaling 2>/dev/null || true
    docker run --rm --name y-webrtc-signaling \
      -p 4444:4444 \
      -e PORT=4444 \
      funnyzak/y-webrtc-signaling:latest
  '';

  processes.caddy = {
    cwd = ".";
    exec = ''${lib.getExe pkgs.caddy} run --config ./Caddyfile --adapter caddyfile'';
  };

  processes.backend = {
    cwd = "./backend-trpc";
    exec = ''
      npm install
      npm run dev
    '';
  };
  processes.landing-page = {
    cwd = "./landing-page";
    exec = ''
      npm install
      npm run dev -- --port ${config.env.VITE_DEV_PORT} --host 0.0.0.0
    '';
  };
  # ARCHIVED: Zitadel process moved to /archive/auth.nix
  # Authentication temporarily disabled
  # Valkey (Redis fork) for session storage
  # Run as a process instead of service for better control over data location
  processes.valkey = {
    exec = ''
            mkdir -p .state/valkey
            cat > .state/valkey/valkey.conf <<EOF
      dir .state/valkey
      bind 127.0.0.1
      port 6379
      save ""
      EOF
            ${pkgs.valkey}/bin/valkey-server .state/valkey/valkey.conf
    '';
  };

  # ARCHIVED: PostgreSQL process moved to /archive/auth.nix
  # processes.postgres = postgresModule.postgres;

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  scripts.cleanup-docker.exec = ''
    echo "Cleaning up any leftover Docker containers..."
    docker rm -f y-webrtc-signaling 2>/dev/null || true
    echo "Done!"
  '';

  # ARCHIVED: Zitadel scripts moved to /archive/auth.nix
  # scripts.check-zitadel-admin - authentication disabled
  # scripts.setup-zitadel-app - authentication disabled
  # scripts.clear-zitadel - authentication disabled

  scripts.clear-data.exec = ''
    echo "🧹 Clearing all application data..."
    echo ""

    # Clear Valkey data directory (session storage)
    if [ -d .state/valkey ]; then
      rm -rf .state/valkey
      echo "✓ Cleared Valkey data directory"
    else
      echo "✓ Valkey data directory already clean"
    fi

    # ARCHIVED: Zitadel and PostgreSQL data clearing removed
    # Authentication infrastructure disabled

    echo ""
    echo "✅ All application data cleared!"
    echo "Restart devenv to start fresh."
  '';

  # Kubernetes development scripts
  scripts.k8s-setup.exec = ''
    echo "☸️  Setting up Kubernetes local development environment..."
    echo ""
    cd kubernetes && ./setup.sh
  '';

  scripts.k8s-dev.exec = ''
    echo "☸️  Starting Kubernetes development with Tilt..."
    echo ""
    cd kubernetes && tilt up
  '';
  scripts.k8s-deploy.exec = ''
    echo "☸️  Deploying Kubernetes to cloud."
    echo ""
    cd ${config.git.root} && ./scripts/deploy-production.sh
  '';
  scripts.k8s-clean.exec = ''
    echo "☸️  Deleting all exsiting kubernetes cluster info"
    echo ""
    kind delete cluster --name seance-local
  '';
  scripts.trust-caddy-ca.exec = ''
    echo "🔒 Installing Caddy CA certificate..."
    echo ""

    # Caddy stores its CA at a predictable location
    CA_CERT="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"

    if [ ! -f "$CA_CERT" ]; then
      echo "❌ Caddy CA certificate not found at: $CA_CERT"
      echo ""
      echo "Please start Caddy first with 'devenv up' to generate the certificate."
      exit 1
    fi

    echo "Found Caddy CA certificate"
    echo "Installing to system keychain..."
    echo ""

    # macOS: Add to system keychain
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_CERT"

    echo ""
    echo "✅ Caddy CA certificate installed!"
    echo "You may need to restart your browser for changes to take effect."
  '';

  # https://devenv.sh/basics/
  enterShell = ''
    echo "🔮 Seance Development Environment"
    echo ""
    echo "Available commands:"
    echo "  devenv up                  - Start all services (local dev)"
    echo "  devenv --profile prod up   - Start all services (production domains)"
    echo "  cleanup-docker             - Remove leftover Docker containers"
    echo "  clear-data                 - Clear all application data (Redis sessions)"
    echo ""
    echo "🌐 Local URLs (HTTPS via Caddy):"
    echo "  Marketing: https://dev.localhost  (Vite with hot reload)"
    echo "  Backend: https://backend.dev.localhost  (tsx watch with hot reload)"
    echo "  App: https://app.dev.localhost"
    echo "  Swagger UI: https://backend.dev.localhost/ui"
    echo "  Signaling: wss://backend.dev.localhost/signaling"
    echo ""
    echo "💡 Same setup for dev and production - just different domains!"
    echo ""
    echo "🔐 First-time setup:"
    echo "  1. Copy .env.example to .env (secrets managed by secretspec)"
    echo "  2. Trust Caddy CA: run trust-caddy-ca"
    echo "  3. Start services: devenv up"
    echo ""
    echo "☸️  Kubernetes Development (kubernetes-migration branch):"
    echo "  k8s-setup  - One-time Kubernetes setup (kind cluster + ingress)"
    echo "  k8s-dev    - Start Kubernetes development with Tilt"
    echo "  See kubernetes/README.md for details"
    echo ""
    echo "⚠️  Authentication temporarily disabled - auth infrastructure archived"
  '';

  # https://devenv.sh/tasks/
  # tasks = {
  #   "myproj:setup".exec = "mytool build";
  #   "devenv:enterShell".after = [ "myproj:setup" ];
  # };

  # https://devenv.sh/tests/
  enterTest = ''
    echo "Running tests"
    git --version | grep --color=auto "${pkgs.git.version}"
  '';

  # https://devenv.sh/git-hooks/
  # git-hooks.hooks.shellcheck.enable = true;

  # See full reference at https://devenv.sh/reference/options/
}
