export interface OAuthClient {
    clientId: string;
    redirectUris: string[];
    clientName?: string;
    tokenEndpointAuthMethod: "none";
}

export interface PendingAuthorizationRequest {
    id: string;
    clientId: string;
    redirectUri: string;
    state?: string;
    scope: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    createdAt: number;
}

export interface IssuedAuthorizationCode {
    clientId: string;
    redirectUri: string;
    uid: string;
    scope: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    createdAt: number;
}

export interface RefreshTokenRecord {
    tokenHash: string;
    uid: string;
    clientId: string;
    scope: string;
    createdAt: number;
    expiresAt: number;
    revoked: boolean;
}

export interface VerifiedOAuthAccessToken {
    uid: string;
    scope: string;
    clientId: string;
}
