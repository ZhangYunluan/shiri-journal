FROM node:24-bookworm-slim
WORKDIR /app
COPY store.mjs server.mjs ./
ENV NODE_ENV=production PORT=4190 HOST=0.0.0.0 SHIRI_DATA_DIR=/data
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4190
CMD ["node", "server.mjs"]
