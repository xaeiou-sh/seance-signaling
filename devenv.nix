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
  env.PORT = "3000";
  env.CADDY_DOMAIN = "backend.localhost";
  env.APP_DOMAIN = "app.localhost";
  env.MARKETING_DOMAIN = "frontend.localhost";
  env.AUTH_DOMAIN = "auth.localhost";
  env.VITE_DEV_PORT = "5173";
  env.DEV_MODE = "true";
  env.VITE_BACKEND_URL = "https://backend.localhost";
  env.VITE_AUTH_DOMAIN = "auth.localhost";

  # Production profile (just changes the domains, everything else is the same)
  profiles.prod.module = {
    env.CADDY_DOMAIN = "backend.seance.dev";
    env.APP_DOMAIN = "app.seance.dev";
    env.MARKETING_DOMAIN = "seance.dev";
    env.AUTH_DOMAIN = "auth.seance.dev";
    env.DEV_MODE = "false";
    env.VITE_BACKEND_URL = "https://backend.seance.dev";
    env.VITE_AUTH_DOMAIN = "auth.seance.dev";
  };

  # https://devenv.sh/packages/
  packages = with pkgs; [
    git
    nodejs_22
    caddy
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
  processes.authelia = {
    cwd = ".";
    exec = ''
      mkdir -p /tmp/authelia
      export X_AUTHELIA_CONFIG_FILTERS=template
      ${lib.getExe pkgs.authelia} --config ./authelia-config.yml
    '';
  };
  services.redis = {
    enable = true;
    package = pkgs.valkey;
  };

  # https://devenv.sh/services/
  # services.postgres.enable = true;

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  scripts.cleanup-docker.exec = ''
    echo "Cleaning up any leftover Docker containers..."
    docker rm -f y-webrtc-signaling 2>/dev/null || true
    echo "Done!"
  '';

  scripts.authelia-hash.exec = ''
    if [ -z "$1" ]; then
      echo "Usage: authelia-hash <password>"
      echo "Generates an Argon2 hash for use in authelia-users.yml"
      exit 1
    fi
    ${lib.getExe pkgs.authelia} crypto hash generate argon2 --password "$1"
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
    echo "  authelia-hash <password>   - Generate password hash for authelia-users.yml"
    echo ""
    echo "🌐 Local URLs (HTTPS via Caddy):"
    echo "  Marketing: https://frontend.localhost  (Vite with hot reload)"
    echo "  Backend: https://backend.localhost  (tsx watch with hot reload)"
    echo "  App: https://app.localhost"
    echo "  Swagger UI: https://backend.localhost/ui"
    echo "  Authelia: https://auth.localhost  (Auth server)"
    echo "  Signaling: wss://backend.localhost/signaling"
    echo ""
    echo "💡 Same setup for dev and production - just different domains!"
    echo ""
    echo "🔐 First-time setup:"
    echo "  1. Trust Caddy CA: run trust-caddy-ca"
    echo "  2. Create user: authelia-hash 'yourpassword'"
    echo "  3. Copy hash to authelia-users.yml"
    echo "  4. Restart devenv"
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
