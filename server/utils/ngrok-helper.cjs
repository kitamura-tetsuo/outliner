const axios = require("axios");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Local host configuration
const LOCAL_HOST = process.env.LOCAL_HOST || "localhost";

// Path to .env file
const envPath = path.join(__dirname, "..", ".env");

/**
 * Get current public URL via ngrok API
 * @returns {Promise<string|null>} ngrok public URL
 */
async function getNgrokPublicUrl() {
    try {
        // Get tunnel info from ngrok API
        const response = await axios.get(`http://${LOCAL_HOST}:4040/api/tunnels`);
        const tunnels = response.data.tunnels;

        // Search for HTTPS URL
        const httpsTunnel = tunnels.find(tunnel => tunnel.proto === "https");
        if (httpsTunnel) {
            console.log("ngrok HTTPS URL:", httpsTunnel.public_url);
            return httpsTunnel.public_url;
        }

        // Search for HTTP URL (if HTTPS not found)
        const httpTunnel = tunnels.find(tunnel => tunnel.proto === "http");
        if (httpTunnel) {
            console.log("ngrok HTTP URL:", httpTunnel.public_url);
            return httpTunnel.public_url;
        }

        console.warn("No active ngrok tunnels found");
        return null;
    } catch (error) {
        console.error("Cannot access ngrok API:", error.message);
        console.error("Please check if ngrok is running");
        return null;
    }
}

/**
 * Update GOOGLE_CALLBACK_URL in .env file
 * @param {string} ngrokUrl ngrok public URL
 * @returns {boolean} Whether update was successful
 */
function updateEnvCallbackUrl(ngrokUrl) {
    try {
        // Check if .env file exists
        if (!fs.existsSync(envPath)) {
            console.error(".env file not found:", envPath);
            return false;
        }

        // Read content of .env file
        let envContent = fs.readFileSync(envPath, "utf8");

        // Update callback URL
        const callbackUrl = `${ngrokUrl}/auth/google/callback`;
        const regex = /(GOOGLE_CALLBACK_URL\s*=\s*).*/;

        if (regex.test(envContent)) {
            // Update existing setting
            envContent = envContent.replace(regex, `$1${callbackUrl}`);
        } else {
            // Add if setting does not exist
            envContent += `\nGOOGLE_CALLBACK_URL=${callbackUrl}\n`;
        }

        // Write updated content
        fs.writeFileSync(envPath, envContent);

        console.log("Updated Google callback URL:", callbackUrl);

        // Reload environment variables
        dotenv.config();

        return true;
    } catch (error) {
        console.error("Error occurred while updating .env file:", error);
        return false;
    }
}

/**
 * Get ngrok public URL and update .env file
 * @returns {Promise<string|null>} Updated ngrok URL
 */
async function setupNgrokUrl() {
    const ngrokUrl = await getNgrokPublicUrl();

    if (ngrokUrl) {
        const updated = updateEnvCallbackUrl(ngrokUrl);
        if (updated) {
            return ngrokUrl;
        }
    }

    return null;
}

module.exports = {
    getNgrokPublicUrl,
    updateEnvCallbackUrl,
    setupNgrokUrl,
};
