#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: ./deploy.sh <dockerhub_username> [tag] [vite_api_url]"
  echo "Example: ./deploy.sh myuser v1.0.0 https://api.example.com/api"
  exit 1
fi

DOCKERHUB_USERNAME="$1"
TAG="${2:-latest}"
VITE_API_URL="${3:-/api}"
PROJECT_SLUG="${PROJECT_SLUG:-gde-mit-alset-iedu-simulation}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-}"

SERVER_REPO="${DOCKERHUB_USERNAME}/${PROJECT_SLUG}-server"
CLIENT_REPO="${DOCKERHUB_USERNAME}/${PROJECT_SLUG}-client"
SERVER_IMAGE="${SERVER_REPO}:${TAG}"
CLIENT_IMAGE="${CLIENT_REPO}:${TAG}"

BUILD_FLAGS=()
if [[ -n "${DOCKER_PLATFORM}" ]]; then
  BUILD_FLAGS+=(--platform "${DOCKER_PLATFORM}")
fi

echo "Building server image: ${SERVER_IMAGE}"
docker build "${BUILD_FLAGS[@]}" \
  -t "${SERVER_IMAGE}" \
  "${ROOT_DIR}/server"

echo "Building client image: ${CLIENT_IMAGE} (VITE_API_URL=${VITE_API_URL})"
docker build "${BUILD_FLAGS[@]}" \
  --build-arg "VITE_API_URL=${VITE_API_URL}" \
  -t "${CLIENT_IMAGE}" \
  "${ROOT_DIR}/client"

echo "Pushing ${SERVER_IMAGE}"
docker push "${SERVER_IMAGE}"

echo "Pushing ${CLIENT_IMAGE}"
docker push "${CLIENT_IMAGE}"

if [[ "${TAG}" != "latest" ]]; then
  echo "Tagging and pushing latest aliases"
  docker tag "${SERVER_IMAGE}" "${SERVER_REPO}:latest"
  docker tag "${CLIENT_IMAGE}" "${CLIENT_REPO}:latest"
  docker push "${SERVER_REPO}:latest"
  docker push "${CLIENT_REPO}:latest"
fi

echo "Done."
echo "Server image: ${SERVER_IMAGE}"
echo "Client image: ${CLIENT_IMAGE}"
