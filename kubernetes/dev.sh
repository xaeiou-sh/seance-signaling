#!/usr/bin/env bash
# Development script for Seance Kubernetes
# Synthesizes manifests, applies them, then starts Tilt for live updates

set -e

echo "🔮 Starting Seance Kubernetes Development"
echo ""

# Verify cluster exists
if ! kubectl cluster-info &>/dev/null; then
  echo "❌ Kubernetes cluster not accessible"
  echo "Run: k8s-setup"
  exit 1
fi

# Synthesize cdk8s manifests for dev environment
echo "📝 Synthesizing Kubernetes manifests (dev environment)..."
cd cdk8s
SEANCE_ENV=dev npm run synth
cd ..

# Apply manifests using shared script (same logic as production)
./apply-manifests.sh

# Verify ingress created
echo "⏳ Verifying ingress resources..."
until kubectl get ingress seance-ingress -n seance &>/dev/null; do
  echo "  Waiting for ingress creation..."
  sleep 2
done
echo "✓ Ingress resources ready"

# Start Tilt for live code updates
echo ""
echo "🚀 Starting Tilt for live code updates..."
echo ""
tilt up
