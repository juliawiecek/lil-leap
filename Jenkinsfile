pipeline {
    agent any
    tools {
        jdk 'JDK21'
    }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Build Image') {
            steps {
                sh 'mvn -B clean package -DskipTests'
                sh 'docker build -t sprint1-greeter-app:latest .'
            }
        }
        stage('Smoke Test') {
            steps {
                sh 'docker run -d --name sprint1-greeter-app:latest'
            }
        }
    }
}
