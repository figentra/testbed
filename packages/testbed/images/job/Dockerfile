# Stackra file contract:
# Purpose: the testbed job image: Ubuntu 24.04 with mise and the repository's pins (Node, pnpm, the Infisical CLI,
#          shfmt and the Encore CLI), Playwright's Chromium, Firefox and WebKit with their system libraries, a virtual
#          display and Electron's libraries for desktop tests, and ffmpeg. Every test job runs in a
#          fresh container of it as `ubuntu` (uid 1000, the host user, so a bind-mounted workspace needs no chown).
# Boundary: build recipe only. The EC2 Image Builder component `testbed-images` builds it on the box AMI from this
#           file alone (no build context), passing the ARGs from `TOOLCHAIN_PINS`; a test keeps the defaults below equal
#           to that constant. It holds no secret: Infisical tokens arrive at run time by environment. Agents never build
#           it on the Mac; CI and the image pipeline do.
# Runtime: container (linux/amd64)
# Governing contract: ADR 0484 (decision 2); ADR 0019 (exact pins); ADR 0174 (supply chain); ADR 0173.
# The base is pinned by its multi-arch index digest (read from Docker Hub 2026-11-04); the tag is for readers only.
FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852

ARG MISE_VERSION=v2026.10.0
ARG NODE_VERSION=24.22.0
ARG PNPM_VERSION=12.16.1
ARG INFISICAL_VERSION=0.44.2
ARG SHFMT_VERSION=3.14.1
ARG ENCORE_VERSION=1.58.8
ARG PLAYWRIGHT_VERSION=1.64.1

ENV DEBIAN_FRONTEND=noninteractive \
    MISE_DATA_DIR=/opt/mise \
    MISE_GLOBAL_CONFIG_FILE=/opt/mise/config.toml \
    MISE_YES=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PATH=/opt/mise/shims:/usr/local/bin:/usr/bin:/bin

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl docker.io git jq openssh-client python3 rsync unzip xz-utils zip \
      ffmpeg xauth xvfb \
      libasound2t64 libatspi2.0-0t64 libgtk-3-0t64 libnotify4 libnss3 libsecret-1-0 libxss1 libxtst6 xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# mise with the repository's pins: the same Node, pnpm, Infisical CLI and shfmt as mise.toml, and the Encore CLI the
# products pin, for `encore test` (the boxes are not logged in to Encore: the agent blanks the app id).
RUN curl -fsSL https://mise.run | MISE_VERSION="${MISE_VERSION}" MISE_INSTALL_PATH=/usr/local/bin/mise sh \
 && mise use --global "node@${NODE_VERSION}" "pnpm@${PNPM_VERSION}" "github:Infisical/cli@${INFISICAL_VERSION}" \
      "shfmt@${SHFMT_VERSION}" "aqua:encoredev/encore@${ENCORE_VERSION}" \
 && mise reshim

# Playwright's three browsers and their system libraries, at the catalogue's version. Above them: a virtual display
# (`xvfb-run`) and Electron's runtime libraries for desktop end-to-end tests, and ffmpeg for video renders.
RUN npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium firefox webkit \
 && chmod -R a+rX /ms-playwright /opt/mise \
 && rm -rf /var/lib/apt/lists/*

USER ubuntu
ENV HOME=/home/ubuntu
WORKDIR /work
