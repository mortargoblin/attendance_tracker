pipeline {
    agent any

    tools {
        // Configure a JDK 21 and Maven 3.9 installation with these names under
        // Manage Jenkins > Tools, or remove this block if the agent already has
        // java/mvn on PATH.
        jdk 'jdk21'
        maven 'maven3'
    }

    environment {
        IMAGE_NAME = 'attendance-tracker-server'
        IMAGE_TAG  = "${env.BUILD_NUMBER}"
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                dir('server') {
                    sh 'mvn -B -DskipTests clean compile'
                }
            }
        }

        stage('Unit Tests') {
            steps {
                dir('server') {
                    sh 'mvn -B test'
                }
            }
            post {
                always {
                    junit 'server/target/surefire-reports/*.xml'
                }
            }
        }

        stage('Code Coverage') {
            steps {
                dir('server') {
                    // 'verify' runs the JaCoCo report + check goals bound in pom.xml
                    sh 'mvn -B verify -DskipTests=false'
                }
            }
            post {
                always {
                    recordCoverage tools: [[parser: 'JACOCO', pattern: 'server/target/site/jacoco/jacoco.xml']]
                    publishHTML(target: [
                        reportDir: 'server/target/site/jacoco',
                        reportFiles: 'index.html',
                        reportName: 'JaCoCo Coverage Report',
                        keepAll: true,
                        alwaysLinkToLastBuild: true
                    ])
                }
            }
        }

        stage('Package') {
            steps {
                dir('server') {
                    sh 'mvn -B -DskipTests package'
                }
            }
            post {
                success {
                    archiveArtifacts artifacts: 'server/target/attendance-tracker-server.jar', fingerprint: true
                }
            }
        }

        stage('Docker Build') {
            steps {
                dir('server') {
                    sh 'docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest .'
                }
            }
        }
    }

    post {
        success {
            echo "Build ${env.BUILD_NUMBER} succeeded."
            // mail to: 'team@example.com', subject: "Build #${env.BUILD_NUMBER} succeeded", body: 'See Jenkins for details.'
        }
        failure {
            echo "Build ${env.BUILD_NUMBER} failed."
            // mail to: 'team@example.com', subject: "Build #${env.BUILD_NUMBER} FAILED", body: 'See Jenkins for details.'
        }
    }
}
