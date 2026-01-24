{
  pkgs,
  lib,
  config,
  ...
}: let
  # PostgreSQL configuration for Zitadel
  # Handles running as root on Linux by delegating to postgres user
  pgVersion = pkgs.postgresql_17;
  pgData = ".state/postgres";
  pgPort = "5432";
  pgHost = "127.0.0.1";
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
}
