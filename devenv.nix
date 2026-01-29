{
  pkgs,
  lib,
  config,
  inputs,
  ...
}: {
  dotenv.enable = true;

  # Packages needed for Kubernetes development
  packages = with pkgs; [
    git
    nodejs_22
    # Kubernetes tooling
    kind
    kubectl
    tilt
    cdk8s-cli
    doctl
    # railway
    # Infrastructure as code
    opentofu
    ansible
    # utilities
    sops
  ];

  # Kubernetes development scripts
  scripts.k8s-setup.exec = ''
    echo "☸️  Setting up Kubernetes local development environment..."
    echo ""
    cd ${config.git.root}/kubernetes && ./setup.sh
  '';

  scripts.k8s-dev.exec = ''
    echo "☸️  Starting Kubernetes development with Tilt..."
    echo ""
    cd ${config.git.root}/kubernetes && ./dev.sh
  '';

  scripts.k8s-deploy.exec = ''
    echo "☸️  Deploying to production Kubernetes cluster..."
    echo ""
    cd ${config.git.root} && ./scripts/deploy-production.sh
  '';
  scripts.railway-deploy.exec = ''
    echo "  Deploying to production Railway cluster..."
    echo ""
    cd ${config.git.root} && ./scripts/deploy-railway.sh
  '';

  scripts.k8s-clean.exec = ''
    echo "☸️  Deleting local Kubernetes cluster..."
    echo ""
    kind delete cluster --name seance-local
  '';

  # Shell greeting
  enterShell = ''
    echo "🔮 Seance Development Environment"
    echo ""
    echo "☸️  Kubernetes Commands:"
    echo "  k8s-setup   - One-time setup (create kind cluster + install ingress)"
    echo "  k8s-dev     - Start local development (Tilt with hot reload)"
    echo "  k8s-deploy  - Deploy to production"
    echo "  k8s-clean   - Delete local kind cluster"
    echo ""
    echo "🌐 Development URLs (after k8s-dev):"
    echo "  Marketing:  https://dev.localhost"
    echo "  Backend:    https://backend.dev.localhost"
    echo "  App:        https://app.dev.localhost"
    echo "  Tilt UI:    http://localhost:10350"
    echo ""
    echo "📝 Note: Accept self-signed certificate warnings in browser"
    echo ""
    echo "🚀 Quick start: k8s-setup (once), then k8s-dev"
  '';

  # Test configuration
  enterTest = ''
    echo "Running tests"
    git --version | grep --color=auto "${pkgs.git.version}"
  '';
}
