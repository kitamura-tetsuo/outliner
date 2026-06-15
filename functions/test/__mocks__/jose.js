/* eslint-disable no-undef */
module.exports = {
  jwtVerify: jest.fn(),
  SignJWT: jest.fn(),
  importX509: jest.fn(),
  importJWK: jest.fn(),
  createRemoteJWKSet: jest.fn(),
  decodeJwt: jest.fn(),
  decodeProtectedHeader: jest.fn(),
};
