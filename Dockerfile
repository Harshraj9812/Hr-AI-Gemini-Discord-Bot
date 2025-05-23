# Use an official Node.js LTS runtime as a base image
FROM node:23-alpine

# Copy the application code to the working directory
COPY . .

RUN mkdir image
RUN pwd
RUN ls

# Install dependencies
RUN npm install

RUN pwd
RUN ls

# Define the command to run your application
CMD ["node", "index.js"]