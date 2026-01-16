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
  env.PORT = "3000";
  env.CADDY_DOMAIN = "http://localhost:8080";
  env.APP_DOMAIN = "http://localhost:8081";
  env.MARKETING_DOMAIN = "http://localhost:8082";
  env.VITE_DEV_PORT = "5173";
  env.DEV_MODE = "true";

  # Production profile (just changes the domains, everything else is the same)
  profiles.prod.module = {
    env.CADDY_DOMAIN = "backend.seance.dev";
    env.APP_DOMAIN = "app.seance.dev";
    env.MARKETING_DOMAIN = "seance.dev";
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

  processes.caddy.exec = ''
    cd ${config.env.DEVENV_ROOT}
    ${lib.getExe pkgs.caddy} run --config ./Caddyfile --adapter caddyfile
  '';

  processes.backend.exec = ''
    cd ${config.env.DEVENV_ROOT}/backend-fastify
    npm install
    npm run dev
  '';

  processes.landing-page.exec = ''
    cd ${config.env.DEVENV_ROOT}/landing-page
    npm install
    npm run dev -- --port ${config.env.VITE_DEV_PORT} --host 0.0.0.0
  '';

  # https://devenv.sh/services/
  # services.postgres.enable = true;

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  scripts.start-services.exec = ''
    echo "Starting y-webrtc signaling server and Cloudflare Tunnel..."
    echo "Use 'devenv up' to start all services"
  '';

  scripts.cleanup-docker.exec = ''
    echo "Cleaning up any leftover Docker containers..."
    docker rm -f y-webrtc-signaling 2>/dev/null || true
    echo "Done!"
  '';

  scripts.build-landing.exec = ''
    echo "ℹ️  Build not needed - Vite runs in production!"
    echo "Just run 'devenv up' or 'devenv --profile prod up'"
  '';

  # https://devenv.sh/basics/
  enterShell = ''
    echo "🔮 Seance Development Environment"
    echo ""
    echo "Available commands:"
    echo "  devenv up                  - Start all services (local dev)"
    echo "  devenv --profile prod up   - Start all services (production domains)"
    echo "  cleanup-docker             - Remove leftover Docker containers"
    echo ""
    echo "🌐 Local URLs:"
    echo "  Marketing: http://localhost:8082  (Vite with hot reload)"
    echo "  Backend: http://localhost:8080  (tsx watch with hot reload)"
    echo "  App: http://localhost:8081"
    echo "  Swagger UI: http://localhost:8080/ui"
    echo "  Signaling: ws://localhost:4444"
    echo ""
    echo "💡 Same setup for dev and production - just different domains!"
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
