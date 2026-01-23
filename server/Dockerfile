# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install any needed packages
RUN npm install

# Copy the rest of the application's code
COPY . .

# Build the TypeScript code
RUN npm run build

# Make port 1234 available to the world outside this container
EXPOSE 1234

# Define environment variables
ENV NODE_ENV=production

# Run the app when the container launches
CMD ["node", "log-service.js"]
