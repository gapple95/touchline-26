#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_URI="${1:?Image URI is required}"
AWS_REGION="${2:?AWS region is required}"
GEMINI_PARAMETER_NAME="${3:-/touchline-26/prod/gemini-api-key}"
GEMINI_MODEL_VALUE="${4:-gemini-3.5-flash-lite}"
APP_DIR="/opt/touchline-26"
REGISTRY="${IMAGE_URI%%/*}"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

GEMINI_API_KEY_VALUE=""
if aws ssm get-parameter \
  --region "$AWS_REGION" \
  --name "$GEMINI_PARAMETER_NAME" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text > /tmp/touchline-gemini-key 2>/dev/null; then
  GEMINI_API_KEY_VALUE="$(cat /tmp/touchline-gemini-key)"
fi
rm -f /tmp/touchline-gemini-key

cd "$APP_DIR"
export APP_IMAGE="$IMAGE_URI"
export GEMINI_API_KEY="$GEMINI_API_KEY_VALUE"
export GEMINI_MODEL="$GEMINI_MODEL_VALUE"
export COMPOSE_PROJECT_NAME="touchline26"

docker compose -f compose.aws.yml pull
docker compose -f compose.aws.yml up -d --remove-orphans --wait
docker image prune -f --filter 'until=168h'

curl --fail --silent --show-error --max-time 10 http://127.0.0.1/healthz >/dev/null
docker compose -f compose.aws.yml ps
