FROM ghcr.io/berriai/litellm:main-latest

# Copy custom configuration
COPY litellm-config.yaml /app/config.yaml

# Expose port
EXPOSE 4000

# Run LiteLLM with custom config
CMD ["litellm", "--config", "/app/config.yaml", "--port", "4000", "--detailed_debug"]
