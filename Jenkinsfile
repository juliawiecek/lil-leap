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
              if command -v docker-compose >/dev/null 2>&1; then
                echo docker-compose
              elif docker compose version >/dev/null 2>&1; then
                echo "docker compose"
              else
                echo ""
              fi
            ''',
            returnStdout: true
          ).trim()

          if (!env.COMPOSE_CMD) {
            error('Neither docker-compose nor docker compose is available on this Jenkins agent.')
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
          ${COMPOSE_CMD} -f ${COMPOSE_FILE} config
        '''
      }
    }

    stage('Unit Tests - nextTrade-orders') {
      steps {
        dir('nextTrade-orders') {
          sh 'mvn -B -ntp clean verify'
        }
      }
    }

    stage('Unit Tests - nextTrade-holdings') {
      steps {
        dir('nextTrade-holdings') {
          sh 'mvn -B -ntp clean verify'
        }
      }
    }

    stage('PostgreSQL Settlement and Holdings') {
      steps {
        dir('nextTrade-orders') {
          sh '''
            set -eu
            test_container="nexttrade-orders-tests-${BUILD_NUMBER}"
            trap 'docker rm -f "$test_container" >/dev/null 2>&1 || true' EXIT
            docker run -d --name "$test_container" \
              -e POSTGRES_USER=orders_test -e POSTGRES_PASSWORD=ci-test-only \
              -e POSTGRES_DB=orders_test -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
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
            mvn -B -ntp -Dtest=OrderLifecyclePostgresTest,InstrumentTradabilitySubmissionTest test
            mvn -B -ntp -f ../nextTrade-holdings/pom.xml \
              -Dtest=HoldingsSettlementPostgresTest \
              -Dtest.holdings.postgres.url="$TEST_POSTGRES_URL" \
              -Dtest.holdings.postgres.user=orders_test \
              -Dtest.holdings.postgres.password=ci-test-only test
          '''
        }
      }
    }

    stage('Unit Tests - insights-service') {
      steps {
        dir('insights') {
          sh 'mvn -B -ntp clean verify'
        }
      }
    }

    stage('Publish Coverage - insights') {
      steps {
        archiveArtifacts(
          artifacts: 'insights/target/site/jacoco/**',
          fingerprint: true
        )
      }
    }

    stage('Unit Tests - auth (NestJS)') {
      // The numeric Jenkins UID has no container home; use a writable npm cache.
      steps {
        sh '''
          docker run --rm \
            --user "$(id -u):$(id -g)" \
            -e npm_config_cache=/tmp/npm-cache \
            -v "$WORKSPACE/auth:/app" \
            -w /app \
            node:24-alpine \
            sh -ec 'npm ci --no-audit --no-fund
            npm run test:cov'
        '''
      }
    }

    stage('Unit Tests - frontend (Angular)') {
      steps {
        sh '''
          docker run --rm \
            --user "$(id -u):$(id -g)" \
            -e npm_config_cache=/tmp/npm-cache \
            -v "$WORKSPACE/frontend:/app" \
            -w /app \
            node:24-alpine \
            sh -ec 'npm ci --no-audit --no-fund
            npm run test:coverage
            npm run build'
        '''
      }
    }

    stage('Unit Tests - insights-frontend (Angular)') {
      steps {
        sh '''
          docker run --rm \
            --user "$(id -u):$(id -g)" \
            -e npm_config_cache=/tmp/npm-cache \
            -v "$WORKSPACE/insights-frontend:/app" \
            -w /app \
            node:24-alpine \
            sh -ec 'npm ci --no-audit --no-fund
            npm run test:coverage
            npm run build'
        '''
      }
    }

    stage('Publish Coverage - nextTrade-orders') {
      steps {
        archiveArtifacts(
          artifacts: 'nextTrade-orders/target/site/jacoco/**',
          fingerprint: true,
          allowEmptyArchive: true
        )
      }
    }

    stage('Publish Coverage - nextTrade-holdings') {
      steps {
        archiveArtifacts(
          artifacts: 'nextTrade-holdings/target/site/jacoco/**',
          fingerprint: true,
          allowEmptyArchive: true
        )
      }
    }

    stage('Publish Coverage - insights-service') {
      steps {
        archiveArtifacts(
          artifacts: 'insights/target/site/jacoco/**',
          fingerprint: true,
          allowEmptyArchive: true
        )
      }
    }


    stage('Run Python Tests With Coverage') {
      steps {
        sh '''
          docker run --rm \
            --user "$(id -u):$(id -g)" \
            -v "$WORKSPACE:$WORKSPACE" \
            -w "$WORKSPACE/data-pipeline" \
            python:3.12-slim \
            sh -ec 'python -m venv /tmp/python-venv
            /tmp/python-venv/bin/python -m pip install --no-cache-dir -r requirements-coverage.txt
            /tmp/python-venv/bin/python -m pytest -v \
            --cov=src \
            --cov-report=term-missing \
            --cov-report=html:htmlcov \
            --cov-report=xml:coverage.xml
            /tmp/python-venv/bin/python ../scripts/prepare_sonar_coverage.py'
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

    stage('Archive Node Coverage') {
      steps {
        archiveArtifacts(
          artifacts: 'auth/coverage/**,frontend/coverage/**,insights-frontend/coverage/**',
          fingerprint: true,
          allowEmptyArchive: true
        )
      }
    }


    stage('SonarQube Analysis') {
      when {
        expression {
          return (env.BRANCH_NAME ?: '') == 'main' ||
                 (env.GIT_BRANCH ?: '') == 'main' ||
                 (env.GIT_BRANCH ?: '') == 'origin/main' ||
                 (env.GIT_BRANCH ?: '') == 'refs/heads/main'
        }
      }
      steps {
        echo "Running SonarQube analysis on main branch"
        script {
          def scannerHome = tool 'SonarScanner'
          withSonarQubeEnv(installationName: 'SonarQube', credentialsId: 'sonarqube-token') {
            withEnv(["SCANNER_HOME=${scannerHome}"]) {
              sh '''
                set +x
                export SONAR_TOKEN="$SONAR_AUTH_TOKEN"
                "$SCANNER_HOME/bin/sonar-scanner" \
                  -Dsonar.projectVersion="$BUILD_NUMBER"
              '''
            }
          }
        }
      }
    }

    stage('SonarQube Quality Gate') {
      when {
        expression {
          return (env.BRANCH_NAME ?: '') == 'main' ||
                 (env.GIT_BRANCH ?: '') == 'main' ||
                 (env.GIT_BRANCH ?: '') == 'origin/main' ||
                 (env.GIT_BRANCH ?: '') == 'refs/heads/main'
        }
      }
      steps {
        echo "Waiting for SonarQube quality gate on main branch"
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Build Compose Services') {
      steps {
        sh "${COMPOSE_CMD} -f ${COMPOSE_FILE} build"
      }
    }
  }
}
