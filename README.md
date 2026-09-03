# Lil-Leap NextTrade

NextTrade is an e-trading platform developed as part of the Fidelity LEAP Project. The application uses a modern full-stack architecture with Angular on the frontend, Spring Boot on the backend, PostgreSQL for data persistence, and automated testing and CI/CD tooling to support reliable development and deployment.

## Team

| Team Member    | Role                      |
| -------------- | ------------------------- |
| Julia Wiecek   | Team Lead                 |
| Lalima Karri   | Developer, Angular        |
| Ilhan Gelle    | Developer, Security       |
| Tanush Kaushik | Developer / Data Engineer |
| Kevin Marin    | Developer, Spring Boot    |

## Technology Stack

### Backend

#### Spring Boot

Spring Boot is the core Java framework used to run the backend application. It provides the foundation for REST APIs, application logic, database integration, security, and service organization.

### Database

#### PostgreSQL

PostgreSQL is the primary relational database used by the application.

It was selected for its strong support of database constraints and data integrity, including:

* `CHECK`
* `FOREIGN KEY`
* `UNIQUE`
* `NOT NULL`

#### pgcrypto

The PostgreSQL `pgcrypto` extension is used to generate UUID primary keys at the database level.

## Security and Authentication

### Spring Security

Spring Security handles authentication and authorization within the backend application.

It supports:

* User authentication
* Role and access control
* Protected API endpoints
* Password security

### BCrypt

Passwords are hashed before storage using Spring Security's `BCryptPasswordEncoder`.

BCrypt provides secure one-way password hashing and is available directly through Spring Security.

### JWT Authentication

A JWT library will be used to issue and validate authentication tokens for login sessions.

The specific library has not yet been finalized. `jjwt` is currently being considered.

**Status:** Decision pending and will be finalized when TS-02.2 begins.

## Frontend

### Angular

Angular is the primary frontend framework for NextTrade.

It is used to build reusable components, manage frontend application logic, connect to backend REST APIs, and organize the user interface.

### Spartan UI

Spartan UI is the component library used with Angular to build a consistent and reusable user interface.

It provides accessible and customizable UI components that can be integrated into features across the platform.

Spartan UI is used to support interface elements such as:

* Data tables
* Forms
* Buttons
* Dialogs
* Dropdowns
* Navigation
* Dashboard components
* User interface controls

## Testing

### JUnit 5

JUnit 5 is the primary Java testing framework used for backend unit and integration tests.

### Spring Boot Test

Spring Boot Test provides testing utilities for Spring-based applications.

### MockMvc

MockMvc is used to test REST endpoints without requiring a live application server.

It can be used to validate:

* HTTP requests
* HTTP responses
* Status codes
* Request validation
* Controller behavior
* API security behavior

## Infrastructure and DevOps

### Docker

Docker is used to containerize application services.

This helps ensure that developers and CI environments run consistent configurations and reduces environment-specific differences.

### Jenkins

Jenkins is used for Continuous Integration and Continuous Deployment.

It automates the build and testing process whenever new code is integrated.

Typical workflow:

```text
   Code Change
        |
        v
      Build
        |
        v
 Automated Tests
        |
        v
    Validation
        |
        v
Deployment Pipeline
```

### Node.js and npm

Node.js and npm are required to build and run the Angular frontend.

npm is also used to install and manage frontend dependencies such as Angular, Spartan UI, and other packages used by the application.

## Branching Strategy

### Trunk-Based Development

NextTrade follows a trunk-based development strategy.

Developers work from a shared main branch and integrate small changes frequently rather than maintaining multiple long-lived development branches.

This approach supports:

* Faster feedback
* Smaller code changes
* Reduced merge conflicts
* Frequent integration
* Improved collaboration
* Earlier identification of defects

Typical workflow:

```text
  Developer Change
          |
          v
    Local Testing
          |
          v
    Commit Changes
          |
          v
 Integrate with Main
          |
          v
     Jenkins CI
          |
          v
Build and Automated Tests
```

The goal is to keep the shared branch stable while continuously integrating small, tested changes.

## Architecture Overview

```text
+---------------------------------------------+
|                  Frontend                   |
|                                             |
|             Angular + Spartan UI            |
+----------------------+----------------------+
                       |
                       | REST API
                       v
+---------------------------------------------+
|                  Backend                    |
|                                             |
|                Spring Boot                  |
|             Spring Security                 |
+----------------------+----------------------+
                       |
                       | SQL
                       v
+---------------------------------------------+
|                 Database                    |
|                                             |
|                PostgreSQL                   |
|            Flyway + pgcrypto                |
+---------------------------------------------+

Development and CI Tooling

Docker | Jenkins | JUnit 5 | MockMvc | Node.js | npm
```

## External Libraries and Services

| Category         | Technology       | Purpose                                       |
| ---------------- | ---------------- | --------------------------------------------- |
| Backend          | Spring Boot      | Backend framework and REST API                |
| Database         | PostgreSQL       | Relational database and data integrity        |
| Database         | Flyway           | Version-controlled database migrations        |
| Database         | pgcrypto         | Database-level UUID generation                |
| Security         | Spring Security  | Authentication and authorization              |
| Security         | BCrypt           | Secure password hashing                       |
| Security         | JWT Library      | Authentication token management, library TBD  |
| Frontend         | Angular          | Frontend application framework                |
| Frontend         | Spartan UI       | Angular UI component library                  |
| Testing          | JUnit 5          | Java testing framework                        |
| Testing          | Spring Boot Test | Spring application testing utilities          |
| Testing          | MockMvc          | REST endpoint testing                         |
| Infrastructure   | Docker           | Containerized development and CI environments |
| CI/CD            | Jenkins          | Automated build and testing pipeline          |
| Frontend Tooling | Node.js / npm    | Angular builds and dependency management      |

## Project Information

**Project:** LilLeap NextTrade <br>
**Program:** Fidelity LEAP <br>
**Application Type:** E-Trading Platform <br>
