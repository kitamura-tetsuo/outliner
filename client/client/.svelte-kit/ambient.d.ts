// this file is generated — do not edit it

/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 *
 * _Unlike_ [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 *
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 *
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 *
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 *
 * You can override `.env` values from the command line like so:
 *
 * ```sh
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module "$env/static/private" {
    export const ANTHROPIC_MODEL: string;
    export const USER: string;
    export const CLAUDE_CODE_ENTRYPOINT: string;
    export const npm_config_user_agent: string;
    export const NODE_VERSION: string;
    export const GIT_EDITOR: string;
    export const HOSTNAME: string;
    export const YARN_VERSION: string;
    export const npm_node_execpath: string;
    export const SHLVL: string;
    export const npm_config_noproxy: string;
    export const HOME: string;
    export const CLAUDE_CODE_MAX_OUTPUT_TOKENS: string;
    export const OLDPWD: string;
    export const npm_package_json: string;
    export const NVM_SYMLINK_CURRENT: string;
    export const ANTHROPIC_DEFAULT_SONNET_MODEL: string;
    export const LC_CTYPE: string;
    export const npm_config_userconfig: string;
    export const npm_config_local_prefix: string;
    export const ANTHROPIC_SMALL_FAST_MODEL: string;
    export const COLOR: string;
    export const NVM_DIR: string;
    export const API_TIMEOUT_MS: string;
    export const LOGNAME: string;
    export const _: string;
    export const npm_config_prefix: string;
    export const npm_config_npm_version: string;
    export const PROMPT_DIRTRIM: string;
    export const TERM: string;
    export const ANTHROPIC_BASE_URL: string;
    export const OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
    export const npm_config_cache: string;
    export const ANTHROPIC_DEFAULT_OPUS_MODEL: string;
    export const npm_config_node_gyp: string;
    export const PATH: string;
    export const NODE: string;
    export const npm_package_name: string;
    export const COREPACK_ENABLE_AUTO_PIN: string;
    export const NoDefaultCurrentDirectoryInExePath: string;
    export const ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
    export const LS_COLORS: string;
    export const npm_lifecycle_script: string;
    export const ANTHROPIC_AUTH_TOKEN: string;
    export const SHELL: string;
    export const npm_package_version: string;
    export const npm_lifecycle_event: string;
    export const CLAUDECODE: string;
    export const npm_config_globalconfig: string;
    export const npm_config_init_module: string;
    export const PWD: string;
    export const GIT_MERGE_AUTOEDIT: string;
    export const npm_execpath: string;
    export const NVM_CD_FLAGS: string;
    export const npm_config_global_prefix: string;
    export const CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: string;
    export const npm_command: string;
    export const TZ: string;
    export const NVM_RC_VERSION: string;
    export const INIT_CWD: string;
    export const EDITOR: string;
    export const TEST: string;
    export const VITEST: string;
    export const NODE_ENV: string;
    export const PROD: string;
    export const DEV: string;
    export const BASE_URL: string;
    export const MODE: string;
}

/**
 * Similar to [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 *
 * Values are replaced statically at build time.
 *
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module "$env/static/public" {
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 *
 * This module cannot be imported into client-side code.
 *
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 *
 * > [!NOTE] In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module "$env/dynamic/private" {
    export const env: {
        ANTHROPIC_MODEL: string;
        USER: string;
        CLAUDE_CODE_ENTRYPOINT: string;
        npm_config_user_agent: string;
        NODE_VERSION: string;
        GIT_EDITOR: string;
        HOSTNAME: string;
        YARN_VERSION: string;
        npm_node_execpath: string;
        SHLVL: string;
        npm_config_noproxy: string;
        HOME: string;
        CLAUDE_CODE_MAX_OUTPUT_TOKENS: string;
        OLDPWD: string;
        npm_package_json: string;
        NVM_SYMLINK_CURRENT: string;
        ANTHROPIC_DEFAULT_SONNET_MODEL: string;
        LC_CTYPE: string;
        npm_config_userconfig: string;
        npm_config_local_prefix: string;
        ANTHROPIC_SMALL_FAST_MODEL: string;
        COLOR: string;
        NVM_DIR: string;
        API_TIMEOUT_MS: string;
        LOGNAME: string;
        _: string;
        npm_config_prefix: string;
        npm_config_npm_version: string;
        PROMPT_DIRTRIM: string;
        TERM: string;
        ANTHROPIC_BASE_URL: string;
        OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
        npm_config_cache: string;
        ANTHROPIC_DEFAULT_OPUS_MODEL: string;
        npm_config_node_gyp: string;
        PATH: string;
        NODE: string;
        npm_package_name: string;
        COREPACK_ENABLE_AUTO_PIN: string;
        NoDefaultCurrentDirectoryInExePath: string;
        ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
        LS_COLORS: string;
        npm_lifecycle_script: string;
        ANTHROPIC_AUTH_TOKEN: string;
        SHELL: string;
        npm_package_version: string;
        npm_lifecycle_event: string;
        CLAUDECODE: string;
        npm_config_globalconfig: string;
        npm_config_init_module: string;
        PWD: string;
        GIT_MERGE_AUTOEDIT: string;
        npm_execpath: string;
        NVM_CD_FLAGS: string;
        npm_config_global_prefix: string;
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: string;
        npm_command: string;
        TZ: string;
        NVM_RC_VERSION: string;
        INIT_CWD: string;
        EDITOR: string;
        TEST: string;
        VITEST: string;
        NODE_ENV: string;
        PROD: string;
        DEV: string;
        BASE_URL: string;
        MODE: string;
        [key: `PUBLIC_${string}`]: undefined;
        [key: `${string}`]: string | undefined;
    };
}

/**
 * Similar to [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 *
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 *
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module "$env/dynamic/public" {
    export const env: {
        [key: `PUBLIC_${string}`]: string | undefined;
    };
}
