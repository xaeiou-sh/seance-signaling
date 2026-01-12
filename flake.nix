{
  description = "Seance backend NixOS configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    disko.url = "github:nix-community/disko";
    disko.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, disko }: {
    nixosConfigurations.seance-backend = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        disko.nixosModules.disko
        ./nix/nixos-configuration.nix
        # SSH key will be managed by nixos-anywhere
        ({ config, pkgs, ... }: {
          users.users.root.openssh.authorizedKeys.keyFiles = [
            # nixos-anywhere handles this automatically
          ];
        })
      ];
    };
  };
}
