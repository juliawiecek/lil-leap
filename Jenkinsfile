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

    stage('Backend Tests') {
      steps {
        sh 'sh ci/run-checks.sh backend'
      }
      post {
        always {
          junit testResults: 'backend/target/surefire-reports/TEST-*.xml', allowEmptyResults: true
        }
      }
    }

    stage('Frontend Tests and Build') {
      steps {
        sh 'sh ci/run-checks.sh frontend'
      }
      post {
        always {
          junit testResults: 'frontend/test-results/*.xml', allowEmptyResults: true
        }
      }
    }

    stage('Build Backend Image') {
      steps {
        sh '''
          docker build --tag "sprint1-greeter-app:ci-${BUILD_NUMBER}-${GIT_COMMIT}" backend/
        '''
      }
    }
  }

  // Test containers clean up individually. No deployment stack or data volumes are touched.
}
