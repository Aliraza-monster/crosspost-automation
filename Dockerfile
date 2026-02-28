FROM node:20-bookworm-slim

WORKDIR /app

# yt-dlp workflows need python3 + ffmpeg, and latest yt-dlp binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates \
  && python3 -m pip install --no-cache-dir --upgrade yt-dlp \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# Skip install-time python check because runtime deps are installed above.
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
ENV NODE_ENV=production

RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data/tmp /app/storage/tmp

EXPOSE 3000

CMD ["npm", "start"]
