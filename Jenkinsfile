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

    triggers {
        // Two ways to auto-trigger a build, pick whichever fits your setup:
        // 1) GitHub webhook (needs Jenkins reachable from the internet, e.g. via ngrok or a
        //    public server): install the "GitHub" plugin, tick "GitHub hook trigger for
        //    GITScm polling" in the job config, and add a webhook in the GitHub repo settings
        //    pointing at http://<your-jenkins-url>/github-webhook/. That trigger is configured
        //    in the job UI, not here, but this pipeline works either way.
        // 2) SCM polling (works entirely locally, no inbound webhook needed): Jenkins checks
        //    the repo on this schedule and starts a build only if there are new commits.
        //    Enabled by default below - checks every 2 minutes. Comment this out if you set up
        //    a GitHub webhook instead (option 1), so you don't build twice.
        pollSCM('H/2 * * * *')
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
                    script {
                        if (isUnix()) {
                            sh './mvnw -B -DskipTests clean compile'
                        } else {
                            bat 'mvnw.cmd -B -DskipTests clean compile'
                        }
                    }
                }
            }
        }

        stage('Unit Tests') {
            steps {
                dir('server') {
                    script {
                        if (isUnix()) {
                            sh './mvnw -B test'
                        } else {
                            bat 'mvnw.cmd -B test'
                        }
                    }
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
                    script {
                        if (isUnix()) {
                            sh './mvnw -B verify -DskipTests=false'
                        } else {
                            bat 'mvnw.cmd -B verify -DskipTests=false'
                        }
                    }
                }
            }
            post {
                always {
                    // Uses the JaCoCo plugin's step (confirmed installed), instead of the
                    // Coverage plugin's recordCoverage or HTML Publisher's publishHTML,
                    // which may not be installed on every Jenkins instance.
                    jacoco(
                        execPattern: 'server/target/*.exec',
                        classPattern: 'server/target/classes',
                        sourcePattern: 'server/src/main/java',
                        inclusionPattern: '**/*.class'
                    )
                    archiveArtifacts artifacts: 'server/target/site/jacoco/**', allowEmptyArchive: true, fingerprint: false
                }
            }
        }

        stage('Package') {
            steps {
                dir('server') {
                    script {
                        if (isUnix()) {
                            sh './mvnw -B -DskipTests package'
                        } else {
                            bat 'mvnw.cmd -B -DskipTests package'
                        }
                    }
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
                    script {
                        if (isUnix()) {
                            def dockerAvailable = sh(script: 'command -v docker', returnStatus: true) == 0
                            if (dockerAvailable) {
                                sh 'docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest .'
                            } else {
                                echo 'Docker CLI not found on this agent - skipping Docker Build stage.'
                            }
                        } else {
                            def dockerAvailable = bat(script: 'where docker', returnStatus: true) == 0
                            if (dockerAvailable) {
                                bat 'docker build -t %IMAGE_NAME%:%IMAGE_TAG% -t %IMAGE_NAME%:latest .'
                            } else {
                                echo 'Docker CLI not found on this agent - skipping Docker Build stage.'
                            }
                        }
                    }
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
            // test
        }
    }
}
