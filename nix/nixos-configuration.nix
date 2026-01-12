{ config, pkgs, modulesPath, lib, ... }:

{
  imports = [
    (modulesPath + "/profiles/qemu-guest.nix")
    (modulesPath + "/profiles/headless.nix")
    ./disko-config.nix
  ];

  # Enable flakes
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  # Boot
  boot.loader.grub.enable = true;
  boot.loader.grub.device = "/dev/vda";

  # Networking
  networking.hostName = "seance-backend";
  networking.firewall.allowedTCPPorts = [ 22 80 443 4444 ];

  # Time
  time.timeZone = "UTC";

  # Packages
  environment.systemPackages = with pkgs; [
    git
    docker
    devenv
  ];

  # Docker
  virtualisation.docker.enable = true;

  # SSH
  services.openssh.enable = true;

  # Seance backend service
  systemd.services.seance-backend = {
    description = "Seance Backend";
    after = [ "network-online.target" "docker.service" ];
    wants = [ "network-online.target" ];
    requires = [ "docker.service" ];
    wantedBy = [ "multi-user.target" ];

    serviceConfig = {
      Type = "simple";
      Restart = "always";
      RestartSec = 10;
      WorkingDirectory = "/opt/seance-signaling";
    };

    script = ''
      if [ ! -d /opt/seance-signaling ]; then
        mkdir -p /opt
        ${pkgs.git}/bin/git clone https://github.com/xaeiou-sh/seance-signaling.git /opt/seance-signaling
      fi

      cd /opt/seance-signaling
      ${pkgs.git}/bin/git pull origin main
      ${pkgs.devenv}/bin/devenv --profile prod up
    '';
  };

  system.stateVersion = "24.05";
}
