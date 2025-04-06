FROM node:20-slim

# Install required dependencies including Java
RUN apt-get update && \
    apt-get install -y default-jre curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /firebase

# Install Firebase tools globally
RUN npm install -g firebase-tools

# Copy the Firebase configuration
COPY firebase.json .
COPY .firebaserc .

# Create data directory
RUN mkdir -p /firebase-data

# Expose ports
# Firebase UI
EXPOSE 4000
# Firestore
EXPOSE 8080
# Authentication
EXPOSE 9099

# Start emulators
CMD firebase emulators:start --project demo-test \
    --only auth,firestore \
    --import=/firebase-data \
    --export-on-exit=/firebase-data