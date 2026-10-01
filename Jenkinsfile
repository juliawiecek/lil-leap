pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  tools {
    maven 'maven'
    jdk 'JDK21'
  }

  environment {
    COMPOSE_FILE = 'docker-compose.yml'
    NEXTTRADE_POM = 'nextTrade-orders/pom.xml'
    INSIGHTS_POM = 'insights/pom.xml'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Detect Compose Command') {
      steps {
        script {
          env.COMPOSE_CMD = sh(
            script: '''
              if docker compose version >/dev/null 2>&1; then
                echo "docker compose"
              else
                echo ""
              fi
            ''',
            returnStdout: true
          ).trim()

          if (!env.COMPOSE_CMD) {
            error('Docker Compose v2 is required on this Jenkins agent.')
          }

          echo "Using compose command: ${env.COMPOSE_CMD}"
        }
      }
    }

    stage('Validate Compose YAML') {
      // These synthetic values are used only to validate the deployment model.
      // Tests and image builds do not inherit them; production secrets are never needed.
      environment {
        TLS_KEYSTORE_PASSWORD = 'ci-validation-only-not-for-runtime'
        TLS_KEYSTORE_PATH = '/dev/null'
        AUTH_SERVICE_TLS_KEYSTORE_PATH = '/dev/null'
        APP_JWT_SECRET = 'ci-validation-only-not-for-runtime-32-bytes-min'
      }
      steps {
        sh '''
          ${COMPOSE_CMD} -f ${COMPOSE_FILE} config -q
          ${COMPOSE_CMD} -f ${COMPOSE_FILE} -f docker-compose.kafka.yml config -q
          bash scripts/test_reporting_replica.sh
        '''
      }
    }

    stage('PostgreSQL Settlement and Holdings') {
      steps {
        dir('nextTrade-orders') {
          sh '''
            set -eu
            # Branch and PR jobs can share BUILD_NUMBER and run concurrently.
            # Let Docker allocate an identity; clean up only this build's container.
            test_container=
            trap '[ -z "$test_container" ] || docker rm -f "$test_container" >/dev/null 2>&1 || true' EXIT
            test_container=$(docker run -d \
              -e POSTGRES_USER=orders_test -e POSTGRES_PASSWORD=ci-test-only \
              -e POSTGRES_DB=orders_test -p 127.0.0.1::5432 postgres:16-alpine)
            ready=false
            for attempt in $(seq 1 30); do
              if docker exec "$test_container" pg_isready -h 127.0.0.1 -U orders_test >/dev/null 2>&1; then
                ready=true
                break
              fi
              sleep 1
            done
            [ "$ready" = true ]
            test_port=$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$test_container")
            export TEST_POSTGRES_URL="jdbc:postgresql://127.0.0.1:${test_port}/orders_test"
            export TEST_POSTGRES_USER=orders_test TEST_POSTGRES_PASSWORD=ci-test-only
            mvn -B -ntp clean verify
            mvn -B -ntp -f ../nextTrade-holdings/pom.xml \
                            -Dtest.holdings.postgres.url="$TEST_POSTGRES_URL" \
              -Dtest.holdings.postgres.user=orders_test \
              -Dtest.holdings.postgres.password=ci-test-only clean verify
          '''
        }
      }
    }

    stage('Unit Tests - insights-service') {
      steps {
        sh "mvn -f ${INSIGHTS_POM} -B -ntp clean verify"
      }
    }

    stage('Publish Coverage - nextTrade-orders') {
      steps {
        archiveArtifacts(
          artifacts: 'nextTrade-orders/target/site/jacoco/**',
          fingerprint: true,
          allowEmptyArchive: false
        )
      }
    }

    stage('Publish Coverage - nextTrade-holdings') {
      steps {
        archiveArtifacts(
          artifacts: 'nextTrade-holdings/target/site/jacoco/**',
          fingerprint: true,
          allowEmptyArchive: false
        )
      }
    }


    stage('Run Python Tests With Coverage') {
      steps {
        sh '''
          docker run --rm \
            --user "$(id -u):$(id -g)" \
            -v "$WORKSPACE/data-pipeline:/app" \
            -w /app \
            python:3.12-slim \
            sh -ec 'python -m venv /tmp/python-venv
            /tmp/python-venv/bin/python -m pip install --no-cache-dir -r requirements-coverage.txt
            /tmp/python-venv/bin/python -m pytest -v \
            --cov=src \
            --cov-report=term-missing \
            --cov-report=html:htmlcov \
            --cov-report=xml:coverage.xml --cov-fail-under=60 --junitxml=test-results.xml'
            '''
          }
        }

    stage('Archive Python Coverage') {
      steps {
        archiveArtifacts(
          artifacts: 'data-pipeline/htmlcov/**,data-pipeline/coverage.xml',
          fingerprint: true
        )
      }
    }


    stage('Angular and Identity Tests / Builds / Audits') {
      steps {
        sh '''
          set -eu
          for component in frontend insights-frontend auth; do
            docker run --rm --user "$(id -u):$(id -g)" \
              -e npm_config_cache=/tmp/npm-cache \
              -v "$WORKSPACE/$component:/app" -w /app node:24-bookworm \
              sh -ec 'npm ci
                if [ -f .c8rc.json ]; then npm run test:coverage; else npm run test:cov -- --runInBand; fi
                npm run build
                npm audit --audit-level=low'
          done
        '''
      }
    }

    stage('Strict Documentation and Coverage') {
      steps {
        sh '''
          python3 scripts/generate_javadocs.py
          python3 scripts/check_coverage.py
        '''
        archiveArtifacts artifacts: 'docs/javadoc/**,insights/target/site/jacoco/**,frontend/coverage/**,insights-frontend/coverage/**,auth/coverage/**', fingerprint: true
      }
    }

    stage('Build Compose Services') {
      steps {
        sh "${COMPOSE_CMD} -f ${COMPOSE_FILE} build"
      }
    }
    stage('Live Cross-Service Integration') {
      steps {
        sh '''
          set -eu
          export COMPOSE_PROJECT_NAME="po-$(printf '%s' "$BUILD_TAG" | tr '[:upper:]_' '[:lower:]-')"
          trap 'docker compose down --remove-orphans' EXIT
          bash scripts/auth-integration-test.sh --no-build
          docker compose ps
          docker ps
        '''
      }
    }
  }
  post {
    always {
      junit testResults: '**/target/surefire-reports/TEST-*.xml,data-pipeline/test-results.xml', allowEmptyResults: false
    }
  }
}
