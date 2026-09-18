pipeline {
  agent any

  options {
    timestamps()
    skipDefaultCheckout(true)
    disableConcurrentBuilds()
    timeout(time: 45, unit: 'MINUTES')
  }

  tools {
    nodejs 'NodeJS'
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
      }
      steps {
        sh '''
          ${COMPOSE_CMD} -f docker-compose.yml config -q
        '''
      }
    }

    // Run all backend JUnit tests before building Docker images.
    stage('Run Backend Tests') {
      steps {
        sh '''
          docker run --rm \
            -v "$WORKSPACE/backend:/app" \
            -w /app \
            maven:3.9-eclipse-temurin-21 \
            mvn -B clean verify
        '''
      }
    }

    stage('Publish Backend Coverage') {
      steps {
        archiveArtifacts(
          artifacts: 'backend/target/site/jacoco/**',
          fingerprint: true
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
            --cov-report=xml:coverage.xml'
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

    stage('Build Backend Image') {
      steps {
        sh 'docker build --tag "nexttrade:ci-${BUILD_NUMBER}-${GIT_COMMIT}" backend/'
      }
    }

    stage('Build Compose Services') {
      environment {
        TLS_KEYSTORE_PASSWORD = 'ci-build-only-not-for-runtime'
        TLS_KEYSTORE_PATH = '/dev/null'
      }
      steps {
        sh '${COMPOSE_CMD} -f docker-compose.yml build'
      }
    }
  }

  post {
    always {
      sh '''
        export TLS_KEYSTORE_PASSWORD="ci-cleanup-only-not-for-runtime"
        export TLS_KEYSTORE_PATH="/dev/null"
        if [ -n "${COMPOSE_CMD}" ]; then
          ${COMPOSE_CMD} -f docker-compose.yml down -v || true
        fi
      '''
    }
  }
}
