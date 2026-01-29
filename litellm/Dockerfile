# LiteLLM with custom configuration
FROM ghcr.io/berriai/litellm:main-latest

# Copy config file
COPY litellm-config.yaml /app/config.yaml

# Expose port (Railway will set via PORT env var)
EXPOSE 4000

# Run LiteLLM with config
CMD ["litellm", "--config", "/app/config.yaml", "--port", "4000", "--detailed_debug"]
