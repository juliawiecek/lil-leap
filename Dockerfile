FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
<<<<<<< HEAD
COPY target/the-best-app-ever.jar app.jar
=======
COPY target/sprint1-greeter-app.jar app.jar
>>>>>>> a0f8605064222de7d4a53b3fc0e9c350b91e902b
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
