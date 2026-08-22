import { OAUTH_SUPPORTED_SCOPES } from "./config.js";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414), also reused verbatim
 * for the /.well-known/openid-configuration alias. We deliberately keep this
 * to the fields ChatGPT/MCP authorization-code+PKCE clients need to
 * discover; we do not issue OpenID Connect ID tokens in this phase, so no
 * jwks_uri/userinfo_endpoint is advertised.
 */
export function buildAuthorizationServerMetadata(issuer: string) {
    return {
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        registration_endpoint: `${issuer}/oauth/register`,
        revocation_endpoint: `${issuer}/oauth/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: [...OAUTH_SUPPORTED_SCOPES],
        subject_types_supported: ["public"],
    };
}
