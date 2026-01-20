{
  pkgs,
  lib,
  config,
  inputs,
  ...
}: {
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
    zitadel
    postgresql_17
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
    process-compose = {
      depends_on.postgres.condition = "process_healthy";
      environment = [
        # Zitadel configuration via environment variables
        ''ZITADEL_EXTERNALDOMAIN=${config.env.AUTH_DOMAIN}''
        ''ZITADEL_EXTERNALPORT=443''
        ''ZITADEL_EXTERNALSECURE=true''
        ''ZITADEL_TLS_ENABLED=false''
        ''ZITADEL_PORT=8080''
        # Master key from secretspec (must be 32 bytes)
        ''ZITADEL_MASTERKEY=${config.secretspec.secrets.ZITADEL_MASTERKEY or "MasterkeyNeedsToHave32Characters"}''
        ''ZITADEL_DATABASE_POSTGRES_HOST=localhost''
        ''ZITADEL_DATABASE_POSTGRES_PORT=5432''
        ''ZITADEL_DATABASE_POSTGRES_DATABASE=zitadel''
        ''ZITADEL_DATABASE_POSTGRES_USER_USERNAME=zitadel''
        # Postgres password from secretspec
        ''ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=${config.secretspec.secrets.POSTGRES_PASSWORD or "zitadel_dev_password"}''
        ''ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE=disable''
        ''ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME=zitadel''
        # Postgres admin password from secretspec
        ''ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD=${config.secretspec.secrets.POSTGRES_PASSWORD or "zitadel_dev_password"}''
        ''ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE=disable''
        ''ZITADEL_FIRSTINSTANCE_ORG_NAME="Seance"''
        # Use email as username to avoid domain suffix (admin@org.domain)
        # Must use valid email format - .localhost is not accepted by Zitadel
        ''ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME=admin@dev.localhost''
        ''ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD=ChangeThisPassword123!''
        # Correct variable name is EMAIL_ADDRESS (not EMAIL)
        ''ZITADEL_FIRSTINSTANCE_ORG_HUMAN_EMAIL_ADDRESS=admin@seance.dev''
        ''ZITADEL_FIRSTINSTANCE_ORG_HUMAN_EMAIL_VERIFIED=true''
        ''ZITADEL_FIRSTINSTANCE_ORG_HUMAN_FIRSTNAME="Admin"''
        ''ZITADEL_FIRSTINSTANCE_ORG_HUMAN_LASTNAME="User"''
        # Correct variable name has no underscores between CHANGE and REQUIRED
        ''ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORDCHANGEREQUIRED=false''
        # Disable domain suffix on login names
        ''ZITADEL_DEFAULTINSTANCE_DOMAINPOLICY_USERLOGINMUSTBEDOMAIN=false''
        # Create machine user for API automation
        ''ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_USERNAME=seance-automation''
        ''ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_NAME=Seance Automation''
        ''ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINEKEY_TYPE=1''
        ''ZITADEL_FIRSTINSTANCE_MACHINEKEYPATH=.state/zitadel/machine-key.json''
        # Generate a PAT for the machine user (expires in 9999)
        ''ZITADEL_FIRSTINSTANCE_PATPATH=.state/zitadel/pat.txt''
        ''ZITADEL_FIRSTINSTANCE_ORG_MACHINE_PAT_EXPIRATIONDATE=9999-12-31T23:59:59Z''
      ];
    };
    exec = ''
      mkdir -p .state/zitadel


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

  # PostgreSQL for Zitadel
  # Run as a process instead of service for better control over data location
  processes.postgres = {
    process-compose = {
      readiness_probe = {
        exec.command = "${pkgs.postgresql_17}/bin/pg_isready -h 127.0.0.1 -p 5432 -d postgres";
        initial_delay_seconds = 1;
        period_seconds = 1;
      };
    };
    exec = ''
            PGDATA=.state/postgres
            mkdir -p "$PGDATA"

            # Stop any existing server
            ${pkgs.postgresql_17}/bin/pg_ctl -D "$PGDATA" stop 2>/dev/null || true
            rm -f "$PGDATA/postmaster.pid" 2>/dev/null || true

            # Initialize database if not already done
            if [ ! -f "$PGDATA/PG_VERSION" ]; then
              echo "Initializing PostgreSQL database..."
              ${pkgs.postgresql_17}/bin/initdb -D "$PGDATA" --no-locale --encoding=UTF8

              # Configure PostgreSQL
              cat >> "$PGDATA/postgresql.conf" <<EOF
      listen_addresses = '127.0.0.1'
      port = 5432
      unix_socket_directories = '$PWD/$PGDATA'
      EOF

              # Allow local connections without password for dev
              cat > "$PGDATA/pg_hba.conf" <<EOF
      local   all   all                 trust
      host    all   all   127.0.0.1/32  trust
      host    all   all   ::1/128       trust
      EOF
            fi

            # Start PostgreSQL
            ${pkgs.postgresql_17}/bin/pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-k $PWD/$PGDATA" start

            # Wait for PostgreSQL to be ready
            for i in $(seq 1 30); do
              if ${pkgs.postgresql_17}/bin/pg_isready -h 127.0.0.1 -p 5432 > /dev/null 2>&1; then
                break
              fi
              sleep 0.5
            done

            # Create zitadel user and database if they don't exist
            ${pkgs.postgresql_17}/bin/psql -h 127.0.0.1 -p 5432 -d postgres -c "SELECT 1 FROM pg_roles WHERE rolname='zitadel'" | grep -q 1 || \
              ${pkgs.postgresql_17}/bin/psql -h 127.0.0.1 -p 5432 -d postgres -c "CREATE USER zitadel WITH PASSWORD 'zitadel' SUPERUSER"
            ${pkgs.postgresql_17}/bin/psql -h 127.0.0.1 -p 5432 -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='zitadel'" | grep -q 1 || \
              ${pkgs.postgresql_17}/bin/psql -h 127.0.0.1 -p 5432 -d postgres -c "CREATE DATABASE zitadel OWNER zitadel"

            # Keep running (tail the log)
            tail -f "$PGDATA/postgres.log"
    '';
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

  scripts.check-zitadel-admin.exec = ''
    echo "🔍 Checking Zitadel admin user..."
    echo ""
    psql -h localhost -p 5432 -U zitadel -d zitadel -c "SELECT u.username, u.state, h.is_email_verified, h.password_change_required, n.password_set, h.email FROM projections.users14 u JOIN projections.users14_humans h ON u.id = h.user_id JOIN projections.users14_notifications n ON u.id = n.user_id ORDER BY u.creation_date LIMIT 1;" 2>&1
    echo ""
    echo "Login with the username shown above at https://auth.dev.localhost/ui/console"
    echo "Password: ChangeThisPassword123!"
  '';

  scripts.setup-zitadel-app.exec = ''
    ${pkgs.bash}/bin/bash ./scripts/setup-zitadel-app.sh
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
    if [ -d .state/postgres ]; then
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

    # Clear PostgreSQL data directory
    if [ -d .state/postgres ]; then
      rm -rf .state/postgres
      echo "✓ Cleared PostgreSQL data directory"
    else
      echo "✓ PostgreSQL data directory already clean"
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
    echo "  check-zitadel-admin        - Show the admin username and login details"
    echo "  setup-zitadel-app          - Create OIDC app and get CLIENT_ID/SECRET (run once)"
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
    echo "  1. Copy .env.example to .env (secrets managed by secretspec)"
    echo "  2. Trust Caddy CA: run trust-caddy-ca"
    echo "  3. Start services: devenv up"
    echo "  4. Run setup-zitadel-app to auto-create OIDC app (writes to .env)"
    echo "  5. Restart devenv to load new credentials from .env"
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
