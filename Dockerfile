FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY target/sprint1-greeter-app.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
