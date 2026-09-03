pipeline {
  agent any

  options {
    timestamps()
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
      steps {
        sh '''
          ${COMPOSE_CMD} -f docker-compose.yml config -q
          ${COMPOSE_CMD} -f docker-compose.yml config
        '''
      }
    }

    stage('Build Multi-Stage Image') {
      steps {
        sh 'docker build -t sprint1-greeter-app:jenkins-multistage backend/'
      }
    }

    stage('Build Compose Services') {
      steps {
        sh '${COMPOSE_CMD} -f docker-compose.yml build'
      }
    }
  }

  post {
    always {
      sh '''
        if [ -n "${COMPOSE_CMD}" ]; then
          ${COMPOSE_CMD} -f docker-compose.yml down -v || true
        fi
      '''
    }
  }
}