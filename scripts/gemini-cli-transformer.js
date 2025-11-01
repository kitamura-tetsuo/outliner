const { spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { log } = require("claude-code-router");

class GeminiCLITransformer {
    name = "gemini-cli-direct";

    constructor(options) {
        this.options = options || {};
        this.tempDir = path.join(os.tmpdir(), "gemini-cli-transformer");
        this.ensureTempDir();
    }

    async ensureTempDir() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (error) {
            log("Failed to create temp directory:", error.message);
        }
    }

    convertMessagesToGeminiFormat(messages) {
        const conversation = [];

        for (const message of messages) {
            let role;
            if (message.role === "assistant") {
                role = "model";
            } else if (["user", "system", "tool"].includes(message.role)) {
                role = "user";
            } else {
                role = "user"; // Default fallback
            }

            const parts = [];

            if (typeof message.content === "string") {
                parts.push({ text: message.content });
            } else if (Array.isArray(message.content)) {
                for (const content of message.content) {
                    if (content.type === "text") {
                        parts.push({ text: content.text || "" });
                    } else if (content.type === "image_url") {
                        // Handle image content
                        if (content.image_url.url.startsWith("http")) {
                            parts.push({
                                fileData: {
                                    mimeType: content.media_type || "image/jpeg",
                                    fileUri: content.image_url.url,
                                },
                            });
                        } else {
                            parts.push({
                                inlineData: {
                                    mimeType: content.media_type || "image/jpeg",
                                    data: content.image_url.url,
                                },
                            });
                        }
                    }
                }
            }

            // Handle tool calls
            if (Array.isArray(message.tool_calls)) {
                for (const toolCall of message.tool_calls) {
                    parts.push({
                        functionCall: {
                            name: toolCall.function.name,
                            args: JSON.parse(toolCall.function.arguments || "{}"),
                        },
                    });
                }
            }

            conversation.push({
                role,
                parts,
            });
        }

        return { contents: conversation };
    }

    buildGeminiCommand(request, conversationFile) {
        const args = ["chat"];

        // Add model specification with force-model option
        if (request.model) {
            args.push("--model", request.model);
            if (this.options.forceModel) {
                args.push("--force-model");
            }
        }

        // Add project if specified
        if (this.options.project) {
            args.push("--project", this.options.project);
        }

        // Add temperature if specified
        if (request.temperature !== undefined) {
            args.push("--temperature", request.temperature.toString());
        }

        // Add max tokens if specified
        if (request.max_tokens) {
            args.push("--max-tokens", request.max_tokens.toString());
        }

        // Add streaming if requested
        if (request.stream) {
            args.push("--stream");
        }

        // Add JSON output format for easier parsing
        args.push("--format", "json");

        // Add conversation file
        args.push("--file", conversationFile);

        return {
            command: "gemini",
            args,
        };
    }

    convertGeminiToOpenAI(geminiResponse, originalRequest) {
        // Extract content from Gemini response
        let content = "";
        let tool_calls = [];

        if (geminiResponse.candidates && geminiResponse.candidates[0]) {
            const candidate = geminiResponse.candidates[0];

            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.text) {
                        content += part.text;
                    }

                    if (part.functionCall) {
                        tool_calls.push({
                            id: `tool_${Math.random().toString(36).substring(2, 15)}`,
                            type: "function",
                            function: {
                                name: part.functionCall.name,
                                arguments: JSON.stringify(part.functionCall.args || {}),
                            },
                        });
                    }
                }
            }
        }

        // Create OpenAI-compatible response
        const response = {
            id: `chatcmpl-${Math.random().toString(36).substring(2, 15)}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: originalRequest.model || "gemini-2.5-pro",
            choices: [{
                index: 0,
                message: {
                    role: "assistant",
                    content: content || null,
                    tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
                },
                finish_reason: this.mapFinishReason(geminiResponse.candidates?.[0]?.finishReason),
            }],
            usage: {
                prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
                completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
                total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0,
            },
        };

        return response;
    }

    mapFinishReason(geminiFinishReason) {
        const mapping = {
            "STOP": "stop",
            "MAX_TOKENS": "length",
            "SAFETY": "content_filter",
            "RECITATION": "content_filter",
            "OTHER": "stop",
        };

        return mapping[geminiFinishReason] || "stop";
    }

    async executeCommand(commandConfig) {
        const { command, args } = commandConfig;

        return new Promise((resolve, reject) => {
            log("Executing Gemini CLI command:", command, args.join(" "));

            const child = spawn(command, args, {
                stdio: ["pipe", "pipe", "pipe"],
                env: { ...process.env },
            });

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (data) => {
                stdout += data.toString();
            });

            child.stderr.on("data", (data) => {
                stderr += data.toString();
            });

            child.on("close", (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(new Error(`Gemini CLI exited with code ${code}: ${stderr}`));
                }
            });

            child.on("error", (error) => {
                reject(new Error(`Failed to execute Gemini CLI: ${error.message}`));
            });
        });
    }

    // Override the standard transformer methods to handle direct CLI execution
    async transformRequestIn(request, provider) {
        log("Transforming request for Gemini CLI:", {
            model: request.model,
            messageCount: request.messages?.length,
            hasTools: !!request.tools?.length,
        });

        // Create a temporary file for the conversation
        const conversationFile = path.join(
            this.tempDir,
            `conversation-${Date.now()}-${Math.random().toString(36).substring(2, 15)}.json`,
        );

        // Convert messages to Gemini CLI format
        const conversation = this.convertMessagesToGeminiFormat(request.messages);

        // Write conversation to file
        await fs.writeFile(conversationFile, JSON.stringify(conversation, null, 2));

        // Build Gemini CLI command
        const command = this.buildGeminiCommand(request, conversationFile);

        // Execute the command immediately and return the result
        try {
            const commandResult = await this.executeCommand(command);
            commandResult.conversationFile = conversationFile;
            commandResult.originalRequest = request;

            // Transform and return the response
            return await this.transformResponseOut(commandResult);
        } catch (error) {
            // Clean up on error
            try {
                await fs.unlink(conversationFile);
            } catch (cleanupError) {
                log("Failed to clean up conversation file on error:", cleanupError.message);
            }
            throw error;
        }
    }

    async transformResponseOut(response) {
        // If this is already a Response object, return it
        if (response instanceof Response) {
            return response;
        }

        // Otherwise, handle command result
        return await this.handleCommandResult(response);
    }

    async handleCommandResult(commandResult) {
        const { stdout, stderr, conversationFile, originalRequest } = commandResult;

        // Clean up temporary file
        try {
            await fs.unlink(conversationFile);
        } catch (error) {
            log("Failed to clean up conversation file:", error.message);
        }

        if (stderr) {
            log("Gemini CLI stderr:", stderr);
        }

        if (!stdout) {
            throw new Error("No output from Gemini CLI");
        }

        try {
            // Parse Gemini CLI JSON output
            const geminiResponse = JSON.parse(stdout);

            // Convert to OpenAI-compatible format
            const openAIResponse = this.convertGeminiToOpenAI(geminiResponse, originalRequest);

            return new Response(JSON.stringify(openAIResponse), {
                status: 200,
                statusText: "OK",
                headers: {
                    "Content-Type": "application/json",
                },
            });
        } catch (error) {
            log("Failed to parse Gemini CLI output:", error.message);
            log("Raw output:", stdout);
            throw new Error(`Failed to parse Gemini CLI response: ${error.message}`);
        }
    }
}

module.exports = GeminiCLITransformer;
