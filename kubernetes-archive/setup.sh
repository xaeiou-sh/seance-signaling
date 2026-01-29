#!/usr/bin/env bash
# Setup script for Seance Kubernetes local development

set -e  # Exit on error

echo "🔮 Setting up Seance Kubernetes Development Environment"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

command -v kind >/dev/null 2>&1 || {
  echo "❌ kind is not installed. Install with: brew install kind"
  exit 1
}
echo "✓ kind found"

command -v kubectl >/dev/null 2>&1 || {
  echo "❌ kubectl is not installed. Install with: brew install kubectl"
  exit 1
}
echo "✓ kubectl found"

command -v tilt >/dev/null 2>&1 || {
  echo "❌ tilt is not installed. Install with: brew install tilt"
  exit 1
}
echo "✓ tilt found"

command -v docker >/dev/null 2>&1 || {
  echo "❌ Docker is not running. Please start Docker Desktop."
  exit 1
}
echo "✓ docker found"

echo ""
echo "🏗️  Creating kind cluster 'seance-local'..."
if kind get clusters | grep -q "seance-local"; then
  echo "⚠️  Cluster 'seance-local' already exists. Delete it? (y/n)"
  read -r response
  if [[ "$response" == "y" ]]; then
    kind delete cluster --name seance-local
  else
    echo "Using existing cluster."
  fi
fi

if ! kind get clusters | grep -q "seance-local"; then
  kind create cluster --config kind-config.yaml
  echo "✓ Cluster created"
fi

echo ""
echo "📦 Installing nginx ingress controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

echo "⏳ Waiting for ingress controller to be ready (this takes ~60 seconds)..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s || {
  echo "⚠️  Timeout waiting for ingress controller. It might still be starting."
  echo "Check with: kubectl get pods -n ingress-nginx"
}
echo "✓ Ingress controller ready"

echo ""
echo "📦 Installing cdk8s dependencies..."
cd cdk8s
if [ ! -d "node_modules" ]; then
  npm install
else
  echo "✓ Dependencies already installed"
fi

echo ""
echo "📥 Importing cert-manager Helm chart..."
if [ ! -d "imports" ]; then
  npx cdk8s import helm:https://charts.jetstack.io/cert-manager@v1.16.2
  echo "✓ cert-manager imported"
else
  echo "✓ cert-manager already imported"
fi

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 Next steps:"
echo "  1. Start development: k8s-dev"
echo "     (manifests will be synthesized and applied automatically)"
echo "  2. Open Tilt UI: http://localhost:10350"
echo "  3. Access services (HTTPS with self-signed certs):"
echo "     - Marketing: https://dev.localhost"
echo "     - Backend: https://backend.dev.localhost"
echo "     - App: https://app.dev.localhost"
echo ""
echo "⚠️  Browser warnings: You'll see SSL warnings because certs are self-signed."
echo "    Click 'Advanced' → 'Proceed to localhost' to bypass."
echo ""
echo "📜 TLS managed by cert-manager (deployed via cdk8s Helm integration)"
echo ""
echo "📚 See README.md for more details"
