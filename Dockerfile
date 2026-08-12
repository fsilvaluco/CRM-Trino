FROM node:22-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Declare build-time vars so Railway/Docker passes them during npm run build
# (NEXT_PUBLIC_* vars get inlined into the client bundle at build time)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# Diagnostico temporal -- confirmar en el log de "docker build" (no el de
# Next.js) si el build-arg realmente llego. Sacar una vez resuelto. Usa solo
# utilidades POSIX (el shell default de node:22-slim es dash, no bash --
# ${#VAR} y ${VAR:0:10} son sintaxis de bash, no funcionan aca).
RUN echo "[docker-debug] largo=$(printf %s "$NEXT_PUBLIC_VAPID_PUBLIC_KEY" | wc -c) primeros10=$(printf %s "$NEXT_PUBLIC_VAPID_PUBLIC_KEY" | cut -c1-10)"

# Build the application
RUN npm run build

# Create data directory
RUN mkdir -p data

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

CMD ["npm", "start"]
