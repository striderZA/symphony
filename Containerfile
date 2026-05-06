FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl ca-certificates git openssh-client unzip nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install opencode via bun (npm equivalent)
RUN bun install -g opencode-ai

WORKDIR /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4096

ENTRYPOINT ["/entrypoint.sh"]
