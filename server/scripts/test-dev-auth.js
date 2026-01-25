// Test script for development authentication
require("dotenv").config();
const fetch = require("node-fetch");

// API server URL
const LOCAL_HOST = process.env.LOCAL_HOST || "localhost";
const API_BASE_URL = process.env.API_BASE_URL || `http://${LOCAL_HOST}:7071`;

// Test credentials
const testCredentials = {
    email: "test@example.com",
    password: process.env.TEST_USER_PASSWORD || "password123",
};

// Helper for color output
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

async function testEmailPasswordLogin() {
    console.log(`${colors.cyan}===================================================${colors.reset}`);
    console.log(`${colors.cyan}Test email/password authentication for development environment${colors.reset}`);
    console.log(`${colors.cyan}===================================================${colors.reset}`);
    console.log(`API Server: ${API_BASE_URL}`);

    try {
        console.log(`\n${colors.yellow}1. Attempting login at /api/login endpoint...${colors.reset}`);
        const loginResponse = await fetch(`${API_BASE_URL}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testCredentials),
        });

        if (!loginResponse.ok) {
            const errorText = await loginResponse.text();
            console.error(
                `${colors.red}Login failed: ${loginResponse.status} ${loginResponse.statusText}${colors.reset}`,
            );
            console.error(`${colors.red}Error details: ${errorText}${colors.reset}`);
            return;
        }

        const loginData = await loginResponse.json();
        console.log(`${colors.green}Login successful!${colors.reset}`);
        console.log(`User: ${JSON.stringify(loginData.user, null, 2)}`);

        if (!loginData.customToken) {
            console.error(`${colors.red}Custom token was not returned${colors.reset}`);
            return;
        }

        console.log(`${colors.green}Successfully obtained custom token${colors.reset}`);

        // Generate ID token for development environment instead of custom token
        console.log(`\n${colors.yellow}2. Generating ID token for development environment...${colors.reset}`);
        const devToken = {
            uid: loginData.user.uid,
            email: loginData.user.email,
            displayName: loginData.user.displayName,
            devUser: true, // Flag for development environment
            role: "user",
        };

        // Stringify token and add signature (Simplified version for development environment)
        const fakeIdToken = Buffer.from(JSON.stringify(devToken)).toString("base64");
        console.log(`${colors.green}Development environment ID token generation completed${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}An error occurred during testing:${colors.reset}`, error);
    }
}

// Execute test
testEmailPasswordLogin();
