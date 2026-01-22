{
  pkgs,
  lib,
  config,
  ...
}: let
  # PostgreSQL configuration for Zitadel
  # Handles running as root by delegating to postgres user
  pgVersion = pkgs.postgresql_17;
  pgData = ".state/postgres";
  pgPort = "5432";
  pgHost = "127.0.0.1";

  # Helper to run commands as postgres user when running as root
  # If not root, runs commands directly
  asPostgresUser = cmd: ''
    if [ "$(id -u)" -eq 0 ]; then
      # Running as root - delegate to postgres user

      # Create postgres user if it doesn't exist
      if ! id -u postgres >/dev/null 2>&1; then
        echo "Creating postgres user..."
        if [ "$(uname)" = "Darwin" ]; then
          # macOS: Create user with dscl
          dscl . -create /Users/postgres
          dscl . -create /Users/postgres UserShell /bin/sh
          dscl . -create /Users/postgres RealName "PostgreSQL Server"
          dscl . -create /Users/postgres UniqueID 999
          dscl . -create /Users/postgres PrimaryGroupID 999
          dscl . -create /Groups/postgres
          dscl . -create /Groups/postgres PrimaryGroupID 999
        else
          # Linux: Create system user with valid shell
          useradd -r -s /bin/sh -d /var/empty postgres 2>/dev/null || true
        fi
      fi

      # Ensure postgres user owns the data directory
      mkdir -p "${pgData}"
      chown -R postgres:postgres "${pgData}"

      # Ensure postgres user can access current directory
      # Run command as postgres user using sudo (more reliable than su for this case)
      if command -v sudo >/dev/null 2>&1; then
        sudo -u postgres bash -c "cd '$PWD' && ${cmd}"
      else
        # Fallback to su if sudo is not available
        su postgres -c "cd '$PWD' && ${cmd}"
      fi
    else
      # Not running as root - run directly
      ${cmd}
    fi
  '';
in {
  # PostgreSQL process configuration
  # Run as a process instead of service for better control over data location
  postgres = {
    process-compose = {
      readiness_probe = {
        exec.command = "${pgVersion}/bin/pg_isready -h ${pgHost} -p ${pgPort} -d postgres";
        initial_delay_seconds = 1;
        period_seconds = 1;
      };
    };
    exec = ''
      PGDATA=${pgData}
      mkdir -p "$PGDATA"

      ${asPostgresUser ''
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
      ''}
    '';
  };
}
