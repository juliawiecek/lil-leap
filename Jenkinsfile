// Pull requests and feature branches get the quick gate; main runs every check.
def onMain() {
  def mainRefs = ['main', 'origin/main', 'refs/heads/main']
  return mainRefs.contains(env.BRANCH_NAME ?: '') || mainRefs.contains(env.GIT_BRANCH ?: '')
}

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    // Archived Playwright traces and reports add up; keep recent builds only.
    buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
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

    stage('Preflight') {
      // Undo what an earlier failed or aborted build can leave behind, so it cannot fail this one.
      steps {
        sh '''
          set -eu
          # Stacks from an aborted e2e or smoke run (builds never overlap: disableConcurrentBuilds).
          for project in $(docker ps -a --format '{{.Label "com.docker.compose.project"}}' | grep -E '^nexttrade-(e2e|smoke)-' | sort -u); do
            echo "Removing leftover stack $project"
            docker ps -aq --filter "label=com.docker.compose.project=$project" | xargs -r docker rm -f >/dev/null
            docker network ls -q --filter "label=com.docker.compose.project=$project" | xargs -r docker network rm >/dev/null || true
            docker volume ls -q --filter "label=com.docker.compose.project=$project" | xargs -r docker volume rm >/dev/null || true
          done
          # Reports written as root by an older e2e runner, which the Jenkins user cannot delete.
          docker run --rm -v "$WORKSPACE/e2e:/e2e" node:24-alpine rm -rf /e2e/artifacts
          # npm downloads are kept between builds so each npm ci does not fetch everything again.
          mkdir -p "$HOME/.cache/nexttrade-npm"
          # SonarQube on this host stops indexing analyses when the disk fills.
          free_gb=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
          if [ "$free_gb" -lt 15 ]; then
            echo "Only ${free_gb}G free; pruning unused Docker images and build cache"
            docker image prune -af >/dev/null || true
            docker builder prune -af >/dev/null || true
            free_gb=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
          fi
          echo "Disk free: ${free_gb}G"
          if [ "$free_gb" -lt 5 ]; then
            echo "ERROR: under 5G free on the Jenkins host even after pruning; free space before building."
            exit 1
          fi
        '''
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

    stage('Tests') {
      // The four groups share nothing, so they run side by side. Maven builds stay in one
      // group because they share ~/.m2, and both frontends need the built session package.
      parallel {
        stage('Java services') {
          stages {
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
                    mvn -B -ntp -Dtest=OrderLifecyclePostgresTest,InstrumentTradabilitySubmissionTest,OrderIdempotencyPostgresTest test
                    mvn -B -ntp -f ../nextTrade-holdings/pom.xml \
                      -Dtest=HoldingsSettlementPostgresTest,AccountTransferPostgresTest,InstrumentSearchRepositoryTest \
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
          }
        }

        stage('Unit Tests - auth (NestJS)') {
          // The numeric Jenkins UID has no container home; use a writable npm cache.
          steps {
            sh '''
              docker run --rm \
                --user "$(id -u):$(id -g)" \
                -e npm_config_cache=/tmp/npm-cache \
                -v "$HOME/.cache/nexttrade-npm:/tmp/npm-cache" \
                -v "$WORKSPACE/auth:/app" \
                -w /app \
                node:24-alpine \
                sh -ec 'npm ci --no-audit --no-fund --prefer-offline
                npm run test:cov'
            '''
          }
        }

        stage('Frontends') {
          stages {
            stage('Build and Test Shared Session Package') {
              steps {
                sh '''
                  docker run --rm --user "$(id -u):$(id -g)" \
                    -e npm_config_cache=/tmp/npm-cache \
                    -v "$HOME/.cache/nexttrade-npm:/tmp/npm-cache" \
                    -v "$WORKSPACE:$WORKSPACE" -w "$WORKSPACE/shared/session-core" \
                    node:24-alpine sh -ec 'npm ci --no-audit --no-fund --prefer-offline
                    npm run build
                    npm run test:coverage'
                '''
              }
            }

            stage('Unit Tests - frontend (Angular)') {
              steps {
                sh '''
                  docker run --rm \
                    --user "$(id -u):$(id -g)" \
                    -e npm_config_cache=/tmp/npm-cache \
                    -v "$HOME/.cache/nexttrade-npm:/tmp/npm-cache" \
                    -v "$WORKSPACE:$WORKSPACE" \
                    -w "$WORKSPACE/frontend" \
                    node:24-alpine \
                    sh -ec 'npm ci --no-audit --no-fund --prefer-offline
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
                    -v "$HOME/.cache/nexttrade-npm:/tmp/npm-cache" \
                    -v "$WORKSPACE:$WORKSPACE" \
                    -w "$WORKSPACE/insights-frontend" \
                    node:24-alpine \
                    sh -ec 'npm ci --no-audit --no-fund --prefer-offline
                    npm run test:coverage
                    npm run build'
                '''
              }
            }
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
                --cov-report=xml:coverage.xml'
            '''
          }
        }
      }
    }

    stage('Archive Coverage') {
      steps {
        archiveArtifacts(
          artifacts: [
            'nextTrade-orders/target/site/jacoco/**',
            'nextTrade-holdings/target/site/jacoco/**',
            'insights/target/site/jacoco/**',
            'data-pipeline/htmlcov/**',
            'data-pipeline/coverage.xml',
            'auth/coverage/**',
            'frontend/coverage/**',
            'insights-frontend/coverage/**',
            'shared/session-core/coverage/**'
          ].join(','),
          fingerprint: true,
          allowEmptyArchive: true
        )
      }
    }

    stage('Prepare Java Analysis Dependencies') {
      // Only the Sonar scan reads these.
      when { expression { onMain() } }
      steps {
        sh '''
          set -eu
          for service in nextTrade-orders nextTrade-holdings insights; do
            (
              cd "$service"
              mvn -B -ntp org.apache.maven.plugins:maven-dependency-plugin:3.8.1:copy-dependencies \
                -DincludeScope=test -DoutputDirectory=target/sonar-libraries
            )
          done
        '''
      }
    }

    stage('Prepare Sonar Coverage') {
      // Reads every service's coverage report and the dependency JARs, so it waits for all tests.
      when { expression { onMain() } }
      steps {
        sh '''
          docker run --rm \
            --user "$(id -u):$(id -g)" \
            -v "$WORKSPACE:$WORKSPACE" \
            -w "$WORKSPACE" \
            python:3.12-slim \
            sh -ec 'python scripts/prepare_sonar_coverage.py
            python scripts/validate_sonar_config.py --require-reports'
        '''
      }
    }

    stage('SonarQube Analysis') {
      when { expression { onMain() } }
      steps {
        echo "Running SonarQube analysis on main branch"
        script {
          def scannerHome = tool 'SonarScanner'
          withSonarQubeEnv(installationName: 'SonarQube') {
            withEnv(["SCANNER_HOME=${scannerHome}"]) {
              sh '''
                set +x
                if [ -z "${SONAR_AUTH_TOKEN:-}" ]; then
                  echo "ERROR: SONAR_AUTH_TOKEN is empty. Check SonarQube server credentials in Jenkins."
                  exit 1
                fi
                export SONAR_TOKEN="$SONAR_AUTH_TOKEN"
                "$SCANNER_HOME/bin/sonar-scanner" \
                  -Dsonar.host.url="$SONAR_HOST_URL" \
                  -Dsonar.projectVersion="$BUILD_NUMBER"
              '''
            }
          }
        }
      }
    }

    stage('SonarQube Quality Gate') {
      when { expression { onMain() } }
      steps {
        echo "Waiting for SonarQube quality gate on main branch"
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    // The Playwright e2e suite is not part of the Jenkins gate; run it locally with `node e2e/run-stack.mjs`.

    stage('Build Compose Services') {
      // Building every image is slow, so only main checks the release compose file.
      when { expression { onMain() } }
      steps {
        // A second attempt covers a registry or Maven Central blip; finished layers are cached.
        retry(2) {
          sh "${COMPOSE_CMD} -f ${COMPOSE_FILE} build"
        }
      }
    }

    stage('Smoke Test - Seeded Logins') {
      // TS-DB-04: on a fresh volume the dev test users log in and see their portfolios.
      // Runs in its own compose project with no published ports, and removes it afterwards.
      // No Jenkins credential needed: the script uses a random password for the throwaway stack.
      when { expression { onMain() } }
      steps {
        sh 'SMOKE_PROJECT="nexttrade-smoke-$BUILD_NUMBER" bash scripts/seeded-logins-smoke-test.sh'
      }
    }
  }

  post {
    // The e2e and smoke stacks build images under a new Compose project name on every run.
    // Remove any left behind, plus untagged images and old build cache, so the agent's disk
    // does not fill up (SonarQube on the same host stops indexing analyses when it does).
    // Images used by a running container are kept.
    cleanup {
      sh '''
        leftovers=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^nexttrade-(e2e|smoke)-' || true)
        [ -z "$leftovers" ] || echo "$leftovers" | xargs docker rmi >/dev/null 2>&1 || true
        docker image prune -f >/dev/null 2>&1 || true
        docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
        df -h / || true
      '''
    }
  }
}
