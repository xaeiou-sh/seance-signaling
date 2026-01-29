# Beholder - PostHog Reverse Proxy
# Proxies /beholder/* requests to PostHog to bypass ad blockers

FROM nginx:alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Expose port (Railway will override via PORT env var if needed)
EXPOSE 80

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
