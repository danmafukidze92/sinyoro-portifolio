# ---------- build: Maven builds the Three.js front end (via frontend-maven-plugin) and the Spring Boot jar
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace

# Cache Maven + npm dependencies between builds
COPY pom.xml .
COPY frontend/package.json frontend/package-lock.json frontend/
RUN mvn -B -q dependency:go-offline -Dskip.frontend=true || true

COPY . .
RUN mvn -B -DskipTests package

# ---------- runtime
FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/data && chown -R app:app /app
COPY --from=build /workspace/target/sinyoro-portfolio.jar /app/app.jar
USER app

ENV PORT=80 \
    CONTACT_STORE_DIR=/app/data \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC"
EXPOSE 80
VOLUME ["/app/data"]

HEALTHCHECK --interval=20s --timeout=4s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/actuator/health | grep -q UP || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
