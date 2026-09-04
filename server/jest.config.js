export default {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
        "^yjs$": "<rootDir>/node_modules/yjs/dist/yjs.cjs",
    },
    transformIgnorePatterns: ["node_modules/(?!(jose|@panva)/)"],
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                useESM: true,
            },
        ],
        "^.+\\.js$": [
            "ts-jest",
            {
                useESM: true,
            },
        ],
    },
    testRegex: "(/tests/.*|(\\.|/)(test|spec))\\.tsx?$",
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
