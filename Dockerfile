FROM node:24-alpine

WORKDIR /app

# Backend-Abhängigkeiten kopieren und installieren
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --no-audit --no-fund

# Frontend-Abhängigkeiten kopieren und installieren
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --no-audit --no-fund

# Gesamten Code kopieren
COPY . .

# Backend und Frontend bauen
RUN cd backend && npm run build
RUN cd frontend && npm run build

EXPOSE 3001

# Ins Backend-Verzeichnis wechseln und den offiziellen Startbefehl nutzen
WORKDIR /app/backend
CMD ["npm", "start"]
