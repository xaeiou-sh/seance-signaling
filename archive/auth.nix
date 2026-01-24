# ARCHIVED: Self-hosted Zitadel authentication infrastructure
# This file contains all Zitadel + PostgreSQL configuration
# Moved to /archive - authentication temporarily disabled
{
  pkgs,
  lib,
  config,
  ...
}: let
  # PostgreSQL configuration for Zitadel
  pgVersion = pkgs.postgresql_17;
  pgData = ".state/postgres";
  pgPort = "5432";
  pgHost = "127.0.0.1";
in {
  # Environment variables for Zitadel
  env.AUTH_DOMAIN = "auth.dev.localhost";
  env.VITE_AUTH_DOMAIN = "auth.dev.localhost";
  env.ZITADEL_ISSUER = "https://auth.dev.localhost";
  env.ZITADEL_CLIENT_ID = config.secretspec.secrets.ZITADEL_CLIENT_ID or "";
  env.ZITADEL_CLIENT_SECRET = config.secretspec.secrets.ZITADEL_CLIENT_SECRET or "";
  env.VITE_ZITADEL_CLIENT_ID = config.secretspec.secrets.VITE_ZITADEL_CLIENT_ID or "";

  # Production profile overrides
  profiles.prod.module = {
    env.AUTH_DOMAIN = "auth.seance.dev";
    env.VITE_AUTH_DOMAIN = "auth.seance.dev";
    env.ZITADEL_ISSUER = "https://auth.seance.dev";
    env.ZITADEL_CLIENT_ID = "placeholder-set-after-init";
    env.ZITADEL_CLIENT_SECRET = "placeholder-set-after-init";
    env.VITE_ZITADEL_CLIENT_ID = "placeholder-set-after-init";
  };

  # Packages needed for auth
  packages = with pkgs; [
    zitadel
    postgresql_17
  ];

  # PostgreSQL process for Zitadel
  processes.postgres = {
    process-compose = {
      readiness_probe = {
        exec.command = "${pgVersion}/bin/pg_isready -h ${pgHost} -p ${pgPort} -d postgres";
        initial_delay_seconds = 1;
        period_seconds = 1;
      };
    };
    exec = ''
      # Check if running as root
      if [ "$(id -u)" -eq 0 ]; then
        # Running as root - check platform
        if [ "$(uname)" = "Darwin" ]; then
          echo "ERROR: PostgreSQL cannot run as root on macOS"
          echo ""
          echo "Running PostgreSQL as root is a security risk and not supported on macOS."
          echo "Please run devenv as a non-root user."
          echo ""
          exit 1
        fi

        # Linux: Create postgres user if it doesn't exist
        if ! id -u postgres >/dev/null 2>&1; then
          echo "Creating postgres user..."
          useradd -r -s /bin/sh -d /var/empty postgres 2>/dev/null || true
        fi

        # Ensure postgres user owns the data directory
        mkdir -p ${pgData}
        chown -R postgres:postgres ${pgData}

        # Export working directory for postgres user
        export POSTGRES_WORKDIR="$PWD"
        export PGDATA="${pgData}"

        # Run postgres setup as postgres user
        if command -v sudo >/dev/null 2>&1; then
          exec sudo -u postgres -E bash <<'POSTGRES_SCRIPT'
      cd "$POSTGRES_WORKDIR" || exit 1

      # Stop any existing server
      ${pgVersion}/bin/pg_ctl -D "$PGDATA" stop 2>/dev/null || true
      rm -f "$PGDATA/postmaster.pid" 2>/dev/null || true

      # Initialize database if not already done
      if [ ! -f "$PGDATA/PG_VERSION" ]; then
        echo "Initializing PostgreSQL database..."
        ${pgVersion}/bin/initdb -D "$PGDATA" --no-locale --encoding=UTF8

        # Configure PostgreSQL
        cat >> "$PGDATA/postgresql.conf" <<PGCONF
      listen_addresses = '${pgHost}'
      port = ${pgPort}
      unix_socket_directories = '\$PWD/\$PGDATA'
      PGCONF

        # Allow local connections without password for dev
        cat > "$PGDATA/pg_hba.conf" <<PGHBA
      local   all   all                 trust
      host    all   all   127.0.0.1/32  trust
      host    all   all   ::1/128       trust
      PGHBA
      fi

      # Start PostgreSQL
      ${pgVersion}/bin/pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-k \$PWD/\$PGDATA" start

      # Wait for PostgreSQL to be ready
      for i in $(seq 1 30); do
        if ${pgVersion}/bin/pg_isready -h ${pgHost} -p ${pgPort} > /dev/null 2>&1; then
          break
        fi
        sleep 0.5
      done

      # Create zitadel user and database if they don't exist
      ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -c "SELECT 1 FROM pg_roles WHERE rolname='zitadel'" | grep -q 1 || \
        ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -c "CREATE USER zitadel WITH PASSWORD 'zitadel' SUPERUSER"
      ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='zitadel'" | grep -q 1 || \
        ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -c "CREATE DATABASE zitadel OWNER zitadel"

      # Keep running (tail the log)
      tail -f "$PGDATA/postgres.log"
      POSTGRES_SCRIPT
        else
          # Fallback to su if sudo not available
          exec su postgres -s /bin/sh -c "export PGDATA='${pgData}'; cd '$PWD' && bash" <<'POSTGRES_SCRIPT'
      # Stop any existing server
      ${pgVersion}/bin/pg_ctl -D "$PGDATA" stop 2>/dev/null || true
      rm -f "$PGDATA/postmaster.pid" 2>/dev/null || true

      # Initialize database if not already done
      if [ ! -f "$PGDATA/PG_VERSION" ]; then
        echo "Initializing PostgreSQL database..."
        ${pgVersion}/bin/initdb -D "$PGDATA" --no-locale --encoding=UTF8

        # Configure PostgreSQL
        cat >> "$PGDATA/postgresql.conf" <<PGCONF
      listen_addresses = '${pgHost}'
      port = ${pgPort}
      unix_socket_directories = '\$PWD/\$PGDATA'
      PGCONF

        # Allow local connections without password for dev
        cat > "$PGDATA/pg_hba.conf" <<PGHBA
      local   all   all                 trust
      host    all   all   127.0.0.1/32  trust
      host    all   all   ::1/128       trust
      PGHBA
      fi

      # Start PostgreSQL
      ${pgVersion}/bin/pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-k \$PWD/\$PGDATA" start

      # Wait for PostgreSQL to be ready
      for i in $(seq 1 30); do
        if ${pgVersion}/bin/pg_isready -h ${pgHost} -p ${pgPort} > /dev/null 2>&1; then
          break
        fi
        sleep 0.5
      done

      # Create zitadel user and database if they don't exist
      ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -c "SELECT 1 FROM pg_roles WHERE rolname='zitadel'" | grep -q 1 || \
        ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -c "CREATE USER zitadel WITH PASSWORD 'zitadel' SUPERUSER"
      ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='zitadel'" | grep -q 1 || \
        ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -c "CREATE DATABASE zitadel OWNER zitadel"

      # Keep running (tail the log)
      tail -f "$PGDATA/postgres.log"
      POSTGRES_SCRIPT
        fi
      else
        # Not running as root - run directly
        PGDATA=${pgData}
        mkdir -p "$PGDATA"

      # Stop any existing server
      ${pgVersion}/bin/pg_ctl -D "$PGDATA" stop 2>/dev/null || true
      rm -f "$PGDATA/postmaster.pid" 2>/dev/null || true

      # Initialize database if not already done
      if [ ! -f "$PGDATA/PG_VERSION" ]; then
        echo "Initializing PostgreSQL database..."
        ${pgVersion}/bin/initdb -D "$PGDATA" --no-locale --encoding=UTF8

        # Configure PostgreSQL
        cat >> "$PGDATA/postgresql.conf" <<EOF
      listen_addresses = '${pgHost}'
      port = ${pgPort}
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
      ${pgVersion}/bin/pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-k $PWD/$PGDATA" start

      # Wait for PostgreSQL to be ready
      for i in $(seq 1 30); do
        if ${pgVersion}/bin/pg_isready -h ${pgHost} -p ${pgPort} > /dev/null 2>&1; then
          break
        fi
        sleep 0.5
      done

      # Create zitadel user and database if they don't exist
      ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -c "SELECT 1 FROM pg_roles WHERE rolname='zitadel'" | grep -q 1 || \
        ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -c "CREATE USER zitadel WITH PASSWORD 'zitadel' SUPERUSER"
      ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='zitadel'" | grep -q 1 || \
        ${pgVersion}/bin/psql -h ${pgHost} -p ${pgPort} -d postgres -c "CREATE DATABASE zitadel OWNER zitadel"

      # Keep running (tail the log)
      tail -f "$PGDATA/postgres.log"
      fi
    '';
  };

  # Zitadel OIDC authentication server
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

  # Zitadel-related scripts
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
}
