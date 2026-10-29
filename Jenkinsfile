// Build the Spring Boot (Java 25) + Three.js portfolio into a Docker image and deploy it on this
// VPS as container "www" (port 80 inside), with its files in ~/www.
// Nginx Proxy Manager serves it at https://www.nexigent-labs.co.zw → http://www:80.
pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        APP_NAME   = 'www'
        IMAGE_REPO = 'sinyoro-portfolio'
        IMAGE      = "sinyoro-portfolio:${env.BUILD_NUMBER}"
        DEPLOY_DIR = '/home/sinyoro92/www'     // the "www" folder on the VPS host
        // Leave empty to auto-detect Nginx Proxy Manager's network.
        PROXY_NET  = ''
        // Set to '80' ONLY if nothing else (e.g. Nginx Proxy Manager) is using host port 80.
        HOST_PORT  = ''
    }

    stages {
        stage('Checkout') {
            steps { checkout scm }
        }

        stage('Build image') {
            steps {
                sh 'docker build --pull -t "$IMAGE" -t "$IMAGE_REPO:latest" .'
            }
        }

        stage('Prepare ~/www') {
            steps {
                // Paths in -v are resolved on the VPS host (Docker daemon), so this works from the Jenkins container.
                sh '''
                  docker run --rm -v "$DEPLOY_DIR":/www alpine:3.20 sh -c 'mkdir -p /www/data && chmod 0777 /www/data'
                  cat docker-compose.yml | docker run --rm -i -v "$DEPLOY_DIR":/www alpine:3.20 sh -c 'cat > /www/docker-compose.yml'
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                  NET="$PROXY_NET"
                  if [ -z "$NET" ]; then
                    NPM=$(docker ps --format '{{.Names}}' | grep -iE 'nginx-proxy-manager|npm' | head -n1 || true)
                    if [ -n "$NPM" ]; then
                      NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$NPM" | awk '{print $1}')
                    fi
                  fi
                  echo "Proxy network: ${NET:-<none>}"

                  docker rm -f "$APP_NAME" 2>/dev/null || true

                  PUBLISH=""
                  [ -n "$HOST_PORT" ] && PUBLISH="-p $HOST_PORT:80"

                  docker run -d --name "$APP_NAME" \
                    --restart unless-stopped \
                    --sysctl net.ipv4.ip_unprivileged_port_start=0 \
                    $PUBLISH \
                    -e PORT=80 -e TZ=Africa/Harare -e CONTACT_STORE_DIR=/app/data \
                    -v "$DEPLOY_DIR/data":/app/data \
                    "$IMAGE"

                  if [ -n "$NET" ]; then
                    docker network connect --alias www "$NET" "$APP_NAME" || true
                  fi
                '''
            }
        }

        stage('Health check') {
            steps {
                sh '''
                  for i in $(seq 1 30); do
                    STATUS=$(docker inspect -f '{{.State.Health.Status}}' "$APP_NAME" 2>/dev/null || echo missing)
                    echo "health: $STATUS"
                    [ "$STATUS" = "healthy" ] && exit 0
                    [ "$STATUS" = "unhealthy" ] && break
                    sleep 5
                  done
                  docker logs --tail 100 "$APP_NAME"
                  exit 1
                '''
            }
        }
    }

    post {
        success {
            sh '''
              docker images "$IMAGE_REPO" --format '{{.Tag}}' | grep -E '^[0-9]+$' | sort -rn | tail -n +4 \
                | xargs -r -I{} docker rmi "$IMAGE_REPO:{}" || true
            '''
        }
    }
}
