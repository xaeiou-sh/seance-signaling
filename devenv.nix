{ pkgs, lib, config, inputs, ... }:

{
  # https://devenv.sh/basics/
  env.GREET = "devenv";

  # https://devenv.sh/packages/
  packages = [
    pkgs.git
    pkgs.docker-compose
    pkgs.cloudflared
  ];

  # https://devenv.sh/languages/
  # languages.rust.enable = true;

  # https://devenv.sh/processes/
  # processes.dev.exec = "${lib.getExe pkgs.watchexec} -n -- ls -la";

  # https://devenv.sh/services/
  # services.postgres.enable = true;

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  scripts.signaling-start.exec = ''
    echo "Starting y-webrtc signaling server and Cloudflare Tunnel..."
    docker compose up -d
    echo "Services started! Check logs with: docker compose logs -f"
  '';

  scripts.signaling-stop.exec = ''
    echo "Stopping services..."
    docker compose down
  '';

  scripts.signaling-logs.exec = ''
    docker compose logs -f
  '';

  scripts.signaling-status.exec = ''
    docker compose ps
  '';

  # https://devenv.sh/basics/
  enterShell = ''
    echo "🔮 Seance Coordinator Development Environment"
    echo ""
    echo "Available commands:"
    echo "  signaling-start   - Start signaling server and tunnel"
    echo "  signaling-stop    - Stop all services"
    echo "  signaling-logs    - View service logs"
    echo "  signaling-status  - Check service status"
    echo ""
    echo "📖 See SETUP.md for Cloudflare Tunnel configuration"
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
