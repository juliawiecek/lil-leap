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

    stage('Unit Tests - insights-service') {
      steps {
        sh "mvn -f ${INSIGHTS_POM} -B -ntp clean verify"
      }
    }

    stage('Publish Coverage - nextTrade-orders') {
      steps {
        archiveArtifacts(
          artifacts: 'nextTrade-orders/target/site/jacoco/**',
          fingerprint: true
        )
      }
    }

    stage('Publish Coverage - nextTrade-holdings') {
      steps {
        archiveArtifacts(
          artifacts: 'nextTrade-holdings/target/site/jacoco/**',
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


    stage('Build Compose Services') {
      steps {
        sh "${COMPOSE_CMD} -f ${COMPOSE_FILE} build"
      }
    }
  }
}
