{
  pkgs,
  lib,
  config,
  inputs,
  ...
}: {
  # https://devenv.sh/basics/
  dotenv.enable = true;
  env.GREET = "devenv";

  # Default environment (local development)
  # Uses .localhost domains with automatic HTTPS via Caddy
  # Backend and frontend use random high ports to avoid conflicts
  env.PORT = "8765";  # Backend Express server
  env.VITE_DEV_PORT = "5928";  # Vite dev server
  env.CADDY_DOMAIN = "backend.dev.localhost";
  env.APP_DOMAIN = "app.dev.localhost";
  env.MARKETING_DOMAIN = "dev.localhost";
  env.AUTH_DOMAIN = "auth.dev.localhost";
  env.DEV_MODE = "true";
  env.VITE_BACKEND_URL = "https://backend.dev.localhost";
  env.VITE_AUTH_DOMAIN = "auth.dev.localhost";

  # Zitadel OIDC configuration
  env.ZITADEL_ISSUER = "https://auth.dev.localhost";
  # These will be set after Zitadel is initialized - see zitadel-config.yaml
  env.ZITADEL_CLIENT_ID = "placeholder-set-after-init";
  env.ZITADEL_CLIENT_SECRET = "placeholder-set-after-init";
  env.VITE_ZITADEL_CLIENT_ID = "placeholder-set-after-init";

  # Production profile (just changes the domains, everything else is the same)
  profiles.prod.module = {
    env.CADDY_DOMAIN = "backend.seance.dev";
    env.APP_DOMAIN = "app.seance.dev";
    env.MARKETING_DOMAIN = "seance.dev";
    env.AUTH_DOMAIN = "auth.seance.dev";
    env.DEV_MODE = "false";
    env.VITE_BACKEND_URL = "https://backend.seance.dev";
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
    zitadel
    # For cloud deploys
    opentofu
    ansible
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
  # Zitadel OIDC authentication server
  # Native binary using PostgreSQL backend
  processes.zitadel = {
    exec = ''
      mkdir -p .state/zitadel

      # Zitadel configuration via environment variables
      export ZITADEL_EXTERNALDOMAIN=${config.env.AUTH_DOMAIN}
      export ZITADEL_EXTERNALPORT=443
      export ZITADEL_EXTERNALSECURE=true
      export ZITADEL_TLS_ENABLED=false
      export ZITADEL_PORT=8080
      export ZITADEL_MASTERKEY="MasterkeyNeedsToHave32Characters"
      export ZITADEL_DATABASE_POSTGRES_HOST=localhost
      export ZITADEL_DATABASE_POSTGRES_PORT=5432
      export ZITADEL_DATABASE_POSTGRES_DATABASE=zitadel
      export ZITADEL_DATABASE_POSTGRES_USER_USERNAME=zitadel
      export ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=zitadel
      export ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE=disable
      export ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME=zitadel
      export ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD=zitadel
      export ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE=disable
      export ZITADEL_FIRSTINSTANCE_ORG_NAME="Seance"
      export ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME="admin"
      export ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD="ChangeThisPassword123!"

      ${lib.getExe pkgs.zitadel} start-from-init --masterkeyFromEnv
    '';
  };
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

  # https://devenv.sh/services/
  # PostgreSQL for Zitadel
  services.postgres = {
    enable = true;
    listen_addresses = "127.0.0.1";
    port = 5432;
    initialDatabases = [
      {
        name = "zitadel";
        user = "zitadel";
        pass = "zitadel";
      }
    ];
  };

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  scripts.cleanup-docker.exec = ''
    echo "Cleaning up any leftover Docker containers..."
    docker rm -f y-webrtc-signaling 2>/dev/null || true
    echo "Done!"
  '';

  scripts.clear-zitadel.exec = ''
    echo "🧹 Clearing Zitadel data..."
    echo ""
    echo "WARNING: This will delete all Zitadel users, projects, and configuration!"
    echo "Press Ctrl+C to cancel, or Enter to continue..."
    read

    # Clear Zitadel state directory
    if [ -d .state/zitadel ]; then
      rm -rf .state/zitadel
      echo "✓ Cleared Zitadel state directory"
    fi

    # Drop and recreate Zitadel database
    if [ -d .devenv/state/postgres ]; then
      echo "✓ Dropping zitadel database..."
      dropdb -h localhost -p 5432 zitadel 2>/dev/null || true
      echo "✓ Recreating zitadel database..."
      createdb -h localhost -p 5432 -O zitadel zitadel
    fi

    echo ""
    echo "✅ Zitadel data cleared!"
    echo "Restart devenv to reinitialize Zitadel."
  '';


  scripts.clear-data.exec = ''
    echo "🧹 Clearing all application data..."
    echo ""

    # Clear Zitadel data
    if [ -d .state/zitadel ]; then
      rm -rf .state/zitadel
      echo "✓ Cleared Zitadel state directory"
    else
      echo "✓ Zitadel state directory already clean"
    fi

    # Clear Valkey data directory (session storage)
    if [ -d .state/valkey ]; then
      rm -rf .state/valkey
      echo "✓ Cleared Valkey data directory"
    else
      echo "✓ Valkey data directory already clean"
    fi

    echo ""
    echo "✅ All application data cleared!"
    echo "Restart devenv to start fresh."
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
    echo "  clear-data                 - Clear all application data (Zitadel, Redis sessions)"
    echo "  clear-zitadel              - Clear only Zitadel data (users, projects, etc.)"
    echo ""
    echo "🌐 Local URLs (HTTPS via Caddy):"
    echo "  Marketing: https://dev.localhost  (Vite with hot reload)"
    echo "  Backend: https://backend.dev.localhost  (tsx watch with hot reload)"
    echo "  App: https://app.dev.localhost"
    echo "  Swagger UI: https://backend.dev.localhost/ui"
    echo "  Zitadel: https://auth.dev.localhost  (Auth server, admin: ChangeThisPassword123!)"
    echo "  Signaling: wss://backend.dev.localhost/signaling"
    echo ""
    echo "💡 Same setup for dev and production - just different domains!"
    echo ""
    echo "🔐 First-time setup:"
    echo "  1. Trust Caddy CA: run trust-caddy-ca"
    echo "  2. Visit https://auth.dev.localhost and login with admin/ChangeThisPassword123!"
    echo "  3. Create a project and OIDC application"
    echo "  4. Copy CLIENT_ID and CLIENT_SECRET to .env or devenv.nix"
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
