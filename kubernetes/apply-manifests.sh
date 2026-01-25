#!/usr/bin/env bash
# Shared deployment script for applying cdk8s-generated manifests
# Used by both dev.sh (local) and main.tf (production) to ensure consistency
#
# Usage: ./apply-manifests.sh [--wait-timeout SECONDS]

set -euo pipefail

WAIT_TIMEOUT="${WAIT_TIMEOUT:-120}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --wait-timeout)
      WAIT_TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📦 Applying Kubernetes manifests..."
echo ""

# Apply cert-manager (CRDs + controllers)
echo "→ Applying cert-manager..."

# Jobs are immutable - delete existing startupapicheck job before applying
# This job is a one-time startup check, safe to recreate
kubectl delete job cert-manager-startupapicheck -n cert-manager \
  --ignore-not-found=true 2>/dev/null || true

kubectl apply -f "$SCRIPT_DIR/cdk8s/dist/cert-manager.k8s.yaml"

# Wait for cert-manager deployment to be available (not just pods ready)
echo "→ Waiting for cert-manager deployments..."
kubectl wait --namespace cert-manager \
  --for=condition=available \
  --timeout="${WAIT_TIMEOUT}s" \
  deployment/cert-manager \
  deployment/cert-manager-webhook \
  deployment/cert-manager-cainjector \
  2>/dev/null || echo "⚠️  Deployments not all available, continuing..."

# Wait for cert-manager webhook to be ready
echo "→ Waiting for cert-manager webhook (timeout: ${WAIT_TIMEOUT}s)..."
if ! kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/name=webhook \
  --timeout="${WAIT_TIMEOUT}s" 2>/dev/null; then
  echo "⚠️  Webhook not ready within timeout, but continuing..."
fi

# Additional wait for webhook to be fully functional (not just ready)
echo "→ Verifying webhook is responsive..."
for i in {1..10}; do
  if kubectl get validatingwebhookconfigurations.admissionregistration.k8s.io cert-manager-webhook &>/dev/null; then
    sleep 2  # Give it a moment to be truly ready
    break
  fi
  sleep 1
done

# Wait for nginx ingress admission webhook
echo "→ Waiting for nginx ingress webhook (timeout: ${WAIT_TIMEOUT}s)..."
if ! kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout="${WAIT_TIMEOUT}s" 2>/dev/null; then
  echo "⚠️  Ingress webhook not ready within timeout, but continuing..."
fi

# Apply seance resources with retry on webhook timeout
echo "→ Applying seance resources..."
MAX_RETRIES=3
for i in $(seq 1 $MAX_RETRIES); do
  if kubectl apply -f "$SCRIPT_DIR/cdk8s/dist/seance.k8s.yaml" 2>&1 | tee /tmp/apply-error.log; then
    break
  elif grep -q "context deadline exceeded\|Client.Timeout exceeded" /tmp/apply-error.log; then
    if [ $i -lt $MAX_RETRIES ]; then
      echo "⚠️  Webhook timeout (attempt $i/$MAX_RETRIES), retrying in 5s..."
      sleep 5
    else
      echo "❌ Failed after $MAX_RETRIES attempts"
      exit 1
    fi
  else
    echo "❌ Apply failed with non-timeout error"
    cat /tmp/apply-error.log
    exit 1
  fi
done
rm -f /tmp/apply-error.log

echo ""
echo "✅ Manifests applied successfully"
