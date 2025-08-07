import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Azure Fluid Relay Container Creation Production Test", () => {
    let testUser: any;
    let idToken: string;

    beforeAll(async () => {
        // Create test user for production environment
        const response = await fetch("http://localhost:57000/api/create-test-user", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create test user: ${response.status}`);
        }

        testUser = await response.json();
        idToken = testUser.idToken;
        console.log(`Created test user: ${testUser.email}`);
    });

    afterAll(async () => {
        if (testUser) {
            // Clean up test user
            await fetch("http://localhost:57000/api/delete-user", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    uid: testUser.uid,
                }),
            });
            console.log(`Deleted test user: ${testUser.email}`);
        }
    });

    it("should successfully create a new container with primary key", async () => {
        // Test direct Firebase Functions call
        const response = await fetch("http://localhost:57000/api/fluid-token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken: idToken,
            }),
        });

        expect(response.ok).toBe(true);
        const tokenData = await response.json();

        console.log("Token response:", {
            tenantId: tokenData.tenantId,
            hasToken: !!tokenData.token,
            userId: tokenData.user?.id,
        });

        expect(tokenData.token).toBeDefined();
        expect(tokenData.tenantId).toBe("89b298bd-9aa3-4a6b-8ef0-2dc3019b0996");

        // Test Azure Fluid Relay container creation
        const containerResponse = await fetch(
            `https://us.fluidrelay.azure.com/fluid/api/v1/tenants/${tokenData.tenantId}/documents`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${tokenData.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    id: `test-container-${Date.now()}`,
                }),
            },
        );

        console.log("Container creation response:", {
            status: containerResponse.status,
            statusText: containerResponse.statusText,
        });

        if (!containerResponse.ok) {
            const errorText = await containerResponse.text();
            console.error("Container creation error:", errorText);

            // If we get a 403 error, it means the token is invalid
            if (containerResponse.status === 403) {
                throw new Error(`Azure Fluid Relay rejected the token: ${errorText}`);
            }
        }

        expect(containerResponse.ok).toBe(true);
    });

    it("should test token validation with different keys", async () => {
        // Test with container ID to ensure we get a scoped token
        const containerId = `test-container-${Date.now()}`;

        const response = await fetch("http://localhost:57000/api/fluid-token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken: idToken,
                containerId: containerId,
            }),
        });

        expect(response.ok).toBe(true);
        const tokenData = await response.json();

        console.log("Scoped token response:", {
            tenantId: tokenData.tenantId,
            containerId: tokenData.containerId,
            hasToken: !!tokenData.token,
        });

        expect(tokenData.token).toBeDefined();
        expect(tokenData.containerId).toBe(containerId);

        // Decode the JWT to check which key was used
        const tokenParts = tokenData.token.split(".");
        const payload = JSON.parse(atob(tokenParts[1]));

        console.log("Token payload:", {
            tenantId: payload.tenantId,
            documentId: payload.documentId,
            scopes: payload.scopes,
        });

        expect(payload.tenantId).toBe("89b298bd-9aa3-4a6b-8ef0-2dc3019b0996");
        expect(payload.documentId).toBe(containerId);
    });
});
