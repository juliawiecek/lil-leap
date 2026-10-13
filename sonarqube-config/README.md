# Local SonarQube configuration

This directory contains a local SonarQube/PostgreSQL Compose setup and eight
Quality Profile XML exports. The scanner configuration stays at the repository
root in [`sonar-project.properties`](../sonar-project.properties).

```text
sonarqube-config/
├── README.md
├── quality-profiles/
│   ├── css-profile.xml
│   ├── docker-profile.xml
│   ├── html-profile.xml
│   ├── java-profile.xml
│   ├── javascript-profile.xml
│   ├── python-profile.xml
│   ├── typescript-profile.xml
│   └── xml-profile.xml
└── docker-compose.yml
```

## Start the local server

Install Docker with Compose and review SonarSource's
[Docker installation requirements](https://docs.sonarsource.com/sonarqube-community-build/server-installation/from-docker-image/prepare-installation).
The [project setup guide](../docs/SONARQUBE_SETUP.md) records classroom version
`26.9.0.129388`. Obtain the matching image tag or digest from the instructor or
the [official image listing](https://hub.docker.com/_/sonarqube); do not assume
the floating `community` tag matches that server.

Create a local `.env` file in this directory (Git already ignores `.env` files),
replacing both example values:

```dotenv
SONARQUBE_IMAGE=replace-with-confirmed-image-tag-or-digest
SONAR_DB_PASSWORD=replace-with-a-local-database-password
SONARQUBE_PORT=9000
```

Run these commands from this directory:

```sh
docker compose config --quiet
docker compose up -d
docker compose logs -f sonarqube
```

Open `http://localhost:9000` after startup completes. If you change
`SONARQUBE_PORT`, use that port instead. The server binds to loopback for local
use; Jenkins on another machine needs a reachable server address and a deliberate
change to that binding. PostgreSQL is only accessible inside the Compose network.

The Compose configuration uses the JDBC environment variables and named volumes
described in the [official Docker setup documentation](https://docs.sonarsource.com/sonarqube-community-build/server-installation/from-docker-image/set-up-and-start-container),
with PostgreSQL 17 as in the
[SonarSource Compose example](https://github.com/SonarSource/docker-sonarqube/blob/master/example-compose-files/sq-with-postgres/docker-compose.yml).

## Restore classroom policies

1. Use the exports under `quality-profiles/`. Keep them aligned with the
   instructor's approved files from **Extras in the Dailies**.
2. In SonarQube, use **Quality Profiles > Restore** to import the exports, then
   select each named profile for project **LilLeap-Project** under its
   **Quality Profiles** page. Importing a file alone does not assign it.
3. Reproduce and assign the Classroom Quality Gate using the supplied setup
   process. Profile XML files do not define the gate. The classroom
   `configure-sonarqube.sh` and gate definitions are not included here.
4. Follow the [Jenkins setup guide](../docs/SONARQUBE_SETUP.md) for credentials,
   the webhook, and validation of the first analysis.

Compose starts the server and database; it does not automatically restore
profiles, configure a gate, create a project, or configure Jenkins.

| Profile | SonarQube language key | Files in the configured scan | Exported rules |
| --- | --- | --- | --- |
| java-profile | java | Java sources and tests in the three Maven services | 37 |
| python-profile | py | Data-pipeline sources and tests | 41 |
| typescript-profile | ts | Auth and both Angular applications | 39 |
| javascript-profile | js | Frontend `.mjs` tests | 35 |
| html-profile | web | Angular HTML templates | 15 |
| css-profile | css | Angular SCSS styles | 10 |
| docker-profile | docker | Dockerfiles for the seven analyzed services | 10 |
| xml-profile | xml | Three Maven POMs and three Logback XML files | 9 |

Profiles are selected by language on the server; do not add XML paths or a
`sonar.profile` property to the scanner configuration. See SonarSource's
[profile association documentation](https://docs.sonarsource.com/sonarqube-community-build/project-administration/adjusting-analysis/changing-quality-profiles).
The export filenames do not determine their language; the `<language>` element
does. Preserve the provided rule definitions. When restoring over an existing
profile, SonarQube may retain existing rules/settings, so compare the resulting
server backup instead of assuming the import made it identical.

## Validate configuration and server assignments

From the repository root:

```sh
python scripts/validate_sonar_config.py
python scripts/validate_sonar_config.py --require-reports
python scripts/validate_sonar_config.py --check-server
```

The first command checks profile structure, source/test paths, and language
coverage. The second also requires compiled Java classes and coverage reports
whose source paths resolve in this checkout. Jenkins runs it after preparing
coverage and before scanning. Existing reports passing this check do not prove
they were generated from the current source revision.

The third command checks server readiness, the project's assigned profile names,
and each profile's exported rules, severities, parameters, and impacts against
these files. Supply `SONAR_TOKEN` through your environment if authentication is
required; it needs permission to read the project and profile backups. The check
is read-only. For a local server, append `--server-url http://localhost:9000`.
It reports the assigned Quality Gate but does not verify its thresholds.

Local validation does not verify analyzer support for each rule, successful
profile restoration, a completed scan, or a passing Quality Gate. Finish by
running the Jenkins main-branch pipeline and reviewing its analysis and gate
result on the reachable server. Jenkins explicitly uses the URL of its configured
`SonarQube` installation and passes the analysis token through `SONAR_TOKEN`.

The scanner configuration remains at [`../sonar-project.properties`](../sonar-project.properties).
Run analysis from the repository root after generating build and coverage
artifacts. For a local scan, override the server with
`-Dsonar.host.url=http://localhost:9000` (adjust for your configured port) and
provide the local project's token through `SONAR_TOKEN`. Keep tokens out of Git.

## Stop the local server

```sh
docker compose down
```

Named volumes retain the database and SonarQube data. Adding `--volumes` deletes
that stored state, including imported profiles and local project history.
