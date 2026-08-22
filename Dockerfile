FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY target/sprint1-greeter-app.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]
