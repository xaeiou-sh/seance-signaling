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

  # Production profile
  profiles.prod.module = {
    env.CADDY_DOMAIN = "backend.seance.dev";
    env.APP_DOMAIN = "app.seance.dev";
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

  processes.update-server.exec = ''
    cd ${config.env.DEVENV_ROOT}/seance-backend-hono
    npm install
    npm run start
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

  # https://devenv.sh/basics/
  enterShell = ''
    echo "🔮 Seance Coordinator Development Environment"
    echo ""
    echo "Available commands:"
    echo "  devenv up           - Start all services (backend + signaling + caddy)"
    echo "  cleanup-docker      - Remove leftover Docker containers"
    echo ""
    echo "🌐 Local URLs:"
    echo "  Backend: http://localhost:8080"
    echo "  Swagger UI: http://localhost:8080/ui"
    echo "  Signaling: ws://localhost:4444"
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
