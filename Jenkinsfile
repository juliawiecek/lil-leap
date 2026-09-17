pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  tools {
    maven 'Maven 3.9'
    jdk 'JDK 21'
  }

  environment {
    COMPOSE_FILE = 'docker-compose.yml'
    NEXTTRADE_POM = 'nextTrade/pom.xml'
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
      steps {
        sh '''
          ${COMPOSE_CMD} -f ${COMPOSE_FILE} config -q
          ${COMPOSE_CMD} -f ${COMPOSE_FILE} config
        '''
      }
    }

    stage('Unit Tests - nextTrade') {
      steps {
        sh "mvn -f ${NEXTTRADE_POM} -B test"
      }
    }

    stage('Unit Tests - insights') {
      steps {
        sh "mvn -f ${INSIGHTS_POM} -B test"
      }
    }

    stage('Build Compose Services') {
      steps {
        sh "${COMPOSE_CMD} -f ${COMPOSE_FILE} build"
      }
    }
  }
}