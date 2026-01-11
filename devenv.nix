{
  pkgs,
  lib,
  config,
  inputs,
  ...
}: {
  # https://devenv.sh/basics/
  env.GREET = "devenv";

  # https://devenv.sh/packages/
  packages = with pkgs; [
    git
    cloudflared
    fermyon-spin
    coturn
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

  processes.cloudflare-tunnel.exec = ''
    cd ${config.env.DEVENV_ROOT}
    ${lib.getExe pkgs.cloudflared} tunnel --config ./cloudflared/config.yml run
  '';

  processes.update-server.exec = ''
    cd ${config.env.DEVENV_ROOT}/seance-backend-spin
    ${lib.getExe pkgs.fermyon-spin} up --listen 127.0.0.1:3000
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
    echo "  devenv up           - Start all services (signaling + tunnel)"
    echo "  cleanup-docker      - Remove leftover Docker containers"
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
