FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY . .

RUN python3 -m venv /app/artifacts/api-server/python-env \
  && /app/artifacts/api-server/python-env/bin/pip install --no-cache-dir --upgrade pip \
  && /app/artifacts/api-server/python-env/bin/pip install --no-cache-dir pymupdf4llm

RUN pnpm install --frozen-lockfile
RUN pnpm build

WORKDIR /app/artifacts/api-server

ENV NODE_ENV=production
ENV PYTHON_BIN=/app/artifacts/api-server/python-env/bin/python3
ENV PDF_SCRIPT_PATH=/app/artifacts/api-server/scripts/pdf_to_markdown.py

EXPOSE 8085

CMD ["pnpm", "start"]
