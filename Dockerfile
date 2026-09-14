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

# Build the application
RUN npm run build

# Create data directory
RUN mkdir -p data

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Correr como usuario no-root -- la imagen node:*-slim ya trae un usuario
# "node" (uid 1000) predefinido, lo reusamos en vez de crear uno nuevo.
# Todo lo anterior (npm ci, npm run build) corre como root -- solo el
# proceso final que queda expuesto necesita ser no-root.
RUN chown -R node:node /app
USER node

# Healthcheck (Railway/docker-compose lo pueden usar para reiniciar el
# contenedor si deja de responder). Usa fetch nativo de Node en vez de
# curl/wget porque la imagen slim no los trae instalados -- evita agregar
# un paquete de apt solo para esto.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
