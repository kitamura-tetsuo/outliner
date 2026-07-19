export default {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
        "^yjs$": "<rootDir>/node_modules/yjs/dist/yjs.cjs",

        "^jose$": "jose",
        "^jose$": "<rootDir>/node_modules/jose/dist/node/cjs/index.js",
        "^jose/(.*)$": "<rootDir>/node_modules/jose/dist/node/cjs/$1",
    },
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                useESM: true,
            },
        ],
    },
    testRegex: "(/tests/.*|(\\.|/)(test|spec))\\.tsx?$",
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
