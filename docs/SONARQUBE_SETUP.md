# Jenkins + SonarQube classroom setup

The classroom SonarQube server is **http://10.14.137.118:9000/**. Its status API
reported version `26.9.0.129388` on October 6, 2026. Use the same version for local
classroom checks; the instructor's server is authoritative.

Jenkins is **http://10.14.137.118:8080/**.

## Confirm the project key

`sonar-project.properties`, beside `Jenkinsfile`, currently retains the existing
`lil-leap` project key. **Confirm the assigned key with the instructor before
running analysis.** If the classroom uses `team1-app`, `team2-app`, `team3-app`, or
`team4-app`, replace `sonar.projectKey` with the assigned value. Do not submit to
`hello-world-app`; that is only the classroom example. The project-analysis token
must belong to the selected project.

## Configure Jenkins once

1. Install the **SonarQube Scanner for Jenkins** plugin.
2. Under **Manage Jenkins > Credentials > System > Global credentials**, add:
   - Kind: **Secret text**
   - Secret: the assigned project-analysis token
   - ID: **`sonarqube-token`**
   - Description: **SonarQube Team Analysis Token**
3. Under **Manage Jenkins > System > SonarQube servers**, add:
   - Name: **`SonarQube`**
   - Server URL: **`http://10.14.137.118:9000`**
   - Server authentication token: **`sonarqube-token`**
4. Under **Manage Jenkins > Tools > SonarQube Scanner installations**, add a
   compatible SonarScanner CLI named **`SonarScanner`**, using automatic
   installation or an existing installation directory.

The server name `SonarQube` and scanner tool name `SonarScanner` are separate
settings. They must match the names in `Jenkinsfile`. The server URL in Jenkins
must match `sonar.host.url` so analysis and the gate check use the same server.
The existing Linux agent also needs the configured `maven` and `JDK21` tools,
Docker with Compose, and permission to run containers. Node tests use
`node:24-alpine`; the Angular tests rely on Node's TypeScript support and module
hooks. Python tests use `python:3.12-slim`.

Never put tokens in Git, this document, scanner properties, Docker images, or
application configuration. The pipeline obtains the token through
`withSonarQubeEnv` and passes it through the process environment without Groovy
interpolation or command-line token arguments.

## Configure the webhook and classroom rules

In the team's SonarQube project, open **Project Settings > Webhooks** and add
**Jenkins**, pointing to the Jenkins address reachable **from SonarQube**:

```text
http://10.14.137.118:8080/sonarqube-webhook/
```

Keep the trailing slash and verify this address is reachable from the SonarQube
container. If SonarQube runs in Docker on the same machine as
Jenkins and `host.docker.internal` resolves there, the classroom example is:

```text
http://host.docker.internal:8080/sonarqube-webhook/
```

For a shared classroom server and Jenkins on another machine, use that Jenkins
machine's reachable address instead. The webhook sends the completed analysis
status **from SonarQube to Jenkins**. A global webhook under **Administration >
Configuration > Webhooks** is also possible when managed by the instructor.

The instructor must associate this project with the expected Java, Python, and
JavaScript/TypeScript Quality Profiles and the Classroom Quality Gate. One token
authenticates analysis for all languages; it does not select profiles or gates.
Do not replace classroom policies with guessed thresholds.

For a local server, obtain the actual `sonarqube-config` materials from **Extras
in the Dailies**, import the provided language profiles through **Quality
Profiles > Restore**, and use the supplied setup process to reproduce the gate.
Those profile XML files and `configure-sonarqube.sh` are not present in this
repository. A local scan can override the server with
`-Dsonar.host.url=http://localhost:9000`; use a token for that local project via
`SONAR_TOKEN`. Do not commit it.

## Pipeline and coverage

Jenkins checks out the repository, validates Compose, builds/tests the Java
services, runs PostgreSQL integration tests, runs Node and Python tests, and
archives coverage. It then submits SonarQube analysis, waits up to **five minutes**
for the Quality Gate with `abortPipeline: true`, and builds the Compose images
only after the gate passes. A failed gate or timeout prevents the image-build
stage from running.

| Component | Coverage imported by SonarQube |
| --- | --- |
| Orders | `nextTrade-orders/target/site/jacoco/jacoco.xml` |
| Holdings | `nextTrade-holdings/target/site/jacoco/jacoco.xml` |
| Insights | `insights/target/site/jacoco/jacoco.xml` |
| Identity | `auth/coverage/lcov.info` |
| Trading UI | `frontend/coverage/lcov.info` |
| Insights UI | `insights-frontend/coverage/lcov.info` |
| Quote pipeline | `data-pipeline/coverage.xml` |

`scripts/prepare_sonar_coverage.py` prefixes each LCOV source path with its
service directory. This distinguishes files such as `src/main.ts` across the
three Node services. It runs after all Node coverage reports are generated and
fails if a referenced source is missing. The Python container mounts the
workspace at the same absolute path used by Jenkins so its XML source paths
remain valid when the scanner runs outside the container.

## Validate the first build

- Confirm the assigned project key, credential, profiles, and gate.
- Run Jenkins and confirm every test stage passes and coverage is generated.
- Confirm analysis appears in the assigned project with coverage for all seven
  components and no unresolved coverage-path warnings in scanner logs.
- Check the webhook's latest delivery succeeds and Jenkins reports the gate
  result. If the wait times out, check webhook routing and delivery details.
- Confirm a build whose analysis fails the classroom gate does not reach
  **Build Compose Services**. Keep the classroom gate enabled.

Repository configuration alone does not verify live authentication, profile
assignment, webhook delivery, or gate behavior; these require a Jenkins run.

References: [Jenkins SonarQube pipeline steps](https://www.jenkins.io/doc/pipeline/steps/sonar/),
[JavaScript/TypeScript coverage](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/test-coverage/javascript-typescript-test-coverage),
[Python coverage](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/test-coverage/python-test-coverage).
