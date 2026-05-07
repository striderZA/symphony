FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl ca-certificates git openssh-client unzip \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install opencode CLI
RUN bun install -g opencode-ai

WORKDIR /app

# Install TypeScript dependencies first (leverages Docker layer cache)
COPY typescript/package.json typescript/bun.lock ./
RUN bun install

# Copy source and config
COPY typescript/src ./src
COPY typescript/tsconfig.json ./
COPY typescript/WORKFLOW.md ./

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4096

ENTRYPOINT ["/entrypoint.sh"]
